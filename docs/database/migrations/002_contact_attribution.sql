-- First-touch / signup attribution on contacts (marketing source, UTM, landing context).
-- Apply after `contacts` exists. Regenerate src/database.types.ts after running in Supabase.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS referrer_url TEXT,
  ADD COLUMN IF NOT EXISTS landing_page_url TEXT,
  ADD COLUMN IF NOT EXISTS attribution_captured_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contacts.acquisition_source IS 'Human-readable source label (e.g. form name, campaign name, CRM source)';
COMMENT ON COLUMN public.contacts.utm_source IS 'UTM source parameter from first-touch capture';
COMMENT ON COLUMN public.contacts.utm_medium IS 'UTM medium parameter';
COMMENT ON COLUMN public.contacts.utm_campaign IS 'UTM campaign parameter';
COMMENT ON COLUMN public.contacts.utm_content IS 'UTM content parameter';
COMMENT ON COLUMN public.contacts.utm_term IS 'UTM term parameter';
COMMENT ON COLUMN public.contacts.referrer_url IS 'HTTP referrer when lead was captured (if available)';
COMMENT ON COLUMN public.contacts.landing_page_url IS 'First landing page URL for this contact';
COMMENT ON COLUMN public.contacts.attribution_captured_at IS 'When attribution fields were recorded (may differ from created_at)';

CREATE INDEX IF NOT EXISTS idx_contacts_workspace_utm_campaign
  ON public.contacts (workspace_id, utm_campaign)
  WHERE utm_campaign IS NOT NULL;
