import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import {
  decryptGhlConnectionToken,
  loadGhlConnectionTokenEncryptionKeyFromEnv,
} from "@/services/ghl-connection-token-crypto";
import type { GhlWebhookCredentials } from "@/services/ghl-connection-resolve";

/**
 * Loads decrypted GHL API token + location for a project's active ghl_connections row.
 */
export async function loadGhlCredentialsForProject(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<GhlWebhookCredentials | { error: string }> {
  const { data: rows, error } = await supabase
    .from("ghl_connections")
    .select("ghl_location_id, private_integration_token_encrypted, is_active")
    .eq("project_id", projectId)
    .eq("is_active", true);

  if (error !== null) {
    return { error: error.message };
  }
  if (rows === null || rows.length === 0) {
    return { error: "No active GHL connection for this project" };
  }
  if (rows.length > 1) {
    return {
      error:
        "Multiple active GHL connections for this project; keep only one active connection",
    };
  }

  let key;
  try {
    key = loadGhlConnectionTokenEncryptionKeyFromEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "missing encryption key";
    return { error: `GHL token decrypt: ${msg}` };
  }

  try {
    const privateIntegrationToken = decryptGhlConnectionToken(
      rows[0].private_integration_token_encrypted,
      key
    );
    return {
      privateIntegrationToken,
      locationId: rows[0].ghl_location_id,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "decrypt failed";
    return { error: msg };
  }
}
