-- Agency dashboard RPCs: replace NULL ad spend placeholders with attributed Meta Ads spend.
-- Resolves Phase-1-Open-Decisions #1 for CPL/CPA when `ad_spend_run_attribution` rows exist (migration 026).

-- Postgres cannot change RETURNS TABLE shape with CREATE OR REPLACE alone.
DROP FUNCTION IF EXISTS public.get_agency_stats(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_agency_all_runs(UUID, UUID);

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
  ad_spend_currency TEXT,
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
    sx.spend AS ad_spend,
    sx.currency AS ad_spend_currency,
    CASE
      WHEN m.leads > 0 AND sx.spend IS NOT NULL
      THEN sx.spend / m.leads::NUMERIC
      ELSE NULL
    END AS cpl,
    CASE
      WHEN m.buyers > 0 AND sx.spend IS NOT NULL
      THEN sx.spend / m.buyers::NUMERIC
      ELSE NULL
    END AS cpa
  FROM line_data ld
  CROSS JOIN run_row rr
  CROSS JOIN guard g
  LEFT JOIN LATERAL (
    SELECT asra.spend, asra.currency
    FROM public.ad_spend_run_attribution AS asra
    WHERE asra.project_id = g.project_id
      AND asra.webinar_run_id = rr.wr_id
      AND asra.agency_line = ld.agency_line
      AND asra.source_system = 'meta_ads'
    LIMIT 1
  ) sx ON TRUE
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


CREATE OR REPLACE FUNCTION public.get_agency_all_runs(
  p_project_id   UUID,
  p_workspace_id UUID
)
RETURNS TABLE (
  run_id        UUID,
  run_start_at  TIMESTAMPTZ,
  agency_line   TEXT,
  leads         BIGINT,
  showed        BIGINT,
  buyers        BIGINT,
  showup_rate   NUMERIC,
  conv_rate     NUMERIC,
  ad_spend      NUMERIC,
  ad_spend_currency TEXT,
  cpl           NUMERIC,
  cpa           NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (
    SELECT
      p.id                                                          AS project_id,
      p.ghl_location_id,
      COALESCE(p.traffic_agency_line_tags, '{}'::JSONB)            AS agency_tags
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

  line_data AS (
    SELECT
      line_key.agency_line,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(g.agency_tags->line_key.agency_line)),
        ARRAY[]::TEXT[]
      ) AS tag_array
    FROM guard g
    CROSS JOIN LATERAL jsonb_object_keys(g.agency_tags) AS line_key(agency_line)
  ),

  line_leads AS (
    SELECT
      r.run_id,
      r.run_start_at,
      ld.agency_line,
      c.id AS contact_id
    FROM project_runs r
    CROSS JOIN line_data ld
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    WHERE EXISTS (
      SELECT 1
      FROM public.ghl_contact_tags ct
      WHERE ct.contact_id = c.id
        AND ct.tag_name = ANY (ld.tag_array)
    )
  ),

  attended_per_run AS (
    SELECT DISTINCT je.contact_id, je.webinar_run_id
    FROM public.journey_events je
    CROSS JOIN guard g
    WHERE je.project_id    = g.project_id
      AND je.source_system = 'zoom'
      AND je.event_type    = 'attended'
      AND je.contact_id IS NOT NULL
  ),

  buyers_per_run AS (
    SELECT DISTINCT
      r.run_id,
      c.id AS contact_id
    FROM project_runs r
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    INNER JOIN public.ghl_orders o
      ON  o.contact_id  = c.id
      AND o.location_id = g.ghl_location_id
  )

  SELECT
    ll.run_id,
    ll.run_start_at,
    ll.agency_line,
    COUNT(DISTINCT ll.contact_id)::BIGINT                                                            AS leads,
    COUNT(DISTINCT CASE WHEN a.contact_id IS NOT NULL THEN ll.contact_id END)::BIGINT               AS showed,
    COUNT(DISTINCT CASE WHEN b.contact_id IS NOT NULL THEN ll.contact_id END)::BIGINT               AS buyers,
    CASE
      WHEN COUNT(DISTINCT ll.contact_id) > 0
      THEN COUNT(DISTINCT CASE WHEN a.contact_id IS NOT NULL THEN ll.contact_id END)::NUMERIC
           / COUNT(DISTINCT ll.contact_id)::NUMERIC
      ELSE NULL
    END AS showup_rate,
    CASE
      WHEN COUNT(DISTINCT ll.contact_id) > 0
      THEN COUNT(DISTINCT CASE WHEN b.contact_id IS NOT NULL THEN ll.contact_id END)::NUMERIC
           / COUNT(DISTINCT ll.contact_id)::NUMERIC
      ELSE NULL
    END AS conv_rate,
    MAX(asra.spend)::NUMERIC                                                                          AS ad_spend,
    MAX(asra.currency)::TEXT                                                                          AS ad_spend_currency,
    CASE
      WHEN COUNT(DISTINCT ll.contact_id) > 0 AND MAX(asra.spend) IS NOT NULL
      THEN MAX(asra.spend) / COUNT(DISTINCT ll.contact_id)::NUMERIC
      ELSE NULL
    END AS cpl,
    CASE
      WHEN COUNT(DISTINCT CASE WHEN b.contact_id IS NOT NULL THEN ll.contact_id END) > 0
        AND MAX(asra.spend) IS NOT NULL
      THEN MAX(asra.spend) / COUNT(DISTINCT CASE WHEN b.contact_id IS NOT NULL THEN ll.contact_id END)::NUMERIC
      ELSE NULL
    END AS cpa
  FROM line_leads ll
  LEFT JOIN attended_per_run a
    ON  a.contact_id     = ll.contact_id
    AND a.webinar_run_id = ll.run_id
  LEFT JOIN buyers_per_run b
    ON  b.contact_id = ll.contact_id
    AND b.run_id     = ll.run_id
  LEFT JOIN public.ad_spend_run_attribution AS asra
    ON  asra.project_id = (SELECT gg.project_id FROM guard gg)
    AND asra.webinar_run_id = ll.run_id
    AND asra.agency_line = ll.agency_line
    AND asra.source_system = 'meta_ads'
  GROUP BY
    ll.run_id, ll.run_start_at, ll.agency_line;
$$;

GRANT EXECUTE ON FUNCTION public.get_agency_all_runs(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_all_runs(UUID, UUID)
  TO service_role;
