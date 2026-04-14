# NMDABN Server

Next.js application: Traffic dashboard UI, API Route Handlers (Supabase, GHL webhooks, Google OAuth, integrations), and Node sync scripts.

## Quick start

```bash
npm install
cp .env.example .env
# Optional: copy client env to .env.local for Next (NEXT_PUBLIC_*)
npm run dev
```

Fill `.env` / `.env.local` with Supabase URL and keys, Google OAuth vars, and optional GHL / traffic settings. Regenerate `src/database.types.ts` when the database schema changes.

- **Production build:** `npm run build` then `npm start` (uses Next standalone output when containerized).
- **Typecheck:** `npm run type-check`

## Documentation

- **LLM wiki (narrative source of truth):** **[nmdabn-server-wiki/](nmdabn-server-wiki/)** — start with [nmdabn-server-wiki/CLAUDE.md](nmdabn-server-wiki/CLAUDE.md) and [nmdabn-server-wiki/index.md](nmdabn-server-wiki/index.md).
- **Database DDL and apply guides:** **[docs/](docs/README.md)** — ordered SQL under [docs/database/migrations/](docs/database/migrations/), described in [docs/database/README.md](docs/database/README.md).

- **GoHighLevel:** bulk sync `npm run sync-ghl-contacts` and `npm run sync-ghl-orders-invoices`; live updates via `POST /api/webhooks/ghl` — see **[docs/ghl-webhooks.md](docs/ghl-webhooks.md)** and the wiki GHL pages.

## License

Proprietary
