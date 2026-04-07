# GHL sync operations

How **bulk** npm syncs relate to **webhook-driven** incremental sync in this repository.

## Two modes, same writers

| Mode | Entry | What runs |
|------|--------|-----------|
| Bulk backfill | `npm run sync-ghl-contacts`, `npm run sync-ghl-orders-invoices` | Scripts scan/list or batch from GHL API into Supabase |
| Webhook | `POST /api/webhooks/ghl` | Handler spawns the **same** scripts with `--contact-id`, `--order-id`, or `--invoice-id` |

So mirrors stay **consistent** with one implementation path per domain (contacts vs billing).

## Idempotency

- Re-delivered webhooks re-run upserts; with stable primary keys this is usually **safe**.
- If you need **exactly-once** side effects beyond DB upsert (emails, external APIs), consider a **dedupe store** keyed by `webhookId` (mentioned in `docs/ghl-webhooks.md`).

## Performance and architecture

- Today each accepted event **`spawn`s** a child `node` process (`../src/services/ghl-webhook-sync.ts`).
- **Tradeoff:** isolation and reuse of CLI scripts vs process overhead.
- **Scale:** doc suggests high volume may warrant **in-process** sync modules or a **job queue** worker.

## Deletes

- Only **contact** delete is handled in the webhook path (mirror row removed from `ghl_contacts`). Billing deletes are not described in the ingested doc; confirm with GHL event catalog if needed.

## Related

- [[GHL-Webhooks]] — operations notes from source
- [[GHL-Webhook-Pipeline]] — when spawn runs
- [[Supabase-GHL-Mirror]] — target schema
- [[GoHighLevel]] — vendor context
