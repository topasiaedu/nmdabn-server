-- Meta Ads mirror tables + project ↔ ad account mapping + webinar run spend window overrides.
-- Apply after 024. Enables OAuth-stored tokens and synced campaigns/insights for Agency CPL/CPA.

-- ---------------------------------------------------------------------------
-- integration_provider: Meta Marketing API (OAuth user token per ad account).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'integration_provider'
          AND e.enumlabel = 'meta_ads'
    ) THEN
        ALTER TYPE public.integration_provider ADD VALUE 'meta_ads';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Dedupe legacy rows before partial unique index (historic Zoom/GHL duplicates).
-- Keeps oldest row per (workspace_id, provider, account_id); repoints FKs then deletes extras.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    grp RECORD;
    survivor UUID;
    dup_id UUID;
    i INTEGER;
BEGIN
    FOR grp IN
        SELECT
            workspace_id,
            provider,
            account_id,
            array_agg(id ORDER BY created_at ASC NULLS FIRST, id ASC) AS ids
        FROM public.integration_accounts
        WHERE account_id IS NOT NULL
          AND btrim(account_id) <> ''
        GROUP BY workspace_id, provider, account_id
        HAVING COUNT(*) > 1
    LOOP
        survivor := grp.ids[1];
        IF array_upper(grp.ids, 1) >= 2 THEN
            FOR i IN 2 .. array_upper(grp.ids, 1)
            LOOP
                dup_id := grp.ids[i];

                IF to_regclass('public.integration_jobs') IS NOT NULL THEN
                    EXECUTE
                        'UPDATE public.integration_jobs SET integration_account_id = $1 WHERE integration_account_id = $2'
                        USING survivor, dup_id;
                END IF;

                IF to_regclass('public.meta_campaigns') IS NOT NULL THEN
                    EXECUTE
                        'UPDATE public.meta_campaigns SET integration_account_id = $1 WHERE integration_account_id = $2'
                        USING survivor, dup_id;
                END IF;

                IF to_regclass('public.meta_insights') IS NOT NULL THEN
                    EXECUTE
                        'UPDATE public.meta_insights SET integration_account_id = $1 WHERE integration_account_id = $2'
                        USING survivor, dup_id;
                END IF;

                IF to_regclass('public.project_meta_ad_accounts') IS NOT NULL THEN
                    EXECUTE
                        'UPDATE public.project_meta_ad_accounts SET integration_account_id = $1 WHERE integration_account_id = $2'
                        USING survivor, dup_id;
                    EXECUTE $meta_proj_dedupe$
                        DELETE FROM public.project_meta_ad_accounts AS pm
                        WHERE pm.id IN (
                            SELECT pm2.id
                            FROM public.project_meta_ad_accounts AS pm2
                            INNER JOIN (
                                SELECT
                                    project_id,
                                    agency_line,
                                    integration_account_id,
                                    MIN(id) AS keep_id
                                FROM public.project_meta_ad_accounts
                                GROUP BY project_id, agency_line, integration_account_id
                                HAVING COUNT(*) > 1
                            ) AS d
                                ON pm2.project_id = d.project_id
                                AND pm2.agency_line = d.agency_line
                                AND pm2.integration_account_id = d.integration_account_id
                                AND pm2.id <> d.keep_id
                        )
                        $meta_proj_dedupe$;
                END IF;

                DELETE FROM public.integration_accounts WHERE id = dup_id;
            END LOOP;
        END IF;
    END LOOP;
END
$$;

-- One row per workspace+provider+ad account id for OAuth upserts (Meta + others with account_id set).
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_accounts_workspace_provider_account_unique
    ON public.integration_accounts (workspace_id, provider, account_id)
    WHERE account_id IS NOT NULL AND btrim(account_id) <> '';

-- ---------------------------------------------------------------------------
-- webinar_runs — optional operator overrides for Meta spend attribution windows.
-- Placed early so later migrations (026) can rely on these columns if 025 stops mid-file.
-- ---------------------------------------------------------------------------
ALTER TABLE public.webinar_runs
    ADD COLUMN IF NOT EXISTS spend_date_from TIMESTAMPTZ;

ALTER TABLE public.webinar_runs
    ADD COLUMN IF NOT EXISTS spend_date_to TIMESTAMPTZ;

COMMENT ON COLUMN public.webinar_runs.spend_date_from IS
    'Nullable override for Meta Ads attribution window start. When NULL, window start defaults to event_start_at.';
COMMENT ON COLUMN public.webinar_runs.spend_date_to IS
    'Nullable override for Meta Ads attribution window end. When NULL, window end defaults to the next run''s event_start_at (or NOW() for the most recent run).';

-- ---------------------------------------------------------------------------
-- meta_campaigns — mirror of Graph campaign objects per linked integration account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_campaigns (
    id TEXT NOT NULL,
    integration_account_id UUID NOT NULL REFERENCES public.integration_accounts (id) ON DELETE CASCADE,
    name TEXT,
    status TEXT,
    objective TEXT,
    raw_json JSONB,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT meta_campaigns_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_integration_account_id
    ON public.meta_campaigns (integration_account_id);

COMMENT ON TABLE public.meta_campaigns IS
    'Meta Ads campaigns mirrored from Marketing API; id is Meta campaign_id string.';

ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to meta_campaigns"
    ON public.meta_campaigns;
DROP POLICY IF EXISTS "Users can view meta_campaigns for their workspaces"
    ON public.meta_campaigns;

CREATE POLICY "Service role has full access to meta_campaigns"
    ON public.meta_campaigns
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view meta_campaigns for their workspaces"
    ON public.meta_campaigns
    FOR SELECT
    USING (
        integration_account_id IN (
            SELECT ia.id
            FROM public.integration_accounts ia
            WHERE ia.workspace_id IN (
                SELECT wm.workspace_id
                FROM public.workspace_members wm
                WHERE wm.user_id = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- meta_insights — daily campaign-level insights (spend attribution source).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_account_id UUID NOT NULL REFERENCES public.integration_accounts (id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    adset_id TEXT,
    date_start DATE NOT NULL,
    date_stop DATE NOT NULL,
    spend NUMERIC(12, 4),
    impressions BIGINT,
    clicks BIGINT,
    reach BIGINT,
    currency TEXT,
    raw_json JSONB,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT meta_insights_account_campaign_date_unique UNIQUE (integration_account_id, campaign_id, date_start)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_integration_account_date_start
    ON public.meta_insights (integration_account_id, date_start);

COMMENT ON TABLE public.meta_insights IS
    'Daily Meta Ads insights per campaign; unique on (integration_account_id, campaign_id, date_start) for idempotent sync.';

ALTER TABLE public.meta_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to meta_insights"
    ON public.meta_insights;
DROP POLICY IF EXISTS "Users can view meta_insights for their workspaces"
    ON public.meta_insights;

CREATE POLICY "Service role has full access to meta_insights"
    ON public.meta_insights
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view meta_insights for their workspaces"
    ON public.meta_insights
    FOR SELECT
    USING (
        integration_account_id IN (
            SELECT ia.id
            FROM public.integration_accounts ia
            WHERE ia.workspace_id IN (
                SELECT wm.workspace_id
                FROM public.workspace_members wm
                WHERE wm.user_id = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- project_meta_ad_accounts — which Meta ad account rolls up to which agency line.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_meta_ad_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
    integration_account_id UUID NOT NULL REFERENCES public.integration_accounts (id) ON DELETE CASCADE,
    agency_line TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT project_meta_ad_accounts_project_line_account_unique UNIQUE (project_id, agency_line, integration_account_id)
);

CREATE INDEX IF NOT EXISTS idx_project_meta_ad_accounts_project_id
    ON public.project_meta_ad_accounts (project_id);

COMMENT ON TABLE public.project_meta_ad_accounts IS
    'Maps projects.traffic_agency_line_tags keys (e.g. OM, NM) to a connected Meta integration_accounts row.';
COMMENT ON COLUMN public.project_meta_ad_accounts.agency_line IS
    'Must match a key in projects.traffic_agency_line_tags JSONB; enforced in application layer.';

ALTER TABLE public.project_meta_ad_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to project_meta_ad_accounts"
    ON public.project_meta_ad_accounts;
DROP POLICY IF EXISTS "Users can view project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts;
DROP POLICY IF EXISTS "Users can insert project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts;
DROP POLICY IF EXISTS "Users can update project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts;
DROP POLICY IF EXISTS "Users can delete project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts;

CREATE POLICY "Service role has full access to project_meta_ad_accounts"
    ON public.project_meta_ad_accounts
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts
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

CREATE POLICY "Users can insert project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts
    FOR INSERT
    WITH CHECK (
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

CREATE POLICY "Users can update project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts
    FOR UPDATE
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

CREATE POLICY "Users can delete project_meta_ad_accounts for their workspace projects"
    ON public.project_meta_ad_accounts
    FOR DELETE
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
