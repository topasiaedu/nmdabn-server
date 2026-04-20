-- Derived Meta ad spend per webinar run × agency line (date-overlap attribution).
-- Filled by recompute_meta_spend_attribution after sync; Agency RPCs read from here.

-- Idempotent: migration 025 adds these on webinar_runs; repeat here if an earlier 025 run stopped before ALTER.
ALTER TABLE public.webinar_runs
    ADD COLUMN IF NOT EXISTS spend_date_from TIMESTAMPTZ;

ALTER TABLE public.webinar_runs
    ADD COLUMN IF NOT EXISTS spend_date_to TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.ad_spend_run_attribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
    webinar_run_id UUID NOT NULL REFERENCES public.webinar_runs (id) ON DELETE CASCADE,
    agency_line TEXT NOT NULL,
    integration_account_id UUID REFERENCES public.integration_accounts (id) ON DELETE SET NULL,
    spend NUMERIC(12, 4) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    source_system TEXT NOT NULL DEFAULT 'meta_ads',
    attribution_method TEXT NOT NULL DEFAULT 'date_overlap',
    date_from TIMESTAMPTZ,
    date_to TIMESTAMPTZ,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ad_spend_run_attribution_project_run_line_source_unique UNIQUE (project_id, webinar_run_id, agency_line, source_system)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_run_attribution_project_webinar_run
    ON public.ad_spend_run_attribution (project_id, webinar_run_id);

COMMENT ON TABLE public.ad_spend_run_attribution IS
    'Attributed ad spend for Agency CPL/CPA; source_system distinguishes Meta vs future providers.';
COMMENT ON COLUMN public.ad_spend_run_attribution.integration_account_id IS
    'Optional link to a single Meta account; NULL when spend aggregates multiple linked accounts per agency line.';

ALTER TABLE public.ad_spend_run_attribution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to ad_spend_run_attribution"
    ON public.ad_spend_run_attribution;
DROP POLICY IF EXISTS "Users can view ad_spend_run_attribution for their workspace projects"
    ON public.ad_spend_run_attribution;

CREATE POLICY "Service role has full access to ad_spend_run_attribution"
    ON public.ad_spend_run_attribution
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view ad_spend_run_attribution for their workspace projects"
    ON public.ad_spend_run_attribution
    FOR SELECT
    USING (
        project_id IN (
            SELECT p.id
            FROM public.projects p
            WHERE p.workspace_id IN (
                SELECT wm.workspace_id
                FROM public.workspace_members wm
                WHERE wm.user_id = auth.uid()
            )
        )
    );

-- Recompute attributed spend for all webinar runs in a project (Meta Ads).
-- Currency: taken from the newest synced insight row (synced_at, then date_start) among rows in the window for that agency line.
CREATE OR REPLACE FUNCTION public.recompute_meta_spend_attribution(p_project_id UUID)
RETURNS TABLE (
    webinar_run_id UUID,
    agency_line TEXT,
    spend NUMERIC,
    currency TEXT,
    date_from TIMESTAMPTZ,
    date_to TIMESTAMPTZ,
    rows_attributed BIGINT
)
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
WITH deleted AS (
    DELETE FROM public.ad_spend_run_attribution AS a
    WHERE a.project_id = p_project_id
      AND a.source_system = 'meta_ads'
),

runs AS (
    SELECT
        wr.id AS webinar_run_id,
        COALESCE(wr.spend_date_from, wr.event_start_at) AS window_from_ts,
        COALESCE(
            wr.spend_date_to,
            LEAD(wr.event_start_at) OVER (
                PARTITION BY wr.project_id
                ORDER BY wr.event_start_at ASC
            ),
            NOW()
        ) AS window_to_ts
    FROM public.webinar_runs AS wr
    WHERE wr.project_id = p_project_id
),

aggregated AS (
    SELECT
        r.webinar_run_id,
        pma.agency_line,
        COALESCE(SUM(mi.spend), 0)::NUMERIC(12, 4) AS spend_total,
        COUNT(mi.id)::BIGINT AS insight_rows,
        r.window_from_ts,
        r.window_to_ts,
        COALESCE(
            (
                SELECT mi2.currency
                FROM public.meta_insights AS mi2
                INNER JOIN public.project_meta_ad_accounts AS pma2
                    ON pma2.integration_account_id = mi2.integration_account_id
                    AND pma2.project_id = p_project_id
                    AND pma2.agency_line = pma.agency_line
                WHERE mi2.date_start >= r.window_from_ts::date
                  AND mi2.date_start < r.window_to_ts::date
                ORDER BY mi2.synced_at DESC NULLS LAST, mi2.date_start DESC
                LIMIT 1
            ),
            'USD'
        ) AS currency_val
    FROM runs AS r
    INNER JOIN public.project_meta_ad_accounts AS pma ON pma.project_id = p_project_id
    LEFT JOIN public.meta_insights AS mi
        ON mi.integration_account_id = pma.integration_account_id
        AND mi.date_start >= r.window_from_ts::date
        AND mi.date_start < r.window_to_ts::date
    GROUP BY r.webinar_run_id, pma.agency_line, r.window_from_ts, r.window_to_ts
),

ins AS (
    INSERT INTO public.ad_spend_run_attribution (
        project_id,
        webinar_run_id,
        agency_line,
        integration_account_id,
        spend,
        currency,
        source_system,
        attribution_method,
        date_from,
        date_to,
        computed_at
    )
    SELECT
        p_project_id,
        agg.webinar_run_id,
        agg.agency_line,
        NULL::uuid,
        agg.spend_total,
        agg.currency_val,
        'meta_ads',
        'date_overlap',
        agg.window_from_ts,
        agg.window_to_ts,
        NOW()
    FROM aggregated AS agg
    ON CONFLICT ON CONSTRAINT ad_spend_run_attribution_project_run_line_source_unique
    DO UPDATE SET
        spend = EXCLUDED.spend,
        currency = EXCLUDED.currency,
        date_from = EXCLUDED.date_from,
        date_to = EXCLUDED.date_to,
        computed_at = EXCLUDED.computed_at,
        integration_account_id = EXCLUDED.integration_account_id
    RETURNING
        ad_spend_run_attribution.webinar_run_id,
        ad_spend_run_attribution.agency_line,
        ad_spend_run_attribution.spend,
        ad_spend_run_attribution.currency,
        ad_spend_run_attribution.date_from,
        ad_spend_run_attribution.date_to
)

SELECT
    ins.webinar_run_id,
    ins.agency_line,
    ins.spend,
    ins.currency,
    ins.date_from,
    ins.date_to,
    agg.insight_rows AS rows_attributed
FROM ins
INNER JOIN aggregated AS agg
    ON agg.webinar_run_id = ins.webinar_run_id
    AND agg.agency_line = ins.agency_line;
$$;

COMMENT ON FUNCTION public.recompute_meta_spend_attribution(UUID) IS
    'Rebuilds meta_ads rows in ad_spend_run_attribution for a project using date-overlap sums from meta_insights.';

GRANT EXECUTE ON FUNCTION public.recompute_meta_spend_attribution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_meta_spend_attribution(UUID) TO service_role;
