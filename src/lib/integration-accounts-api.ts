/**
 * Supabase `.select()` column list for integration_accounts rows returned to clients.
 * Excludes tokens, API keys, and encrypted secret columns.
 */
export const INTEGRATION_ACCOUNT_SAFE_RESPONSE_COLUMNS =
  "id, workspace_id, provider, display_name, account_id, client_id, is_default, expires_at, extra, created_at, updated_at";
