-- Migration 035: Add budget and CBO/ABO flag columns to meta_campaigns.
-- Apply after 034. Enables displaying campaign budget and budget strategy
-- (Campaign Budget Optimisation vs Ad Set Budget Optimisation) in the
-- Ads Manager dashboard.
--
-- Meta API fields:
--   daily_budget          – set when campaign uses a recurring daily spend cap
--   lifetime_budget       – set when campaign has a fixed total spend cap
--   budget_rebalance_flag – true when Meta is free to rebalance spend across
--                           ad sets (CBO). We persist this as is_cbo.

ALTER TABLE public.meta_campaigns
    ADD COLUMN IF NOT EXISTS daily_budget    NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS lifetime_budget NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS is_cbo         BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.meta_campaigns.daily_budget IS
    'Daily budget in account currency; mutually exclusive with lifetime_budget.';
COMMENT ON COLUMN public.meta_campaigns.lifetime_budget IS
    'Lifetime (total) budget in account currency; mutually exclusive with daily_budget.';
COMMENT ON COLUMN public.meta_campaigns.is_cbo IS
    'True when budget_rebalance_flag=true (Campaign Budget Optimisation). '
    'False means ABO (Ad Set Budget Optimisation).';
