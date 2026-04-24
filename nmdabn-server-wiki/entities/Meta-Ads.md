# Meta (Facebook) Ads

## Vendor overview

Meta's advertising platform accessed via the Meta Marketing API (Graph API v17+). Provides campaign, ad set, and ad management alongside an Insights API for spend, impressions, clicks, pixel events, and more.

## How it integrates here

### OAuth and account linking

- OAuth scope: `ads_read` + `ads_management`
- Each project links to one or more Meta ad accounts via `project_meta_ad_accounts`
- Token stored per account; refreshed manually (no automatic token refresh in current implementation)
- Manage connections at: `/settings/projects/[id]` → Meta Connections tab

### Sync service

See [[Meta-Ads-Sync]] for the full sync implementation details (campaigns, adsets, ads, insights, effective_status, "Ads off" synthesis, budget parsing).

### Dashboard

See [[Meta-Ads-Manager-Dashboard]] for the Ads Manager dashboard implementation (drill-down levels, CPL, budget display, status badges).

### Lead attribution

See [[Lead-Attribution-Pipeline]] for UTM → Meta entity ID resolution (ad_id path and name_match path).

## Key API facts

- Budgets returned in **cents** (divide by 100 for display value)
- `effective_status` reflects actual delivery state (prefer over `status`)
- `effective_status` filter must be appended as raw string to URL (URLSearchParams breaks bracket encoding)
- `"DELETED"` must not be included in `effective_status` filter arrays (API rejects it)
- `video_thruplay_watched` is not a valid Insights API field
- "Ads off" is a UI label — not returned by the API; must be synthesized

## DB tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| `project_meta_ad_accounts` | 025 | Links project to Meta ad account; stores access_token |
| `meta_campaigns` | 025, 035 | Campaigns; `daily_budget`, `lifetime_budget`, `is_cbo` |
| `meta_adsets` | 028 | Ad sets; `daily_budget`, `lifetime_budget` |
| `meta_ads` | 028 | Ads |
| `meta_adset_insights` | 028, 029, 031 | Per-adset daily insight rows |
| `meta_ad_insights` | 028, 029, 031 | Per-ad daily insight rows |
| `ad_spend_run_attribution` | 026 | Links spend to webinar runs (future use) |

## Related

- [[Meta-Ads-Sync]]
- [[Meta-Ads-Manager-Dashboard]]
- [[Lead-Attribution-Pipeline]]
- [[Supabase-GHL-Mirror]]
- `../docs/database/migrations/025_meta_ads_mirror.sql`
- `../docs/database/migrations/028_meta_adsets_ads_insights.sql`
- `../docs/database/migrations/035_meta_campaigns_budget.sql`
