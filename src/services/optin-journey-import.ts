/**
 * Imports opt-in rows from a parsed CSV sheet into GHL + journey_events.
 *
 * Performance design:
 *   - Meta adsets + ads are pre-loaded ONCE before the loop (no DB per row).
 *   - Rows are processed in a concurrency pool (IMPORT_CONCURRENCY = 6) so
 *     GHL API calls for different contacts happen in parallel, cutting total
 *     wall-clock time by ~5–6×.
 *   - GHL's rate limit is ~100 req/s per integration token; 6 concurrent rows
 *     × 3 GHL calls each = ≤18 in-flight requests — well within limits.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/database.types";
import { getTagsForLine } from "@/config/traffic";
import { parseKualaLumpurSheetDateTime } from "@/lib/kl-datetime";
import type { ParsedLeadSheetRow } from "@/lib/parse-csv";
import {
  extractDuplicateContactIdFromGhlCreateError,
  ghlCreateContact,
  ghlGetContactDetail,
  ghlMergeContactTags,
  ghlSearchContactByEmail,
} from "@/services/ghl-contacts-http";
import type { GhlWebhookCredentials } from "@/services/ghl-connection-resolve";
import { mirrorGhlContactFromApiDetail } from "@/services/ghl-contact-mirror-upsert";
import {
  preloadMetaEntitiesForProject,
  resolveMetaAttributionInMemory,
  type PreloadedMetaEntities,
} from "@/services/optin-meta-attribution";

/** Max concurrent rows processed simultaneously. */
const IMPORT_CONCURRENCY = 6;

export type OptinImportResult = {
  imported: number;
  skippedDuplicates: number;
  attributionUpdated: number;
  skippedInvalid: number;
  errors: Array<{ rowNumber: number; message: string }>;
};

/** Emitted during import so UIs can show row position, email, and current step. */
export type OptinImportProgress = {
  total: number;
  /** 1-based index among data rows being processed. */
  current: number;
  /** Spreadsheet row number (header = row 1). */
  sheetRowNumber: number;
  email: string;
  message: string;
};

function splitFullName(full: string): { firstName: string; lastName: string } {
  const t = full.trim();
  if (t === "") {
    return { firstName: "Unknown", lastName: "." };
  }
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "." };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function buildImportRowHash(parts: {
  email: string;
  occurredAtIso: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  agencyLine: string;
}): string {
  const canonical = JSON.stringify({
    email: parts.email.trim().toLowerCase(),
    occurredAt: parts.occurredAtIso,
    utmSource: parts.utmSource.trim(),
    utmMedium: parts.utmMedium.trim(),
    utmCampaign: parts.utmCampaign.trim(),
    utmContent: parts.utmContent.trim(),
    agencyLine: parts.agencyLine.trim(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function findDuplicateRow(
  supabase: SupabaseClient<Database>,
  projectId: string,
  importRowHash: string
): Promise<{ rowId: string; metaAdsetId: string | null } | null> {
  const { data, error } = await supabase
    .from("journey_events")
    .select("id, meta_adset_id")
    .eq("project_id", projectId)
    .eq("event_type", "optin")
    .contains("payload", { import_row_hash: importRowHash })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`Duplicate check failed: ${error.message}`);
  }
  if (data === null) return null;
  return { rowId: data.id, metaAdsetId: data.meta_adset_id };
}

// ---------------------------------------------------------------------------
// Per-row processing (called in parallel by the concurrency pool)
// ---------------------------------------------------------------------------

type RowOutcome =
  | { status: "imported" }
  | { status: "skipped_duplicate" }
  | { status: "attribution_updated" }
  | { status: "skipped_invalid"; message: string }
  | { status: "error"; message: string };

/**
 * When a duplicate row is detected but has no Meta attribution yet, resolves
 * and writes the attribution. Returns `"attribution_updated"` on success,
 * `"skipped_duplicate"` when attribution is already set or no match is found,
 * or `"error"` if the DB update fails.
 */
async function patchAttributionForDuplicate(
  supabase: SupabaseClient<Database>,
  rowId: string,
  metaEntities: PreloadedMetaEntities,
  row: ParsedLeadSheetRow
): Promise<RowOutcome> {
  const metaAttribution = resolveMetaAttributionInMemory(metaEntities, {
    utmSource: row.utmSource,
    utmContent: row.utmContent,
    utmCampaign: row.utmCampaign,
  });

  if (metaAttribution.meta_adset_id === null) {
    return { status: "skipped_duplicate" };
  }

  const { error: updErr } = await supabase
    .from("journey_events")
    .update({
      meta_adset_id: metaAttribution.meta_adset_id,
      meta_campaign_id: metaAttribution.meta_campaign_id,
      meta_ad_id: metaAttribution.meta_ad_id,
      meta_attribution_method: metaAttribution.method,
    })
    .eq("id", rowId);

  if (updErr !== null) {
    return { status: "error", message: updErr.message };
  }
  return { status: "attribution_updated" };
}

async function processOneRow(args: {
  supabase: SupabaseClient<Database>;
  row: ParsedLeadSheetRow;
  projectId: string;
  locationId: string;
  agencyLine: string;
  tagsForAgency: string[];
  creds: GhlWebhookCredentials;
  metaEntities: PreloadedMetaEntities;
}): Promise<RowOutcome> {
  const {
    supabase,
    row,
    projectId,
    locationId,
    agencyLine,
    tagsForAgency,
    creds,
    metaEntities,
  } = args;

  const emailNorm = row.email.trim().toLowerCase();

  const occurredAt = parseKualaLumpurSheetDateTime(row.dateTimeRaw);
  if (occurredAt === null) {
    return {
      status: "skipped_invalid",
      message: `Invalid date/time: "${row.dateTimeRaw}" (expected D/M/YYYY H:mm in KL time)`,
    };
  }

  const importRowHash = buildImportRowHash({
    email: emailNorm,
    occurredAtIso: occurredAt,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    utmContent: row.utmContent,
    agencyLine,
  });

  const duplicate = await findDuplicateRow(supabase, projectId, importRowHash);

  if (duplicate !== null) {
    // Row already exists. If it has no Meta attribution yet, resolve and patch
    // it now — handles re-imports after new adsets are synced or the matching
    // logic is improved.
    if (duplicate.metaAdsetId === null) {
      return patchAttributionForDuplicate(supabase, duplicate.rowId, metaEntities, row);
    }
    return { status: "skipped_duplicate" };
  }

  const { firstName, lastName } = splitFullName(row.fullName);

  let contactId = await ghlSearchContactByEmail(creds, emailNorm);

  if (contactId === null) {
    try {
      contactId = await ghlCreateContact(creds, {
        email: emailNorm,
        firstName,
        lastName,
        phone: row.phone,
        tags: [...tagsForAgency],
      });
    } catch (createErr) {
      const recovered =
        extractDuplicateContactIdFromGhlCreateError(createErr);
      if (recovered === null) {
        throw createErr;
      }
      contactId = recovered;
      await ghlMergeContactTags(creds, contactId, tagsForAgency);
    }
  } else {
    await ghlMergeContactTags(creds, contactId, tagsForAgency);
  }

  const detail = await ghlGetContactDetail(creds, contactId);
  await mirrorGhlContactFromApiDetail(supabase, detail, locationId);

  const metaAttribution = resolveMetaAttributionInMemory(metaEntities, {
    utmSource: row.utmSource,
    utmContent: row.utmContent,
    utmCampaign: row.utmCampaign,
  });

  const payload: Json = {
    utm_source: row.utmSource.trim() || null,
    utm_medium: row.utmMedium.trim() || null,
    utm_campaign: row.utmCampaign.trim() || null,
    utm_content: row.utmContent.trim() || null,
    import_source: "google_sheet_csv",
    agency_line: agencyLine,
    import_row_hash: importRowHash,
    sheet_full_name: row.fullName.trim(),
    sheet_phone: row.phone.trim(),
  };

  const { error: insErr } = await supabase.from("journey_events").insert({
    occurred_at: occurredAt,
    event_type: "optin",
    source_system: "manual",
    contact_id: contactId,
    location_id: locationId,
    project_id: projectId,
    webinar_run_id: null,
    duration_seconds: null,
    payload,
    meta_adset_id: metaAttribution.meta_adset_id,
    meta_campaign_id: metaAttribution.meta_campaign_id,
    meta_ad_id: metaAttribution.meta_ad_id,
    meta_attribution_method: metaAttribution.method,
  });

  if (insErr !== null) {
    return { status: "error", message: insErr.message };
  }

  return { status: "imported" };
}

// ---------------------------------------------------------------------------
// Concurrency pool helper
// ---------------------------------------------------------------------------

/**
 * Runs `tasks` with at most `concurrency` running at any instant.
 * Results are returned in the same order as input tasks.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length) as T[];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  }

  const poolSize = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: poolSize }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Imports parsed sheet rows: GHL find/create + agency tags + mirror sync +
 * journey_events optin row. Also resolves Meta adset/ad IDs from UTMs.
 *
 * Rows are processed in parallel (IMPORT_CONCURRENCY = 6) to reduce
 * wall-clock time from ~O(n × GHL latency) to ~O(n/6 × GHL latency).
 */
export async function importOptinRowsFromSheet(args: {
  supabase: SupabaseClient<Database>;
  projectId: string;
  locationId: string;
  agencyLine: string;
  agencyLineTags: Record<string, string[]>;
  creds: GhlWebhookCredentials;
  rows: ParsedLeadSheetRow[];
  /** 1-based Excel row numbers for error reporting (header = row 1). */
  rowNumberOffset: number;
  onProgress?: (p: OptinImportProgress) => void;
}): Promise<OptinImportResult> {
  const tagsForAgency = getTagsForLine(args.agencyLine, args.agencyLineTags);
  if (tagsForAgency === undefined || tagsForAgency.length === 0) {
    throw new Error(
      `No GHL tags configured for agency line "${args.agencyLine}" in project traffic_agency_line_tags`
    );
  }

  const totalRows = args.rows.length;

  args.onProgress?.({
    total: totalRows,
    current: 0,
    sheetRowNumber: 0,
    email: "",
    message: `Loading Meta ad data…`,
  });

  // Pre-load all Meta adsets + ads ONCE — zero DB per row for attribution.
  const metaEntities = await preloadMetaEntitiesForProject(
    args.supabase,
    args.projectId
  );

  args.onProgress?.({
    total: totalRows,
    current: 0,
    sheetRowNumber: 0,
    email: "",
    message: `Starting import — ${totalRows} row(s) with concurrency ${IMPORT_CONCURRENCY}`,
  });

  // Build a task per row, then run them through the concurrency pool.
  const tasks = args.rows.map((row, i) => async (): Promise<RowOutcome> => {
    const rowNumber = args.rowNumberOffset + i + 2;
    const emailNorm = row.email.trim().toLowerCase();

    args.onProgress?.({
      total: totalRows,
      current: i + 1,
      sheetRowNumber: rowNumber,
      email: emailNorm,
      message: `Processing…`,
    });

    try {
      const outcome = await processOneRow({
        supabase: args.supabase,
        row,
        projectId: args.projectId,
        locationId: args.locationId,
        agencyLine: args.agencyLine,
        tagsForAgency,
        creds: args.creds,
        metaEntities,
      });

      const statusLabel: Record<RowOutcome["status"], string> = {
        imported: "Done — imported",
        skipped_duplicate: "Skipped — duplicate",
        attribution_updated: "Updated — added Meta attribution",
        skipped_invalid: `Skipped — ${outcome.status === "skipped_invalid" ? outcome.message : ""}`,
        error: `Failed — ${outcome.status === "error" ? outcome.message : ""}`,
      };

      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: statusLabel[outcome.status],
      });

      return outcome;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `Failed — ${msg}`,
      });
      return { status: "error", message: msg };
    }
  });

  const outcomes = await runWithConcurrency(tasks, IMPORT_CONCURRENCY);

  const result: OptinImportResult = {
    imported: 0,
    skippedDuplicates: 0,
    attributionUpdated: 0,
    skippedInvalid: 0,
    errors: [],
  };

  for (let i = 0; i < outcomes.length; i += 1) {
    const outcome = outcomes[i];
    const rowNumber = args.rowNumberOffset + i + 2;

    if (outcome.status === "imported") {
      result.imported += 1;
    } else if (outcome.status === "skipped_duplicate") {
      result.skippedDuplicates += 1;
    } else if (outcome.status === "attribution_updated") {
      result.attributionUpdated += 1;
    } else if (outcome.status === "skipped_invalid") {
      result.skippedInvalid += 1;
      result.errors.push({ rowNumber, message: outcome.message });
    } else {
      result.errors.push({ rowNumber, message: outcome.message });
    }
  }

  args.onProgress?.({
    total: totalRows,
    current: totalRows,
    sheetRowNumber: 0,
    email: "",
    message: `Finished — ${result.imported} imported, ${result.attributionUpdated} attribution updated, ${result.skippedDuplicates} duplicate skips, ${result.skippedInvalid} invalid`,
  });

  return result;
}
