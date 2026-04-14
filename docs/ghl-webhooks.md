# GoHighLevel webhooks → Supabase mirrors (contacts + billing)

When the API server is running (Supabase configured), it exposes an endpoint that HighLevel can call whenever records change. Credentials come from **`ghl_connections`** rows (migration `010`, matched by payload `locationId`) or, as a fallback, **`GHL_PRIVATE_INTEGRATION_TOKEN`** + **`GHL_LOCATION_ID`** in the environment (with a console warning). The handler verifies the request (when signatures are present), then:

- **Contacts:** re-fetches the contact and runs the same upsert as `npm run sync-ghl-contacts`, or deletes on `ContactDelete`.
- **Orders/Invoices:** re-fetches the record and runs the billing mirror upsert path from `npm run sync-ghl-orders-invoices` (single-id mode).

## Endpoint

| Method | URL | Body |
|--------|-----|------|
| `POST` | `https://<your-host>/api/webhooks/ghl` | Raw JSON (same bytes HighLevel sends; do not re-stringify) |

Configure this URL in your **HighLevel Marketplace app** under webhook / advanced settings, and subscribe to:

- Contact events (`ContactCreate`, `ContactUpdate`, `ContactDelete`, `ContactTagUpdate`, `ContactDndUpdate`)
- Billing events (`OrderCreate`, `OrderUpdate`, `OrderPaymentStatusUpdate`, `InvoiceCreate`, `InvoiceUpdate`, `InvoicePaymentStatusUpdate`)

## Environment variables

Same as bulk sync, plus an optional dev-only flag:

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Already required by the server |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Already required by the server |
| `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY` | Yes if using `ghl_connections` | 32-byte key (base64 or 64 hex chars) to decrypt stored tokens |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | Optional fallback | Used when no `ghl_connections` row matches the payload `locationId` but `locationId` equals this env location (or payload omits `locationId`) |
| `GHL_LOCATION_ID` | Optional fallback | Pair with `GHL_PRIVATE_INTEGRATION_TOKEN` for single-location mode |
| `GHL_API_VERSION_CONTACTS` | No | Default `2021-07-28` (passed to contact GET calls) |
| `GHL_API_VERSION_PAYMENTS` | No | Default `2021-07-28` (passed to order/invoice GET calls) |
| `GHL_ORDERS_LIST_PATH` / `GHL_ORDERS_DETAIL_PATH_TEMPLATE` | No | Optional payments endpoint overrides used by billing sync script |
| `GHL_INVOICES_LIST_PATH` / `GHL_INVOICES_DETAIL_PATH_TEMPLATE` | No | Optional payments endpoint overrides used by billing sync script |
| `GHL_WEBHOOK_SKIP_VERIFY` | No | If `true` or `1`, signature checks are skipped **only when** `NODE_ENV` is not `production`. For local testing tools that cannot send `X-GHL-Signature` / `X-WH-Signature`. **Never enable in production.** |

If neither a matching **`ghl_connections`** row nor env fallback credentials apply, mutating events respond **200** with `{ skipped: true, reason: "unknown_location" }` (or `decrypt_failed` / `decrypt_key_missing` / `connection_lookup_failed` when applicable). Unhandled event types still return **200** `ignored`.

## Signature verification

HighLevel signs the **exact** JSON body. The Next.js Route Handler reads the body with `Buffer.from(await request.arrayBuffer())` (no prior JSON parsing) so verification uses the same bytes as the platform. Official details and public keys are in the [Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html):

- Prefer **`X-GHL-Signature`** (Ed25519).
- Fall back to **`X-WH-Signature`** (RSA-SHA256) during the legacy transition.

Implementation: `src/services/ghl-webhook-signature.ts` (keys match the current marketplace documentation).

## Behaviour summary

1. **Verify** signature (unless skip-verify is allowed in non-production).
2. **Parse** JSON; read `type`, `data`, `webhookId`.
3. For mutating event types only: resolve credentials — **lookup** active `ghl_connections` by `data.locationId` (also checks nested `contact`, `order`, `invoice` for `locationId`). If none, **fallback** to env `GHL_*` when the payload location matches `GHL_LOCATION_ID` or when the payload has no `locationId`. Otherwise **200** `skipped: true` with a `reason` string.
4. **`ContactDelete`**: delete from `public.ghl_contacts` (child tables cascade per migration `003`).
5. **`ContactCreate`**, **`ContactUpdate`**, **`ContactTagUpdate`**, **`ContactDndUpdate`**: resolve contact id and run `scripts/sync-ghl-contacts-to-supabase.mjs --contact-id=<id>` with per-event `GHL_PRIVATE_INTEGRATION_TOKEN` / `GHL_LOCATION_ID` in the child env.
6. **`OrderCreate`**, **`OrderUpdate`**, **`OrderPaymentStatusUpdate`**: resolve order id and run `scripts/sync-ghl-orders-invoices-to-supabase.mjs --order-id=<id>` (same env injection).
7. **`InvoiceCreate`**, **`InvoiceUpdate`**, **`InvoicePaymentStatusUpdate`**: resolve invoice id and run `scripts/sync-ghl-orders-invoices-to-supabase.mjs --invoice-id=<id>` (same env injection).
8. **Other event types**: **200** with `ignored: true` (no credential resolution).

## Local development

1. Run `npm run dev`.
2. Expose the server with **ngrok** (or similar): `https://abc.ngrok.io` → `http://localhost:3000`.
3. Set the webhook URL to `https://abc.ngrok.io/api/webhooks/ghl`.
4. If your test client does not send GHL signatures, set `GHL_WEBHOOK_SKIP_VERIFY=true` and keep `NODE_ENV=development`.

## Operations notes

- **Bulk backfill** still uses `npm run sync-ghl-contacts` and `npm run sync-ghl-orders-invoices`; webhooks keep mirrors warm after initial load.
- **Idempotency**: duplicate deliveries re-run the same upsert (safe). For multi-instance deployments, consider a dedupe store keyed by `webhookId` if you need exactly-once side effects beyond the DB upsert.
- **Performance**: each event spawns a Node child process. For very high volume, consider replacing the spawn with an in-process sync module or a job queue worker.
