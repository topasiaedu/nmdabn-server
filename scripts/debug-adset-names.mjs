/**
 * Diagnostic: list all meta_adsets for a project and show how each adset name
 * maps to the marketer's UTM content naming convention.
 *
 * Usage:
 *   node --env-file=.env.local scripts/debug-adset-names.mjs --project-id=<UUID>
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const projectId = process.argv.find((a) => a.startsWith("--project-id="))?.split("=")[1];
if (!projectId) {
  console.error("Usage: node --env-file=.env.local scripts/debug-adset-names.mjs --project-id=<UUID>");
  process.exit(1);
}

// Load integration account IDs for the project.
const { data: accounts } = await supabase
  .from("project_meta_ad_accounts")
  .select("integration_account_id")
  .eq("project_id", projectId);

const accountIds = (accounts ?? []).map((r) => r.integration_account_id);
console.log(`\nIntegration account IDs: ${accountIds.join(", ") || "(none)"}`);

// Load all adsets.
const { data: adsets, error } = await supabase
  .from("meta_adsets")
  .select("id, name, campaign_id")
  .in("integration_account_id", accountIds)
  .order("name");

if (error) {
  console.error("Error fetching adsets:", error.message);
  process.exit(1);
}

console.log(`\nFound ${adsets.length} adsets:\n`);
console.log("ADSET NAME".padEnd(70) + "CAMPAIGN_ID");
console.log("-".repeat(100));
for (const a of adsets) {
  console.log((a.name ?? "(null)").padEnd(70) + a.campaign_id);
}

// Also show which UTM content values from journey_events are failing to match.
console.log("\n--- Unmatched journey_events (optin, no meta_adset_id) ---\n");

const { data: unmatched } = await supabase
  .from("journey_events")
  .select("id, occurred_at, payload")
  .eq("project_id", projectId)
  .eq("event_type", "optin")
  .is("meta_adset_id", null)
  .order("occurred_at", { ascending: false })
  .limit(50);

const seen = new Set();
for (const row of unmatched ?? []) {
  const payload = row.payload ?? {};
  const utmContent  = payload.utm_content  ?? "";
  const utmCampaign = payload.utm_campaign ?? "";
  const utmSource   = payload.utm_source   ?? "";
  const key = `${utmContent}|${utmCampaign}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`utm_content="${utmContent}"  utm_campaign="${utmCampaign}"  utm_source="${utmSource}"`);
}
console.log(`\n(${seen.size} distinct unmatched UTM combinations in last 50 rows)`);
