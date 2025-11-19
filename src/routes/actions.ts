import { Router, Response } from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateWorkspaceAccess } from '../middleware/workspace';
import { createJob } from '../services/job-queue';
import type { AuthenticatedRequest } from '../types';
import type {
  GoogleSheetsAppendRowPayload,
  GoogleSheetsSyncSheetPayload,
  VapiCreateCallPayload,
  VapiSyncCallLogPayload,
  ZoomCreateMeetingPayload,
  ZoomAddRegistrantPayload,
  ZoomSyncMeetingPayload,
} from '../types';

const router = Router();

// ============================================================================
// Google Sheets Actions
// ============================================================================

/**
 * POST /api/actions/google-sheets/append-row
 * Append a row to a Google Sheet
 */
router.post(
  '/google-sheets/append-row',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { spreadsheetId, sheetName, values, integrationAccountId } = req.body;

      if (!workspaceId) {
        res.status(400).json({ success: false, error: 'workspace_id is required' });
        return;
      }

      if (!spreadsheetId || !values || !Array.isArray(values)) {
        res.status(400).json({
          success: false,
          error: 'spreadsheetId and values (array) are required',
        });
        return;
      }

      const payload: GoogleSheetsAppendRowPayload = {
        spreadsheetId,
        sheetName,
        values,
      };

      const result = await createJob(
        workspaceId,
        'google_sheets',
        'append_row',
        payload,
        integrationAccountId
      );

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: {
          jobId: result.jobId,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Error creating append-row job:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/actions/google-sheets/sync-sheet
 * Trigger a Google Sheet sync
 */
router.post(
  '/google-sheets/sync-sheet',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { spreadsheetId, sheetName, syncType, mappingConfig, integrationAccountId } = req.body;

      if (!workspaceId) {
        res.status(400).json({ success: false, error: 'workspace_id is required' });
        return;
      }

      if (!spreadsheetId || !syncType) {
        res.status(400).json({
          success: false,
          error: 'spreadsheetId and syncType are required',
        });
        return;
      }

      const payload: GoogleSheetsSyncSheetPayload = {
        spreadsheetId,
        sheetName,
        syncType,
        mappingConfig,
      };

      const result = await createJob(
        workspaceId,
        'google_sheets',
        'sync_sheet',
        payload,
        integrationAccountId
      );

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: {
          jobId: result.jobId,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Error creating sync-sheet job:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ============================================================================
// VAPI Actions
// ============================================================================

/**
 * POST /api/actions/vapi/create-call
 * Initiate an outbound call via VAPI
 */
router.post(
  '/vapi/create-call',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { phoneNumber, assistantId, metadata, integrationAccountId } = req.body;

      if (!workspaceId) {
        res.status(400).json({ success: false, error: 'workspace_id is required' });
        return;
      }

      if (!phoneNumber) {
        res.status(400).json({
          success: false,
          error: 'phoneNumber is required',
        });
        return;
      }

      const payload: VapiCreateCallPayload = {
        phoneNumber,
        assistantId,
        metadata,
      };

      const result = await createJob(
        workspaceId,
        'vapi',
        'create_call',
        payload,
        integrationAccountId
      );

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: {
          jobId: result.jobId,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Error creating create-call job:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/actions/vapi/sync-call-log
 * Sync call logs from VAPI
 */
router.post(
  '/vapi/sync-call-log',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { callId, startDate, endDate, integrationAccountId } = req.body;

      if (!workspaceId) {
        res.status(400).json({ success: false, error: 'workspace_id is required' });
        return;
      }

      const payload: VapiSyncCallLogPayload = {
        callId,
        startDate,
        endDate,
      };

      const result = await createJob(
        workspaceId,
        'vapi',
        'sync_call_log',
        payload,
        integrationAccountId
      );

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: {
          jobId: result.jobId,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Error creating sync-call-log job:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ============================================================================
// Zoom Actions
// ============================================================================

/**
 * POST /api/actions/zoom/create-meeting
 * Create a Zoom meeting
 */
router.post(
  '/zoom/create-meeting',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { topic, startTime, duration, settings, integrationAccountId } = req.body;

      if (!workspaceId) {
        res.status(400).json({ success: false, error: 'workspace_id is required' });
        return;
      }

      if (!topic || !startTime || !duration) {
        res.status(400).json({
          success: false,
          error: 'topic, startTime, and duration are required',
        });
        return;
      }

      const payload: ZoomCreateMeetingPayload = {
        topic,
        startTime,
        duration,
        settings,
      };

      const result = await createJob(
        workspaceId,
        'zoom',
        'create_meeting',
        payload,
        integrationAccountId
      );

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: {
          jobId: result.jobId,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Error creating create-meeting job:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/actions/zoom/add-registrant
 * Add a registrant to a Zoom meeting or webinar
 */
router.post(
  '/zoom/add-registrant',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const {
        meetingId,
        webinarId,
        email,
        firstName,
        lastName,
        customQuestions,
        integrationAccountId,
      } = req.body;

      if (!workspaceId) {
        res.status(400).json({ success: false, error: 'workspace_id is required' });
        return;
      }

      if (!email || (!meetingId && !webinarId)) {
        res.status(400).json({
          success: false,
          error: 'email and either meetingId or webinarId are required',
        });
        return;
      }

      const payload: ZoomAddRegistrantPayload = {
        meetingId,
        webinarId,
        email,
        firstName,
        lastName,
        customQuestions,
      };

      const result = await createJob(
        workspaceId,
        'zoom',
        'add_registrant',
        payload,
        integrationAccountId
      );

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: {
          jobId: result.jobId,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Error creating add-registrant job:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/actions/zoom/sync-meeting
 * Sync meeting data from Zoom
 */
router.post(
  '/zoom/sync-meeting',
  authenticateUser,
  validateWorkspaceAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspaceId } = req;
      const { meetingId, integrationAccountId } = req.body;

      if (!workspaceId) {
        res.status(400).json({ success: false, error: 'workspace_id is required' });
        return;
      }

      if (!meetingId) {
        res.status(400).json({
          success: false,
          error: 'meetingId is required',
        });
        return;
      }

      const payload: ZoomSyncMeetingPayload = {
        meetingId,
      };

      const result = await createJob(
        workspaceId,
        'zoom',
        'sync_meeting',
        payload,
        integrationAccountId
      );

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json({
        success: true,
        data: {
          jobId: result.jobId,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Error creating sync-meeting job:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;

