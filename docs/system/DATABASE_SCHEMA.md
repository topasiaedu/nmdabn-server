# Database Schema Reference

Complete database schema for the NMDABN system. This schema is shared across all services (frontend, main backend, and microservices).

---

## Table of Contents

- [Core Tables](#core-tables)
- [Integration Tables](#integration-tables)
- [Zoom Tables](#zoom-tables)
- [VAPI Tables (Planned)](#vapi-tables-planned)
- [GoHighLevel Tables (Planned)](#gohighlevel-tables-planned)
- [Analytics Tables (Planned)](#analytics-tables-planned)
- [AI Chatbot Tables (Planned)](#ai-chatbot-tables-planned)
- [Indexes](#indexes)
- [Enums](#enums)

---

## Core Tables

### `workspaces`

Represents a tenant/company in the multi-tenant system.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique workspace identifier |
| `name` | TEXT | NOT NULL | Workspace name |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- Primary key on `id`

---

### `users`

User accounts (managed by Supabase Auth).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | User identifier (from Supabase Auth) |
| `email` | TEXT | NOT NULL | User email |
| `full_name` | TEXT | NULL | User's full name |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |

**Indexes:**
- Primary key on `id`
- Unique index on `email`

---

### `workspace_members`

Many-to-many relationship between users and workspaces.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Membership identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `user_id` | UUID | FK → users(id) | User reference |
| `role` | TEXT | DEFAULT 'member' | User role (owner, admin, member) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Membership creation timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `user_id`
- Unique constraint on `(workspace_id, user_id)`

---

### `projects`

Projects/campaigns within a workspace.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Project identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `name` | TEXT | NOT NULL | Project name |
| `description` | TEXT | NULL | Project description |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `created_at DESC`

**RLS Policies:**
- Users can only access projects in their workspaces

---

### `contacts`

Contact/lead management.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Contact identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | **⚠️ TODO: Add this column** |
| `email` | TEXT | NOT NULL | Contact email |
| `first_name` | TEXT | NULL | First name |
| `last_name` | TEXT | NULL | Last name |
| `phone` | TEXT | NULL | Phone number |
| `company` | TEXT | NULL | Company name |
| `job_title` | TEXT | NULL | Job title |
| `address` | TEXT | NULL | Street address |
| `city` | TEXT | NULL | City |
| `state` | TEXT | NULL | State/province |
| `zip` | TEXT | NULL | Postal code |
| `country` | TEXT | NULL | Country |
| `timezone` | TEXT | NULL | Timezone |
| `industry` | TEXT | NULL | Industry |
| `metadata` | JSONB | NULL | Additional custom fields |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `email`
- **TODO:** Index on `project_id`

---

## Integration Tables

### `integration_accounts`

Stores credentials for external integrations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Account identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `provider` | ENUM | NOT NULL | Provider (zoom, vapi, google_sheets, gohighlevel) |
| `display_name` | TEXT | NULL | User-friendly name |
| `is_default` | BOOLEAN | DEFAULT false | Default account for this provider |
| `client_id` | TEXT | NULL | OAuth client ID |
| `client_secret` | TEXT | NULL | OAuth client secret |
| `account_id` | TEXT | NULL | Provider account ID |
| `api_key` | TEXT | NULL | API key |
| `api_secret` | TEXT | NULL | API secret |
| `access_token` | TEXT | NULL | OAuth access token |
| `refresh_token` | TEXT | NULL | OAuth refresh token |
| `expires_at` | TIMESTAMP | NULL | Token expiration |
| `extra` | JSONB | NULL | Provider-specific metadata |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `(workspace_id, provider)`
- Index on `(workspace_id, provider, is_default)`

**Security:**
- ⚠️ Sensitive table - should NOT be accessible to AI chatbot
- Backend service role only

---

### `integration_jobs`

Job queue for integration microservices.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Job identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `provider` | ENUM | NOT NULL | Provider (zoom, vapi, google_sheets, gohighlevel) |
| `operation` | TEXT | NOT NULL | Operation name (e.g., create_meeting, append_row) |
| `integration_account_id` | UUID | FK → integration_accounts(id) | Account to use |
| `payload` | JSONB | NOT NULL | Operation-specific data |
| `status` | ENUM | DEFAULT 'pending' | Job status (pending, processing, done, error) |
| `attempts` | INTEGER | DEFAULT 0 | Number of retry attempts |
| `last_error` | TEXT | NULL | Error message from last attempt |
| `run_at` | TIMESTAMP | NULL | Scheduled execution time |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `(provider, status, run_at)` for job queue queries
- Index on `workspace_id`
- Index on `created_at DESC`

---

### `google_sheets_syncs`

Configuration for Google Sheets sync operations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Sync configuration identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `integration_account_id` | UUID | FK → integration_accounts(id) | Google account to use |
| `spreadsheet_id` | TEXT | NOT NULL | Google Sheets spreadsheet ID |
| `sheet_name` | TEXT | NULL | Specific sheet name |
| `sync_type` | TEXT | NOT NULL | Sync type (import, export, bidirectional) |
| `mapping_config` | JSONB | NULL | Column mapping configuration |
| `is_active` | BOOLEAN | DEFAULT true | Whether sync is active |
| `last_synced_at` | TIMESTAMP | NULL | Last successful sync |
| `sync_error` | TEXT | NULL | Last sync error |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `(workspace_id, is_active)`

---

## Zoom Tables

### `zoom_meetings`

Zoom meetings data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | **⚠️ TODO: Add this column** |
| `integration_account_id` | UUID | FK → integration_accounts(id) | Zoom account used |
| `meeting_id` | TEXT | NOT NULL, UNIQUE | Zoom meeting ID |
| `uuid` | TEXT | NULL | Zoom meeting UUID |
| `topic` | TEXT | NULL | Meeting topic |
| `type` | INTEGER | NULL | Meeting type |
| `start_time` | TIMESTAMP | NULL | Scheduled start time |
| `duration` | INTEGER | NULL | Duration in minutes |
| `timezone` | TEXT | NULL | Timezone |
| `host_id` | TEXT | NULL | Zoom host ID |
| `host_email` | TEXT | NULL | Host email |
| `status` | TEXT | NULL | Meeting status |
| `start_url` | TEXT | NULL | Host start URL |
| `join_url` | TEXT | NULL | Participant join URL |
| `settings` | JSONB | NULL | Meeting settings |
| `is_synced` | BOOLEAN | DEFAULT false | Whether fully synced |
| `last_synced_at` | TIMESTAMP | NULL | Last sync timestamp |
| `sync_error` | TEXT | NULL | Last sync error |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Unique index on `meeting_id`
- Index on `workspace_id`
- **TODO:** Index on `project_id`
- Index on `start_time`

---

### `zoom_webinars`

Zoom webinars data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | **⚠️ TODO: Add this column** |
| `integration_account_id` | UUID | FK → integration_accounts(id) | Zoom account used |
| `webinar_id` | TEXT | NOT NULL, UNIQUE | Zoom webinar ID |
| `uuid` | TEXT | NULL | Zoom webinar UUID |
| `topic` | TEXT | NULL | Webinar topic |
| `type` | INTEGER | NULL | Webinar type |
| `start_time` | TIMESTAMP | NULL | Scheduled start time |
| `duration` | INTEGER | NULL | Duration in minutes |
| `timezone` | TEXT | NULL | Timezone |
| `host_id` | TEXT | NULL | Zoom host ID |
| `host_email` | TEXT | NULL | Host email |
| `status` | TEXT | NULL | Webinar status |
| `join_url` | TEXT | NULL | Join URL |
| `registration_url` | TEXT | NULL | Registration URL |
| `approval_type` | INTEGER | NULL | Registration approval type |
| `settings` | JSONB | NULL | Webinar settings |
| `is_synced` | BOOLEAN | DEFAULT false | Whether fully synced |
| `last_synced_at` | TIMESTAMP | NULL | Last sync timestamp |
| `sync_error` | TEXT | NULL | Last sync error |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Unique index on `webinar_id`
- Index on `workspace_id`
- **TODO:** Index on `project_id`
- Index on `start_time`

---

### `zoom_attendees`

Zoom meeting/webinar attendees.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `meeting_id` | UUID | FK → zoom_meetings(id) | Meeting reference (if meeting) |
| `webinar_id` | UUID | FK → zoom_webinars(id) | Webinar reference (if webinar) |
| `contact_id` | UUID | FK → contacts(id) | Linked contact |
| `participant_id` | TEXT | NULL | Zoom participant ID |
| `attendee_type` | TEXT | NOT NULL | Type (meeting or webinar) |
| `name` | TEXT | NULL | Attendee name |
| `email` | TEXT | NULL | Attendee email |
| `user_id` | TEXT | NULL | Zoom user ID |
| `user_role` | TEXT | NULL | User role in meeting |
| `join_time` | TIMESTAMP | NULL | Join timestamp |
| `leave_time` | TIMESTAMP | NULL | Leave timestamp |
| `duration` | INTEGER | NULL | Duration in seconds |
| `attentiveness_score` | DECIMAL | NULL | Attentiveness score |
| `device` | TEXT | NULL | Device type |
| `ip_address` | TEXT | NULL | IP address |
| `location` | TEXT | NULL | Geographic location |
| `network_type` | TEXT | NULL | Network type |
| `metadata` | JSONB | NULL | Additional metadata |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `meeting_id`
- Index on `webinar_id`
- Index on `contact_id`
- Index on `email`

---

### `zoom_registrants`

Zoom meeting/webinar registrants.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `meeting_id` | UUID | FK → zoom_meetings(id) | Meeting reference (if meeting) |
| `webinar_id` | UUID | FK → zoom_webinars(id) | Webinar reference (if webinar) |
| `contact_id` | UUID | FK → contacts(id) | Linked contact |
| `registrant_id` | TEXT | NULL | Zoom registrant ID |
| `registrant_type` | TEXT | NOT NULL | Type (meeting or webinar) |
| `email` | TEXT | NOT NULL | Registrant email |
| `first_name` | TEXT | NULL | First name |
| `last_name` | TEXT | NULL | Last name |
| `address` | TEXT | NULL | Address |
| `city` | TEXT | NULL | City |
| `state` | TEXT | NULL | State |
| `zip` | TEXT | NULL | Zip code |
| `country` | TEXT | NULL | Country |
| `phone` | TEXT | NULL | Phone number |
| `industry` | TEXT | NULL | Industry |
| `org` | TEXT | NULL | Organization |
| `job_title` | TEXT | NULL | Job title |
| `custom_questions` | JSONB | NULL | Custom question responses |
| `registration_time` | TIMESTAMP | NULL | Registration timestamp |
| `join_url` | TEXT | NULL | Unique join URL |
| `status` | TEXT | NULL | Registration status |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `meeting_id`
- Index on `webinar_id`
- Index on `contact_id`
- Index on `email`

---

### `zoom_recordings`

Zoom meeting/webinar recordings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `meeting_id` | UUID | FK → zoom_meetings(id) | Meeting reference (if meeting) |
| `webinar_id` | UUID | FK → zoom_webinars(id) | Webinar reference (if webinar) |
| `recording_id` | TEXT | NULL | Zoom recording ID |
| `uuid` | TEXT | NULL | Zoom recording UUID |
| `recording_type` | TEXT | NOT NULL | Recording type |
| `recording_type_detail` | TEXT | NULL | Recording type detail |
| `file_type` | TEXT | NULL | File type (MP4, M4A, etc.) |
| `file_extension` | TEXT | NULL | File extension |
| `file_size` | BIGINT | NULL | File size in bytes |
| `play_url` | TEXT | NULL | Play URL |
| `download_url` | TEXT | NULL | Download URL |
| `recording_start` | TIMESTAMP | NULL | Recording start time |
| `recording_end` | TIMESTAMP | NULL | Recording end time |
| `status` | TEXT | NULL | Recording status |
| `metadata` | JSONB | NULL | Additional metadata |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `meeting_id`
- Index on `webinar_id`

---

### `zoom_transcriptions`

Zoom meeting/webinar transcriptions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `meeting_id` | UUID | FK → zoom_meetings(id) | Meeting reference (if meeting) |
| `webinar_id` | UUID | FK → zoom_webinars(id) | Webinar reference (if webinar) |
| `transcription_type` | TEXT | NOT NULL | Transcription type |
| `transcript_url` | TEXT | NULL | Transcript file URL |
| `transcript_text` | TEXT | NULL | Full transcript text |
| `structured_transcript` | JSONB | NULL | Structured transcript with timestamps |
| `language` | TEXT | NULL | Transcript language |
| `status` | TEXT | NULL | Transcription status |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `meeting_id`
- Index on `webinar_id`

---

### `zoom_analytics_metadata`

Additional analytics metadata for Zoom meetings/webinars.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `meeting_id` | UUID | FK → zoom_meetings(id) | Meeting reference (if meeting) |
| `webinar_id` | UUID | FK → zoom_webinars(id) | Webinar reference (if webinar) |
| `metadata_type` | TEXT | NOT NULL | Type of metadata |
| `data_type` | TEXT | NOT NULL | Data type |
| `data` | JSONB | NOT NULL | Metadata content |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `meeting_id`
- Index on `webinar_id`
- Index on `metadata_type`

---

## VAPI Tables (Planned)

### `vapi_calls`

VAPI phone calls data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | Project reference |
| `integration_account_id` | UUID | FK → integration_accounts(id) | VAPI account used |
| `call_id` | TEXT | UNIQUE | VAPI call ID |
| `phone_number` | TEXT | NOT NULL | Phone number called |
| `assistant_id` | TEXT | NULL | VAPI assistant ID used |
| `status` | TEXT | NULL | Call status (initiated, ringing, in_progress, completed, failed) |
| `duration` | INTEGER | NULL | Call duration in seconds |
| `recording_url` | TEXT | NULL | Call recording URL |
| `transcript` | TEXT | NULL | Call transcript |
| `metadata` | JSONB | NULL | Additional metadata |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Unique index on `call_id`
- Index on `workspace_id`
- Index on `project_id`
- Index on `created_at DESC`

---

### `vapi_call_analytics`

Analytics for VAPI calls.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `call_id` | UUID | FK → vapi_calls(id) | Call reference |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `sentiment_score` | DECIMAL | NULL | Sentiment analysis score |
| `keywords` | JSONB | NULL | Extracted keywords |
| `action_items` | JSONB | NULL | Extracted action items |
| `summary` | TEXT | NULL | Call summary |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- Primary key on `id`
- Index on `call_id`
- Index on `workspace_id`

---

## GoHighLevel Tables (Planned)

### `ghl_contacts`

GoHighLevel contacts sync.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | Project reference |
| `integration_account_id` | UUID | FK → integration_accounts(id) | GHL account used |
| `ghl_contact_id` | TEXT | UNIQUE | GoHighLevel contact ID |
| `contact_id` | UUID | FK → contacts(id) | Linked internal contact |
| `email` | TEXT | NULL | Contact email |
| `phone` | TEXT | NULL | Contact phone |
| `tags` | JSONB | NULL | Contact tags |
| `custom_fields` | JSONB | NULL | Custom field values |
| `last_synced_at` | TIMESTAMP | NULL | Last sync timestamp |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Unique index on `ghl_contact_id`
- Index on `workspace_id`
- Index on `project_id`
- Index on `contact_id`

---

### `ghl_opportunities`

GoHighLevel opportunities/pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | Project reference |
| `integration_account_id` | UUID | FK → integration_accounts(id) | GHL account used |
| `ghl_opportunity_id` | TEXT | UNIQUE | GoHighLevel opportunity ID |
| `contact_id` | UUID | FK → contacts(id) | Linked contact |
| `pipeline_id` | TEXT | NULL | Pipeline ID |
| `pipeline_stage` | TEXT | NULL | Current pipeline stage |
| `value` | DECIMAL | NULL | Opportunity value |
| `status` | TEXT | NULL | Opportunity status |
| `metadata` | JSONB | NULL | Additional metadata |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Unique index on `ghl_opportunity_id`
- Index on `workspace_id`
- Index on `project_id`
- Index on `contact_id`

---

## Analytics Tables (Planned)

### `project_metrics`

Pre-aggregated metrics per project per day.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `project_id` | UUID | FK → projects(id) | Project reference |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `date` | DATE | NOT NULL | Metric date |
| `webinars_scheduled` | INTEGER | DEFAULT 0 | Webinars scheduled |
| `webinars_completed` | INTEGER | DEFAULT 0 | Webinars completed |
| `total_registrants` | INTEGER | DEFAULT 0 | Total registrations |
| `total_attendees` | INTEGER | DEFAULT 0 | Total attendees |
| `attendance_rate` | DECIMAL | NULL | Attendance rate (%) |
| `calls_made` | INTEGER | DEFAULT 0 | Calls made (VAPI) |
| `calls_answered` | INTEGER | DEFAULT 0 | Calls answered |
| `avg_call_duration` | INTEGER | NULL | Average call duration (seconds) |
| `avg_watch_time` | INTEGER | NULL | Average watch time (seconds) |
| `questions_asked` | INTEGER | DEFAULT 0 | Questions asked in webinars |
| `revenue_generated` | DECIMAL | NULL | Revenue generated |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Unique constraint on `(project_id, date)`
- Index on `workspace_id`
- Index on `date DESC`

---

### `activity_log`

Event/activity log for timeline views.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Internal identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | Project reference (optional) |
| `user_id` | UUID | FK → users(id) | User who triggered event (optional) |
| `event_type` | TEXT | NOT NULL | Event type (webinar_created, attendee_joined, etc.) |
| `entity_type` | TEXT | NOT NULL | Entity type (webinar, call, contact, etc.) |
| `entity_id` | UUID | NULL | Entity identifier |
| `description` | TEXT | NULL | Human-readable description |
| `metadata` | JSONB | NULL | Additional event data |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Event timestamp |

**Indexes:**
- Primary key on `id`
- Index on `workspace_id`
- Index on `(project_id, created_at DESC)`
- Index on `event_type`
- Index on `created_at DESC`

---

## AI Chatbot Tables (Planned)

### `chat_conversations`

AI chatbot conversation sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Conversation identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `user_id` | UUID | FK → users(id) | User reference |
| `project_id` | UUID | FK → projects(id) | Project context (optional) |
| `title` | TEXT | NULL | Conversation title |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- Primary key on `id`
- Index on `(workspace_id, user_id, created_at DESC)`
- Index on `project_id`

---

### `chat_messages`

Individual messages in AI chatbot conversations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Message identifier |
| `conversation_id` | UUID | FK → chat_conversations(id) | Conversation reference |
| `role` | TEXT | NOT NULL | Message role (user or assistant) |
| `content` | TEXT | NOT NULL | Message content |
| `metadata` | JSONB | NULL | SQL queries used, execution time, etc. |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- Primary key on `id`
- Index on `(conversation_id, created_at ASC)`

---

### `ai_insights`

AI-generated insights and recommendations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Insight identifier |
| `workspace_id` | UUID | FK → workspaces(id) | Workspace reference |
| `project_id` | UUID | FK → projects(id) | Project reference (optional) |
| `insight_type` | TEXT | NOT NULL | Type (trend, anomaly, recommendation) |
| `title` | TEXT | NOT NULL | Insight title |
| `description` | TEXT | NULL | Detailed description |
| `data` | JSONB | NULL | Supporting data |
| `is_dismissed` | BOOLEAN | DEFAULT false | Whether user dismissed it |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- Primary key on `id`
- Index on `(workspace_id, is_dismissed, created_at DESC)`
- Index on `project_id`
- Index on `insight_type`

---

## Enums

### `integration_provider`

```sql
CREATE TYPE integration_provider AS ENUM (
  'zoom',
  'vapi',
  'google_sheets',
  'gohighlevel'
);
```

### `integration_job_status`

```sql
CREATE TYPE integration_job_status AS ENUM (
  'pending',
  'processing',
  'done',
  'error'
);
```

---

## Critical Implementation Notes

### 1. Missing `project_id` Columns

**⚠️ HIGH PRIORITY:** The following tables need `project_id` added:

```sql
-- Add project_id to contacts
ALTER TABLE contacts ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_project_id ON contacts(project_id);

-- Add project_id to zoom_meetings
ALTER TABLE zoom_meetings ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_zoom_meetings_project_id ON zoom_meetings(project_id);

-- Add project_id to zoom_webinars
ALTER TABLE zoom_webinars ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_zoom_webinars_project_id ON zoom_webinars(project_id);

-- Add project_id to zoom_attendees (optional, can derive from meeting/webinar)
-- Add project_id to zoom_registrants (optional, can derive from meeting/webinar)
```

### 2. Row Level Security (RLS)

All tables should have RLS policies that enforce workspace isolation:

```sql
-- Example RLS policy
CREATE POLICY "Users can only access their workspace data"
  ON table_name
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );
```

### 3. Sensitive Tables

These tables should NOT be accessible to AI chatbot:
- `integration_accounts` (contains credentials)
- `workspace_members` (contains user relationships)

### 4. Updated At Triggers

All tables should have an `updated_at` trigger:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_table_name_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Related Documentation

- [System Architecture](ARCHITECTURE.md) - Detailed architecture specs
- [System Overview](OVERVIEW.md) - High-level system overview
- [Integration Setup](INTEGRATION_SETUP.md) - How to set up integrations

---

**Last Updated:** 2024-11-19  
**Status:** Living document - will be updated as schema evolves

