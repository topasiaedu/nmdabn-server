-- Traffic dashboard: last-touch UTM dimensions only (no custom breakdown sections).
-- New param p_utm_axes: which of utm_source, utm_medium, utm_campaign, utm_content to
-- combine into row labels (order is always source → medium → campaign → content).
-- Default: ARRAY['utm_content']::TEXT[].
--
-- Last touch: prefer attribution row with is_last true, else highest position.
-- Counts: COUNT(DISTINCT ghl_contacts.id) per (run, combination label).
--
-- Replaces 3-arg get_traffic_all_runs with 4-arg version (previous 3-arg signature dropped).

DROP FUNCTION IF EXISTS public.get_traffic_all_runs(UUID, UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.get_traffic_all_runs(UUID, UUID, TEXT[], TEXT[]);

CREATE OR REPLACE FUNCTION public.get_traffic_all_runs(
  p_project_id    UUID,
  p_workspace_id  UUID,
  p_line_tags     TEXT[] DEFAULT NULL,
  p_utm_axes      TEXT[] DEFAULT ARRAY['utm_content']::TEXT[]
)
RETURNS TABLE (
  run_id         UUID,
  run_start_at   TIMESTAMPTZ,
  section_key    TEXT,
  section_label  TEXT,
  row_label      TEXT,
  lead_count     BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (
    SELECT
      p.id               AS project_id,
      p.ghl_location_id
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.workspace_id = p_workspace_id
  ),

  axes_src AS (
    SELECT COALESCE(NULLIF(p_utm_axes, ARRAY[]::TEXT[]), ARRAY['utm_content']::TEXT[]) AS raw
  ),

  axes_final AS (
    SELECT CASE
      WHEN cardinality(f.axes) > 0 THEN f.axes
      ELSE ARRAY['utm_content']::TEXT[]
    END AS axes
    FROM (
      SELECT ARRAY(
        SELECT ax
        FROM unnest(
          ARRAY[
            'utm_source'::TEXT,
            'utm_medium'::TEXT,
            'utm_campaign'::TEXT,
            'utm_content'::TEXT
          ]
        ) AS ax
        WHERE EXISTS (
          SELECT 1
          FROM axes_src s
          WHERE ax = ANY(s.raw)
        )
      ) AS axes
    ) AS f
  ),

  project_runs AS (
    SELECT wr.id AS run_id, wr.event_start_at AS run_start_at
    FROM public.webinar_runs wr
    CROSS JOIN guard g
    WHERE wr.project_id = g.project_id
  ),

  utm_counts AS (
    SELECT
      r.run_id,
      r.run_start_at,
      'utm_breakdown'::TEXT AS section_key,
      MAX(
        'Last touch — ' || (
          SELECT array_to_string(
            ARRAY(
              SELECT INITCAP(REPLACE(x, 'utm_', ''))
              FROM unnest(af.axes) AS t(x)
            ),
            ' · '
          )
        )
      ) AS section_label,
      CONCAT_WS(
        ' | ',
        CASE
          WHEN 'utm_source' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_source), ''), 'Missing')
        END,
        CASE
          WHEN 'utm_medium' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_medium), ''), 'Missing')
        END,
        CASE
          WHEN 'utm_campaign' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_campaign), ''), 'Missing')
        END,
        CASE
          WHEN 'utm_content' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_content), ''), 'Missing')
        END
      ) AS row_label,
      COUNT(DISTINCT c.id)::BIGINT AS lead_count
    FROM project_runs r
    CROSS JOIN guard g
    CROSS JOIN axes_final af
    INNER JOIN public.ghl_contacts c
      ON  c.webinar_run_id = r.run_id
      AND c.location_id    = g.ghl_location_id
    LEFT JOIN LATERAL (
      SELECT
        a.utm_source,
        a.utm_medium,
        a.utm_campaign,
        a.utm_content
      FROM public.ghl_contact_attributions a
      WHERE a.contact_id  = c.id
        AND a.location_id = g.ghl_location_id
      ORDER BY
        (a.is_last IS NOT DISTINCT FROM TRUE) DESC,
        a.position DESC
      LIMIT 1
    ) lt ON TRUE
    WHERE p_line_tags IS NULL
       OR EXISTS (
            SELECT 1
            FROM public.ghl_contact_tags ct
            WHERE ct.contact_id = c.id
              AND ct.tag_name = ANY (p_line_tags)
          )
    GROUP BY
      r.run_id,
      r.run_start_at,
      af.axes,
      CONCAT_WS(
        ' | ',
        CASE
          WHEN 'utm_source' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_source), ''), 'Missing')
        END,
        CASE
          WHEN 'utm_medium' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_medium), ''), 'Missing')
        END,
        CASE
          WHEN 'utm_campaign' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_campaign), ''), 'Missing')
        END,
        CASE
          WHEN 'utm_content' = ANY(af.axes)
            THEN COALESCE(NULLIF(TRIM(lt.utm_content), ''), 'Missing')
        END
      )
  )

  SELECT
    u.run_id,
    u.run_start_at,
    u.section_key,
    u.section_label,
    u.row_label,
    u.lead_count
  FROM utm_counts u;
$$;

GRANT EXECUTE ON FUNCTION public.get_traffic_all_runs(UUID, UUID, TEXT[], TEXT[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_traffic_all_runs(UUID, UUID, TEXT[], TEXT[])
  TO service_role;
