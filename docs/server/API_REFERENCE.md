# API Examples

This document provides practical examples for using the main backend server API.

## Prerequisites

- Server running on `http://localhost:3000`
- Valid Supabase JWT token
- Workspace ID

## Authentication

All authenticated endpoints require a Bearer token:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Google OAuth Flow

### Step 1: Get Authorization URL

```bash
curl -X GET "http://localhost:3000/api/auth/google/authorize?workspace_id=550e8400-e29b-41d4-a716-446655440000&state=custom-state" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
  }
}
```

### Step 2: User Completes OAuth
User visits the `authUrl` and authorizes the application. Google redirects to the callback URL, and tokens are automatically stored.

## Integration Accounts

### List All Integration Accounts

```bash
curl -X GET "http://localhost:3000/api/integrations/accounts?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### List Google Sheets Accounts Only

```bash
curl -X GET "http://localhost:3000/api/integrations/accounts?workspace_id=550e8400-e29b-41d4-a716-446655440000&provider=google_sheets" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Specific Account

```bash
curl -X GET "http://localhost:3000/api/integrations/accounts/account-uuid?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update Account (Set as Default)

```bash
curl -X PATCH "http://localhost:3000/api/integrations/accounts/account-uuid?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_default": true,
    "display_name": "Primary Google Account"
  }'
```

### Create Zoom Integration Account

```bash
curl -X POST "http://localhost:3000/api/integrations/accounts/zoom" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "display_name": "Primary Zoom Account",
    "client_id": "your-zoom-client-id",
    "client_secret": "your-zoom-client-secret",
    "account_id": "your-zoom-account-id",
    "is_default": true
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "account-uuid",
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "zoom",
    "display_name": "Primary Zoom Account",
    "is_default": true,
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Create VAPI Integration Account

```bash
curl -X POST "http://localhost:3000/api/integrations/accounts/vapi" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "display_name": "VAPI Account",
    "api_key": "your-vapi-api-key",
    "api_secret": "your-vapi-api-secret",
    "account_id": "your-vapi-account-id",
    "is_default": true
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "account-uuid",
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "vapi",
    "display_name": "VAPI Account",
    "is_default": true,
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Delete Account

```bash
curl -X DELETE "http://localhost:3000/api/integrations/accounts/account-uuid?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Projects

### List All Projects

```bash
curl -X GET "http://localhost:3000/api/projects?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "project-uuid-1",
      "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Q1 Webinar Series",
      "description": "Quarterly webinar campaign",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Get Specific Project

```bash
curl -X GET "http://localhost:3000/api/projects/project-uuid?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Project

```bash
curl -X POST "http://localhost:3000/api/projects" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Product Launch Campaign",
    "description": "New product launch funnel"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "new-project-uuid",
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Product Launch Campaign",
    "description": "New product launch funnel",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Update Project

```bash
curl -X PATCH "http://localhost:3000/api/projects/project-uuid?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Campaign Name",
    "description": "Updated description"
  }'
```

### Delete Project

```bash
curl -X DELETE "http://localhost:3000/api/projects/project-uuid?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Google Sheets Actions

### Append Row to Spreadsheet

```bash
curl -X POST "http://localhost:3000/api/actions/google-sheets/append-row" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetName": "Sheet1",
    "values": [
      ["John Doe", "john@example.com", "2024-01-15"],
      ["Jane Smith", "jane@example.com", "2024-01-16"]
    ]
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "job-uuid",
    "status": "pending"
  }
}
```

### Sync Sheet Data

```bash
curl -X POST "http://localhost:3000/api/actions/google-sheets/sync-sheet" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetName": "Contacts",
    "syncType": "import",
    "mappingConfig": {
      "email": "A",
      "firstName": "B",
      "lastName": "C"
    }
  }'
```

## VAPI Actions

### Create Outbound Call

```bash
curl -X POST "http://localhost:3000/api/actions/vapi/create-call" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "phoneNumber": "+1234567890",
    "assistantId": "assistant-123",
    "metadata": {
      "campaign": "Q1 Outreach",
      "contactId": "contact-456"
    }
  }'
```

### Sync Call Logs

```bash
curl -X POST "http://localhost:3000/api/actions/vapi/sync-call-log" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }'
```

## Zoom Actions

### Create Meeting

```bash
curl -X POST "http://localhost:3000/api/actions/zoom/create-meeting" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "topic": "Product Demo",
    "startTime": "2024-02-01T14:00:00Z",
    "duration": 60,
    "settings": {
      "host_video": true,
      "participant_video": true,
      "waiting_room": true
    }
  }'
```

### Add Registrant to Meeting

```bash
curl -X POST "http://localhost:3000/api/actions/zoom/add-registrant" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "meetingId": "123456789",
    "email": "attendee@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Add Registrant to Webinar

```bash
curl -X POST "http://localhost:3000/api/actions/zoom/add-registrant" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "webinarId": "987654321",
    "email": "attendee@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "customQuestions": {
      "company": "Acme Corp",
      "role": "Developer"
    }
  }'
```

### Sync Meeting Data

```bash
curl -X POST "http://localhost:3000/api/actions/zoom/sync-meeting" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
    "meetingId": "123456789"
  }'
```

## Jobs

### List All Jobs

```bash
curl -X GET "http://localhost:3000/api/jobs?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### List Jobs by Provider

```bash
curl -X GET "http://localhost:3000/api/jobs?workspace_id=550e8400-e29b-41d4-a716-446655440000&provider=google_sheets" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### List Jobs by Status

```bash
curl -X GET "http://localhost:3000/api/jobs?workspace_id=550e8400-e29b-41d4-a716-446655440000&status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Specific Job

```bash
curl -X GET "http://localhost:3000/api/jobs/job-uuid?workspace_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Webhooks

Webhooks don't require authentication as they come from external services.

### Test Webhook

```bash
curl -X POST "http://localhost:3000/api/webhooks/test" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test.event",
    "data": {
      "message": "Hello from webhook"
    }
  }'
```

### Zoom Webhook Example

```bash
curl -X POST "http://localhost:3000/api/webhooks/zoom" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "meeting.started",
    "payload": {
      "account_id": "account123",
      "object": {
        "id": "123456789",
        "uuid": "meeting-uuid",
        "host_id": "host123",
        "topic": "Test Meeting",
        "start_time": "2024-01-15T14:00:00Z"
      }
    }
  }'
```

### VAPI Webhook Example

```bash
curl -X POST "http://localhost:3000/api/webhooks/vapi" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call.ended",
    "data": {
      "callId": "call-123",
      "duration": 180,
      "status": "completed"
    }
  }'
```

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Missing or invalid authorization header"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": "Access denied: User is not a member of this workspace"
}
```

### 400 Bad Request

```json
{
  "success": false,
  "error": "spreadsheetId and values (array) are required"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "Integration account not found"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error"
}
```

