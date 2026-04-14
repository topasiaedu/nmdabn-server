import { type NextRequest, NextResponse } from "next/server";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS } from "@/lib/integration-accounts-api";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { supabase } from "@/config/supabase";
import {
  encryptGhlConnectionToken,
  loadGhlConnectionTokenEncryptionKeyFromEnv,
} from "@/services/ghl-connection-token-crypto";
import { exchangeZoomAccountCredentials } from "@/services/zoom-token";

export const runtime = "nodejs";

/**
 * POST /api/integrations/accounts/zoom — create Zoom integration account.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonObjectBody(request);
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: parsed.status }
    );
  }

  const session = await requireAuthAndWorkspace(request, parsed.body);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const display_name = parsed.body.display_name;
  const client_id = parsed.body.client_id;
  const client_secret = parsed.body.client_secret;
  const account_id = parsed.body.account_id;
  const is_default = parsed.body.is_default;

  try {
    if (
      typeof client_id !== "string" ||
      client_id === "" ||
      typeof client_secret !== "string" ||
      client_secret === "" ||
      typeof account_id !== "string" ||
      account_id === ""
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "client_id, client_secret, and account_id are required",
        },
        { status: 400 }
      );
    }

    try {
      await exchangeZoomAccountCredentials({
        clientId: client_id,
        clientSecretPlaintext: client_secret,
        accountId: account_id,
      });
    } catch (err) {
      const zoomMsg = err instanceof Error ? err.message : "token exchange failed";
      return NextResponse.json(
        {
          success: false,
          error: `Zoom credentials rejected: ${zoomMsg}`,
        },
        { status: 400 }
      );
    }

    let client_secret_encrypted: string;
    try {
      const key = loadGhlConnectionTokenEncryptionKeyFromEnv();
      client_secret_encrypted = encryptGhlConnectionToken(client_secret, key);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Encryption key not available";
      console.error("Zoom account encrypt:", message);
      return NextResponse.json(
        {
          success: false,
          error:
            "Server encryption is not configured (missing or invalid GHL_CONNECTION_TOKEN_ENCRYPTION_KEY)",
        },
        { status: 503 }
      );
    }

    const defaultFlag = is_default === true;

    if (defaultFlag) {
      await supabase
        .from("integration_accounts")
        .update({ is_default: false })
        .eq("workspace_id", session.workspaceId)
        .eq("provider", "zoom");
    }

    const displayName =
      typeof display_name === "string" && display_name.trim() !== ""
        ? display_name.trim()
        : "Zoom Account";

    const { data, error } = await supabase
      .from("integration_accounts")
      .insert({
        workspace_id: session.workspaceId,
        provider: "zoom",
        display_name: displayName,
        client_id,
        client_secret_encrypted,
        account_id,
        is_default: defaultFlag,
      })
      .select(INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS)
      .single();

    if (error) {
      console.error("Error creating Zoom account:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create Zoom integration account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    console.error("Unexpected error:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
