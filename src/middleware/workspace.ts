import type { NextRequest } from "next/server";
import { supabase } from "@/config/supabase";
import type { GuardFailure } from "@/types/http";
import { authenticateRequest } from "./auth";

export type WorkspaceMemberSuccess = {
  ok: true;
  workspaceId: string;
};

export type WorkspaceMemberResult = WorkspaceMemberSuccess | GuardFailure;

/**
 * Reads workspace id: query `workspace_id`, then `X-Workspace-Id` header, then JSON body `workspace_id`.
 */
export function readWorkspaceId(
  request: NextRequest,
  body?: Record<string, unknown>
): string | undefined {
  const q = request.nextUrl.searchParams.get("workspace_id");
  if (q !== null && q.trim() !== "") {
    return q.trim();
  }
  const headerWs = request.headers.get("x-workspace-id");
  if (headerWs !== null && headerWs.trim() !== "") {
    return headerWs.trim();
  }
  if (body !== undefined) {
    const w = body["workspace_id"];
    if (typeof w === "string" && w.trim() !== "") {
      return w.trim();
    }
  }
  return undefined;
}

/**
 * Ensures the user is a member of the given workspace.
 */
export async function requireWorkspaceMember(
  userId: string,
  workspaceIdRaw: string | undefined
): Promise<WorkspaceMemberResult> {
  try {
    if (workspaceIdRaw === undefined || workspaceIdRaw === "") {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          error: "workspace_id is required",
        },
      };
    }

    const { data: membership, error } = await supabase
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", workspaceIdRaw)
      .eq("user_id", userId)
      .single();

    if (error !== null || membership === null) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          error: "Access denied: User is not a member of this workspace",
        },
      };
    }

    return { ok: true, workspaceId: workspaceIdRaw };
  } catch (e) {
    console.error("Workspace validation error:", e);
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        error: "Internal server error during workspace validation",
      },
    };
  }
}

/**
 * Authenticated user + workspace membership using query/body workspace_id.
 */
export async function requireAuthAndWorkspace(
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<
  | {
      ok: true;
      userId: string;
      email: string;
      workspaceId: string;
    }
  | GuardFailure
> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    return auth;
  }
  const ws = readWorkspaceId(request, body);
  const member = await requireWorkspaceMember(auth.userId, ws);
  if (!member.ok) {
    return member;
  }
  return {
    ok: true,
    userId: auth.userId,
    email: auth.email,
    workspaceId: member.workspaceId,
  };
}
