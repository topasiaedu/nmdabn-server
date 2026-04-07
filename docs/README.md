# Documentation

**DDL and apply workflows stay here.** **Narrative, cross-linked documentation** lives in the LLM wiki: **[../nmdabn-server-wiki/](../nmdabn-server-wiki/)** — read [../nmdabn-server-wiki/CLAUDE.md](../nmdabn-server-wiki/CLAUDE.md) (how the wiki is maintained) and [../nmdabn-server-wiki/index.md](../nmdabn-server-wiki/index.md) (catalog). The repository root keeps a single [README.md](../README.md) for clone-and-run basics only.

## Contents

| Path | Purpose |
|------|---------|
| [database/README.md](database/README.md) | Where SQL migrations live and how to apply them |
| [database/migrations/](database/migrations/) | Ordered `.sql` migration files (includes GHL contacts + billing mirror tables) |
| `npm run sync-ghl-contacts` | Loads contacts into `ghl_*` tables (requires `.env` GHL + Supabase) |
| `npm run sync-ghl-orders-invoices` | Loads orders/invoices into `ghl_*` billing tables (requires migration `005`) |
| Server + GHL env | Real-time updates via `POST /api/webhooks/ghl` — summarized in wiki [sources/GHL-Webhooks.md](../nmdabn-server-wiki/sources/GHL-Webhooks.md); reference copy [ghl-webhooks.md](ghl-webhooks.md) |
| [data-sync-principles.md](data-sync-principles.md) | SQL-first: columns and child tables, not jsonb-as-primary store |
| [ghl-webhooks.md](ghl-webhooks.md) | **GHL:** `POST /api/webhooks/ghl` — verified webhooks → mirror sync (ingest into wiki via `raw/sources/` when updating the knowledge base) |
| [archive/](archive/) | Historical notes (paths inside may reference removed trees) |

## Conventions

- **New architecture / API / product narrative:** add or update pages in [nmdabn-server-wiki/](../nmdabn-server-wiki/) per [CLAUDE.md](../nmdabn-server-wiki/CLAUDE.md); keep stable reference copies or stubs in `docs/` only when useful for non-Obsidian readers or ingestion.
- **Schema changes:** add `docs/database/migrations/00x_description.sql` and describe it in [database/README.md](database/README.md); then update wiki concepts (e.g. [Supabase-GHL-Mirror](../nmdabn-server-wiki/concepts/Supabase-GHL-Mirror.md)) and [index.md](../nmdabn-server-wiki/index.md).
- **GoHighLevel:** use Cursor MCP in the editor; do not reintroduce large vendor OpenAPI trees into git unless you explicitly want them versioned.

## Run the server

See [README.md](../README.md) in the repo root.
