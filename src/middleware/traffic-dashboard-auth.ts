import type { NextRequest } from "next/server";
import { env } from "@/config/env";
import type { GuardFailure } from "@/types/http";

export type TrafficLegacyAuthSuccess = { ok: true };

export type TrafficLegacyAuthResult =
  | TrafficLegacyAuthSuccess
  | GuardFailure;

/**
 * When TRAFFIC_DASHBOARD_API_KEY is set, requires matching `x-traffic-key` header.
 * When unset, allows access (trusted networks / development only).
 */
export function requireTrafficLegacyKey(
  request: NextRequest
): TrafficLegacyAuthResult {
  const key = env.trafficDashboardApiKey;
  if (key === undefined || key === "") {
    return { ok: true };
  }
  const header = request.headers.get("x-traffic-key");
  if (header === key) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 401,
    body: {
      success: false,
      error: "Invalid or missing x-traffic-key header",
    },
  };
}
