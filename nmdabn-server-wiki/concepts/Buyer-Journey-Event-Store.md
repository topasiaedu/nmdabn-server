# Buyer journey event store

Architecture pattern for a unified per-contact timeline from Zoom, GHL, first-party web, and manual sources.

## Why not “only GHL”

GHL gives CRM state, webhooks, and conversations—not a substitute for **full site page-view history**. First-party events land in **our** database; optional selective push to GHL custom fields/workflows.

## Suggested shape

- Table (name flexible): **`journey_events`**
  - `occurred_at`
  - `event_type`
  - `source_system`: `ghl` \| `zoom` \| `web` \| `manual`
  - `payload` (JSON) for vendor-specific fields
  - Identity for merge: GHL contact id, normalized email, etc.

## Ingest paths

- **GHL:** webhooks (and API where needed) append lifecycle events.
- **Zoom:** Reports API for join/leave/duration (verify current Zoom docs and scopes); **manual export** acceptable in Phase 1 as stand-in.
- **Web:** first-party tracker POSTs or server-side events.

## Dashboard alignment

- **Showed** = Zoom attended fact in the event stream (or derived aggregate).
- Phase 1 should **fix the schema** so a journey UI later is additive, not a rewrite.

## Related

- [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]]
- [[Product-Phase-Roadmap]]
- [[GHL-Webhook-Pipeline]]
- [[Zoom]] · [[GoHighLevel]]
