-- Catalog of GHL custom field definitions per sub-account location.
-- Lets app resolve fields by stable key/name and avoid hardcoding ids per feature.

CREATE TABLE IF NOT EXISTS public.ghl_custom_fields (
  location_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  field_key TEXT,
  field_name TEXT,
  field_type TEXT,
  data_type TEXT,
  picklist_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (location_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_ghl_custom_fields_location_key
  ON public.ghl_custom_fields (location_id, field_key)
  WHERE field_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ghl_custom_fields_location_name
  ON public.ghl_custom_fields (location_id, field_name)
  WHERE field_name IS NOT NULL;

COMMENT ON TABLE public.ghl_custom_fields IS
  'Custom field definitions from GHL /locations/{locationId}/customFields for each sub-account.';

COMMENT ON COLUMN public.ghl_custom_fields.field_key IS
  'Stable API key / slug when present; preferred for cross-env mapping.';

COMMENT ON COLUMN public.ghl_custom_fields.field_name IS
  'Display label shown in GHL UI (can be renamed).';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS traffic_occupation_field_key TEXT;

COMMENT ON COLUMN public.projects.traffic_occupation_field_key IS
  'Preferred project-level mapping for occupation field using GHL field key/name; resolved via ghl_custom_fields.';
