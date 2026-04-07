# GHL contacts sync reliability

Reliability and throughput guidance for large contact backfills and long-running syncs.

## Current known-good pattern

- Use Search Contacts pagination (`POST /contacts/search`) instead of deprecated list endpoint behavior.
- Traverse by page, with repeated-page detection and bounded skip-ahead attempts.
- Apply retry/backoff on 429 for both list and detail calls.
- Use moderate concurrency for detail fetches and batch writes to Supabase.

## Operational knobs

- `GHL_DETAIL_CONCURRENCY`
- `GHL_RATE_LIMIT_RETRIES`
- `GHL_RATE_LIMIT_BACKOFF_MS`
- `GHL_THROTTLE_MS`

Tune downward when seeing sustained 429s; tune upward cautiously on small locations.

## Observability expectations

- Page-level progress logs should show monotonic totals.
- Repeated-page guard events should be rare and visible in logs.
- Final processed count should match expected scope (`--max-contacts` or full location size).

## Related

- [[GHL-Contacts-Sync-Pagination-And-Throughput-Fix]]
- [[GHL-Sync-Operations]]
