/**
 * One-shot: set ghl_contacts.webinar_run_id for all contacts in a GHL location.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-webinar-runs.mjs
 *   node --env-file=.env scripts/backfill-webinar-runs.mjs --project-id=<uuid>
 *   node --env-file=.env scripts/backfill-webinar-runs.mjs --connection-id=<uuid>
 *
 * Requires: migrations 006 + 007 + 010 (for --project-id / --connection-id), SUPABASE_*
 * Env: GHL_LOCATION_ID OR (--project-id|--connection-id + GHL_CONNECTION_TOKEN_ENCRYPTION_KEY)
 */
import { createClient } from "@supabase/supabase-js";
import { loadGhlCredentialsFromDb } from "./lib/load-ghl-credentials-from-db.mjs";

function requireEnv(name, value) {
  if (value === undefined || value === "") {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function parseArgs() {
  /** @type {{ connectionId: string; projectId: string }} */
  const out = { connectionId: "", projectId: "" };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--connection-id=")) {
      out.connectionId = a.slice("--connection-id=".length);
    } else if (a.startsWith("--project-id=")) {
      out.projectId = a.slice("--project-id=".length);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const url = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL);
  const key = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const supabase = createClient(url, key);

  const useDbConn =
    args.connectionId.trim() !== "" || args.projectId.trim() !== "";
  let locationId;
  if (useDbConn) {
    const encRaw = requireEnv(
      "GHL_CONNECTION_TOKEN_ENCRYPTION_KEY",
      process.env.GHL_CONNECTION_TOKEN_ENCRYPTION_KEY
    );
    const creds = await loadGhlCredentialsFromDb(
      supabase,
      { connectionId: args.connectionId, projectId: args.projectId },
      encRaw
    );
    locationId = creds.locationId;
  } else {
    locationId = requireEnv(
      "GHL_LOCATION_ID",
      process.env.GHL_LOCATION_ID
    );
  }

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
