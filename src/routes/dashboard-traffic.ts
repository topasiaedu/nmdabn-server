import { Router, type Request, type Response } from "express";
import { env } from "../config/env";
import { getTagsForLine, listConfiguredLineKeys } from "../config/traffic";
import {
  trafficDashboardFlexibleAuth,
  type TrafficAuthMode,
} from "../middleware/traffic-dashboard-flex-auth";
import { supabase } from "../config/supabase";
import { buildTrafficDashboardPayload } from "../services/traffic-dashboard";
import {
  fetchProjectTrafficSettings,
  resolveAgencyLineTagsForRequest,
} from "../services/traffic-project-settings";
import type { AuthenticatedRequest } from "../types";

const router = Router();

function trafficMode(res: Response): TrafficAuthMode {
  const m = (res.locals as { trafficAuthMode?: TrafficAuthMode })
    .trafficAuthMode;
  return m === "user" ? "user" : "legacy";
}

/**
 * GET /api/dashboard/traffic
 *
 * **Bearer JWT (recommended, multi-project):**
 * - `workspace_id`, `project_id`, `line` (required)
 * - Project must have `ghl_location_id` and `traffic_occupation_field_id` (per GHL sub-account).
 * - Optional `traffic_agency_line_tags` on project overrides env tag map.
 * - Optional `occupation_field_id` query overrides project field id (debug).
 *
 * **Legacy (scripts / no user session):**
 * - `x-traffic-key` when TRAFFIC_DASHBOARD_API_KEY is set
 * - `location_id`, `line`, `occupation_field_id` (or TRAFFIC_OCCUPATION_FIELD_ID env)
 */
router.get(
  "/traffic",
  trafficDashboardFlexibleAuth,
  async (req: Request, res: Response) => {
    try {
      const lineKey =
        typeof req.query.line === "string" ? req.query.line.trim() : "";

      if (lineKey === "") {
        res.status(400).json({
          success: false,
          error: "line query parameter is required",
        });
        return;
      }

      const dateFrom =
        typeof req.query.date_from === "string" &&
        req.query.date_from.trim() !== ""
          ? req.query.date_from.trim()
          : null;
      const dateTo =
        typeof req.query.date_to === "string" &&
        req.query.date_to.trim() !== ""
          ? req.query.date_to.trim()
          : null;

      if (trafficMode(res) === "user") {
        const ar = req as AuthenticatedRequest;
        const workspaceId = ar.workspaceId;
        if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
          res.status(400).json({
            success: false,
            error: "workspace_id query parameter is required",
          });
          return;
        }

        const projectId =
          typeof req.query.project_id === "string"
            ? req.query.project_id.trim()
            : "";
        if (projectId === "") {
          res.status(400).json({
            success: false,
            error:
              "project_id query parameter is required when using Bearer authentication",
          });
          return;
        }

        const resolved = await fetchProjectTrafficSettings(
          projectId,
          workspaceId,
          env.trafficAgencyLineTags
        );
        if ("error" in resolved) {
          res.status(400).json({
            success: false,
            error: resolved.error,
          });
          return;
        }

        const occOverride =
          typeof req.query.occupation_field_id === "string"
            ? req.query.occupation_field_id.trim()
            : "";
        const occupationFieldId =
          occOverride !== "" ? occOverride : resolved.occupationFieldId;

        const lineTags = getTagsForLine(lineKey, resolved.agencyLineTags);
        if (lineTags === undefined) {
          res.status(400).json({
            success: false,
            error: `Unknown line "${lineKey}". Configured lines: ${listConfiguredLineKeys(resolved.agencyLineTags).join(", ")}`,
          });
          return;
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

        res.json({
          success: true,
          data: payload,
          configuredLines: listConfiguredLineKeys(resolved.agencyLineTags),
          trafficSource: "project",
        });
        return;
      }

      const locationId =
        typeof req.query.location_id === "string"
          ? req.query.location_id.trim()
          : "";
      if (locationId === "") {
        res.status(400).json({
          success: false,
          error:
            "location_id query parameter is required for legacy (non-Bearer) access",
        });
        return;
      }

      const lineTagsLegacy = getTagsForLine(lineKey, env.trafficAgencyLineTags);
      if (lineTagsLegacy === undefined) {
        res.status(400).json({
          success: false,
          error: `Unknown line "${lineKey}". Configured lines: ${listConfiguredLineKeys(env.trafficAgencyLineTags).join(", ")}`,
        });
        return;
      }

      const occFromQuery =
        typeof req.query.occupation_field_id === "string"
          ? req.query.occupation_field_id.trim()
          : "";
      const occupationFieldIdLegacy =
        occFromQuery !== ""
          ? occFromQuery
          : env.trafficOccupationFieldId !== undefined
            ? env.trafficOccupationFieldId
            : "";

      if (occupationFieldIdLegacy === "") {
        res.status(400).json({
          success: false,
          error:
            "occupation_field_id query parameter or TRAFFIC_OCCUPATION_FIELD_ID env is required for legacy access",
        });
        return;
      }

      const payload = await buildTrafficDashboardPayload({
        locationId,
        lineKey,
        lineTags: lineTagsLegacy,
        occupationFieldId: occupationFieldIdLegacy,
        dateFrom,
        dateTo,
      });

      res.json({
        success: true,
        data: payload,
        configuredLines: listConfiguredLineKeys(env.trafficAgencyLineTags),
        trafficSource: "legacy",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("GET /api/dashboard/traffic:", message);
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  }
);

/**
 * GET /api/dashboard/traffic/lines
 *
 * Bearer: optional `project_id` + `workspace_id` to apply per-project tag overrides.
 * Legacy: env tags only.
 */
router.get(
  "/traffic/lines",
  trafficDashboardFlexibleAuth,
  async (req: Request, res: Response) => {
    try {
      if (trafficMode(res) === "legacy") {
        res.json({
          success: true,
          lines: listConfiguredLineKeys(env.trafficAgencyLineTags),
          tagsByLine: env.trafficAgencyLineTags,
          auth: "legacy",
        });
        return;
      }

      const ar = req as AuthenticatedRequest;
      const workspaceId = ar.workspaceId;
      if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
        res.status(400).json({
          success: false,
          error: "workspace_id query parameter is required",
        });
        return;
      }

      const projectId =
        typeof req.query.project_id === "string"
          ? req.query.project_id.trim()
          : "";

      if (projectId === "") {
        res.json({
          success: true,
          lines: listConfiguredLineKeys(env.trafficAgencyLineTags),
          tagsByLine: env.trafficAgencyLineTags,
          auth: "user",
          tagSource: "env_default",
        });
        return;
      }

      const { data: proj, error } = await supabase
        .from("projects")
        .select("traffic_agency_line_tags")
        .eq("id", projectId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error !== null) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (proj === null) {
        res.status(404).json({
          success: false,
          error: "Project not found",
        });
        return;
      }

      const tags = resolveAgencyLineTagsForRequest(
        proj.traffic_agency_line_tags,
        env.trafficAgencyLineTags
      );

      res.json({
        success: true,
        lines: listConfiguredLineKeys(tags),
        tagsByLine: tags,
        auth: "user",
        tagSource:
          proj.traffic_agency_line_tags === null ? "env_default" : "project",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;
