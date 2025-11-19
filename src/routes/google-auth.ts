import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { authenticateUser } from '../middleware/auth';
import { validateWorkspaceAccess } from '../middleware/workspace';
import type { AuthenticatedRequest } from '../types';

const router = Router();

// OAuth2 client configuration
const oauth2Client = new google.auth.OAuth2(
  env.google.clientId,
  env.google.clientSecret,
  env.google.redirectUri
);

// Scopes required for Google Sheets integration
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

/**
 * GET /api/auth/google/authorize
 * Generate Google OAuth authorization URL
 * Query params: workspace_id (required), state (optional)
 */
router.get(
  '/authorize',
  authenticateUser,
  validateWorkspaceAccess,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const state = (req.query.state as string) || '';

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'workspace_id is required',
        });
        return;
      }

      // Encode workspace_id and state in the state parameter
      const stateData = JSON.stringify({
        workspaceId,
        customState: state,
      });

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: Buffer.from(stateData).toString('base64'),
        prompt: 'consent', // Force consent to get refresh token
      });

      res.json({
        success: true,
        data: {
          authUrl,
        },
      });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate authorization URL',
      });
    }
  }
);

/**
 * GET /api/auth/google/callback
 * Handle OAuth callback from Google
 * Query params: code, state
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).send('Missing authorization code');
      return;
    }

    // Decode state parameter
    let workspaceId: string;
    let customState: string = '';

    if (state && typeof state === 'string') {
      try {
        const stateData = JSON.parse(
          Buffer.from(state, 'base64').toString('utf-8')
        );
        workspaceId = stateData.workspaceId;
        customState = stateData.customState || '';
      } catch {
        res.status(400).send('Invalid state parameter');
        return;
      }
    } else {
      res.status(400).send('Missing state parameter');
      return;
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      res.status(500).send('Failed to obtain access token');
      return;
    }

    // Get user info to use as display name
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Store tokens in integration_accounts table
    const { error: insertError } = await supabase
      .from('integration_accounts')
      .insert({
        workspace_id: workspaceId,
        provider: 'google_sheets',
        display_name: userInfo.email || 'Google Account',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        extra: {
          scope: tokens.scope,
          token_type: tokens.token_type,
          user_email: userInfo.email,
        },
        is_default: false, // User can set this later
      });

    if (insertError) {
      console.error('Error storing tokens:', insertError);
      res.status(500).send('Failed to store integration credentials');
      return;
    }

    // Redirect to success page (frontend should handle this)
    const redirectUrl = `${env.server.nodeEnv === 'production' ? 'https' : 'http'}://your-frontend-url/integrations/google/success?state=${customState}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
});

export default router;

