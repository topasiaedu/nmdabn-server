import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import type { AuthenticatedRequest } from '../types';

/**
 * Middleware to validate workspace access
 * Extracts workspace_id from query/body/params and validates user membership
 */
export async function validateWorkspaceAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Extract workspace_id from various sources
    const workspaceId = 
      req.params.workspaceId || 
      req.query.workspace_id || 
      req.body.workspace_id;

    if (!workspaceId || typeof workspaceId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'workspace_id is required',
      });
      return;
    }

    // Check if user is a member of this workspace
    const { data: membership, error } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !membership) {
      res.status(403).json({
        success: false,
        error: 'Access denied: User is not a member of this workspace',
      });
      return;
    }

    // Attach workspace_id to request for downstream use
    req.workspaceId = workspaceId;

    next();
  } catch (error) {
    console.error('Workspace validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during workspace validation',
    });
  }
}

/**
 * Optional workspace validation - doesn't fail if workspace_id is missing
 * Used for endpoints where workspace filtering is optional
 */
export async function optionalWorkspaceAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    const workspaceId = 
      req.params.workspaceId || 
      req.query.workspace_id || 
      req.body.workspace_id;

    if (!workspaceId) {
      // No workspace specified, continue without validation
      next();
      return;
    }

    if (typeof workspaceId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Invalid workspace_id format',
      });
      return;
    }

    // Check membership
    const { data: membership, error } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !membership) {
      res.status(403).json({
        success: false,
        error: 'Access denied: User is not a member of this workspace',
      });
      return;
    }

    req.workspaceId = workspaceId;
    next();
  } catch (error) {
    console.error('Optional workspace validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during workspace validation',
    });
  }
}

