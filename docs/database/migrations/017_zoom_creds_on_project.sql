-- Move Zoom S2S OAuth credentials from integration_accounts → projects.
-- Each project stores its own Zoom credentials directly, allowing per-client Zoom accounts.

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS zoom_client_id TEXT,
    ADD COLUMN IF NOT EXISTS zoom_account_id TEXT,
    ADD COLUMN IF NOT EXISTS zoom_client_secret_encrypted TEXT;

COMMENT ON COLUMN public.projects.zoom_client_id IS
    'Zoom Server-to-Server OAuth Client ID for this project.';

COMMENT ON COLUMN public.projects.zoom_account_id IS
    'Zoom Server-to-Server OAuth Account ID for this project.';

COMMENT ON COLUMN public.projects.zoom_client_secret_encrypted IS
    'AES-256-GCM encrypted Zoom Client Secret for this project (same key as ghl_connections).';

-- Remove the old FK that pointed to the workspace-level integration_accounts table.
ALTER TABLE public.projects
    DROP COLUMN IF EXISTS zoom_integration_account_id;
