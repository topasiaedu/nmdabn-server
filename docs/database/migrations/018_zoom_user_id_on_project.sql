-- Migration 018: add zoom_user_id to projects
--
-- zoom_user_id stores the email address (or Zoom user ID) of the specific
-- user whose webinars / meetings belong to this project.
--
-- For sub-accounts within the same Zoom account (e.g. askcae@topasiaedu.com,
-- hello@topasiaedu.com) the S2S credentials can be identical across projects —
-- only zoom_user_id differs.  For fully external accounts (e.g. a client's own
-- Zoom) all four zoom_* columns will be unique to that project.
--
-- Run against the target Supabase project via:
--   psql $DATABASE_URL -f docs/database/migrations/018_zoom_user_id_on_project.sql

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS zoom_user_id TEXT;
