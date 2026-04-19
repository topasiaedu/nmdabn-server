-- Zoom participant segments (per join/leave fact) + app-only contacts (no GHL mirror).
-- Apply in Supabase SQL editor; then regenerate src/database.types.ts.

-- ---------------------------------------------------------------------------
-- App-only contacts (Zoom email mismatch — stored in ghl_contacts shape, never GHL-synced)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ghl_contacts
  ADD COLUMN IF NOT EXISTS is_app_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.ghl_contacts
  ADD COLUMN IF NOT EXISTS app_only_project_id UUID REFERENCES public.projects (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.ghl_contacts.is_app_only IS
  'When true, this row was created in-app (e.g. Zoom join email not in GHL); do not push to or overwrite from GHL mirror.';

COMMENT ON COLUMN public.ghl_contacts.app_only_project_id IS
  'Project scope for app-only identity; required when is_app_only is true.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ghl_contacts_app_only_project_email
  ON public.ghl_contacts (app_only_project_id, (lower(trim(email))))
  WHERE is_app_only = TRUE AND email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_is_app_only_project
  ON public.ghl_contacts (app_only_project_id)
  WHERE is_app_only = TRUE;

-- ---------------------------------------------------------------------------
-- zoom_attendance_segments: granular Zoom report rows for charts + journey rollup
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zoom_attendance_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_run_id UUID NOT NULL REFERENCES public.webinar_runs (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  zoom_meeting_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  participant_email TEXT,
  join_at TIMESTAMPTZ NOT NULL,
  leave_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  contact_id TEXT REFERENCES public.ghl_contacts (id) ON DELETE SET NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT zoom_attendance_segments_run_key UNIQUE (webinar_run_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_zoom_attendance_segments_run_join
  ON public.zoom_attendance_segments (webinar_run_id, join_at);

CREATE INDEX IF NOT EXISTS idx_zoom_attendance_segments_contact
  ON public.zoom_attendance_segments (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zoom_attendance_segments_project
  ON public.zoom_attendance_segments (project_id);

COMMENT ON TABLE public.zoom_attendance_segments IS
  'One row per Zoom participant report line (join/leave segment); idempotent per webinar_run + idempotency_key.';

COMMENT ON COLUMN public.zoom_attendance_segments.idempotency_key IS
  'Stable key from run + Zoom participant identity + join_time (see app sync).';

ALTER TABLE public.zoom_attendance_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to zoom_attendance_segments"
  ON public.zoom_attendance_segments;
DROP POLICY IF EXISTS "Users can view zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments;
DROP POLICY IF EXISTS "Users can insert zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments;
DROP POLICY IF EXISTS "Users can update zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments;
DROP POLICY IF EXISTS "Users can delete zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments;

CREATE POLICY "Service role has full access to zoom_attendance_segments"
  ON public.zoom_attendance_segments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE p.workspace_id IN (
        SELECT wm.workspace_id
        FROM public.workspace_members wm
        WHERE wm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE p.workspace_id IN (
        SELECT wm.workspace_id
        FROM public.workspace_members wm
        WHERE wm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments
  FOR UPDATE
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE p.workspace_id IN (
        SELECT wm.workspace_id
        FROM public.workspace_members wm
        WHERE wm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete zoom_attendance_segments for their workspace projects"
  ON public.zoom_attendance_segments
  FOR DELETE
  USING (
    project_id IN (
      SELECT p.id
      FROM public.projects p
      WHERE p.workspace_id IN (
        SELECT wm.workspace_id
        FROM public.workspace_members wm
        WHERE wm.user_id = auth.uid()
      )
    )
  );
