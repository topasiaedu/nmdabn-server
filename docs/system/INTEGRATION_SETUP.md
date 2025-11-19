# Integration Setup Guide

This guide explains how to set up each integration provider (Google Sheets, Zoom, VAPI) with the main backend server.

## Overview

The system supports three integration providers, each with different authentication methods:

| Provider | Auth Method | Required Credentials |
|----------|-------------|---------------------|
| **Google Sheets** | OAuth 2.0 | OAuth flow (handled by backend) |
| **Zoom** | Server-to-Server OAuth | Client ID, Client Secret, Account ID |
| **VAPI** | API Key | API Key (+ optional API Secret, Account ID) |

## Google Sheets Integration

### Setup Process

Google Sheets uses OAuth 2.0, which means users authorize the app to access their Google account.

#### 1. Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable APIs:
   - Google Sheets API
   - Google Drive API
4. Create OAuth 2.0 credentials:
   - Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs:
     - Development: `http://localhost:3000/api/auth/google/callback`
     - Production: `https://your-domain.com/api/auth/google/callback`
5. Copy **Client ID** and **Client Secret**

#### 2. Configure Backend

Add to `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

#### 3. Frontend Integration

**Step 1: Get Authorization URL**

```javascript
const response = await fetch(
  `${API_URL}/api/auth/google/authorize?workspace_id=${workspaceId}&state=custom-state`,
  {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  }
);

const { data } = await response.json();
// Redirect user to data.authUrl
window.location.href = data.authUrl;
```

**Step 2: Handle Callback**

After user authorizes, Google redirects to the callback URL. The backend automatically:
- Exchanges code for tokens
- Stores tokens in `integration_accounts` table
- Redirects to your frontend success page

No additional frontend code needed for the callback!

#### 4. Using the Integration

Once connected, you can create jobs:

```javascript
await fetch(`${API_URL}/api/actions/google-sheets/append-row`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    workspace_id: workspaceId,
    spreadsheetId: '1ABC...',
    sheetName: 'Sheet1',
    values: [['Name', 'Email'], ['John', 'john@example.com']]
  })
});
```

---

## Zoom Integration

### Setup Process

Zoom uses Server-to-Server OAuth, which provides long-lived credentials without user interaction.

#### 1. Create Zoom App

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/)
2. Sign in with your Zoom account
3. Click **Develop** → **Build App**
4. Choose **Server-to-Server OAuth**
5. Fill in app information:
   - App name
   - Company name
   - Developer contact
6. Go to **App Credentials** tab
7. Copy:
   - **Client ID**
   - **Client Secret**
   - **Account ID**

#### 2. Configure Scopes

In the Zoom app settings, add required scopes:
- `meeting:write` - Create meetings
- `meeting:read` - Read meeting details
- `user:read` - Read user information
- `webinar:write` - Create webinars
- `webinar:read` - Read webinar details

#### 3. Save Credentials via API

**Frontend/Backend Integration:**

```javascript
const response = await fetch(`${API_URL}/api/integrations/accounts/zoom`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    workspace_id: workspaceId,
    client_id: 'your-zoom-client-id',
    client_secret: 'your-zoom-client-secret',
    account_id: 'your-zoom-account-id',
    display_name: 'Primary Zoom Account',
    is_default: true
  })
});

const { data } = await response.json();
// data contains the created integration account
```

#### 4. Using the Integration

Create a meeting:

```javascript
await fetch(`${API_URL}/api/actions/zoom/create-meeting`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    workspace_id: workspaceId,
    topic: 'Product Demo',
    startTime: '2024-02-01T14:00:00Z',
    duration: 60,
    settings: {
      host_video: true,
      participant_video: true
    }
  })
});
```

---

## VAPI Integration

### Setup Process

VAPI uses API key authentication for simple integration.

#### 1. Get VAPI Credentials

1. Go to [VAPI Dashboard](https://vapi.ai/)
2. Sign in or create an account
3. Navigate to **Settings** → **API Keys**
4. Create a new API key
5. Copy the **API Key**

#### 2. Save Credentials via API

**Frontend/Backend Integration:**

```javascript
const response = await fetch(`${API_URL}/api/integrations/accounts/vapi`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    workspace_id: workspaceId,
    api_key: 'your-vapi-api-key',
    api_secret: 'optional-api-secret', // if applicable
    account_id: 'optional-account-id', // if applicable
    display_name: 'VAPI Account',
    is_default: true
  })
});

const { data } = await response.json();
// data contains the created integration account
```

#### 3. Using the Integration

Create an outbound call:

```javascript
await fetch(`${API_URL}/api/actions/vapi/create-call`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    workspace_id: workspaceId,
    phoneNumber: '+1234567890',
    assistantId: 'assistant-123',
    metadata: {
      campaign: 'Q1 Outreach'
    }
  })
});
```

---

## Managing Integration Accounts

### List All Accounts

```javascript
const response = await fetch(
  `${API_URL}/api/integrations/accounts?workspace_id=${workspaceId}`,
  {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  }
);

const { data } = await response.json();
// data is an array of integration accounts
```

### Filter by Provider

```javascript
const response = await fetch(
  `${API_URL}/api/integrations/accounts?workspace_id=${workspaceId}&provider=zoom`,
  {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  }
);
```

### Update Account

```javascript
await fetch(`${API_URL}/api/integrations/accounts/${accountId}?workspace_id=${workspaceId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    display_name: 'Updated Name',
    is_default: true
  })
});
```

### Delete Account

```javascript
await fetch(`${API_URL}/api/integrations/accounts/${accountId}?workspace_id=${workspaceId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
});
```

---

## Multiple Accounts Per Provider

The system supports multiple accounts per provider per workspace:

- Each workspace can have multiple Google, Zoom, and VAPI accounts
- One account per provider can be marked as `is_default`
- When creating jobs, you can specify which account to use
- If no account is specified, the default account is used

### Example: Multiple Zoom Accounts

```javascript
// Add first Zoom account (default)
await createZoomAccount({
  display_name: 'Sales Team Zoom',
  is_default: true,
  // ... credentials
});

// Add second Zoom account
await createZoomAccount({
  display_name: 'Marketing Team Zoom',
  is_default: false,
  // ... credentials
});

// Use specific account when creating meeting
await fetch(`${API_URL}/api/actions/zoom/create-meeting`, {
  method: 'POST',
  body: JSON.stringify({
    workspace_id: workspaceId,
    integrationAccountId: 'marketing-zoom-account-id', // Specify which account
    topic: 'Marketing Webinar',
    // ...
  })
});
```

---

## Security Best Practices

### 1. Credential Storage

- All credentials are stored in Supabase (encrypted at rest)
- Never expose credentials in frontend code
- Use environment variables for OAuth credentials

### 2. Access Control

- All endpoints require authentication (Supabase JWT)
- Workspace membership is verified on every request
- Users can only access their workspace's integrations

### 3. Token Refresh

- **Google Sheets**: Refresh tokens are stored and used by the Google Sheets microservice
- **Zoom**: Server-to-Server OAuth tokens are refreshed automatically by the Zoom microservice
- **VAPI**: API keys don't expire (unless manually revoked)

### 4. Credential Rotation

To rotate credentials:

1. Create a new integration account with new credentials
2. Set it as default
3. Test that it works
4. Delete the old account

---

## Troubleshooting

### Google OAuth Issues

**Problem**: "Redirect URI mismatch"
- **Solution**: Ensure the redirect URI in Google Cloud Console exactly matches `GOOGLE_REDIRECT_URI` in `.env`

**Problem**: "Access denied"
- **Solution**: Check that Google Sheets API and Drive API are enabled

### Zoom Issues

**Problem**: "Invalid client credentials"
- **Solution**: Verify Client ID, Client Secret, and Account ID are correct

**Problem**: "Insufficient permissions"
- **Solution**: Check app scopes in Zoom Marketplace

### VAPI Issues

**Problem**: "Invalid API key"
- **Solution**: Regenerate API key in VAPI dashboard

**Problem**: "Rate limit exceeded"
- **Solution**: VAPI has rate limits; implement retry logic in your microservice

---

## Testing Integrations

### 1. Test Google Sheets

```bash
# Start OAuth flow
curl -X GET "http://localhost:3000/api/auth/google/authorize?workspace_id=xxx" \
  -H "Authorization: Bearer YOUR_TOKEN"

# After OAuth, test append row
curl -X POST "http://localhost:3000/api/actions/google-sheets/append-row" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "xxx",
    "spreadsheetId": "1ABC...",
    "values": [["test", "data"]]
  }'
```

### 2. Test Zoom

```bash
# Save credentials
curl -X POST "http://localhost:3000/api/integrations/accounts/zoom" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "xxx",
    "client_id": "...",
    "client_secret": "...",
    "account_id": "...",
    "is_default": true
  }'

# Create meeting
curl -X POST "http://localhost:3000/api/actions/zoom/create-meeting" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "xxx",
    "topic": "Test Meeting",
    "startTime": "2024-02-01T14:00:00Z",
    "duration": 30
  }'
```

### 3. Test VAPI

```bash
# Save credentials
curl -X POST "http://localhost:3000/api/integrations/accounts/vapi" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "xxx",
    "api_key": "...",
    "is_default": true
  }'

# Create call
curl -X POST "http://localhost:3000/api/actions/vapi/create-call" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "xxx",
    "phoneNumber": "+1234567890"
  }'
```

---

## Summary

- **Google Sheets**: OAuth flow, user authorizes, tokens stored automatically
- **Zoom**: API credentials saved via POST endpoint
- **VAPI**: API key saved via POST endpoint
- All credentials stored securely in Supabase
- Multiple accounts per provider supported
- Default account used when not specified in job creation

