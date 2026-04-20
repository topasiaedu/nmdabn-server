import { type NextRequest, NextResponse, after } from "next/server";
import { processGhlWebhookPost } from "@/services/ghl-webhook-post";
import { webhookHeaderBagFromHeaders } from "@/services/ghl-webhook-signature";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/ghl — GoHighLevel marketplace webhook (raw body for signature verification).
 * Background sync tasks are deferred with `after()` so the 200 is returned immediately.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBuffer = Buffer.from(await request.arrayBuffer());
  const rawUtf8 = rawBuffer.toString("utf8");
  const headers = webhookHeaderBagFromHeaders(request.headers);
  const result = await processGhlWebhookPost(rawUtf8, headers, after);
  return NextResponse.json(result.body, { status: result.status });
}
