# Meta Ads Manager — Implementation Record

**Date:** 2026-04-22
**Status:** Shipped. Covers work across multiple sessions from approximately 2026-04-17 to 2026-04-22.

---

## 1. Feature Overview

A full-featured Ads Manager dashboard embedded into the existing Next.js app (App Router), mirroring the structure of Meta Ads Manager at three drill-down levels: Campaign → Ad Set → Ad. Data is pulled from the Meta Marketing API, stored in Supabase, and enriched with first-party `journey_events` lead counts for accurate CPL (cost-per-lead) calculation.

---

## 2. Database Migrations (025–035)

| Migration | Purpose |
|-----------|---------|
| `025_meta_ads_mirror.sql` | `meta_campaigns`, `project_meta_ad_accounts` linking table, FK plumbing |
| `026_meta_spend_attribution.sql` | `ad_spend_run_attribution` — links spend to webinar runs (future) |
| `027_agency_rpc_with_spend.sql` | Updates `get_agency_all_runs` to include ad spend data |
| `028_meta_adsets_ads_insights.sql` | `meta_adsets`, `meta_ads`, `meta_adset_insights`, `meta_ad_insights` tables |
| `029_insight_leads_column.sql` | Adds `leads` column to all insight tables (Meta pixel lead events) |
| `030_fix_meta_fk_no_cascade.sql` | Changes FK constraints on Meta tables to `ON DELETE RESTRICT` (prevents accidental data wipe when unlinking an ad account) |
| `031_pixel_event_columns.sql` | Adds landing page view, purchase, purchase value columns to insight tables |
| `032_journey_events_meta_attribution.sql` | Adds `meta_adset_id`, `meta_campaign_id`, `meta_ad_id`, `meta_attribution_method` to `journey_events` |
| `033_page_events.sql` | New `page_events` table for first-party tracking pixel (see separate tracking pixel design doc) |
| `034_journey_events_ghl_webhook_unique.sql` | Unique index on `(contact_id, event_type, source_system)` for GHL webhook optin upserts |
| `035_meta_campaigns_budget.sql` | Adds `daily_budget`, `lifetime_budget`, `is_cbo` to `meta_campaigns` |

---

## 3. Meta API Sync Service (`src/services/meta-ads-sync.ts`)

### What it syncs

For each connected `project_meta_ad_accounts` row, it fetches and upserts:
- **Campaigns** — `effective_status`, `name`, `objective`, `daily_budget`, `lifetime_budget`, `is_cbo` (derived from budget presence on campaign)
- **Ad Sets** — `effective_status`, `name`, `campaign_id`, `daily_budget`, `lifetime_budget`
- **Ads** — `effective_status`, `name`, `adset_id`
- **Campaign-level insights** — spend, impressions, clicks, reach, CPM, CPC, CTR, leads (pixel), purchases, purchase_value, landing_page_views; date-range windowed
- **Ad Set-level insights** — same fields
- **Ad-level insights** — same fields

### Key implementation decisions

**`effective_status` vs `status`:** Meta's `status` field reflects what the user set (e.g. ACTIVE), but `effective_status` reflects actual delivery (e.g. CAMPAIGN_PAUSED if parent is paused). All upserts store `effective_status` in the `status` column.

**"Ads off" synthesis:** Meta Ads Manager UI shows "Ads off" when a campaign is `effective_status=ACTIVE` but has no child ads with `effective_status=ACTIVE`. This is a UI label, not an API value. The sync service builds a `Set` of campaign IDs that have at least one active ad, and synthetically sets `status = "ADS_OFF"` on campaigns that are active but outside this set.

**`effective_status` URL encoding bug:** Meta's Graph API requires `effective_status=["ACTIVE","PAUSED",...]` with literal square brackets. `URLSearchParams` encodes these as `%5B%5D`, which the API rejects. Fix: append the `effective_status` parameter as a raw template string to the URL, bypassing `URLSearchParams` for that specific parameter. `"DELETED"` was removed from the filter list (API rejects it).

**Budget parsing:** Meta returns budgets in cents (integer). A `parseBudget` helper divides by 100 to get the human-readable value (e.g. `4000` → `40.00`). `is_cbo` is derived as `true` if a campaign has `daily_budget` or `lifetime_budget` set at the campaign level (Meta's CBO stores budget on the campaign, ABO stores it on ad sets).

**Video metrics removed:** `video_thruplay_watched` is not a valid Meta Ads Insights API field and was removed. `video_views` was also removed for simplicity.

### Graceful fallback

If the Meta API returns `(#200) Ad account owner has NOT granted ads_management or ads_read permission`, the error is logged and sync continues for other accounts rather than crashing.

---

## 4. Meta OAuth Integration

### Scopes

`ads_read`, `ads_management` — both required; `ads_management` was added after initial deployment when read-only scope failed.

### Disconnection safety

The `DELETE /api/projects/[id]/connections/meta` endpoint only removes the `project_meta_ad_accounts` row. It does **not** cascade-delete `meta_campaigns`, `meta_adsets`, `meta_ads`, or insights. This was a critical bug fix: the original cascade-delete design wiped all synced historical data on disconnect. Migration 030 changed the FK constraints to `ON DELETE RESTRICT` as an additional safeguard.

---

## 5. Ads Manager Dashboard (`src/features/ads-manager/`)

### Levels

Three drill-down levels controlled by `?level=campaign|adset|ad` query param:
- **Campaign level** — default view; one row per campaign
- **Ad Set level** — filtered by `?campaign_id=`
- **Ad level** — filtered by `?adset_id=`

### TypeScript types

```typescript
type AdsManagerLevel = "campaign" | "adset" | "ad";

type AdsManagerRow = {
  id: string;
  name: string;
  status: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  leads: number | null;
  cost_per_lead: number | null;
  purchases: number | null;
  purchase_value: number | null;
  roas: number | null;
  landing_page_views: number | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  is_cbo: boolean | null;
};
```

### Lead counts: journey_events takes priority

The dashboard queries both Meta pixel `leads` from `meta_*_insights` AND `journey_events` opt-in counts. `journey_events` counts are overlaid on Meta pixel data, since first-party data is more reliable. Attribution works down to the campaign/adset/ad level depending on what `meta_*_id` columns are populated on each `journey_events` row.

**Timezone fix:** Date filtering uses KL time (`+08:00`) boundaries, not UTC, so that events from e.g. 08:00 KL on April 21 are not counted as April 20 UTC.

**Unattributed leads:** The KPI summary bar shows the *total* opt-in count from `journey_events` (including leads with no Meta attribution), while per-row lead counts are limited to what can be attributed to each campaign/adset/ad.

### Budget display

A `BudgetCell` component renders:
- Daily budget formatted as currency
- Lifetime budget formatted as currency (alternative to daily)
- `CBO` or `ABO` badge (CBO = budget set at campaign level; ABO = budget set at ad set level)

### Status display and filtering

Status badges with colour coding:
- `ACTIVE` → green
- `PAUSED` → yellow
- `ADS_OFF` → orange (synthetic — campaign is technically active but no child ads running)
- Others → grey

Status filter pills: All / Active / Paused / Ads off

### Sorting and summary

Client-side sorting on all numeric columns plus name and status. KPI summary bar above the table shows totals/averages for spend, impressions, CTR, CPL across all filtered rows.

---

## 6. Lead Attribution Pipeline

### Backfill strategy

UTM parameters in `journey_events` (`utm_source`, `utm_campaign`, `utm_content`) are mapped to Meta entity IDs via `src/services/optin-meta-attribution.ts`. The service:

1. Loads all `meta_adsets` for the project into memory (`preloadMetaEntitiesForProject`)
2. For each opt-in: checks if `utm_source` looks like a Meta Ad ID (numeric 15+ digits) — if so, maps directly to `meta_ad_id`
3. If not a direct ID, decomposes `utm_content` into a prefix and country code (e.g. `GT1_Apple_FB_MY` → prefix `GT1_Apple_FB`, country `MY`), then does case-insensitive substring matching against adset names
4. Fallback: if no match with full prefix, drops the last `_`-separated segment and retries once (handles cases like `GT1_Lookalike 1-3%_FB_Video_Sharma (MY)` where the adset name has additional words between UTM segments)
5. Dash-normalization: if `utm_content` has no underscores but has dashes (legacy), normalizes dashes to underscores before decomposition

### attribution_method column

`meta_attribution_method` on `journey_events` stores either `'ad_id'` (direct numeric match) or `'name_match'` (substring match).

### Scripts

- `scripts/backfill-optin-meta-attribution.mjs` — dry run by default, `--apply` to write. Processed approximately 2,600+ rows for Dr Jasmine project.
- `scripts/debug-adset-names.mjs` — diagnostic: lists all adsets and shows unmatched journey_events opt-ins.

### Moving-forward: GHL ContactCreate webhook

`src/services/ghl-contact-optin-journey.ts` is called in `ghl-webhook-post.ts` whenever `event_type === "ContactCreate"`. It reads the new contact's `raw_json.contact.attributionSource` UTMs, resolves Meta attribution, and upserts a `journey_events` row with `source_system='ghl_webhook'`. Idempotency via unique index (migration 034).

### GHL custom webhook for repeat opt-ins

`app/api/webhooks/ghl/optin/route.ts` — receives custom GHL Workflow payloads for all opt-ins (including repeat submissions, which `ContactCreate` does not cover). The webhook parses GHL contact ID and UTMs from the payload, resolves Meta attribution, and upserts `journey_events`.

---

## 7. CSV Import Optimization

The import pipeline (`src/services/optin-journey-import.ts`) was refactored to:
- Pre-load all Meta entities for the project into memory before processing rows (avoids N+1 DB queries)
- Process rows concurrently with a pool size of 10 (avoids sequential processing)

Result: import time reduced from several minutes to seconds for typical CSV sizes.

---

## 8. Key Files

| File | Change |
|------|--------|
| `src/services/meta-ads-sync.ts` | Core Meta sync service — campaigns, adsets, ads, insights; budget/CBO; effective_status; "Ads off" synthesis |
| `src/services/optin-meta-attribution.ts` | UTM → Meta entity ID resolution; in-memory preload; fallback prefix matching; dash normalization |
| `src/services/optin-journey-import.ts` | CSV import with concurrency pool and in-memory Meta entity preload |
| `src/services/ghl-contact-optin-journey.ts` | ContactCreate → journey_event upsert with Meta attribution |
| `src/services/ghl-webhook-post.ts` | Updated: calls ghl-contact-optin-journey on ContactCreate |
| `app/api/dashboard/ads-manager/route.ts` | Main Ads Manager API: queries all three insight levels, overlays journey_events leads, builds summary |
| `app/api/auth/meta/authorize/route.ts` | Meta OAuth: added ads_management scope |
| `app/api/projects/[id]/connections/meta/route.ts` | Meta account connect/disconnect (DELETE safe — no cascade) |
| `app/api/webhooks/ghl/optin/route.ts` | Custom GHL webhook for repeat opt-ins |
| `src/features/ads-manager/AdsManagerDashboardPage.tsx` | Dashboard UI: BudgetCell, status badges, ADS_OFF filter pill |
| `src/features/ads-manager/types/index.ts` | TypeScript types: AdsManagerRow, AdsManagerLevel, AdsManagerPayload |
| `src/features/ads-manager/services/api.ts` | Client-side fetch wrapper for Ads Manager API |
| `src/database.types.ts` | Updated: meta tables, journey_events attribution columns, page_events, meta_campaigns budget columns |
| `scripts/backfill-optin-meta-attribution.mjs` | Backfill script: UTM → Meta ID for historical journey_events |
| `scripts/debug-adset-names.mjs` | Diagnostic: shows adset name list and unmatched journey_events |

---

## 9. Open / Future

- Meta breakdown insights (age, gender, country, placement, device) — not yet synced or displayed
- Full funnel view (spend → opt-ins → show ups → buyers → ROAS) — planned
- `ad_spend_run_attribution` table (migration 026) — schema exists, not yet populated
