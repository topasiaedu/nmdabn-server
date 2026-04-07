-- ============================================================================
-- GHL: full API payload on ghl_contacts (idempotent if 003 already added it)
-- ============================================================================
-- Run after 003 if your database applied an older 003 without raw_json.
-- ============================================================================

ALTER TABLE public.ghl_contacts
  ADD COLUMN IF NOT EXISTS raw_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ghl_contacts.raw_json IS 'Full GET /contacts/{id} JSON body (e.g. contact + traceId). Complete vendor snapshot; use columns for reporting and joins.';
