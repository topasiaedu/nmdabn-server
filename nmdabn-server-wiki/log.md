# Wiki log

Append-only timeline. **New entries go at the bottom.** Heading format: `## [YYYY-MM-DD] kind | Short title` (see [[CLAUDE]]).

## [2026-04-07] system | LLM Wiki bootstrap

- Added vault schema ([[CLAUDE]]), [[index]], folder layout (`raw/sources/`, `concepts/`, `sources/`, `entities/`).
- Replaced default Obsidian `Welcome.md` with [[Home]].

## [2026-04-07] ingest | GHL webhooks (from docs/ghl-webhooks.md)

- Raw: `raw/sources/2026-04-07-repo-ghl-webhooks.md` (copy of `../docs/ghl-webhooks.md`).
- Wiki: [[GHL-Webhooks]], [[GHL-Webhook-Pipeline]], [[Supabase-GHL-Mirror]].
- Updated: [[index]].

## [2026-04-07] ingest | GHL webhooks — depth pass (same raw)

- Goal: match LLM Wiki expectation that **one source fans out** across many interlinked pages (security, middleware, ops, SQL-first context, entity).
- Expanded: [[GHL-Webhooks]] (tables, HTTP matrix, checklist, ops).
- Added: [[GHL-Webhook-Security]], [[Express-Raw-Webhook-Body]], [[GHL-Sync-Operations]], [[SQL-First-Data-Layer]]; expanded [[GHL-Webhook-Pipeline]], [[Supabase-GHL-Mirror]].
- Entity: [[GoHighLevel]]; updated `entities/README.md`.
- Updated: [[Home]] (ingest fan-out note), [[index]].

## [2026-04-07] ingest | Full docs tree pass (current + archive)

- Raw snapshots added for: `docs/README.md`, `docs/database/README.md`, `docs/data-sync-principles.md`, and all files in `docs/archive/`.
- Source pages added: [[Docs-README]], [[Database-README]], [[Data-Sync-Principles]], [[Archive-README]], [[Archive-Documentation-Update-Summary]], [[Archive-Projects-And-Docs-Update]].
- Concept added: [[Documentation-Lineage]] to resolve current-vs-historical precedence.
- Updated: [[index]].

## [2026-04-07] ingest | Additional raw notes (sync reliability + multi-location architecture)

- Detected new raw files under `raw/sources/`:
  - `2026-04-07-agent-ghl-contacts-sync-pagination-and-throughput-fix.md`
  - `2026-04-07-agent-multi-location-ghl-architecture-recommendation.md`
- Added source pages:
  - [[GHL-Contacts-Sync-Pagination-And-Throughput-Fix]]
  - [[Multi-Location-GHL-Architecture-Recommendation]]
- Added concept pages:
  - [[GHL-Contacts-Sync-Reliability]]
  - [[GHL-Multi-Location-Architecture]]
- Updated: [[index]].
