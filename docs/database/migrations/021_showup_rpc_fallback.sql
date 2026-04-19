-- Fix get_showup_all_runs to return aggregate data even when traffic_breakdown_fields is null/empty.
-- When no breakdown fields are configured, a single synthetic section "total" / "All Contacts"
-- is used so the dashboard still shows attended vs. total counts per run.

CREATE OR REPLACE FUNCTION public.get_showup_all_runs(
  p_project_id   UUID,
  p_workspace_id UUID
)
RETURNS TABLE (
  run_id        UUID,
  run_start_at  TIMESTAMPTZ,
  section_key   TEXT,
  section_label TEXT,
  row_label     TEXT,
  attended      BIGINT,
  total         BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (
    SELECT
      p.id                                                AS project_id,
      p.ghl_location_id,
      COALESCE(p.traffic_breakdown_fields, '[]'::JSONB)  AS breakdown_fields
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.workspace_id = p_workspace_id
  ),

  project_runs AS (
    SELECT wr.id AS run_id, wr.event_start_at AS run_start_at
    FROM public.webinar_runs wr
    CROSS JOIN guard g
    WHERE wr.project_id = g.project_id
  ),

  fields_unnested AS (
    SELECT
      (f.entry->>'field_key') AS field_key,
      (f.entry->>'label')     AS field_label
    FROM guard g
    CROSS JOIN LATERAL jsonb_array_elements(g.breakdown_fields) AS f(entry)
  ),

  field_ids AS (
    SELECT DISTINCT ON (fu.field_key)
      fu.field_key,
      fu.field_label,
      cf.field_id
    FROM fields_unnested fu
    CROSS JOIN guard g
    LEFT JOIN public.ghl_custom_fields cf
      ON  cf.location_id = g.ghl_location_id
      AND TRIM(cf.field_key) = TRIM(fu.field_key)
    ORDER BY fu.field_key
  ),

  -- When breakdown fields are configured: one entry per field.
  -- When none configured: synthesise a single "All Contacts / All" entry.
  effective_fields AS (
    SELECT field_key, field_label, field_id
    FROM field_ids
    UNION ALL
    SELECT
      'total'::TEXT         AS field_key,
      'All Contacts'::TEXT  AS field_label,
      NULL::TEXT            AS field_id
    WHERE (SELECT COUNT(*) FROM field_ids) = 0
  ),

  -- Contacts × runs with their breakdown field value (or "All" when no breakdown)
  contacts_per_run AS (
    SELECT
      r.run_id,
      r.run_start_at,
      ef.field_key   AS section_key,
      ef.field_label AS section_label,
      CASE
        WHEN ef.field_id IS NULL THEN 'All'
        ELSE COALESCE(NULLIF(TRIM(cv.field_value), ''), 'Missing')
      END AS row_label,
      c.id AS contact_id
    FROM project_runs r
    CROSS JOIN effective_fields ef
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    LEFT JOIN public.ghl_contact_custom_field_values cv
      ON  cv.contact_id = c.id
      AND cv.field_id   = ef.field_id
      AND ef.field_id IS NOT NULL
  ),

  -- Contacts that attended (zoom journey_events)
  attended_ids AS (
    SELECT DISTINCT je.contact_id, je.webinar_run_id
    FROM public.journey_events je
    CROSS JOIN guard g
    WHERE je.project_id    = g.project_id
      AND je.source_system = 'zoom'
      AND je.event_type    = 'attended'
      AND je.contact_id IS NOT NULL
  )

  SELECT
    cpr.run_id,
    cpr.run_start_at,
    cpr.section_key,
    cpr.section_label,
    cpr.row_label,
    COUNT(DISTINCT CASE WHEN a.contact_id IS NOT NULL THEN cpr.contact_id END)::BIGINT AS attended,
    COUNT(DISTINCT cpr.contact_id)::BIGINT                                              AS total
  FROM contacts_per_run cpr
  LEFT JOIN attended_ids a
    ON  a.contact_id    = cpr.contact_id
    AND a.webinar_run_id = cpr.run_id
  GROUP BY
    cpr.run_id, cpr.run_start_at,
    cpr.section_key, cpr.section_label,
    cpr.row_label;
$$;

GRANT EXECUTE ON FUNCTION public.get_showup_all_runs(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_showup_all_runs(UUID, UUID)
  TO service_role;
