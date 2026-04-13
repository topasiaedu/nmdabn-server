import type { RequestHandler } from "express";
import { env } from "../config/env";

/**
 * When TRAFFIC_DASHBOARD_API_KEY is set, requires matching `x-traffic-key` header.
 * When unset, allows access (use only in trusted networks / development).
 */
export const trafficDashboardAuth: RequestHandler = (req, res, next) => {
  const key = env.trafficDashboardApiKey;
  if (key === undefined || key === "") {
    next();
    return;
  }
  const header = req.headers["x-traffic-key"];
  if (typeof header === "string" && header === key) {
    next();
    return;
  }
  res.status(401).json({
    success: false,
    error: "Invalid or missing x-traffic-key header",
  });
};
