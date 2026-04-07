# SQL-first data layer (GHL mirror context)

This concept summarizes how **Postgres mirrors** of GoHighLevel data should relate to **typed SQL** vs **JSON blobs**. Full argument and table philosophy live in the repo doc (not duplicated here).

## Distilled principles

- **Reporting and joins** should use **columns and child tables**, not a single `jsonb` document as the only source of truth for fields you query.
- **GHL mirror (`ghl_contacts` and related):** use a **dual layer** — normalized columns + child tables for what you index and join, plus **`raw_json`** holding the **full** API response as insurance against vendor drift and for later field promotion.
- **App `contacts`:** grow migrations toward the CRM fields you need; sync should **write typed columns first** per `docs/database/README.md`.

## Canonical source (repo)

- `../docs/data-sync-principles.md` — read end-to-end before changing sync or schema strategy.

## Link to webhooks

Webhook-triggered syncs call the same upsert paths as bulk scripts; they should **respect** the same SQL-first direction (normalized write path + optional `raw_json` capture).

## Related

- [[Supabase-GHL-Mirror]] — migration pointers
- [[GHL-Sync-Operations]] — how sync is invoked
- [[GHL-Webhooks]]
