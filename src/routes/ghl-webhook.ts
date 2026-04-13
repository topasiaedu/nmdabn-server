import type { RequestHandler } from "express";
import { env } from "../config/env";
import { supabase } from "../config/supabase";
import { verifyGhlWebhookSignature } from "../services/ghl-webhook-signature";
import {
  runGhlContactSyncForContactId,
  runGhlInvoiceSyncForInvoiceId,
  runGhlOrderSyncForOrderId,
} from "../services/ghl-webhook-sync";
import { assignNextWebinarRunForContactId } from "../services/assign-webinar-run";

/** Event types that include a contact id and should refresh normalized tables. */
const CONTACT_UPSERT_TYPES = new Set([
  "ContactCreate",
  "ContactUpdate",
  "ContactTagUpdate",
  "ContactDndUpdate",
]);

const CONTACT_DELETE_TYPES = new Set(["ContactDelete"]);
const ORDER_UPSERT_TYPES = new Set(["OrderCreate", "OrderUpdate", "OrderPaymentStatusUpdate"]);
const INVOICE_UPSERT_TYPES = new Set(["InvoiceCreate", "InvoiceUpdate", "InvoicePaymentStatusUpdate"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractContactId(data: Record<string, unknown> | undefined): string | null {
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
  const loc = data.locationId;
  if (typeof loc === "string" && loc.length > 0) {
    return loc;
  }
  const nested = data.contact;
  if (isRecord(nested)) {
    const inner = nested.locationId;
    if (typeof inner === "string" && inner.length > 0) {
      return inner;
    }
  }
  return null;
}

function extractOrderId(data: Record<string, unknown> | undefined): string | null {
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
  if (isRecord(nested) && typeof nested.id === "string" && nested.id.length > 0) {
    return nested.id;
  }
  return null;
}

function extractInvoiceId(data: Record<string, unknown> | undefined): string | null {
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
  if (isRecord(nested) && typeof nested.id === "string" && nested.id.length > 0) {
    return nested.id;
  }
  return null;
}

/**
 * POST /api/webhooks/ghl
 * Raw JSON body (register `express.raw` before `express.json` in `index.ts`).
 */
export const ghlWebhookHandler: RequestHandler = (req, res) => {
  const ghl = env.ghl;
  if (ghl === undefined) {
    res.status(503).json({
      success: false,
      error:
        "GHL is not configured (set GHL_PRIVATE_INTEGRATION_TOKEN and GHL_LOCATION_ID)",
    });
    return;
  }

  const rawBuf = req.body;
  if (!Buffer.isBuffer(rawBuf)) {
    res.status(400).json({ success: false, error: "Expected raw JSON body" });
    return;
  }

  const rawUtf8 = rawBuf.toString("utf8");

  const allowSkipVerify =
    ghl.webhookSkipVerify === true && env.server.nodeEnv !== "production";

  if (!allowSkipVerify) {
    const checked = verifyGhlWebhookSignature(rawUtf8, req.headers);
    if (!checked.ok) {
      console.warn("GHL webhook signature rejected:", checked.reason);
      res.status(401).json({ success: false, error: "Invalid signature" });
      return;
    }
  } else {
    console.warn(
      "GHL webhook: signature verification skipped (GHL_WEBHOOK_SKIP_VERIFY + non-production only)"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUtf8) as unknown;
  } catch {
    res.status(400).json({ success: false, error: "Invalid JSON body" });
    return;
  }

  if (!isRecord(parsed)) {
    res.status(400).json({ success: false, error: "Webhook body must be an object" });
    return;
  }

  const eventType =
    typeof parsed.type === "string" ? parsed.type : "";
  const data = isRecord(parsed.data) ? parsed.data : undefined;
  const webhookId =
    typeof parsed.webhookId === "string" ? parsed.webhookId : "";

  const contactId = extractContactId(data);
  const orderId = extractOrderId(data);
  const invoiceId = extractInvoiceId(data);
  const payloadLocationId = extractLocationId(data);

  if (
    payloadLocationId !== null &&
    payloadLocationId !== ghl.locationId
  ) {
    console.log(
      `GHL webhook ${eventType} skipped: locationId mismatch (payload ${payloadLocationId} vs env ${ghl.locationId})`
    );
    res.status(200).json({
      success: true,
      skipped: true,
      reason: "location_mismatch",
    });
    return;
  }

  if (CONTACT_DELETE_TYPES.has(eventType)) {
    if (contactId === null) {
      console.warn("GHL ContactDelete without contact id:", webhookId);
      res.status(200).json({ success: true, ignored: true });
      return;
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

    res.status(200).json({ success: true, accepted: true, action: "delete" });
    return;
  }

  if (CONTACT_UPSERT_TYPES.has(eventType)) {
    if (contactId === null) {
      console.warn(
        `GHL webhook ${eventType} without contact id:`,
        webhookId
      );
      res.status(200).json({ success: true, ignored: true });
      return;
    }

    void runGhlContactSyncForContactId(contactId)
      .then(() => assignNextWebinarRunForContactId(contactId))
      .catch((e) => {
        console.error(`GHL webhook sync/assign failed for ${contactId}:`, e);
      });

    res.status(200).json({ success: true, accepted: true, action: "sync" });
    return;
  }

  if (ORDER_UPSERT_TYPES.has(eventType)) {
    if (orderId === null) {
      console.warn(`GHL webhook ${eventType} without order id:`, webhookId);
      res.status(200).json({ success: true, ignored: true });
      return;
    }
    void runGhlOrderSyncForOrderId(orderId).catch((e) => {
      console.error(`GHL webhook order sync failed for ${orderId}:`, e);
    });
    res.status(200).json({ success: true, accepted: true, action: "sync_order" });
    return;
  }

  if (INVOICE_UPSERT_TYPES.has(eventType)) {
    if (invoiceId === null) {
      console.warn(`GHL webhook ${eventType} without invoice id:`, webhookId);
      res.status(200).json({ success: true, ignored: true });
      return;
    }
    void runGhlInvoiceSyncForInvoiceId(invoiceId).catch((e) => {
      console.error(`GHL webhook invoice sync failed for ${invoiceId}:`, e);
    });
    res.status(200).json({ success: true, accepted: true, action: "sync_invoice" });
    return;
  }

  console.log("GHL webhook unhandled type (200 OK):", eventType, webhookId);
  res.status(200).json({ success: true, ignored: true, type: eventType });
};
