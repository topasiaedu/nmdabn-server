-- Webinar runs (date-window dimension) + optional snapshot on GHL contact mirror.
-- Apply after 003. Regenerate src/database.types.ts after applying.

CREATE TABLE IF NOT EXISTS public.webinar_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL,
  display_label TEXT NOT NULL,
  event_start_at TIMESTAMPTZ NOT NULL,
  event_end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  format TEXT NOT NULL DEFAULT 'single_day'
    CHECK (format IN ('single_day', 'multi_day')),
  sort_order INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webinar_runs_end_after_start CHECK (event_end_at >= event_start_at)
);

CREATE INDEX IF NOT EXISTS idx_webinar_runs_location_start
  ON public.webinar_runs (location_id, event_start_at ASC);

CREATE INDEX IF NOT EXISTS idx_webinar_runs_location_active
  ON public.webinar_runs (location_id)
  WHERE is_active;

COMMENT ON TABLE public.webinar_runs IS
  'Scheduled webinar instances for reporting; leads snapshot webinar_run_id at attribution time.';

ALTER TABLE public.ghl_contacts
  ADD COLUMN IF NOT EXISTS webinar_run_id UUID REFERENCES public.webinar_runs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_webinar_run
  ON public.ghl_contacts (webinar_run_id)
  WHERE webinar_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_location_date_added
  ON public.ghl_contacts (location_id, date_added DESC NULLS LAST);

COMMENT ON COLUMN public.ghl_contacts.webinar_run_id IS
  'Reporting snapshot: next upcoming webinar run at opt-in (date_added), per business rule.';
