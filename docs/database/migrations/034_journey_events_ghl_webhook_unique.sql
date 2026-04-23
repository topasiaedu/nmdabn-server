-- Migration 034: Allow source_system ghl_webhook + partial unique index for optin upserts.
--
-- The original journey_events check (011) listed ghl, zoom, web, manual. Webhook-originated
-- optin rows use ghl_webhook so they are distinct from other GHL-sourced events.
-- Enables ON CONFLICT (contact_id, event_type, source_system) for those rows.

ALTER TABLE public.journey_events
    DROP CONSTRAINT IF EXISTS journey_events_source_system_check;

ALTER TABLE public.journey_events
    ADD CONSTRAINT journey_events_source_system_check
    CHECK (source_system IN ('ghl', 'ghl_webhook', 'zoom', 'web', 'manual'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_events_contact_optin_ghl
    ON public.journey_events (contact_id, event_type, source_system)
    WHERE contact_id IS NOT NULL
      AND event_type = 'optin'
      AND source_system = 'ghl_webhook';
