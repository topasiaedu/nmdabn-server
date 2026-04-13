import type { NextFunction, Request, Response } from "express";
import { authenticateUser } from "./auth";
import { trafficDashboardAuth } from "./traffic-dashboard-auth";
import { validateWorkspaceAccess } from "./workspace";

export type TrafficAuthMode = "user" | "legacy";

/**
 * Bearer JWT: workspace member → Traffic uses `project_id` + stored GHL settings.
 * Otherwise: same as `trafficDashboardAuth` → legacy `location_id` + env/script params.
 */
export function trafficDashboardFlexibleAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authz = req.headers.authorization;
  if (typeof authz === "string" && authz.toLowerCase().startsWith("bearer ")) {
    void authenticateUser(req, res, () => {
      if (res.headersSent) {
        return;
      }
      void validateWorkspaceAccess(req, res, () => {
        if (res.headersSent) {
          return;
        }
        (res.locals as { trafficAuthMode?: TrafficAuthMode }).trafficAuthMode =
          "user";
        next();
      });
    });
    return;
  }

  (res.locals as { trafficAuthMode?: TrafficAuthMode }).trafficAuthMode =
    "legacy";
  trafficDashboardAuth(req, res, next);
}
