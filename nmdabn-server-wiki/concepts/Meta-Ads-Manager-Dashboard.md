# Meta Ads Manager Dashboard

## Definition / scope

A full-featured, read-only Ads Manager dashboard embedded in the Next.js app at `/ads-manager`. Mirrors Meta Ads Manager's three-level hierarchy: Campaign → Ad Set → Ad. Data comes from synced Meta API data enriched with first-party `journey_events` lead counts for accurate CPL (cost-per-lead) reporting.

## How it works here

### Levels and navigation

Controlled by `?level=campaign|adset|ad` query param. Drill-down:
- Campaign list → click row → Ad Set list for that campaign (`?level=adset&campaign_id=…`)
- Ad Set list → click row → Ad list for that ad set (`?level=ad&adset_id=…`)

### API route (`app/api/dashboard/ads-manager/route.ts`)

Accepts: `project_id`, `date_from`, `date_to`, `level`, `campaign_id` (for adset), `adset_id` (for ad).

For each level, the route:
1. Queries the relevant `meta_*_insights` table for the date range
2. Queries `journey_events` for opt-in counts attributed to each entity (campaign/adset/ad) in KL timezone
3. Overlays journey opt-in counts over Meta pixel leads (first-party takes priority)
4. Returns rows + KPI summary

**Unattributed leads:** The KPI summary bar uses the *total* opt-in count from `journey_events` (including leads with no Meta attribution), not just attributed leads.

**Timezone:** Date boundaries use `T00:00:00+08:00` / `T23:59:59+08:00` (KL, UTC+8) to avoid UTC midnight cut-off mismatches.

### Feature: AdsManagerRow type

```typescript
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
  leads: number | null;            // from journey_events (primary) or Meta pixel
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

### Budget display

`BudgetCell` component shows:
- Daily or lifetime budget (whichever is set)
- `CBO` badge if `is_cbo = true` (campaign-level budget)
- `ABO` badge if `is_cbo = false` (ad set-level budget)
- `—` if neither budget is set

### Status badges

| `status` value | Display | Colour |
|---|---|---|
| `ACTIVE` | Active | Green |
| `PAUSED` | Paused | Yellow |
| `ADS_OFF` | Ads off | Orange (synthetic — see [[Meta-Ads-Sync]]) |
| Other | Raw value | Grey |

Status filter pills: All / Active / Paused / Ads off

### Sorting

Client-side sort on: name, status, spend, impressions, clicks, CTR, CPM, CPC, leads, CPL, purchases, purchase_value, ROAS, landing_page_views, daily_budget.

### KPI summary bar

Displays across all visible rows: total spend, total impressions, avg CTR, avg CPL, total leads. Total leads uses `journeyLeadsTotal` (unattributed + attributed) when available.

## Related

- [[Meta-Ads-Sync]]
- [[Lead-Attribution-Pipeline]]
- [[Buyer-Journey-Event-Store]]
- [[Meta-Ads-Manager-Implementation]] (source)
- `../src/features/ads-manager/AdsManagerDashboardPage.tsx`
- `../src/features/ads-manager/types/index.ts`
- `../app/api/dashboard/ads-manager/route.ts`

## Contradictions / history

- Initial design relied solely on Meta pixel `leads` field — superseded by `journey_events` overlay (2026-04-22).
- Date filtering initially used UTC — superseded by KL timezone fix (2026-04-22).
