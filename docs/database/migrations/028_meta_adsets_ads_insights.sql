-- Migration 028: Meta Ads ad sets, ads, adset-level insights, and ad-level insights.
-- Apply after 027. Enables the full 3-level Ads Manager hierarchy
-- (Campaigns → Ad Sets → Ads) with daily insights at each level.

-- ---------------------------------------------------------------------------
-- meta_adsets — mirror of Graph ad set objects per linked integration account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_adsets (
    id TEXT NOT NULL,
    integration_account_id UUID NOT NULL REFERENCES public.integration_accounts (id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    name TEXT,
    status TEXT,
    optimization_goal TEXT,
    billing_event TEXT,
    daily_budget NUMERIC(18, 2),
    lifetime_budget NUMERIC(18, 2),
    raw_json JSONB,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT meta_adsets_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_meta_adsets_integration_account_id
    ON public.meta_adsets (integration_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_adsets_campaign_id
    ON public.meta_adsets (campaign_id);

COMMENT ON TABLE public.meta_adsets IS
    'Meta Ads ad sets mirrored from Marketing API; id is Meta adset_id string.';

ALTER TABLE public.meta_adsets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to meta_adsets"
    ON public.meta_adsets;
DROP POLICY IF EXISTS "Users can view meta_adsets for their workspaces"
    ON public.meta_adsets;

CREATE POLICY "Service role has full access to meta_adsets"
    ON public.meta_adsets
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view meta_adsets for their workspaces"
    ON public.meta_adsets
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
-- meta_ads — mirror of Graph individual ad objects per linked integration account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_ads (
    id TEXT NOT NULL,
    integration_account_id UUID NOT NULL REFERENCES public.integration_accounts (id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    adset_id TEXT NOT NULL,
    name TEXT,
    status TEXT,
    raw_json JSONB,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT meta_ads_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_integration_account_id
    ON public.meta_ads (integration_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_ads_adset_id
    ON public.meta_ads (adset_id);

COMMENT ON TABLE public.meta_ads IS
    'Meta Ads individual ads mirrored from Marketing API; id is Meta ad_id string.';

ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to meta_ads"
    ON public.meta_ads;
DROP POLICY IF EXISTS "Users can view meta_ads for their workspaces"
    ON public.meta_ads;

CREATE POLICY "Service role has full access to meta_ads"
    ON public.meta_ads
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view meta_ads for their workspaces"
    ON public.meta_ads
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
-- meta_adset_insights — daily ad-set-level insights (unique per adset per day).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_adset_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_account_id UUID NOT NULL REFERENCES public.integration_accounts (id) ON DELETE CASCADE,
    adset_id TEXT NOT NULL,
    adset_name TEXT,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    date_start DATE NOT NULL,
    date_stop DATE NOT NULL,
    spend NUMERIC(12, 4),
    impressions BIGINT,
    clicks BIGINT,
    reach BIGINT,
    currency TEXT,
    raw_json JSONB,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT meta_adset_insights_account_adset_date_unique
        UNIQUE (integration_account_id, adset_id, date_start)
);

CREATE INDEX IF NOT EXISTS idx_meta_adset_insights_account_date
    ON public.meta_adset_insights (integration_account_id, date_start);

CREATE INDEX IF NOT EXISTS idx_meta_adset_insights_campaign_id
    ON public.meta_adset_insights (campaign_id);

COMMENT ON TABLE public.meta_adset_insights IS
    'Daily Meta Ads insights at ad-set level; unique on (integration_account_id, adset_id, date_start).';

ALTER TABLE public.meta_adset_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to meta_adset_insights"
    ON public.meta_adset_insights;
DROP POLICY IF EXISTS "Users can view meta_adset_insights for their workspaces"
    ON public.meta_adset_insights;

CREATE POLICY "Service role has full access to meta_adset_insights"
    ON public.meta_adset_insights
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view meta_adset_insights for their workspaces"
    ON public.meta_adset_insights
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
-- meta_ad_insights — daily individual-ad-level insights (unique per ad per day).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_ad_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_account_id UUID NOT NULL REFERENCES public.integration_accounts (id) ON DELETE CASCADE,
    ad_id TEXT NOT NULL,
    ad_name TEXT,
    adset_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    date_start DATE NOT NULL,
    date_stop DATE NOT NULL,
    spend NUMERIC(12, 4),
    impressions BIGINT,
    clicks BIGINT,
    reach BIGINT,
    currency TEXT,
    raw_json JSONB,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT meta_ad_insights_account_ad_date_unique
        UNIQUE (integration_account_id, ad_id, date_start)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_insights_account_date
    ON public.meta_ad_insights (integration_account_id, date_start);

CREATE INDEX IF NOT EXISTS idx_meta_ad_insights_adset_id
    ON public.meta_ad_insights (adset_id);

COMMENT ON TABLE public.meta_ad_insights IS
    'Daily Meta Ads insights at ad level; unique on (integration_account_id, ad_id, date_start).';

ALTER TABLE public.meta_ad_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to meta_ad_insights"
    ON public.meta_ad_insights;
DROP POLICY IF EXISTS "Users can view meta_ad_insights for their workspaces"
    ON public.meta_ad_insights;

CREATE POLICY "Service role has full access to meta_ad_insights"
    ON public.meta_ad_insights
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view meta_ad_insights for their workspaces"
    ON public.meta_ad_insights
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
