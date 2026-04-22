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
 * Options:
 *   --project-id=UUID   Required. The project whose journey_events to process.
 *   --apply             Write updates to Supabase (default: dry run).
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
  const raw = (utmContent ?? "").trim();
  if (raw === "") return { prefix: "", country: null };
  const parts = raw.split("_");
  if (parts.length < 2) return { prefix: raw, country: null };
  const last = parts[parts.length - 1];
  if (/^[A-Z]{2,3}$/.test(last)) {
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

  const prefixLower = prefix.toLowerCase();
  const campaignLower = campaign.toLowerCase();

  const candidates = adsets.filter((adset) => {
    const nameLower = (adset.name ?? "").toLowerCase();
    const hasPrefix = nameLower.includes(prefixLower);
    const hasAngle = nameLower.includes(campaignLower);
    const hasCountry =
      country === null ||
      nameLower.includes(`(${country.toLowerCase()})`);
    return hasPrefix && hasAngle && hasCountry;
  });

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
    return aName.localeCompare(bName);
  });

  const best = candidates[0];
  return { meta_adset_id: best.id, meta_campaign_id: best.campaign_id };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Backfill Meta Attribution for journey_events ===`);
  console.log(`Project  : ${PROJECT_ID}`);
  console.log(`Mode     : ${APPLY ? "APPLY (writes to DB)" : "DRY RUN (no writes)"}`);
  console.log(`Batch    : ${BATCH_SIZE} rows per page\n`);

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
  let unmatched = 0;
  let skippedAlreadySet = 0;
  let errors = 0;

  /** @type {Array<{id: string, occurred_at: string, utm_content: string, utm_campaign: string, utm_source: string, adset_name: string, method: string}>} */
  const matchLog = [];
  /** @type {Array<{id: string, utm_content: string, utm_campaign: string, utm_source: string}>} */
  const unmatchedLog = [];

  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * BATCH_SIZE;
    const to = from + BATCH_SIZE - 1;

    const { data: events, error } = await supabase
      .from("journey_events")
      .select("id, occurred_at, meta_adset_id, payload")
      .eq("project_id", PROJECT_ID)
      .eq("event_type", "optin")
      .eq("source_system", "manual")
      .range(from, to)
      .order("occurred_at", { ascending: true });

    if (error) throw new Error(`Failed to fetch journey_events: ${error.message}`);
    if (!events || events.length === 0) { hasMore = false; break; }

    for (const ev of events) {
      totalProcessed += 1;

      // Skip rows that already have a resolution.
      if (ev.meta_adset_id !== null && ev.meta_adset_id !== undefined) {
        skippedAlreadySet += 1;
        continue;
      }

      const payload = ev.payload ?? {};
      const utmSource = String(payload["utm_source"] ?? "").trim();
      const utmContent = String(payload["utm_content"] ?? "").trim();
      const utmCampaign = String(payload["utm_campaign"] ?? "").trim();

      let resolution = null;
      let method = null;

      // Path 1: ad_id
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

      // Path 2: name_match
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
        matched += 1;
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

  console.log("\n--- MATCHED ---");
  if (matchLog.length === 0) {
    console.log("  (none)");
  } else {
    // Group by adset for readability
    /** @type {Map<string, number>} */
    const byAdset = new Map();
    for (const m of matchLog) {
      byAdset.set(m.adset_name, (byAdset.get(m.adset_name) ?? 0) + 1);
    }
    for (const [name, count] of [...byAdset.entries()].sort()) {
      console.log(`  [${count.toString().padStart(4)}]  ${name}`);
    }
  }

  if (unmatchedLog.length > 0) {
    console.log("\n--- UNMATCHED (review these manually) ---");
    // Group by (utm_content, utm_campaign)
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
  console.log(`  Total processed   : ${totalProcessed}`);
  console.log(`  Already had meta  : ${skippedAlreadySet}`);
  console.log(`  Matched           : ${matched}`);
  console.log(`  Unmatched         : ${unmatched}`);
  if (errors > 0) console.log(`  DB update errors  : ${errors}`);

  if (!APPLY && matched > 0) {
    console.log(`\nDry run complete. Re-run with --apply to write ${matched} update(s) to the database.`);
  } else if (APPLY) {
    console.log(`\nDone. ${matched - errors} event(s) updated.`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
