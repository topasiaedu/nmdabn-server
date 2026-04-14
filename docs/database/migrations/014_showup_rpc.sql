-- Show Up dashboard RPC: show-up rate by NM / OM / MISSING line buckets.
-- Apply after 011 (journey_events) and project traffic settings. Grants for PostgREST.

-- ---------------------------------------------------------------------------
-- Denominator: GHL contacts assigned to the webinar run (ghl_contacts.webinar_run_id)
--   scoped to the project's GHL location, with opt-in date COALESCE(date_added, synced_at)
--   filtered by p_date_from / p_date_to (nullable = unbounded on that side).
-- Line bucket: first match wins — any tag listed under traffic_agency_line_tags."NM" => NM;
--   else any tag under "OM" => OM; else MISSING. If traffic_agency_line_tags is null or
--   a key is absent, that tag list is empty (everyone falls through to OM or MISSING).
-- Numerator: distinct contacts in the same cohort with at least one journey_events row where
--   source_system = 'zoom', event_type = 'attended', same webinar_run_id + project_id,
--   occurred_at within the date window, and contact_id matches.
-- Rate: numerator / denominator; NULL when denominator is 0 (safe division).
-- Invalid workspace/project/run combination returns zero rows (guard join).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_showup_stats(
  p_workspace_id UUID,
  p_project_id UUID,
  p_webinar_run_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ
)
RETURNS TABLE (
  line_bucket TEXT,
  denominator BIGINT,
  numerator BIGINT,
  showup_rate NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (
    SELECT
      p.id AS project_id,
      p.ghl_location_id,
      COALESCE(p.traffic_agency_line_tags, '{}'::JSONB) AS agency_tags
    FROM public.projects p
    INNER JOIN public.webinar_runs wr
      ON wr.id = p_webinar_run_id
      AND wr.project_id = p.id
    WHERE p.id = p_project_id
      AND p.workspace_id = p_workspace_id
  ),
  tag_sets AS (
    SELECT
      COALESCE(
        ARRAY(
          SELECT JSONB_ARRAY_ELEMENTS_TEXT(g.agency_tags->'NM')
        ),
        ARRAY[]::TEXT[]
      ) AS nm_tag_list,
      COALESCE(
        ARRAY(
          SELECT JSONB_ARRAY_ELEMENTS_TEXT(g.agency_tags->'OM')
        ),
        ARRAY[]::TEXT[]
      ) AS om_tag_list
    FROM guard g
  ),
  cohort AS (
    SELECT
      c.id AS contact_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.ghl_contact_tags ct
          WHERE ct.contact_id = c.id
            AND ct.tag_name = ANY (ts.nm_tag_list)
        ) THEN 'NM'
        WHEN EXISTS (
          SELECT 1
          FROM public.ghl_contact_tags ct
          WHERE ct.contact_id = c.id
            AND ct.tag_name = ANY (ts.om_tag_list)
        ) THEN 'OM'
        ELSE 'MISSING'
      END AS line_bucket
    FROM public.ghl_contacts c
    CROSS JOIN guard g
    CROSS JOIN tag_sets ts
    WHERE c.location_id = g.ghl_location_id
      AND c.webinar_run_id = p_webinar_run_id
      AND (
        p_date_from IS NULL
        OR COALESCE(c.date_added, c.synced_at) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(c.date_added, c.synced_at) <= p_date_to
      )
  ),
  attended AS (
    SELECT DISTINCT je.contact_id
    FROM public.journey_events je
    CROSS JOIN guard g
    WHERE je.project_id = g.project_id
      AND je.webinar_run_id = p_webinar_run_id
      AND je.source_system = 'zoom'
      AND je.event_type = 'attended'
      AND je.contact_id IS NOT NULL
      AND (
        p_date_from IS NULL
        OR je.occurred_at >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR je.occurred_at <= p_date_to
      )
  ),
  agg AS (
    SELECT
      cohort.line_bucket,
      COUNT(*)::BIGINT AS denom,
      COUNT(*) FILTER (
        WHERE cohort.contact_id IN (SELECT attended.contact_id FROM attended)
      )::BIGINT AS num
    FROM cohort
    GROUP BY cohort.line_bucket
  ),
  buckets AS (
    SELECT unnest(ARRAY['NM', 'OM', 'MISSING']) AS line_bucket
  )
  SELECT
    b.line_bucket,
    COALESCE(a.denom, 0)::BIGINT AS denominator,
    COALESCE(a.num, 0)::BIGINT AS numerator,
    CASE
      WHEN COALESCE(a.denom, 0) > 0
      THEN COALESCE(a.num, 0)::NUMERIC / a.denom::NUMERIC
      ELSE NULL
    END AS showup_rate
  FROM buckets b
  LEFT JOIN agg a ON a.line_bucket = b.line_bucket
  CROSS JOIN guard g;
$$;

GRANT EXECUTE ON FUNCTION public.get_showup_stats(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_showup_stats(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
