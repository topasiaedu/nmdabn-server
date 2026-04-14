# Traffic dashboard

Live **Traffic** metrics (lead occupation + sorted lead source by webinar run) backed by the GHL mirror, `webinar_runs`, and SQL RPCs in [database/migrations/007_traffic_dashboard_functions.sql](database/migrations/007_traffic_dashboard_functions.sql).

## Multi-project (recommended)

Each **workspace project** can map to one **GoHighLevel sub-account** (location). Custom field ids **differ per sub-account**, so occupation is resolved per project from the synced `ghl_custom_fields` catalog.

1. Apply migrations **006**–**009** ([database/README.md](database/README.md)).
2. On each project, set (via `PATCH /api/projects/:id` with `workspace_id` query + Bearer JWT):

   - **`ghl_location_id`** — GHL location id (same value you use to scope `ghl_contacts` / `webinar_runs` for that sub-account).
   - Preferred **`traffic_occupation_field_key`** — key or display name for the occupation field (e.g. `occupation`), resolved from `ghl_custom_fields`.
   - Optional **`traffic_occupation_field_id`** — direct override id (kept for backward compatibility).
   - Optional **`traffic_agency_line_tags`** — JSON object `{"OM":["lead_om"],"NM":["lead_nm"]}` to override global [TRAFFIC_AGENCY_LINE_TAGS_JSON](../.env.example) for this project only. Use `null` to clear override.

3. Run `npm run sync-ghl-contacts` at least once per location so `ghl_custom_fields` is populated.
4. Insert **`webinar_runs`** for each **`ghl_location_id`** you use in reporting.
5. **Backfill** `ghl_contacts.webinar_run_id` per location: `npm run backfill-webinar-runs` with `GHL_LOCATION_ID` in `.env`, **or** `node --env-file=.env scripts/backfill-webinar-runs.mjs --project-id=<uuid>` / `--connection-id=<uuid>` (requires migration **010** and `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY`).

### API (Bearer JWT)

- `GET /api/dashboard/traffic?workspace_id=...&project_id=...&line=OM&date_from=...&date_to=...`
- Optional query **`occupation_field_id`** overrides project mapping (debug only).
- `GET /api/dashboard/traffic/lines?workspace_id=...&project_id=...` — tag map (project override merged with env defaults).

User must be a **workspace member** (`workspace_members`).

## Legacy (scripts, no user session)

If **`TRAFFIC_DASHBOARD_API_KEY`** is set, you can call without Bearer:

- `GET /api/dashboard/traffic?location_id=...&line=...&occupation_field_id=...`  
- Header **`x-traffic-key`** must match the env secret.  
- Uses **`TRAFFIC_OCCUPATION_FIELD_ID`** when `occupation_field_id` is omitted.

## Global defaults (env)

- **`TRAFFIC_AGENCY_LINE_TAGS_JSON`** — default OM/NM tag map when a project has no `traffic_agency_line_tags`.
- **`TRAFFIC_OCCUPATION_FIELD_ID`** — only for **legacy** calls without per-project storage.

## Frontend

```bash
cd frontend && npm install && npm run dev
```

Open the app, sign in with Supabase email/password, then choose workspace/project in the UI. Optional **`FRONTEND_ORIGIN`** on the API for CORS.

### Frontend environment (`frontend/.env.local`)

Copy from `frontend/.env.example` and set:

- **`NEXT_PUBLIC_SUPABASE_URL`** — full HTTPS project URL (for example `https://<project-ref>.supabase.co`), not the bare project ref alone.
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — Supabase anon (public) key.
- **`NEXT_PUBLIC_API_BASE_URL`** — Express API origin when Next runs on another port (for example `http://localhost:3000`). If unset, the browser calls relative `/api` on the Next origin, which will fail unless you proxy or same-origin serve the API.
- **`NEXT_PUBLIC_TRAFFIC_KEY`** (optional) — only for legacy `x-traffic-key` calls from the browser; prefer Bearer JWT + project settings.

## Regression vs Google Sheet exports

See [traffic-dashboard-regression.md](traffic-dashboard-regression.md).
