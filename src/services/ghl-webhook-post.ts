import { env } from "@/config/env";
import { supabase } from "@/config/supabase";
import {
  resolveGhlWebhookCredentials,
  type GhlWebhookCredentials,
} from "@/services/ghl-connection-resolve";
import {
  verifyGhlWebhookSignature,
  type WebhookHeaderBag,
} from "@/services/ghl-webhook-signature";
import {
  runGhlContactSyncForContactId,
  runGhlInvoiceSyncForInvoiceId,
  runGhlOrderSyncForOrderId,
} from "@/services/ghl-webhook-sync";
import { assignNextWebinarRunForContactId } from "@/services/assign-webinar-run";

/** Event types that include a contact id and should refresh normalized tables. */
const CONTACT_UPSERT_TYPES = new Set([
  "ContactCreate",
  "ContactUpdate",
  "ContactTagUpdate",
  "ContactDndUpdate",
]);

const CONTACT_DELETE_TYPES = new Set(["ContactDelete"]);
const ORDER_UPSERT_TYPES = new Set([
  "OrderCreate",
  "OrderUpdate",
  "OrderPaymentStatusUpdate",
]);
const INVOICE_UPSERT_TYPES = new Set([
  "InvoiceCreate",
  "InvoiceUpdate",
  "InvoicePaymentStatusUpdate",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function locationIdFromRecord(obj: Record<string, unknown>): string | null {
  const loc = obj.locationId;
  if (typeof loc === "string" && loc.length > 0) {
    return loc;
  }
  return null;
}

function extractContactId(
  data: Record<string, unknown> | undefined
): string | null {
  if (data === undefined) {
    return null;
  }
  const id = data.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  const alt = data.contactId;
  if (typeof alt === "string" && alt.length > 0) {
    return alt;
  }
  const nested = data.contact;
  if (isRecord(nested)) {
    const innerId = nested.id;
    if (typeof innerId === "string" && innerId.length > 0) {
      return innerId;
    }
  }
  return null;
}

function extractLocationId(
  data: Record<string, unknown> | undefined
): string | null {
  if (data === undefined) {
    return null;
  }
  const root = locationIdFromRecord(data);
  if (root !== null) {
    return root;
  }
  const nested = data.contact;
  if (isRecord(nested)) {
    const inner = locationIdFromRecord(nested);
    if (inner !== null) {
      return inner;
    }
  }
  const order = data.order;
  if (isRecord(order)) {
    const fromOrder = locationIdFromRecord(order);
    if (fromOrder !== null) {
      return fromOrder;
    }
  }
  const invoice = data.invoice;
  if (isRecord(invoice)) {
    const fromInvoice = locationIdFromRecord(invoice);
    if (fromInvoice !== null) {
      return fromInvoice;
    }
  }
  return null;
}

function extractOrderId(
  data: Record<string, unknown> | undefined
): string | null {
  if (data === undefined) {
    return null;
  }
  const id = data.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  const alt = data.orderId;
  if (typeof alt === "string" && alt.length > 0) {
    return alt;
  }
  const nested = data.order;
  if (
    isRecord(nested) &&
    typeof nested.id === "string" &&
    nested.id.length > 0
  ) {
    return nested.id;
  }
  return null;
}

function extractInvoiceId(
  data: Record<string, unknown> | undefined
): string | null {
  if (data === undefined) {
    return null;
  }
  const id = data.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  const alt = data.invoiceId;
  if (typeof alt === "string" && alt.length > 0) {
    return alt;
  }
  const nested = data.invoice;
  if (
    isRecord(nested) &&
    typeof nested.id === "string" &&
    nested.id.length > 0
  ) {
    return nested.id;
  }
  return null;
}

/**
 * Same rule as `env.ghl.webhookSkipVerify`, but works when `GHL_*` env fallback is unset.
 */
function ghlWebhookSkipVerifyAllowed(): boolean {
  const skipRaw = process.env.GHL_WEBHOOK_SKIP_VERIFY;
  const webhookSkipVerify =
    skipRaw === "1" || skipRaw?.toLowerCase() === "true";
  return webhookSkipVerify === true && env.server.nodeEnv !== "production";
}

export type GhlWebhookHttpResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Core GHL marketplace webhook handler: raw UTF-8 body + header bag for signature verification.
 */
export async function processGhlWebhookPost(
  rawUtf8: string,
  headers: WebhookHeaderBag
): Promise<GhlWebhookHttpResult> {
  const allowSkipVerify = ghlWebhookSkipVerifyAllowed();

  if (!allowSkipVerify) {
    const checked = verifyGhlWebhookSignature(rawUtf8, headers);
    if (!checked.ok) {
      console.warn("GHL webhook signature rejected:", checked.reason);
      return {
        status: 401,
        body: { success: false, error: "Invalid signature" },
      };
    }
  } else {
    console.warn(
      "GHL webhook: signature verification skipped (GHL_WEBHOOK_SKIP_VERIFY + non-production only)"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUtf8);
  } catch {
    return {
      status: 400,
      body: { success: false, error: "Invalid JSON body" },
    };
  }

  if (!isRecord(parsed)) {
    return {
      status: 400,
      body: { success: false, error: "Webhook body must be an object" },
    };
  }

  const eventType = typeof parsed.type === "string" ? parsed.type : "";
  const data = isRecord(parsed.data) ? parsed.data : undefined;
  const webhookId =
    typeof parsed.webhookId === "string" ? parsed.webhookId : "";

  const contactId = extractContactId(data);
  const orderId = extractOrderId(data);
  const invoiceId = extractInvoiceId(data);
  const payloadLocationId = extractLocationId(data);

  const isMutatingGhlEvent =
    CONTACT_DELETE_TYPES.has(eventType) ||
    CONTACT_UPSERT_TYPES.has(eventType) ||
    ORDER_UPSERT_TYPES.has(eventType) ||
    INVOICE_UPSERT_TYPES.has(eventType);

  if (!isMutatingGhlEvent) {
    console.log("GHL webhook unhandled type (200 OK):", eventType, webhookId);
    return {
      status: 200,
      body: { success: true, ignored: true, type: eventType },
    };
  }

  const resolved = await resolveGhlWebhookCredentials(
    supabase,
    payloadLocationId,
    env.ghl
  );
  if (!resolved.ok) {
    console.log(
      `GHL webhook ${eventType} skipped: ${resolved.skipReason} (webhook ${webhookId})`
    );
    return {
      status: 200,
      body: {
        success: true,
        skipped: true,
        reason: resolved.skipReason,
      },
    };
  }

  const credentials: GhlWebhookCredentials = resolved.credentials;

  if (CONTACT_DELETE_TYPES.has(eventType)) {
    if (contactId === null) {
      console.warn("GHL ContactDelete without contact id:", webhookId);
      return { status: 200, body: { success: true, ignored: true } };
    }

    void (async () => {
      try {
        const { error } = await supabase
          .from("ghl_contacts")
          .delete()
          .eq("id", contactId);
        if (error) {
          console.error("GHL webhook delete failed:", error.message);
        } else {
          console.log("GHL webhook deleted contact mirror:", contactId);
        }
      } catch (e) {
        console.error("GHL webhook delete error:", e);
      }
    })();

    return {
      status: 200,
      body: { success: true, accepted: true, action: "delete" },
    };
  }

  if (CONTACT_UPSERT_TYPES.has(eventType)) {
    if (contactId === null) {
      console.warn(`GHL webhook ${eventType} without contact id:`, webhookId);
      return { status: 200, body: { success: true, ignored: true } };
    }

    void runGhlContactSyncForContactId(contactId, credentials)
      .then(() => assignNextWebinarRunForContactId(contactId))
      .catch((e) => {
        console.error(`GHL webhook sync/assign failed for ${contactId}:`, e);
      });

    return {
      status: 200,
      body: { success: true, accepted: true, action: "sync" },
    };
  }

  if (ORDER_UPSERT_TYPES.has(eventType)) {
    if (orderId === null) {
      console.warn(`GHL webhook ${eventType} without order id:`, webhookId);
      return { status: 200, body: { success: true, ignored: true } };
    }
    void runGhlOrderSyncForOrderId(orderId, credentials).catch((e) => {
      console.error(`GHL webhook order sync failed for ${orderId}:`, e);
    });
    return {
      status: 200,
      body: { success: true, accepted: true, action: "sync_order" },
    };
  }

  if (INVOICE_UPSERT_TYPES.has(eventType)) {
    if (invoiceId === null) {
      console.warn(`GHL webhook ${eventType} without invoice id:`, webhookId);
      return { status: 200, body: { success: true, ignored: true } };
    }
    void runGhlInvoiceSyncForInvoiceId(invoiceId, credentials).catch((e) => {
      console.error(`GHL webhook invoice sync failed for ${invoiceId}:`, e);
    });
    return {
      status: 200,
      body: { success: true, accepted: true, action: "sync_invoice" },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: "Unhandled mutating GHL event branch (internal error)",
    },
  };
}
