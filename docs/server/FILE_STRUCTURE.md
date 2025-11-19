# Project File Structure

A visual guide to the project's file organization.

## Root Directory

```
nmdabn-server/
├── src/                          # Source code
├── docs/                         # Documentation (you are here!)
├── node_modules/                 # Dependencies (gitignored)
├── package.json                  # Project dependencies
├── tsconfig.json                 # TypeScript configuration
├── .env                          # Environment variables (gitignored)
├── .env.example                  # Environment template
├── .gitignore                    # Git ignore rules
├── README.md                     # Main project README
└── database.types.ts             # Supabase generated types
```

---

## Source Code (`src/`)

```
src/
├── config/                       # Configuration files
│   ├── env.ts                   # Environment variable validation
│   └── supabase.ts              # Supabase client setup
│
├── middleware/                   # Express middleware
│   ├── auth.ts                  # JWT authentication
│   └── workspace.ts             # Workspace access validation
│
├── routes/                       # API route handlers
│   ├── google-auth.ts           # Google OAuth flow
│   ├── integrations.ts          # Integration accounts CRUD
│   ├── jobs.ts                  # Job listing endpoints
│   ├── actions.ts               # Business logic endpoints
│   └── webhooks.ts              # Webhook handlers
│
├── services/                     # Business logic services
│   ├── integration-accounts.ts  # Account helper functions
│   └── job-queue.ts             # Job creation service
│
├── types/                        # TypeScript type definitions
│   └── index.ts                 # Shared types
│
└── index.ts                      # Express app entry point
```

---

## Documentation (`docs/`)

```
docs/
├── README.md                     # Documentation index (start here!)
├── ARCHITECTURE.md               # Detailed system architecture
├── SYSTEM_OVERVIEW.md            # High-level overview
├── FILE_STRUCTURE.md             # This file
│
├── guides/                       # Step-by-step guides
│   ├── QUICKSTART.md            # 5-minute setup guide
│   ├── INTEGRATION_SETUP.md     # How to set up each provider
│   └── DEPLOYMENT.md            # Production deployment
│
├── api/                          # API documentation
│   └── API_EXAMPLES.md          # Curl examples for all endpoints
│
└── reference/                    # Reference materials
    ├── CHANGELOG.md             # Version history
    └── IMPLEMENTATION_SUMMARY.md # What was built
```

---

## File Descriptions

### Root Files

| File | Purpose |
|------|---------|
| `README.md` | Main project documentation, quick start |
| `package.json` | NPM dependencies and scripts |
| `tsconfig.json` | TypeScript compiler configuration |
| `.env` | Environment variables (not in git) |
| `.env.example` | Template for environment variables |
| `.gitignore` | Files to ignore in git |
| `database.types.ts` | TypeScript types generated from Supabase |

### Source Code Files

#### Config (`src/config/`)

| File | Purpose |
|------|---------|
| `env.ts` | Validates required environment variables on startup |
| `supabase.ts` | Creates and exports Supabase client |

#### Middleware (`src/middleware/`)

| File | Purpose |
|------|---------|
| `auth.ts` | Verifies Supabase JWT tokens |
| `workspace.ts` | Validates user has access to workspace |

#### Routes (`src/routes/`)

| File | Purpose | Endpoints |
|------|---------|-----------|
| `google-auth.ts` | Google OAuth flow | `/api/auth/google/*` |
| `integrations.ts` | Integration account management | `/api/integrations/accounts/*` |
| `jobs.ts` | Job listing | `/api/jobs/*` |
| `actions.ts` | Business logic endpoints | `/api/actions/*` |
| `webhooks.ts` | Webhook handlers | `/api/webhooks/*` |

#### Services (`src/services/`)

| File | Purpose |
|------|---------|
| `integration-accounts.ts` | Helper functions for fetching integration accounts |
| `job-queue.ts` | Service for creating jobs in integration_jobs table |

#### Types (`src/types/`)

| File | Purpose |
|------|---------|
| `index.ts` | Shared TypeScript types and interfaces |

#### Entry Point

| File | Purpose |
|------|---------|
| `index.ts` | Main Express app, route mounting, server startup |

---

## Documentation Files

### Core Documentation

| File | Purpose | Audience |
|------|---------|----------|
| `README.md` | Documentation index | Everyone |
| `ARCHITECTURE.md` | Detailed technical specs | Developers |
| `SYSTEM_OVERVIEW.md` | High-level overview | Everyone |
| `FILE_STRUCTURE.md` | This file | Developers |

### Guides (`docs/guides/`)

| File | Purpose | Audience |
|------|---------|----------|
| `QUICKSTART.md` | Get running in 5 minutes | Developers |
| `INTEGRATION_SETUP.md` | Set up each provider | Frontend, Backend |
| `DEPLOYMENT.md` | Production deployment | DevOps |

### API Documentation (`docs/api/`)

| File | Purpose | Audience |
|------|---------|----------|
| `API_EXAMPLES.md` | Curl examples for all endpoints | Frontend, Backend |

### Reference (`docs/reference/`)

| File | Purpose | Audience |
|------|---------|----------|
| `CHANGELOG.md` | Version history and changes | Everyone |
| `IMPLEMENTATION_SUMMARY.md` | Implementation details | Developers |

---

## File Naming Conventions

### Source Code
- **PascalCase** for class files (not used currently)
- **kebab-case** for module files: `integration-accounts.ts`
- **camelCase** for variables and functions

### Documentation
- **UPPERCASE.md** for top-level docs: `README.md`, `ARCHITECTURE.md`
- **UPPERCASE.md** for guides: `QUICKSTART.md`, `DEPLOYMENT.md`
- Descriptive names that indicate content

---

## Adding New Files

### Adding a New Route

1. Create file in `src/routes/`: `src/routes/my-feature.ts`
2. Export a router: `export default router;`
3. Import in `src/index.ts`: `import myFeatureRoutes from './routes/my-feature';`
4. Mount route: `app.use('/api/my-feature', myFeatureRoutes);`

### Adding a New Service

1. Create file in `src/services/`: `src/services/my-service.ts`
2. Export functions: `export function myFunction() { ... }`
3. Import where needed: `import { myFunction } from '../services/my-service';`

### Adding Documentation

1. Determine category: guide, API, or reference
2. Create file in appropriate folder: `docs/guides/MY_GUIDE.md`
3. Add entry to `docs/README.md` index
4. Link from main `README.md` if appropriate

---

## Ignored Files

These files are in `.gitignore` and won't be committed:

```
node_modules/          # NPM dependencies
dist/                  # Compiled JavaScript
.env                   # Environment variables
.env.local            # Local environment overrides
*.log                 # Log files
.DS_Store             # macOS system files
```

---

## Build Output

When you run `npm run build`, TypeScript compiles to:

```
dist/
├── config/
│   ├── env.js
│   └── supabase.js
├── middleware/
│   ├── auth.js
│   └── workspace.js
├── routes/
│   ├── google-auth.js
│   ├── integrations.js
│   ├── jobs.js
│   ├── actions.js
│   └── webhooks.js
├── services/
│   ├── integration-accounts.js
│   └── job-queue.js
├── types/
│   └── index.js
└── index.js
```

---

## Quick Navigation

**Want to...**

- **Add a new API endpoint?** → Create file in `src/routes/`
- **Add business logic?** → Create file in `src/services/`
- **Add types?** → Edit `src/types/index.ts`
- **Configure environment?** → Edit `src/config/env.ts`
- **Write documentation?** → Add to `docs/guides/` or `docs/api/`
- **See API examples?** → Check `docs/api/API_EXAMPLES.md`
- **Understand architecture?** → Read `docs/ARCHITECTURE.md`

---

## Related Documentation

- [Documentation Index](README.md) - All documentation
- [Architecture](ARCHITECTURE.md) - System design
- [Quick Start](guides/QUICKSTART.md) - Get started

