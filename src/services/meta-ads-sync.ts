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
  return trimmed === "" ? `Meta Graph HTTP ${String(status)}` : trimmed;
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

/** Extracts the next page URL from a Graph API paging object, or undefined. */
function extractNextPageUrl(
  paging: unknown
): string | undefined {
  if (!isRecord(paging)) return undefined;
  const next = paging["next"];
  if (typeof next !== "string" || next.trim() === "") return undefined;
  return next;
}

/**
 * Finds the first matching `value` (count string) from a Meta Graph API
 * `actions` or `action_values` array for the given priority list of action
 * types.  Returns null when none of the types are present.
 */
function pickFirstActionValue(
  actions: unknown,
  priority: string[]
): number | null {
  if (!Array.isArray(actions)) return null;
  for (const actionType of priority) {
    for (const action of actions) {
      if (isRecord(action) && action["action_type"] === actionType) {
        const val = parseBigIntOrNull(action["value"]);
        if (val !== null) return val;
      }
    }
  }
  return null;
}

/**
 * Finds the first matching monetary `value` from a Meta Graph API
 * `action_values` array for the given priority list.  Returns null when absent.
 */
function pickFirstActionMoneyValue(
  actionValues: unknown,
  priority: string[]
): number | null {
  if (!Array.isArray(actionValues)) return null;
  for (const actionType of priority) {
    for (const av of actionValues) {
      if (isRecord(av) && av["action_type"] === actionType) {
        const val = parseMoney(av["value"]);
        if (val !== null) return val;
      }
    }
  }
  return null;
}

/** Priority lists for each event type — avoids double-counting. */
const ACTION_PRIORITY_LEADS = [
  "omni_lead",
  "lead",
  "offsite_conversion.fb_pixel_lead",
];
const ACTION_PRIORITY_PURCHASES = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

interface ParsedActions {
  leads: number | null;
  purchases: number | null;
  purchase_value: number | null;
  landing_page_views: number | null;
}

/**
 * Extracts tracked pixel event counts and purchase revenue from the Meta Graph
 * API `actions` and `action_values` arrays on an insight row.
 *
 * Falls back to null for any individual event type that is not present so
 * callers can distinguish "zero conversions reported" from "data not available".
 */
function parseActionsFromMeta(
  actions: unknown,
  actionValues: unknown
): ParsedActions {
  return {
    leads: pickFirstActionValue(actions, ACTION_PRIORITY_LEADS),
    purchases: pickFirstActionValue(actions, ACTION_PRIORITY_PURCHASES),
    purchase_value: pickFirstActionMoneyValue(actionValues, ACTION_PRIORITY_PURCHASES),
    landing_page_views: pickFirstActionValue(actions, ["landing_page_view"]),
  };
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
    nextUrl = extractNextPageUrl(body["paging"]);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Fetch helpers — one per Meta entity type
// ---------------------------------------------------------------------------

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

async function fetchMetaAdsets(
  accessToken: string,
  adAccountGraphId: string
): Promise<Record<string, unknown>[]> {
  const accountPath = encodeURIComponent(adAccountGraphId);
  const fields = [
    "id",
    "name",
    "campaign_id",
    "status",
    "optimization_goal",
    "billing_event",
    "daily_budget",
    "lifetime_budget",
  ].join(",");
  const qs = new URLSearchParams({
    fields,
    limit: GRAPH_PAGE_LIMIT,
  });
  const firstUrl = `${META_GRAPH_BASE}/${accountPath}/adsets?${qs.toString()}`;
  return fetchAllGraphDataPages(accessToken, firstUrl);
}

async function fetchMetaAds(
  accessToken: string,
  adAccountGraphId: string
): Promise<Record<string, unknown>[]> {
  const accountPath = encodeURIComponent(adAccountGraphId);
  const fields = [
    "id",
    "name",
    "adset_id",
    "campaign_id",
    "status",
  ].join(",");
  const qs = new URLSearchParams({
    fields,
    limit: GRAPH_PAGE_LIMIT,
  });
  const firstUrl = `${META_GRAPH_BASE}/${accountPath}/ads?${qs.toString()}`;
  return fetchAllGraphDataPages(accessToken, firstUrl);
}

/**
 * Returns true when a Meta Graph error message indicates a permissions problem.
 * Used to decide whether to retry an insights request without the `actions` field.
 */
function isMetaPermissionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("(#200)") ||
    msg.includes("ads_management") ||
    msg.includes("ads_read") ||
    msg.includes("permission")
  );
}

/** Shared insight fields for both adset and ad level requests. */
function buildInsightParams(
  sinceDate: string,
  untilDate: string,
  level: "adset" | "ad",
  includeActions: boolean
): URLSearchParams {
  const adsetFields = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "spend",
    "impressions",
    "clicks",
    "reach",
    "date_start",
    "date_stop",
    "account_currency",
    ...(includeActions ? ["actions", "action_values"] : []),
  ];
  const adFields = [
    ...adsetFields,
    "ad_id",
    "ad_name",
  ];
  const fields = level === "adset" ? adsetFields : adFields;
  const timeRange = JSON.stringify({
    since: sinceDate,
    until: untilDate,
  });
  return new URLSearchParams({
    fields: fields.join(","),
    time_range: timeRange,
    time_increment: "1",
    level,
    limit: GRAPH_PAGE_LIMIT,
  });
}

/** Builds campaign-level insight fields list. */
function campaignInsightFields(includeActions: boolean): string {
  return [
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
    ...(includeActions ? ["actions", "action_values"] : []),
  ].join(",");
}

async function fetchMetaInsights(
  accessToken: string,
  adAccountGraphId: string,
  sinceDate: string,
  untilDate: string
): Promise<Record<string, unknown>[]> {
  const accountPath = encodeURIComponent(adAccountGraphId);
  const timeRange = JSON.stringify({ since: sinceDate, until: untilDate });

  const makeUrl = (includeActions: boolean): string => {
    const qs = new URLSearchParams({
      fields: campaignInsightFields(includeActions),
      time_range: timeRange,
      time_increment: "1",
      level: "campaign",
      limit: GRAPH_PAGE_LIMIT,
    });
    return `${META_GRAPH_BASE}/${accountPath}/insights?${qs.toString()}`;
  };

  try {
    return await fetchAllGraphDataPages(accessToken, makeUrl(true));
  } catch (err) {
    if (!isMetaPermissionError(err)) throw err;
    console.warn(
      `[meta-ads-sync] campaign insights: actions/action_values permission denied, retrying without. Error: ${err instanceof Error ? err.message : String(err)}`
    );
    return fetchAllGraphDataPages(accessToken, makeUrl(false));
  }
}

async function fetchMetaAdsetInsights(
  accessToken: string,
  adAccountGraphId: string,
  sinceDate: string,
  untilDate: string
): Promise<Record<string, unknown>[]> {
  const accountPath = encodeURIComponent(adAccountGraphId);

  const makeUrl = (includeActions: boolean): string => {
    const qs = buildInsightParams(sinceDate, untilDate, "adset", includeActions);
    return `${META_GRAPH_BASE}/${accountPath}/insights?${qs.toString()}`;
  };

  try {
    return await fetchAllGraphDataPages(accessToken, makeUrl(true));
  } catch (err) {
    if (!isMetaPermissionError(err)) throw err;
    console.warn(
      `[meta-ads-sync] adset insights: actions/action_values permission denied, retrying without. Error: ${err instanceof Error ? err.message : String(err)}`
    );
    return fetchAllGraphDataPages(accessToken, makeUrl(false));
  }
}

async function fetchMetaAdInsights(
  accessToken: string,
  adAccountGraphId: string,
  sinceDate: string,
  untilDate: string
): Promise<Record<string, unknown>[]> {
  const accountPath = encodeURIComponent(adAccountGraphId);

  const makeUrl = (includeActions: boolean): string => {
    const qs = buildInsightParams(sinceDate, untilDate, "ad", includeActions);
    return `${META_GRAPH_BASE}/${accountPath}/insights?${qs.toString()}`;
  };

  try {
    return await fetchAllGraphDataPages(accessToken, makeUrl(true));
  } catch (err) {
    if (!isMetaPermissionError(err)) throw err;
    console.warn(
      `[meta-ads-sync] ad insights: actions/action_values permission denied, retrying without. Error: ${err instanceof Error ? err.message : String(err)}`
    );
    return fetchAllGraphDataPages(accessToken, makeUrl(false));
  }
}

// ---------------------------------------------------------------------------
// Number parsers
// ---------------------------------------------------------------------------

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

function parseStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// Upsert helpers — one per DB table
// ---------------------------------------------------------------------------

async function upsertMetaCampaigns(
  supabase: SupabaseClient<Database>,
  integrationAccountId: string,
  campaigns: Record<string, unknown>[]
): Promise<number> {
  const nowIso = new Date().toISOString();
  let total = 0;
  for (let i = 0; i < campaigns.length; i += UPSERT_CHUNK) {
    const chunk = campaigns.slice(i, i + UPSERT_CHUNK);
    const rows = chunk
      .map((c) => {
        const idRaw = c["id"];
        const id =
          typeof idRaw === "string" && idRaw.trim() !== ""
            ? idRaw.trim()
            : "";
        return {
          id,
          integration_account_id: integrationAccountId,
          name: parseStringOrNull(c["name"]),
          status: parseStringOrNull(c["status"]),
          objective: parseStringOrNull(c["objective"]),
          raw_json: c as Json,
          synced_at: nowIso,
        };
      })
      .filter((r) => r.id !== "");

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

async function upsertMetaAdsets(
  supabase: SupabaseClient<Database>,
  integrationAccountId: string,
  adsets: Record<string, unknown>[]
): Promise<number> {
  const nowIso = new Date().toISOString();
  let total = 0;
  for (let i = 0; i < adsets.length; i += UPSERT_CHUNK) {
    const chunk = adsets.slice(i, i + UPSERT_CHUNK);
    const rows = chunk
      .map((a) => {
        const id = parseStringOrNull(a["id"]) ?? "";
        const campaignId = parseStringOrNull(a["campaign_id"]) ?? "";
        return {
          id,
          integration_account_id: integrationAccountId,
          campaign_id: campaignId,
          name: parseStringOrNull(a["name"]),
          status: parseStringOrNull(a["status"]),
          optimization_goal: parseStringOrNull(a["optimization_goal"]),
          billing_event: parseStringOrNull(a["billing_event"]),
          daily_budget: parseMoney(a["daily_budget"]),
          lifetime_budget: parseMoney(a["lifetime_budget"]),
          raw_json: a as Json,
          synced_at: nowIso,
        };
      })
      .filter((r) => r.id !== "" && r.campaign_id !== "");

    if (rows.length === 0) {
      continue;
    }

    const { error } = await supabase
      .from("meta_adsets")
      .upsert(rows, { onConflict: "id" });

    if (error !== null) {
      throw new Error(`meta_adsets upsert failed: ${error.message}`);
    }
    total += rows.length;
  }
  return total;
}

async function upsertMetaAds(
  supabase: SupabaseClient<Database>,
  integrationAccountId: string,
  ads: Record<string, unknown>[]
): Promise<number> {
  const nowIso = new Date().toISOString();
  let total = 0;
  for (let i = 0; i < ads.length; i += UPSERT_CHUNK) {
    const chunk = ads.slice(i, i + UPSERT_CHUNK);
    const rows = chunk
      .map((a) => {
        const id = parseStringOrNull(a["id"]) ?? "";
        const adsetId = parseStringOrNull(a["adset_id"]) ?? "";
        const campaignId = parseStringOrNull(a["campaign_id"]) ?? "";
        return {
          id,
          integration_account_id: integrationAccountId,
          adset_id: adsetId,
          campaign_id: campaignId,
          name: parseStringOrNull(a["name"]),
          status: parseStringOrNull(a["status"]),
          raw_json: a as Json,
          synced_at: nowIso,
        };
      })
      .filter((r) => r.id !== "" && r.adset_id !== "" && r.campaign_id !== "");

    if (rows.length === 0) {
      continue;
    }

    const { error } = await supabase
      .from("meta_ads")
      .upsert(rows, { onConflict: "id" });

    if (error !== null) {
      throw new Error(`meta_ads upsert failed: ${error.message}`);
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
    const rows = chunk
      .map((row) => {
        const campaignId = parseStringOrNull(row["campaign_id"]) ?? "";
        const dateStart = parseStringOrNull(row["date_start"])?.slice(0, 10) ?? "";
        const dateStop =
          parseStringOrNull(row["date_stop"])?.slice(0, 10) ?? dateStart;
        const parsed = parseActionsFromMeta(row["actions"], row["action_values"]);
        return {
          integration_account_id: integrationAccountId,
          campaign_id: campaignId,
          campaign_name: parseStringOrNull(row["campaign_name"]),
          adset_id: parseStringOrNull(row["adset_id"]),
          date_start: dateStart,
          date_stop: dateStop,
          spend: parseMoney(row["spend"]),
          impressions: parseBigIntOrNull(row["impressions"]),
          clicks: parseBigIntOrNull(row["clicks"]),
          reach: parseBigIntOrNull(row["reach"]),
          currency: parseStringOrNull(row["account_currency"]),
          leads: parsed.leads,
          purchases: parsed.purchases,
          purchase_value: parsed.purchase_value,
          landing_page_views: parsed.landing_page_views,
          raw_json: row as Json,
          synced_at: nowIso,
        };
      })
      .filter((r) => r.campaign_id !== "" && r.date_start !== "");

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

async function upsertMetaAdsetInsights(
  supabase: SupabaseClient<Database>,
  integrationAccountId: string,
  insights: Record<string, unknown>[]
): Promise<number> {
  const nowIso = new Date().toISOString();
  let total = 0;
  for (let i = 0; i < insights.length; i += UPSERT_CHUNK) {
    const chunk = insights.slice(i, i + UPSERT_CHUNK);
    const rows = chunk
      .map((row) => {
        const adsetId = parseStringOrNull(row["adset_id"]) ?? "";
        const campaignId = parseStringOrNull(row["campaign_id"]) ?? "";
        const dateStart = parseStringOrNull(row["date_start"])?.slice(0, 10) ?? "";
        const dateStop =
          parseStringOrNull(row["date_stop"])?.slice(0, 10) ?? dateStart;
        const parsed = parseActionsFromMeta(row["actions"], row["action_values"]);
        return {
          integration_account_id: integrationAccountId,
          adset_id: adsetId,
          adset_name: parseStringOrNull(row["adset_name"]),
          campaign_id: campaignId,
          campaign_name: parseStringOrNull(row["campaign_name"]),
          date_start: dateStart,
          date_stop: dateStop,
          spend: parseMoney(row["spend"]),
          impressions: parseBigIntOrNull(row["impressions"]),
          clicks: parseBigIntOrNull(row["clicks"]),
          reach: parseBigIntOrNull(row["reach"]),
          currency: parseStringOrNull(row["account_currency"]),
          leads: parsed.leads,
          purchases: parsed.purchases,
          purchase_value: parsed.purchase_value,
          landing_page_views: parsed.landing_page_views,
          raw_json: row as Json,
          synced_at: nowIso,
        };
      })
      .filter((r) => r.adset_id !== "" && r.campaign_id !== "" && r.date_start !== "");

    if (rows.length === 0) {
      continue;
    }

    const { error } = await supabase
      .from("meta_adset_insights")
      .upsert(rows, {
        onConflict: "integration_account_id,adset_id,date_start",
      });

    if (error !== null) {
      throw new Error(`meta_adset_insights upsert failed: ${error.message}`);
    }
    total += rows.length;
  }
  return total;
}

async function upsertMetaAdInsights(
  supabase: SupabaseClient<Database>,
  integrationAccountId: string,
  insights: Record<string, unknown>[]
): Promise<number> {
  const nowIso = new Date().toISOString();
  let total = 0;
  for (let i = 0; i < insights.length; i += UPSERT_CHUNK) {
    const chunk = insights.slice(i, i + UPSERT_CHUNK);
    const rows = chunk
      .map((row) => {
        const adId = parseStringOrNull(row["ad_id"]) ?? "";
        const adsetId = parseStringOrNull(row["adset_id"]) ?? "";
        const campaignId = parseStringOrNull(row["campaign_id"]) ?? "";
        const dateStart = parseStringOrNull(row["date_start"])?.slice(0, 10) ?? "";
        const dateStop =
          parseStringOrNull(row["date_stop"])?.slice(0, 10) ?? dateStart;
        const parsed = parseActionsFromMeta(row["actions"], row["action_values"]);
        return {
          integration_account_id: integrationAccountId,
          ad_id: adId,
          ad_name: parseStringOrNull(row["ad_name"]),
          adset_id: adsetId,
          campaign_id: campaignId,
          campaign_name: parseStringOrNull(row["campaign_name"]),
          date_start: dateStart,
          date_stop: dateStop,
          spend: parseMoney(row["spend"]),
          impressions: parseBigIntOrNull(row["impressions"]),
          clicks: parseBigIntOrNull(row["clicks"]),
          reach: parseBigIntOrNull(row["reach"]),
          currency: parseStringOrNull(row["account_currency"]),
          leads: parsed.leads,
          purchases: parsed.purchases,
          purchase_value: parsed.purchase_value,
          landing_page_views: parsed.landing_page_views,
          raw_json: row as Json,
          synced_at: nowIso,
        };
      })
      .filter(
        (r) =>
          r.ad_id !== "" &&
          r.adset_id !== "" &&
          r.campaign_id !== "" &&
          r.date_start !== ""
      );

    if (rows.length === 0) {
      continue;
    }

    const { error } = await supabase
      .from("meta_ad_insights")
      .upsert(rows, {
        onConflict: "integration_account_id,ad_id,date_start",
      });

    if (error !== null) {
      throw new Error(`meta_ad_insights upsert failed: ${error.message}`);
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
  /** Total meta_adsets upserted across all accounts. */
  adsetsUpserted: number;
  /** Total meta_ads upserted across all accounts. */
  adsUpserted: number;
  /** Total meta_insights rows upserted across all accounts. */
  insightRowsUpserted: number;
  /** Total meta_adset_insights rows upserted across all accounts. */
  adsetInsightRowsUpserted: number;
  /** Total meta_ad_insights rows upserted across all accounts. */
  adInsightRowsUpserted: number;
  /** Number of webinar runs that had spend attributed after recompute. */
  runsAttributed: number;
  /** Per-agency-line summaries (useful for surfacing per-account errors in the UI). */
  lines: Array<{
    agencyLine: string;
    integrationAccountId: string;
    campaignsUpserted: number;
    adsetsUpserted: number;
    adsUpserted: number;
    insightRowsUpserted: number;
    adsetInsightRowsUpserted: number;
    adInsightRowsUpserted: number;
    /** Present when this line's sync errored. */
    error?: string;
  }>;
}

type AccountSyncResult = SyncMetaAdsResult["lines"][number];

/**
 * Syncs all Meta entity types (campaigns, ad sets, ads, and all three insight
 * levels) for a single integration account and returns per-account counts.
 */
async function syncSingleAccount(
  agencyLine: string,
  integrationAccountId: string,
  sinceStr: string,
  untilStr: string,
  supabaseClient: SupabaseClient<Database>
): Promise<AccountSyncResult> {
  const token = await getMetaAccessToken(integrationAccountId, supabaseClient);

  const { data: acct, error: acctErr } = await supabaseClient
    .from("integration_accounts")
    .select("account_id")
    .eq("id", integrationAccountId)
    .maybeSingle();

  if (acctErr !== null) {
    throw new Error(`Failed to load integration account: ${acctErr.message}`);
  }

  const actIdRaw = acct?.account_id;
  const adAccountGraphId =
    typeof actIdRaw === "string" && actIdRaw.trim() !== ""
      ? actIdRaw.trim()
      : "";
  if (adAccountGraphId === "") {
    throw new Error("integration_accounts.account_id is empty for Meta");
  }

  console.log(
    `[meta-ads-sync] Starting sync for agency="${agencyLine}" account="${adAccountGraphId}" window="${sinceStr}..${untilStr}"`
  );

  const campaigns = await fetchMetaCampaigns(token, adAccountGraphId);
  console.log(`[meta-ads-sync] Fetched ${campaigns.length} campaigns`);
  const cCount = await upsertMetaCampaigns(
    supabaseClient,
    integrationAccountId,
    campaigns
  );

  const adsets = await fetchMetaAdsets(token, adAccountGraphId);
  console.log(`[meta-ads-sync] Fetched ${adsets.length} ad sets`);
  const asCount = await upsertMetaAdsets(
    supabaseClient,
    integrationAccountId,
    adsets
  );

  const ads = await fetchMetaAds(token, adAccountGraphId);
  console.log(`[meta-ads-sync] Fetched ${ads.length} ads`);
  const adCount = await upsertMetaAds(supabaseClient, integrationAccountId, ads);

  const insights = await fetchMetaInsights(
    token,
    adAccountGraphId,
    sinceStr,
    untilStr
  );
  console.log(`[meta-ads-sync] Fetched ${insights.length} campaign insight rows`);
  const iCount = await upsertMetaInsights(
    supabaseClient,
    integrationAccountId,
    insights
  );

  const adsetInsights = await fetchMetaAdsetInsights(
    token,
    adAccountGraphId,
    sinceStr,
    untilStr
  );
  console.log(
    `[meta-ads-sync] Fetched ${adsetInsights.length} adset insight rows`
  );
  const asiCount = await upsertMetaAdsetInsights(
    supabaseClient,
    integrationAccountId,
    adsetInsights
  );

  const adInsights = await fetchMetaAdInsights(
    token,
    adAccountGraphId,
    sinceStr,
    untilStr
  );
  console.log(
    `[meta-ads-sync] Fetched ${adInsights.length} ad insight rows`
  );
  const aiCount = await upsertMetaAdInsights(
    supabaseClient,
    integrationAccountId,
    adInsights
  );

  console.log(
    `[meta-ads-sync] Done agency="${agencyLine}": campaigns=${cCount} adsets=${asCount} ads=${adCount} campaignInsights=${iCount} adsetInsights=${asiCount} adInsights=${aiCount}`
  );

  return {
    agencyLine,
    integrationAccountId,
    campaignsUpserted: cCount,
    adsetsUpserted: asCount,
    adsUpserted: adCount,
    insightRowsUpserted: iCount,
    adsetInsightRowsUpserted: asiCount,
    adInsightRowsUpserted: aiCount,
  };
}

/**
 * Syncs Meta campaigns, ad sets, ads, and daily insights (all three levels)
 * for every linked ad account on the project, then recomputes run-level spend
 * attribution.
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
  let adsetsUpserted = 0;
  let adsUpserted = 0;
  let insightRowsUpserted = 0;
  let adsetInsightRowsUpserted = 0;
  let adInsightRowsUpserted = 0;
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
      const lineResult = await syncSingleAccount(
        agencyLine,
        integrationAccountId,
        sinceStr,
        untilStr,
        supabaseClient
      );
      campaignsUpserted += lineResult.campaignsUpserted;
      adsetsUpserted += lineResult.adsetsUpserted;
      adsUpserted += lineResult.adsUpserted;
      insightRowsUpserted += lineResult.insightRowsUpserted;
      adsetInsightRowsUpserted += lineResult.adsetInsightRowsUpserted;
      adInsightRowsUpserted += lineResult.adInsightRowsUpserted;
      lines.push(lineResult);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Unknown error during Meta sync";
      console.error(
        `[meta-ads-sync] Error for agency="${agencyLine}" account="${integrationAccountId}":`,
        msg
      );
      lines.push({
        agencyLine,
        integrationAccountId,
        campaignsUpserted: 0,
        adsetsUpserted: 0,
        adsUpserted: 0,
        insightRowsUpserted: 0,
        adsetInsightRowsUpserted: 0,
        adInsightRowsUpserted: 0,
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
    adsetsUpserted,
    adsUpserted,
    insightRowsUpserted,
    adsetInsightRowsUpserted,
    adInsightRowsUpserted,
    runsAttributed,
    lines,
  };
}
