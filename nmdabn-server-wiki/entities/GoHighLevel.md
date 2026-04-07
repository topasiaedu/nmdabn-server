# GoHighLevel (GHL)

**Entity:** CRM / marketing automation vendor whose **Marketplace app** sends webhooks to this server and whose **API** backs bulk and incremental sync scripts.

## Integration surfaces in this repo

| Surface | Description |
|---------|-------------|
| Webhooks | `POST /api/webhooks/ghl` — signed JSON, contact + billing events ([[GHL-Webhooks]]) |
| Private integration token | Used for GET-after-webhook and bulk sync (`GHL_PRIVATE_INTEGRATION_TOKEN`) |
| Location | `GHL_LOCATION_ID` scopes which sub-account’s events are processed |
| Payments API paths | Optional env overrides for orders/invoices endpoints |

## Wiki hub

- [[GHL-Webhook-Pipeline]] — request handling
- [[GHL-Webhook-Security]] — signatures
- [[GHL-Sync-Operations]] — bulk vs webhook
- [[Supabase-GHL-Mirror]] — where data lands

## External

- [Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html) — signing, headers, keys

## Notes

- Product naming varies (“HighLevel”, “GoHighLevel”, “GHL”); this vault uses **GHL** in page titles for brevity.
