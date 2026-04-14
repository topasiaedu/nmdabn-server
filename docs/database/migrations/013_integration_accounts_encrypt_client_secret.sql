-- integration_accounts: rename secret columns to *_encrypted (AES-256-GCM at rest; app decrypts with GHL_CONNECTION_TOKEN_ENCRYPTION_KEY).
-- Enable RLS + policies for defense in depth (service role bypass + workspace membership).

ALTER TABLE public.integration_accounts
    RENAME COLUMN client_secret TO client_secret_encrypted;

ALTER TABLE public.integration_accounts
    RENAME COLUMN api_secret TO api_secret_encrypted;

COMMENT ON COLUMN public.integration_accounts.client_secret_encrypted IS
    'AES-256-GCM wire: base64 of binary v1 || iv(12) || tag(16) || ciphertext; decrypt with GHL_CONNECTION_TOKEN_ENCRYPTION_KEY.';

COMMENT ON COLUMN public.integration_accounts.api_secret_encrypted IS
    'AES-256-GCM wire (same as client_secret_encrypted); decrypt with GHL_CONNECTION_TOKEN_ENCRYPTION_KEY.';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'integration_accounts'
          AND c.relrowsecurity = false
    ) THEN
        ALTER TABLE public.integration_accounts ENABLE ROW LEVEL SECURITY;
    END IF;
END
$$;

DROP POLICY IF EXISTS "Service role has full access to integration_accounts"
    ON public.integration_accounts;
DROP POLICY IF EXISTS "Users can view integration_accounts for their workspaces"
    ON public.integration_accounts;
DROP POLICY IF EXISTS "Users can insert integration_accounts for their workspaces"
    ON public.integration_accounts;
DROP POLICY IF EXISTS "Users can update integration_accounts for their workspaces"
    ON public.integration_accounts;
DROP POLICY IF EXISTS "Users can delete integration_accounts for their workspaces"
    ON public.integration_accounts;

CREATE POLICY "Service role has full access to integration_accounts"
    ON public.integration_accounts
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view integration_accounts for their workspaces"
    ON public.integration_accounts
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT wm.workspace_id
            FROM public.workspace_members wm
            WHERE wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert integration_accounts for their workspaces"
    ON public.integration_accounts
    FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT wm.workspace_id
            FROM public.workspace_members wm
            WHERE wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update integration_accounts for their workspaces"
    ON public.integration_accounts
    FOR UPDATE
    USING (
        workspace_id IN (
            SELECT wm.workspace_id
            FROM public.workspace_members wm
            WHERE wm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete integration_accounts for their workspaces"
    ON public.integration_accounts
    FOR DELETE
    USING (
        workspace_id IN (
            SELECT wm.workspace_id
            FROM public.workspace_members wm
            WHERE wm.user_id = auth.uid()
        )
    );
