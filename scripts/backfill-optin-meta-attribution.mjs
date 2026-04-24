/**
 * Backfill Meta entity IDs (meta_adset_id, meta_campaign_id, meta_ad_id) on
 * existing journey_events rows that have event_type = 'optin' but no
 * meta_adset_id yet.
 *
 * Two resolution paths (mirrors optin-meta-attribution.ts):
 *   1. "ad_id"     — payload.utm_source is a numeric Meta ad ID.
 *   2. "name_match"— payload.utm_content + payload.utm_campaign are matched
 *                    against meta_adsets.name using the marketer's naming
 *                    convention.
 *
 * Usage (dry run — shows matches without writing):
 *   node --env-file=.env scripts/backfill-optin-meta-attribution.mjs \
 *     --project-id=<UUID>
 *
 * Apply changes:
 *   node --env-file=.env scripts/backfill-optin-meta-attribution.mjs \
 *     --project-id=<UUID> --apply
 *
 * Target only a recent date range (faster — skips old history):
 *   node --env-file=.env scripts/backfill-optin-meta-attribution.mjs \
 *     --project-id=<UUID> --from-date=2026-04-24 --apply
 *
 * Also upgrade rows that were name-matched but have a numeric utm_source
 * (populates meta_ad_id for more precise ad-level attribution):
 *   node --env-file=.env scripts/backfill-optin-meta-attribution.mjs \
 *     --project-id=<UUID> --upgrade-ad-id --apply
 *
 * Options:
 *   --project-id=UUID   Required. The project whose journey_events to process.
 *   --apply             Write updates to Supabase (default: dry run).
 *   --from-date=DATE    Only process rows with occurred_at >= DATE (YYYY-MM-DD, KL time).
 *   --upgrade-ad-id     Also re-process name_match rows whose utm_source is a numeric
 *                       Meta ad ID, upgrading them to ad_id attribution.
 *   --batch-size=N      journey_events rows per SELECT page (default 500).
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const PROJECT_ID = /** @type {string | undefined} */ (args["project-id"]);
const APPLY = args["apply"] === true || args["apply"] === "true";
const BATCH_SIZE = parseInt(String(args["batch-size"] ?? "500"), 10);
/**
 * Optional ISO date (YYYY-MM-DD). When set, only rows on or after this date
 * (in KL time, UTC+8) are processed. Useful for targeting a specific import
 * batch without waiting through the entire history.
 *
 * Example: --from-date=2026-04-24
 */
const FROM_DATE = /** @type {string | undefined} */ (args["from-date"]);
/**
 * When set, also re-processes rows that already have a meta_adset_id resolved
 * via name_match but have no meta_ad_id yet AND whose utm_source is a numeric
 * Meta ad ID. This upgrades those rows to the more precise ad_id attribution
 * method and populates meta_ad_id.
 *
 * Example: --upgrade-ad-id
 */
const UPGRADE_AD_ID = args["upgrade-ad-id"] === true || args["upgrade-ad-id"] === "true";

if (!PROJECT_ID) {
  console.error("Error: --project-id=UUID is required.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Load Meta integration account IDs for the project
// ---------------------------------------------------------------------------

async function loadIntegrationAccountIds() {
  const { data, error } = await supabase
    .from("project_meta_ad_accounts")
    .select("integration_account_id")
    .eq("project_id", PROJECT_ID);

  if (error) throw new Error(`Failed to load integration accounts: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`No Meta ad accounts linked to project ${PROJECT_ID}.`);
  }
  return data.map((r) => r.integration_account_id);
}

// ---------------------------------------------------------------------------
// Load all meta_adsets for the project (cached once)
// ---------------------------------------------------------------------------

async function loadMetaAdsets(integrationAccountIds) {
  const { data, error } = await supabase
    .from("meta_adsets")
    .select("id, name, campaign_id")
    .in("integration_account_id", integrationAccountIds);

  if (error) throw new Error(`Failed to load meta_adsets: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Load all meta_ads for the project (for ad_id path)
// ---------------------------------------------------------------------------

async function loadMetaAds(integrationAccountIds) {
  const { data, error } = await supabase
    .from("meta_ads")
    .select("id, adset_id, campaign_id")
    .in("integration_account_id", integrationAccountIds);

  if (error) throw new Error(`Failed to load meta_ads: ${error.message}`);
  // Build a quick lookup map: ad_id → { adset_id, campaign_id }
  /** @type {Map<string, {adset_id: string, campaign_id: string}>} */
  const map = new Map();
  for (const ad of data ?? []) {
    map.set(ad.id, { adset_id: ad.adset_id, campaign_id: ad.campaign_id });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Resolution helpers (mirrors optin-meta-attribution.ts)
// ---------------------------------------------------------------------------

/** @param {string} value */
function looksLikeMetaId(value) {
  return /^\d{10,20}$/.test((value ?? "").trim());
}

/**
 * @param {string} utmContent
 * @returns {{ prefix: string; country: string | null }}
 */
function decomposeUtmContent(utmContent) {
  let raw = (utmContent ?? "").trim();
  if (raw === "") return { prefix: "", country: null };

  // Legacy UTMs used dashes: "GT1-Apple-MY". Normalise to underscores.
  if (!raw.includes("_") && raw.includes("-")) {
    raw = raw.replace(/-/g, "_");
  }

  const parts = raw.split("_");
  if (parts.length < 2) return { prefix: raw, country: null };
  const last = parts[parts.length - 1];
  // Accept 2-3 letter codes joined by "&" e.g. "MY", "SG", "MY&SG".
  if (/^[A-Z]{2,3}([&][A-Z]{2,3})*$/.test(last)) {
    return { prefix: parts.slice(0, -1).join("_"), country: last };
  }
  return { prefix: raw, country: null };
}

/**
 * @param {string} utmContent
 * @param {string} utmCampaign
 * @param {Array<{id: string, name: string, campaign_id: string}>} adsets
 * @returns {{ meta_adset_id: string, meta_campaign_id: string } | null}
 */
function matchAdsetByName(utmContent, utmCampaign, adsets) {
  const content = (utmContent ?? "").trim();
  const campaign = (utmCampaign ?? "").trim();
  if (content === "" || campaign === "") return null;

  const { prefix, country } = decomposeUtmContent(content);
  if (prefix === "") return null;

  const campaignLower = campaign.toLowerCase();

  /**
   * Returns true when the adset name satisfies the country filter.
   * Combined codes e.g. "MY&SG" match if the name includes ANY individual code.
   * @param {string} nameLower
   */
  function matchesCountry(nameLower) {
    if (country === null) return true;
    if (country.includes("&")) {
      return country.split("&").some((c) => nameLower.includes(c.toLowerCase()));
    }
    return nameLower.includes(country.toLowerCase());
  }

  /**
   * Filters adsets containing prefix + angle + country.
   * @param {string} searchPrefix
   */
  function filterCandidates(searchPrefix) {
    const pfxLower = searchPrefix.toLowerCase();
    return adsets.filter((adset) => {
      const nameLower = (adset.name ?? "").toLowerCase();
      return (
        nameLower.includes(pfxLower) &&
        nameLower.includes(campaignLower) &&
        matchesCountry(nameLower)
      );
    });
  }

  // Try progressively shorter prefixes until we find candidates or exhaust options.
  // Stop at 2 segments minimum — single-segment prefixes are too broad.
  let candidates = filterCandidates(prefix);
  let shortenedPrefix = prefix;

  while (candidates.length === 0) {
    const lastUnderscore = shortenedPrefix.lastIndexOf("_");
    if (lastUnderscore <= 0) break;
    const newPrefix = shortenedPrefix.slice(0, lastUnderscore);
    // Stop once down to a single-segment prefix (no underscore left).
    if (!newPrefix.includes("_")) break;
    shortenedPrefix = newPrefix;
    candidates = filterCandidates(shortenedPrefix);
  }

  if (candidates.length === 0) return null;

  // Prefer exact angle boundary match e.g. "_insulinresistance " or "_insulinresistance ("
  candidates.sort((a, b) => {
    const aName = (a.name ?? "").toLowerCase();
    const bName = (b.name ?? "").toLowerCase();
    const aExact =
      aName.includes(`_${campaignLower} `) ||
      aName.includes(`_${campaignLower}(`);
    const bExact =
      bName.includes(`_${campaignLower} `) ||
      bName.includes(`_${campaignLower}(`);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    const nameCmp = aName.localeCompare(bName);
    if (nameCmp !== 0) return nameCmp;
    // Tiebreak: prefer the larger (newer) adset ID — newer adsets are active.
    return b.id.localeCompare(a.id);
  });

  const best = candidates[0];
  return { meta_adset_id: best.id, meta_campaign_id: best.campaign_id };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Backfill Meta Attribution for journey_events ===`);
  console.log(`Project      : ${PROJECT_ID}`);
  console.log(`Mode         : ${APPLY ? "APPLY (writes to DB)" : "DRY RUN (no writes)"}`);
  console.log(`Batch        : ${BATCH_SIZE} rows per page`);
  if (FROM_DATE) console.log(`From date    : ${FROM_DATE} (KL time, UTC+8)`);
  console.log(`Upgrade ad_id: ${UPGRADE_AD_ID ? "yes — also upgrades name_match rows whose utm_source is a numeric ad ID" : "no"}\n`);

  const integrationAccountIds = await loadIntegrationAccountIds();
  console.log(`Linked Meta accounts: ${integrationAccountIds.join(", ")}\n`);

  const [adsets, adsMap] = await Promise.all([
    loadMetaAdsets(integrationAccountIds),
    loadMetaAds(integrationAccountIds),
  ]);
  console.log(`Loaded ${adsets.length} adsets and ${adsMap.size} ads.\n`);

  // Counts
  let totalProcessed = 0;
  let matched = 0;
  let upgraded = 0;
  let unmatched = 0;
  let skippedAlreadySet = 0;
  let errors = 0;

  /** @type {Array<{id: string, occurred_at: string, utm_content: string, utm_campaign: string, utm_source: string, adset_name: string, method: string, was_upgrade: boolean}>} */
  const matchLog = [];
  /** @type {Array<{id: string, utm_content: string, utm_campaign: string, utm_source: string}>} */
  const unmatchedLog = [];

  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * BATCH_SIZE;
    const to = from + BATCH_SIZE - 1;

    // Cover both CSV imports ("manual") and GHL webhook opt-ins ("ghl_webhook").
    let query = supabase
      .from("journey_events")
      .select("id, occurred_at, meta_adset_id, meta_ad_id, payload")
      .eq("project_id", PROJECT_ID)
      .eq("event_type", "optin")
      .in("source_system", ["manual", "ghl_webhook"])
      .range(from, to)
      .order("occurred_at", { ascending: true });

    // Optional date filter: only process rows from this date onward (KL time).
    if (FROM_DATE) {
      query = query.gte("occurred_at", `${FROM_DATE}T00:00:00+08:00`);
    }

    const { data: events, error } = await query;

    if (error) throw new Error(`Failed to fetch journey_events: ${error.message}`);
    if (!events || events.length === 0) { hasMore = false; break; }

    for (const ev of events) {
      totalProcessed += 1;

      const alreadyHasAdset = ev.meta_adset_id !== null && ev.meta_adset_id !== undefined;
      const alreadyHasAdId = ev.meta_ad_id !== null && ev.meta_ad_id !== undefined;

      const payload = ev.payload ?? {};
      const utmSource = String(payload["utm_source"] ?? "").trim();

      // Determine whether to process this row:
      //   - Unattributed rows (meta_adset_id IS NULL) are always processed.
      //   - Rows with adset but no ad_id are processed only when --upgrade-ad-id
      //     is set AND utm_source looks like a numeric Meta ID.
      const isUpgradeCandidate =
        UPGRADE_AD_ID && alreadyHasAdset && !alreadyHasAdId && looksLikeMetaId(utmSource);

      if (alreadyHasAdset && !isUpgradeCandidate) {
        skippedAlreadySet += 1;
        continue;
      }

      const utmContent = String(payload["utm_content"] ?? "").trim();
      const utmCampaign = String(payload["utm_campaign"] ?? "").trim();

      let resolution = null;
      let method = null;

      // Path 1: utm_source is a numeric Meta ad ID — resolve via adsMap.
      if (looksLikeMetaId(utmSource)) {
        const adRow = adsMap.get(utmSource);
        if (adRow) {
          resolution = {
            meta_ad_id: utmSource,
            meta_adset_id: adRow.adset_id,
            meta_campaign_id: adRow.campaign_id,
          };
          method = "ad_id";
        }
      }

      // Path 2: name-match using utm_content + utm_campaign against adset names.
      if (resolution === null) {
        const nameResult = matchAdsetByName(utmContent, utmCampaign, adsets);
        if (nameResult !== null) {
          resolution = {
            meta_ad_id: null,
            meta_adset_id: nameResult.meta_adset_id,
            meta_campaign_id: nameResult.meta_campaign_id,
          };
          method = "name_match";
        }
      }

      if (resolution !== null) {
        if (isUpgradeCandidate) {
          upgraded += 1;
        } else {
          matched += 1;
        }

        const adsetName =
          adsets.find((a) => a.id === resolution.meta_adset_id)?.name ?? resolution.meta_adset_id;

        matchLog.push({
          id: ev.id,
          occurred_at: ev.occurred_at,
          utm_content: utmContent || "(empty)",
          utm_campaign: utmCampaign || "(empty)",
          utm_source: utmSource || "(empty)",
          adset_name: adsetName,
          method,
          was_upgrade: isUpgradeCandidate,
        });

        if (APPLY) {
          const { error: updErr } = await supabase
            .from("journey_events")
            .update({
              meta_adset_id: resolution.meta_adset_id,
              meta_campaign_id: resolution.meta_campaign_id,
              meta_ad_id: resolution.meta_ad_id,
              meta_attribution_method: method,
            })
            .eq("id", ev.id);

          if (updErr) {
            console.error(`  ERROR updating ${ev.id}: ${updErr.message}`);
            errors += 1;
          }
        }
      } else {
        unmatched += 1;
        unmatchedLog.push({
          id: ev.id,
          utm_content: utmContent || "(empty)",
          utm_campaign: utmCampaign || "(empty)",
          utm_source: utmSource || "(empty)",
        });
      }
    }

    page += 1;
    if (events.length < BATCH_SIZE) hasMore = false;
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  console.log("\n--- MATCHED (newly attributed) ---");
  if (matchLog.filter((m) => !m.was_upgrade).length === 0) {
    console.log("  (none)");
  } else {
    /** @type {Map<string, number>} */
    const byAdset = new Map();
    for (const m of matchLog.filter((m) => !m.was_upgrade)) {
      byAdset.set(m.adset_name, (byAdset.get(m.adset_name) ?? 0) + 1);
    }
    for (const [name, count] of [...byAdset.entries()].sort()) {
      console.log(`  [${count.toString().padStart(4)}]  ${name}`);
    }
  }

  if (UPGRADE_AD_ID) {
    console.log("\n--- UPGRADED (name_match → ad_id) ---");
    if (matchLog.filter((m) => m.was_upgrade).length === 0) {
      console.log("  (none)");
    } else {
      /** @type {Map<string, number>} */
      const byAdset = new Map();
      for (const m of matchLog.filter((m) => m.was_upgrade)) {
        byAdset.set(m.adset_name, (byAdset.get(m.adset_name) ?? 0) + 1);
      }
      for (const [name, count] of [...byAdset.entries()].sort()) {
        console.log(`  [${count.toString().padStart(4)}]  ${name}`);
      }
    }
  }

  if (unmatchedLog.length > 0) {
    console.log("\n--- UNMATCHED (review these manually) ---");
    /** @type {Map<string, number>} */
    const byUtm = new Map();
    for (const u of unmatchedLog) {
      const key = `utm_content="${u.utm_content}"  utm_campaign="${u.utm_campaign}"  utm_source="${u.utm_source}"`;
      byUtm.set(key, (byUtm.get(key) ?? 0) + 1);
    }
    for (const [key, count] of [...byUtm.entries()].sort()) {
      console.log(`  [${count.toString().padStart(4)}]  ${key}`);
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`  Total processed    : ${totalProcessed}`);
  console.log(`  Already had meta   : ${skippedAlreadySet}`);
  console.log(`  Newly matched      : ${matched}`);
  if (UPGRADE_AD_ID) console.log(`  Upgraded to ad_id  : ${upgraded}`);
  console.log(`  Unmatched          : ${unmatched}`);
  if (errors > 0) console.log(`  DB update errors   : ${errors}`);

  const totalWrites = matched + upgraded;
  if (!APPLY && totalWrites > 0) {
    console.log(`\nDry run complete. Re-run with --apply to write ${totalWrites} update(s) to the database.`);
  } else if (APPLY) {
    console.log(`\nDone. ${totalWrites - errors} event(s) updated.`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
