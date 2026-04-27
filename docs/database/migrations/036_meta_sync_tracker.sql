-- Migration 036: Meta sync tracking + tracker source system support.
--
-- Part A: Adds last_synced_at to project_meta_ad_accounts so the Ads Manager
-- dashboard can detect stale data and trigger an incremental sync on load
-- without fetching the full 90-day window every time.
--
-- Part B: Extends journey_events.source_system to allow 'tracker' (first-party
-- tracker.js optin events), and adds a partial unique index so repeat optin
-- submissions from the same GHL contact are idempotent.

-- ---------------------------------------------------------------------------
-- A. project_meta_ad_accounts — last sync timestamp
-- ---------------------------------------------------------------------------

ALTER TABLE public.project_meta_ad_accounts
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.project_meta_ad_accounts.last_synced_at IS
    'Timestamp of the most recent successful Meta Ads sync for this account mapping.
     Null when no sync has run yet. Updated by syncMetaAdsForProject after each
     successful per-account sync. Used by the dashboard to detect stale data and
     trigger an incremental on-load sync.';

-- ---------------------------------------------------------------------------
-- B. journey_events — add ''tracker'' as a valid source_system value
-- ---------------------------------------------------------------------------

ALTER TABLE public.journey_events
    DROP CONSTRAINT IF EXISTS journey_events_source_system_check;

ALTER TABLE public.journey_events
    ADD CONSTRAINT journey_events_source_system_check
    CHECK (source_system IN (
        'ghl',
        'ghl_webhook',
        'zoom',
        'web',
        'manual',
        'tracker'
    ));

COMMENT ON CONSTRAINT journey_events_source_system_check ON public.journey_events IS
    'Valid source systems: ghl (bulk sync), ghl_webhook (ContactCreate webhook),
     zoom (attendance sync), web (manual CSV import), manual (manual entry),
     tracker (first-party tracker.js optin via POST /api/track).';

-- Partial unique index: one tracker optin per contact, deduplicates replayed
-- tracker.js optin batches (keepalive retry + localStorage replay can both fire).
-- Null contact_id rows are excluded so anonymous optins can still accumulate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_events_contact_optin_tracker
    ON public.journey_events (contact_id, event_type, source_system)
    WHERE contact_id IS NOT NULL
      AND event_type = 'optin'
      AND source_system = 'tracker';
