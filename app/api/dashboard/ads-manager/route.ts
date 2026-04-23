/**
 * GET /api/dashboard/ads-manager
 *
 * Returns aggregated Meta Ads data for the given project and date window.
 * Supports three hierarchy levels via the `level` query param:
 *   - campaign (default) — all campaigns with rolled-up daily spend
 *   - adset               — ad sets within a specific campaign_id
 *   - ad                  — individual ads within a specific adset_id
 *
 * Query params:
 *   workspace_id  – required
 *   project_id    – required
 *   date_from     – optional YYYY-MM-DD (default: 30 days ago)
 *   date_to       – optional YYYY-MM-DD (default: today)
 *   level         – optional: "campaign" | "adset" | "ad" (default: "campaign")
 *   campaign_id   – required when level = "adset"
 *   adset_id      – required when level = "ad"
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import type {
  AdsManagerLevel,
  AdsManagerPayload,
  AdsManagerRow,
  AdsManagerSummary,
  AdsManagerBreadcrumb,
} from "@/features/ads-manager/types";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toIsoDate(d);
}

// ---------------------------------------------------------------------------
// Empty payload factory
// ---------------------------------------------------------------------------

function emptyPayload(
  level: AdsManagerLevel,
  dateFrom: string,
  dateTo: string,
  hasLinkedAccounts: boolean,
  campaignContext: AdsManagerBreadcrumb | null,
  adsetContext: AdsManagerBreadcrumb | null
): AdsManagerPayload {
  return {
    level,
    summary: {
      total_spend: 0,
      total_impressions: 0,
      total_clicks: 0,
      total_reach: 0,
      total_leads: null,
      total_purchases: null,
      total_purchase_value: null,
      roas: null,
      total_landing_page_views: null,
      currency: "USD",
      ctr: null,
      cpm: null,
      cpc: null,
      cost_per_lead: null,
    },
    rows: [],
    date_from: dateFrom,
    date_to: dateTo,
    has_linked_accounts: hasLinkedAccounts,
    campaign_context: campaignContext,
    adset_context: adsetContext,
  };
}

// ---------------------------------------------------------------------------
// Shared aggregation types
// ---------------------------------------------------------------------------

type RawInsightRow = {
  entity_id: string;
  entity_name: string | null;
  parent_id: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  leads: number | null;
  purchases: number | null;
  purchase_value: number | null;
  landing_page_views: number | null;
  currency: string | null;
};

type EntityAccum = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  purchases: number;
  purchase_value: number;
  landing_page_views: number;
  currency: string;
  name: string;
  parentId: string | null;
};

// ---------------------------------------------------------------------------
// Generic aggregation helpers (shared across all three levels)
// ---------------------------------------------------------------------------

/**
 * Aggregates an array of raw insight rows into a per-entity accumulator map.
 * Also derives the dominant non-USD currency seen across all rows.
 */
/** Creates an initial EntityAccum from the first raw insight row seen for an entity. */
function createAccum(row: RawInsightRow): EntityAccum {
  return {
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    leads: Number(row.leads ?? 0),
    purchases: Number(row.purchases ?? 0),
    purchase_value: Number(row.purchase_value ?? 0),
    landing_page_views: Number(row.landing_page_views ?? 0),
    currency: row.currency ?? "USD",
    name: row.entity_name ?? row.entity_id,
    parentId: row.parent_id,
  };
}

/** Adds a raw insight row's values into an existing EntityAccum. */
function mergeIntoAccum(accum: EntityAccum, row: RawInsightRow): void {
  accum.spend += Number(row.spend ?? 0);
  accum.impressions += Number(row.impressions ?? 0);
  accum.clicks += Number(row.clicks ?? 0);
  accum.reach += Number(row.reach ?? 0);
  accum.leads += Number(row.leads ?? 0);
  accum.purchases += Number(row.purchases ?? 0);
  accum.purchase_value += Number(row.purchase_value ?? 0);
  accum.landing_page_views += Number(row.landing_page_views ?? 0);
  if ((row.currency ?? "USD") !== "USD") {
    accum.currency = row.currency ?? "USD";
  }
}

/**
 * Aggregates an array of raw insight rows into a per-entity accumulator map.
 * Also derives the dominant non-USD currency seen across all rows.
 *
 * @param journeyLeads - First-party lead counts from journey_events, keyed by
 *   entity_id. When present for an entity, this replaces Meta pixel leads.
 */
function aggregateRows(
  rows: RawInsightRow[],
  journeyLeads: Map<string, number>
): { accum: Map<string, EntityAccum>; currency: string } {
  const accum = new Map<string, EntityAccum>();
  let currency = "USD";

  for (const row of rows) {
    if ((row.currency ?? "USD") !== "USD") {
      currency = row.currency ?? "USD";
    }
    const existing = accum.get(row.entity_id);
    if (existing === undefined) {
      accum.set(row.entity_id, createAccum(row));
    } else {
      mergeIntoAccum(existing, row);
    }
  }

  // Overlay first-party journey lead counts (override Meta pixel).
  for (const [entityId, count] of journeyLeads) {
    const entry = accum.get(entityId);
    if (entry !== undefined) {
      entry.leads = count;
    }
  }

  return { accum, currency };
}

type EntityMeta = {
  name: string | null;
  status: string | null;
  label: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  is_cbo: boolean | null;
};

/** Converts a positive count to itself, or null when zero (avoids "0 leads" confusion). */
function positiveOrNull(n: number): number | null {
  return n > 0 ? n : null;
}

/** Maps an EntityAccum entry to an AdsManagerRow with all derived metrics. */
function accumToRow(
  entityId: string,
  acc: EntityAccum,
  meta: EntityMeta | undefined
): AdsManagerRow {
  const ctr = acc.impressions > 0 ? (acc.clicks / acc.impressions) * 100 : null;
  const cpm = acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : null;
  const cpc = acc.clicks > 0 ? acc.spend / acc.clicks : null;
  return {
    entity_id: entityId,
    entity_name: meta?.name ?? acc.name,
    entity_status: meta?.status ?? null,
    entity_label: meta?.label ?? null,
    parent_id: acc.parentId,
    spend: acc.spend,
    impressions: acc.impressions,
    clicks: acc.clicks,
    reach: acc.reach,
    leads: positiveOrNull(acc.leads),
    currency: acc.currency,
    ctr,
    cpm,
    cpc,
    cost_per_lead: acc.leads > 0 ? acc.spend / acc.leads : null,
    purchases: positiveOrNull(acc.purchases),
    purchase_value: positiveOrNull(acc.purchase_value),
    roas: acc.purchase_value > 0 ? acc.purchase_value / acc.spend : null,
    landing_page_views: positiveOrNull(acc.landing_page_views),
    daily_budget: meta?.daily_budget ?? null,
    lifetime_budget: meta?.lifetime_budget ?? null,
    is_cbo: meta?.is_cbo ?? null,
  };
}

/**
 * Converts the accumulator map into a sorted {@link AdsManagerRow} array.
 * Rows are sorted by spend descending.
 */
function buildRows(
  accum: Map<string, EntityAccum>,
  metaMap: Map<string, EntityMeta>
): AdsManagerRow[] {
  const rows: AdsManagerRow[] = [];
  for (const [entityId, acc] of accum) {
    rows.push(accumToRow(entityId, acc, metaMap.get(entityId)));
  }
  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}

/**
 * Computes a rolled-up {@link AdsManagerSummary} from entity rows.
 *
 * @param journeyLeadsTotal - When > 0, used as total_leads and for CPL so that
 *   unattributed journey opt-ins (organic / missing UTM) are reflected in the
 *   summary KPI bar. Per-row leads stay attributed-only.
 */
function buildSummary(
  rows: AdsManagerRow[],
  currency: string,
  journeyLeadsTotal: number
): AdsManagerSummary {
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalReach = rows.reduce((s, r) => s + r.reach, 0);
  const totalLeads = journeyLeadsTotal > 0
    ? journeyLeadsTotal
    : rows.reduce((s, r) => s + (r.leads ?? 0), 0);
  const totalPurchases = rows.reduce((s, r) => s + (r.purchases ?? 0), 0);
  const totalPurchaseValue = rows.reduce((s, r) => s + (r.purchase_value ?? 0), 0);
  const totalLandingPageViews = rows.reduce((s, r) => s + (r.landing_page_views ?? 0), 0);

  return {
    total_spend: totalSpend,
    total_impressions: totalImpressions,
    total_clicks: totalClicks,
    total_reach: totalReach,
    total_leads: totalLeads > 0 ? totalLeads : null,
    total_purchases: totalPurchases > 0 ? totalPurchases : null,
    total_purchase_value: totalPurchaseValue > 0 ? totalPurchaseValue : null,
    roas: totalPurchaseValue > 0 ? totalPurchaseValue / totalSpend : null,
    total_landing_page_views: totalLandingPageViews > 0 ? totalLandingPageViews : null,
    currency,
    ctr:
      totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
    cpm:
      totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : null,
    cost_per_lead: totalLeads > 0 ? totalSpend / totalLeads : null,
  };
}

// ---------------------------------------------------------------------------
// Journey-events lead counts (first-party, overrides Meta pixel leads)
// ---------------------------------------------------------------------------

/**
 * Returns per-entity lead counts from first-party journey_events, plus a total
 * that includes unattributed rows (empty UTM / organic).
 *
 * Date filtering uses KL timezone (UTC+8) to match the Google Sheet convention —
 * "April 21" means April 21 00:00 – 23:59 in Asia/Kuala_Lumpur, not UTC.
 *
 * @param level           - Groups by meta_campaign_id | meta_adset_id | meta_ad_id.
 * @param projectId       - Scope to this project.
 * @param dateFrom        - Inclusive start date (YYYY-MM-DD) in KL timezone.
 * @param dateTo          - Inclusive end date   (YYYY-MM-DD) in KL timezone.
 * @param filterEntityId  - When level = "adset", restricts to this campaign_id.
 *                          When level = "ad",    restricts to this adset_id.
 */
async function queryJourneyLeadCounts(
  level: AdsManagerLevel,
  projectId: string,
  dateFrom: string,
  dateTo: string,
  filterEntityId: string
): Promise<{ byEntity: Map<string, number>; totalAll: number }> {
  /** Row shape returned from the explicit three-column select below. */
  type JourneyRow = {
    meta_campaign_id: string | null;
    meta_adset_id: string | null;
    meta_ad_id: string | null;
  };
  type JourneyColumn = keyof JourneyRow;

  const idColumnMap: Record<AdsManagerLevel, JourneyColumn> = {
    campaign: "meta_campaign_id",
    adset: "meta_adset_id",
    ad: "meta_ad_id",
  };
  const idColumn: JourneyColumn = idColumnMap[level];

  const parentColumnMap: Record<AdsManagerLevel, JourneyColumn | null> = {
    campaign: null,
    adset: "meta_campaign_id",
    ad: "meta_adset_id",
  };
  const parentColumn: JourneyColumn | null = parentColumnMap[level];

  // KL is UTC+8 — anchor the date window to KL midnight so sheet rows
  // entered before 08:00 local time are not dropped by a UTC boundary.
  const klFrom = `${dateFrom}T00:00:00+08:00`;
  const klTo = `${dateTo}T23:59:59+08:00`;

  // Select all three ID columns so the row type is concrete and we can
  // index into it via the typed `idColumn` key without any unsafe cast.
  let baseQuery = supabase
    .from("journey_events")
    .select("meta_campaign_id, meta_adset_id, meta_ad_id")
    .eq("project_id", projectId)
    .eq("event_type", "optin")
    .gte("occurred_at", klFrom)
    .lte("occurred_at", klTo);

  if (parentColumn !== null && filterEntityId !== "") {
    baseQuery = baseQuery.eq(parentColumn, filterEntityId);
  }

  const { data, error } = await baseQuery;
  if (error !== null || data === null) {
    return { byEntity: new Map(), totalAll: 0 };
  }

  const byEntity = new Map<string, number>();
  let totalAll = 0;

  for (const row of data as JourneyRow[]) {
    totalAll += 1;
    const id: string | null = row[idColumn];
    if (id !== null && id !== undefined) {
      byEntity.set(id, (byEntity.get(id) ?? 0) + 1);
    }
  }

  return { byEntity, totalAll };
}



async function queryCampaignLevel(
  accountIds: string[],
  dateFrom: string,
  dateTo: string
): Promise<{
  insightRows: RawInsightRow[];
  metaMap: Map<string, EntityMeta>;
}> {
  const { data: insights, error: insightsError } = await supabase
    .from("meta_insights")
    .select("campaign_id, campaign_name, spend, impressions, clicks, reach, leads, purchases, purchase_value, landing_page_views, currency")
    .in("integration_account_id", accountIds)
    .gte("date_start", dateFrom)
    .lte("date_start", dateTo);

  if (insightsError !== null) {
    throw new Error(`meta_insights query failed: ${insightsError.message}`);
  }

  const rawRows: RawInsightRow[] = (insights ?? []).map((r) => ({
    entity_id: r.campaign_id,
    entity_name: r.campaign_name,
    parent_id: null,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    reach: r.reach,
    leads: r.leads,
    purchases: r.purchases,
    purchase_value: r.purchase_value,
    landing_page_views: r.landing_page_views,
    currency: r.currency,
  }));

  const uniqueIds = [...new Set(rawRows.map((r) => r.entity_id))];
  const metaMap = new Map<string, EntityMeta>();

  if (uniqueIds.length > 0) {
    const { data: campaigns, error: campaignsError } = await supabase
      .from("meta_campaigns")
      .select("id, name, status, objective, daily_budget, lifetime_budget, is_cbo")
      .in("id", uniqueIds);

    if (campaignsError !== null) {
      throw new Error(`meta_campaigns query failed: ${campaignsError.message}`);
    }

    for (const c of campaigns ?? []) {
      metaMap.set(c.id, {
        name: c.name,
        status: c.status,
        label: c.objective,
        daily_budget: c.daily_budget ?? null,
        lifetime_budget: c.lifetime_budget ?? null,
        is_cbo: c.is_cbo ?? false,
      });
    }
  }

  return { insightRows: rawRows, metaMap };
}

async function queryAdsetLevel(
  accountIds: string[],
  campaignId: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  insightRows: RawInsightRow[];
  metaMap: Map<string, EntityMeta>;
  campaignContext: AdsManagerBreadcrumb | null;
}> {
  const { data: insights, error: insightsError } = await supabase
    .from("meta_adset_insights")
    .select(
      "adset_id, adset_name, campaign_id, campaign_name, spend, impressions, clicks, reach, leads, purchases, purchase_value, landing_page_views, currency"
    )
    .in("integration_account_id", accountIds)
    .eq("campaign_id", campaignId)
    .gte("date_start", dateFrom)
    .lte("date_start", dateTo);

  if (insightsError !== null) {
    throw new Error(`meta_adset_insights query failed: ${insightsError.message}`);
  }

  const rawRows: RawInsightRow[] = (insights ?? []).map((r) => ({
    entity_id: r.adset_id,
    entity_name: r.adset_name,
    parent_id: r.campaign_id,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    reach: r.reach,
    leads: r.leads,
    purchases: r.purchases,
    purchase_value: r.purchase_value,
    landing_page_views: r.landing_page_views,
    currency: r.currency,
  }));

  const uniqueIds = [...new Set(rawRows.map((r) => r.entity_id))];
  const metaMap = new Map<string, EntityMeta>();

  if (uniqueIds.length > 0) {
    const { data: adsets, error: adsetsError } = await supabase
      .from("meta_adsets")
      .select("id, name, status, optimization_goal, daily_budget, lifetime_budget")
      .in("id", uniqueIds);

    if (adsetsError !== null) {
      throw new Error(`meta_adsets query failed: ${adsetsError.message}`);
    }

    for (const a of adsets ?? []) {
      metaMap.set(a.id, {
        name: a.name,
        status: a.status,
        label: a.optimization_goal,
        daily_budget: a.daily_budget ?? null,
        lifetime_budget: a.lifetime_budget ?? null,
        is_cbo: null,
      });
    }
  }

  // Derive campaign context from the first insight row or from meta_campaigns.
  let campaignContext: AdsManagerBreadcrumb | null = null;
  const firstInsight = (insights ?? [])[0];
  if (firstInsight === undefined) {
    const { data: camp } = await supabase
      .from("meta_campaigns")
      .select("id, name")
      .eq("id", campaignId)
      .maybeSingle();
    if (camp !== null && camp !== undefined) {
      campaignContext = { id: camp.id, name: camp.name ?? camp.id };
    }
  } else {
    campaignContext = {
      id: firstInsight.campaign_id,
      name: firstInsight.campaign_name ?? firstInsight.campaign_id,
    };
  }

  return { insightRows: rawRows, metaMap, campaignContext };
}

async function queryAdLevel(
  accountIds: string[],
  adsetId: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  insightRows: RawInsightRow[];
  metaMap: Map<string, EntityMeta>;
  campaignContext: AdsManagerBreadcrumb | null;
  adsetContext: AdsManagerBreadcrumb | null;
}> {
  const { data: insights, error: insightsError } = await supabase
    .from("meta_ad_insights")
    .select(
      "ad_id, ad_name, adset_id, campaign_id, campaign_name, spend, impressions, clicks, reach, leads, purchases, purchase_value, landing_page_views, currency"
    )
    .in("integration_account_id", accountIds)
    .eq("adset_id", adsetId)
    .gte("date_start", dateFrom)
    .lte("date_start", dateTo);

  if (insightsError !== null) {
    throw new Error(`meta_ad_insights query failed: ${insightsError.message}`);
  }

  const rawRows: RawInsightRow[] = (insights ?? []).map((r) => ({
    entity_id: r.ad_id,
    entity_name: r.ad_name,
    parent_id: r.adset_id,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    reach: r.reach,
    leads: r.leads,
    purchases: r.purchases,
    purchase_value: r.purchase_value,
    landing_page_views: r.landing_page_views,
    currency: r.currency,
  }));

  const uniqueIds = [...new Set(rawRows.map((r) => r.entity_id))];
  const metaMap = new Map<string, EntityMeta>();

  if (uniqueIds.length > 0) {
    const { data: ads, error: adsError } = await supabase
      .from("meta_ads")
      .select("id, name, status")
      .in("id", uniqueIds);

    if (adsError !== null) {
      throw new Error(`meta_ads query failed: ${adsError.message}`);
    }

    for (const a of ads ?? []) {
      metaMap.set(a.id, {
        name: a.name,
        status: a.status,
        label: null,
        daily_budget: null,
        lifetime_budget: null,
        is_cbo: null,
      });
    }
  }

  // Derive breadcrumb context.
  let campaignContext: AdsManagerBreadcrumb | null = null;
  let adsetContext: AdsManagerBreadcrumb | null = null;
  const firstInsight = (insights ?? [])[0];

  if (firstInsight !== undefined) {
    campaignContext = {
      id: firstInsight.campaign_id,
      name: firstInsight.campaign_name ?? firstInsight.campaign_id,
    };
  }

  const { data: adset } = await supabase
    .from("meta_adsets")
    .select("id, name, campaign_id")
    .eq("id", adsetId)
    .maybeSingle();

  if (adset !== null && adset !== undefined) {
    adsetContext = { id: adset.id, name: adset.name ?? adset.id };
    if (campaignContext === null) {
      const { data: camp } = await supabase
        .from("meta_campaigns")
        .select("id, name")
        .eq("id", adset.campaign_id)
        .maybeSingle();
      if (camp !== null && camp !== undefined) {
        campaignContext = { id: camp.id, name: camp.name ?? camp.id };
      }
    }
  }

  return { insightRows: rawRows, metaMap, campaignContext, adsetContext };
}

// ---------------------------------------------------------------------------
// Level validation + query dispatch
// ---------------------------------------------------------------------------

/** Validates that required params are present for each level. Returns an error
 *  message string, or null if valid. */
function validateLevelParams(
  level: AdsManagerLevel,
  campaignId: string,
  adsetId: string
): string | null {
  if (level === "adset" && campaignId === "") {
    return "campaign_id is required when level=adset";
  }
  if (level === "ad" && adsetId === "") {
    return "adset_id is required when level=ad";
  }
  return null;
}

type LevelQueryResult = {
  insightRows: RawInsightRow[];
  metaMap: Map<string, EntityMeta>;
  campaignContext: AdsManagerBreadcrumb | null;
  adsetContext: AdsManagerBreadcrumb | null;
};

/** Dispatches to the correct level-specific query function. */
async function dispatchLevelQuery(
  level: AdsManagerLevel,
  accountIds: string[],
  campaignId: string,
  adsetId: string,
  dateFrom: string,
  dateTo: string
): Promise<LevelQueryResult> {
  if (level === "adset") {
    const result = await queryAdsetLevel(
      accountIds,
      campaignId,
      dateFrom,
      dateTo
    );
    return { ...result, adsetContext: null };
  }
  if (level === "ad") {
    return queryAdLevel(accountIds, adsetId, dateFrom, dateTo);
  }
  const result = await queryCampaignLevel(accountIds, dateFrom, dateTo);
  return { ...result, campaignContext: null, adsetContext: null };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  try {
    const sp = request.nextUrl.searchParams;

    const projectId = sp.get("project_id")?.trim() ?? "";
    if (projectId === "") {
      return NextResponse.json(
        { success: false, error: "project_id query parameter is required" },
        { status: 400 }
      );
    }

    const dateFrom = sp.get("date_from")?.trim() || defaultDateFrom();
    const dateTo = sp.get("date_to")?.trim() || toIsoDate(new Date());

    const rawLevel = sp.get("level")?.trim() ?? "campaign";
    let level: AdsManagerLevel = "campaign";
    if (rawLevel === "adset") {
      level = "adset";
    } else if (rawLevel === "ad") {
      level = "ad";
    }

    const campaignId = sp.get("campaign_id")?.trim() ?? "";
    const adsetId = sp.get("adset_id")?.trim() ?? "";

    /* ── Validate level params ──────────────────────────────────────────────── */
    const validationErr = validateLevelParams(level, campaignId, adsetId);
    if (validationErr !== null) {
      return NextResponse.json(
        { success: false, error: validationErr },
        { status: 400 }
      );
    }

    /* ── 1. Verify at least one Meta ad account is linked ─────────────────── */
    const { data: accountLinks, error: accountLinksError } = await supabase
      .from("project_meta_ad_accounts")
      .select("integration_account_id")
      .eq("project_id", projectId);

    if (accountLinksError !== null) {
      console.error(
        "GET /api/dashboard/ads-manager — project_meta_ad_accounts error:",
        accountLinksError
      );
      return NextResponse.json(
        { success: false, error: "Failed to load Meta ad accounts" },
        { status: 500 }
      );
    }

    if (accountLinks === null || accountLinks.length === 0) {
      return NextResponse.json({
        success: true,
        data: emptyPayload(level, dateFrom, dateTo, false, null, null),
      });
    }

    const accountIds = accountLinks.map((a) => a.integration_account_id);

    /* ── 2. Query the appropriate insight table based on level ────────────── */
    const [{ insightRows, metaMap, campaignContext, adsetContext }, journeyData] =
      await Promise.all([
        dispatchLevelQuery(
          level,
          accountIds,
          campaignId,
          adsetId,
          dateFrom,
          dateTo
        ),
        queryJourneyLeadCounts(
          level,
          projectId,
          dateFrom,
          dateTo,
          level === "adset" ? campaignId : adsetId
        ),
      ]);

    /* ── 3. Return early if no data for the window ───────────────────────── */
    if (insightRows.length === 0) {
      return NextResponse.json({
        success: true,
        data: emptyPayload(
          level,
          dateFrom,
          dateTo,
          true,
          campaignContext,
          adsetContext
        ),
      });
    }

    /* ── 4. Aggregate, build rows, compute summary ───────────────────────── */
    const { accum, currency } = aggregateRows(insightRows, journeyData.byEntity);
    const rows = buildRows(accum, metaMap);
    const summary = buildSummary(rows, currency, journeyData.totalAll);

    const payload: AdsManagerPayload = {
      level,
      summary,
      rows,
      date_from: dateFrom,
      date_to: dateTo,
      has_linked_accounts: true,
      campaign_context: campaignContext,
      adset_context: adsetContext,
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (err) {
    console.error("GET /api/dashboard/ads-manager:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load Ads Manager data" },
      { status: 500 }
    );
  }
}
