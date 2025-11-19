# System Architecture Overview

This document explains the core structure of our microservices system so that **all services (frontend, main backend, and microservices)** can align on how tenants, projects, and integrations work.

---

## Table of Contents

- [1. Tenancy Model](#1-tenancy-model)
- [2. Projects Inside a Workspace](#2-projects-inside-a-workspace)
- [3. Integrations Overview](#3-integrations-overview)
- [4. Service Responsibilities](#4-service-responsibilities)
- [5. Analytics & Projects](#5-analytics--projects)
- [6. AI Chatbot Architecture](#6-ai-chatbot-architecture)
- [7. Key Principles](#7-key-principles)
- [8. Future Enhancements](#8-future-enhancements)

---

## 1. Tenancy Model

### Workspace = Company / Tenant

- A **workspace** represents one company / client
- All data in the system belongs to exactly one workspace
- Table: `workspaces`
  - `id` (uuid)
  - `name`
  - `created_at`

### Users and Membership

- A **user** can belong to one or many workspaces
- Table: `users`
- Join table: `workspace_members`
  - `workspace_id`
  - `user_id`
  - `role` (e.g. `owner`, `admin`, `member`)

**Every request** in the backend/microservices context should have a resolved:
- `workspace_id`
- (optionally) `user_id`

---

## 2. Projects Inside a Workspace

We don't create one workspace per project. Instead:

- **Workspace = company**
- **Project = individual funnel / webinar / campaign inside that company**

### Projects Table

Table: `projects` (conceptual):

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | Foreign key to workspaces |
| `name` | text | Project name |
| `description` | text | Project description |
| `created_at` | timestamp | Creation time |

### Domain Tables Structure

**CRITICAL:** All domain tables MUST have both:
- `workspace_id` (uuid, required) - For multi-tenant isolation
- `project_id` (uuid, nullable) - For campaign/project-level analytics

**Examples of domain tables that need `project_id`:**
- `contacts` - Which campaign did this lead come from?
- `zoom_meetings` - Which project is this webinar part of?
- `zoom_webinars` - Which campaign is this webinar for?
- `zoom_attendees` - Track attendance per project
- `zoom_registrants` - Track registrations per project
- `vapi_calls` - Which campaign generated this call?
- `ghl_contacts` - Which project synced this contact?

**Why this is critical:**
- Enables project-level analytics ("How is Q1 campaign performing?")
- Allows AI chatbot to answer project-specific questions
- Supports workspace-wide rollups (aggregate across all projects)
- Essential for proper data organization in multi-campaign environments

**Implementation Note:** Add `project_id` to ALL domain tables before production data, or retrofitting will be painful.

---

## 3. Integrations Overview

### Supported Providers

**Current Status:**
- ✅ `zoom` - Implemented (meetings, webinars, attendees, recordings)
- ✅ `google_sheets` - Implemented (OAuth, sync)
- 🔄 `vapi` - Planned (AI phone calls)
- 🔄 `gohighlevel` - Planned (CRM integration)

**Future:**
- Calendly
- HubSpot
- Salesforce
- Custom webhooks

### Core Integration Tables

There are two core tables:

1. **`integration_accounts`** – How this workspace is connected to each provider
2. **`integration_jobs`** – What we want each provider to do

---

### 3.1 `integration_accounts` (Credentials & Config)

One row = one integration account for a given workspace and provider.

**Key Features:**
- A workspace can have **multiple accounts for the same provider** (e.g., multiple Zoom accounts)
- We can mark **one as default** per `(workspace_id, provider)`

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | Foreign key to workspaces |
| `provider` | enum | `zoom`, `vapi`, `google_sheets`, `gohighlevel` |
| `display_name` | text | User-friendly name (e.g., "Main Zoom") |
| `is_default` | boolean | Default account for this provider |
| `client_id` | text | OAuth client ID |
| `client_secret` | text | OAuth client secret |
| `account_id` | text | Provider account ID |
| `api_key` | text | API key |
| `api_secret` | text | API secret |
| `access_token` | text | OAuth access token |
| `refresh_token` | text | OAuth refresh token |
| `expires_at` | timestamp | Token expiration |
| `extra` | jsonb | Provider-specific metadata |

#### Usage Examples by Provider

**Zoom (Server-to-Server OAuth)**
- Uses: `client_id`, `client_secret`, `account_id`

**Google Sheets (OAuth)**
- Uses: `client_id`, `client_secret`, `access_token`, `refresh_token`, `expires_at`

**Go HighLevel**
- Uses: Either OAuth-style (`access_token`, etc.) or API-key style (`api_key`)

**VAPI**
- Uses: `api_key`, `api_secret` (and optionally `account_id`)

---

### 3.2 `integration_jobs` (Shared Job Queue)

All "do something with an external provider" tasks go into `integration_jobs`.

- **Producer**: Main backend (or domain services through the main backend)
- **Consumers**: Integration microservices (MCS) for each provider

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | Foreign key to workspaces |
| `provider` | enum | `zoom`, `vapi`, `google_sheets`, `gohighlevel` |
| `operation` | text | Operation name (e.g., `create_meeting`, `append_row`) |
| `integration_account_id` | uuid | Optional; if null, use default account |
| `payload` | jsonb | Operation-specific data |
| `status` | enum | `pending`, `processing`, `done`, `error` |
| `attempts` | integer | Number of retry attempts |
| `last_error` | text | Error message from last attempt |
| `run_at` | timestamp | Optional scheduled time |
| `created_at` | timestamp | Job creation time |
| `updated_at` | timestamp | Last update time |

#### Operation Examples by Provider

**Zoom:**
- `create_meeting`
- `add_registrant`
- `sync_meeting`

**VAPI:**
- `create_call`
- `sync_call_log`

**Google Sheets:**
- `append_row`
- `sync_sheet`

**Go HighLevel:**
- `upsert_contact`
- `apply_tag`
- `create_opportunity`

#### Worker Query Pattern

Each integration microservice fetches jobs using:

```sql
SELECT *
FROM integration_jobs
WHERE provider = '<provider>'          -- e.g., 'zoom', 'vapi', etc.
  AND status = 'pending'
  AND (run_at IS NULL OR run_at <= NOW())
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

**Note:** In practice, we use **Supabase Realtime subscriptions** instead of polling for better performance.

#### Job Processing Flow

Each integration microservice:

1. **Picks jobs** for its provider
2. **Resolves** `integration_account_id` (or default account for `workspace_id` + `provider`)
3. **Uses credentials** from `integration_accounts`
4. **Calls** the external API
5. **Updates** `integration_jobs.status` to `done` or `error`

---

## 4. Service Responsibilities

### 4.1 Frontend (React + Supabase)

**Authentication:**
- Uses Supabase Auth for login/signup

**Direct Supabase Access:**
Can use Supabase directly for simple CRUD:
- `workspaces` (on onboarding)
- `workspace_members`
- `leads`, `webinars`, `projects`, etc.

**Integration Management:**

For **OAuth-based providers** (Google Sheets, GHHL OAuth):
1. Frontend redirects to backend's `/api/auth/google/authorize` endpoint
2. Backend handles OAuth flow
3. Frontend reads success/failure from redirect

For **API-key style providers** (VAPI, Zoom):
1. Frontend collects credentials via forms
2. Sends to backend API endpoints
3. Backend validates and stores in `integration_accounts`

**Rule of Thumb:**
- Normal app data → Supabase directly
- Secrets & integration credentials → Backend API → stored in `integration_accounts`

---

### 4.2 Main Backend (Orchestrator / Brain)

The main backend:

**Core Responsibilities:**
- Resolves `workspace_id` (from auth/JWT/headers)
- Owns business logic and multi-step workflows
- Writes to domain tables (`leads`, `webinars`, `projects`, etc.)
- Handles OAuth flows (Google Sheets, GHHL OAuth)
- **Is the only place that creates rows in `integration_jobs`**

**Example Workflows:**

**User creates a lead:**
1. Insert into `leads` table
2. Enqueue `gohighlevel: upsert_contact` job
3. Enqueue `google_sheets: append_row` job

**User clicks "Append to Google Sheet":**
1. Validate request
2. Choose `integration_account_id`
3. Insert `integration_jobs` with:
   - `provider='google_sheets'`
   - `operation='append_row'`
   - `payload` with `spreadsheetId`, `range`, `values`

**Important:** Backend does **not** talk to Zoom/Sheets/VAPI directly; it only orchestrates and enqueues jobs.

---

### 4.3 Integration Microservices (MCS)

One MCS per provider:
- Zoom MCS
- VAPI MCS
- Google Sheets MCS
- Go HighLevel MCS
- (others in the future)

**Each integration MCS:**

1. **Subscribes** to `integration_jobs` via Supabase Realtime (filters by provider)
2. **Uses** `integration_accounts` to get credentials
3. **Calls** the external API (Zoom, Sheets, VAPI, GHHL, etc.)
4. **Updates** `integration_jobs` with success or error
5. **May write** additional synced data into domain tables (e.g., Zoom attendance, call logs)

**Key Principle:** Integration MCSs are **dumb adapters** – they do NOT contain business rules or cross-provider logic.

---

## 5. Analytics & Projects

Because we have:
- `workspace_id` on everything
- `project_id` on key domain tables

We can build analytics like:

- **Leads per project / workspace / UTM**
- **Webinar performance per project** (registrations, attendance, revenue)
- **Channel breakdown per project** (Facebook vs Google vs email, etc.)

The `projects` layer prevents analytics from becoming "one big soup" inside a workspace and allows us to see which specific webinar/funnel is performing poorly or well.

---

## 6. AI Chatbot Architecture

### Overview

The system will include an AI-powered chatbot that allows users to query their data using natural language. Users can ask questions like:
- "How many webinars did we run last month?"
- "What's the attendance rate for Q1 campaign?"
- "Show me all calls made this week"
- "Which project has the best conversion rate?"

### Architecture Pattern

The AI chatbot operates as a **separate microservice** that:
1. Receives natural language questions from the frontend
2. Generates SQL queries to answer questions
3. Executes queries against the database (read-only)
4. Formats and returns results to the user

### AI Chatbot Service Components

```
ai-chatbot-service/
├── query-engine/
│   ├── sql-generator.ts       # Convert questions to SQL using LLM
│   ├── sql-validator.ts       # Validate queries for safety
│   ├── query-executor.ts      # Execute queries with limits
│   └── result-formatter.ts    # Format results for display
├── context/
│   ├── workspace-context.ts   # Load workspace schema/data
│   ├── project-context.ts     # Load project information
│   └── conversation-context.ts # Manage chat history
├── security/
│   ├── workspace-isolation.ts # Enforce workspace_id filtering
│   ├── query-limits.ts        # Rate limiting, timeouts
│   └── sensitive-data.ts      # Block access to credentials
└── index.ts
```

### Security Model

**Critical Security Requirements:**

1. **Read-Only Database Access**
```sql
-- Create dedicated read-only user for AI
CREATE USER ai_chatbot WITH PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_chatbot;

-- Revoke access to sensitive tables
REVOKE SELECT ON integration_accounts FROM ai_chatbot;
REVOKE SELECT ON workspace_members FROM ai_chatbot;
```

2. **Workspace Isolation Enforcement**
- Every query MUST include `WHERE workspace_id = $1`
- SQL validator parses and verifies workspace_id filter
- Queries without workspace filter are rejected

3. **Query Validation**
- Only SELECT statements allowed (no INSERT, UPDATE, DELETE)
- Automatic LIMIT 1000 added if not present
- Query timeout: 5 seconds maximum
- No access to sensitive tables (integration_accounts, etc.)

4. **Database Views for Safety**
```sql
-- Create safe views that auto-filter by workspace
CREATE VIEW ai_webinars AS
SELECT id, workspace_id, project_id, topic, start_time, duration, status
FROM zoom_webinars
WHERE workspace_id = current_setting('app.current_workspace_id')::uuid;

-- AI queries views, not raw tables
```

### Query Flow

```
User: "How many webinars last month?"
  ↓
Frontend → AI Chatbot Service
  ↓
1. Load workspace context (schema, projects)
  ↓
2. Generate SQL using LLM
   SELECT COUNT(*) FROM zoom_webinars 
   WHERE workspace_id = $1 
   AND start_time >= '2024-10-01' 
   AND start_time < '2024-11-01'
  ↓
3. Validate SQL (workspace_id present, no sensitive tables)
  ↓
4. Execute query (read-only user, 5s timeout, LIMIT 1000)
  ↓
5. Format results
  ↓
Frontend ← "You ran 42 webinars last month"
```

### Performance Optimization

**Hybrid Approach:**

1. **Tier 1: Pre-Computed Metrics** (Fast)
   - Common questions use pre-aggregated `project_metrics` table
   - Cached for 1 hour
   - Examples: total webinars, average attendance, revenue

2. **Tier 2: AI-Generated SQL** (Flexible)
   - Complex questions generate SQL on-the-fly
   - Validated and executed with safety limits
   - Results cached for 5 minutes

3. **Tier 3: Analytics Service** (Batch)
   - Nightly aggregation of metrics
   - Trend detection and anomaly detection
   - Pre-computed insights

### Required Database Tables

**For AI Chatbot to function, these tables are needed:**

1. **Chat History**
```sql
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  project_id UUID, -- Optional: chat about specific project
  title TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES chat_conversations(id),
  role TEXT, -- 'user' or 'assistant'
  content TEXT,
  metadata JSONB, -- Store SQL queries used, execution time, etc.
  created_at TIMESTAMP
);
```

2. **Project Metrics** (Optional but recommended)
```sql
CREATE TABLE project_metrics (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  workspace_id UUID NOT NULL,
  date DATE NOT NULL,
  
  -- Webinar metrics
  webinars_scheduled INTEGER DEFAULT 0,
  webinars_completed INTEGER DEFAULT 0,
  total_registrants INTEGER DEFAULT 0,
  total_attendees INTEGER DEFAULT 0,
  attendance_rate DECIMAL,
  
  -- Call metrics (when VAPI implemented)
  calls_made INTEGER DEFAULT 0,
  calls_answered INTEGER DEFAULT 0,
  avg_call_duration INTEGER,
  
  -- Engagement
  avg_watch_time INTEGER,
  questions_asked INTEGER,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  UNIQUE(project_id, date)
);
```

3. **Activity Log** (Optional but recommended)
```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  project_id UUID,
  user_id UUID,
  
  event_type TEXT, -- 'webinar_created', 'attendee_joined', 'call_completed'
  entity_type TEXT, -- 'webinar', 'call', 'contact'
  entity_id UUID,
  
  description TEXT,
  metadata JSONB,
  
  created_at TIMESTAMP
);

CREATE INDEX idx_activity_log_project ON activity_log(project_id, created_at DESC);
```

### Implementation Phases

**Phase 1: Foundation** (Before AI)
- ✅ Add `project_id` to all domain tables
- ✅ Create projects table (done)
- 🔄 Add VAPI tables (when implementing VAPI)
- 🔄 Add GoHighLevel tables (when implementing GHL)

**Phase 2: Analytics Infrastructure**
- Create `project_metrics` table
- Build analytics service for nightly aggregation
- Create `activity_log` table
- Add database views for AI safety

**Phase 3: AI Chatbot Service**
- Build AI chatbot microservice
- Implement SQL generation with LLM
- Add SQL validation and safety checks
- Create read-only database user
- Build chat UI in frontend

**Phase 4: Advanced Features**
- Add caching layer (Redis)
- Implement proactive insights
- Add chart generation
- Trend detection and anomaly alerts

### Cost Considerations

**LLM API Costs:**
- Each question: ~3-5 LLM calls (understand → generate → format)
- Cost per question: ~$0.02-0.05
- 100 questions/day = $2-5/day = $60-150/month per active user

**Optimization Strategies:**
- Cache common queries (reduce LLM calls)
- Use pre-computed metrics for common questions
- Implement query result caching
- Use cheaper models for simple questions

---

## 7. Key Principles

### 1. Workspace = Tenant / Company
- Projects live inside a workspace, not as separate tenants

### 2. One Shared Integration Jobs Queue
- Different microservices are separated by `provider` field

### 3. Multi-Account Capable
- A workspace can have multiple `integration_accounts` for one provider
- `is_default` gives a fallback when no specific `integration_account_id` is provided

### 4. Backend is Source of Truth for Secrets & Workflows
- Frontend never calls external providers directly
- Frontend never writes third-party credentials directly with anon Supabase in a way that bypasses backend logic

### 5. Integration MCSs are Adapters, Not Brains
- All business logic and orchestration lives in the main backend
- Microservices only execute jobs, no decision-making

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    (React + Supabase)                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ API Calls (JWT Auth)
                 │
┌────────────────▼────────────────────────────────────────────┐
│                     Main Backend                             │
│                  (Orchestrator/Brain)                        │
│                                                              │
│  • Business Logic                                            │
│  • OAuth Flows                                               │
│  • Creates Integration Jobs                                  │
│  • Webhook Handlers                                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Writes Jobs
                 │
┌────────────────▼────────────────────────────────────────────┐
│                  Supabase PostgreSQL                         │
│                                                              │
│  • workspaces, users, workspace_members                      │
│  • integration_accounts (credentials)                        │
│  • integration_jobs (job queue)                              │
│  • Domain tables (leads, webinars, etc.)                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Realtime Subscriptions
                 │
    ┌────────────┼────────────┬────────────┬────────────┐
    │            │            │            │            │
┌───▼───┐   ┌───▼───┐   ┌───▼───┐   ┌───▼───┐   ┌───▼───┐
│ Zoom  │   │ VAPI  │   │Google │   │  GHL  │   │ More  │
│  MCS  │   │  MCS  │   │Sheets │   │  MCS  │   │  ...  │
│       │   │       │   │  MCS  │   │       │   │       │
└───┬───┘   └───┬───┘   └───┬───┘   └───┬───┘   └───┬───┘
    │           │           │           │           │
    └───────────┴───────────┴───────────┴───────────┘
                         │
                         │ API Calls
                         │
            ┌────────────▼────────────┐
            │   External Services     │
            │  • Zoom API             │
            │  • VAPI API             │
            │  • Google Sheets API    │
            │  • GoHighLevel API      │
            └─────────────────────────┘
```

---

## Quick Reference

### For Frontend Developers
- Use Supabase Auth for authentication
- Use Supabase client for domain data (leads, webinars, etc.)
- Call main backend API for integration setup and job creation
- Always include `workspace_id` in requests

### For Backend Developers
- Validate `workspace_id` on every request
- Create jobs in `integration_jobs`, don't call external APIs directly
- Handle OAuth flows for Google Sheets and GoHighLevel
- Provide endpoints for API key storage (Zoom, VAPI)

### For Microservice Developers
- Subscribe to `integration_jobs` filtered by your provider
- Fetch credentials from `integration_accounts`
- Execute the job, update status
- No business logic – just execute what the job says

---

---

## 8. Future Enhancements

### Missing Tables (To Be Implemented)

**VAPI Tables** (Priority: High)
```sql
-- VAPI calls
CREATE TABLE vapi_calls (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id UUID REFERENCES projects(id),
  call_id TEXT UNIQUE,
  phone_number TEXT,
  assistant_id TEXT,
  status TEXT, -- 'initiated', 'ringing', 'in_progress', 'completed', 'failed'
  duration INTEGER, -- seconds
  recording_url TEXT,
  transcript TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- VAPI call analytics
CREATE TABLE vapi_call_analytics (
  id UUID PRIMARY KEY,
  call_id UUID REFERENCES vapi_calls(id),
  workspace_id UUID NOT NULL,
  sentiment_score DECIMAL,
  keywords JSONB,
  action_items JSONB,
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**GoHighLevel Tables** (Priority: High)
```sql
-- GHL contacts sync
CREATE TABLE ghl_contacts (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id UUID REFERENCES projects(id),
  ghl_contact_id TEXT UNIQUE,
  contact_id UUID REFERENCES contacts(id), -- Link to our contacts table
  email TEXT,
  phone TEXT,
  tags JSONB,
  custom_fields JSONB,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- GHL opportunities/pipeline
CREATE TABLE ghl_opportunities (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id UUID REFERENCES projects(id),
  ghl_opportunity_id TEXT UNIQUE,
  contact_id UUID REFERENCES contacts(id),
  pipeline_id TEXT,
  pipeline_stage TEXT,
  value DECIMAL,
  status TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Planned Features

**1. Analytics Service** (Priority: High)
- Nightly aggregation of metrics into `project_metrics`
- Trend detection (attendance dropping, engagement increasing)
- Anomaly detection (unusual patterns)
- Automated insights generation

**2. AI Chatbot Service** (Priority: Medium)
- Natural language to SQL conversion
- Read-only query execution
- Chart generation from data
- Proactive insights and recommendations

**3. Caching Layer** (Priority: Medium)
- Redis for query result caching
- Cache common metrics (1 hour TTL)
- Cache AI responses (5 minute TTL)
- Reduce database load and LLM costs

**4. Data Warehouse** (Priority: Low - Future)
- ETL pipeline from Supabase to BigQuery/Snowflake
- Historical data analysis
- ML model training
- Complex analytics without impacting operational DB

**5. Additional Integrations** (Priority: Low)
- Calendly (scheduling)
- HubSpot (CRM)
- Salesforce (enterprise CRM)
- Stripe (payments)
- Custom webhooks

### Scaling Considerations

**Current Architecture Handles:**
- ✅ 100-500 workspaces
- ✅ 1,000 webinars/month
- ✅ 10,000 attendees/month
- ✅ 100 concurrent users

**For Larger Scale, Add:**
- Database read replicas (for analytics queries)
- Connection pooling (PgBouncer)
- CDN for static assets
- Load balancer for multiple backend instances
- Message queue (RabbitMQ/SQS) instead of Supabase Realtime
- Separate analytics database

---

## Related Documentation

- [Main README](../README.md) - Getting started guide
- [Integration Setup Guide](INTEGRATION_SETUP.md) - How to set up each provider
- [System Overview](OVERVIEW.md) - High-level system overview

