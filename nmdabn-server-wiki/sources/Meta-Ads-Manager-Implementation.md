# Meta Ads Manager — Implementation Record

**Raw:** `raw/sources/2026-04-22-meta-ads-manager-implementation.md`
**Repo:** `src/features/ads-manager/`, `src/services/meta-ads-sync.ts`, `src/services/optin-meta-attribution.ts`

## Summary

Full-featured Ads Manager dashboard mirroring Meta Ads Manager at Campaign → Ad Set → Ad levels. Meta Marketing API data is synced to Supabase and enriched with first-party `journey_events` lead counts for accurate CPL calculation. Budget (daily/lifetime) and CBO/ABO classification are displayed. Delivery status uses `effective_status` with a synthetic "Ads off" state for campaigns that are active but have no active child ads.

## Key facts

- Migrations 025–035 span the entire Meta Ads + tracking pixel + lead attribution work
- Three drill-down levels: campaign, adset, ad (controlled via `?level=` query param)
- Lead counts from `journey_events` take priority over Meta pixel leads (first-party > Meta pixel)
- Timezone: date filtering uses KL time (`+08:00`) to avoid UTC boundary mismatches
- "Ads off" = campaign `effective_status=ACTIVE` but no child ad with `effective_status=ACTIVE` — synthesized in sync service
- Budget in Meta API is returned in cents; `parseBudget` divides by 100
- `effective_status` must be appended to Graph API URL as raw string (not via `URLSearchParams`) to avoid bracket-encoding rejections
- FK constraints on Meta tables are `ON DELETE RESTRICT` (migration 030) to prevent accidental data wipe on disconnect
- Lead attribution: UTM → Meta entity ID via in-memory adset name matching with prefix-shortening fallback and dash normalization

## Open questions

- Meta breakdown insights (age, gender, placement) — schema ready, not yet synced/displayed
- `ad_spend_run_attribution` (migration 026) — schema exists, not yet populated
- Full funnel view (spend → opt-ins → show-ups → buyers → ROAS) — planned

## Related

- [[Meta-Ads-Manager-Dashboard]]
- [[Meta-Ads-Sync]]
- [[Lead-Attribution-Pipeline]]
- [[GHL-ContactCreate-Optin-Hook]]
- [[Supabase-GHL-Mirror]]
- [[Buyer-Journey-Event-Store]]
- `../src/services/meta-ads-sync.ts`
- `../src/services/optin-meta-attribution.ts`
- `../app/api/dashboard/ads-manager/route.ts`
