# GHL webhook pipeline

How an inbound GoHighLevel webhook is handled in this API (contacts + billing mirrors).

## Wire and route setup

- **Path:** `POST /api/webhooks/ghl`
- **Middleware:** `express.raw({ type: "*/*", limit: "10mb" })` then `ghlWebhookHandler` (see `../src/index.ts`). The **10mb** cap is a DoS / accident guard; real GHL payloads are tiny.
- **Why raw:** JSON parsers may normalize whitespace or encoding; verification needs **byte-identical** body string. See [[Express-Raw-Webhook-Body]].

## Flow (ordered)

1. **Body type:** If `req.body` is not a `Buffer`, **400** `Expected raw JSON body`.
2. **UTF-8 string:** `rawBuf.toString("utf8")` — must match what GHL signed.
3. **Signature:** Unless `GHL_WEBHOOK_SKIP_VERIFY` is allowed in non-production, `verifyGhlWebhookSignature(rawUtf8, req.headers)`; failure → **401**. See [[GHL-Webhook-Security]].
4. **Parse JSON:** Failure → **400**. Root must be a plain object.
5. **Extract:** `eventType` from `type`, `data`, `webhookId`, and ids (`contactId`, `orderId`, `invoiceId`, `payloadLocationId`) via helpers that tolerate nested `contact` / `order` / `invoice` objects.
6. **Unhandled types:** If the event is not a mutating contact/order/invoice type, **200** `ignored: true` (no credential resolution).
7. **Credential resolution:** Lookup active `ghl_connections` by `payloadLocationId`; decrypt token with `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY`. Else env fallback (`GHL_PRIVATE_INTEGRATION_TOKEN` + `GHL_LOCATION_ID`) when allowed, with **console.warn**. Else **200** `{ skipped: true, reason: … }` (`unknown_location`, `decrypt_failed`, etc.).
8. **Branch:**
   - **ContactDelete:** Supabase delete from `ghl_contacts` by id (async IIFE); **200** `action: "delete"`. Missing id → **200** `ignored`.
   - **Contact upsert set:** `runGhlContactSyncForContactId(contactId, credentials)` (spawn with per-event GHL env); **200** `action: "sync"`. Missing id → **200** `ignored`.
   - **Order upsert set:** `runGhlOrderSyncForOrderId`; **200** `action: "sync_order"`.
   - **Invoice upsert set:** `runGhlInvoiceSyncForInvoiceId`; **200** `action: "sync_invoice"`.
   - **Else (should not occur after step 6):** **500** internal error.

**Async note:** Upsert/delete work is **not** awaited before the HTTP response; errors go to `console.error`.

## Event → action matrix

| Event types | Action |
|-------------|--------|
| `ContactDelete` | Delete mirror row |
| `ContactCreate`, `ContactUpdate`, `ContactTagUpdate`, `ContactDndUpdate` | Spawn contact sync script |
| `OrderCreate`, `OrderUpdate`, `OrderPaymentStatusUpdate` | Spawn billing script `--order-id` |
| `InvoiceCreate`, `InvoiceUpdate`, `InvoicePaymentStatusUpdate` | Spawn billing script `--invoice-id` |
| Other | Ignored (200) |

## Related

- [[GHL-Webhooks]] — full source-derived reference
- [[GHL-Sync-Operations]] — what the spawned scripts do relative to bulk npm
- [[Supabase-GHL-Mirror]] — destination tables
- `../src/services/ghl-webhook-sync.ts` — `spawn(process.execPath, [scriptPath, …])`

## Contradictions / history

- **2026-04-13:** Replaced single-location **503** gate and `location_mismatch` skip with `ghl_connections` lookup + env fallback; skip reasons are now `unknown_location`, `decrypt_failed`, etc. See [[GHL-Webhooks]] live doc in repo.
