# GHL contacts sync pagination and throughput fix (agent execution log)

- Source type: `agent implementation note`
- Snapshot date: `2026-04-07`
- Scope: `scripts/sync-ghl-contacts-to-supabase.mjs` reliability + performance updates

## Objective

Fix bulk contacts sync so it can reliably traverse beyond the first page and complete large-location backfills (5k+), while improving sync speed and handling GHL rate limits.

## Reported symptoms

1. Sync counter exceeded expected unique contacts (example: ~7k processed while location has ~5k).
2. Some runs appeared to continue too long / repeat pages.
3. After early fixes, some runs stopped after exactly ~100 contacts.
4. Rate limiting (`429`) appeared during list/detail fetches.
5. User terminal blocked `npm run` due to PowerShell script policy; `npm.cmd` worked.

## Root causes identified

1. **Deprecated list endpoint behavior**
   - `GET /contacts/` is explicitly marked deprecated in HighLevel docs.
   - Pagination behavior was inconsistent for this location/token and repeated pages after cursor advance.

2. **Cursor mismatch on Search API attempts**
   - `POST /contacts/search` accepted `pageLimit` but rejected:
     - `limit` (`422 property limit should not exist`)
     - `startAfterId`/`startAfter` (`422 property ... should not exist`)
   - This indicates current validation expects page-based traversal for this account/API behavior.

3. **Rate-limit pressure**
   - Concurrent detail fetching can trigger 429 if not retried/backed off.

## Documentation check (online)

HighLevel docs retrieved during this session:

- `GET /contacts/` page states **deprecated** and says to use Search Contacts instead.
- Replacement endpoint: `POST /contacts/search`.

## Final implementation decisions

### 1) List endpoint migration

- Switched list traversal from deprecated `GET /contacts/` to:
  - `POST /contacts/search`
  - body includes `locationId`, `page`, `pageLimit`

### 2) Pagination strategy

- Use **page-based pagination** (increment `page`) for Search Contacts.
- Keep repeated-page guard:
  - if first contact of page repeats, attempt to skip ahead page a limited number of times;
  - hard stop after repeated failures to avoid infinite loop.

### 3) Throughput improvements (batching)

- Parallelized contact detail fetches per list page:
  - `GHL_DETAIL_CONCURRENCY` (default `8`, max `32`)
- Replaced per-contact writes with page-level batched writes:
  - one `upsert` batch for `ghl_contacts`
  - child table deletes by `IN(contact_id...)`
  - chunked inserts for child rows (`SUPABASE_INSERT_CHUNK = 500`)

### 4) Rate-limit resiliency

- Added retry/backoff for GHL `429` on both list and detail requests:
  - exponential backoff + jitter
  - honors `Retry-After` when provided
- New env knobs documented in `.env.example`:
  - `GHL_RATE_LIMIT_RETRIES` (default `6`)
  - `GHL_RATE_LIMIT_BACKOFF_MS` (default `800`)

## Validation runs executed

All commands executed in repo root via `npm.cmd`:

1. `npm.cmd run sync-ghl-contacts -- --max-contacts=3`
   - success
2. `npm.cmd run sync-ghl-contacts -- --max-contacts=5`
   - success after batching changes
3. `npm.cmd run sync-ghl-contacts -- --max-contacts=20`
   - success with Search Contacts payload corrected
4. `npm.cmd run sync-ghl-contacts -- --max-contacts=250`
   - success
   - observed 429 retries and recovery
   - final output included:
     - `Synced list page: +100 contacts (running total 100)`
     - `Synced list page: +100 contacts (running total 200)`
     - `Synced list page: +50 contacts (running total 250)`
     - `Done. Contacts processed: 250`

## Operational notes

1. For user shell on this machine, run:
   - `npm.cmd run sync-ghl-contacts`
   - (not `npm run ...` if PowerShell policy blocks `npm.ps1`)

2. If 429 frequency remains high on large runs, tune:
   - lower `GHL_DETAIL_CONCURRENCY` (e.g., `4`)
   - raise `GHL_THROTTLE_MS` (e.g., `120`-`150`)
   - optionally raise `GHL_RATE_LIMIT_RETRIES`

3. Resume cursor storage currently reuses `ghl_sync_cursors.contacts_start_after_id`.
   - For Search mode it now stores the next page number as string.
   - Consider future schema split (`contacts_search_page`) for clearer semantics.

## Files changed in this workstream

- `scripts/sync-ghl-contacts-to-supabase.mjs`
- `.env.example`

