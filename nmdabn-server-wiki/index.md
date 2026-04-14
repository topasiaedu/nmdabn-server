# Wiki index

**Catalog of this vault.** The maintaining agent updates this file after every **ingest** or meaningful new page (see [[CLAUDE]]).

- **Entry:** [[Home]]
- **Process:** [[CLAUDE]]
- **Timeline:** [[log]]

## Meta

| Page | Summary |
|------|---------|
| [[Home]] | Vault entry; links to index, schema, and log. |
| [[CLAUDE]] | Ingest / query / lint workflows; folder rules; repo map. |
| [[index]] | This catalog (you are here). |
| [[log]] | Append-only history of ingests and maintenance. |

## Raw sources (`raw/sources/`)

| File | Summary |
|------|---------|
| [2026-04-07-repo-ghl-webhooks.md](raw/sources/2026-04-07-repo-ghl-webhooks.md) | Frozen snapshot of repo `docs/ghl-webhooks.md` (GHL → Supabase webhooks). |
| [2026-04-07-repo-docs-readme.md](raw/sources/2026-04-07-repo-docs-readme.md) | Snapshot pointer for `docs/README.md` (ownership split and conventions). |
| [2026-04-07-repo-database-readme.md](raw/sources/2026-04-07-repo-database-readme.md) | Snapshot pointer for `docs/database/README.md` migration manifest. |
| [2026-04-07-repo-data-sync-principles.md](raw/sources/2026-04-07-repo-data-sync-principles.md) | Snapshot pointer for SQL-first principles doc. |
| [2026-04-07-repo-archive-readme.md](raw/sources/2026-04-07-repo-archive-readme.md) | Snapshot pointer for archive index note. |
| [2026-04-07-repo-archive-documentation-update-summary.md](raw/sources/2026-04-07-repo-archive-documentation-update-summary.md) | Snapshot pointer for 2024 historical documentation summary. |
| [2026-04-07-repo-archive-projects-and-docs-update.md](raw/sources/2026-04-07-repo-archive-projects-and-docs-update.md) | Snapshot pointer for historical projects/docs update note. |
| [2026-04-07-agent-ghl-contacts-sync-pagination-and-throughput-fix.md](raw/sources/2026-04-07-agent-ghl-contacts-sync-pagination-and-throughput-fix.md) | Agent implementation note about contacts sync pagination, batching, and 429 resiliency. |
| [2026-04-07-agent-multi-location-ghl-architecture-recommendation.md](raw/sources/2026-04-07-agent-multi-location-ghl-architecture-recommendation.md) | Agent architecture note for project/location-scoped GHL integration model. |
| [2026-04-07-sales-tracking-dashboard-spec-from-sheet-exports.md](raw/sources/2026-04-07-sales-tracking-dashboard-spec-from-sheet-exports.md) | CAE sales tracking dashboard spec derived from sheet exports (atomic facts + dimensions). |
| [2026-04-07-phase-roadmap-and-phase-1-dashboard.md](raw/sources/2026-04-07-phase-roadmap-and-phase-1-dashboard.md) | Product phases 1–3 and Phase 1 dashboard intent. |
| [2026-04-07-buyer-journey-tracking-zoom-ghl-first-party.md](raw/sources/2026-04-07-buyer-journey-tracking-zoom-ghl-first-party.md) | Buyer journey architecture: Zoom + GHL + first-party tracking. |
| [2026-04-07-engineering-and-ops-direction.md](raw/sources/2026-04-07-engineering-and-ops-direction.md) | Monorepo without shared package, Render/Docker, modular monolith, webhook burst pattern, VAPI out of scope, multi-provider creds. |
| [2026-04-13-traffic-dashboard-next-frontend-handoff.md](raw/sources/2026-04-13-traffic-dashboard-next-frontend-handoff.md) | Handoff: Traffic dashboard API + SQL paths, Next.js frontend layout, env vars (`NEXT_PUBLIC_*`), local run and security notes (no secrets). |
| [2026-04-13-phase1-execution-plan-and-zoom-webinar-design.md](raw/sources/2026-04-13-phase1-execution-plan-and-zoom-webinar-design.md) | Full Phase 1 build order (10 steps), Zoom S2S integration decisions, per-project Zoom accounts, journey_events schema, and 4 open decisions blocking completion. |
| [2026-04-13-nextjs-consolidation-decision.md](raw/sources/2026-04-13-nextjs-consolidation-decision.md) | Decision to consolidate Express + Next.js into a single Next.js app. Rationale, directory structure before/after, route map, migration patterns, merged package.json. |

### Raw assets (non-markdown, `raw/sources/`)

| File | Role |
|------|------|
| `[CAE] Sales Tracking by NM - *.csv` (5 files) | Exported dashboard tabs referenced by sales spec. |
| `[Dr Jasmine] Sales Tracking by NM.xlsx` | Spreadsheet source. |
| `Phase-1-Better-Data-Faster-Decisions.pdf` | Phase 1 program PDF; not parsed into wiki body here. |

## Source notes (`sources/`)

| Page | Summary |
|------|---------|
| [[GHL-Webhooks]] | Full ingest: endpoint, env table, event list, HTTP matrix, ops, security pointers, code map, cross-links. |
| [[Docs-README]] | Ingest of current docs index and ownership split. |
| [[Database-README]] | Ingest of migration manifest and sync prerequisites. |
| [[Data-Sync-Principles]] | Ingest of SQL-first policy document. |
| [[Archive-README]] | Ingest of archive index note. |
| [[Archive-Documentation-Update-Summary]] | Historical 2024 docs update summary, marked as legacy context. |
| [[Archive-Projects-And-Docs-Update]] | Historical projects + docs reorganization note, marked as legacy context. |
| [[GHL-Contacts-Sync-Pagination-And-Throughput-Fix]] | Source ingest of sync reliability/performance remediation notes. |
| [[Multi-Location-GHL-Architecture-Recommendation]] | Source ingest of multi-location integration architecture recommendation. |
| [[Sales-Tracking-Dashboard-Spec-From-Sheet-Exports]] | Ingest of CAE dashboard structure from CSV-backed spec. |
| [[Phase-Roadmap-And-Phase-1-Dashboard]] | Ingest of product phase definitions and Phase 1 goals. |
| [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]] | Ingest of journey timeline and multi-system data plan. |
| [[Engineering-And-Ops-Direction]] | Monorepo layout, Render/Docker, modular monolith, webhook burst pattern, VAPI out of scope, per-project creds. |
| [[Phase-1-Execution-Plan-And-Zoom-Design]] | Full Phase 1 build order, Zoom S2S design decisions, journey_events schema, open decisions register. |
| [[NextJS-Consolidation-Decision]] | Decision to consolidate into Next.js only. Rationale: event-driven ingestion model, no continuous loops needed. |

## Concepts (`concepts/`)

| Page | Summary |
|------|---------|
| [[GHL-Webhook-Pipeline]] | Handler steps, `express.raw` limit, event→action matrix, async semantics. |
| [[GHL-Webhook-Security]] | Ed25519 vs RSA legacy, skip-verify guardrails, failure modes. |
| [[Express-Raw-Webhook-Body]] | Why raw middleware before verify; proxy rules. |
| [[GHL-Sync-Operations]] | Bulk npm vs webhook spawn; idempotency; scale / queue notes. |
| [[Supabase-GHL-Mirror]] | Migrations 001–005 summary; dual-layer mirror; sync entry points. |
| [[SQL-First-Data-Layer]] | Columns-first philosophy for GHL mirror; link to `data-sync-principles.md`. |
| [[Documentation-Lineage]] | Current-vs-archive documentation timeline and precedence rule. |
| [[GHL-Contacts-Sync-Reliability]] | Practical reliability model for contacts sync pagination, retries, and throughput tuning. |
| [[GHL-Multi-Location-Architecture]] | Target architecture for multi-project/multi-location GHL routing and sync execution. |
| [[Sales-Tracking-Dashboard-Model]] | Atomic facts + dimensions model for four logical dashboards. |
| [[Product-Phase-Roadmap]] | Phases 1–3 and engineering enablers (synthesis). |
| [[Buyer-Journey-Event-Store]] | `journey_events` decided schema (migration 011) and Zoom attendance ingest path. Updated 2026-04-13. |
| [[Platform-Engineering-Direction]] | Updated 2026-04-13: single Next.js app (no separate Express), one Render service, async webhooks, cron for scheduled syncs. |
| [[Zoom-Integration-Architecture]] | Zoom S2S OAuth flow, per-project credential chain, token caching, API endpoints, security notes. |
| [[Webinar-Run-Zoom-Linkage]] | Explicit `zoom_meeting_id` on `webinar_runs`; `zoom_source_type` field; sync service logic. |
| [[Phase-1-Build-Order]] | Ordered execution plan (Step 1 ✅ done → Migration Step → Steps 2–10) with Next.js consolidation incorporated. |
| [[Phase-1-Open-Decisions]] | Four unresolved decisions blocking Phase 1 completion: ad spend source, showed denominator, encryption, backfill scope. |
| [[NextJS-Consolidation-Architecture]] | Full agent implementation guide: file moves, route map, migration patterns (raw body, auth helpers, params, env), merged package.json, Dockerfile. |

## Entities (`entities/`)

| Page | Summary |
|------|---------|
| [entities/README.md](entities/README.md) | Entities folder hub; lists current entity pages. |
| [[GoHighLevel]] | Vendor / integration entity; surfaces, wiki hub, external doc link. |
| [[Zoom]] | Webinar vendor; attendance/duration inputs for dashboard and journey. |

## Database and migrations (canonical in repo)

DDL is **not** duplicated here. Use:

- `../docs/database/README.md` — how to apply migrations
- `../docs/database/migrations/*.sql` — ordered SQL

Wiki concepts link to these paths; see [[Supabase-GHL-Mirror]].

## Operations (quick links)

| Topic | Where |
|-------|--------|
| Clone / run server | `../README.md` |
| Legacy docs tree + migrations pointer | `../docs/README.md` |
| GHL webhook reference (live doc) | `../docs/ghl-webhooks.md` |
| Data sync principles | `../docs/data-sync-principles.md` |
