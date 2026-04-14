# Next.js consolidation decision

**Raw:** [2026-04-13-nextjs-consolidation-decision.md](../raw/sources/2026-04-13-nextjs-consolidation-decision.md)
**Decision date:** 2026-04-13

## Summary

Consolidate the standalone Express server into the Next.js app. All API routes become Next.js Route Handlers. The `frontend/` directory is promoted to the project root. The `.mjs` sync scripts are unchanged. One process, one Dockerfile, one Render service.

## Why the continuous-ingestion concern does not block this

The data refresh model is event-driven + triggered batch — not continuous polling loops. GHL changes arrive via webhooks (HTTP request/response); full syncs are one-shot scripts triggered by external cron; Zoom attendance is triggered after each webinar. None of these require a persistent in-process background loop. Child process `spawn()` used by the webhook sync service works correctly in Next.js Node.js runtime.

See raw source for full rationale.

## Key facts

- **Route map:** `src/routes/*.ts` → `app/api/**/route.ts` (see raw source for full table)
- **Services, config, types, scripts:** move path only — zero logic changes
- **GHL raw webhook body:** `express.raw()` → `Buffer.from(await request.arrayBuffer())` + `export const runtime = "nodejs"`
- **Auth middleware:** Express middleware chain → helper function called at top of each Route Handler
- **CORS:** removed entirely (same origin)
- **`NEXT_PUBLIC_API_BASE_URL`:** removed (frontend uses relative `/api/...` paths)
- **`dotenv.config()`:** removed from `src/config/env.ts` (Next.js loads env automatically)
- **`helmet`:** replaced by security headers in `next.config.ts`
- **Deleted routes:** `src/routes/actions.ts` (VAPI out of scope) and `src/routes/webhooks.ts` (VAPI/legacy)
- **Deployment:** one Dockerfile, `next start`, one Render web service

## Open question resolved

Prior `Engineering-And-Ops-Direction` noted "Render + Docker" and a modular monolith. This is preserved — the consolidation changes the framework, not the deployment model.

## Related wiki

- [[NextJS-Consolidation-Architecture]]
- [[Platform-Engineering-Direction]]
- [[Phase-1-Build-Order]]
- [[Engineering-And-Ops-Direction]]
- [[GHL-Webhook-Pipeline]]
