-- Migration 037: Deduplication index for pending tracker optin rows
--
-- When tracker.js fires an optin event before GHL's webhook has created
-- the ghl_contact row, the track API falls back to inserting a journey_event
-- with contact_id = NULL and stores the ghl_contact_id inside the payload JSON.
--
-- This partial unique index prevents duplicate rows for the same contact_id-in-
-- payload (e.g. the keepalive flush AND the localStorage replay both landing).
-- The WHERE clause limits the index to exactly those pending tracker rows so it
-- does not interfere with other null-contact events from other source systems.

CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_events_optin_tracker_pending
  ON public.journey_events ((payload->>'ghl_contact_id'), event_type, source_system)
  WHERE contact_id IS NULL
    AND event_type    = 'optin'
    AND source_system = 'tracker'
    AND (payload->>'ghl_contact_id') IS NOT NULL;
