import { NextResponse } from "next/server";
import { env } from "@/config/env";

/**
 * GET /api/health — liveness check for load balancers and cron monitors.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: env.server.nodeEnv,
  });
}
