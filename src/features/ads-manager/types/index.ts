/**
 * Shared type definitions for the Ads Manager dashboard feature.
 * Covers the 3-level Meta Ads hierarchy: Campaigns → Ad Sets → Ads.
 */

/** The three levels of the Meta Ads hierarchy. */
export type AdsManagerLevel = "campaign" | "adset" | "ad";

/**
 * A single row in the Ads Manager table. Entity fields are generic so that
 * the same component can render campaigns, ad sets, or individual ads.
 */
export interface AdsManagerRow {
  /** The Meta entity id (campaign_id / adset_id / ad_id). */
  entity_id: string;
  /** The human-readable name of this entity. */
  entity_name: string;
  /** Delivery status reported by Meta (ACTIVE, PAUSED, …). */
  entity_status: string | null;
  /**
   * A descriptive label specific to the entity level.
   * - Campaign: the campaign objective
   * - Ad set: the optimization goal
   * - Ad: null
   */
  entity_label: string | null;
  /**
   * The id of the parent entity.
   * - Campaign: null
   * - Ad set: campaign_id
   * - Ad: adset_id
   */
  parent_id: string | null;
  /** Total spend in the queried date window (account currency). */
  spend: number;
  /** Total impressions. */
  impressions: number;
  /** Total link clicks. */
  clicks: number;
  /** Total unique reach. */
  reach: number;
  /** Account currency code (e.g. "USD", "MYR"). */
  currency: string;
  /** Click-through rate as a percentage (clicks / impressions * 100), or null. */
  ctr: number | null;
  /** Cost per 1 000 impressions (spend / impressions * 1 000), or null. */
  cpm: number | null;
  /** Cost per click (spend / clicks), or null. */
  cpc: number | null;
  /** Total lead conversion events (omni_lead / lead / pixel_lead), or null if none. */
  leads: number | null;
  /** Cost per lead (spend / leads), or null when no leads. */
  cost_per_lead: number | null;
  /** Total purchase conversion events attributed via Meta pixel, or null if none. */
  purchases: number | null;
  /** Total purchase revenue attributed via Meta pixel (from action_values), or null. */
  purchase_value: number | null;
  /** Return on ad spend (purchase_value / spend), or null when no purchase value. */
  roas: number | null;
  /** Total landing page view events, or null if not tracked. */
  landing_page_views: number | null;
  /**
   * Budget set on this entity in the account currency.
   * - Campaign: campaign-level budget (CBO), or null when ABO.
   * - Ad set: ad-set-level budget (ABO), or null when parent is CBO.
   * - Ad: always null.
   */
  daily_budget: number | null;
  /** Lifetime (total) budget, mutually exclusive with daily_budget. */
  lifetime_budget: number | null;
  /**
   * True when the campaign uses Campaign Budget Optimisation (CBO).
   * Null at adset and ad levels (not applicable).
   */
  is_cbo: boolean | null;
}

/** Rolled-up totals shown in the KPI bar above the table. */
export interface AdsManagerSummary {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_reach: number;
  /** Total leads across all rows, or null when no pixel/lead events present. */
  total_leads: number | null;
  /** Total purchase conversions, or null. */
  total_purchases: number | null;
  /** Total purchase revenue, or null. */
  total_purchase_value: number | null;
  /** Overall ROAS (total_purchase_value / total_spend), or null. */
  roas: number | null;
  /** Total landing page views, or null. */
  total_landing_page_views: number | null;
  currency: string;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  /** Cost per lead (total_spend / total_leads), or null when no leads. */
  cost_per_lead: number | null;
}

/** Breadcrumb context item so the UI can render back-navigation labels. */
export interface AdsManagerBreadcrumb {
  id: string;
  name: string;
}

/**
 * Full API response payload returned by GET /api/dashboard/ads-manager.
 */
export interface AdsManagerPayload {
  /** Which hierarchy level these rows represent. */
  level: AdsManagerLevel;
  /** Rolled-up KPI totals for the displayed rows. */
  summary: AdsManagerSummary;
  /** The list of entity rows (campaigns, ad sets, or ads). */
  rows: AdsManagerRow[];
  /** ISO date string (YYYY-MM-DD) for the query window start. */
  date_from: string;
  /** ISO date string (YYYY-MM-DD) for the query window end. */
  date_to: string;
  /** True when at least one Meta ad account is linked to this project. */
  has_linked_accounts: boolean;
  /**
   * Present when level=adset or level=ad.
   * The campaign the user drilled into.
   */
  campaign_context: AdsManagerBreadcrumb | null;
  /**
   * Present when level=ad.
   * The ad set the user drilled into.
   */
  adset_context: AdsManagerBreadcrumb | null;
}

// ---------------------------------------------------------------------------
// Legacy aliases — kept temporarily for any existing references.
// ---------------------------------------------------------------------------

/** @deprecated Use {@link AdsManagerRow} instead. */
export type AdsManagerCampaignRow = AdsManagerRow & {
  campaign_id: string;
  campaign_name: string;
  campaign_status: string | null;
  campaign_objective: string | null;
};
