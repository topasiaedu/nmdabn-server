import { type NextRequest, NextResponse } from "next/server";
import { processGhlWebhookPost } from "@/services/ghl-webhook-post";
import { webhookHeaderBagFromHeaders } from "@/services/ghl-webhook-signature";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/ghl — GoHighLevel marketplace webhook (raw body for signature verification).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBuffer = Buffer.from(await request.arrayBuffer());
  const rawUtf8 = rawBuffer.toString("utf8");
  const headers = webhookHeaderBagFromHeaders(request.headers);
  const result = await processGhlWebhookPost(rawUtf8, headers);
  return NextResponse.json(result.body, { status: result.status });
}
