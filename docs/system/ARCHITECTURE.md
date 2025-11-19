# System Architecture Overview

This document explains the core structure of our microservices system so that **all services (frontend, main backend, and microservices)** can align on how tenants, projects, and integrations work.

---

## Table of Contents

- [1. Tenancy Model](#1-tenancy-model)
- [2. Projects Inside a Workspace](#2-projects-inside-a-workspace)
- [3. Integrations Overview](#3-integrations-overview)
- [4. Service Responsibilities](#4-service-responsibilities)
- [5. Analytics & Projects](#5-analytics--projects)
- [6. Key Principles](#6-key-principles)

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

Key domain tables (like `leads`, `webinars`, `webinar_registrations`, etc.) should have:
- `workspace_id` (required)
- `project_id` (nullable if needed)

This allows analytics like:
- Performance **per project** (per webinar/funnel)
- Performance **per workspace** (aggregate across projects)

---

## 3. Integrations Overview

### Supported Providers

We support multiple integration providers:
- `zoom`
- `vapi`
- `google_sheets`
- `gohighlevel`
- (more in the future)

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

## 6. Key Principles

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

## Related Documentation

- [Main README](../README.md) - Getting started guide
- [Integration Setup Guide](INTEGRATION_SETUP.md) - How to set up each provider
- [API Examples](API_EXAMPLES.md) - API usage examples

