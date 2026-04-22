import { type NextRequest, NextResponse } from "next/server";
import { supabase } from "@/config/supabase";
import {
  loadIntegrationAccountIdsForProject,
  resolveMetaAttributionFromUtm,
} from "@/services/optin-meta-attribution";
import type { Json } from "@/database.types";

export const runtime = "nodejs";

/** Maximum body size accepted (16 KB). */
const MAX_BODY_BYTES = 16 * 1024;

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

type AuthResult = { ok: true } | { ok: false; response: NextResponse };

function checkWebhookSecret(request: NextRequest): AuthResult {
  const webhookSecret = process.env.GHL_OPTIN_WEBHOOK_SECRET?.trim();
  const secretIsConfigured = webhookSecret !== undefined && webhookSecret !== "";

  if (!secretIsConfigured) {
    console.warn(
      "GHL optin webhook: GHL_OPTIN_WEBHOOK_SECRET is not set. " +
        "Any caller can reach this endpoint. Set the secret to secure it."
    );
    return { ok: true };
  }

  const headerSecret = request.headers.get("x-webhook-secret") ?? "";
  if (headerSecret === webhookSecret) return { ok: true };

  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: "Invalid webhook secret" },
      { status: 401 }
    ),
  };
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

type BodyResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; response: NextResponse };

async function parseBody(request: NextRequest): Promise<BodyResult> {
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10
  );
  if (contentLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Request body too large" },
        { status: 413 }
      ),
    };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }

  if (isRecord(body)) return { ok: true, record: body };

  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: "Body must be a JSON object" },
      { status: 400 }
    ),
  };
}

// ---------------------------------------------------------------------------
// Field extraction from body
// ---------------------------------------------------------------------------

interface OptinFields {
  locationId: string;
  contactId: string;
  email: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  occurredAt: string;
  firstName: string;
  lastName: string;
  phone: string;
}

type FieldResult =
  | { ok: true; fields: OptinFields }
  | { ok: false; response: NextResponse };

function extractFields(body: Record<string, unknown>): FieldResult {
  const locationId = asString(body["location_id"]);
  const email = asString(body["email"]).toLowerCase();

  if (locationId === "") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "location_id is required" },
        { status: 400 }
      ),
    };
  }
  if (email === "") {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "email is required" },
        { status: 400 }
      ),
    };
  }

  const occurredAtRaw = asString(body["occurred_at"]);
  const occurredAt =
    occurredAtRaw !== "" && !Number.isNaN(Date.parse(occurredAtRaw))
      ? new Date(occurredAtRaw).toISOString()
      : new Date().toISOString();

  return {
    ok: true,
    fields: {
      locationId,
      contactId: asString(body["contact_id"]),
      email,
      utmSource: asString(body["utm_source"]),
      utmMedium: asString(body["utm_medium"]),
      utmCampaign: asString(body["utm_campaign"]),
      utmContent: asString(body["utm_content"]),
      occurredAt,
      firstName: asString(body["first_name"]),
      lastName: asString(body["last_name"]),
      phone: asString(body["phone"]),
    },
  };
}

// ---------------------------------------------------------------------------
// Project + contact resolution
// ---------------------------------------------------------------------------

async function resolveProject(
  locationId: string
): Promise<{ projectId: string } | { ignored: true } | { error: string }> {
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();

  if (projectErr !== null) {
    console.error("GHL optin webhook: project lookup error:", projectErr.message);
    return { error: "Internal error during project lookup" };
  }

  if (projectRow === null) {
    console.log(
      `GHL optin webhook: unknown location_id "${locationId}" — ignoring.`
    );
    return { ignored: true };
  }

  return { projectId: projectRow.id };
}

async function resolveContactId(
  contactId: string,
  email: string,
  locationId: string
): Promise<string | null> {
  if (contactId !== "") return contactId;

  const { data: contactRow } = await supabase
    .from("ghl_contacts")
    .select("id")
    .ilike("email", email)
    .eq("location_id", locationId)
    .maybeSingle();

  return contactRow?.id ?? null;
}

// ---------------------------------------------------------------------------
// GHL Workflow Custom Webhook: POST /api/webhooks/ghl/optin
// ---------------------------------------------------------------------------
//
// This endpoint receives a custom webhook fired by a GoHighLevel Workflow
// action ("Send Custom Webhook") every time a contact submits a form.
// Unlike the marketplace ContactCreate webhook, this fires on EVERY opt-in,
// including repeat submissions from existing contacts.
//
// Expected JSON body (configure in GHL Workflow → Send Webhook → Body):
//
//   {
//     "location_id": "{{location.id}}",
//     "contact_id":  "{{contact.id}}",
//     "email":       "{{contact.email}}",
//     "first_name":  "{{contact.first_name}}",
//     "last_name":   "{{contact.last_name}}",
//     "phone":       "{{contact.phone_number}}",
//     "utm_source":  "{{contact.utm_source}}",
//     "utm_medium":  "{{contact.utm_medium}}",
//     "utm_campaign":"{{contact.utm_campaign}}",
//     "utm_content": "{{contact.utm_content}}",
//     "occurred_at": "{{current_date_time}}"
//   }
//
// Security: set GHL_OPTIN_WEBHOOK_SECRET in .env / Vercel env vars, then add
// an HTTP header "X-Webhook-Secret: <secret>" in the GHL Workflow action.
//
// Attribution:
//   - utm_source is a numeric Meta ad ID  → ad_id path (precise).
//   - utm_content + utm_campaign present  → name_match path (historical).

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = checkWebhookSecret(request);
  if (!authResult.ok) return authResult.response;

  const bodyResult = await parseBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const fieldResult = extractFields(bodyResult.record);
  if (!fieldResult.ok) return fieldResult.response;

  const { fields } = fieldResult;

  const projectResult = await resolveProject(fields.locationId);
  if ("ignored" in projectResult) {
    return NextResponse.json(
      { success: true, ignored: true, reason: "unknown_location" },
      { status: 200 }
    );
  }
  if ("error" in projectResult) {
    return NextResponse.json(
      { success: false, error: projectResult.error },
      { status: 500 }
    );
  }

  const { projectId } = projectResult;

  const resolvedContactId = await resolveContactId(
    fields.contactId,
    fields.email,
    fields.locationId
  );

  const integrationAccountIds = await loadIntegrationAccountIdsForProject(
    supabase,
    projectId
  );

  const metaAttribution = await resolveMetaAttributionFromUtm(supabase, {
    utmSource: fields.utmSource,
    utmContent: fields.utmContent,
    utmCampaign: fields.utmCampaign,
    integrationAccountIds,
  });

  const payload: Json = {
    utm_source: fields.utmSource || null,
    utm_medium: fields.utmMedium || null,
    utm_campaign: fields.utmCampaign || null,
    utm_content: fields.utmContent || null,
    import_source: "ghl_workflow_webhook",
    email: fields.email,
    first_name: fields.firstName || null,
    last_name: fields.lastName || null,
    phone: fields.phone || null,
  };

  const { error: insertErr } = await supabase.from("journey_events").insert({
    occurred_at: fields.occurredAt,
    event_type: "optin",
    source_system: "ghl",
    contact_id: resolvedContactId,
    location_id: fields.locationId,
    project_id: projectId,
    webinar_run_id: null,
    duration_seconds: null,
    payload,
    meta_adset_id: metaAttribution.meta_adset_id,
    meta_campaign_id: metaAttribution.meta_campaign_id,
    meta_ad_id: metaAttribution.meta_ad_id,
    meta_attribution_method: metaAttribution.method,
  });

  if (insertErr !== null) {
    console.error("GHL optin webhook: insert error:", insertErr.message);
    return NextResponse.json(
      { success: false, error: "Failed to record opt-in event" },
      { status: 500 }
    );
  }

  console.log(
    `GHL optin webhook: recorded optin for ${fields.email} ` +
      `(project ${projectId}, adset ${metaAttribution.meta_adset_id ?? "unresolved"}, ` +
      `method ${metaAttribution.method ?? "none"})`
  );

  return NextResponse.json(
    {
      success: true,
      meta_adset_id: metaAttribution.meta_adset_id,
      meta_attribution_method: metaAttribution.method,
    },
    { status: 200 }
  );
}

