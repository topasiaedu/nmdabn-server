-- All-runs dashboard RPCs: replace the per-run filtered RPCs for new column-table dashboards.
-- Old RPCs (get_traffic_dashboard / get_showup_stats / get_buyer_behavior_stats / get_agency_stats)
-- are intentionally left in place for backward compatibility.
--
-- Each new RPC returns flat (run_id, run_start_at, section_key, section_label, row_label, ...)
-- rows that Node.js pivots into column-table format.
--
-- Depends on: 009 (ghl_custom_fields), 011 (journey_events), 019 (traffic_breakdown_fields).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TRAFFIC: lead count by breakdown field value × run
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns: one row per (run, section, row_label).
-- p_line_tags: when non-null, only contacts whose tags overlap p_line_tags are counted.
-- section_key: 'lead_source' for the always-present UTM section, else the field_key.

CREATE OR REPLACE FUNCTION public.get_traffic_all_runs(
  p_project_id  UUID,
  p_workspace_id UUID,
  p_line_tags   TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  run_id        UUID,
  run_start_at  TIMESTAMPTZ,
  section_key   TEXT,
  section_label TEXT,
  row_label     TEXT,
  lead_count    BIGINT
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

  -- All runs for the project, ordered by date
  project_runs AS (
    SELECT wr.id AS run_id, wr.event_start_at AS run_start_at
    FROM public.webinar_runs wr
    CROSS JOIN guard g
    WHERE wr.project_id = g.project_id
  ),

  -- Unnest the JSONB breakdown fields array
  fields_unnested AS (
    SELECT
      (f.entry->>'field_key') AS field_key,
      (f.entry->>'label')     AS field_label
    FROM guard g
    CROSS JOIN LATERAL jsonb_array_elements(g.breakdown_fields) AS f(entry)
  ),

  -- Resolve each field_key to a concrete field_id in ghl_custom_fields
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

  -- Custom breakdown-field sections: counts per (run × field × value)
  custom_counts AS (
    SELECT
      r.run_id,
      r.run_start_at,
      fi.field_key                                                  AS section_key,
      fi.field_label                                                AS section_label,
      COALESCE(NULLIF(TRIM(cv.field_value), ''), 'Missing')        AS row_label,
      COUNT(*)::BIGINT                                              AS lead_count
    FROM project_runs r
    CROSS JOIN field_ids fi
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    LEFT JOIN public.ghl_contact_custom_field_values cv
      ON  cv.contact_id = c.id
      AND cv.field_id   = fi.field_id
    WHERE p_line_tags IS NULL
       OR EXISTS (
            SELECT 1
            FROM public.ghl_contact_tags ct
            WHERE ct.contact_id = c.id
              AND ct.tag_name = ANY (p_line_tags)
          )
    GROUP BY
      r.run_id, r.run_start_at,
      fi.field_key, fi.field_label,
      COALESCE(NULLIF(TRIM(cv.field_value), ''), 'Missing')
  ),

  -- Lead-source section (always present): first-touch UTM key per contact × run
  source_counts AS (
    SELECT
      r.run_id,
      r.run_start_at,
      'lead_source'::TEXT        AS section_key,
      'Sorted Lead Source'::TEXT AS section_label,
      COALESCE(
        NULLIF(TRIM(ft.lead_source_val), ''),
        'Missing UTM'
      )                          AS row_label,
      COUNT(DISTINCT c.id)::BIGINT AS lead_count
    FROM project_runs r
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN TRIM(COALESCE(a.utm_campaign, '')) <> ''
            THEN TRIM(a.utm_campaign)
          WHEN TRIM(COALESCE(a.utm_source, '')) <> ''
            OR  TRIM(COALESCE(a.utm_medium, '')) <> ''
            THEN TRIM(CONCAT(COALESCE(a.utm_source, ''), '|', COALESCE(a.utm_medium, '')))
          WHEN TRIM(COALESCE(a.utm_session_source, '')) <> ''
            THEN TRIM(a.utm_session_source)
          ELSE NULL
        END AS lead_source_val
      FROM public.ghl_contact_attributions a
      WHERE a.contact_id   = c.id
        AND a.location_id  = g.ghl_location_id
      ORDER BY
        CASE WHEN a.is_first IS TRUE THEN 0 ELSE 1 END,
        a.position ASC
      LIMIT 1
    ) ft ON TRUE
    WHERE p_line_tags IS NULL
       OR EXISTS (
            SELECT 1
            FROM public.ghl_contact_tags ct
            WHERE ct.contact_id = c.id
              AND ct.tag_name = ANY (p_line_tags)
          )
    GROUP BY
      r.run_id, r.run_start_at,
      COALESCE(NULLIF(TRIM(ft.lead_source_val), ''), 'Missing UTM')
  )

  SELECT run_id, run_start_at, section_key, section_label, row_label, lead_count
  FROM custom_counts
  UNION ALL
  SELECT run_id, run_start_at, section_key, section_label, row_label, lead_count
  FROM source_counts;
$$;

GRANT EXECUTE ON FUNCTION public.get_traffic_all_runs(UUID, UUID, TEXT[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_traffic_all_runs(UUID, UUID, TEXT[])
  TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SHOW UP: attended/total counts by breakdown field value × run
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns: one row per (run, section, row_label).
-- attended: distinct contacts with a zoom "attended" journey_events row for that run.
-- total:    all contacts on the run (same denominator as traffic).

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

  -- Contacts × runs with their breakdown field value
  contacts_per_run AS (
    SELECT
      r.run_id,
      r.run_start_at,
      fi.field_key   AS section_key,
      fi.field_label AS section_label,
      COALESCE(NULLIF(TRIM(cv.field_value), ''), 'Missing') AS row_label,
      c.id AS contact_id
    FROM project_runs r
    CROSS JOIN field_ids fi
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    LEFT JOIN public.ghl_contact_custom_field_values cv
      ON  cv.contact_id = c.id
      AND cv.field_id   = fi.field_id
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BUYER BEHAVIOR: DYD / occupation / program / purchase per run
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns: (run_id, run_start_at, section, label, count, pct).
-- 'dyd':        Full / Deposit / Installment / Total student pax.
-- '<field_key>': per breakdown field, occupation-style buyer counts.
-- 'program':    first-touch utm_campaign of buyers.
-- 'purchase':   order_count / distinct_buyers / sum_paid / sum_total.

CREATE OR REPLACE FUNCTION public.get_buyer_behavior_all_runs(
  p_project_id   UUID,
  p_workspace_id UUID
)
RETURNS TABLE (
  run_id       UUID,
  run_start_at TIMESTAMPTZ,
  section      TEXT,
  label        TEXT,
  count        BIGINT,
  pct          NUMERIC
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

  -- All buyers (contacts with at least one order)
  buyers_per_run AS (
    SELECT DISTINCT
      r.run_id,
      r.run_start_at,
      c.id AS contact_id
    FROM project_runs r
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    INNER JOIN public.ghl_orders o
      ON  o.contact_id  = c.id
      AND o.location_id = g.ghl_location_id
  ),

  -- Orders scoped to buyers
  orders_per_run AS (
    SELECT
      r.run_id,
      r.run_start_at,
      o.id          AS order_id,
      o.contact_id,
      o.paid_amount,
      o.total_amount
    FROM project_runs r
    CROSS JOIN guard g
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    INNER JOIN public.ghl_orders o
      ON  o.contact_id  = c.id
      AND o.location_id = g.ghl_location_id
  ),

  -- DYD classification of order line items
  classified_lines AS (
    SELECT
      opr.run_id,
      opr.run_start_at,
      opr.contact_id,
      CASE
        WHEN TRIM(COALESCE(oli.name, '')) ILIKE '%full%'                                  THEN 'Full'
        WHEN TRIM(COALESCE(oli.name, '')) ILIKE '%deposit%'                               THEN 'Deposit'
        WHEN TRIM(COALESCE(oli.name, '')) ILIKE '%installment%'
          OR TRIM(COALESCE(oli.name, '')) ILIKE '%install%'                               THEN 'Installment'
        ELSE NULL
      END AS dyd_bucket
    FROM orders_per_run opr
    INNER JOIN public.ghl_order_line_items oli
      ON oli.order_id = opr.order_id
  ),

  -- Buyer totals per run (for pct calculation)
  buyer_totals AS (
    SELECT run_id, COUNT(DISTINCT contact_id)::BIGINT AS n
    FROM buyers_per_run
    GROUP BY run_id
  ),

  -- DYD counts
  dyd_counts AS (
    SELECT
      cl.run_id,
      cl.run_start_at,
      'dyd'::TEXT                                  AS section,
      cl.dyd_bucket                                AS label,
      COUNT(DISTINCT cl.contact_id)::BIGINT        AS cnt
    FROM classified_lines cl
    WHERE cl.dyd_bucket IS NOT NULL
    GROUP BY cl.run_id, cl.run_start_at, cl.dyd_bucket
    UNION ALL
    -- Total student pax (any classified line)
    SELECT
      cl.run_id,
      cl.run_start_at,
      'dyd'::TEXT                                  AS section,
      'Total student pax'::TEXT                    AS label,
      COUNT(DISTINCT cl.contact_id)::BIGINT        AS cnt
    FROM classified_lines cl
    WHERE cl.dyd_bucket IS NOT NULL
    GROUP BY cl.run_id, cl.run_start_at
  ),

  -- Breakdown field counts for buyers
  occ_counts AS (
    SELECT
      bpr.run_id,
      bpr.run_start_at,
      fi.field_key                                                  AS section,
      COALESCE(NULLIF(TRIM(cv.field_value), ''), 'Missing')        AS label,
      COUNT(DISTINCT bpr.contact_id)::BIGINT                       AS cnt
    FROM buyers_per_run bpr
    CROSS JOIN field_ids fi
    LEFT JOIN public.ghl_contact_custom_field_values cv
      ON  cv.contact_id = bpr.contact_id
      AND cv.field_id   = fi.field_id
    GROUP BY
      bpr.run_id, bpr.run_start_at,
      fi.field_key,
      COALESCE(NULLIF(TRIM(cv.field_value), ''), 'Missing')
  ),

  -- Program (first-touch utm_campaign)
  prog_counts AS (
    SELECT
      bpr.run_id,
      bpr.run_start_at,
      'program'::TEXT                                              AS section,
      COALESCE(NULLIF(TRIM(ft.utm_campaign), ''), 'Missing')      AS label,
      COUNT(DISTINCT bpr.contact_id)::BIGINT                      AS cnt
    FROM buyers_per_run bpr
    CROSS JOIN guard g
    LEFT JOIN LATERAL (
      SELECT COALESCE(a.utm_campaign, '') AS utm_campaign
      FROM public.ghl_contact_attributions a
      WHERE a.contact_id  = bpr.contact_id
        AND a.location_id = g.ghl_location_id
      ORDER BY
        CASE WHEN a.is_first IS TRUE THEN 0 ELSE 1 END,
        a.position ASC
      LIMIT 1
    ) ft ON TRUE
    GROUP BY
      bpr.run_id, bpr.run_start_at,
      COALESCE(NULLIF(TRIM(ft.utm_campaign), ''), 'Missing')
  ),

  -- Purchase aggregates
  purchase_stats AS (
    SELECT
      run_id,
      run_start_at,
      COUNT(*)::BIGINT                        AS order_count,
      COUNT(DISTINCT contact_id)::BIGINT      AS distinct_buyers,
      COALESCE(SUM(paid_amount), 0)::NUMERIC  AS sum_paid,
      COALESCE(SUM(total_amount), 0)::NUMERIC AS sum_total
    FROM orders_per_run
    GROUP BY run_id, run_start_at
  )

  -- DYD rows (no pct)
  SELECT
    dc.run_id,
    dc.run_start_at,
    dc.section,
    dc.label,
    dc.cnt,
    NULL::NUMERIC AS pct
  FROM dyd_counts dc

  UNION ALL

  -- Occupation / breakdown field rows (with pct relative to total buyers)
  SELECT
    oc.run_id,
    oc.run_start_at,
    oc.section,
    oc.label,
    oc.cnt,
    CASE WHEN bt.n > 0 THEN oc.cnt::NUMERIC / bt.n ELSE NULL END AS pct
  FROM occ_counts oc
  LEFT JOIN buyer_totals bt ON bt.run_id = oc.run_id

  UNION ALL

  -- Program rows (with pct relative to total buyers)
  SELECT
    pc.run_id,
    pc.run_start_at,
    pc.section,
    pc.label,
    pc.cnt,
    CASE WHEN bt.n > 0 THEN pc.cnt::NUMERIC / bt.n ELSE NULL END AS pct
  FROM prog_counts pc
  LEFT JOIN buyer_totals bt ON bt.run_id = pc.run_id

  UNION ALL

  -- Purchase summary rows (numeric, no pct)
  SELECT run_id, run_start_at, 'purchase'::TEXT, 'order_count'::TEXT,     order_count,     NULL FROM purchase_stats
  UNION ALL
  SELECT run_id, run_start_at, 'purchase'::TEXT, 'distinct_buyers'::TEXT, distinct_buyers,  NULL FROM purchase_stats;
$$;

GRANT EXECUTE ON FUNCTION public.get_buyer_behavior_all_runs(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_buyer_behavior_all_runs(UUID, UUID)
  TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AGENCY: leads / showed / buyers per (agency line × run)
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns one row per (run, agency_line).

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
  conv_rate     NUMERIC
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

  -- Unnest the agency line keys and their tag arrays
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

  -- Contacts per (run × agency line)
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

  -- Contacts that attended (zoom journey_events) per run
  attended_per_run AS (
    SELECT DISTINCT je.contact_id, je.webinar_run_id
    FROM public.journey_events je
    CROSS JOIN guard g
    WHERE je.project_id    = g.project_id
      AND je.source_system = 'zoom'
      AND je.event_type    = 'attended'
      AND je.contact_id IS NOT NULL
  ),

  -- Buyer contacts per run (contacts with at least one order)
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
    END AS conv_rate
  FROM line_leads ll
  LEFT JOIN attended_per_run a
    ON  a.contact_id     = ll.contact_id
    AND a.webinar_run_id = ll.run_id
  LEFT JOIN buyers_per_run b
    ON  b.contact_id = ll.contact_id
    AND b.run_id     = ll.run_id
  GROUP BY
    ll.run_id, ll.run_start_at, ll.agency_line;
$$;

GRANT EXECUTE ON FUNCTION public.get_agency_all_runs(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_all_runs(UUID, UUID)
  TO service_role;
