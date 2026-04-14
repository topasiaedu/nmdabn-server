/**
 * Loads decrypted GHL credentials from `ghl_connections` (migration 010).
 * Requires `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY` when using DB-backed auth.
 */
import {
  decryptGhlConnectionToken,
  parseGhlConnectionTokenEncryptionKey,
} from "./ghl-connection-token-crypto.mjs";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ connectionId: string, projectId: string }} opts - Exactly one id must be non-empty.
 * @param {string} encryptionKeyRaw
 * @returns {Promise<{ ghlToken: string, locationId: string }>}
 */
export async function loadGhlCredentialsFromDb(supabase, opts, encryptionKeyRaw) {
  const key = parseGhlConnectionTokenEncryptionKey(encryptionKeyRaw);
  const connectionId = opts.connectionId.trim();
  const projectId = opts.projectId.trim();
  if (connectionId !== "" && projectId !== "") {
    throw new Error("Use only one of --connection-id or --project-id");
  }
  if (connectionId === "" && projectId === "") {
    throw new Error("loadGhlCredentialsFromDb: pass connectionId or projectId");
  }

  if (connectionId !== "") {
    const { data, error } = await supabase
      .from("ghl_connections")
      .select(
        "ghl_location_id, private_integration_token_encrypted, is_active"
      )
      .eq("id", connectionId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data === null) {
      throw new Error(`ghl_connections row not found: ${connectionId}`);
    }
    if (data.is_active !== true) {
      throw new Error(`ghl_connections ${connectionId} is inactive`);
    }
    const ghlToken = decryptGhlConnectionToken(
      data.private_integration_token_encrypted,
      key
    );
    return { ghlToken, locationId: data.ghl_location_id };
  }

  const { data: rows, error: listErr } = await supabase
    .from("ghl_connections")
    .select(
      "ghl_location_id, private_integration_token_encrypted, is_active"
    )
    .eq("project_id", projectId)
    .eq("is_active", true);
  if (listErr) {
    throw new Error(listErr.message);
  }
  if (rows === null || rows.length === 0) {
    throw new Error(
      `No active ghl_connections for project_id=${projectId}`
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `Multiple active ghl_connections for project_id=${projectId}; pass --connection-id=<uuid>`
    );
  }
  const row = rows[0];
  const ghlToken = decryptGhlConnectionToken(
    row.private_integration_token_encrypted,
    key
  );
  return { ghlToken, locationId: row.ghl_location_id };
}
