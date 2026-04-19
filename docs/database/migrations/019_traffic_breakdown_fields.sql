-- Add configurable breakdown fields JSONB column to projects.
-- These replace the hardcoded traffic_occupation_field_id / traffic_occupation_field_key for new RPCs.
-- Old columns are kept for backward compatibility with legacy RPCs.
--
-- Example value: [{"field_key":"contact.occupation","label":"Lead Occupation"},{"field_key":"contact.annual_income","label":"Annual Income"}]

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS traffic_breakdown_fields JSONB;

COMMENT ON COLUMN public.projects.traffic_breakdown_fields IS
  'Ordered list of GHL custom field keys to show as breakdown sections in dashboards. Each entry: {field_key: string, label: string}.';
