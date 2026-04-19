# Supabase GHL mirror

Normalized **GoHighLevel** contact and billing data mirrored into Postgres (e.g. Supabase). Webhooks and npm sync scripts **upsert** into these tables.

## Canonical DDL

All migration files live in the **main repo** (not in this vault):

- Index: `../docs/database/README.md`
- Directory: `../docs/database/migrations/`

| Migration | Purpose |
|-----------|---------|
| `001_create_projects_table.sql` | App `projects` |
| `002_contact_attribution.sql` | Attribution / UTM-style fields on app `contacts` |
| `003_ghl_contact_tables.sql` | **`ghl_contacts`** plus tags, custom fields, attributions, emails, followers, sync cursor; **cascade** on contact delete |
| `004_ghl_contacts_raw_json.sql` | `raw_json` on contacts if an older `003` omitted it |
| `005_ghl_orders_invoices_tables.sql` | **`ghl_orders`**, **`ghl_invoices`**, line items, `raw_json` fallback |
| `007_traffic_dashboard_functions.sql` | `assign_next_webinar_run_for_contact` + `backfill_webinar_runs_for_location` (see [[Webinar-Run-Contact-Assignment]]) |
| `019_traffic_breakdown_fields.sql` | `traffic_breakdown_fields JSONB` column on `projects` (see [[Traffic-Breakdown-Fields]]) |
| `020_all_runs_rpcs.sql` | Four all-runs RPCs: `get_traffic_all_runs`, `get_showup_all_runs`, `get_buyer_behavior_all_runs`, `get_agency_all_runs` (see [[All-Runs-Column-Table]]) |
| `021_showup_rpc_fallback.sql` | Replaces `get_showup_all_runs` with fallback for empty breakdown fields |

## Dual layer (see [[SQL-First-Data-Layer]])

- **Normalized:** columns and child tables for queryable CRM shape.
- **`raw_json`:** full GET response preserved on upsert — not a substitute for columns you join on.

## Sync entry points

- **Bulk:** `npm run sync-ghl-contacts`, `npm run sync-ghl-orders-invoices` (env in `../.env.example`).
- **Incremental:** `POST /api/webhooks/ghl` → same scripts, single-id mode ([[GHL-Webhook-Pipeline]]).

## Types

Regenerate `../src/database.types.ts` when the live schema changes (project-specific codegen).

## Related

- [[GHL-Webhooks]]
- [[GHL-Sync-Operations]]
- `../docs/data-sync-principles.md`
