import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import {
  decryptGhlConnectionToken,
  loadGhlConnectionTokenEncryptionKeyFromEnv,
} from "./ghl-connection-token-crypto";

/** Minimal shape for single-location env fallback (`env.ghl`). */
export interface GhlEnvCredentials {
  privateIntegrationToken: string;
  locationId: string;
}

export interface GhlWebhookCredentials {
  privateIntegrationToken: string;
  locationId: string;
}

export type ResolveGhlWebhookCredentialsResult =
  | {
      ok: true;
      credentials: GhlWebhookCredentials;
      usedEnvFallback: boolean;
    }
  | { ok: false; skipReason: string };

/**
 * Resolves GHL API credentials for a webhook event: DB row by `locationId` first, then env fallback.
 */
export async function resolveGhlWebhookCredentials(
  supabase: SupabaseClient<Database>,
  payloadLocationId: string | null,
  envGhl: GhlEnvCredentials | undefined
): Promise<ResolveGhlWebhookCredentialsResult> {
  if (payloadLocationId !== null && payloadLocationId !== "") {
    const { data: row, error } = await supabase
      .from("ghl_connections")
      .select(
        "id, ghl_location_id, private_integration_token_encrypted, is_active"
      )
      .eq("ghl_location_id", payloadLocationId)
      .eq("is_active", true)
      .maybeSingle();

    if (error !== null) {
      console.error("ghl_connections lookup failed:", error.message);
      return { ok: false, skipReason: "connection_lookup_failed" };
    }

    if (row !== null) {
      let key;
      try {
        key = loadGhlConnectionTokenEncryptionKeyFromEnv();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "key load error";
        console.error("GHL connection decrypt: missing key:", msg);
        return { ok: false, skipReason: "decrypt_key_missing" };
      }
      try {
        const privateIntegrationToken = decryptGhlConnectionToken(
          row.private_integration_token_encrypted,
          key
        );
        return {
          ok: true,
          credentials: {
            privateIntegrationToken,
            locationId: row.ghl_location_id,
          },
          usedEnvFallback: false,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "decrypt error";
        console.error(
          `ghl_connections decrypt failed for location ${payloadLocationId}:`,
          msg
        );
        return { ok: false, skipReason: "decrypt_failed" };
      }
    }

    if (
      envGhl !== undefined &&
      payloadLocationId === envGhl.locationId
    ) {
      console.warn(
        "GHL webhook: using env credential fallback (no ghl_connections row for location; matched GHL_LOCATION_ID)"
      );
      return {
        ok: true,
        credentials: {
          privateIntegrationToken: envGhl.privateIntegrationToken,
          locationId: envGhl.locationId,
        },
        usedEnvFallback: true,
      };
    }

    return { ok: false, skipReason: "unknown_location" };
  }

  if (envGhl !== undefined) {
    console.warn(
      "GHL webhook: payload had no locationId; using env GHL_PRIVATE_INTEGRATION_TOKEN / GHL_LOCATION_ID fallback"
    );
    return {
      ok: true,
      credentials: {
        privateIntegrationToken: envGhl.privateIntegrationToken,
        locationId: envGhl.locationId,
      },
      usedEnvFallback: true,
    };
  }

  return { ok: false, skipReason: "unknown_location" };
}
