-- Migration 033: First-party page event tracking table.
--
-- Collects browser events from public/tracker.js (pageview, click, scroll_depth,
-- optin, mousemove, identify). The event_type `identify` links a session to a
-- GHL contact id after form submit (hl-form-submitted).

CREATE TABLE IF NOT EXISTS public.page_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    ghl_contact_id TEXT,
    event_type TEXT NOT NULL
        CHECK (
            event_type IN (
                'pageview',
                'click',
                'scroll_depth',
                'optin',
                'mousemove',
                'identify'
            )
        ),
    url TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbclid TEXT,
    scroll_depth SMALLINT,
    x SMALLINT,
    y SMALLINT,
    element_tag TEXT,
    element_text TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_events_project_event_occurred
    ON public.page_events (project_id, event_type, occurred_at);

CREATE INDEX IF NOT EXISTS idx_page_events_session_id
    ON public.page_events (session_id);

CREATE INDEX IF NOT EXISTS idx_page_events_project_url
    ON public.page_events (project_id, url);

CREATE INDEX IF NOT EXISTS idx_page_events_ghl_contact_id
    ON public.page_events (ghl_contact_id)
    WHERE ghl_contact_id IS NOT NULL;

COMMENT ON TABLE public.page_events IS
    'First-party analytics events per project (tracking pixel); optional link to GHL contact after identify.';

COMMENT ON COLUMN public.page_events.id IS
    'Primary key.';

COMMENT ON COLUMN public.page_events.project_id IS
    'Owning project (site uuid from data-site-id).';

COMMENT ON COLUMN public.page_events.session_id IS
    'Browser session id persisted in localStorage (nm_sid).';

COMMENT ON COLUMN public.page_events.ghl_contact_id IS
    'GHL contact id when known (forms, identify event).';

COMMENT ON COLUMN public.page_events.event_type IS
    'pageview | click | scroll_depth | optin | mousemove | identify';

COMMENT ON COLUMN public.page_events.url IS
    'Document URL when the event was recorded.';

COMMENT ON COLUMN public.page_events.referrer IS
    'document.referrer for the page load.';

COMMENT ON COLUMN public.page_events.utm_source IS
    'First-touch UTM utm_source from landing URL if present.';

COMMENT ON COLUMN public.page_events.utm_medium IS
    'First-touch UTM utm_medium from landing URL if present.';

COMMENT ON COLUMN public.page_events.utm_campaign IS
    'First-touch UTM utm_campaign from landing URL if present.';

COMMENT ON COLUMN public.page_events.utm_content IS
    'First-touch UTM utm_content from landing URL if present.';

COMMENT ON COLUMN public.page_events.utm_term IS
    'First-touch UTM utm_term from landing URL if present.';

COMMENT ON COLUMN public.page_events.fbclid IS
    'Facebook click id from landing URL if present.';

COMMENT ON COLUMN public.page_events.scroll_depth IS
    'Maximum scroll depth 0–100 for scroll_depth events.';

COMMENT ON COLUMN public.page_events.x IS
    'Viewport X percent 0–100 for click/mousemove.';

COMMENT ON COLUMN public.page_events.y IS
    'Viewport Y percent 0–100 for click/mousemove.';

COMMENT ON COLUMN public.page_events.element_tag IS
    'DOM tag name (uppercase) for click events.';

COMMENT ON COLUMN public.page_events.element_text IS
    'Truncated visible text or value for click targets (max 100 chars stored server-side).';

COMMENT ON COLUMN public.page_events.payload IS
    'Additional JSON fields from the client.';

COMMENT ON COLUMN public.page_events.occurred_at IS
    'When the event occurred (client or server clock).';

ALTER TABLE public.page_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to page_events"
    ON public.page_events;
DROP POLICY IF EXISTS "Users can view page_events for their workspace projects"
    ON public.page_events;
DROP POLICY IF EXISTS "Users can insert page_events for their workspace projects"
    ON public.page_events;
DROP POLICY IF EXISTS "Users can update page_events for their workspace projects"
    ON public.page_events;
DROP POLICY IF EXISTS "Users can delete page_events for their workspace projects"
    ON public.page_events;

CREATE POLICY "Service role has full access to page_events"
    ON public.page_events
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view page_events for their workspace projects"
    ON public.page_events
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

CREATE POLICY "Users can insert page_events for their workspace projects"
    ON public.page_events
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

CREATE POLICY "Users can update page_events for their workspace projects"
    ON public.page_events
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

CREATE POLICY "Users can delete page_events for their workspace projects"
    ON public.page_events
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
