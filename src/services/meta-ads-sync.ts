import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/database.types";
import { getMetaAccessToken } from "@/services/meta-oauth-token";

const GRAPH_API_VERSION = "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_PAGE_LIMIT = "500";
const UPSERT_CHUNK = 200;

/** Rolling daily insights window (calendar days inclusive of bounds). */
const INSIGHT_LOOKBACK_DAYS = 90;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function metaGraphErrorMessage(bodyText: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!isRecord(parsed)) {
      return `Meta Graph HTTP ${String(status)}`;
    }
    const err = parsed["error"];
    if (isRecord(err)) {
      const msg = err["message"];
      if (typeof msg === "string" && msg.trim() !== "") {
        return msg.trim();
      }
    }
  } catch {
    // fallback below
  }
  const trimmed = bodyText.trim();
  return trimmed !== "" ? trimmed : `Meta Graph HTTP ${String(status)}`;
}

function formatUtcDateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function metaGraphJson(
  accessToken: string,
  url: string
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(metaGraphErrorMessage(text, res.status));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Meta Graph response is not JSON (HTTP ${String(res.status)})`);
  }
  if (!isRecord(parsed)) {
    throw new Error("Meta Graph JSON root is not an object");
  }
  const err = parsed["error"];
  if (isRecord(err)) {
    const msg = err["message"];
    if (typeof msg === "string" && msg.trim() !== "") {
      throw new Error(msg.trim());
    }
  }
  return parsed;
}

/**
 * Pages through Graph `data` arrays using `paging.next` URLs until exhausted.
 */
async function fetchAllGraphDataPages(
  accessToken: string,
  firstUrl: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let nextUrl: string | undefined = firstUrl;
  while (nextUrl !== undefined && nextUrl !== "") {
    const body = await metaGraphJson(accessToken, nextUrl);
    const data = body["data"];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (isRecord(item)) {
          rows.push(item);
        }
      }
    }
    const paging = body["paging"];
    const next =
      isRecord(paging) && typeof paging["next"] === "string"
        ? paging["next"]
        : undefined;
    nextUrl = next !== undefined && next.trim() !== "" ? next : undefined;
  }
  return rows;
}

async function fetchMetaCampaigns(
  accessToken: string,
  adAccountGraphId: string
): Promise<Record<string, unknown>[]> {
  const accountPath = encodeURIComponent(adAccountGraphId);
  const fields = [
    "id",
    "name",
    "status",
    "objective",
    "created_time",
    "updated_time",
  ].join(",");
  const qs = new URLSearchParams({
    fields,
    limit: GRAPH_PAGE_LIMIT,
  });
  const firstUrl = `${META_GRAPH_BASE}/${accountPath}/campaigns?${qs.toString()}`;
  return fetchAllGraphDataPages(accessToken, firstUrl);
}

async function fetchMetaInsights(
  accessToken: string,
  adAccountGraphId: string,
  sinceDate: string,
  untilDate: string
): Promise<Record<string, unknown>[]> {
  const accountPath = encodeURIComponent(adAccountGraphId);
  const insightFields = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "spend",
    "impressions",
    "clicks",
    "reach",
    "date_start",
    "date_stop",
    "account_currency",
  ].join(",");
  const timeRange = JSON.stringify({
    since: sinceDate,
    until: untilDate,
  });
  const qs = new URLSearchParams({
    fields: insightFields,
    time_range: timeRange,
    time_increment: "1",
    level: "campaign",
    limit: GRAPH_PAGE_LIMIT,
  });
  const firstUrl = `${META_GRAPH_BASE}/${accountPath}/insights?${qs.toString()}`;
  return fetchAllGraphDataPages(accessToken, firstUrl);
}

function parseBigIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.trunc(v);
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v.trim());
    if (Number.isFinite(n)) {
      return Math.trunc(n);
    }
  }
  return null;
}

function parseMoney(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v.trim());
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

async function upsertMetaCampaigns(
  supabase: SupabaseClient<Database>,
  integrationAccountId: string,
  campaigns: Record<string, unknown>[]
): Promise<number> {
  const nowIso = new Date().toISOString();
  let total = 0;
  for (let i = 0; i < campaigns.length; i += UPSERT_CHUNK) {
    const chunk = campaigns.slice(i, i + UPSERT_CHUNK);
    const rows = chunk.map((c) => {
      const idRaw = c["id"];
      const id =
        typeof idRaw === "string" && idRaw.trim() !== ""
          ? idRaw.trim()
          : "";
      return {
        id,
        integration_account_id: integrationAccountId,
        name:
          typeof c["name"] === "string"
            ? c["name"]
            : null,
        status:
          typeof c["status"] === "string"
            ? c["status"]
            : null,
        objective:
          typeof c["objective"] === "string"
            ? c["objective"]
            : null,
        raw_json: c as Json,
        synced_at: nowIso,
      };
    }).filter((r) => r.id !== "");

    if (rows.length === 0) {
      continue;
    }

    const { error } = await supabase
      .from("meta_campaigns")
      .upsert(rows, { onConflict: "id" });

    if (error !== null) {
      throw new Error(`meta_campaigns upsert failed: ${error.message}`);
    }
    total += rows.length;
  }
  return total;
}

async function upsertMetaInsights(
  supabase: SupabaseClient<Database>,
  integrationAccountId: string,
  insights: Record<string, unknown>[]
): Promise<number> {
  const nowIso = new Date().toISOString();
  let total = 0;
  for (let i = 0; i < insights.length; i += UPSERT_CHUNK) {
    const chunk = insights.slice(i, i + UPSERT_CHUNK);
    const rows = chunk.map((row) => {
      const cid = row["campaign_id"];
      const campaignId =
        typeof cid === "string" && cid.trim() !== ""
          ? cid.trim()
          : "";
      const ds = row["date_start"];
      const dateStart =
        typeof ds === "string" && ds.trim() !== ""
          ? ds.trim().slice(0, 10)
          : "";
      const dst = row["date_stop"];
      const dateStop =
        typeof dst === "string" && dst.trim() !== ""
          ? dst.trim().slice(0, 10)
          : dateStart;
      const cname = row["campaign_name"];
      const adset = row["adset_id"];
      const curr = row["account_currency"];
      const currency =
        typeof curr === "string" && curr.trim() !== ""
          ? curr.trim()
          : null;

      return {
        integration_account_id: integrationAccountId,
        campaign_id: campaignId,
        campaign_name:
          typeof cname === "string"
            ? cname
            : null,
        adset_id:
          typeof adset === "string"
            ? adset
            : null,
        date_start: dateStart,
        date_stop: dateStop,
        spend: parseMoney(row["spend"]),
        impressions: parseBigIntOrNull(row["impressions"]),
        clicks: parseBigIntOrNull(row["clicks"]),
        reach: parseBigIntOrNull(row["reach"]),
        currency,
        raw_json: row as Json,
        synced_at: nowIso,
      };
    }).filter((r) => r.campaign_id !== "" && r.date_start !== "");

    if (rows.length === 0) {
      continue;
    }

    const { error } = await supabase
      .from("meta_insights")
      .upsert(rows, {
        onConflict: "integration_account_id,campaign_id,date_start",
      });

    if (error !== null) {
      throw new Error(`meta_insights upsert failed: ${error.message}`);
    }
    total += rows.length;
  }
  return total;
}

async function callRecomputeAttribution(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "recompute_meta_spend_attribution",
    { p_project_id: projectId }
  );
  if (error !== null) {
    throw new Error(`recompute_meta_spend_attribution failed: ${error.message}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

export interface SyncMetaAdsResult {
  /** Number of project_meta_ad_accounts processed. */
  accountsProcessed: number;
  /** Total meta_campaigns upserted across all accounts. */
  campaignsUpserted: number;
  /** Total meta_insights rows upserted across all accounts. */
  insightRowsUpserted: number;
  /** Number of webinar runs that had spend attributed after recompute. */
  runsAttributed: number;
  /** Per-agency-line summaries. */
  lines: Array<{
    agencyLine: string;
    integrationAccountId: string;
    campaignsUpserted: number;
    insightRowsUpserted: number;
    /** Present when this line's sync errored. */
    error?: string;
  }>;
}

/**
 * Syncs Meta campaigns + daily insights for every linked ad account on the project,
 * then recomputes run-level spend attribution.
 */
export async function syncMetaAdsForProject(
  projectId: string,
  supabaseClient: SupabaseClient<Database>
): Promise<SyncMetaAdsResult> {
  const { data: mappings, error: mapErr } = await supabaseClient
    .from("project_meta_ad_accounts")
    .select("id, agency_line, integration_account_id")
    .eq("project_id", projectId);

  if (mapErr !== null) {
    throw new Error(
      `Failed to load project_meta_ad_accounts: ${mapErr.message}`
    );
  }

  const list = mappings ?? [];
  let campaignsUpserted = 0;
  let insightRowsUpserted = 0;
  const lines: SyncMetaAdsResult["lines"] = [];

  const until = new Date();
  const since = new Date(
    until.getTime() - INSIGHT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
  const sinceStr = formatUtcDateIso(since);
  const untilStr = formatUtcDateIso(until);

  for (const m of list) {
    const agencyLine =
      typeof m.agency_line === "string" ? m.agency_line : "";
    const integrationAccountId = m.integration_account_id;
    if (agencyLine === "" || integrationAccountId === "") {
      continue;
    }

    try {
      const token = await getMetaAccessToken(
        integrationAccountId,
        supabaseClient
      );

      const { data: acct, error: acctErr } = await supabaseClient
        .from("integration_accounts")
        .select("account_id")
        .eq("id", integrationAccountId)
        .maybeSingle();

      if (acctErr !== null) {
        throw new Error(
          `Failed to load integration account: ${acctErr.message}`
        );
      }

      const actIdRaw = acct?.account_id;
      const adAccountGraphId =
        typeof actIdRaw === "string" && actIdRaw.trim() !== ""
          ? actIdRaw.trim()
          : "";
      if (adAccountGraphId === "") {
        throw new Error("integration_accounts.account_id is empty for Meta");
      }

      const campaigns = await fetchMetaCampaigns(token, adAccountGraphId);
      const cCount = await upsertMetaCampaigns(
        supabaseClient,
        integrationAccountId,
        campaigns
      );
      campaignsUpserted += cCount;

      const insights = await fetchMetaInsights(
        token,
        adAccountGraphId,
        sinceStr,
        untilStr
      );
      const iCount = await upsertMetaInsights(
        supabaseClient,
        integrationAccountId,
        insights
      );
      insightRowsUpserted += iCount;

      lines.push({
        agencyLine: agencyLine,
        integrationAccountId,
        campaignsUpserted: cCount,
        insightRowsUpserted: iCount,
      });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Unknown error during Meta sync";
      lines.push({
        agencyLine,
        integrationAccountId,
        campaignsUpserted: 0,
        insightRowsUpserted: 0,
        error: msg,
      });
    }
  }

  const runsAttributed = await callRecomputeAttribution(
    supabaseClient,
    projectId
  );

  return {
    accountsProcessed: list.length,
    campaignsUpserted,
    insightRowsUpserted,
    runsAttributed,
    lines,
  };
}
