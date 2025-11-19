import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { createJob } from '../services/job-queue';

const router = Router();

// ============================================================================
// Zoom Webhooks
// ============================================================================

/**
 * POST /api/webhooks/zoom
 * Handle Zoom webhook events
 * 
 * Common events:
 * - meeting.started
 * - meeting.ended
 * - meeting.participant_joined
 * - meeting.participant_left
 * - webinar.started
 * - webinar.ended
 * - webinar.participant_joined
 */
router.post('/zoom', async (req: Request, res: Response) => {
  try {
    const { event, payload } = req.body;

    // Zoom sends a verification challenge on webhook setup
    if (event === 'endpoint.url_validation') {
      const { plain_token } = payload;
      // Return encrypted token (in production, use proper encryption)
      res.json({
        plainToken: plain_token,
        encryptedToken: plain_token, // TODO: Implement proper encryption
      });
      return;
    }

    console.log('Zoom webhook received:', event);

    // Handle different event types
    switch (event) {
      case 'meeting.started':
      case 'meeting.ended':
        await handleZoomMeetingEvent(payload, event);
        break;

      case 'webinar.started':
      case 'webinar.ended':
        await handleZoomWebinarEvent(payload, event);
        break;

      case 'meeting.participant_joined':
      case 'meeting.participant_left':
        await handleZoomParticipantEvent(payload, event);
        break;

      case 'recording.completed':
        await handleZoomRecordingEvent(payload);
        break;

      default:
        console.log('Unhandled Zoom event:', event);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Zoom webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

async function handleZoomMeetingEvent(payload: any, event: string) {
  const { object } = payload;
  const meetingId = object.id;

  // Update meeting status in database
  const status = event === 'meeting.started' ? 'started' : 'ended';

  await supabase
    .from('zoom_meetings')
    .update({ status })
    .eq('meeting_id', meetingId.toString());

  console.log(`Meeting ${meetingId} ${status}`);
}

async function handleZoomWebinarEvent(payload: any, event: string) {
  const { object } = payload;
  const webinarId = object.id;

  const status = event === 'webinar.started' ? 'started' : 'ended';

  await supabase
    .from('zoom_webinars')
    .update({ status })
    .eq('webinar_id', webinarId.toString());

  console.log(`Webinar ${webinarId} ${status}`);
}

async function handleZoomParticipantEvent(payload: any, event: string) {
  const { object } = payload;
  const participant = object.participant;

  // Store or update attendee information
  console.log(`Participant event: ${event}`, participant);
  // TODO: Implement attendee tracking logic
}

async function handleZoomRecordingEvent(payload: any) {
  const { object } = payload;
  console.log('Recording completed:', object);
  // TODO: Implement recording storage logic
}

// ============================================================================
// VAPI Webhooks
// ============================================================================

/**
 * POST /api/webhooks/vapi
 * Handle VAPI webhook events
 * 
 * Common events:
 * - call.started
 * - call.ended
 * - call.recording_available
 */
router.post('/vapi', async (req: Request, res: Response) => {
  try {
    const { event, data } = req.body;

    console.log('VAPI webhook received:', event);

    // Handle different event types
    switch (event) {
      case 'call.started':
        await handleVapiCallStarted(data);
        break;

      case 'call.ended':
        await handleVapiCallEnded(data);
        break;

      case 'call.recording_available':
        await handleVapiRecording(data);
        break;

      default:
        console.log('Unhandled VAPI event:', event);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('VAPI webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

async function handleVapiCallStarted(data: any) {
  console.log('VAPI call started:', data);
  // TODO: Store call information in database
  // This would require a vapi_calls table (not in current schema)
}

async function handleVapiCallEnded(data: any) {
  console.log('VAPI call ended:', data);
  // TODO: Update call record with end time, duration, etc.
}

async function handleVapiRecording(data: any) {
  console.log('VAPI recording available:', data);
  // TODO: Store recording URL and metadata
}

// ============================================================================
// Google Sheets Webhooks
// ============================================================================

/**
 * POST /api/webhooks/google-sheets
 * Handle Google Sheets webhook events (if using push notifications)
 * 
 * Note: Google Sheets typically uses polling rather than webhooks,
 * but this endpoint is here for completeness if using Google Drive API push notifications
 */
router.post('/google-sheets', async (req: Request, res: Response) => {
  try {
    const { resourceId, resourceState, channelId } = req.headers;

    console.log('Google Sheets webhook received:', {
      resourceId,
      resourceState,
      channelId,
    });

    // Handle sheet change notification
    if (resourceState === 'update') {
      // Trigger a sync job for the affected spreadsheet
      // TODO: Determine workspace_id from channelId mapping
      console.log('Sheet updated, triggering sync');
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Google Sheets webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

// ============================================================================
// Generic webhook endpoint for testing
// ============================================================================

/**
 * POST /api/webhooks/test
 * Test endpoint to verify webhook setup
 */
router.post('/test', (req: Request, res: Response) => {
  console.log('Test webhook received:', req.body);
  res.json({
    success: true,
    message: 'Webhook received successfully',
    receivedData: req.body,
  });
});

export default router;

