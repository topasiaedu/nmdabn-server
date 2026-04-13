# Buyer journey — Zoom + GHL + first-party tracking

**Raw:** [2026-04-07-buyer-journey-tracking-zoom-ghl-first-party.md](../raw/sources/2026-04-07-buyer-journey-tracking-zoom-ghl-first-party.md)

## Summary

**Buyer journey** = per-contact **timeline** of meaningful events: opt-in, first-party page views, Zoom register/attend/duration, optional comms milestones, purchase/deposit/installment from GHL/payments as modeled.

## System roles

| System | Role |
|--------|------|
| **First-party tracker** | Page views and on-site steps → **our DB** (GHL is not a full CDP for web analytics). |
| **Zoom** | Attendance and duration via **Reports** APIs (or manual export stand-in today). |
| **GHL** | CRM milestones via API + **webhooks** into an event-oriented store for forward history. |

## Data pattern (from raw)

- Suggested table shape: `journey_events` (name flexible): `occurred_at`, `event_type`, `source_system` (`ghl` \| `zoom` \| `web` \| `manual`), `payload` (JSON), stable identity keys for merge (contact id, email, etc.).
- **Showed** for dashboard: **attended** per Zoom; **minutes** from participant duration when available.

## Phase alignment

- **Phase 1:** Dashboard truth + imports/sync; **design event model** so journey UI does not require a rewrite later.
- **Phase 2:** GHL API automation (workflows, custom values, Zoom-related updates).

## Related wiki

- [[Buyer-Journey-Event-Store]]
- [[Product-Phase-Roadmap]]
- [[Sales-Tracking-Dashboard-Spec-From-Sheet-Exports]]
- [[Zoom]] · [[GoHighLevel]]
