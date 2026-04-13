# Traffic dashboard + Next.js frontend — handoff note (raw)

**Date:** 2026-04-13  
**Purpose:** Frozen snapshot for continuing work on another machine. Canonical repo docs live under `docs/`; this file is a **session handoff**, not a replacement for migrations or API specs.

## Repo paths (authoritative)

| Area | Path |
|------|------|
| Traffic API routes | `src/routes/dashboard-traffic.ts`, `src/routes/workspaces.ts` |
| Flexible auth (JWT or legacy key) | `src/middleware/traffic-dashboard-flex-auth.ts` |
| Traffic services | `src/services/traffic-dashboard.ts`, `src/services/traffic-project-settings.ts` |
| Webinar run assignment | `src/services/assign-webinar-run.ts`, sync script hooks in `scripts/sync-ghl-contacts-to-supabase.mjs` |
| SQL migrations | `docs/database/migrations/006_*.sql` … `009_*.sql` |
| Operator docs | `docs/traffic-dashboard.md`, `docs/traffic-dashboard-regression.md`, `docs/database/README.md` |
| Next frontend | `frontend/` (App Router: `frontend/app/`, features under `frontend/src/features/traffic/`) |

## Backend behaviour (short)

- **Bearer JWT (recommended):** `GET /api/dashboard/traffic` and `/lines` require `workspace_id`, `project_id`, and `line`. Project row supplies `ghl_location_id`, occupation mapping (`traffic_occupation_field_key` preferred; catalog `ghl_custom_fields`), and optional `traffic_agency_line_tags` JSON.
- **Legacy:** `x-traffic-key` + `TRAFFIC_DASHBOARD_API_KEY` on server; query params for location/line/occupation as documented in `docs/traffic-dashboard.md`.
- **CORS:** API uses `FRONTEND_ORIGIN` where applicable; local Next often runs on a different port than Express.

## Next.js frontend (short)

- **Stack:** Next.js 15 App Router, client dashboard in `frontend/src/features/traffic/TrafficDashboardPage.tsx` (split: `components/`, `hooks/`, `services/`, `types/`).
- **Supabase:** Browser client in `frontend/src/lib/supabase.ts`. Env names are **`NEXT_PUBLIC_SUPABASE_URL`** (must be full `https://…supabase.co` URL) and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**. Example template: `frontend/.env.example`.
- **API base:** When the UI and API run on different ports locally, set **`NEXT_PUBLIC_API_BASE_URL`** to the Express origin (e.g. `http://localhost:3000`). Otherwise relative `/api` hits the Next dev server and returns HTML 404s.
- **Optional legacy header from browser:** `NEXT_PUBLIC_TRAFFIC_KEY` — only if you intentionally use legacy mode from the UI (normally use JWT only).
- **Hydration / dev overlay:** `frontend/app/layout.tsx` uses `suppressHydrationWarning` on `<html>` and `<body>` to avoid noisy mismatches when tooling injects attributes in dev.

## Local run (typical)

1. Start API (Express) on the port you configure (often `3000`).
2. `cd frontend && npm install && npm run dev` (Next may pick `3001` if `3000` is taken).
3. Ensure `frontend/.env.local` has valid Supabase URL + anon key and `NEXT_PUBLIC_API_BASE_URL` pointing at Express.

## Security reminder

- **Do not commit** `frontend/.env.local` or any file containing live keys. Repo `.gitignore` ignores `.env.local`; `frontend/.gitignore` also ignores `.next/`, `node_modules/`, and local env files under `frontend/`.

## Follow-ups (optional)

- Silence Next “multiple lockfiles” warning via `outputFileTracingRoot` in `frontend/next.config.ts` if it stays noisy in this monorepo layout.
- Extend `npm run backfill-webinar-runs` or docs for multi-location backfill without a single global `GHL_LOCATION_ID` (noted in `docs/traffic-dashboard.md`).
