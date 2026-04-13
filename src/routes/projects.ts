import { Router, Response } from 'express';
import { parseProjectAgencyLineTags } from '../config/traffic';
import { supabase } from '../config/supabase';
import type { Database, Json } from '../database.types';
import { authenticateUser } from '../middleware/auth';
import { validateWorkspaceAccess } from '../middleware/workspace';
import type { AuthenticatedRequest } from '../types';

const router = Router();
type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];

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
 * Body: { workspace_id, name, description?, ghl_location_id?, traffic_occupation_field_id?, traffic_occupation_field_key?, traffic_agency_line_tags? }
 */
router.post(
  '/',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const body = req.body as Record<string, unknown>;
      const { name, description } = body;
      const ghlLocationIdBody = body.ghl_location_id;
      const occupationFieldIdBody = body.traffic_occupation_field_id;
      const occupationFieldKeyBody = body.traffic_occupation_field_key;
      const agencyTagsBody = body.traffic_agency_line_tags;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      if (typeof name !== "string" || name.trim() === "") {
        res.status(400).json({
          success: false,
          error: 'name is required',
        });
        return;
      }

      const insertData: ProjectInsert = {
        workspace_id: workspaceId,
        name: name.trim(),
        description: typeof description === "string" && description.trim() !== "" ? description : null,
      };

      if (ghlLocationIdBody !== undefined) {
        if (ghlLocationIdBody === null || ghlLocationIdBody === "") {
          insertData.ghl_location_id = null;
        } else if (typeof ghlLocationIdBody === "string") {
          insertData.ghl_location_id = ghlLocationIdBody.trim();
        } else {
          res.status(400).json({
            success: false,
            error: "ghl_location_id must be a string or null",
          });
          return;
        }
      }

      if (occupationFieldIdBody !== undefined) {
        if (occupationFieldIdBody === null || occupationFieldIdBody === "") {
          insertData.traffic_occupation_field_id = null;
        } else if (typeof occupationFieldIdBody === "string") {
          insertData.traffic_occupation_field_id = occupationFieldIdBody.trim();
        } else {
          res.status(400).json({
            success: false,
            error: "traffic_occupation_field_id must be a string or null",
          });
          return;
        }
      }

      if (occupationFieldKeyBody !== undefined) {
        if (occupationFieldKeyBody === null || occupationFieldKeyBody === "") {
          insertData.traffic_occupation_field_key = null;
        } else if (typeof occupationFieldKeyBody === "string") {
          insertData.traffic_occupation_field_key = occupationFieldKeyBody.trim();
        } else {
          res.status(400).json({
            success: false,
            error: "traffic_occupation_field_key must be a string or null",
          });
          return;
        }
      }

      if (agencyTagsBody !== undefined) {
        if (agencyTagsBody === null) {
          insertData.traffic_agency_line_tags = null;
        } else {
          const parsed = parseProjectAgencyLineTags(agencyTagsBody);
          if (parsed === null) {
            res.status(400).json({
              success: false,
              error:
                "traffic_agency_line_tags must be null or an object like {\"OM\":[\"lead_om\"],\"NM\":[\"lead_nm\"]}",
            });
            return;
          }
          insertData.traffic_agency_line_tags = parsed as Json;
        }
      }

      const { data, error } = await supabase
        .from('projects')
        .insert(insertData)
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
 * Body: { name?, description?, ghl_location_id?, traffic_occupation_field_id?, traffic_occupation_field_key?, traffic_agency_line_tags? }
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
      const body = req.body as Record<string, unknown>;
      const { name, description } = body;
      const ghlLocationIdBody = body.ghl_location_id;
      const occupationFieldBody = body.traffic_occupation_field_id;
      const occupationFieldKeyBody = body.traffic_occupation_field_key;
      const agencyTagsBody = body.traffic_agency_line_tags;

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

      if (ghlLocationIdBody !== undefined) {
        if (ghlLocationIdBody === null || ghlLocationIdBody === "") {
          updateData.ghl_location_id = null;
        } else if (typeof ghlLocationIdBody === "string") {
          updateData.ghl_location_id = ghlLocationIdBody.trim();
        } else {
          res.status(400).json({
            success: false,
            error: "ghl_location_id must be a string or null",
          });
          return;
        }
      }

      if (occupationFieldBody !== undefined) {
        if (occupationFieldBody === null || occupationFieldBody === "") {
          updateData.traffic_occupation_field_id = null;
        } else if (typeof occupationFieldBody === "string") {
          updateData.traffic_occupation_field_id = occupationFieldBody.trim();
        } else {
          res.status(400).json({
            success: false,
            error: "traffic_occupation_field_id must be a string or null",
          });
          return;
        }
      }

      if (occupationFieldKeyBody !== undefined) {
        if (occupationFieldKeyBody === null || occupationFieldKeyBody === "") {
          updateData.traffic_occupation_field_key = null;
        } else if (typeof occupationFieldKeyBody === "string") {
          updateData.traffic_occupation_field_key = occupationFieldKeyBody.trim();
        } else {
          res.status(400).json({
            success: false,
            error: "traffic_occupation_field_key must be a string or null",
          });
          return;
        }
      }

      if (agencyTagsBody !== undefined) {
        if (agencyTagsBody === null) {
          updateData.traffic_agency_line_tags = null;
        } else {
          const parsed = parseProjectAgencyLineTags(agencyTagsBody);
          if (parsed === null) {
            res.status(400).json({
              success: false,
              error:
                "traffic_agency_line_tags must be null or an object like {\"OM\":[\"lead_om\"],\"NM\":[\"lead_nm\"]}",
            });
            return;
          }
          updateData.traffic_agency_line_tags = parsed as Json;
        }
      }

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

