# Next.js consolidation architecture

**Implementation guide for the migration agent.** Read this in full before touching any file.

## Goal

Replace the standalone Express server (`src/index.ts` + `src/routes/`) with Next.js Route Handlers inside the existing `frontend/` app. Promote `frontend/` to the project root. Keep all business logic in `src/services/` and all `.mjs` scripts unchanged.

---

## Step-by-step file operations

### Phase A — Promote frontend/ to root

1. Move `frontend/app/` → `app/` (root)
2. Move `frontend/src/features/` → `src/features/`
3. Move `frontend/src/lib/` → `src/lib/`
4. Move `frontend/next.config.ts` → `next.config.ts` (root)
5. Move `frontend/next-env.d.ts` → `next-env.d.ts` (root)
6. Move `frontend/tsconfig.json` → replace root `tsconfig.json`
7. Move `frontend/app/globals.css` → `app/globals.css` (already covered by step 1)
8. Delete `frontend/` directory (now empty)
9. Delete `frontend/package.json` and `frontend/package-lock.json` (replaced by root)

### Phase B — Move Express server code into src/

These files move path only — zero logic changes unless noted.

| From | To | Change |
|------|----|--------|
| `src/config/env.ts` | stays at `src/config/env.ts` | Remove `dotenv.config()` call (Next.js loads env) |
| `src/config/supabase.ts` | stays | none |
| `src/config/traffic.ts` | stays | none |
| `src/services/*.ts` | stays | none |
| `src/types/index.ts` | stays | none |
| `src/database.types.ts` | stays | none |
| `src/middleware/auth.ts` | stays | Refactor: remove Express `Request`/`Response`/`NextFunction` types; return result objects instead |
| `src/middleware/workspace.ts` | stays | Same refactor as auth.ts |
| `src/middleware/traffic-dashboard-auth.ts` | stays | Same refactor |
| `src/middleware/traffic-dashboard-flex-auth.ts` | stays | Same refactor |

### Phase C — Create Route Handlers from Express routes

Each Express route file becomes one or more Next.js Route Handler files under `app/api/`. See the route map below.

### Phase D — Delete Express-only files

- `src/index.ts` — Express entry point; delete
- `src/routes/actions.ts` — VAPI actions; **delete** (VAPI is out of scope per engineering direction)
- `src/routes/webhooks.ts` — VAPI/Zoom legacy webhooks; **delete** (GHL webhook has its own route; Zoom webhook will be new in Step 4)

### Phase E — Merge package.json and tsconfig.json

See dependency and config sections below.

---

## Route map (Express → Next.js)

| Express | HTTP method(s) | Next.js Route Handler file |
|---------|---------------|---------------------------|
| `/health` | GET | `app/api/health/route.ts` |
| `/api/auth/google/authorize` | GET | `app/api/auth/google/authorize/route.ts` |
| `/api/auth/google/callback` | GET | `app/api/auth/google/callback/route.ts` |
| `/api/webhooks/ghl` | POST | `app/api/webhooks/ghl/route.ts` ⚠️ see raw body note |
| `/api/integrations/accounts` | GET | `app/api/integrations/accounts/route.ts` |
| `/api/integrations/accounts/zoom` | POST | `app/api/integrations/accounts/zoom/route.ts` |
| `/api/integrations/accounts/vapi` | POST | **skip** — VAPI out of scope |
| `/api/integrations/accounts/:id` | GET, PATCH, DELETE | `app/api/integrations/accounts/[id]/route.ts` |
| `/api/projects` | GET, POST | `app/api/projects/route.ts` |
| `/api/projects/:id` | GET, PATCH, DELETE | `app/api/projects/[id]/route.ts` |
| `/api/workspaces` | GET | `app/api/workspaces/route.ts` |
| `/api/dashboard/traffic` | GET | `app/api/dashboard/traffic/route.ts` |
| `/api/dashboard/traffic/lines` | GET | `app/api/dashboard/traffic/lines/route.ts` |
| `/api/jobs` | GET | `app/api/jobs/route.ts` |
| `/api/jobs/:id` | GET | `app/api/jobs/[id]/route.ts` |

---

## Critical migration patterns

### 1. GHL raw webhook body — MOST IMPORTANT

The GHL webhook route MUST capture the raw request body for signature verification before any JSON parsing. In Next.js:

```typescript
// app/api/webhooks/ghl/route.ts
export const runtime = "nodejs"; // REQUIRED — enables child_process.spawn

import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBuffer = Buffer.from(await request.arrayBuffer());
  const rawUtf8 = rawBuffer.toString("utf8");

  // Pass rawUtf8 to signature verifier (same function as before)
  const checked = verifyGhlWebhookSignature(rawUtf8, Object.fromEntries(request.headers));
  if (!checked.ok) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  const parsed = JSON.parse(rawUtf8) as unknown;
  // ... rest of handler logic (identical to Express handler)
}
```

Note: `verifyGhlWebhookSignature` in `src/services/ghl-webhook-signature.ts` currently accepts `IncomingHttpHeaders`. Update the type or convert the headers to a plain object using `Object.fromEntries(request.headers)`.

### 2. Auth middleware → helper function pattern

Express middleware chain:
```typescript
router.get("/path", authenticateUser, validateWorkspaceAccess, handler);
```

Next.js Route Handler equivalent:
```typescript
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateUser(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await validateWorkspaceAccess(request, auth.userId);
  if (!workspace.ok) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  // use auth.userId, workspace.workspaceId
}
```

The middleware functions need to be refactored from Express middleware signature `(req, res, next) => void` to plain async functions `(request: NextRequest) => Promise<{ ok: true; userId: string } | { ok: false }>`.

### 3. Query params

Express: `req.query.workspace_id`  
Next.js: `request.nextUrl.searchParams.get("workspace_id")`

### 4. Route params (dynamic segments)

Express: `req.params.id`  
Next.js: second argument to the export function:
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
}
```

### 5. Request body (JSON)

Express: `req.body` (populated by `express.json()`)  
Next.js: `await request.json() as unknown`

### 6. Response

Express: `res.json({ ... })` / `res.status(400).json({ ... })`  
Next.js: `return NextResponse.json({ ... })` / `return NextResponse.json({ ... }, { status: 400 })`

### 7. Remove dotenv.config()

`src/config/env.ts` starts with:
```typescript
import dotenv from "dotenv";
dotenv.config();
```
**Remove both lines.** Next.js automatically loads `.env.local` in development and `.env.production` or Render env vars in production. All `process.env.*` access continues to work.

### 8. No CORS setup needed

Delete all `cors` import and usage. Frontend and API are the same origin — CORS is irrelevant.

### 9. Add security headers to next.config.ts

Replace `helmet` with headers in `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
```

### 10. Update frontend API service

`src/features/traffic/services/api.ts` currently uses `NEXT_PUBLIC_API_BASE_URL` as a base URL prefix. After migration, the frontend and API are on the same origin. Update all fetch calls to use relative paths (e.g. `/api/dashboard/traffic`) instead of `${baseUrl}/api/dashboard/traffic`.

### 11. export const runtime = "nodejs" — when required

Add this export to any Route Handler that uses:
- `child_process` (GHL webhook route — spawns `.mjs` scripts)
- `node:crypto` (anywhere AES-256-GCM is used)
- Node.js built-ins not available in Edge runtime

Other routes work without this directive (Next.js defaults to Node.js runtime on self-hosted Render deployment anyway, but being explicit is safer).

---

## Merged package.json (after migration)

```json
{
  "name": "nmdabn-server",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit",
    "sync-ghl-contacts": "node --env-file=.env scripts/sync-ghl-contacts-to-supabase.mjs",
    "sync-ghl-orders-invoices": "node --env-file=.env scripts/sync-ghl-orders-invoices-to-supabase.mjs",
    "backfill-webinar-runs": "node --env-file=.env scripts/backfill-webinar-runs.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "googleapis": "^129.x",
    "next": "^15.x",
    "react": "^19.x",
    "react-dom": "^19.x"
  },
  "devDependencies": {
    "@types/node": "^22.x",
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x",
    "typescript": "^5.x"
  }
}
```

Removed: `express`, `cors`, `dotenv`, `helmet`, `@types/express`, `@types/cors`, `ts-node-dev`

---

## Env vars after migration

All existing env var names are unchanged. The only removal is `NEXT_PUBLIC_API_BASE_URL` (no longer needed — same origin). Server-side env vars (no `NEXT_PUBLIC_` prefix) continue to be read via `process.env` in Route Handlers. Client-side vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) continue to work as before.

Local dev: use `.env.local` at the project root (gitignored).

---

## What does NOT change

| Area | Status |
|------|--------|
| All `src/services/*.ts` logic | Zero changes (move to `src/services/` in new root) |
| All `src/config/` logic | Zero changes except remove `dotenv.config()` |
| All `.mjs` scripts in `scripts/` | Zero changes |
| All SQL migrations in `docs/database/migrations/` | Zero changes |
| `src/database.types.ts` | Zero changes |
| All env var names | Zero changes (minus `NEXT_PUBLIC_API_BASE_URL`) |
| Supabase client | Zero changes |
| Wiki | Zero changes |
| `nmdabn-server-wiki/` | Zero changes |

---

## Deployment after migration

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

Enable `output: "standalone"` in `next.config.ts` for an optimized production image.

One Render web service, one Dockerfile. Cron syncs: separate Render cron jobs hitting `POST /api/actions/sync/ghl` (added in Step 9).

---

## Related

- [[NextJS-Consolidation-Decision]]
- [[Phase-1-Build-Order]]
- [[Platform-Engineering-Direction]]
- [[GHL-Webhook-Pipeline]]
- [[Express-Raw-Webhook-Body]]
- `../src/routes/ghl-webhook.ts` — source Express handler to migrate
- `../src/middleware/auth.ts` — source middleware to refactor
- `../frontend/src/features/traffic/services/api.ts` — remove NEXT_PUBLIC_API_BASE_URL usage

## Contradictions / history

- Prior `Platform-Engineering-Direction` described deployment as "Express server + separate Next.js frontend." **Superseded 2026-04-13** by this consolidation. Render + Docker model is preserved; the process count changes from two to one.
- `concepts/Express-Raw-Webhook-Body.md` documented `express.raw()` middleware. The raw body pattern is preserved but uses `request.arrayBuffer()` in Next.js. That concept page remains valid as background context; the implementation detail is superseded here.
