# docs/data-sync-principles.md (source ingest)

**Raw snapshot:** [2026-04-07-repo-data-sync-principles.md](../raw/sources/2026-04-07-repo-data-sync-principles.md)  
**Upstream doc (live):** `../docs/data-sync-principles.md`

## Summary

This source formalizes SQL-first policy:

- Use typed columns and normalized child tables for queryable fields.
- Use `raw_json` as a safety mirror, not the primary contract for reporting fields.
- Grow migrations incrementally as vendor fields are adopted.

It explicitly argues against a jsonb-only approach for important CRM fields.

## Key synthesis

- “Every key” means column or related-table row for fields you care about, not one giant table.
- Row-level completeness (fetching all records) is still mandatory even with ideal schema modeling.

## Related wiki

- [[SQL-First-Data-Layer]]
- [[Supabase-GHL-Mirror]]
- [[GHL-Sync-Operations]]
