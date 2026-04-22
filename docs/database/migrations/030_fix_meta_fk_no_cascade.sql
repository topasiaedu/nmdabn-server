-- Migration 030: Remove ON DELETE CASCADE from meta data tables.
--
-- Previously all meta_* tables cascaded deletes from integration_accounts,
-- meaning that removing an integration credential wiped ALL synced ad data.
-- This changes the FK to RESTRICT (prevent accidental deletion) so synced
-- data survives credential rotation / project unlinking.
--
-- Apply in Supabase SQL Editor. Safe to run on an empty or populated database.

-- meta_campaigns
ALTER TABLE public.meta_campaigns
    DROP CONSTRAINT IF EXISTS meta_campaigns_integration_account_id_fkey;
ALTER TABLE public.meta_campaigns
    ADD CONSTRAINT meta_campaigns_integration_account_id_fkey
        FOREIGN KEY (integration_account_id)
        REFERENCES public.integration_accounts (id)
        ON DELETE RESTRICT;

-- meta_adsets
ALTER TABLE public.meta_adsets
    DROP CONSTRAINT IF EXISTS meta_adsets_integration_account_id_fkey;
ALTER TABLE public.meta_adsets
    ADD CONSTRAINT meta_adsets_integration_account_id_fkey
        FOREIGN KEY (integration_account_id)
        REFERENCES public.integration_accounts (id)
        ON DELETE RESTRICT;

-- meta_ads
ALTER TABLE public.meta_ads
    DROP CONSTRAINT IF EXISTS meta_ads_integration_account_id_fkey;
ALTER TABLE public.meta_ads
    ADD CONSTRAINT meta_ads_integration_account_id_fkey
        FOREIGN KEY (integration_account_id)
        REFERENCES public.integration_accounts (id)
        ON DELETE RESTRICT;

-- meta_insights
ALTER TABLE public.meta_insights
    DROP CONSTRAINT IF EXISTS meta_insights_integration_account_id_fkey;
ALTER TABLE public.meta_insights
    ADD CONSTRAINT meta_insights_integration_account_id_fkey
        FOREIGN KEY (integration_account_id)
        REFERENCES public.integration_accounts (id)
        ON DELETE RESTRICT;

-- meta_adset_insights
ALTER TABLE public.meta_adset_insights
    DROP CONSTRAINT IF EXISTS meta_adset_insights_integration_account_id_fkey;
ALTER TABLE public.meta_adset_insights
    ADD CONSTRAINT meta_adset_insights_integration_account_id_fkey
        FOREIGN KEY (integration_account_id)
        REFERENCES public.integration_accounts (id)
        ON DELETE RESTRICT;

-- meta_ad_insights
ALTER TABLE public.meta_ad_insights
    DROP CONSTRAINT IF EXISTS meta_ad_insights_integration_account_id_fkey;
ALTER TABLE public.meta_ad_insights
    ADD CONSTRAINT meta_ad_insights_integration_account_id_fkey
        FOREIGN KEY (integration_account_id)
        REFERENCES public.integration_accounts (id)
        ON DELETE RESTRICT;
