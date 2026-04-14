-- Unified per-contact timeline: GHL, Zoom, web, manual (see Buyer-Journey-Event-Store wiki).

CREATE TABLE IF NOT EXISTS public.journey_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL,
    event_type TEXT NOT NULL,
    source_system TEXT NOT NULL
        CHECK (source_system IN ('ghl', 'zoom', 'web', 'manual')),
    contact_id TEXT REFERENCES public.ghl_contacts (id) ON DELETE SET NULL,
    location_id TEXT,
    project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
    webinar_run_id UUID REFERENCES public.webinar_runs (id) ON DELETE SET NULL,
    duration_seconds INTEGER,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_events_contact_occurred
    ON public.journey_events (contact_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_journey_events_webinar_run
    ON public.journey_events (webinar_run_id);

CREATE INDEX IF NOT EXISTS idx_journey_events_project_occurred
    ON public.journey_events (project_id, occurred_at);

COMMENT ON TABLE public.journey_events IS
    'Per-contact timeline from GHL, Zoom, first-party web, and manual sources; Zoom attendance uses source_system zoom + event_type attended.';

COMMENT ON COLUMN public.journey_events.contact_id IS
    'GHL contact id when resolved; NULL before resolution.';

COMMENT ON COLUMN public.journey_events.webinar_run_id IS
    'When set, ties the event to a webinar run (e.g. Zoom attended for Show Up metrics).';

COMMENT ON COLUMN public.journey_events.payload IS
    'Vendor-specific fields; Zoom idempotency uses meeting id + participant email in application logic.';

ALTER TABLE public.journey_events ENABLE ROW LEVEL SECURITY;

-- Idempotent: re-run safe after partial apply or policy drift
DROP POLICY IF EXISTS "Service role has full access to journey_events"
    ON public.journey_events;
DROP POLICY IF EXISTS "Users can view journey_events for their workspace projects"
    ON public.journey_events;
DROP POLICY IF EXISTS "Users can insert journey_events for their workspace projects"
    ON public.journey_events;
DROP POLICY IF EXISTS "Users can update journey_events for their workspace projects"
    ON public.journey_events;
DROP POLICY IF EXISTS "Users can delete journey_events for their workspace projects"
    ON public.journey_events;

CREATE POLICY "Service role has full access to journey_events"
    ON public.journey_events
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view journey_events for their workspace projects"
    ON public.journey_events
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

CREATE POLICY "Users can insert journey_events for their workspace projects"
    ON public.journey_events
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

CREATE POLICY "Users can update journey_events for their workspace projects"
    ON public.journey_events
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

CREATE POLICY "Users can delete journey_events for their workspace projects"
    ON public.journey_events
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
