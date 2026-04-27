import type { IntegrationProvider } from '../types';

/**
 * Create a new integration job.
 *
 * NOTE: The `integration_jobs` table has not yet been provisioned in the
 * current environment. This function is a stub that returns an error until
 * the table migration is applied and the supabase types are regenerated.
 */
export async function createJob(
  _workspaceId: string,
  _provider: IntegrationProvider,
  _operation: string,
  _payload: object,
  _integrationAccountId?: string,
  _runAt?: Date
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  return { success: false, error: "Job queue not yet configured" };
}
