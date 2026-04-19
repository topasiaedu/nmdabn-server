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

export type OptinImportResult = {
  imported: number;
  skippedDuplicates: number;
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

async function journeyDuplicateExists(
  supabase: SupabaseClient<Database>,
  projectId: string,
  importRowHash: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("journey_events")
    .select("id")
    .eq("project_id", projectId)
    .eq("event_type", "optin")
    .contains("payload", { import_row_hash: importRowHash })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`Duplicate check failed: ${error.message}`);
  }
  return data !== null;
}

/**
 * Imports parsed sheet rows: GHL find/create + agency tags + mirror sync + journey_events optin row.
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
  /** Called when the status line for the current row changes (GHL + sync can take several seconds). */
  onProgress?: (p: OptinImportProgress) => void;
}): Promise<OptinImportResult> {
  const tagsForAgency = getTagsForLine(args.agencyLine, args.agencyLineTags);
  if (tagsForAgency === undefined || tagsForAgency.length === 0) {
    throw new Error(
      `No GHL tags configured for agency line "${args.agencyLine}" in project traffic_agency_line_tags`
    );
  }

  const result: OptinImportResult = {
    imported: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    errors: [],
  };

  const totalRows = args.rows.length;
  args.onProgress?.({
    total: totalRows,
    current: 0,
    sheetRowNumber: 0,
    email: "",
    message: `Starting import — ${totalRows} data row(s)`,
  });

  for (let i = 0; i < args.rows.length; i += 1) {
    const row = args.rows[i];
    const rowNumber = args.rowNumberOffset + i + 2;
    const emailNorm = row.email.trim().toLowerCase();

    args.onProgress?.({
      total: totalRows,
      current: i + 1,
      sheetRowNumber: rowNumber,
      email: emailNorm,
      message: `Row ${i + 1}/${totalRows} (sheet #${rowNumber}) — validating…`,
    });

    const occurredAt = parseKualaLumpurSheetDateTime(row.dateTimeRaw);
    if (occurredAt === null) {
      result.skippedInvalid += 1;
      result.errors.push({
        rowNumber,
        message: `Invalid date/time: "${row.dateTimeRaw}" (expected D/M/YYYY H:mm in KL time)`,
      });
      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `Skipped — invalid date/time`,
      });
      continue;
    }

    const importRowHash = buildImportRowHash({
      email: emailNorm,
      occurredAtIso: occurredAt,
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      utmContent: row.utmContent,
      agencyLine: args.agencyLine,
    });

    const dup = await journeyDuplicateExists(
      args.supabase,
      args.projectId,
      importRowHash
    );
    if (dup) {
      result.skippedDuplicates += 1;
      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `Skipped — identical journey row already exists`,
      });
      continue;
    }

    try {
      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `GoHighLevel — looking up or creating contact…`,
      });

      let contactId = await ghlSearchContactByEmail(args.creds, emailNorm);
      const { firstName, lastName } = splitFullName(row.fullName);

      if (contactId === null) {
        try {
          contactId = await ghlCreateContact(args.creds, {
            email: emailNorm,
            firstName,
            lastName,
            phone: row.phone,
            tags: [...tagsForAgency],
          });
        } catch (createErr) {
          /**
           * Search-by-email can miss a contact that GHL still treats as duplicate
           * by phone. GHL returns 400 with `meta.contactId` — use that id and
           * merge tags (create never applied them).
           */
          const recovered =
            extractDuplicateContactIdFromGhlCreateError(createErr);
          if (recovered === null) {
            throw createErr;
          }
          contactId = recovered;
          await ghlMergeContactTags(args.creds, contactId, tagsForAgency);
        }
      } else {
        await ghlMergeContactTags(args.creds, contactId, tagsForAgency);
      }

      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `Syncing contact mirror (in-process, one GHL fetch)…`,
      });

      const detail = await ghlGetContactDetail(args.creds, contactId);
      await mirrorGhlContactFromApiDetail(
        args.supabase,
        detail,
        args.locationId
      );

      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `Saving journey opt-in event…`,
      });

      const payload: Json = {
        utm_source: row.utmSource.trim() === "" ? null : row.utmSource.trim(),
        utm_medium: row.utmMedium.trim() === "" ? null : row.utmMedium.trim(),
        utm_campaign:
          row.utmCampaign.trim() === "" ? null : row.utmCampaign.trim(),
        utm_content:
          row.utmContent.trim() === "" ? null : row.utmContent.trim(),
        import_source: "google_sheet_csv",
        agency_line: args.agencyLine,
        import_row_hash: importRowHash,
        sheet_full_name: row.fullName.trim(),
        sheet_phone: row.phone.trim(),
      };

      const { error: insErr } = await args.supabase.from("journey_events").insert({
        occurred_at: occurredAt,
        event_type: "optin",
        source_system: "manual",
        contact_id: contactId,
        location_id: args.locationId,
        project_id: args.projectId,
        webinar_run_id: null,
        duration_seconds: null,
        payload,
      });

      if (insErr !== null) {
        result.errors.push({
          rowNumber,
          message: insErr.message,
        });
        args.onProgress?.({
          total: totalRows,
          current: i + 1,
          sheetRowNumber: rowNumber,
          email: emailNorm,
          message: `Failed — ${insErr.message}`,
        });
        continue;
      }

      result.imported += 1;
      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `Done — imported`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      result.errors.push({ rowNumber, message: msg });
      args.onProgress?.({
        total: totalRows,
        current: i + 1,
        sheetRowNumber: rowNumber,
        email: emailNorm,
        message: `Failed — ${msg}`,
      });
    }
  }

  args.onProgress?.({
    total: totalRows,
    current: totalRows,
    sheetRowNumber: 0,
    email: "",
    message: `Finished — ${result.imported} imported, ${result.skippedDuplicates} duplicate skips, ${result.skippedInvalid} invalid`,
  });

  return result;
}
