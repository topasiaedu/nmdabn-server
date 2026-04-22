-- Migration 029: Add leads column to Meta Ads insight tables.
-- Apply after 028.
--
-- The `leads` column stores the total number of lead conversion events for
-- that day, extracted from the Meta Graph API `actions` array during sync.
-- Meta action types considered as leads (in priority order):
--   1. omni_lead           — Meta's unified cross-channel lead count (preferred)
--   2. lead                — Native lead form + pixel lead total
--   3. offsite_conversion.fb_pixel_lead — pixel-only fallback

ALTER TABLE public.meta_insights
    ADD COLUMN IF NOT EXISTS leads BIGINT;

COMMENT ON COLUMN public.meta_insights.leads IS
    'Total lead conversion events for the day, derived from Meta actions array.';

ALTER TABLE public.meta_adset_insights
    ADD COLUMN IF NOT EXISTS leads BIGINT;

COMMENT ON COLUMN public.meta_adset_insights.leads IS
    'Total lead conversion events for the day, derived from Meta actions array.';

ALTER TABLE public.meta_ad_insights
    ADD COLUMN IF NOT EXISTS leads BIGINT;

COMMENT ON COLUMN public.meta_ad_insights.leads IS
    'Total lead conversion events for the day, derived from Meta actions array.';
