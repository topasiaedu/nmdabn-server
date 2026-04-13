# Buyer journey — Zoom + GHL + first-party tracking

- Source type: `architecture / data plan`
- Snapshot date: `2026-04-07`

## Definition

**Buyer journey** = per-contact **timeline** of meaningful events, e.g.:

- Opt-in / lead created
- **Page views** and on-site funnel steps (**first-party tracking**)
- Webinar **registered** / **attended**; **minutes attended** (from **Zoom**)
- Comms milestones (optional): SMS/email/call as available
- Purchase / deposit / installment (from **GHL** or payments surfaces as modeled)

## Why first-party tracking code

**GoHighLevel** provides **CRM state**, **webhooks**, **conversations/messages**, **opportunities/payments** (depending on setup), but **not** a full **marketing-site page-view history** like a CDP. Therefore **page-level behavior** is captured with **our own tracker** → **our database**, with optional selective sync into GHL (custom fields / workflows) if desired.

**Zoom** provides **attendance** and **duration** via **Reports** APIs (e.g. webinar participant reports with join/leave/duration — subject to account type and OAuth scopes). Manual **Zoom export** today is the stand-in for the same facts.

**GHL** contributes **milestones** (tags, custom values, pipeline, orders) via **API and webhooks**; ingesting webhooks into an **event store** builds forward-looking history even when GHL UI does not expose a full unified timeline API.

## Data pattern

- **`journey_events`** (name flexible): `occurred_at`, `event_type`, `source_system` (`ghl` | `zoom` | `web` | `manual`), `payload` (JSON), stable **identity keys** for merge (contact id, email, etc.).
- **Showed** for dashboard alignment: **attended** per Zoom (export now, API later).
- **Minutes attended** from Zoom participant **duration** when available.

## Double-check notes (docs-aligned)

- **Zoom:** Participant **reports** endpoints document **join_time**, **leave_time**, **duration** (verify on current Zoom Developer documentation and your plan/scopes).
- **GHL:** **Conversations API** can list **messages** by conversation; useful for **comms** slice of journey, not web page views. **Webhooks** are the practical way to append CRM lifecycle events into our store.

## Phase alignment

- **Phase 1:** Dashboard truth + imports/sync; **design event model** so journey UI does not require a rewrite later.
- **Phase 2:** Push automation via GHL API (workflows, custom values, Zoom-related updates as designed).
