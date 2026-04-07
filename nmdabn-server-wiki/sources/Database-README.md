# docs/database/README.md (source ingest)

**Raw snapshot:** [2026-04-07-repo-database-readme.md](../raw/sources/2026-04-07-repo-database-readme.md)  
**Upstream doc (live):** `../docs/database/README.md`

## Summary

Canonical migration manifest and runbook for the live schema:

- Migrations `001` through `005` are listed with purpose.
- Sync prerequisites are documented (`003/004` before contacts sync, `005` before billing sync).
- Webhook endpoint linkage and typegen reminder (`src/database.types.ts`) are included.

## Important constraints

- DDL source of truth stays in `../docs/database/migrations/`.
- Wiki should summarize and link, not relocate SQL.

## Related wiki

- [[Supabase-GHL-Mirror]]
- [[GHL-Webhooks]]
- [[GHL-Sync-Operations]]
