-- RPCs for Traffic dashboard + webinar run assignment.
-- Apply after 006. Grant execute for PostgREST (service role uses bypass; explicit grants for clarity).

-- ---------------------------------------------------------------------------
-- Assign earliest future webinar run for one contact (opt-in = date_added).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_next_webinar_run_for_contact(p_contact_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id TEXT;
  v_opt_in TIMESTAMPTZ;
  v_run_id UUID;
BEGIN
  SELECT c.location_id,
    COALESCE(c.date_added, c.synced_at, '1970-01-01'::TIMESTAMPTZ)
  INTO v_location_id, v_opt_in
  FROM public.ghl_contacts c
  WHERE c.id = p_contact_id;

  IF v_location_id IS NULL THEN
    RETURN;
  END IF;

  SELECT r.id INTO v_run_id
  FROM public.webinar_runs r
  WHERE r.location_id = v_location_id
    AND COALESCE(r.is_active, TRUE)
    AND r.event_start_at > v_opt_in
  ORDER BY r.event_start_at ASC, r.sort_order NULLS LAST, r.id ASC
  LIMIT 1;

  UPDATE public.ghl_contacts c
  SET webinar_run_id = v_run_id
  WHERE c.id = p_contact_id
    AND (c.webinar_run_id IS DISTINCT FROM v_run_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill webinar_run_id for all contacts in a location.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_webinar_runs_for_location(p_location_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.ghl_contacts gc
  SET webinar_run_id = picked.run_id
  FROM (
    SELECT
      c.id AS cid,
      (
        SELECT r.id
        FROM public.webinar_runs r
        WHERE r.location_id = c.location_id
          AND COALESCE(r.is_active, TRUE)
          AND r.event_start_at > COALESCE(c.date_added, c.synced_at, '1970-01-01'::TIMESTAMPTZ)
        ORDER BY r.event_start_at ASC, r.sort_order NULLS LAST, r.id ASC
        LIMIT 1
      ) AS run_id
    FROM public.ghl_contacts c
    WHERE c.location_id = p_location_id
  ) picked
  WHERE gc.id = picked.cid
    AND (gc.webinar_run_id IS DISTINCT FROM picked.run_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- ---------------------------------------------------------------------------
-- Traffic: occupation x webinar run (counts only; percentages in API/UI).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.traffic_occupation_breakdown(
  p_location_id TEXT,
  p_line_tags TEXT[],
  p_occupation_field_id TEXT,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  occupation_label TEXT,
  webinar_run_id UUID,
  run_display_label TEXT,
  lead_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(cf.field_value), ''), 'Missing') AS occupation_label,
    c.webinar_run_id,
    COALESCE(wr.display_label, 'Unassigned') AS run_display_label,
    COUNT(*)::BIGINT AS lead_count
  FROM public.ghl_contacts c
  INNER JOIN public.ghl_contact_tags ct
    ON ct.contact_id = c.id
   AND ct.tag_name = ANY (p_line_tags)
  LEFT JOIN public.ghl_contact_custom_field_values cf
    ON cf.contact_id = c.id
   AND cf.field_id = p_occupation_field_id
  LEFT JOIN public.webinar_runs wr
    ON wr.id = c.webinar_run_id
  WHERE c.location_id = p_location_id
    AND (p_date_from IS NULL OR c.date_added >= p_date_from)
    AND (p_date_to IS NULL OR c.date_added <= p_date_to)
  GROUP BY
    COALESCE(NULLIF(TRIM(cf.field_value), ''), 'Missing'),
    c.webinar_run_id,
    wr.display_label;
$$;

-- ---------------------------------------------------------------------------
-- Traffic: lead source (first-touch style) x webinar run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.traffic_lead_source_breakdown(
  p_location_id TEXT,
  p_line_tags TEXT[],
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  lead_source_key TEXT,
  webinar_run_id UUID,
  run_display_label TEXT,
  lead_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH first_touch AS (
    SELECT DISTINCT ON (a.contact_id)
      a.contact_id,
      a.utm_campaign,
      a.utm_source,
      a.utm_medium,
      a.utm_session_source
    FROM public.ghl_contact_attributions a
    INNER JOIN public.ghl_contacts c2 ON c2.id = a.contact_id
    WHERE c2.location_id = p_location_id
    ORDER BY
      a.contact_id,
      CASE WHEN a.is_first IS TRUE THEN 0 ELSE 1 END,
      a.position ASC
  )
  SELECT
    CASE
      WHEN TRIM(COALESCE(ft.utm_campaign, '')) <> '' THEN TRIM(ft.utm_campaign)
      WHEN TRIM(COALESCE(ft.utm_source, '')) <> ''
        OR TRIM(COALESCE(ft.utm_medium, '')) <> ''
        THEN TRIM(CONCAT(COALESCE(ft.utm_source, ''), '|', COALESCE(ft.utm_medium, '')))
      WHEN TRIM(COALESCE(ft.utm_session_source, '')) <> ''
        THEN TRIM(ft.utm_session_source)
      WHEN TRIM(COALESCE(c.source, '')) <> '' THEN TRIM(c.source)
      ELSE 'Missing UTM'
    END AS lead_source_key,
    c.webinar_run_id,
    COALESCE(wr.display_label, 'Unassigned') AS run_display_label,
    COUNT(*)::BIGINT AS lead_count
  FROM public.ghl_contacts c
  INNER JOIN public.ghl_contact_tags ct
    ON ct.contact_id = c.id
   AND ct.tag_name = ANY (p_line_tags)
  LEFT JOIN first_touch ft ON ft.contact_id = c.id
  LEFT JOIN public.webinar_runs wr ON wr.id = c.webinar_run_id
  WHERE c.location_id = p_location_id
    AND (p_date_from IS NULL OR c.date_added >= p_date_from)
    AND (p_date_to IS NULL OR c.date_added <= p_date_to)
  GROUP BY
    CASE
      WHEN TRIM(COALESCE(ft.utm_campaign, '')) <> '' THEN TRIM(ft.utm_campaign)
      WHEN TRIM(COALESCE(ft.utm_source, '')) <> ''
        OR TRIM(COALESCE(ft.utm_medium, '')) <> ''
        THEN TRIM(CONCAT(COALESCE(ft.utm_source, ''), '|', COALESCE(ft.utm_medium, '')))
      WHEN TRIM(COALESCE(ft.utm_session_source, '')) <> ''
        THEN TRIM(ft.utm_session_source)
      WHEN TRIM(COALESCE(c.source, '')) <> '' THEN TRIM(c.source)
      ELSE 'Missing UTM'
    END,
    c.webinar_run_id,
    wr.display_label;
$$;

GRANT EXECUTE ON FUNCTION public.assign_next_webinar_run_for_contact(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_webinar_runs_for_location(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.traffic_occupation_breakdown(TEXT, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.traffic_lead_source_breakdown(TEXT, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
