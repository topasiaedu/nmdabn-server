# Database

All SQL migrations for this project live in **`migrations/`** next to this file.

Run them in order in your Postgres host (e.g. Supabase SQL Editor) when you adopt or change schema.

| File | Purpose |
|------|---------|
| [migrations/001_create_projects_table.sql](migrations/001_create_projects_table.sql) | `projects` table and RLS policies |
| [migrations/002_contact_attribution.sql](migrations/002_contact_attribution.sql) | Attribution / UTM / landing fields on app `contacts` (optional) |
| [migrations/003_ghl_contact_tables.sql](migrations/003_ghl_contact_tables.sql) | **GHL mirror:** `ghl_contacts` + tags, custom fields, attributions, emails, followers, sync cursor |
| [migrations/004_ghl_contacts_raw_json.sql](migrations/004_ghl_contacts_raw_json.sql) | Adds `ghl_contacts.raw_json` if you applied an older `003` without it (no-op if column already exists) |
| [migrations/005_ghl_orders_invoices_tables.sql](migrations/005_ghl_orders_invoices_tables.sql) | **GHL billing mirror:** `ghl_orders`, `ghl_invoices`, and line-item tables with `raw_json` fallback |
| [migrations/006_webinar_runs_and_contact_fk.sql](migrations/006_webinar_runs_and_contact_fk.sql) | **`webinar_runs`** dimension + **`ghl_contacts.webinar_run_id`** snapshot for Traffic dashboard |
| [migrations/007_traffic_dashboard_functions.sql](migrations/007_traffic_dashboard_functions.sql) | **Traffic RPCs:** assign/backfill webinar run, `traffic_occupation_breakdown`, `traffic_lead_source_breakdown` |
| [migrations/008_project_ghl_traffic_settings.sql](migrations/008_project_ghl_traffic_settings.sql) | **Projects:** `ghl_location_id`, `traffic_occupation_field_id`, optional `traffic_agency_line_tags` JSONB per sub-account |
| [migrations/009_ghl_custom_fields_catalog.sql](migrations/009_ghl_custom_fields_catalog.sql) | **Custom field catalog:** `ghl_custom_fields` + project `traffic_occupation_field_key` for key/name-based mapping |

Add new files as `010_…`, etc.

**Traffic dashboard:** after `006`–`007`, insert rows into `webinar_runs` for your location (dates + labels). Run `npm run backfill-webinar-runs` once (or set `TRAFFIC_BACKFILL_AFTER_FULL_SYNC=1` during a full contact sync) to populate `webinar_run_id`. See [../traffic-dashboard.md](../traffic-dashboard.md).

**Sync:** after `003` (and `004` if needed) is applied, run `npm run sync-ghl-contacts` (see root `.env.example` for GHL vars). The sync writes the full contact detail response into `raw_json` on every upsert and refreshes `ghl_custom_fields` from `GET /locations/:locationId/customFields`.

**Billing sync:** after `005`, run `npm run sync-ghl-orders-invoices`. This mirrors orders/invoices into typed columns and keeps full payloads in `raw_json`. Endpoint paths are configurable via `.env` in case your GHL account uses different payments endpoints.

**Webhooks:** with the API server running and GHL variables in `.env`, point HighLevel at `POST /api/webhooks/ghl` on your public base URL. See [../ghl-webhooks.md](../ghl-webhooks.md).

**Note:** The original `contacts` table (in your live Supabase project) was created without first-class attribution columns—only a generic `metadata` jsonb. Use `002_contact_attribution.sql` when you want queryable fields for reporting; you can still keep a copy of the full payload in `metadata` if integrations send more than these columns.

TypeScript types for Supabase are generated into **`src/database.types.ts`** at the repo root of `src/` when you run your chosen codegen against the live schema.
