/**
 * Resolves UTM parameters from an opt-in event to Meta entity IDs.
 *
 * Two resolution paths:
 *
 *  1. **ad_id path** (forward-looking, triggered when utm_source looks like
 *     a numeric Meta ad ID):
 *     utm_source → meta_ads.id → (meta_ad_id, meta_adset_id, meta_campaign_id)
 *
 *  2. **name_match path** (backward-compatible backfill for historical data
 *     where utm_source is not an ad ID):
 *     utm_content + utm_campaign → ILIKE match against meta_adsets.name
 *     → (meta_adset_id, meta_campaign_id)
 *
 * The marketer's naming convention is:
 *   utm_content  = "{prefix}_{country}"  e.g. "GT1_Apple_FB_MY"
 *   utm_campaign = "{angle/variant}"     e.g. "insulinresistance"
 *   adset name   = "{prefix}_Video_{angle} ({country})" e.g. "GT1_Apple_FB_Video_insulinresistance (MY)"
 *
 * Going forward, the marketer sets utm_source = Meta ad numeric ID so
 * the name_match is no longer needed for new events.
 *
 * For bulk imports, use `preloadMetaEntitiesForProject` + `resolveMetaAttributionInMemory`
 * to avoid a DB round-trip per row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

export type MetaAttributionMethod = "ad_id" | "name_match";

export interface MetaAttributionResult {
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  method: MetaAttributionMethod | null;
}

/** Pre-loaded Meta entity data for in-memory resolution (no DB per row). */
export interface PreloadedMetaEntities {
  /** All adsets for the project's linked ad accounts. */
  adsets: Array<{ id: string; name: string | null; campaign_id: string }>;
  /** Map from Meta ad ID → { adset_id, campaign_id }. */
  adsById: Map<string, { adset_id: string; campaign_id: string }>;
}

const EMPTY_RESULT: MetaAttributionResult = {
  meta_ad_id: null,
  meta_adset_id: null,
  meta_campaign_id: null,
  method: null,
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Returns true when the string looks like a numeric Meta ad/entity ID. */
function looksLikeMetaId(value: string): boolean {
  return /^\d{10,20}$/.test(value.trim());
}

/**
 * Decomposes a utm_content value into its adset name prefix and country code.
 *
 * Normalises the old dash-separated format to underscores before decomposing,
 * allowing `GT1-Apple-MY` (legacy) to be treated the same as `GT1_Apple_MY`.
 * Normalisation only applies when there are no underscores in the raw value.
 *
 * Example:
 *   "GT1_Apple_FB_MY"  → { prefix: "GT1_Apple_FB", country: "MY" }
 *   "GT1_Apple_FB_SG"  → { prefix: "GT1_Apple_FB", country: "SG" }
 *   "GT1-Apple-MY"     → normalised → { prefix: "GT1_Apple",    country: "MY" }
 *   "GT1-Ecom-MY"      → normalised → { prefix: "GT1_Ecom",     country: "MY" }
 *   "organic"          → { prefix: "organic", country: null }
 */
function decomposeUtmContent(
  utmContent: string
): { prefix: string; country: string | null } {
  let raw = utmContent.trim();
  if (raw === "") return { prefix: "", country: null };

  // Legacy UTMs used dashes: "GT1-Apple-MY". Normalise to underscores so the
  // same prefix-matching logic handles both old and new naming conventions.
  if (!raw.includes("_") && raw.includes("-")) {
    raw = raw.replaceAll("-", "_");
  }

  const parts = raw.split("_");
  if (parts.length < 2) return { prefix: raw, country: null };

  const last = parts.at(-1) ?? "";
  // Country codes are 2–3 uppercase ASCII letters.
  if (/^[A-Z]{2,3}$/.test(last)) {
    return {
      prefix: parts.slice(0, -1).join("_"),
      country: last,
    };
  }
  return { prefix: raw, country: null };
}

/**
 * Searches a pre-loaded adset array for the best name match.
 * Used by both the in-memory path and the DB path.
 *
 * Matching strategy (in order):
 *  1. Full prefix match (e.g. "GT1_Apple_FB").
 *  2. If zero candidates, shorten the prefix by one "_" segment and retry once.
 *     This handles cases where the adset name embeds an audience qualifier between
 *     the identifier and the platform suffix — e.g.:
 *       utm_content = "GT1_lookalike_FB_MY"  → prefix = "GT1_lookalike_FB"
 *       adset name  = "GT1_Lookalike 1-3%_FB_Video_sharma (MY)"
 *     The segment "_FB" is appended to the UTM but the adset has extra text between
 *     "lookalike" and "_FB", so the full prefix fails but "GT1_lookalike" matches.
 */
function findBestAdsetMatch(
  adsets: Array<{ id: string; name: string | null; campaign_id: string }>,
  utmContent: string,
  utmCampaign: string
): MetaAttributionResult {
  const content = utmContent.trim();
  const campaign = utmCampaign.trim();

  if (content === "" || campaign === "") return EMPTY_RESULT;

  const { prefix, country } = decomposeUtmContent(content);
  if (prefix === "") return EMPTY_RESULT;

  const campaignLower = campaign.toLowerCase();

  /**
   * Filters adsets that contain all three signals: prefix, angle, and country.
   * The country check is loose (`(my & sg)` satisfies a `my` filter).
   */
  function filterCandidates(
    searchPrefix: string
  ): Array<{ id: string; name: string | null; campaign_id: string }> {
    const pfxLower = searchPrefix.toLowerCase();
    return adsets.filter((adset) => {
      const nameLower = (adset.name ?? "").toLowerCase();
      const hasPrefix = nameLower.includes(pfxLower);
      const hasAngle = nameLower.includes(campaignLower);
      const hasCountry =
        country === null || nameLower.includes(country.toLowerCase());
      return hasPrefix && hasAngle && hasCountry;
    });
  }

  let candidates = filterCandidates(prefix);

  // Fallback: drop the last "_"-separated segment of the prefix and retry once.
  // Handles cases like "GT1_lookalike_FB" → "GT1_lookalike" matching
  // "GT1_Lookalike 1-3%_FB_Video_*" where an audience qualifier sits in the name.
  if (candidates.length === 0) {
    const lastUnderscore = prefix.lastIndexOf("_");
    if (lastUnderscore > 0) {
      const shorterPrefix = prefix.slice(0, lastUnderscore);
      candidates = filterCandidates(shorterPrefix);
    }
  }

  if (candidates.length === 0) return EMPTY_RESULT;

  // Sort for determinism: prefer exact angle boundary then name ASC.
  candidates.sort((a, b) => {
    const aName = (a.name ?? "").toLowerCase();
    const bName = (b.name ?? "").toLowerCase();
    const aExact = aName.includes(`_${campaignLower} `) || aName.includes(`_${campaignLower}(`);
    const bExact = bName.includes(`_${campaignLower} `) || bName.includes(`_${campaignLower}(`);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return aName.localeCompare(bName);
  });

  const best = candidates[0];
  return {
    meta_ad_id: null,
    meta_adset_id: best.id,
    meta_campaign_id: best.campaign_id,
    method: "name_match",
  };
}

// ---------------------------------------------------------------------------
// In-memory resolution (use for bulk imports — no DB round-trip per row)
// ---------------------------------------------------------------------------

/**
 * Resolves UTM parameters to Meta entity IDs using pre-loaded entities.
 * Zero DB calls — suitable for processing thousands of rows concurrently.
 */
export function resolveMetaAttributionInMemory(
  entities: PreloadedMetaEntities,
  args: {
    utmSource: string;
    utmContent: string;
    utmCampaign: string;
  }
): MetaAttributionResult {
  const { utmSource, utmContent, utmCampaign } = args;

  // Path 1: utm_source is a numeric Meta ad ID.
  if (looksLikeMetaId(utmSource)) {
    const adRow = entities.adsById.get(utmSource.trim());
    if (adRow !== undefined) {
      return {
        meta_ad_id: utmSource.trim(),
        meta_adset_id: adRow.adset_id,
        meta_campaign_id: adRow.campaign_id,
        method: "ad_id",
      };
    }
  }

  // Path 2: name-match against pre-loaded adsets.
  return findBestAdsetMatch(entities.adsets, utmContent, utmCampaign);
}

/**
 * Pre-loads all Meta adsets and ads for a project's linked ad accounts.
 * Call once per import job and pass the result to `resolveMetaAttributionInMemory`.
 */
export async function preloadMetaEntitiesForProject(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<PreloadedMetaEntities> {
  const accountIds = await loadIntegrationAccountIdsForProject(supabase, projectId);

  if (accountIds.length === 0) {
    return { adsets: [], adsById: new Map() };
  }

  const [adsetsResult, adsResult] = await Promise.all([
    supabase
      .from("meta_adsets")
      .select("id, name, campaign_id")
      .in("integration_account_id", accountIds),
    supabase
      .from("meta_ads")
      .select("id, adset_id, campaign_id")
      .in("integration_account_id", accountIds),
  ]);

  const adsets = adsetsResult.data ?? [];
  const adsById = new Map(
    (adsResult.data ?? []).map((ad) => [
      ad.id,
      { adset_id: ad.adset_id, campaign_id: ad.campaign_id },
    ])
  );

  return { adsets, adsById };
}

// ---------------------------------------------------------------------------
// DB-backed resolution (for single-event paths like the GHL webhook)
// ---------------------------------------------------------------------------

/**
 * Resolves via the ad_id path: looks up utm_source as a Meta ad ID in the DB.
 */
async function resolveByAdId(
  supabase: SupabaseClient<Database>,
  utmSource: string,
  integrationAccountIds: string[]
): Promise<MetaAttributionResult> {
  const adId = utmSource.trim();
  if (integrationAccountIds.length === 0) return EMPTY_RESULT;

  const { data, error } = await supabase
    .from("meta_ads")
    .select("id, adset_id, campaign_id")
    .eq("id", adId)
    .in("integration_account_id", integrationAccountIds)
    .maybeSingle();

  if (error !== null || data === null) return EMPTY_RESULT;

  return {
    meta_ad_id: data.id,
    meta_adset_id: data.adset_id,
    meta_campaign_id: data.campaign_id,
    method: "ad_id",
  };
}

/**
 * Resolves via the name_match path: fetches candidates from DB then filters in memory.
 */
async function resolveByNameMatch(
  supabase: SupabaseClient<Database>,
  utmContent: string,
  utmCampaign: string,
  integrationAccountIds: string[]
): Promise<MetaAttributionResult> {
  const content = utmContent.trim();
  const campaign = utmCampaign.trim();

  if (content === "" || campaign === "" || integrationAccountIds.length === 0) {
    return EMPTY_RESULT;
  }

  const { prefix } = decomposeUtmContent(content);
  if (prefix === "") return EMPTY_RESULT;

  const { data, error } = await supabase
    .from("meta_adsets")
    .select("id, name, campaign_id")
    .in("integration_account_id", integrationAccountIds)
    .ilike("name", `%${prefix}%`);

  if (error !== null || data === null || data.length === 0) return EMPTY_RESULT;

  return findBestAdsetMatch(data, utmContent, utmCampaign);
}

/**
 * Main DB-backed entry point. Resolves UTM parameters to Meta entity IDs.
 * For bulk imports, prefer `preloadMetaEntitiesForProject` + `resolveMetaAttributionInMemory`.
 */
export async function resolveMetaAttributionFromUtm(
  supabase: SupabaseClient<Database>,
  args: {
    utmSource: string;
    utmContent: string;
    utmCampaign: string;
    integrationAccountIds: string[];
  }
): Promise<MetaAttributionResult> {
  const { utmSource, utmContent, utmCampaign, integrationAccountIds } = args;

  if (looksLikeMetaId(utmSource)) {
    const result = await resolveByAdId(supabase, utmSource, integrationAccountIds);
    if (result.meta_adset_id !== null) return result;
  }

  return resolveByNameMatch(supabase, utmContent, utmCampaign, integrationAccountIds);
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

/**
 * Loads the integration_account_ids linked to a project via
 * project_meta_ad_accounts. Returns an empty array when none are linked.
 */
export async function loadIntegrationAccountIdsForProject(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("project_meta_ad_accounts")
    .select("integration_account_id")
    .eq("project_id", projectId);

  if (error !== null || data === null) return [];
  return data.map((r) => r.integration_account_id);
}

