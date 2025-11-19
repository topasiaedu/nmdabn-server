import { supabase } from '../config/supabase';
import type { IntegrationProvider, IntegrationAccount } from '../types';

/**
 * Get the default integration account for a workspace and provider
 */
export async function getDefaultIntegrationAccount(
  workspaceId: string,
  provider: IntegrationProvider
): Promise<IntegrationAccount | null> {
  const { data, error } = await supabase
    .from('integration_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('is_default', true)
    .single();

  if (error) {
    console.error('Error fetching default integration account:', error);
    return null;
  }

  return data;
}

/**
 * Get a specific integration account by ID
 * Validates it belongs to the specified workspace
 */
export async function getIntegrationAccount(
  accountId: string,
  workspaceId: string
): Promise<IntegrationAccount | null> {
  const { data, error } = await supabase
    .from('integration_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('workspace_id', workspaceId)
    .single();

  if (error) {
    console.error('Error fetching integration account:', error);
    return null;
  }

  return data;
}

/**
 * Resolve integration account - either use specified ID or get default
 */
export async function resolveIntegrationAccount(
  workspaceId: string,
  provider: IntegrationProvider,
  accountId?: string
): Promise<IntegrationAccount | null> {
  if (accountId) {
    return getIntegrationAccount(accountId, workspaceId);
  }

  return getDefaultIntegrationAccount(workspaceId, provider);
}

