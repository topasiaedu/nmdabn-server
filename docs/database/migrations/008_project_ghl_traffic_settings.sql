-- Per-project GHL location and Traffic dashboard field mapping.
-- Each GHL sub-account has its own custom field ids; store them on the project row.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ghl_location_id TEXT,
  ADD COLUMN IF NOT EXISTS traffic_occupation_field_id TEXT,
  ADD COLUMN IF NOT EXISTS traffic_agency_line_tags JSONB;

COMMENT ON COLUMN public.projects.ghl_location_id IS
  'GoHighLevel location (sub-account) id; scopes ghl_contacts / webinar_runs for this project.';

COMMENT ON COLUMN public.projects.traffic_occupation_field_id IS
  'GHL custom field id for the occupation dropdown on forms (unique per sub-account).';

COMMENT ON COLUMN public.projects.traffic_agency_line_tags IS
  'Optional {"OM":["lead_om"],"NM":["lead_nm"]} overriding env TRAFFIC_AGENCY_LINE_TAGS_JSON when not null.';

CREATE INDEX IF NOT EXISTS idx_projects_ghl_location_id
  ON public.projects (ghl_location_id)
  WHERE ghl_location_id IS NOT NULL;
