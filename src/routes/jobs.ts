import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticateUser } from '../middleware/auth';
import { validateWorkspaceAccess } from '../middleware/workspace';
import type { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * GET /api/jobs
 * List integration jobs for a workspace
 * Query params: workspace_id (required), provider (optional), status (optional), limit (optional)
 */
router.get(
  '/',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { provider, status, limit } = req.query;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      let query = supabase
        .from('integration_jobs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      // Apply filters
      const providerFilter = typeof provider === "string" ? provider : undefined;
      if (
        providerFilter === "zoom" ||
        providerFilter === "vapi" ||
        providerFilter === "google_sheets" ||
        providerFilter === "gohighlevel"
      ) {
        query = query.eq("provider", providerFilter);
      }

      const statusFilter = typeof status === "string" ? status : undefined;
      if (
        statusFilter === "pending" ||
        statusFilter === "processing" ||
        statusFilter === "done" ||
        statusFilter === "error"
      ) {
        query = query.eq("status", statusFilter);
      }

      // Apply limit
      const limitNum = limit ? parseInt(limit as string, 10) : 50;
      query = query.limit(limitNum);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch jobs',
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
 * GET /api/jobs/:id
 * Get a specific job
 * Query params: workspace_id (required)
 */
router.get(
  '/:id',
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
        .from('integration_jobs')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();

      if (error) {
        console.error('Error fetching job:', error);
        res.status(404).json({
          success: false,
          error: 'Job not found',
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

export default router;

