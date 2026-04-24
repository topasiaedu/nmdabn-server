# Meta Ads Sync

## Definition / scope

`src/services/meta-ads-sync.ts` — service that connects to the Meta Marketing API and upserts campaign/adset/ad metadata and time-windowed insights into Supabase. Triggered manually via the Sync button in the Ads Manager dashboard or via a future cron job.

## How it works here

### Account linkage

Each project links to Meta ad accounts via `project_meta_ad_accounts` (migration 025). Sync runs per account, keyed by `account_id` (e.g. `act_12345`).

### Data fetched

For each ad account and date range:

| Entity | Fields |
|--------|--------|
| Campaigns | id, name, effective_status, daily_budget, lifetime_budget |
| Ad Sets | id, name, campaign_id, effective_status, daily_budget, lifetime_budget |
| Ads | id, name, adset_id, effective_status |
| Insights (all 3 levels) | spend, impressions, clicks, reach, cpm, cpc, ctr, leads, purchases, purchase_value, landing_page_views |

### `effective_status` and the "Ads off" synthesis

Meta's API `effective_status` for campaigns can return `"ACTIVE"` even when Meta Ads Manager UI shows "Ads off" (all child ads paused or inactive). The sync service handles this:

1. Fetches all ads first (before campaigns)
2. Builds a `Set<string>` of campaign IDs that have at least one ad with `effective_status="ACTIVE"`
3. When upserting campaigns: if a campaign's `effective_status = "ACTIVE"` but it is NOT in this set, stores `status = "ADS_OFF"` instead

This matches what Meta Ads Manager UI displays as "Delivery: Ads off".

### Budget parsing

Meta returns budget values in **cents** (integer). The `parseBudget` helper divides by 100:

```typescript
function parseBudget(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : null;
  return n !== null && isFinite(n) ? n / 100 : null;
}
```

`is_cbo` is `true` if the campaign itself has a `daily_budget` or `lifetime_budget` (Campaign Budget Optimization). Otherwise `false` (Ad Set Budget Optimization — budgets on ad sets).

### URL encoding gotcha

`URLSearchParams` encodes `["ACTIVE","PAUSED"]` as `%5B%22ACTIVE%22%2C%22PAUSED%22%5D`, which Meta's API rejects. The `effective_status` parameter is appended as a raw template string:

```typescript
const url = `...?${params.toString()}&effective_status=["ACTIVE","PAUSED","CAMPAIGN_PAUSED"]`;
```

`"DELETED"` is excluded (Meta rejects it in `effective_status` filters).

### OAuth scopes

`ads_read` + `ads_management` — both required. Token stored in `project_meta_ad_accounts.access_token`.

### Graceful fallback

Meta API errors (e.g. missing permissions) are logged and do not crash the sync. The service continues with other accounts.

### Disconnection safety

`DELETE /api/projects/[id]/connections/meta` removes only the `project_meta_ad_accounts` row. Meta data tables (`meta_campaigns`, etc.) have `ON DELETE RESTRICT` FKs (migration 030), so historical data is preserved even after unlinking an account.

## Related

- [[Meta-Ads-Manager-Dashboard]]
- [[Lead-Attribution-Pipeline]]
- [[Meta-Ads-Manager-Implementation]] (source)
- `../src/services/meta-ads-sync.ts`
- `../docs/database/migrations/025_meta_ads_mirror.sql`
- `../docs/database/migrations/028_meta_adsets_ads_insights.sql`
- `../docs/database/migrations/030_fix_meta_fk_no_cascade.sql`
- `../docs/database/migrations/035_meta_campaigns_budget.sql`
- [[entities/Meta-Ads]]

## Contradictions / history

- Initially used `navigator.sendBeacon` in tracker; changed to `fetch(...keepalive)` to resolve CORS.
- `budget_rebalance_flag` was initially fetched from the campaigns endpoint — removed; it is not a valid field name.
- `video_thruplay_watched` was initially fetched — removed; it is not a valid Insights API field.
- `video_views` removed for simplicity.
