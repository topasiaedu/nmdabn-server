# Traffic Breakdown Fields

## Definition / scope

**Traffic breakdown fields** are per-project configurable GHL custom field keys that drive
row groupings in the Traffic, Show Up, and Buyer Behavior dashboards. They replace the
previous single `traffic_occupation_field_key TEXT` column that hardcoded "occupation" as the
only breakdown dimension.

Stored in: `public.projects.traffic_breakdown_fields JSONB` (added in migration 019).

---

## How it works here

### Schema

```sql
-- Each entry in the array:
-- { "field_key": "string", "label": "string" }
-- Example:
-- [
--   { "field_key": "occupation", "label": "Occupation" },
--   { "field_key": "state",      "label": "State/City" }
-- ]
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS traffic_breakdown_fields JSONB;
```

### Resolution at query time

The all-runs RPCs resolve each `field_key` to a concrete `field_id` from `ghl_custom_fields`:

```sql
field_ids AS (
  SELECT DISTINCT ON (fu.field_key)
    fu.field_key, fu.field_label, cf.field_id
  FROM fields_unnested fu
  CROSS JOIN guard g
  LEFT JOIN public.ghl_custom_fields cf
    ON  cf.location_id = g.ghl_location_id
    AND TRIM(cf.field_key) = TRIM(fu.field_key)
  ORDER BY fu.field_key
)
```

If a `field_key` has no matching entry in `ghl_custom_fields` for the project's location, its
`field_id` is NULL and the LEFT JOIN with `ghl_contact_custom_field_values` produces no values
(all contacts would fall into the `'Missing'` bucket for that field).

### Fallback when empty

When `traffic_breakdown_fields` is `NULL` or `[]`:
- **Traffic:** still returns the always-present `lead_source` section (UTM/session attribution). No custom sections.
- **Show Up (post-migration 021):** synthesises a single `('total', 'All Contacts')` section so the dashboard shows attendance totals rather than returning 0 rows.
- **Buyer Behavior:** occupation sections are skipped; DYD, program, and purchase sections still appear (independent of breakdown fields).

### UI: editing in project settings

`app/settings/projects/[id]/page.tsx` — Traffic tab:
- Dynamic list of `{ field_key, label }` rows.
- Add / remove row buttons.
- On save: sent to `PATCH /api/projects/[id]` as `traffic_breakdown_fields` array.

---

## Relationship to `traffic_agency_line_tags`

Both are JSONB columns on `projects` controlling dashboard behavior:

| Column | Shape | Controls |
|---|---|---|
| `traffic_breakdown_fields` | `Array<{field_key, label}>` | Row groupings (occupation, state, …) in Traffic + ShowUp + BuyerBehavior |
| `traffic_agency_line_tags` | `Record<lineKey, string[]>` | Which contacts belong to each agency line (NM, OM, …); drives Agency dashboard + Traffic pill filter |

---

## Known configuration issues (CAE, 2026-04-13)

- `traffic_breakdown_fields` is `null` for the CAE project as of the debug session.
- Traffic works without it (lead_source section is always present).
- Show Up needs migration 021 to work without it.
- Agency line tags (`lead_nm`, `lead_om`) do not match actual GHL tag names (`pd_optin`, etc.) — needs update in project settings.

---

## Related

- [[Dashboard-Architecture-Redesign-All-Runs]] — implementation source note
- [[All-Runs-Column-Table]] — breakdown sections appear as rows in each column
- [[Supabase-GHL-Mirror]] — `ghl_custom_fields` and `ghl_contact_custom_field_values` tables
- `../docs/database/migrations/019_traffic_breakdown_fields.sql`
- `../docs/database/migrations/020_all_runs_rpcs.sql`
- `../docs/database/migrations/021_showup_rpc_fallback.sql`
- `../app/settings/projects/[id]/page.tsx` — Traffic tab (breakdown fields editor)
- `../app/api/projects/[id]/route.ts` — PATCH accepts `traffic_breakdown_fields`

## Contradictions / history

- `traffic_occupation_field_key TEXT` was the previous single-field approach. It is still
  present in the schema for backward compatibility but is no longer used by the all-runs RPCs.
  The new RPCs read `traffic_breakdown_fields` exclusively.
