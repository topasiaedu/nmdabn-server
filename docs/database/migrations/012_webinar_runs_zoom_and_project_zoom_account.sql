-- Link webinar runs to projects + Zoom meeting/webinar id for participant sync (see Webinar-Run-Zoom-Linkage wiki).
-- Per-project Zoom OAuth account on projects for S2S token exchange.
--
-- integration_accounts must exist before projects.zoom_integration_account_id FK. Some environments created
-- types/API code before this table existed in Postgres; create it here when missing.

DO $enum$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'integration_provider'
    ) THEN
        CREATE TYPE public.integration_provider AS ENUM (
            'zoom',
            'vapi',
            'google_sheets',
            'gohighlevel'
        );
    END IF;
END
$enum$;

CREATE TABLE IF NOT EXISTS public.integration_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
    provider public.integration_provider NOT NULL,
    display_name TEXT,
    account_id TEXT,
    client_id TEXT,
    client_secret TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    api_key TEXT,
    api_secret TEXT,
    extra JSONB,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_accounts_workspace_provider
    ON public.integration_accounts (workspace_id, provider);

ALTER TABLE public.webinar_runs
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects (id) ON DELETE SET NULL;

ALTER TABLE public.webinar_runs
    ADD COLUMN IF NOT EXISTS zoom_meeting_id TEXT;

ALTER TABLE public.webinar_runs
    ADD COLUMN IF NOT EXISTS zoom_source_type TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'webinar_runs'
          AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND c.conname = 'webinar_runs_zoom_source_type_check'
    ) THEN
        ALTER TABLE public.webinar_runs
            ADD CONSTRAINT webinar_runs_zoom_source_type_check
            CHECK (
                zoom_source_type IS NULL
                OR zoom_source_type IN ('meeting', 'webinar')
            );
    END IF;
END
$$;

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS zoom_integration_account_id UUID REFERENCES public.integration_accounts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_webinar_runs_zoom_meeting_id
    ON public.webinar_runs (zoom_meeting_id);

COMMENT ON COLUMN public.webinar_runs.project_id IS
    'Optional link to project; drives Zoom credentials via projects.zoom_integration_account_id.';

COMMENT ON COLUMN public.webinar_runs.zoom_meeting_id IS
    'Zoom meeting or webinar id for participant report API; set by operator in admin UI.';

COMMENT ON COLUMN public.webinar_runs.zoom_source_type IS
    'meeting vs webinar product: selects Zoom report API path.';

COMMENT ON COLUMN public.projects.zoom_integration_account_id IS
    'integration_accounts row with Zoom S2S OAuth credentials for this project.';
