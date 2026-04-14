import { type NextRequest, NextResponse } from "next/server";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS } from "@/lib/integration-accounts-api";
import { parseJsonObjectBody } from "@/lib/parse-json-body";
import { requireAuthAndWorkspace } from "@/middleware/workspace";
import { supabase } from "@/config/supabase";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/integrations/accounts/:id
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const { id } = await context.params;

  try {
    const { data, error } = await supabase
      .from("integration_accounts")
      .select(INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS)
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .single();

    if (error) {
      console.error("Error fetching integration account:", error);
      return NextResponse.json(
        { success: false, error: "Integration account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("Unexpected error:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/integrations/accounts/:id
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
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

  const { id } = await context.params;
  const display_name = parsed.body.display_name;
  const is_default = parsed.body.is_default;

  try {
    const { data: existingAccount, error: fetchError } = await supabase
      .from("integration_accounts")
      .select("id, provider")
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .single();

    if (fetchError !== null || existingAccount === null) {
      return NextResponse.json(
        { success: false, error: "Integration account not found" },
        { status: 404 }
      );
    }

    if (is_default === true) {
      await supabase
        .from("integration_accounts")
        .update({ is_default: false })
        .eq("workspace_id", session.workspaceId)
        .eq("provider", existingAccount.provider);
    }

    const updateData: {
      display_name?: string;
      is_default?: boolean;
    } = {};
    if (display_name !== undefined) {
      if (typeof display_name !== "string") {
        return NextResponse.json(
          { success: false, error: "display_name must be a string" },
          { status: 400 }
        );
      }
      updateData.display_name = display_name;
    }
    if (is_default !== undefined) {
      if (typeof is_default !== "boolean") {
        return NextResponse.json(
          { success: false, error: "is_default must be a boolean" },
          { status: 400 }
        );
      }
      updateData.is_default = is_default;
    }

    const { data, error } = await supabase
      .from("integration_accounts")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
      .select(INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS)
      .single();

    if (error) {
      console.error("Error updating integration account:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update integration account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("Unexpected error:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/integrations/accounts/:id
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await requireAuthAndWorkspace(request);
  if (!session.ok) {
    return nextResponseFromGuard(session);
  }

  const { id } = await context.params;

  try {
    const { error } = await supabase
      .from("integration_accounts")
      .delete()
      .eq("id", id)
      .eq("workspace_id", session.workspaceId);

    if (error) {
      console.error("Error deleting integration account:", error);
      return NextResponse.json(
        { success: false, error: "Failed to delete integration account" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "Integration account deleted successfully" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
