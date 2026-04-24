# GHL ContactCreate → Optin Journey Hook

## Definition / scope

When GHL fires a `ContactCreate` webhook (new contact created in the CRM), the server automatically creates a `journey_events` row for the opt-in event, resolving Meta ad attribution from the contact's UTM data. This closes the real-time lead capture gap without requiring GHL Workflow setup.

## How it works here

### Flow

```
GHL ContactCreate webhook
  → ghl-webhook-post.ts (CONTACT_UPSERT_TYPES branch)
    → runGhlContactSyncForContactId (sync contact to ghl_contacts)
    → assignNextWebinarRunForContactId
    → createOptinJourneyEventForContact (only on ContactCreate)
```

### Service: `src/services/ghl-contact-optin-journey.ts`

1. Reads contact row from `ghl_contacts` (id, project_id, location_id, raw_json)
2. Extracts `raw_json.contact.attributionSource` — fields: `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`
3. Extracts `raw_json.contact.dateAdded` for stable `occurred_at` (avoids drift if webhook fires twice)
4. Calls `loadIntegrationAccountIdsForProject` + `resolveMetaAttributionFromUtm` to resolve Meta entity IDs
5. Upserts into `journey_events` with `event_type='optin'`, `source_system='ghl_webhook'`

### Idempotency

Migration `034_journey_events_ghl_webhook_unique.sql` adds a unique index on `(contact_id, event_type, source_system)` for rows where `event_type='optin'` AND `source_system='ghl_webhook'`. The upsert uses `onConflict: "contact_id,event_type,source_system"`, so re-delivery of the same webhook is a no-op.

### Limitation: ContactCreate only fires once

`ContactCreate` fires only on the first opt-in for a contact. For repeat opt-ins (e.g. the same contact re-registers), use the custom GHL Workflow webhook at `app/api/webhooks/ghl/optin/route.ts`, which fires on every opt-in event.

### Custom GHL opt-in webhook (`app/api/webhooks/ghl/optin/route.ts`)

Receives GHL Workflow-triggered payloads for all opt-ins (including repeat submissions). Same attribution resolution and journey_events upsert logic as the ContactCreate hook. Configured via a GHL Workflow with a Webhook action.

## Related

- [[Lead-Attribution-Pipeline]]
- [[Buyer-Journey-Event-Store]]
- [[GHL-Webhook-Pipeline]]
- [[First-Party-Tracking-Pixel]]
- `../src/services/ghl-contact-optin-journey.ts`
- `../src/services/ghl-webhook-post.ts`
- `../app/api/webhooks/ghl/optin/route.ts`
- `../docs/database/migrations/034_journey_events_ghl_webhook_unique.sql`
