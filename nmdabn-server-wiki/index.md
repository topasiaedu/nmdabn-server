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

## Entities (`entities/`)

| Page | Summary |
|------|---------|
| [entities/README.md](entities/README.md) | Entities folder hub; lists current entity pages. |
| [[GoHighLevel]] | Vendor / integration entity; surfaces, wiki hub, external doc link. |

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
