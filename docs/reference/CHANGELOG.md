# Changelog

All notable changes to the NMDABN Main Backend Server.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2024-11-19

### Added

#### Projects Support
- **Projects API** - Full CRUD for projects within workspaces
  - `GET /api/projects` - List all projects
  - `GET /api/projects/:id` - Get specific project
  - `POST /api/projects` - Create new project
  - `PATCH /api/projects/:id` - Update project
  - `DELETE /api/projects/:id` - Delete project
- **Database Migration** - `migrations/001_create_projects_table.sql`
  - Projects table with workspace isolation
  - Row Level Security policies
  - Automatic `updated_at` trigger
- **Routes** - `src/routes/projects.ts`
  - Workspace-scoped project management
  - Authentication and authorization
  - Input validation

#### Documentation Reorganization
- **System vs Server Separation**
  - `docs/system/` - System-wide documentation (all services)
  - `docs/server/` - Server-specific documentation (this repo)
  - `docs/reference/` - Reference materials
- **New Documentation**
  - `docs/server/ARCHITECTURE_COMPLIANCE.md` - Verification of architecture adherence
  - `docs/reference/IMPLEMENTATION.md` - Implementation details
  - `docs/reference/DOCUMENTATION_CHANGES.md` - Documentation reorganization log
  - `docs/reference/REORGANIZATION_SUMMARY.md` - Summary of doc changes

### Changed

#### Documentation Structure
- Moved `ARCHITECTURE.md` → `docs/system/ARCHITECTURE.md`
- Moved `SYSTEM_OVERVIEW.md` → `docs/system/OVERVIEW.md`
- Moved `INTEGRATION_SETUP.md` → `docs/system/INTEGRATION_SETUP.md`
- Moved `QUICKSTART.md` → `docs/server/QUICKSTART.md`
- Moved `DEPLOYMENT.md` → `docs/server/DEPLOYMENT.md`
- Moved `API_EXAMPLES.md` → `docs/server/API_REFERENCE.md`
- Moved `FILE_STRUCTURE.md` → `docs/server/FILE_STRUCTURE.md`
- Moved `CHANGELOG.md` → `docs/reference/CHANGELOG.md`
- Moved `IMPLEMENTATION_SUMMARY.md` → `docs/reference/IMPLEMENTATION.md`

#### Documentation Updates
- Updated main `README.md` with system vs server separation
- Updated `docs/README.md` with role-based navigation
- Added clear documentation paths for different roles

---

## [1.0.0] - 2024-11-15

### Added

#### Core Infrastructure
- Express.js server with TypeScript
- Supabase integration with service role authentication
- Environment variable validation
- CORS and security headers (Helmet)
- Request logging middleware
- Health check endpoint (`GET /health`)

#### Authentication & Authorization
- JWT authentication middleware using Supabase Auth
- Workspace scoping middleware
- Multi-tenancy support with workspace validation
- `src/middleware/auth.ts` - JWT verification
- `src/middleware/workspace.ts` - Workspace access validation

#### Google OAuth Integration
- OAuth 2.0 authorization flow
- Token exchange and storage
- Automatic credential refresh support
- Integration with Google Sheets API
- `GET /api/auth/google/authorize` - Generate OAuth URL
- `GET /api/auth/google/callback` - Handle OAuth callback

#### Integration Accounts Management
- List integration accounts (with provider filtering)
- Get specific integration account
- Update integration account (display name, default status)
- Delete integration account
- Support for multiple accounts per provider per workspace
- `GET /api/integrations/accounts` - List accounts
- `GET /api/integrations/accounts/:id` - Get account
- `POST /api/integrations/accounts/zoom` - Save Zoom credentials
- `POST /api/integrations/accounts/vapi` - Save VAPI credentials
- `PATCH /api/integrations/accounts/:id` - Update account
- `DELETE /api/integrations/accounts/:id` - Delete account

#### Job Queue System
- Job creation service
- Job listing with filtering (provider, status)
- Job detail retrieval
- Automatic integration account resolution
- Support for scheduled jobs (run_at)
- `GET /api/jobs` - List jobs
- `GET /api/jobs/:id` - Get job details
- `src/services/job-queue.ts` - Job creation logic

#### Business Logic Endpoints (Actions)

**Google Sheets Actions:**
- `POST /api/actions/google-sheets/append-row` - Append row to spreadsheet
- `POST /api/actions/google-sheets/sync-sheet` - Trigger sheet sync

**VAPI Actions:**
- `POST /api/actions/vapi/create-call` - Create outbound call
- `POST /api/actions/vapi/sync-call-log` - Sync call logs

**Zoom Actions:**
- `POST /api/actions/zoom/create-meeting` - Create meeting
- `POST /api/actions/zoom/add-registrant` - Add registrant to meeting/webinar
- `POST /api/actions/zoom/sync-meeting` - Sync meeting data

#### Webhook Handlers
- Zoom webhook endpoint (meeting events, webinar events, recordings)
- VAPI webhook endpoint (call events)
- Google Sheets webhook endpoint (push notifications)
- Test webhook endpoint for development
- `POST /api/webhooks/zoom` - Zoom events
- `POST /api/webhooks/vapi` - VAPI events
- `POST /api/webhooks/google-sheets` - Google Sheets events
- `POST /api/webhooks/test` - Test endpoint

#### Documentation
- Comprehensive README with architecture overview
- API examples with curl commands
- Deployment guide for multiple platforms
- Quick start guide for developers
- API reference documentation
- System architecture documentation

### Technical Details

**Dependencies:**
- express: ^4.18.2
- @supabase/supabase-js: ^2.39.0
- googleapis: ^129.0.0
- cors: ^2.8.5
- helmet: ^7.1.0
- dotenv: ^16.3.1

**Dev Dependencies:**
- typescript: ^5.3.3
- ts-node-dev: ^2.0.0
- @types/express: ^4.17.21
- @types/cors: ^2.8.17
- @types/node: ^20.10.6

**Supported Integrations:**
- Google Sheets (OAuth 2.0)
- Zoom (Server-to-Server OAuth)
- VAPI (API Key)

**Database Tables Used:**
- workspaces
- users
- workspace_members
- integration_accounts
- integration_jobs
- google_sheets_syncs
- zoom_meetings
- zoom_webinars
- zoom_attendees
- zoom_registrants
- zoom_recordings
- zoom_transcriptions
- zoom_analytics_metadata
- contacts

### Security
- Service role key for backend operations
- JWT token validation on all authenticated endpoints
- Workspace membership verification
- CORS configuration for production
- Helmet security headers
- Input validation on all endpoints

### Architecture
- Microservices orchestration pattern
- Job queue with Supabase Realtime subscriptions
- Multi-tenant workspace isolation
- RESTful API design
- Stateless server design for horizontal scaling

---

## Version History

- **1.1.0** (2024-11-19): Added projects support, reorganized documentation
- **1.0.0** (2024-11-15): Initial release with core functionality

---

## Upgrade Notes

### Upgrading to 1.1.0

1. **Run Database Migration:**
   ```sql
   -- Run migrations/001_create_projects_table.sql
   ```

2. **Update Database Types:**
   ```bash
   npm run supabase-sync
   ```

3. **No Breaking Changes:**
   - All existing endpoints remain unchanged
   - Projects are optional - existing functionality works without them

---

## Planned Features

### v1.2.0 (Upcoming)
- Rate limiting for public endpoints
- Request validation with Zod
- Webhook signature verification
- Retry mechanism for failed jobs
- Job priority levels

### v1.3.0 (Future)
- Webhook event logging table
- VAPI-specific database tables
- Enhanced error tracking with Sentry
- Metrics and monitoring endpoints
- API versioning support

### v2.0.0 (Future)
- GraphQL API option
- WebSocket support for real-time updates
- Bulk operations endpoints
- Data export functionality
- Advanced filtering and pagination
- Caching layer (Redis)

---

## Known Issues

### v1.1.0
- Google OAuth callback redirect URL is hardcoded (needs frontend URL configuration)
- Zoom webhook verification token not implemented
- No retry mechanism for failed jobs
- Limited error context in responses

### v1.0.0
- No request validation library integrated
- No comprehensive test suite

---

## Contributing

When adding new features:
1. Update this CHANGELOG
2. Update API documentation
3. Add migration files if database changes
4. Update architecture compliance doc
5. Add examples to API reference

---

**Last Updated:** November 19, 2024  
**Current Version:** 1.1.0
