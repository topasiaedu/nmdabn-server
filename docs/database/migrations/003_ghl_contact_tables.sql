-- ============================================================================
-- GoHighLevel — normalized contact mirror (SQL-first, no staging table)
-- ============================================================================
-- One row per GHL contact with scalar columns; arrays/objects become child rows.
-- raw_json stores the full GET /contacts/{id} response (vendor drift + ad-hoc use).
-- api_top_level_extras holds unknown top-level keys on the inner contact object
-- for convenient SQL access without jsonb path queries on raw_json.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Core contact (GET /contacts/{id} inner "contact" + envelope traceId)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_contacts (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  contact_name TEXT,
  first_name TEXT,
  last_name TEXT,
  first_name_raw TEXT,
  last_name_raw TEXT,
  company_name TEXT,
  source TEXT,
  type TEXT,
  assigned_to TEXT,
  dnd BOOLEAN,
  dnd_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  address1 TEXT,
  country TEXT,
  website TEXT,
  timezone TEXT,
  date_added TIMESTAMPTZ,
  date_updated TIMESTAMPTZ,
  date_of_birth DATE,
  business_id TEXT,
  profile_photo TEXT,
  trace_id TEXT,
  api_top_level_extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If ghl_contacts already existed from an older schema, CREATE TABLE IF NOT EXISTS is skipped.
-- Add every column we need before indexes (includes location_id + date_updated, etc.).
ALTER TABLE public.ghl_contacts
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS first_name_raw TEXT,
  ADD COLUMN IF NOT EXISTS last_name_raw TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS dnd BOOLEAN,
  ADD COLUMN IF NOT EXISTS dnd_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS address1 TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS date_added TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_updated TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS business_id TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS api_top_level_extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_location_id ON public.ghl_contacts (location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_email ON public.ghl_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_date_updated ON public.ghl_contacts (date_updated DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_source ON public.ghl_contacts (location_id, source) WHERE source IS NOT NULL;

COMMENT ON TABLE public.ghl_contacts IS 'GHL contact scalars; child tables for tags, custom fields, attributions, etc.';
COMMENT ON COLUMN public.ghl_contacts.api_top_level_extras IS 'Top-level keys on the contact object not yet modeled as columns (vendor adds fields before we migrate).';
COMMENT ON COLUMN public.ghl_contacts.raw_json IS 'Full GET /contacts/{id} JSON body (e.g. contact + traceId). Complete vendor snapshot; use columns for reporting and joins.';

-- ---------------------------------------------------------------------------
-- Tags (string array on contact)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_contact_tags (
  contact_id TEXT NOT NULL REFERENCES public.ghl_contacts (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_name)
);

ALTER TABLE public.ghl_contact_tags
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_contact_tags_location ON public.ghl_contact_tags (location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contact_tags_tag ON public.ghl_contact_tags (tag_name);

-- ---------------------------------------------------------------------------
-- Custom field values (array of { id, value } / variants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_contact_custom_field_values (
  contact_id TEXT NOT NULL REFERENCES public.ghl_contacts (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  field_value TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, field_id)
);

ALTER TABLE public.ghl_contact_custom_field_values
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_cf_location ON public.ghl_contact_custom_field_values (location_id);

-- ---------------------------------------------------------------------------
-- Attribution touch rows (array of objects on contact)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_contact_attributions (
  id BIGSERIAL PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES public.ghl_contacts (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  page_url TEXT,
  referrer TEXT,
  utm_session_source TEXT,
  medium TEXT,
  medium_id TEXT,
  is_first BOOLEAN,
  is_last BOOLEAN,
  ip TEXT,
  user_agent TEXT,
  url TEXT,
  utm_campaign TEXT,
  utm_medium TEXT,
  utm_source TEXT,
  utm_term TEXT,
  utm_content TEXT,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  attribution_extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, position)
);

ALTER TABLE public.ghl_contact_attributions
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS utm_session_source TEXT,
  ADD COLUMN IF NOT EXISTS medium TEXT,
  ADD COLUMN IF NOT EXISTS medium_id TEXT,
  ADD COLUMN IF NOT EXISTS is_first BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_last BOOLEAN,
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS fbc TEXT,
  ADD COLUMN IF NOT EXISTS fbp TEXT,
  ADD COLUMN IF NOT EXISTS attribution_extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_attr_contact ON public.ghl_contact_attributions (contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_attr_location_campaign ON public.ghl_contact_attributions (location_id, utm_campaign)
  WHERE utm_campaign IS NOT NULL;

COMMENT ON COLUMN public.ghl_contact_attributions.attribution_extras IS 'Per-touch keys not yet promoted to columns.';

-- ---------------------------------------------------------------------------
-- additionalEmails (string array)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_contact_additional_emails (
  contact_id TEXT NOT NULL REFERENCES public.ghl_contacts (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  email TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, email)
);

ALTER TABLE public.ghl_contact_additional_emails
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_add_email_location ON public.ghl_contact_additional_emails (location_id);

-- ---------------------------------------------------------------------------
-- followers (user id array)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_contact_followers (
  contact_id TEXT NOT NULL REFERENCES public.ghl_contacts (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  follower_user_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, follower_user_id)
);

ALTER TABLE public.ghl_contact_followers
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_followers_location ON public.ghl_contact_followers (location_id);

-- ---------------------------------------------------------------------------
-- Optional: resume cursor for contact list pagination (used by sync script)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_sync_cursors (
  location_id TEXT PRIMARY KEY,
  contacts_start_after_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ghl_sync_cursors IS 'Last successfully synced contact id for list pagination; optional --resume';
