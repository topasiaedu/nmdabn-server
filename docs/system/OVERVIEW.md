# System Overview

A high-level overview of the NMDABN microservices architecture.

---

## Architecture Components

We have:

### Main Backend (Orchestrator / Brain)
- Exposes all public APIs for frontend
- Handles authentication, workspace scoping, and business logic
- Creates integration jobs for microservices
- Manages webhooks from external providers
- (Later) Runs AI/analytics flows

### Integration Microservices (MCS)

One microservice for each provider:
- **Zoom MCS**
- **VAPI MCS**
- **Google Sheets MCS**
- **GoHighLevel MCS**

Each integration MCS only talks to its external provider and executes jobs.

### Supabase Postgres DB

Shared database for everything:
- Multi-tenant data (workspaces, users)
- Integration credentials and jobs
- Domain data (leads, webinars, contacts, etc.)

---

## Core Database Schema

### 1. Tenancy

**`workspaces`**
- One row per customer/account
- Columns: `id`, `name`, `created_at`

**`users`**
- One row per user
- Columns: `id`, `email`, `full_name`, `created_at`

**`workspace_members`**
- Join table for which users belong to which workspaces
- Columns: `id`, `workspace_id`, `user_id`, `role`, `created_at`

These give us `workspace_id` everywhere to keep things multi-tenant.

---

### 2. Integrations: `integration_accounts`

**Table:** `integration_accounts`

One row = one connected integration account for a specific workspace.

**Columns:**

| Column | Description |
|--------|-------------|
| `workspace_id` | Who owns this integration |
| `provider` | Enum: `zoom`, `vapi`, `google_sheets`, `gohighlevel` |
| `display_name` | For UI (e.g., "Main Zoom", "Sales GHHL") |
| `is_default` | At most one default per (workspace_id, provider) |

**Generic credential fields:**
- `client_id`
- `client_secret`
- `account_id` (Zoom account_id, etc.)
- `api_key`
- `api_secret`
- `access_token`
- `refresh_token`
- `expires_at`
- `extra` (jsonb) – provider-specific metadata

**Design intent:**

| Provider | Credentials Used |
|----------|------------------|
| **Zoom** (Server-to-Server OAuth) | `client_id`, `client_secret`, `account_id` |
| **Google Sheets** (OAuth) | `client_id`, `client_secret`, `access_token`, `refresh_token`, `expires_at` |
| **Go HighLevel** | OAuth-style tokens OR `api_key` / `api_secret` |
| **VAPI** | `api_key` / `api_secret` and optionally `account_id` |

Multiple accounts per provider per workspace are allowed; `is_default` gives a fallback if no specific account is chosen.

---

### 3. Integration Jobs: `integration_jobs`

**Table:** `integration_jobs`

This is the shared job queue for all integration microservices.

**Columns:**

| Column | Description |
|--------|-------------|
| `workspace_id` | Which workspace this job belongs to |
| `provider` | `zoom`, `vapi`, `google_sheets`, `gohighlevel` |
| `operation` | String like: `create_meeting`, `append_row`, `upsert_contact` |
| `integration_account_id` | Optional pointer to specific integration_accounts row |
| `payload` | (jsonb) Operation-specific data (arguments) |
| `status` | Enum: `pending`, `processing`, `done`, `error` |
| `attempts` | Number of retry attempts |
| `last_error` | Error message from last attempt |
| `run_at` | Optional scheduled time |
| `created_at`, `updated_at` | Timestamps |

**Operation Examples:**

| Provider | Operations |
|----------|------------|
| **Zoom** | `create_meeting`, `add_registrant`, `sync_meeting` |
| **VAPI** | `create_call`, `sync_call_log` |
| **Google Sheets** | `append_row`, `sync_sheet` |
| **Go HighLevel** | `upsert_contact`, `apply_tag`, `create_opportunity` |

**Worker Query Pattern (for an MCS):**

Each integration microservice subscribes to jobs via Supabase Realtime:

```sql
SELECT *
FROM public.integration_jobs
WHERE provider = 'zoom'          -- or 'vapi', 'google_sheets', 'gohighlevel'
  AND status = 'pending'
  AND (run_at IS NULL OR run_at <= NOW())
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

**The microservice then:**

1. Picks a job
2. Loads the `integration_accounts` row (either via `integration_account_id` or by default account for that provider+workspace)
3. Uses the stored credentials to call the external provider API
4. Marks the job as `done` or `error` and increments `attempts`

---

## Responsibilities

### Main Backend

**Exposes all public APIs** (for the frontend / chat UI)

**Handles:**
- Auth
- Workspace scoping
- Business logic

**Creates rows in `integration_jobs`** whenever something external needs to happen:

| Event | Jobs Created |
|-------|--------------|
| New lead created | → enqueue `gohighlevel: upsert_contact` |
| Webinar registration | → enqueue `zoom: add_registrant` |
| Data export | → enqueue `google_sheets: append_row` |
| Outbound call | → enqueue `vapi: create_call` |

**Manages webhooks** from external tools (GoHighLevel, Zoom, VAPI):
1. Webhook → main backend endpoint
2. Normalizes payload
3. Writes/updates domain tables (like leads, webinars, calls)
4. Optionally enqueues integration jobs

**Later, the main backend also runs AI/analytics flows:**
- Uses SQL to query analytics tables
- Might generate ChartSpec for frontend charts
- Returns insights via chat interface

---

### Integration Microservices (Zoom / VAPI / Google Sheets / GHL)

Each MCS is responsible for a single provider.

**They subscribe to `integration_jobs` for their provider via Supabase Realtime.**

**For each job:**

1. Read `integration_accounts` for credentials
2. Call the external API
3. Write back the result (update job status, maybe sync domain tables if needed)

**They do no business logic**, just "given job X → call provider Y".

---

## Data Flow Example

### Example: User Creates a Lead and Exports to Google Sheets

```
┌──────────┐
│ Frontend │
└────┬─────┘
     │ 1. POST /api/leads (with workspace_id)
     │
┌────▼──────────┐
│ Main Backend  │
└────┬──────────┘
     │ 2. Insert into leads table
     │ 3. Create integration_jobs:
     │    - provider: google_sheets
     │    - operation: append_row
     │    - payload: { spreadsheetId, values }
     │
┌────▼─────────────┐
│ Supabase DB      │
│ integration_jobs │
└────┬─────────────┘
     │ 4. Realtime notification
     │
┌────▼──────────────┐
│ Google Sheets MCS │
└────┬──────────────┘
     │ 5. Fetch credentials from integration_accounts
     │ 6. Call Google Sheets API
     │ 7. Update job status to 'done'
     │
┌────▼─────────────┐
│ Google Sheets    │
│ (External API)   │
└──────────────────┘
```

---

## Key Principles

### 1. Separation of Concerns
- **Main Backend**: Business logic, orchestration
- **Microservices**: External API calls only
- **Frontend**: UI, user interactions

### 2. Multi-Tenancy
- Every piece of data belongs to a `workspace_id`
- Users can belong to multiple workspaces
- All queries are scoped by workspace

### 3. Job Queue Pattern
- Main backend creates jobs
- Microservices consume jobs
- Asynchronous, scalable, reliable

### 4. Credential Security
- All credentials stored in `integration_accounts`
- Never exposed to frontend
- Encrypted at rest in Supabase

### 5. Provider Agnostic
- Easy to add new providers
- Same pattern for all integrations
- Microservices are interchangeable

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| **Main Backend** | Node.js + TypeScript + Express |
| **Microservices** | Node.js + TypeScript (or any language) |
| **Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth (JWT) |
| **Job Queue** | Supabase Realtime subscriptions |
| **Frontend** | React + Supabase client |

---

## Next Steps

- **For Developers**: See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical specs
- **For Setup**: See [INTEGRATION_SETUP.md](INTEGRATION_SETUP.md) for integration guides
- **For API Usage**: See [API_EXAMPLES.md](API_EXAMPLES.md) for code examples
- **For Deployment**: See [DEPLOYMENT.md](DEPLOYMENT.md) for production setup

---

## Questions?

This is a living document. If you have questions or suggestions:
1. Check the detailed [ARCHITECTURE.md](ARCHITECTURE.md)
2. Review the [README.md](../README.md)
3. Ask in the team chat

