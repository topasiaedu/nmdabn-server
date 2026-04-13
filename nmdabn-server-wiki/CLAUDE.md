# LLM Wiki schema — NMDABN Server vault

This file is the **process contract** for any agent maintaining this vault. Read it at the start of a session that touches documentation or knowledge here.

## Mission

- Maintain a **persistent, interlinked** markdown wiki under `nmdabn-server-wiki/` that **compounds** over time.
- **Raw sources** are curated inputs; the **wiki** is the compiled, cross-referenced layer the human reads (often in Obsidian).
- When answering questions, **prefer wiki pages** and cite them with wikilinks or paths. Update the wiki when answers reveal durable facts.

## Three layers


| Layer           | Location                                                              | Who edits                                             | Rule                                                                                |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Schema**      | `CLAUDE.md` (this file)                                               | Human + agent by explicit agreement                   | Defines workflows and boundaries.                                                   |
| **Raw sources** | `raw/sources/` (optional `raw/assets/` for images)                    | **Human only** (or copy-on-ingest when the user asks) | **Immutable:** the agent does **not** modify, rename, or delete files under `raw/`. |
| **Wiki pages**  | `Home.md`, `index.md`, `log.md`, `concepts/`, `sources/`, `entities/` | **Agent** (with human review as desired)              | Create, update, cross-link, and keep consistent.                                    |


## Critical boundary: SQL migrations

- **Canonical DDL** lives in the main repo at `docs/database/migrations/` (ordered `001_…`, `002_…`, …). Scripts and comments reference these paths.
- The wiki **summarizes** schema intent and **links** to those files; it does **not** replace or relocate migration files.
- When schema changes, humans add SQL under `docs/database/` per [docs/database/README.md](../docs/database/README.md); the agent updates wiki concept pages and [[index]] accordingly after ingest or explicit instruction.

## Folder conventions


| Path           | Purpose                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Home.md`      | Human-facing entry; links to [[index]], [[CLAUDE]], [[log]].                                                                                                                                           |
| `index.md`     | **Catalog** of every wiki page: link, one-line summary, optional metadata (date, source ids). **Update after every ingest.**                                                                           |
| `log.md`       | **Append-only** timeline of ingests, queries filed as pages, lint passes. New entries only **append** at the bottom (or top if you standardize on reverse-chrono — this vault uses **append at end**). |
| `raw/sources/` | Frozen copies of articles, repo doc snapshots, clippings. Filename pattern: `YYYY-MM-DD-short-slug.md` (example: `2026-04-07-repo-ghl-webhooks.md`).                                                   |
| `raw/assets/`  | Optional images; prefer local paths for long-lived notes.                                                                                                                                              |
| `sources/`     | **Wiki** pages tied to a **specific** raw source: summary, key claims, link to raw file + repo paths.                                                                                                  |
| `concepts/`    | Topic pages: pipelines, architecture ideas, “how X works” syntheses spanning multiple sources.                                                                                                         |
| `entities/`    | Things: vendors, apps, named integrations, org-specific IDs (when useful).                                                                                                                             |


**Page titles:** Use clear `Title-Case-With-Hyphens.md` filenames for wiki pages so Obsidian wikilinks stay predictable.

## Ingest workflow (run in order)

1. **Identify** the new raw file under `raw/sources/` (if it is not there yet, **ask the human** to add it or approve copying from `docs/` / the web). Do not edit existing raw files to “fix” them; note issues in the wiki instead.
2. **Read** the raw source end to end.
3. **Discuss** (briefly) key takeaways with the human if they are present; otherwise proceed from the source alone.
4. **Create or update** a page in `sources/` for that document: front-section summary, notable tables/facts, link to the raw path (`raw/sources/…`), and links to related code paths under `../src/`, `../docs/`, etc.
5. **Fan out** into the topic graph: update or create **several** `concepts/` and `entities/` pages for non-trivial sources (typical pattern: **pipeline** / sequence, **security** / trust boundaries, **operations** / runbook, **integration mechanics** such as raw body middleware, **vendor entity**, and **related principles** with links to other repo docs like `docs/data-sync-principles.md`). A single short summary page alone is usually **insufficient**—aim for roughly **5–12** interlinked wiki pages when the source warrants it (fewer for tiny notes).
6. **Update** [[index]]: add or refresh rows for **every** touched page and the raw file reference.
7. **Append** [[log]] using the log entry template below.
8. **Contradictions:** If the new source disagrees with an existing wiki page, update the old page with a dated “**Conflict / superseded**” note and link to the new source page.

## Query workflow

1. Open [[index]] and locate candidate pages.
2. Read those pages and follow wikilinks; open `raw/sources/` only when fidelity to the original wording matters.
3. Answer with citations (`[[PageName]]` or ``path/to/file``).
4. If the answer is **durable** (comparison, runbook, decision record), **add a wiki page** (often under `concepts/`) and link it from [[index]], then **append** [[log]] (`query` or `synthesis`).

## Lint workflow (periodic)

Run through this checklist and fix or ticket issues:

- **Contradictions** between wiki pages or vs `raw/sources/`.
- **Stale** claims where newer sources or code have superseded them.
- **Orphans:** wiki pages with no inbound wikilinks from [[index]] or other notes.
- **Missing concepts:** important terms without a `concepts/` page.
- **Broken links** to repo files (after refactors).
- **Gaps:** suggest one concrete source or web query to resolve each gap.

Append [[log]] with `## [YYYY-MM-DD] lint | …` and bullet findings.

## Log entry format

Use a **level-2 heading** so entries are grep-friendly:

```markdown
## [YYYY-MM-DD] ingest | Short title
- Raw: `raw/sources/2026-04-07-example.md`
- Wiki: [[Some-Source-Page]], [[Some-Concept]]

## [YYYY-MM-DD] query | Short title
- Filed: [[New-Concept-Page]]

## [YYYY-MM-DD] lint | Short title
- Findings: …
```

**Kinds:** `ingest`, `query`, `synthesis`, `lint`, `system` (bootstrap, tooling).

## Templates

### New `sources/<Name>.md` page

```markdown
# <Human title>

**Raw:** [[../raw/sources/YYYY-MM-DD-slug]] (or path `raw/sources/…`)
**Repo:** `../path/to/code.ts`

## Summary
…

## Key facts
- …

## Open questions
- …
```

### New `concepts/<Name>.md` page

```markdown
# <Concept title>

## Definition / scope
…

## How it works here
…

## Related
- [[Related-Source-Page]]
- `../docs/database/migrations/00x_….sql`

## Contradictions / history
- …
```

## Repo map (NMDABN Server)


| Area                   | Path                                                  |
| ---------------------- | ----------------------------------------------------- |
| Server entry           | `../src/index.ts`                                     |
| Env / GHL config       | `../src/config/env.ts`, `../src/config/supabase.ts`   |
| GHL webhook route      | `../src/routes/ghl-webhook.ts`                        |
| Signature verification | `../src/services/ghl-webhook-signature.ts`            |
| Webhook → sync spawn   | `../src/services/ghl-webhook-sync.ts`                 |
| Contact bulk sync      | `../scripts/sync-ghl-contacts-to-supabase.mjs`        |
| Orders/invoices sync   | `../scripts/sync-ghl-orders-invoices-to-supabase.mjs` |
| DB migration index     | `../docs/database/README.md`                          |
| Typegen output         | `../src/database.types.ts`                            |


## TypeScript / code edits

When changing application code in `../src/` or `../scripts/`, follow the repository’s TypeScript rules: no `any`, no non-null assertion (`!`), no `as unknown as`, double-quoted strings, and appropriate error handling. This vault is markdown-only except when the task explicitly includes code.

## Session start (agent)

1. Read this file.
2. Skim [[index]] and the last few headings in [[log]].
3. Proceed with the user’s task using ingest / query / lint rules above.

