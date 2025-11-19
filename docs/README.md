# Documentation Index

Welcome to the NMDABN documentation! This project is a **microservices architecture** where multiple services work together.

---

## 📂 Documentation Structure

```
docs/
├── README.md (you are here)
│
├── system/                      # 🌐 SYSTEM-WIDE (All Services)
│   ├── OVERVIEW.md             # High-level system architecture
│   ├── ARCHITECTURE.md         # Detailed technical specs
│   └── INTEGRATION_SETUP.md    # How integrations work across services
│
├── server/                      # 🖥️ MAIN BACKEND SERVER (This Repo)
│   ├── QUICKSTART.md           # Get this server running
│   ├── API_REFERENCE.md        # API endpoints and examples
│   ├── DEPLOYMENT.md           # Deploy this server
│   └── FILE_STRUCTURE.md       # This server's file organization
│
└── reference/                   # 📚 REFERENCE
    ├── CHANGELOG.md            # Version history
    └── IMPLEMENTATION_SUMMARY.md # What was built
```

---

## 🌐 System-Wide Documentation

**These docs apply to ALL services** (frontend, main backend, microservices):

### [System Overview](system/OVERVIEW.md)
- **What it covers:** High-level architecture of the entire system
- **Who needs it:** Everyone - start here!
- **Topics:**
  - Main backend vs microservices
  - Database schema (shared by all)
  - Job queue pattern
  - Data flow examples

### [System Architecture](system/ARCHITECTURE.md)
- **What it covers:** Detailed technical specifications
- **Who needs it:** All developers
- **Topics:**
  - Tenancy model (workspaces, users)
  - Integration accounts & jobs tables
  - Service responsibilities
  - Multi-account support
  - Key principles

### [Integration Setup](system/INTEGRATION_SETUP.md)
- **What it covers:** How to set up each integration provider
- **Who needs it:** Frontend & backend developers
- **Topics:**
  - Google Sheets OAuth flow
  - Zoom API credentials
  - VAPI API keys
  - Credential storage patterns

---

## 🖥️ Main Backend Server Documentation

**These docs are specific to THIS repository** (the main backend server):

### [Quick Start](server/QUICKSTART.md)
- **What it covers:** Get the main backend server running in 5 minutes
- **Who needs it:** Developers working on this server
- **Topics:**
  - Installation
  - Environment setup
  - First API call
  - Troubleshooting

### [API Reference](server/API_REFERENCE.md)
- **What it covers:** All API endpoints with examples
- **Who needs it:** Frontend developers, API consumers
- **Topics:**
  - Authentication endpoints
  - Integration account management
  - Job creation (actions)
  - Webhook handlers
  - Curl examples

### [Deployment](server/DEPLOYMENT.md)
- **What it covers:** How to deploy this server to production
- **Who needs it:** DevOps, backend developers
- **Topics:**
  - Environment variables
  - Docker setup
  - Cloud platforms (Heroku, Railway, AWS, etc.)
  - Monitoring & scaling

### [File Structure](server/FILE_STRUCTURE.md)
- **What it covers:** File organization of this server
- **Who needs it:** Developers working on this server
- **Topics:**
  - Source code structure
  - Route organization
  - Adding new features

---

## 📚 Reference Documentation

### [Changelog](reference/CHANGELOG.md)
- Version history and changes

### [Implementation Summary](reference/IMPLEMENTATION_SUMMARY.md)
- What was built and how it works

---

## 🚀 Quick Start Paths

### New to the Project?

**Start here in this order:**

1. **[System Overview](system/OVERVIEW.md)** (10 min)
   - Understand the big picture
   - See how all services work together

2. **[System Architecture](system/ARCHITECTURE.md)** (30 min)
   - Learn the database schema
   - Understand service responsibilities
   - See the job queue pattern

3. **[Server Quick Start](server/QUICKSTART.md)** (10 min)
   - Get the main backend running locally

4. **[API Reference](server/API_REFERENCE.md)** (15 min)
   - Learn how to call the APIs

---

## 👥 Documentation by Role

### Frontend Developer

**You need to understand:**
1. [System Overview](system/OVERVIEW.md) - How the system works
2. [System Architecture](system/ARCHITECTURE.md) - Database schema & API patterns
3. [API Reference](server/API_REFERENCE.md) - How to call the main backend
4. [Integration Setup](system/INTEGRATION_SETUP.md) - How to connect integrations

**Key concepts:**
- Use Supabase Auth for user authentication
- Call main backend API for integration operations
- Always include `workspace_id` in requests
- Frontend never stores credentials directly

---

### Backend Developer (Main Server)

**You need to understand:**
1. [System Architecture](system/ARCHITECTURE.md) - Full system design
2. [Server Quick Start](server/QUICKSTART.md) - Set up your environment
3. [File Structure](server/FILE_STRUCTURE.md) - Code organization
4. [API Reference](server/API_REFERENCE.md) - Existing endpoints

**Key concepts:**
- Validate `workspace_id` on every request
- Create jobs in `integration_jobs`, don't call external APIs
- Handle OAuth flows for Google Sheets
- Provide endpoints for API key storage

---

### Microservice Developer

**You need to understand:**
1. [System Overview](system/OVERVIEW.md) - Job queue pattern
2. [System Architecture](system/ARCHITECTURE.md) - `integration_jobs` & `integration_accounts` tables
3. [Integration Setup](system/INTEGRATION_SETUP.md) - Credential storage

**Key concepts:**
- Subscribe to `integration_jobs` via Supabase Realtime
- Filter by your provider (e.g., `provider = 'zoom'`)
- Fetch credentials from `integration_accounts`
- Execute jobs, update status, no business logic

---

### DevOps

**You need to understand:**
1. [System Overview](system/OVERVIEW.md) - System components
2. [Server Deployment](server/DEPLOYMENT.md) - How to deploy
3. [System Architecture](system/ARCHITECTURE.md) - Dependencies

**Key concepts:**
- Shared Supabase database for all services
- Each microservice is independent
- Environment variables for each service
- Monitoring & scaling considerations

---

## 🔍 Common Questions

### "Where do I start?"
→ [System Overview](system/OVERVIEW.md)

### "How do I run the main backend server?"
→ [Server Quick Start](server/QUICKSTART.md)

### "How does the job queue work?"
→ [System Architecture - Integration Jobs](system/ARCHITECTURE.md#32-integration_jobs-shared-job-queue)

### "How do I call an API endpoint?"
→ [API Reference](server/API_REFERENCE.md)

### "How do I set up Google Sheets integration?"
→ [Integration Setup - Google Sheets](system/INTEGRATION_SETUP.md#google-sheets-integration)

### "What's the difference between system docs and server docs?"
- **System docs** = Apply to ALL services (frontend, backend, microservices)
- **Server docs** = Specific to THIS repository (main backend server only)

### "I'm building a microservice, which docs do I need?"
→ System docs only: [Overview](system/OVERVIEW.md) + [Architecture](system/ARCHITECTURE.md)

### "I'm working on the frontend, which docs do I need?"
→ System docs + [API Reference](server/API_REFERENCE.md)

---

## 📊 System vs Server Documentation

### System Documentation (Global)

**Applies to:** Frontend, Main Backend, All Microservices

**Shared concepts:**
- Database schema (`workspaces`, `users`, `integration_accounts`, `integration_jobs`)
- Job queue pattern
- Multi-tenancy model
- Integration patterns
- Service responsibilities

**Location:** `docs/system/`

---

### Server Documentation (This Repo)

**Applies to:** Main Backend Server only

**Server-specific:**
- API endpoints
- Environment setup
- Deployment
- File structure
- Development workflow

**Location:** `docs/server/`

---

## 🎯 Documentation Guidelines

### When to Use System Docs

Use system docs when the information applies to **multiple services**:
- ✅ Database schema
- ✅ Job queue pattern
- ✅ Integration patterns
- ✅ Multi-tenancy model
- ✅ Service responsibilities

### When to Use Server Docs

Use server docs when the information is **specific to this server**:
- ✅ API endpoints
- ✅ How to run this server
- ✅ This server's file structure
- ✅ Deploying this server
- ✅ Environment variables for this server

---

## 🔗 External Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Express.js Guide](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Zoom API](https://marketplace.zoom.us/docs/api-reference/introduction)
- [VAPI Documentation](https://docs.vapi.ai/)

---

## 📝 Contributing to Documentation

### Adding System-Wide Documentation

If the doc applies to **all services**:
1. Add to `docs/system/`
2. Update this index under "System-Wide Documentation"
3. Share with all service repositories

### Adding Server-Specific Documentation

If the doc applies to **this server only**:
1. Add to `docs/server/`
2. Update this index under "Main Backend Server Documentation"
3. Keep it in this repository only

---

**Last Updated:** November 19, 2024  
**Version:** 1.0.0
