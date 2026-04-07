# NMDABN Server Wiki

Entry point for the **LLM-maintained** knowledge base for this repository.

- **How to navigate:** Open [[index]] for a catalog of all wiki pages, then follow wikilinks.
- **Process contract:** [[CLAUDE]] defines how the agent ingests sources, answers questions, and lints the vault.
- **Timeline:** [[log]] is an append-only history of ingests and maintenance passes.

This vault compounds: raw inputs live under `raw/`; synthesized pages live under `concepts/`, `sources/`, and `entities/`. A single ingest (one raw file) should **fan out** into many linked pages—summary, pipeline, security, operations, entities—not a single stub note.
