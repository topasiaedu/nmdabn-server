import { supabase } from '../config/supabase';
import type { Json } from '../database.types';
import type { IntegrationProvider, IntegrationJobInsert } from '../types';
import { resolveIntegrationAccount } from './integration-accounts';

/**
 * Create a new integration job
 * Automatically resolves integration account if not provided
 */
export async function createJob(
  workspaceId: string,
  provider: IntegrationProvider,
  operation: string,
  payload: object,
  integrationAccountId?: string,
  runAt?: Date
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    // Resolve integration account
    const account = await resolveIntegrationAccount(
      workspaceId,
      provider,
      integrationAccountId
    );

    if (!account) {
      return {
        success: false,
        error: `No integration account found for provider: ${provider}`,
      };
    }

    const payloadJson: Json = JSON.parse(JSON.stringify(payload)) as Json;

    // Create job record
    const jobData: IntegrationJobInsert = {
      workspace_id: workspaceId,
      provider,
      operation,
      payload: payloadJson,
      integration_account_id: account.id,
      status: 'pending',
      attempts: 0,
      run_at: runAt?.toISOString(),
    };

    const { data, error } = await supabase
      .from('integration_jobs')
      .insert(jobData)
      .select('id')
      .single();

    if (error) {
      console.error('Error creating job:', error);
      return {
        success: false,
        error: 'Failed to create job',
      };
    }

    return {
      success: true,
      jobId: data.id,
    };
  } catch (error) {
    console.error('Unexpected error creating job:', error);
    return {
      success: false,
      error: 'Unexpected error creating job',
    };
  }
}

