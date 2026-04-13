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

## [2026-04-08] ingest | Product dashboard spec, phase roadmap, buyer journey

- Raw (already in vault): `2026-04-07-sales-tracking-dashboard-spec-from-sheet-exports.md`, `2026-04-07-phase-roadmap-and-phase-1-dashboard.md`, `2026-04-07-buyer-journey-tracking-zoom-ghl-first-party.md`.
- Source pages: [[Sales-Tracking-Dashboard-Spec-From-Sheet-Exports]], [[Phase-Roadmap-And-Phase-1-Dashboard]], [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]].
- Concepts: [[Sales-Tracking-Dashboard-Model]], [[Product-Phase-Roadmap]], [[Buyer-Journey-Event-Store]].
- Entity: [[Zoom]]; updated `entities/README.md`.
- Index: raw asset inventory for CSV/XLSX/PDF companions.
- Updated: [[index]].

## [2026-04-08] ingest | Engineering and ops direction raw note

- Raw: `raw/sources/2026-04-07-engineering-and-ops-direction.md` — monorepo without `packages/shared`, Render+Docker, modular monolith vs microservices, webhook spike / async pattern, VAPI out of scope, per-project creds (incl. future WhatsApp/closing), job-queue hygiene.
- Updated: [[index]].

## [2026-04-08] ingest | Engineering and ops direction — wiki completion

- Gap: raw row existed in [[index]] but no `sources/` page yet.
- Added: [[Engineering-And-Ops-Direction]], [[Platform-Engineering-Direction]].
- Updated: [[index]] (source + concept rows).

## [2026-04-13] handoff | Traffic dashboard + Next frontend snapshot

- Raw: `raw/sources/2026-04-13-traffic-dashboard-next-frontend-handoff.md` — paths to migrations, API, Next `frontend/` feature layout, `NEXT_PUBLIC_*` env expectations, local run, no secrets.
- Repo doc touch-up: `docs/traffic-dashboard.md` (frontend env subsection).
- Repo hygiene: `frontend/.gitignore` (exclude `.next/`, `node_modules/`, local env).
- Updated: [[index]] (raw catalog row).
