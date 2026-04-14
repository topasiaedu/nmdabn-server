-- GoHighLevel API credentials per project (multi-location).
-- Webhook routing: lookup active row by ghl_location_id; token is app-layer AES-GCM ciphertext.

CREATE TABLE IF NOT EXISTS public.ghl_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    ghl_location_id TEXT NOT NULL,
    private_integration_token_encrypted TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ghl_connections_location UNIQUE (ghl_location_id)
);

CREATE INDEX IF NOT EXISTS idx_ghl_connections_project_id
  ON public.ghl_connections (project_id);

CREATE INDEX IF NOT EXISTS idx_ghl_connections_location_active
  ON public.ghl_connections (ghl_location_id)
  WHERE is_active = true;

COMMENT ON TABLE public.ghl_connections IS
  'Per-project GHL sub-account: location id + encrypted private integration token for API and webhook-scoped sync.';

COMMENT ON COLUMN public.ghl_connections.ghl_location_id IS
  'GoHighLevel location (sub-account) id; unique across rows for webhook lookup.';

COMMENT ON COLUMN public.ghl_connections.private_integration_token_encrypted IS
  'AES-256-GCM wire: base64 of binary v1 || iv(12) || tag(16) || ciphertext; decrypt with GHL_CONNECTION_TOKEN_ENCRYPTION_KEY.';

ALTER TABLE public.ghl_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ghl_connections for their workspace projects"
    ON public.ghl_connections
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

CREATE POLICY "Users can insert ghl_connections for their workspace projects"
    ON public.ghl_connections
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

CREATE POLICY "Users can update ghl_connections for their workspace projects"
    ON public.ghl_connections
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

CREATE POLICY "Users can delete ghl_connections for their workspace projects"
    ON public.ghl_connections
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

CREATE TRIGGER update_ghl_connections_updated_at
    BEFORE UPDATE ON public.ghl_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
