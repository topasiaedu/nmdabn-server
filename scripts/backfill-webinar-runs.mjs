/**
 * One-shot: set ghl_contacts.webinar_run_id for all contacts in GHL_LOCATION_ID.
 *
 * Usage: node --env-file=.env scripts/backfill-webinar-runs.mjs
 *
 * Requires: migrations 006 + 007, SUPABASE_*, GHL_LOCATION_ID
 */
import { createClient } from "@supabase/supabase-js";

function requireEnv(name, value) {
  if (value === undefined || value === "") {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const url = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL);
  const key = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const locationId = requireEnv(
    "GHL_LOCATION_ID",
    process.env.GHL_LOCATION_ID
  );

  const supabase = createClient(url, key);
  const { data, error } = await supabase.rpc(
    "backfill_webinar_runs_for_location",
    { p_location_id: locationId }
  );

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Updated rows: ${data ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
