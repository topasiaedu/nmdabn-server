# Phase 1 open decisions

## Definition / scope

Decisions that are unresolved as of 2026-04-13 and block specific steps of [[Phase-1-Build-Order]]. Each item must be resolved before the step that depends on it is started. This page is a living record — strike through and date items when resolved.

## Open decision register

### 1. Ad spend data source
**Status: RESOLVED 2026-04-22 — Meta Ads API integration shipped.**

Ad spend is now pulled from the Meta Marketing API via `src/services/meta-ads-sync.ts` and stored in `meta_campaign_insights`, `meta_adset_insights`, `meta_ad_insights`. The `ad_spend_run_attribution` table (migration 026) schema exists for future linkage of spend to webinar runs; not yet populated.

~~The Agency dashboard requires spend figures (CPL, CPA) per agency line per webinar run. The `ghl_orders` + `ghl_invoices` tables capture revenue, but **ad spend (cost)** has no current data source.~~ See [[Meta-Ads-Manager-Dashboard]] and [[Meta-Ads-Sync]].

---

### 2. "Showed" percentage denominator
**Blocks:** Step 6 Show Up RPC (the denominator affects SQL).

The Show Up dashboard displays a "showed %" metric. The denominator is not yet signed off:
- **% of total leads** — contacts with the matching `webinar_run_id` (regardless of registration)
- **% of registrants** — contacts who registered for the Zoom event (requires Zoom registrant data, not just participants)
- **% of Zoom attendees** — not a %, this _is_ the "showed" count; denominator would be total leads as above

Current assumption: **showed = Zoom attended fact in `journey_events`**; denominator = total leads for that run + line. Needs final sign-off before Show Up RPC is written.

---

### 3. `client_secret` encryption approach
**Blocks:** Step 3 infrastructure hygiene + Step 4 Zoom integration going to production.

Zoom S2S `client_secret` (and future GHL API tokens in `ghl_connections`) must be encrypted at rest. Two viable options:

| Option | Notes |
|--------|-------|
| **AES-256-GCM** with an app-level env key (`ENCRYPTION_KEY`) | Self-contained; key rotation requires re-encrypting all rows; simpler to implement |
| **Supabase Vault** | Managed key storage; native to Supabase stack; slightly more setup |

A choice must be made before any credentials are written to production database. Affects `ghl_connections.api_token` and `integration_accounts.client_secret`.

---

### 4. Webinar run backfill scope on new run creation
**Blocks:** Step 5 webinar run management UI (the "save" button behaviour).

When an operator creates a new `webinar_run`, the system must decide which contacts to (re-)assign:
- **Option A:** assign only contacts whose `webinar_run_id IS NULL` (previously unmatched)
- **Option B:** recalculate all contacts for the location — contacts previously assigned to a future run might shift if the new run is earlier

Option B is more correct but can be slow for large contact lists. Option A is faster but may miss edge cases. The backfill RPC `backfill_webinar_runs_for_location` already recalculates all (Option B behaviour); the question is whether the UI trigger should use it or a lighter variant.

---

## Resolved decisions (for reference)

| Decision | Resolution | Date |
|----------|-----------|------|
| Zoom integration approach (manual vs API) | Go straight to full S2S API integration; skip manual import | 2026-04-13 |
| Zoom meeting disambiguation | Option A — explicit `zoom_meeting_id` on `webinar_run` | 2026-04-13 |
| Multi-day run Zoom IDs | Single `zoom_meeting_id` per run | 2026-04-13 |
| Zoom credential type | Server-to-Server OAuth | 2026-04-13 |
| Per-project Zoom accounts | `projects.zoom_integration_account_id` FK to `integration_accounts` | 2026-04-13 |
| Attendance storage | `journey_events` (not a separate `zoom_participants` table) | 2026-04-13 |
| `zoom_source_type` field | Required on `webinar_runs` when `zoom_meeting_id` is set; `CHECK IN ('meeting', 'webinar')` | 2026-04-13 |
| Ad spend data source | Meta Ads API integration shipped (migrations 025–031); `ad_spend_run_attribution` schema ready for webinar run linkage | 2026-04-22 |

## Related

- [[Phase-1-Build-Order]]
- [[Phase-1-Execution-Plan-And-Zoom-Design]]
- [[Zoom-Integration-Architecture]]
- [[Sales-Tracking-Dashboard-Model]]
- [[Buyer-Journey-Event-Store]]
