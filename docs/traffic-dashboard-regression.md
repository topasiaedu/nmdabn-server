# Traffic dashboard — regression vs sheet exports

Use this checklist to validate the live dashboard against historical **CAE Traffic** CSVs in the wiki vault:

- `nmdabn-server-wiki/raw/sources/[CAE] Sales Tracking by NM - Traffic Dashboard [NM].csv`
- `nmdabn-server-wiki/raw/sources/[CAE] Sales Tracking by NM - Traffic Dashboard [OM].csv`

## Preconditions

- Migrations **006**–**007** applied; `webinar_runs` populated for the same date columns as the export.
- Contacts carry the correct **GHL tags** for the line under test (`lead_om`, etc.).
- **`TRAFFIC_OCCUPATION_FIELD_ID`** matches the field used when the sheet was built.
- **`webinar_run_id`** backfilled so column totals align with “webinar run” buckets.

## Steps

1. Pick a **fixed date range** that matches a narrow export window (NM file often has two webinar columns).
2. Call (Bearer + project, recommended):

   `GET /api/dashboard/traffic?workspace_id=<uuid>&project_id=<uuid>&line=NM&date_from=<ISO>&date_to=<ISO>`

   Ensure the project’s `ghl_location_id` and `traffic_occupation_field_id` match the sheet’s sub-account and occupation field.

   Legacy: `GET /api/dashboard/traffic?location_id=...&occupation_field_id=...&line=NM` with `x-traffic-key` if configured.

3. Compare **LEAD OCCUPATION** section:
   - Row labels (Employee, Business Owner, …, Missing).
   - **Total** column counts per row vs CSV.
   - Per–webinar column counts vs CSV (allow small drift if timezone or tag membership differs).

4. Compare **SORTED LEAD SOURCE**:
   - Campaign / source keys (from first-touch UTM / `source`).
   - **Missing UTM** row.
   - Numeric-looking source strings from GHL `source` should appear as their own keys.

## Expected tolerances

- **Timezone:** `date_added` vs sheet “as of” cutoffs may shift edge leads by one bucket.
- **Tag coverage:** contacts missing line tags are excluded from the API but may have been included differently in a manual sheet.
- **First-touch:** attribution uses `ghl_contact_attributions` ordered by `is_first` then `position`; if GHL history changed after export, counts can differ.

Document pass/fail and the chosen window in your release notes when promoting to production.
