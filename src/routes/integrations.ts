import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticateUser } from '../middleware/auth';
import { validateWorkspaceAccess } from '../middleware/workspace';
import type { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * GET /api/integrations/accounts
 * List integration accounts for a workspace
 * Query params: workspace_id (required), provider (optional)
 */
router.get(
  '/accounts',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { provider } = req.query;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      let query = supabase
        .from('integration_accounts')
        .select('id, workspace_id, provider, display_name, is_default, expires_at, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      // Filter by provider if specified
      if (provider && typeof provider === 'string') {
        query = query.eq('provider', provider);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching integration accounts:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch integration accounts',
        });
        return;
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/integrations/accounts/:id
 * Get a specific integration account
 * Query params: workspace_id (required)
 */
router.get(
  '/accounts/:id',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { id } = req.params;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      const { data, error } = await supabase
        .from('integration_accounts')
        .select('id, workspace_id, provider, display_name, is_default, expires_at, extra, created_at, updated_at')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();

      if (error) {
        console.error('Error fetching integration account:', error);
        res.status(404).json({
          success: false,
          error: 'Integration account not found',
        });
        return;
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PATCH /api/integrations/accounts/:id
 * Update an integration account (display_name, is_default)
 * Body: { display_name?, is_default? }
 * Query params: workspace_id (required)
 */
router.patch(
  '/accounts/:id',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { id } = req.params;
      const { display_name, is_default } = req.body;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      // Verify account exists and belongs to workspace
      const { data: existingAccount, error: fetchError } = await supabase
        .from('integration_accounts')
        .select('id, provider')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();

      if (fetchError || !existingAccount) {
        res.status(404).json({
          success: false,
          error: 'Integration account not found',
        });
        return;
      }

      // If setting as default, unset other defaults for this provider
      if (is_default === true) {
        await supabase
          .from('integration_accounts')
          .update({ is_default: false })
          .eq('workspace_id', workspaceId)
          .eq('provider', existingAccount.provider);
      }

      // Update the account
      const updateData: Record<string, unknown> = {};
      if (display_name !== undefined) updateData.display_name = display_name;
      if (is_default !== undefined) updateData.is_default = is_default;

      const { data, error } = await supabase
        .from('integration_accounts')
        .update(updateData)
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select()
        .single();

      if (error) {
        console.error('Error updating integration account:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update integration account',
        });
        return;
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/integrations/accounts/zoom
 * Create a Zoom integration account
 * Body: { workspace_id, display_name?, client_id, client_secret, account_id, is_default? }
 */
router.post(
  '/accounts/zoom',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { display_name, client_id, client_secret, account_id, is_default } = req.body;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      if (!client_id || !client_secret || !account_id) {
        res.status(400).json({
          success: false,
          error: 'client_id, client_secret, and account_id are required',
        });
        return;
      }

      // If setting as default, unset other defaults for Zoom
      if (is_default === true) {
        await supabase
          .from('integration_accounts')
          .update({ is_default: false })
          .eq('workspace_id', workspaceId)
          .eq('provider', 'zoom');
      }

      // Create the Zoom integration account
      const { data, error } = await supabase
        .from('integration_accounts')
        .insert({
          workspace_id: workspaceId,
          provider: 'zoom',
          display_name: display_name || 'Zoom Account',
          client_id,
          client_secret,
          account_id,
          is_default: is_default || false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating Zoom account:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create Zoom integration account',
        });
        return;
      }

      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/integrations/accounts/vapi
 * Create a VAPI integration account
 * Body: { workspace_id, display_name?, api_key, api_secret?, account_id?, is_default? }
 */
router.post(
  '/accounts/vapi',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { display_name, api_key, api_secret, account_id, is_default } = req.body;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      if (!api_key) {
        res.status(400).json({
          success: false,
          error: 'api_key is required',
        });
        return;
      }

      // If setting as default, unset other defaults for VAPI
      if (is_default === true) {
        await supabase
          .from('integration_accounts')
          .update({ is_default: false })
          .eq('workspace_id', workspaceId)
          .eq('provider', 'vapi');
      }

      // Create the VAPI integration account
      const { data, error } = await supabase
        .from('integration_accounts')
        .insert({
          workspace_id: workspaceId,
          provider: 'vapi',
          display_name: display_name || 'VAPI Account',
          api_key,
          api_secret: api_secret || null,
          account_id: account_id || null,
          is_default: is_default || false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating VAPI account:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create VAPI integration account',
        });
        return;
      }

      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/integrations/accounts/:id
 * Delete an integration account
 * Query params: workspace_id (required)
 */
router.delete(
  '/accounts/:id',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { id } = req.params;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      const { error } = await supabase
        .from('integration_accounts')
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('Error deleting integration account:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete integration account',
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Integration account deleted successfully' },
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

export default router;

