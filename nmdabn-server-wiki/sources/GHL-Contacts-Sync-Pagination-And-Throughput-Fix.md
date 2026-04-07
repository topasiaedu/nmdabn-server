# GHL contacts sync pagination and throughput fix

**Raw snapshot:** [2026-04-07-agent-ghl-contacts-sync-pagination-and-throughput-fix.md](../raw/sources/2026-04-07-agent-ghl-contacts-sync-pagination-and-throughput-fix.md)

## Summary

This source records a concrete reliability/performance hardening pass on `scripts/sync-ghl-contacts-to-supabase.mjs`:

- moved away from deprecated `GET /contacts/` list behavior
- adopted `POST /contacts/search` with page-based traversal
- added repeated-page guardrails
- added 429 retry/backoff support
- improved throughput with detail-fetch concurrency and batched Supabase writes

It also captures successful validation runs (`--max-contacts` up to 250) and practical Windows shell guidance (`npm.cmd` vs `npm` PowerShell policy path).

## Key implementation decisions

- Search pagination uses `page` + `pageLimit`.
- Env tuning surfaced for rate limit behavior:
  - `GHL_RATE_LIMIT_RETRIES`
  - `GHL_RATE_LIMIT_BACKOFF_MS`
  - existing `GHL_DETAIL_CONCURRENCY`, `GHL_THROTTLE_MS`
- Cursor field currently reuses `ghl_sync_cursors.contacts_start_after_id` for page value (known semantic debt).

## Files referenced

- `../scripts/sync-ghl-contacts-to-supabase.mjs`
- `../.env.example`

## Related wiki

- [[GHL-Sync-Operations]]
- [[GHL-Contacts-Sync-Reliability]]
