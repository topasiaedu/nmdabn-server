# GHL webhooks (repo doc ingest)

**Raw snapshot:** [2026-04-07-repo-ghl-webhooks.md](../raw/sources/2026-04-07-repo-ghl-webhooks.md) (frozen copy of `docs/ghl-webhooks.md` at ingest time)  
**Upstream doc (live):** `../docs/ghl-webhooks.md`

## Executive summary

GoHighLevel delivers **contact** and **billing** lifecycle events to this API at `POST /api/webhooks/ghl`. The platform signs the **exact** JSON bytes on the wire. The server keeps Supabase mirror tables warm by **re-fetching** the affected record from GHL and running the **same** upsert pipelines as `npm run sync-ghl-contacts` and `npm run sync-ghl-orders-invoices` (single-id mode), or by **deleting** mirror rows on `ContactDelete`. Misconfigured GHL env → **503**. Bad signature → **401**. Wrong sub-account → **200** with `skipped: true`.

## Endpoint (configure in Marketplace app)

| Method | URL | Body |
|--------|-----|------|
| `POST` | `https://<your-host>/api/webhooks/ghl` | Raw JSON — **same bytes** HighLevel sent; never re-stringify in a proxy |

Subscribe in the **HighLevel Marketplace app** (webhook / advanced settings) to:

**Contacts:** `ContactCreate`, `ContactUpdate`, `ContactDelete`, `ContactTagUpdate`, `ContactDndUpdate`  
**Billing:** `OrderCreate`, `OrderUpdate`, `OrderPaymentStatusUpdate`, `InvoiceCreate`, `InvoiceUpdate`, `InvoicePaymentStatusUpdate`

Official signing and key rotation details: [Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html).

## Environment variables (from doc + `.env.example`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes (server) | Postgres host |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Service role for mirror writes |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | Yes for webhooks | `GET /contacts/{id}` and billing GETs after each event |
| `GHL_LOCATION_ID` | Yes for webhooks | Sub-account; other `locationId` values are ignored (skipped) |
| `GHL_API_VERSION_CONTACTS` | No | Default `2021-07-28` on contact GET |
| `GHL_API_VERSION_PAYMENTS` | No | Default `2021-07-28` on payments GETs |
| `GHL_ORDERS_LIST_PATH` / `GHL_ORDERS_DETAIL_PATH_TEMPLATE` | No | Override payments paths for billing script |
| `GHL_INVOICES_LIST_PATH` / `GHL_INVOICES_DETAIL_PATH_TEMPLATE` | No | Same for invoices |
| `GHL_WEBHOOK_SKIP_VERIFY` | No | If `true`/`1`, skip signature checks **only** when `NODE_ENV` !== `production` |

If `GHL_PRIVATE_INTEGRATION_TOKEN` or `GHL_LOCATION_ID` is missing, `env.ghl` is undefined → **503** `"GHL is not configured …"`.

See also: `../.env.example` (comments include migration `003` prerequisite for contact mirror).

## Behaviour → HTTP outcomes (synthesis)

| Situation | HTTP | Notes |
|-----------|------|--------|
| GHL not configured | 503 | Missing token or location id |
| Body not raw buffer | 400 | `Expected raw JSON body` |
| Invalid signature (when verify on) | 401 | Logged reason |
| Invalid JSON / not an object | 400 | Parse or shape failure |
| `locationId` mismatch | 200 | `skipped: true`, `reason: location_mismatch` |
| `ContactDelete` with id | 200 | Async delete `ghl_contacts`; `action: delete` |
| Contact upsert types with id | 200 | Async spawn contact sync; `action: sync` |
| Order / invoice upsert types with id | 200 | Async spawn billing sync; `sync_order` / `sync_invoice` |
| Known type but missing id | 200 | `ignored: true` |
| Unhandled `type` | 200 | `ignored: true` (logged) |

Sync failures after **200** surface in **server logs** only (fire-and-forget).

## Signature verification (why it is fragile)

- GHL signs the **exact** payload bytes. Using `express.json()` before verify would break byte identity → [[GHL-Webhook-Security]], [[Express-Raw-Webhook-Body]].
- Headers: prefer **`X-GHL-Signature`** (Ed25519); fall back **`X-WH-Signature`** (RSA-SHA256) during legacy transition (implementation comment: legacy path until **July 2026**).
- Code: `../src/services/ghl-webhook-signature.ts` (embedded public keys match marketplace docs).

## Operations (from source doc)

- **Bulk backfill** remains `npm run sync-ghl-contacts` and `npm run sync-ghl-orders-invoices`; webhooks **incrementally** refresh mirrors after load.
- **Idempotency:** duplicate deliveries re-run upserts (safe at DB level). Multi-instance: consider dedupe on `webhookId` if you need stricter than upsert semantics.
- **Performance:** each handled event **spawns** a Node child process running the sync script; high volume may warrant in-process sync or a queue worker.

## Local development checklist

1. `npm run dev`
2. Tunnel (ngrok, etc.) public URL → `http://localhost:3000`
3. Webhook URL `https://<tunnel>/api/webhooks/ghl`
4. If the client cannot send signatures: `GHL_WEBHOOK_SKIP_VERIFY=true` and **non-production** `NODE_ENV` only

## Code map

| Piece | Path |
|-------|------|
| Route registration (`express.raw`, 10mb limit) | `../src/index.ts` |
| HTTP handler | `../src/routes/ghl-webhook.ts` |
| Signature verify | `../src/services/ghl-webhook-signature.ts` |
| Spawn sync scripts | `../src/services/ghl-webhook-sync.ts` |
| Contact sync script | `../scripts/sync-ghl-contacts-to-supabase.mjs` |
| Billing sync script | `../scripts/sync-ghl-orders-invoices-to-supabase.mjs` |
| Env wiring | `../src/config/env.ts` |

## Related wiki

- [[GHL-Webhook-Pipeline]] — ordered steps inside the handler
- [[GHL-Webhook-Security]] — signatures, skip-verify, threat model (brief)
- [[Express-Raw-Webhook-Body]] — middleware ordering and payload integrity
- [[GHL-Sync-Operations]] — bulk vs webhook, processes, scale notes
- [[Supabase-GHL-Mirror]] — tables, migrations, dual-layer mirror idea
- [[SQL-First-Data-Layer]] — why normalized columns matter for GHL mirror (links repo doc)
- [[GoHighLevel]] — entity hub

## Open questions

- Whether to add `webhookId` dedupe store for multi-instance (product decision).
- When to replace child-process sync with in-process or queue (load threshold).
