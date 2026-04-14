-- Agency dashboard RPC: funnel KPIs per agency line (JSON keys on traffic_agency_line_tags) and one webinar run.
-- Apply after 008 (traffic_agency_line_tags). See SQL comments.

-- ad_spend / CPL / CPA: spend source is an open decision (Phase-1-Open-Decisions #1).
--   ad_spend is NULL::NUMERIC until a spend column or table exists; CPL and CPA stay NULL when spend is NULL.
-- Leads: contacts on the run with at least one GHL tag listed for that line key.
-- Showed: distinct contacts among those leads with a zoom "attended" journey_events row for the same run/project
--   (contact + event date filters aligned with Show Up RPC).
-- Buyers: distinct contacts among those leads with at least one ghl_orders row in the order date window.
-- Conversion rate: buyers / leads (NULL when leads = 0).

CREATE OR REPLACE FUNCTION public.get_agency_stats(
  p_workspace_id UUID,
  p_project_id UUID,
  p_webinar_run_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ
)
RETURNS TABLE (
  agency_line TEXT,
  webinar_run_id UUID,
  run_label TEXT,
  leads BIGINT,
  showed BIGINT,
  showup_rate NUMERIC,
  buyers BIGINT,
  conversion_rate NUMERIC,
  ad_spend NUMERIC,
  cpl NUMERIC,
  cpa NUMERIC
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
  run_row AS (
    SELECT wr.id AS wr_id, wr.display_label AS run_label
    FROM public.webinar_runs wr
    INNER JOIN guard g ON wr.id = p_webinar_run_id AND wr.project_id = g.project_id
  ),
  line_data AS (
    SELECT
      line_key.agency_line,
      COALESCE(
        ARRAY(
          SELECT JSONB_ARRAY_ELEMENTS_TEXT(g.agency_tags->line_key.agency_line)
        ),
        ARRAY[]::TEXT[]
      ) AS tag_array
    FROM guard g
    CROSS JOIN LATERAL JSONB_OBJECT_KEYS(g.agency_tags) AS line_key(agency_line)
  )
  SELECT
    ld.agency_line,
    rr.wr_id AS webinar_run_id,
    rr.run_label,
    m.leads,
    m.showed,
    CASE
      WHEN m.leads > 0
      THEN m.showed::NUMERIC / m.leads::NUMERIC
      ELSE NULL
    END AS showup_rate,
    m.buyers,
    CASE
      WHEN m.leads > 0
      THEN m.buyers::NUMERIC / m.leads::NUMERIC
      ELSE NULL
    END AS conversion_rate,
    -- TODO: replace NULL when Phase-1-Open-Decisions #1 (ad spend data source) is resolved.
    NULL::NUMERIC AS ad_spend,
    NULL::NUMERIC AS cpl,
    NULL::NUMERIC AS cpa
  FROM line_data ld
  CROSS JOIN run_row rr
  CROSS JOIN guard g
  CROSS JOIN LATERAL (
    SELECT
      (
        SELECT COUNT(*)::BIGINT
        FROM public.ghl_contacts c
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
          AND EXISTS (
            SELECT 1
            FROM public.ghl_contact_tags ct
            WHERE ct.contact_id = c.id
              AND ct.tag_name = ANY (ld.tag_array)
          )
      ) AS leads,
      (
        SELECT COUNT(DISTINCT je.contact_id)::BIGINT
        FROM public.journey_events je
        INNER JOIN public.ghl_contacts c ON c.id = je.contact_id
        WHERE c.location_id = g.ghl_location_id
          AND c.webinar_run_id = p_webinar_run_id
          AND je.webinar_run_id = p_webinar_run_id
          AND je.project_id = g.project_id
          AND je.source_system = 'zoom'
          AND je.event_type = 'attended'
          AND je.contact_id IS NOT NULL
          AND (
            p_date_from IS NULL
            OR COALESCE(c.date_added, c.synced_at) >= p_date_from
          )
          AND (
            p_date_to IS NULL
            OR COALESCE(c.date_added, c.synced_at) <= p_date_to
          )
          AND (
            p_date_from IS NULL
            OR je.occurred_at >= p_date_from
          )
          AND (
            p_date_to IS NULL
            OR je.occurred_at <= p_date_to
          )
          AND EXISTS (
            SELECT 1
            FROM public.ghl_contact_tags ct
            WHERE ct.contact_id = c.id
              AND ct.tag_name = ANY (ld.tag_array)
          )
      ) AS showed,
      (
        SELECT COUNT(DISTINCT o.contact_id)::BIGINT
        FROM public.ghl_orders o
        INNER JOIN public.ghl_contacts c ON c.id = o.contact_id
        WHERE c.location_id = g.ghl_location_id
          AND c.webinar_run_id = p_webinar_run_id
          AND o.location_id = g.ghl_location_id
          AND o.contact_id IS NOT NULL
          AND (
            p_date_from IS NULL
            OR COALESCE(c.date_added, c.synced_at) >= p_date_from
          )
          AND (
            p_date_to IS NULL
            OR COALESCE(c.date_added, c.synced_at) <= p_date_to
          )
          AND (
            p_date_from IS NULL
            OR COALESCE(o.created_at_provider, o.synced_at) >= p_date_from
          )
          AND (
            p_date_to IS NULL
            OR COALESCE(o.created_at_provider, o.synced_at) <= p_date_to
          )
          AND EXISTS (
            SELECT 1
            FROM public.ghl_contact_tags ct
            WHERE ct.contact_id = c.id
              AND ct.tag_name = ANY (ld.tag_array)
          )
      ) AS buyers
  ) m;
$$;

GRANT EXECUTE ON FUNCTION public.get_agency_stats(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_stats(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
