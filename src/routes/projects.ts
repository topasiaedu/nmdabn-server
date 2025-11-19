import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticateUser } from '../middleware/auth';
import { validateWorkspaceAccess } from '../middleware/workspace';
import type { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * GET /api/projects
 * List all projects for a workspace
 * Query params: workspace_id (required)
 */
router.get(
  '/',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch projects',
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
 * GET /api/projects/:id
 * Get a specific project
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
        .from('projects')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();

      if (error) {
        console.error('Error fetching project:', error);
        res.status(404).json({
          success: false,
          error: 'Project not found',
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
 * POST /api/projects
 * Create a new project
 * Body: { workspace_id, name, description? }
 */
router.post(
  '/',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { name, description } = req.body;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'name is required',
        });
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .insert({
          workspace_id: workspaceId,
          name,
          description: description || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating project:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create project',
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
 * PATCH /api/projects/:id
 * Update a project
 * Body: { name?, description? }
 * Query params: workspace_id (required)
 */
router.patch(
  '/:id',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { id } = req.params;
      const { name, description } = req.body;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      // Verify project exists and belongs to workspace
      const { data: existingProject, error: fetchError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();

      if (fetchError || !existingProject) {
        res.status(404).json({
          success: false,
          error: 'Project not found',
        });
        return;
      }

      // Build update object
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({
          success: false,
          error: 'No fields to update',
        });
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select()
        .single();

      if (error) {
        console.error('Error updating project:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update project',
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
 * DELETE /api/projects/:id
 * Delete a project
 * Query params: workspace_id (required)
 */
router.delete(
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

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete project',
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Project deleted successfully' },
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

