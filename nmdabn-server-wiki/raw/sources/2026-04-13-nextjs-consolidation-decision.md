# Next.js consolidation decision

- Source type: `decision record / architecture`
- Snapshot date: `2026-04-13`
- Context: Planning session deciding whether to keep Express + Next.js as separate servers or consolidate into Next.js only.

---

## Decision

**Consolidate to Next.js only.** Remove the standalone Express server. All API routes become Next.js Route Handlers (`app/api/**`). The `frontend/` directory is promoted to the project root. The `.mjs` sync scripts at root are unchanged.

---

## Rationale: why Next.js is safe for this system

### The "data ingestion" concern

Concern raised: continuous data ingestion to ensure data is always up to date (GHL, Zoom, etc.) might require a persistent background process — which would disqualify Next.js.

### Why it does not apply here

The data refresh model for this system is:

| Source | Mechanism | Pattern |
|--------|-----------|---------|
| GHL contact changes | GHL pushes a webhook → handler verifies + fires async sync | Event-driven HTTP |
| GHL full sync | External cron hits an API endpoint → triggers `.mjs` script | Triggered batch |
| Zoom participants | After webinar ends: manual or `meeting.ended` webhook trigger | Triggered batch |
| GHL orders/invoices | Webhook or triggered sync | Same as contacts |

None of these are continuous background loops. There is no `setInterval`, no in-memory queue processor spinning continuously, no persistent WebSocket to an external service. The pattern is: receive external HTTP event → do work → finish.

### The webhook + scheduled reconciliation pattern

Webhooks alone give ~95–98% real-time coverage (delivery failures, server downtime, bulk imports). The remaining 2–5% drift is corrected by a scheduled full sync. For a sales tracking dashboard, a daily full sync is sufficient — dashboards are used in business hours, not real-time trading.

The batch `.mjs` scripts already implement idempotent full sync. Adding an external cron (Render cron job hitting an API endpoint once daily) completes the reliability story. This works identically in Next.js or Express.

### Continuous polling is not needed and not planned

Polling GHL every N minutes would burn rate limits, require a persistent loop inside the server, and still not give real-time updates. It is not part of the design.

### Child process spawning

The webhook sync spawns `.mjs` child processes via Node `spawn()`. This works in Next.js Node.js runtime (not Edge runtime). All API routes in this project use Node.js runtime. Render + Docker deployment uses `next start` (Node server mode), not serverless.

---

## Benefits of consolidation

- One process, one Dockerfile, one Render service
- No CORS configuration — same origin (all API routes are `/api/...` on the Next.js server)
- `NEXT_PUBLIC_API_BASE_URL` env var is removed — frontend calls `/api/...` natively
- One `package.json`, one `tsconfig.json`
- Admin UI pages and their API routes live in the same app — no cross-service contracts

---

## What changes

### Directory structure — before

```
nmdabn-server/
  src/
    config/         env.ts, supabase.ts, traffic.ts
    routes/         *.ts (Express route handlers)
    middleware/     auth.ts, workspace.ts, traffic-dashboard-*.ts
    services/       *.ts
    types/          index.ts
    database.types.ts
    index.ts        (Express entry point)
  frontend/
    app/            layout.tsx, page.tsx, globals.css
    src/
      features/traffic/
      lib/supabase.ts
    package.json
    next.config.ts
    tsconfig.json
  scripts/          *.mjs, lib/*.mjs  (unchanged)
  docs/             (unchanged)
  package.json      (Express)
  tsconfig.json     (Express)
```

### Directory structure — after

```
nmdabn-server/
  app/              promoted from frontend/app/
    layout.tsx, page.tsx, globals.css
    api/            Route Handlers (from src/routes/ — see route map below)
  src/
    features/       promoted from frontend/src/features/
      traffic/
    lib/            promoted from frontend/src/lib/
      supabase.ts
    services/       moved from src/services/ (same filenames, paths updated)
    config/         moved from src/config/ (dotenv.config() call removed)
    middleware/     adapted helpers (no Express types; plain async functions)
    types/          moved from src/types/
    database.types.ts
  scripts/          unchanged
  docs/             unchanged
  nmdabn-server-wiki/  unchanged
  package.json      merged (see dependencies below)
  next.config.ts    promoted from frontend/next.config.ts
  tsconfig.json     promoted from frontend/tsconfig.json (supports app/ + src/)
  .env.example      same env vars; NEXT_PUBLIC_API_BASE_URL removed
```

### Route map (Express → Next.js Route Handlers)

| Express route file | Next.js path |
|--------------------|--------------|
| `src/routes/ghl-webhook.ts` | `app/api/webhooks/ghl/route.ts` |
| `src/routes/google-auth.ts` | `app/api/auth/google/route.ts` |
| `src/routes/integrations.ts` | `app/api/integrations/accounts/route.ts` + `accounts/zoom/route.ts` + `accounts/vapi/route.ts` + `accounts/[id]/route.ts` |
| `src/routes/projects.ts` | `app/api/projects/route.ts` + `projects/[id]/route.ts` |
| `src/routes/workspaces.ts` | `app/api/workspaces/route.ts` |
| `src/routes/dashboard-traffic.ts` | `app/api/dashboard/traffic/route.ts` + `dashboard/traffic/lines/route.ts` |
| `src/routes/jobs.ts` | `app/api/jobs/route.ts` + `jobs/[id]/route.ts` (pending job queue decision) |
| `src/routes/actions.ts` | **DELETE** — VAPI is out of scope |
| `src/routes/webhooks.ts` | **DELETE** — VAPI/legacy; GHL webhook has its own route; new Zoom webhook in Step 4 |
| Health check | `app/api/health/route.ts` |

### Dependencies — after merge

Removed from Express: `express`, `cors`, `dotenv`, `helmet`, `@types/express`, `@types/cors`, `ts-node-dev`  
Added from Next.js: `next`, `react`, `react-dom`, `@types/react`, `@types/react-dom`  
Kept: `@supabase/supabase-js`, `googleapis`, `typescript`, `@types/node`  
Scripts in `package.json`: all `npm run sync-*` and `backfill-*` scripts stay unchanged.

---

## Key technical migration patterns

### 1. GHL raw webhook body (most important)

Express used `express.raw({ type: '*/*' })` middleware. Next.js equivalent:

```typescript
// app/api/webhooks/ghl/route.ts
export const runtime = "nodejs"; // required for child_process.spawn

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBuffer = Buffer.from(await request.arrayBuffer());
  const rawUtf8 = rawBuffer.toString("utf8");
  // pass rawUtf8 to verifyGhlWebhookSignature(rawUtf8, headersObject)
  const parsed = JSON.parse(rawUtf8) as unknown;
  // ...
}
```

### 2. Auth middleware → utility functions

Express: `router.get("/path", authenticateUser, handler)`  
Next.js: call the auth helper at the top of the handler:

```typescript
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateUser(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  // auth.userId, auth.workspaceId available
}
```

### 3. No dotenv.config() call

`src/config/env.ts` currently calls `dotenv.config()` at module load. In Next.js this is not needed — Next.js automatically loads `.env.local` / `.env`. Remove that call; all `process.env.*` access works as-is.

### 4. CORS — removed entirely

The `cors` npm package and all CORS configuration is removed. Same-origin: all `/api/...` routes are served by the same Next.js server as the frontend.

### 5. `NEXT_PUBLIC_API_BASE_URL` — removed

`frontend/.env.example` had `NEXT_PUBLIC_API_BASE_URL` to point the browser at the separate Express server. No longer needed. The frontend's `src/features/traffic/services/api.ts` should be updated to use relative `/api/...` paths.

### 6. `export const runtime = "nodejs"` required on routes that use

- `child_process` (GHL webhook route)
- `node:crypto` (anywhere crypto is used)
- Any Node.js built-in not available in Edge runtime

All other routes default to the Node.js runtime on Render deployment anyway.

### 7. Helmet → next.config.ts headers

`helmet` Express middleware sets security headers. In Next.js, security headers go in `next.config.ts`:

```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // ... etc
        ],
      },
    ];
  },
};
```

---

## What does NOT change

- All `src/services/*.ts` logic — zero changes (move path only)
- All `src/config/` logic (except remove `dotenv.config()`)
- All `.mjs` scripts at `scripts/` — zero changes
- All SQL migrations under `docs/database/migrations/` — zero changes
- All database types in `src/database.types.ts` — zero changes
- All env var names in `.env.example` — zero changes (except removing `NEXT_PUBLIC_API_BASE_URL`)
- The Supabase client — same `createClient` call
- The wiki — zero changes

---

## Deployment after consolidation

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

One Dockerfile. One Render web service running `next start`. The `.mjs` scripts are invoked by Render cron jobs (separate Render cron service hitting `POST /api/actions/sync/ghl`).
