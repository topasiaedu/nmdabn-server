# Documentation lineage

Tracks how documentation ownership changed over time in this repository.

## Current model

- Narrative and compounding knowledge: `nmdabn-server-wiki/`
- Migration DDL and apply runbooks: `docs/database/`
- Legacy markdown in `docs/archive/` is retained as historical context.

## Historical snapshots

- [[Archive-Documentation-Update-Summary]]
- [[Archive-Projects-And-Docs-Update]]

Both refer to old trees (`docs/system`, `docs/server`, `docs/reference`) that were removed later.

## Practical rule

When archive and current docs conflict:

1. Prefer live code under `src/`
2. Prefer current docs under `docs/` and this wiki
3. Keep archive notes as timeline context, not operating instructions
