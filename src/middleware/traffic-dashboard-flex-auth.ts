import type { NextRequest } from "next/server";
import type { GuardFailure } from "@/types/http";
import { authenticateRequest } from "./auth";
import { requireTrafficLegacyKey } from "./traffic-dashboard-auth";
import { readWorkspaceId, requireWorkspaceMember } from "./workspace";

export type TrafficAuthMode = "user" | "legacy";

export type TrafficFlexSuccess =
  | { ok: true; mode: "legacy" }
  | {
      ok: true;
      mode: "user";
      userId: string;
      email: string;
      workspaceId: string;
    };

export type TrafficFlexResult = TrafficFlexSuccess | GuardFailure;

/**
 * Bearer JWT + workspace member → user mode (project-based traffic).
 * Otherwise legacy `x-traffic-key` when API key is configured.
 */
export async function resolveTrafficDashboardAuth(
  request: NextRequest
): Promise<TrafficFlexResult> {
  const authz = request.headers.get("authorization");
  if (
    typeof authz === "string" &&
    authz.toLowerCase().startsWith("bearer ")
  ) {
    const auth = await authenticateRequest(request);
    if (!auth.ok) {
      return auth;
    }
    const workspaceId = readWorkspaceId(request, undefined);
    const member = await requireWorkspaceMember(auth.userId, workspaceId);
    if (!member.ok) {
      return member;
    }
    return {
      ok: true,
      mode: "user",
      userId: auth.userId,
      email: auth.email,
      workspaceId: member.workspaceId,
    };
  }

  const legacy = requireTrafficLegacyKey(request);
  if (!legacy.ok) {
    return legacy;
  }
  return { ok: true, mode: "legacy" };
}
