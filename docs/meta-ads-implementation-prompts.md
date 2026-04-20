# Meta Ads Integration — Implementation Prompts

Five sequential agent prompts to implement the Meta Ads integration described in `docs/meta-ads-integration.md`. Run them in order. Each prompt is self-contained with the context the agent needs.

**After Prompts 1–2 are applied in the Supabase SQL Editor, regenerate `src/database.types.ts` before running Prompts 3–5.** The regeneration is a manual step: run your Supabase typegen command (e.g. `npx supabase gen types typescript --project-id <id> > src/database.types.ts`) against the live schema.

---

## Prompt 1 — Database migrations 025 and 026

```
You are implementing the Meta Ads integration for an existing Next.js + Supabase application called nmdabn-server.

## Project context

This is a marketing analytics platform. It mirrors GHL (GoHighLevel) CRM data and Zoom attendance data into Supabase (Postgres), and serves four dashboards: Traffic, Show Up, Buyer Behavior, and Agency. The Agency dashboard currently returns NULL for ad_spend, cpl, and cpa because there is no ad spend data source yet. These migrations add the Meta Ads data layer to fix that.

The stack: Next.js App Router, Supabase, TypeScript. All SQL lives in `docs/database/migrations/` as ordered files.

## Read these files first (they are the full context you need)

- `docs/meta-ads-integration.md` — the full design spec for this feature (READ THIS FIRST)
- `docs/database/README.md` — the migration manifest you must update
- `docs/database/migrations/016_agency_rpc.sql` — current Agency RPC with NULL spend (so you understand what you are feeding)
- `docs/database/migrations/020_all_runs_rpcs.sql` — the all-runs Agency RPC (lines 542–675)
- `docs/database/migrations/012_webinar_runs_zoom_and_project_zoom_account.sql` — how integration_provider enum and integration_accounts were created (so you can safely extend the enum)
- `docs/database/migrations/006_webinar_runs_and_contact_fk.sql` — current webinar_runs schema (so you know which columns already exist)
- `docs/database/migrations/024_zoom_attendance_segments_and_app_contacts.sql` — example of a recent migration with RLS patterns to follow
- `docs/database/migrations/013_integration_accounts_encrypt_client_secret.sql` — RLS policy patterns for integration_accounts

## Task

Create two new migration files:

### `docs/database/migrations/025_meta_ads_mirror.sql`

This migration must:

1. Add `meta_ads` to the `integration_provider` enum safely (use the same DO/IF NOT EXISTS guard pattern from migration 012 — check if the value already exists before adding it).

2. Create table `public.meta_campaigns`:
   - `id TEXT PRIMARY KEY` — Meta's campaign_id (numeric string, not a UUID)
   - `integration_account_id UUID NOT NULL REFERENCES public.integration_accounts(id) ON DELETE CASCADE`
   - `name TEXT`
   - `status TEXT`
   - `objective TEXT`
   - `raw_json JSONB` — full Meta API campaign object
   - `synced_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Index on `integration_account_id`
   - Enable RLS; service_role full access; workspace members can SELECT (join through integration_accounts → workspace_id)

3. Create table `public.meta_insights`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `integration_account_id UUID NOT NULL REFERENCES public.integration_accounts(id) ON DELETE CASCADE`
   - `campaign_id TEXT NOT NULL`
   - `campaign_name TEXT`
   - `adset_id TEXT` — nullable, for future granularity
   - `date_start DATE NOT NULL`
   - `date_stop DATE NOT NULL`
   - `spend NUMERIC(12,4)`
   - `impressions BIGINT`
   - `clicks BIGINT`
   - `reach BIGINT`
   - `currency TEXT`
   - `raw_json JSONB` — full Meta API insights row
   - `synced_at TIMESTAMPTZ DEFAULT NOW()`
   - UNIQUE constraint on `(integration_account_id, campaign_id, date_start)` — enables idempotent upserts
   - Index on `(integration_account_id, date_start)`
   - Enable RLS; same workspace-scoped policies as meta_campaigns

4. Create table `public.project_meta_ad_accounts`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE`
   - `integration_account_id UUID NOT NULL REFERENCES public.integration_accounts(id) ON DELETE CASCADE`
   - `agency_line TEXT NOT NULL` — must match a key in `projects.traffic_agency_line_tags` JSONB (e.g. "OM", "MB", "NM"); enforced by the app, not a DB FK
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - UNIQUE on `(project_id, agency_line, integration_account_id)`
   - Index on `project_id`
   - Enable RLS; service_role full access; workspace members can SELECT/INSERT/UPDATE/DELETE when project belongs to their workspace (join through projects → workspace_id)

5. Add columns to `public.webinar_runs` (use `ADD COLUMN IF NOT EXISTS`):
   - `spend_date_from TIMESTAMPTZ` — nullable operator override for attribution window start
   - `spend_date_to TIMESTAMPTZ` — nullable operator override for attribution window end
   - Add COMMENT on each column explaining the A1 default behaviour: "Nullable override for Meta Ads attribution window. When NULL, window start defaults to event_start_at and window end defaults to the next run's event_start_at (or NOW() for the most recent run)."

### `docs/database/migrations/026_meta_spend_attribution.sql`

This migration must:

1. Create table `public.ad_spend_run_attribution`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE`
   - `webinar_run_id UUID NOT NULL REFERENCES public.webinar_runs(id) ON DELETE CASCADE`
   - `agency_line TEXT NOT NULL`
   - `integration_account_id UUID REFERENCES public.integration_accounts(id) ON DELETE SET NULL`
   - `spend NUMERIC(12,4) NOT NULL DEFAULT 0`
   - `currency TEXT NOT NULL DEFAULT 'USD'`
   - `source_system TEXT NOT NULL DEFAULT 'meta_ads'`
   - `attribution_method TEXT NOT NULL DEFAULT 'date_overlap'`
   - `date_from TIMESTAMPTZ` — resolved window start (for display/audit)
   - `date_to TIMESTAMPTZ` — resolved window end (for display/audit)
   - `computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - UNIQUE on `(project_id, webinar_run_id, agency_line, source_system)`
   - Index on `(project_id, webinar_run_id)`
   - Enable RLS; service_role full access; workspace members can SELECT when project belongs to their workspace

2. Create function `public.recompute_meta_spend_attribution(p_project_id UUID)`:
   - RETURNS TABLE with columns: `webinar_run_id UUID, agency_line TEXT, spend NUMERIC, currency TEXT, date_from TIMESTAMPTZ, date_to TIMESTAMPTZ, rows_attributed BIGINT`
   - LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path = public
   - Logic:
     a. For each webinar_run belonging to p_project_id, compute the attribution window:
        - window_from = COALESCE(wr.spend_date_from, wr.event_start_at)
        - window_to   = COALESCE(wr.spend_date_to, LEAD(wr.event_start_at) OVER (PARTITION BY wr.project_id ORDER BY wr.event_start_at), NOW())
     b. For each project_meta_ad_accounts row linking p_project_id → agency_line → integration_account_id:
        - SUM(mi.spend) from meta_insights where integration_account_id matches AND date_start >= window_from::DATE AND date_start < window_to::DATE
        - Use the currency from the most recent insight row for that account/window (or 'USD' as fallback)
     c. Upsert into ad_spend_run_attribution using ON CONFLICT (project_id, webinar_run_id, agency_line, source_system) DO UPDATE
     d. Return a summary row per (webinar_run_id, agency_line) with the computed values
   - GRANT EXECUTE to service_role and authenticated

## Also update

Update `docs/database/README.md` to add rows for migrations 025 and 026 in the table, following the exact same format as existing rows.

## Code rules

- No TypeScript in this task — SQL only.
- Use `IF NOT EXISTS` guards on all `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD COLUMN`.
- Use `DO $$ BEGIN ... END $$` blocks for conditional DDL (e.g. adding enum values).
- All tables get RLS enabled and at minimum a service_role bypass policy.
- Follow the exact RLS policy naming pattern from migration 013 and 024.
- SQL comments must explain intent, not just restate the SQL.
```

---

## Prompt 2 — Meta OAuth token service + env config

```
You are implementing the Meta Ads integration for an existing Next.js + Supabase application called nmdabn-server.

## Project context

This is a marketing analytics platform (Next.js App Router, Supabase, TypeScript). It already integrates with Zoom (S2S OAuth) and Google Sheets (user OAuth). You are adding a Meta Ads OAuth integration. Meta uses standard user OAuth 2.0. The tokens it issues are long-lived user tokens (~60 days) that can be refreshed via a dedicated Meta refresh endpoint.

Unlike Zoom (S2S, token exchange per API call), Meta tokens are stored long-term in the `integration_accounts` table and refreshed in-place. The `access_token` and `expires_at` columns on `integration_accounts` hold the current token. There is NO client_secret encryption needed for Meta tokens stored as access tokens — the access_token column is stored plaintext (same as Google).

## Read these files first

- `docs/meta-ads-integration.md` — full design spec (READ THIS FIRST)
- `src/config/env.ts` — env config pattern (you will extend this)
- `src/services/zoom-token.ts` — token service pattern to follow (in-memory cache, DB lookup)
- `src/services/integration-accounts.ts` — how integration accounts are resolved
- `src/types/index.ts` — IntegrationProvider type (will now include 'meta_ads' after migration 025 is applied and types are regenerated; assume it does)
- `src/database.types.ts` — full DB types (read the integration_accounts table shape at lines ~911–975 and the integration_provider enum at line ~1529)

## Task

### 1. Update `src/config/env.ts`

Add a `MetaConfig` interface and `meta` field to `EnvConfig`, following the exact same pattern as the existing `GoogleConfig` / `google` field:

```typescript
export interface MetaConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}
```

- Load from `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` env vars.
- `meta` is `MetaConfig | undefined` — undefined when any of the three vars are absent/empty.
- Export the `MetaConfig` type (it will be needed by the OAuth routes).
- Add the meta field to the return of `validateEnv()`.

### 2. Create `src/services/meta-oauth-token.ts`

This service resolves a valid Meta access token for a given `integration_account_id`. It:

1. Looks up the `integration_accounts` row by `id` (must have `provider = 'meta_ads'`).
2. Checks whether `expires_at` is within 7 days from now.
3. If near expiry or already expired, calls the Meta token refresh endpoint:
   - `GET https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id={META_APP_ID}&client_secret={META_APP_SECRET}&fb_exchange_token={current_token}`
   - Parses the new `access_token` and `expires_in` (seconds) from the response.
   - Updates `integration_accounts` row: set `access_token`, `expires_at = NOW() + expires_in seconds`, `updated_at = NOW()`.
4. Returns the valid access token as a string.

Exports:
- `getMetaAccessToken(integrationAccountId: string, supabase: SupabaseClient<Database>): Promise<string>`

Error handling:
- Throw descriptive errors if the account row is not found, provider is wrong, access_token is missing, or the refresh API call fails.
- Parse Meta API error JSON (Meta returns `{ error: { message, type, code } }` on failure) and include the message in the thrown error.
- Do NOT add any in-memory caching — Meta tokens are long-lived and stored in DB; a DB read per sync call is acceptable.

Meta Graph API base URL to use: `https://graph.facebook.com/v21.0`

## Code rules

- Strict TypeScript: no `any`, no `!`, no `as unknown as T`.
- Double-quoted strings.
- Full inline JSDoc on all exported functions.
- No placeholder comments — complete implementation only.
- isRecord helper: `function isRecord(v: unknown): v is Record<string, unknown>` (define locally, same as other services in this repo).
- All fetch calls must check `response.ok` and throw on non-2xx.
```

---

## Prompt 3 — Meta OAuth routes (authorize + callback)

```
You are implementing the Meta Ads OAuth flow for an existing Next.js + Supabase application called nmdabn-server.

## Project context

This is a marketing analytics platform (Next.js App Router, Supabase, TypeScript, runtime = "nodejs"). It already has Google Sheets OAuth (`app/api/auth/google/authorize/route.ts` and `callback/route.ts`). The Meta OAuth routes follow the same shape. The end result of the callback is:
1. A new `integration_accounts` row stored with `provider = 'meta_ads'`, the long-lived token, and expiry.
2. A new `project_meta_ad_accounts` row linking the new account to a project + agency line passed in the OAuth `state`.

## Read these files first

- `docs/meta-ads-integration.md` — full design spec (READ THIS FIRST)
- `app/api/auth/google/authorize/route.ts` — authorize route pattern to follow exactly
- `app/api/auth/google/callback/route.ts` — callback route pattern to follow exactly
- `src/config/env.ts` — env config (after Prompt 2 is applied, `env.meta` will exist)
- `src/services/meta-oauth-token.ts` — token service (created in Prompt 2; read it for the refresh URL pattern)
- `src/config/supabase.ts` — supabase client
- `src/middleware/workspace.ts` — requireAuthAndWorkspace middleware
- `src/lib/guard-response.ts` — nextResponseFromGuard helper
- `src/database.types.ts` — DB types (integration_accounts and project_meta_ad_accounts shapes)

## Meta OAuth specifics

- Authorize URL: `https://www.facebook.com/v21.0/dialog/oauth`
  - Required params: `client_id`, `redirect_uri`, `state`, `scope=ads_read,read_insights,business_management`, `response_type=code`
- Token exchange URL: `https://graph.facebook.com/v21.0/oauth/access_token`
  - Params: `client_id`, `client_secret`, `redirect_uri`, `code`
  - Returns `{ access_token, token_type, expires_in }` — note: the code exchange returns a SHORT-lived token first
- Long-lived token exchange: `https://graph.facebook.com/v21.0/oauth/access_token`
  - Params: `grant_type=fb_exchange_token`, `client_id`, `client_secret`, `fb_exchange_token={short_lived_token}`
  - Returns `{ access_token, token_type, expires_in }` (long-lived, ~5184000 seconds = 60 days)
- Ad Accounts list: `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name,currency&access_token={token}`
  - Returns `{ data: [{ account_id, name, currency, id }] }` where `id` is `act_XXXXXXX` and `account_id` is the numeric string

## Task

### 1. Create `app/api/auth/meta/authorize/route.ts`

- `GET` handler only. `export const runtime = "nodejs"`.
- Return 501 if `env.meta` is undefined.
- Require auth + workspace via `requireAuthAndWorkspace`.
- Read query params: `project_id` (required), `agency_line` (required). Return 400 if either is missing/empty.
- Build the Meta authorize URL manually (no Meta SDK — plain URL construction with URLSearchParams).
- State payload: `{ workspaceId, projectId, agencyLine }` — base64-encode the JSON (same pattern as Google authorize route).
- Return `{ success: true, data: { authUrl } }`.

### 2. Create `app/api/auth/meta/callback/route.ts`

- `GET` handler only. `export const runtime = "nodejs"`.
- Return 501 if `env.meta` is undefined.
- Read `code` and `state` from query params. Return 400 if missing.
- Decode and validate `state` (base64 → JSON → `{ workspaceId, projectId, agencyLine }`). Return 400 on any parse failure.
- Exchange `code` for short-lived token (POST to token exchange URL).
- Exchange short-lived token for long-lived token (second POST using `fb_exchange_token` grant).
- Fetch ad accounts list (`/me/adaccounts`) using the long-lived token.
  - If no ad accounts are returned, return an HTML error response (like the Google callback does with `new NextResponse(...)`) with a descriptive message.
  - If multiple ad accounts are returned, use the first one (the operator connected their account, which has one primary ad account — selection UI is future scope).
- Upsert into `integration_accounts`:
  - `provider: 'meta_ads'`
  - `workspace_id`: from state
  - `display_name`: ad account name from `/me/adaccounts` response
  - `account_id`: the `act_XXXXXXX` id from the ad accounts response
  - `access_token`: the long-lived token
  - `expires_at`: NOW() + `expires_in` seconds from the long-lived exchange
  - `extra`: `{ currency, ad_account_id_numeric: account_id field }` (store the raw numeric account_id too)
  - `is_default`: false
  - Use `ON CONFLICT` upsert on `(workspace_id, provider, account_id)` — if the same ad account is reconnected, update the token in place. (Do this as an upsert, not insert then update.)
- After upserting the integration_account, insert into `project_meta_ad_accounts`:
  - `project_id`: from state
  - `integration_account_id`: the id of the upserted row
  - `agency_line`: from state
  - Use `ON CONFLICT (project_id, agency_line, integration_account_id) DO NOTHING` — idempotent.
- Redirect to `/settings?meta_connected=1` on success (same redirect pattern as Google callback, but use a relative path via `request.nextUrl.origin`).
- On any error: log it, return an HTML `NextResponse` with a 500 status and a human-readable message (not JSON — Meta redirects browsers, not API clients).

## Code rules

- Strict TypeScript: no `any`, no `!`, no `as unknown as T`.
- Double-quoted strings.
- Full inline comments explaining each step of both route handlers.
- isRecord helper defined locally in each file.
- All fetch calls must handle non-2xx with a descriptive thrown error that includes the HTTP status and response body (first 500 chars).
```

---

## Prompt 4 — Meta Ads sync service + sync API route

```
You are implementing the Meta Ads sync service for an existing Next.js + Supabase application called nmdabn-server.

## Project context

This is a marketing analytics platform (Next.js App Router, Supabase, TypeScript). It already has a Zoom sync service (`src/services/zoom-participants-sync.ts`) and a Zoom sync API route (`app/api/actions/sync/zoom/route.ts`). The Meta Ads sync follows the same architectural pattern:
- A service module that does all the work (pure functions, takes a supabase client)
- An API route that authenticates, validates input, calls the service, and returns a structured JSON response

The sync flow is: resolve Meta ad accounts for the project → fetch campaigns + daily insights from Meta Graph API → upsert raw mirror tables → call the Postgres recompute function → return counters.

## Read these files first

- `docs/meta-ads-integration.md` — full design spec (READ THIS FIRST)
- `src/services/zoom-participants-sync.ts` — primary pattern to follow (pagination, error handling, upsert patterns, result counters)
- `app/api/actions/sync/zoom/route.ts` — sync route pattern (auth middleware, project-level sync, per-item error isolation, response shape)
- `src/services/meta-oauth-token.ts` — the token resolver you will call (created in Prompt 2)
- `src/config/supabase.ts` — supabase client
- `src/middleware/workspace.ts` — requireAuthAndWorkspace
- `src/lib/guard-response.ts` — nextResponseFromGuard
- `src/lib/parse-json-body.ts` — parseJsonObjectBody
- `src/config/env.ts` — env config (check encryptionKeyLoaded pattern for guard)
- `src/database.types.ts` — full DB types (meta_campaigns, meta_insights, project_meta_ad_accounts, ad_spend_run_attribution shapes — these will exist after migration 025+026 are applied and types are regenerated)

## Meta Graph API endpoints

All requests use `Authorization: Bearer {access_token}` header. Base URL: `https://graph.facebook.com/v21.0`

**Campaigns:**
```
GET /act_{ad_account_id}/campaigns
  ?fields=id,name,status,objective,created_time,updated_time
  &limit=500
```
Response: `{ data: [...campaigns], paging: { cursors: { after }, next } }`
Paginate via `?after={cursor}` until `paging.next` is absent.

**Daily insights:**
```
GET /act_{ad_account_id}/insights
  ?fields=campaign_id,campaign_name,adset_id,spend,impressions,clicks,reach,date_start,date_stop
  &time_range={"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}
  &time_increment=1
  &level=campaign
  &limit=500
```
Response: `{ data: [...insight_rows], paging: { cursors: { after }, next } }`
Paginate the same way.

Meta error shape: `{ error: { message, type, code, fbtrace_id } }` — extract `error.message` for thrown errors.

## Task

### 1. Create `src/services/meta-ads-sync.ts`

Exports:

```typescript
export interface SyncMetaAdsResult {
  /** Number of project_meta_ad_accounts processed. */
  accountsProcessed: number;
  /** Total meta_campaigns upserted across all accounts. */
  campaignsUpserted: number;
  /** Total meta_insights rows upserted across all accounts. */
  insightRowsUpserted: number;
  /** Number of webinar runs that had spend attributed after recompute. */
  runsAttributed: number;
  /** Per-agency-line summaries. */
  lines: Array<{
    agencyLine: string;
    integrationAccountId: string;
    campaignsUpserted: number;
    insightRowsUpserted: number;
    /** Present when this line's sync errored. */
    error?: string;
  }>;
}

export async function syncMetaAdsForProject(
  projectId: string,
  supabaseClient: SupabaseClient<Database>
): Promise<SyncMetaAdsResult>
```

Internal helpers (not exported):
- `fetchMetaCampaigns(accessToken, adAccountId): Promise<Record<string, unknown>[]>` — pages through campaigns
- `fetchMetaInsights(accessToken, adAccountId, sinceDate, untilDate): Promise<Record<string, unknown>[]>` — pages through daily insights for a 90-day lookback (compute `since = 90 days ago as YYYY-MM-DD`, `until = today as YYYY-MM-DD`)
- `upsertMetaCampaigns(supabase, integrationAccountId, campaigns): Promise<number>` — upserts into `meta_campaigns`, returns count
- `upsertMetaInsights(supabase, integrationAccountId, insights): Promise<number>` — upserts into `meta_insights` using `onConflict: "integration_account_id,campaign_id,date_start"`, returns count
- `callRecomputeAttribution(supabase, projectId): Promise<number>` — calls the `recompute_meta_spend_attribution` Postgres RPC via `supabase.rpc(...)`, returns the number of rows returned (= runs attributed)

Key behaviours:
- Load `project_meta_ad_accounts` rows for the project (all agency lines).
- For each row: call `getMetaAccessToken`, then fetch + upsert campaigns and insights.
- Per-line errors must NOT abort the whole sync — catch errors per line, record them in `lines[].error`, continue to the next line.
- After all lines processed (success or error), call `callRecomputeAttribution` once.
- `isRecord` helper defined locally.
- All upsert batches: use Supabase `.upsert(rows, { onConflict: "..." })`. Do not insert one row at a time.

### 2. Create `app/api/actions/sync/meta-ads/route.ts`

- `POST` handler only. `export const runtime = "nodejs"`.
- Body: `{ "project_id": "<uuid>" }` — use `parseJsonObjectBody`.
- Require auth + workspace via `requireAuthAndWorkspace`.
- Guard: return 503 if `!env.encryptionKeyLoaded` (same pattern as the Zoom sync route).
- Validate `project_id`: must be a non-empty string matching UUID regex; return 400 otherwise.
- Verify `project_id` belongs to `session.workspaceId` via Supabase query on `projects` table; return 404 if not found.
- Call `syncMetaAdsForProject(projectId, supabase)`.
- On success: return `{ success: true, ...result }` (spread the SyncMetaAdsResult).
- On error: log it, return `{ success: false, error: message }` with status 500.

UUID regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`

## Code rules

- Strict TypeScript: no `any`, no `!`, no `as unknown as T`.
- Double-quoted strings.
- Full inline JSDoc on all exported functions and on the route handler.
- isRecord helper defined locally in each file.
- All fetch calls: check `response.ok`, parse body with `response.text()` first, then `JSON.parse`, throw descriptive errors with HTTP status included.
- No placeholder comments — full working implementation.
```

---

## Prompt 5 — Agency RPC migration 027

```
You are updating the Agency dashboard SQL RPCs for an existing Next.js + Supabase application called nmdabn-server. The Meta Ads integration has added a table `ad_spend_run_attribution` that stores attributed ad spend per (project, webinar_run, agency_line). You are updating the Agency RPCs to read real spend values instead of the current NULL placeholders.

## Project context

This is a marketing analytics platform. The Agency dashboard shows funnel KPIs (leads, showed, buyers, conversion rate) per agency line per webinar run, plus CPL and CPA. Currently `ad_spend`, `cpl`, and `cpa` return NULL. The `ad_spend_run_attribution` table (created in migration 026) now holds real spend figures when a Meta Ads sync has been run.

## Read these files first

- `docs/meta-ads-integration.md` — full design spec (READ THIS FIRST, especially "Agency dashboard impact" section)
- `docs/database/migrations/016_agency_rpc.sql` — the single-run Agency RPC you are updating
- `docs/database/migrations/020_all_runs_rpcs.sql` — the all-runs Agency RPC you are updating (lines 542–675)
- `docs/database/migrations/026_meta_spend_attribution.sql` — the attribution table you are reading from (created in Prompt 1)
- `docs/database/README.md` — migration manifest you must update

## Task

Create `docs/database/migrations/027_agency_rpc_with_spend.sql`.

### Update `get_agency_stats` (from migration 016)

Replace:
```sql
NULL::NUMERIC AS ad_spend,
NULL::NUMERIC AS cpl,
NULL::NUMERIC AS cpa
```

With a subquery that reads from `ad_spend_run_attribution`:
- `ad_spend`: correlated subquery or lateral join — SUM or direct lookup of `spend` from `ad_spend_run_attribution` where `webinar_run_id = p_webinar_run_id AND project_id = g.project_id AND agency_line = ld.agency_line AND source_system = 'meta_ads'`
- `cpl`: `CASE WHEN m.leads > 0 AND ad_spend IS NOT NULL THEN ad_spend / m.leads::NUMERIC ELSE NULL END`
- `cpa`: `CASE WHEN m.buyers > 0 AND ad_spend IS NOT NULL THEN ad_spend / m.buyers::NUMERIC ELSE NULL END`

Also add `ad_spend_currency TEXT` to the RETURNS TABLE and select it from `ad_spend_run_attribution.currency` (NULL when no spend row exists).

### Update `get_agency_all_runs` (from migration 020, lines 547–670)

This RPC currently returns `(run_id, run_start_at, agency_line, leads, showed, buyers)`. Add:
- `ad_spend NUMERIC`
- `ad_spend_currency TEXT`
- `cpl NUMERIC`
- `cpa NUMERIC`

Join or lateral-subquery `ad_spend_run_attribution` on `(project_id = g.project_id AND webinar_run_id = ll.run_id AND agency_line = ll.agency_line AND source_system = 'meta_ads')` — use a LEFT JOIN since spend may not exist for every run yet.

CPL and CPA computed in SELECT:
```sql
CASE WHEN COUNT(DISTINCT ll.contact_id) > 0 AND asra.spend IS NOT NULL
  THEN asra.spend / COUNT(DISTINCT ll.contact_id)::NUMERIC
  ELSE NULL END AS cpl,
CASE WHEN COUNT(DISTINCT CASE WHEN b.contact_id IS NOT NULL THEN ll.contact_id END) > 0 AND asra.spend IS NOT NULL
  THEN asra.spend / COUNT(DISTINCT CASE WHEN b.contact_id IS NOT NULL THEN ll.contact_id END)::NUMERIC
  ELSE NULL END AS cpa
```

### Also update grants

Re-grant EXECUTE on both updated functions to `authenticated` and `service_role`.

### Also update `docs/database/README.md`

Add a row for migration 027 in the manifest table.

## Code rules

- SQL only. No TypeScript.
- Use `CREATE OR REPLACE FUNCTION` — drop-in replacement.
- Preserve all existing function signatures and behaviour exactly; only extend the RETURNS TABLE and the SELECT list.
- All NULL-safe division: always check both denominator > 0 AND spend IS NOT NULL before computing rates.
- Add SQL comments at the top of the file explaining what changed and why (referencing the open decision from Phase-1-Open-Decisions #1 that this resolves).
```

---

## After all five prompts — manual steps

1. **Apply migrations 025 → 026 → 027 in order** in the Supabase SQL Editor.
2. **Regenerate `src/database.types.ts`** after applying 025 and 026 (before running Prompts 3–5, and again after 027 if running them sequentially): `npx supabase gen types typescript --project-id <your-project-id> --schema public > src/database.types.ts`
3. **Add env vars** to your Render service and `.env.local`:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_REDIRECT_URI` (e.g. `https://your-host.onrender.com/api/auth/meta/callback`)
4. **Add Render cron job** that calls `POST /api/actions/sync/meta-ads` daily with `{ "project_id": "<uuid>" }` for each active project. Pattern: same as the existing GHL sync cron.
5. **Test flow**: connect one Meta Ad Account via the OAuth flow → run a manual sync via `POST /api/actions/sync/meta-ads` → verify rows in `meta_campaigns`, `meta_insights`, and `ad_spend_run_attribution` → check Agency dashboard now shows spend.
