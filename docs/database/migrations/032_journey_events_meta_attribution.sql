-- Migration 032: Add resolved Meta entity ID columns to journey_events.
--
-- These columns let us JOIN leads directly to Meta adsets/ads without doing
-- runtime fuzzy-text matching on every dashboard query.
--
-- Two resolution paths (recorded in meta_attribution_method):
--   "ad_id"     — utm_source is a numeric Meta ad ID; meta_ads lookup gives
--                 the adset and campaign IDs. Used from the point the marketer
--                 sets utm_source = ads.id (forward-looking).
--   "name_match"— utm_content + utm_campaign are name-matched against
--                 meta_adsets.name using the marketer's naming convention
--                 (backward-compatible backfill for all historical rows).
--
-- Safe to run repeatedly.

ALTER TABLE public.journey_events
    ADD COLUMN IF NOT EXISTS meta_adset_id     TEXT,
    ADD COLUMN IF NOT EXISTS meta_campaign_id  TEXT,
    ADD COLUMN IF NOT EXISTS meta_ad_id        TEXT,
    ADD COLUMN IF NOT EXISTS meta_attribution_method TEXT
        CHECK (meta_attribution_method IN ('ad_id', 'name_match'));

COMMENT ON COLUMN public.journey_events.meta_adset_id IS
    'Resolved Meta ad-set ID; populated by name-match (historical) or ad-ID lookup (forward-looking).';

COMMENT ON COLUMN public.journey_events.meta_campaign_id IS
    'Resolved Meta campaign ID; derived from meta_adset_id lookup or utm_source → meta_ads.';

COMMENT ON COLUMN public.journey_events.meta_ad_id IS
    'Resolved Meta ad ID; set when utm_source contains a valid Meta ad numeric ID.';

COMMENT ON COLUMN public.journey_events.meta_attribution_method IS
    '"ad_id" when utm_source is a Meta ad numeric ID, "name_match" when resolved by UTM text matching.';

-- Index for Ads Manager CPL query (join on adset or ad).
CREATE INDEX IF NOT EXISTS idx_journey_events_meta_adset_id
    ON public.journey_events (meta_adset_id)
    WHERE meta_adset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journey_events_meta_ad_id
    ON public.journey_events (meta_ad_id)
    WHERE meta_ad_id IS NOT NULL;
