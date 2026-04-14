-- Buyer Behavior dashboard RPC: DYD-style buckets from order line names, occupation, program (UTM), purchases.
-- Apply after 005 (orders), 011 (journey_events). See SQL comments for metric definitions.

-- Cohort (buyer_contacts): same scope as Show Up — contacts on the project GHL location with
--   webinar_run_id = run; opt-in date = COALESCE(date_added, synced_at) vs p_date_from / p_date_to.
-- Orders in scope: ghl_orders for those contacts, same location, order_ts = COALESCE(created_at_provider, synced_at)
--   vs the same date bounds. Orders with NULL order_ts are excluded when a date bound is set (documented here).
-- DYD line classification (per line item row, mutually exclusive, priority Full > Deposit > Installment):
--   CAE sheet labels must match GHL product/line names; adjust ILIKE patterns if vendor labels differ.
-- Closing Showup / Closing %: no first-class source in schema yet — placeholder rows with NULL (see TODO below).
-- Occupation %: count / total distinct buyers (orders in scope).
-- Program: first-touch utm_campaign per buyer (same ordering as traffic_lead_source_breakdown).

CREATE OR REPLACE FUNCTION public.get_buyer_behavior_stats(
  p_workspace_id UUID,
  p_project_id UUID,
  p_webinar_run_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ
)
RETURNS TABLE (
  section TEXT,
  label TEXT,
  sort_key INTEGER,
  bigint_val BIGINT,
  numeric_val NUMERIC,
  pct NUMERIC
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
      p.traffic_occupation_field_id
    FROM public.projects p
    INNER JOIN public.webinar_runs wr
      ON wr.id = p_webinar_run_id
      AND wr.project_id = p.id
    WHERE p.id = p_project_id
      AND p.workspace_id = p_workspace_id
  ),
  buyer_contacts AS (
    SELECT c.id AS contact_id
    FROM public.ghl_contacts c
    CROSS JOIN guard g
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
  orders_scoped AS (
    SELECT
      o.id AS order_id,
      o.contact_id,
      o.location_id,
      o.paid_amount,
      o.total_amount,
      COALESCE(o.created_at_provider, o.synced_at) AS order_ts
    FROM public.ghl_orders o
    INNER JOIN buyer_contacts bc ON bc.contact_id = o.contact_id
    CROSS JOIN guard g
    WHERE o.location_id = g.ghl_location_id
      AND o.contact_id IS NOT NULL
      AND (
        p_date_from IS NULL
        OR COALESCE(o.created_at_provider, o.synced_at) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(o.created_at_provider, o.synced_at) <= p_date_to
      )
  ),
  buyers AS (
    SELECT DISTINCT orders_scoped.contact_id
    FROM orders_scoped
  ),
  classified_lines AS (
    SELECT
      os.contact_id,
      CASE
        WHEN TRIM(COALESCE(oli.name, '')) ILIKE '%full%' THEN 'Full'
        WHEN TRIM(COALESCE(oli.name, '')) ILIKE '%deposit%' THEN 'Deposit'
        WHEN TRIM(COALESCE(oli.name, '')) ILIKE '%installment%'
          OR TRIM(COALESCE(oli.name, '')) ILIKE '%install%' THEN 'Installment'
        ELSE NULL
      END AS dyd_bucket
    FROM orders_scoped os
    INNER JOIN public.ghl_order_line_items oli
      ON oli.order_id = os.order_id
      AND oli.location_id = os.location_id
  ),
  buyer_total AS (
    SELECT COUNT(*)::BIGINT AS n
    FROM buyers
  ),
  dyd_full AS (
    SELECT COUNT(DISTINCT classified_lines.contact_id)::BIGINT AS n
    FROM classified_lines
    WHERE classified_lines.dyd_bucket = 'Full'
  ),
  dyd_dep AS (
    SELECT COUNT(DISTINCT classified_lines.contact_id)::BIGINT AS n
    FROM classified_lines
    WHERE classified_lines.dyd_bucket = 'Deposit'
  ),
  dyd_inst AS (
    SELECT COUNT(DISTINCT classified_lines.contact_id)::BIGINT AS n
    FROM classified_lines
    WHERE classified_lines.dyd_bucket = 'Installment'
  ),
  dyd_total AS (
    SELECT COUNT(DISTINCT classified_lines.contact_id)::BIGINT AS n
    FROM classified_lines
    WHERE classified_lines.dyd_bucket IS NOT NULL
  ),
  occ_agg AS (
    SELECT
      CASE
        WHEN g.traffic_occupation_field_id IS NULL THEN 'Missing'
        ELSE COALESCE(NULLIF(TRIM(cf.field_value), ''), 'Missing')
      END AS occ_label,
      COUNT(*)::BIGINT AS cnt
    FROM buyers b
    CROSS JOIN guard g
    LEFT JOIN public.ghl_contact_custom_field_values cf
      ON cf.contact_id = b.contact_id
      AND cf.field_id = g.traffic_occupation_field_id
    GROUP BY
      CASE
        WHEN g.traffic_occupation_field_id IS NULL THEN 'Missing'
        ELSE COALESCE(NULLIF(TRIM(cf.field_value), ''), 'Missing')
      END
  ),
  occ_numbered AS (
    SELECT
      occ_agg.occ_label,
      occ_agg.cnt,
      ROW_NUMBER() OVER (ORDER BY occ_agg.occ_label) AS rn
    FROM occ_agg
  ),
  first_touch AS (
    SELECT DISTINCT ON (a.contact_id)
      a.contact_id,
      COALESCE(NULLIF(TRIM(a.utm_campaign), ''), 'Missing') AS program_label
    FROM public.ghl_contact_attributions a
    INNER JOIN buyers b ON b.contact_id = a.contact_id
    CROSS JOIN guard g
    WHERE a.location_id = g.ghl_location_id
    ORDER BY
      a.contact_id,
      CASE WHEN a.is_first IS TRUE THEN 0 ELSE 1 END,
      a.position ASC
  ),
  prog_agg AS (
    SELECT
      first_touch.program_label,
      COUNT(*)::BIGINT AS cnt
    FROM first_touch
    GROUP BY first_touch.program_label
  ),
  prog_numbered AS (
    SELECT
      prog_agg.program_label,
      prog_agg.cnt,
      ROW_NUMBER() OVER (ORDER BY prog_agg.program_label) AS rn
    FROM prog_agg
  ),
  purchase_orders AS (
    SELECT COUNT(*)::BIGINT AS n
    FROM orders_scoped
  ),
  purchase_sums AS (
    SELECT
      COALESCE(SUM(os.paid_amount), 0)::NUMERIC AS sum_paid,
      COALESCE(SUM(os.total_amount), 0)::NUMERIC AS sum_total
    FROM orders_scoped os
  )
  SELECT
    'dyd'::TEXT,
    'Full'::TEXT,
    1,
    dyd_full.n,
    NULL::NUMERIC,
    NULL::NUMERIC
  FROM guard
  CROSS JOIN dyd_full
  UNION ALL
  SELECT
    'dyd',
    'Deposit',
    2,
    dyd_dep.n,
    NULL,
    NULL
  FROM guard
  CROSS JOIN dyd_dep
  UNION ALL
  SELECT
    'dyd',
    'Installment',
    3,
    dyd_inst.n,
    NULL,
    NULL
  FROM guard
  CROSS JOIN dyd_inst
  UNION ALL
  SELECT
    'dyd',
    'Total student pax',
    4,
    dyd_total.n,
    NULL,
    NULL
  FROM guard
  CROSS JOIN dyd_total
  UNION ALL
  -- TODO: populate when "closing" session is modeled (journey_events event_type and/or dedicated webinar_run_id).
  SELECT
    'dyd_closing'::TEXT,
    'Closing Showup Pax'::TEXT,
    10,
    NULL::BIGINT,
    NULL::NUMERIC,
    NULL::NUMERIC
  FROM guard
  UNION ALL
  SELECT
    'dyd_closing'::TEXT,
    'Closing % (Total)'::TEXT,
    11,
    NULL::BIGINT,
    NULL::NUMERIC,
    NULL::NUMERIC
  FROM guard
  UNION ALL
  SELECT
    'occupation'::TEXT,
    occ_numbered.occ_label,
    100 + occ_numbered.rn::INTEGER,
    occ_numbered.cnt,
    NULL::NUMERIC,
    CASE
      WHEN bt.n > 0
      THEN occ_numbered.cnt::NUMERIC / bt.n::NUMERIC
      ELSE NULL
    END
  FROM guard
  CROSS JOIN buyer_total bt
  CROSS JOIN occ_numbered
  UNION ALL
  SELECT
    'program'::TEXT,
    prog_numbered.program_label,
    200 + prog_numbered.rn::INTEGER,
    prog_numbered.cnt,
    NULL::NUMERIC,
    CASE
      WHEN bt.n > 0
      THEN prog_numbered.cnt::NUMERIC / bt.n::NUMERIC
      ELSE NULL
    END
  FROM guard
  CROSS JOIN buyer_total bt
  CROSS JOIN prog_numbered
  UNION ALL
  SELECT
    'purchase'::TEXT,
    'order_count'::TEXT,
    300,
    purchase_orders.n,
    NULL::NUMERIC,
    NULL::NUMERIC
  FROM guard
  CROSS JOIN purchase_orders
  UNION ALL
  SELECT
    'purchase'::TEXT,
    'distinct_buyers'::TEXT,
    301,
    buyer_total.n,
    NULL::NUMERIC,
    NULL::NUMERIC
  FROM guard
  CROSS JOIN buyer_total
  UNION ALL
  SELECT
    'purchase'::TEXT,
    'sum_paid_amount'::TEXT,
    302,
    NULL::BIGINT,
    purchase_sums.sum_paid,
    NULL::NUMERIC
  FROM guard
  CROSS JOIN purchase_sums
  UNION ALL
  SELECT
    'purchase'::TEXT,
    'sum_total_amount'::TEXT,
    303,
    NULL::BIGINT,
    purchase_sums.sum_total,
    NULL::NUMERIC
  FROM guard
  CROSS JOIN purchase_sums;
$$;

GRANT EXECUTE ON FUNCTION public.get_buyer_behavior_stats(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_buyer_behavior_stats(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
