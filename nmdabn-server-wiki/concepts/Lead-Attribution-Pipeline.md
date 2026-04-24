# Lead Attribution Pipeline

## Definition / scope

The process of mapping a `journey_events` opt-in row to the specific Meta campaign, ad set, and ad that drove the visitor. Attribution flows through two paths: direct Meta Ad ID match (when `utm_source` contains a numeric Meta ad ID) or name-match (substring matching `utm_campaign`/`utm_content` against stored adset names). Historical rows are backfilled via a script; new rows are attributed in real time by the GHL ContactCreate hook.

## How it works here

### Attribution columns (migration 032)

`journey_events` gained four columns:
- `meta_campaign_id TEXT`
- `meta_adset_id TEXT`
- `meta_ad_id TEXT`
- `meta_attribution_method TEXT CHECK IN ('ad_id', 'name_match')`

### Service: `src/services/optin-meta-attribution.ts`

**`preloadMetaEntitiesForProject(supabase, projectId)`**
Loads all `meta_adsets` + parent `meta_campaigns` for the project into memory. Called once per import/backfill run to avoid N+1 queries.

**`resolveMetaAttributionFromUtm(supabase, { utmSource, utmContent, utmCampaign, integrationAccountIds })`**
Resolution order:
1. `ad_id` path: if `utmSource` looks like a numeric Meta Ad ID (15+ digits), resolve adset/campaign via `meta_ads` FK chain.
2. `name_match` path: decompose `utm_content` into `{ prefix, country }` — e.g. `GT1_Apple_FB_MY` → prefix `GT1_Apple_FB`, country `MY`. Case-insensitive substring match against `meta_adsets.name`. Country check is loose (`nameLower.includes(country)`) to handle variations like `(MY & SG)`.
3. Prefix-shortening fallback: if no match with full prefix, drop the last `_`-separated segment and retry once. This handles adset names with additional words between UTM segments (e.g. `GT1_Lookalike 1-3%_FB_Video_Sharma (MY)` matched by `GT1_Lookalike` after dropping `_FB`).
4. Dash normalization: if `utm_content` has no underscores but contains dashes (legacy format), replaces dashes with underscores before decomposition.

### Backfill script

`scripts/backfill-optin-meta-attribution.mjs` — dry run by default, `--apply` to commit writes.
- Loads all unattributed journey opt-ins for a project
- Runs the same in-memory resolution logic
- Prints match/no-match summary

### Real-time path (moving forward)

New opt-ins are attributed immediately via:
1. **`ContactCreate` webhook** → `createOptinJourneyEventForContact` (see [[GHL-ContactCreate-Optin-Hook]])
2. **Custom GHL Workflow webhook** → `app/api/webhooks/ghl/optin/route.ts` (for repeat opt-ins)

The marketer agreed to set `utm_source = ads.id` (Meta ad ID) for new ads, enabling the faster `ad_id` path.

### UTM naming convention (name_match)

Pattern: `{brand}_{angle}_{platform}_{country}` — e.g. `GT1_Apple_FB_MY`.

Components:
- `utm_campaign` → campaign-level descriptor (e.g. `insulinresistance`)
- `utm_content` → adset-level descriptor (e.g. `GT1_Apple_FB_MY`)

The decompose function splits on `_`, treating the last segment as country code and everything before the last `_` as the prefix to match against adset names.

### Dashboard integration

`app/api/dashboard/ads-manager/route.ts` queries `journey_events` with the three `meta_*_id` columns to aggregate lead counts per campaign/adset/ad. These counts overlay Meta pixel data (first-party > Meta pixel). Timezone: KL `+08:00` applied to date range to avoid UTC boundary miscount.

## Related

- [[Meta-Ads-Sync]]
- [[Meta-Ads-Manager-Dashboard]]
- [[GHL-ContactCreate-Optin-Hook]]
- [[Buyer-Journey-Event-Store]]
- `../src/services/optin-meta-attribution.ts`
- `../src/services/optin-journey-import.ts`
- `../scripts/backfill-optin-meta-attribution.mjs`
- `../scripts/debug-adset-names.mjs`
- `../docs/database/migrations/032_journey_events_meta_attribution.sql`
