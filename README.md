# NMDABN Server

Backend API (Express + TypeScript) for the webinar / campaign platform.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Fill `.env` with your Supabase URL and service role key (or replace the data layer when you migrate). Regenerate `src/database.types.ts` when the database schema changes.

- **Production build:** `npm run build` then `npm start`
- **Typecheck:** `npm run type-check` (may report existing strictness issues until refactored)

## Documentation

- **LLM wiki (narrative source of truth):** **[nmdabn-server-wiki/](nmdabn-server-wiki/)** — start with [nmdabn-server-wiki/CLAUDE.md](nmdabn-server-wiki/CLAUDE.md) and [nmdabn-server-wiki/index.md](nmdabn-server-wiki/index.md).
- **Database DDL and apply guides:** **[docs/](docs/README.md)** — ordered SQL under [docs/database/migrations/](docs/database/migrations/), described in [docs/database/README.md](docs/database/README.md).

- **GoHighLevel:** bulk sync `npm run sync-ghl-contacts` and `npm run sync-ghl-orders-invoices`; live updates **[nmdabn-server-wiki/sources/GHL-Webhooks.md](nmdabn-server-wiki/sources/GHL-Webhooks.md)** (wiki) or **[docs/ghl-webhooks.md](docs/ghl-webhooks.md)** (`POST /api/webhooks/ghl` when GHL env vars are set).

## License

Proprietary
