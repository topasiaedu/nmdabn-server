/**
 * Client-side helper for calling GET /api/dashboard/ads-manager.
 * Handles the three-level hierarchy: campaign → adset → ad.
 */
import type { AdsManagerLevel, AdsManagerPayload } from "../types";
import {
  buildDashboardAuthHeaders,
  parseApiSuccessResponse,
  isRecord,
} from "@/lib/dashboard-api-response";function isAdsManagerPayload(v: unknown): v is AdsManagerPayload {
  if (!isRecord(v)) return false;
  return (
    typeof v["level"] === "string" &&
    isRecord(v["summary"]) &&
    Array.isArray(v["rows"]) &&
    typeof v["date_from"] === "string" &&
    typeof v["date_to"] === "string" &&
    typeof v["has_linked_accounts"] === "boolean"
  );
}

export interface FetchAdsManagerOptions {
  /** JWT access token for the current session. */
  accessToken: string;
  /** Current workspace id. */
  workspaceId: string;
  /** Project to fetch ads for. */
  projectId: string;
  /** Start of date window (YYYY-MM-DD). */
  dateFrom: string;
  /** End of date window (YYYY-MM-DD). */
  dateTo: string;
  /**
   * Hierarchy level to fetch.
   * @default "campaign"
   */
  level?: AdsManagerLevel;
  /**
   * Required when level = "adset" — filters adset rows to this campaign.
   */
  campaignId?: string;
  /**
   * Required when level = "ad" — filters ad rows to this ad set.
   */
  adsetId?: string;
}

/**
 * Fetches Ads Manager data for the given options from the Next.js API route.
 *
 * @throws When the response is not OK or the payload shape is unexpected.
 */
export async function fetchAdsManagerData(
  opts: FetchAdsManagerOptions
): Promise<AdsManagerPayload> {
  const {
    accessToken,
    workspaceId,
    projectId,
    dateFrom,
    dateTo,
    level = "campaign",
    campaignId,
    adsetId,
  } = opts;

  const qs = new URLSearchParams({
    workspace_id: workspaceId,
    project_id: projectId,
    date_from: dateFrom,
    date_to: dateTo,
    level,
  });

  if (campaignId !== undefined && campaignId !== "") {
    qs.set("campaign_id", campaignId);
  }
  if (adsetId !== undefined && adsetId !== "") {
    qs.set("adset_id", adsetId);
  }

  const res = await fetch(`/api/dashboard/ads-manager?${qs.toString()}`, {
    headers: buildDashboardAuthHeaders(accessToken),
  });

  const body = await parseApiSuccessResponse(res);
  const innerData = body["data"];
  if (!isAdsManagerPayload(innerData)) {
    throw new Error("Unexpected response shape from /api/dashboard/ads-manager");
  }
  return innerData;
}
