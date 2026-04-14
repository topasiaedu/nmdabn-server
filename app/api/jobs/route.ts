import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/jobs — reserved for future integration job queue (Step 9).
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    { success: false, error: "Job queue not yet implemented" },
    { status: 501 }
  );
}
