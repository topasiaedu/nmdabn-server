-- Migration 031: Add pixel event columns to all three insight tables.
--
-- Adds purchases, purchase_value, and landing_page_views extracted from
-- Meta's `actions` and `action_values` arrays. Safe to run repeatedly.

-- ── meta_insights (campaign-level) ──────────────────────────────────────────

ALTER TABLE public.meta_insights
    ADD COLUMN IF NOT EXISTS purchases          BIGINT,
    ADD COLUMN IF NOT EXISTS purchase_value     NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS landing_page_views BIGINT;

COMMENT ON COLUMN public.meta_insights.purchases          IS 'Total purchase conversion events attributed to this campaign day-row.';
COMMENT ON COLUMN public.meta_insights.purchase_value     IS 'Total purchase revenue attributed (from Meta action_values).';
COMMENT ON COLUMN public.meta_insights.landing_page_views IS 'People who clicked the ad and loaded the landing page.';

-- ── meta_adset_insights ──────────────────────────────────────────────────────

ALTER TABLE public.meta_adset_insights
    ADD COLUMN IF NOT EXISTS purchases          BIGINT,
    ADD COLUMN IF NOT EXISTS purchase_value     NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS landing_page_views BIGINT;

COMMENT ON COLUMN public.meta_adset_insights.purchases          IS 'Total purchase conversion events for this ad-set day-row.';
COMMENT ON COLUMN public.meta_adset_insights.purchase_value     IS 'Total purchase revenue attributed (from Meta action_values).';
COMMENT ON COLUMN public.meta_adset_insights.landing_page_views IS 'People who clicked and loaded the landing page.';

-- ── meta_ad_insights ─────────────────────────────────────────────────────────

ALTER TABLE public.meta_ad_insights
    ADD COLUMN IF NOT EXISTS purchases          BIGINT,
    ADD COLUMN IF NOT EXISTS purchase_value     NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS landing_page_views BIGINT;

COMMENT ON COLUMN public.meta_ad_insights.purchases          IS 'Total purchase conversion events for this ad day-row.';
COMMENT ON COLUMN public.meta_ad_insights.purchase_value     IS 'Total purchase revenue attributed (from Meta action_values).';
COMMENT ON COLUMN public.meta_ad_insights.landing_page_views IS 'People who clicked and loaded the landing page.';
