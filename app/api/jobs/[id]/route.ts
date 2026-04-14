import { type NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/jobs/:id — reserved for future integration job queue (Step 9).
 */
export async function GET(
  _request: NextRequest,
  _context: RouteContext
): Promise<NextResponse> {
  return NextResponse.json(
    { success: false, error: "Job queue not yet implemented" },
    { status: 501 }
  );
}
