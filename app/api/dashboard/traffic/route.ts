import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { getTagsForLine, listConfiguredLineKeys } from "@/config/traffic";
import { nextResponseFromGuard } from "@/lib/guard-response";
import { resolveTrafficDashboardAuth } from "@/middleware/traffic-dashboard-flex-auth";
import { buildTrafficDashboardPayload } from "@/services/traffic-dashboard";
import { fetchProjectTrafficSettings } from "@/services/traffic-project-settings";

/**
 * GET /api/dashboard/traffic — Traffic dashboard payload (Bearer + workspace or legacy key + location).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const flex = await resolveTrafficDashboardAuth(request);
  if (!flex.ok) {
    return nextResponseFromGuard(flex);
  }

  try {
    const lineKey =
      request.nextUrl.searchParams.get("line")?.trim() ?? "";

    if (lineKey === "") {
      return NextResponse.json(
        { success: false, error: "line query parameter is required" },
        { status: 400 }
      );
    }

    const dateFromRaw = request.nextUrl.searchParams.get("date_from");
    const dateToRaw = request.nextUrl.searchParams.get("date_to");
    const dateFrom =
      dateFromRaw !== null && dateFromRaw.trim() !== ""
        ? dateFromRaw.trim()
        : null;
    const dateTo =
      dateToRaw !== null && dateToRaw.trim() !== "" ? dateToRaw.trim() : null;

    if (flex.mode === "user") {
      const workspaceId = flex.workspaceId;

      const projectId =
        request.nextUrl.searchParams.get("project_id")?.trim() ?? "";
      if (projectId === "") {
        return NextResponse.json(
          {
            success: false,
            error:
              "project_id query parameter is required when using Bearer authentication",
          },
          { status: 400 }
        );
      }

      const resolved = await fetchProjectTrafficSettings(
        projectId,
        workspaceId,
        env.trafficAgencyLineTags
      );
      if ("error" in resolved) {
        return NextResponse.json(
          { success: false, error: resolved.error },
          { status: 400 }
        );
      }

      const occOverride =
        request.nextUrl.searchParams.get("occupation_field_id")?.trim() ?? "";
      const occupationFieldId =
        occOverride !== "" ? occOverride : resolved.occupationFieldId;

      const lineTags = getTagsForLine(lineKey, resolved.agencyLineTags);
      if (lineTags === undefined) {
        return NextResponse.json(
          {
            success: false,
            error: `Unknown line "${lineKey}". Configured lines: ${listConfiguredLineKeys(resolved.agencyLineTags).join(", ")}`,
          },
          { status: 400 }
        );
      }

      const payload = await buildTrafficDashboardPayload({
        locationId: resolved.ghlLocationId,
        lineKey,
        lineTags,
        occupationFieldId,
        dateFrom,
        dateTo,
        projectId: resolved.projectId,
        projectName: resolved.projectName,
      });

      return NextResponse.json({
        success: true,
        data: payload,
        configuredLines: listConfiguredLineKeys(resolved.agencyLineTags),
        trafficSource: "project",
      });
    }

    const locationId =
      request.nextUrl.searchParams.get("location_id")?.trim() ?? "";
    if (locationId === "") {
      return NextResponse.json(
        {
          success: false,
          error:
            "location_id query parameter is required for legacy (non-Bearer) access",
        },
        { status: 400 }
      );
    }

    const lineTagsLegacy = getTagsForLine(lineKey, env.trafficAgencyLineTags);
    if (lineTagsLegacy === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown line "${lineKey}". Configured lines: ${listConfiguredLineKeys(env.trafficAgencyLineTags).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const occFromQuery =
      request.nextUrl.searchParams.get("occupation_field_id")?.trim() ?? "";
    const occupationFieldIdLegacy =
      occFromQuery !== ""
        ? occFromQuery
        : env.trafficOccupationFieldId !== undefined
          ? env.trafficOccupationFieldId
          : "";

    if (occupationFieldIdLegacy === "") {
      return NextResponse.json(
        {
          success: false,
          error:
            "occupation_field_id query parameter or TRAFFIC_OCCUPATION_FIELD_ID env is required for legacy access",
        },
        { status: 400 }
      );
    }

    const payload = await buildTrafficDashboardPayload({
      locationId,
      lineKey,
      lineTags: lineTagsLegacy,
      occupationFieldId: occupationFieldIdLegacy,
      dateFrom,
      dateTo,
    });

    return NextResponse.json({
      success: true,
      data: payload,
      configuredLines: listConfiguredLineKeys(env.trafficAgencyLineTags),
      trafficSource: "legacy",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("GET /api/dashboard/traffic:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
