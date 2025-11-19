# NMDABN Main Backend Server

Webinar management platform with AI-powered analytics - Main backend server that orchestrates integration microservices.

> **📚 [Documentation Index](docs/README.md)** | **🌐 [System Architecture](docs/system/ARCHITECTURE.md)** | **🚀 [Quick Start](docs/server/QUICKSTART.md)** | **📖 [API Reference](docs/server/API_REFERENCE.md)**

## Overview

This is the **main backend (orchestrator/brain)** for a webinar management platform that:
- Exposes all public APIs for the frontend
- Handles authentication and workspace scoping
- Creates integration jobs for microservices to execute
- Processes webhooks from external providers
- Manages business logic and workflows

**Future:** AI-powered chatbot for natural language analytics queries

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (JWT-based)
- **Integrations**: 
  - ✅ Google Sheets (OAuth)
  - ✅ Zoom (Server-to-Server OAuth)
  - 🔄 VAPI (Planned)
  - 🔄 GoHighLevel (Planned)

## Prerequisites

- Node.js 18+ and npm
- Supabase project with the database schema from `database.types.ts`
- Google Cloud Console project with OAuth 2.0 credentials
- (Optional) Zoom, VAPI accounts for testing

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure `.env` with your credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
PORT=3000
NODE_ENV=development
```

## Development

Start the development server with hot reload:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Build & Production

Build TypeScript to JavaScript:
```bash
npm run build
```

Run production server:
```bash
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Authentication
- `GET /api/auth/google/authorize` - Initiate Google OAuth flow
- `GET /api/auth/google/callback` - OAuth callback handler

### Integration Accounts
- `GET /api/integrations/accounts` - List integration accounts
- `GET /api/integrations/accounts/:id` - Get specific account
- `POST /api/integrations/accounts/zoom` - Create Zoom integration account
- `POST /api/integrations/accounts/vapi` - Create VAPI integration account
- `PATCH /api/integrations/accounts/:id` - Update account
- `DELETE /api/integrations/accounts/:id` - Delete account

### Jobs
- `GET /api/jobs` - List integration jobs
- `GET /api/jobs/:id` - Get specific job

### Actions (Business Logic Endpoints)

#### Google Sheets
- `POST /api/actions/google-sheets/append-row` - Append row to spreadsheet
- `POST /api/actions/google-sheets/sync-sheet` - Trigger sheet sync

#### VAPI
- `POST /api/actions/vapi/create-call` - Initiate outbound call
- `POST /api/actions/vapi/sync-call-log` - Sync call logs

#### Zoom
- `POST /api/actions/zoom/create-meeting` - Create Zoom meeting
- `POST /api/actions/zoom/add-registrant` - Add registrant to meeting/webinar
- `POST /api/actions/zoom/sync-meeting` - Sync meeting data

### Webhooks
- `POST /api/webhooks/zoom` - Zoom webhook handler
- `POST /api/webhooks/vapi` - VAPI webhook handler
- `POST /api/webhooks/google-sheets` - Google Sheets webhook handler
- `POST /api/webhooks/test` - Test webhook endpoint

## Authentication

All API endpoints (except webhooks and OAuth callbacks) require authentication via Supabase JWT token:

```bash
Authorization: Bearer <supabase-jwt-token>
```

Most endpoints also require a `workspace_id` parameter to scope operations to a specific workspace.

## Setting Up Integrations

### Google Sheets (OAuth)
Google Sheets uses OAuth 2.0 flow:

1. User initiates OAuth from frontend
2. Backend generates authorization URL
3. User authorizes on Google
4. Tokens are automatically stored

```bash
GET /api/auth/google/authorize?workspace_id=<workspace-id>
```

### Zoom (API Credentials)
Zoom uses Server-to-Server OAuth credentials:

1. Get credentials from [Zoom Marketplace](https://marketplace.zoom.us/)
2. Create Server-to-Server OAuth app
3. Save credentials via API:

```bash
POST /api/integrations/accounts/zoom
{
  "workspace_id": "xxx",
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "account_id": "your-account-id",
  "display_name": "Primary Zoom",
  "is_default": true
}
```

### VAPI (API Key)
VAPI uses API key authentication:

1. Get API key from [VAPI Dashboard](https://vapi.ai/)
2. Save credentials via API:

```bash
POST /api/integrations/accounts/vapi
{
  "workspace_id": "xxx",
  "api_key": "your-api-key",
  "display_name": "VAPI Account",
  "is_default": true
}
```

## Example Usage

### 1. Authenticate User
Frontend obtains Supabase JWT token via Supabase Auth.

### 2. Connect Integrations
See "Setting Up Integrations" section above.

### 3. Create a Job (Append Row to Google Sheet)
```bash
POST /api/actions/google-sheets/append-row
Authorization: Bearer <token>
Content-Type: application/json

{
  "workspace_id": "workspace-uuid",
  "spreadsheetId": "1ABC...",
  "sheetName": "Sheet1",
  "values": [["Name", "Email"], ["John Doe", "john@example.com"]],
  "integrationAccountId": "account-uuid" // optional, uses default if not provided
}
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

### 4. Microservice Picks Up Job
The Google Sheets microservice subscribes to `integration_jobs` table via Supabase Realtime:
- Filters for `provider = 'google_sheets'` and `status = 'pending'`
- Executes the job using stored credentials
- Updates job status to `done` or `error`

## Job Queue Pattern

Jobs are created in the `integration_jobs` table and picked up by microservices via Supabase Realtime subscriptions (not polling).

Each microservice:
1. Subscribes to `integration_jobs` table changes
2. Filters for their provider (e.g., `provider = 'zoom'`)
3. Processes jobs with `status = 'pending'`
4. Updates job status and attempts

## Webhook Setup

### Zoom
Configure webhook endpoint in Zoom Marketplace:
```
https://your-domain.com/api/webhooks/zoom
```

### VAPI
Configure webhook URL in VAPI dashboard:
```
https://your-domain.com/api/webhooks/vapi
```

## Project Structure

```
src/
├── config/
│   ├── env.ts              # Environment variable validation
│   └── supabase.ts         # Supabase client setup
├── middleware/
│   ├── auth.ts             # JWT authentication
│   └── workspace.ts        # Workspace access validation
├── routes/
│   ├── google-auth.ts      # Google OAuth flow
│   ├── integrations.ts     # Integration accounts CRUD
│   ├── jobs.ts             # Job listing
│   ├── actions.ts          # Business logic endpoints
│   └── webhooks.ts         # Webhook handlers
├── services/
│   ├── integration-accounts.ts  # Account helpers
│   └── job-queue.ts        # Job creation service
├── types/
│   └── index.ts            # TypeScript types
└── index.ts                # Express app entry point
```

## Multi-Tenancy & Projects

All operations are scoped to workspaces and projects:
- **Workspaces** represent companies/tenants
- **Projects** represent campaigns/funnels within a workspace
- Users belong to one or more workspaces via `workspace_members` table
- All data is isolated by `workspace_id`
- Domain tables include `project_id` for campaign-level analytics
- Middleware validates workspace access on every request

**Critical for AI Chatbot:** All domain tables must have `project_id` to enable project-level analytics queries.

## Security Considerations

- Service role key is used for backend operations (never exposed to frontend)
- User JWT tokens are validated on every authenticated request
- Workspace membership is verified before any data access
- Sensitive credentials (tokens, secrets) are stored encrypted in Supabase
- CORS is configured to allow only trusted origins in production

## Error Handling

All endpoints return consistent JSON responses:

Success:
```json
{
  "success": true,
  "data": { ... }
}
```

Error:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Logging

Request logging is enabled by default. All requests are logged with:
- Timestamp
- HTTP method
- Request path

## Documentation

Documentation is organized into **System-Wide** (applies to all services) and **Server-Specific** (this repo only):

### 🌐 System-Wide Documentation
- **[System Overview](docs/system/OVERVIEW.md)** - High-level architecture (all services)
- **[System Architecture](docs/system/ARCHITECTURE.md)** - Detailed technical specs (all services)
- **[Database Schema](docs/system/DATABASE_SCHEMA.md)** - Complete database schema reference
- **[Integration Setup](docs/system/INTEGRATION_SETUP.md)** - How integrations work
- **[AI Chatbot Implementation](docs/system/AI_CHATBOT_IMPLEMENTATION.md)** - AI chatbot guide (planned feature)

### 🖥️ Main Backend Server Documentation
- **[Quick Start](docs/server/QUICKSTART.md)** - Get this server running in 5 minutes
- **[API Reference](docs/server/API_REFERENCE.md)** - All endpoints with examples
- **[Deployment Guide](docs/server/DEPLOYMENT.md)** - Deploy this server to production
- **[Architecture Compliance](docs/server/ARCHITECTURE_COMPLIANCE.md)** - Verification this server follows architecture
- **[File Structure](docs/server/FILE_STRUCTURE.md)** - Code organization

### 📚 Reference
- **[Changelog](docs/reference/CHANGELOG.md)** - Version history
- **[Implementation Summary](docs/reference/IMPLEMENTATION.md)** - What was built
- **[Documentation Index](docs/README.md)** - Complete documentation guide

---

## 🚀 Future Roadmap

### Phase 1: Complete Current Integrations (In Progress)
- ✅ Zoom integration (meetings, webinars, attendees, recordings)
- ✅ Google Sheets integration (OAuth, sync)
- ✅ Projects support
- 🔄 VAPI integration (AI phone calls)
- 🔄 GoHighLevel integration (CRM sync)

### Phase 2: Analytics Infrastructure (Planned)
- Add `project_id` to all domain tables
- Create `project_metrics` table for pre-aggregated data
- Build analytics service for nightly aggregation
- Create `activity_log` table for event tracking
- Implement trend detection and anomaly detection

### Phase 3: AI Chatbot (Planned)
- Natural language to SQL query generation
- Read-only query execution with security validation
- Workspace isolation enforcement
- Query result caching (Redis)
- Chart generation from query results
- Proactive insights and recommendations

### Phase 4: Advanced Features (Future)
- Data warehouse integration (BigQuery/Snowflake)
- Advanced ML models for predictions
- Custom integration builder
- White-label support
- Advanced reporting and dashboards

---

## 🎯 Use Case

This platform is designed for **webinar management companies** that need to:
- Manage multiple webinar campaigns across different clients
- Track attendance, engagement, and conversions
- Integrate with Zoom, VAPI, Google Sheets, and CRMs
- Provide AI-powered analytics to answer questions like:
  - "How is our Q1 campaign performing?"
  - "Which webinar had the best attendance rate?"
  - "Show me all calls made this week"
  - "What's the conversion rate for the Product Launch project?"

---

## License

Proprietary

