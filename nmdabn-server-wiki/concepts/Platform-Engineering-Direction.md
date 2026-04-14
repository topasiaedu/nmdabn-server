# Platform engineering direction

Synthesis of **how we build and run** the product stack: repo layout, deployment shape, request handling under load, and explicit non-goals.

## Monorepo, single Next.js app (updated 2026-04-13)

- One repo, one Next.js app — frontend pages and API Route Handlers live together.
- **No separate Express server.** The standalone Express server was consolidated into Next.js Route Handlers (see [[NextJS-Consolidation-Architecture]]).
- **No** `packages/shared` library — types and helpers live inside `src/` in the single app.
- `.mjs` sync scripts remain at the repo root and are invoked by Render cron jobs.

> **Supersedes prior note:** an earlier version of this page described "frontend + backend as separate apps." That was the starting state and was intentionally collapsed. Do not reintroduce a separate Express server.

## Deployment

- Target **Render** with **Docker** — **one web service** running `next start`.
- Cron syncs run as separate Render cron jobs hitting internal API endpoints (e.g. `POST /api/actions/sync/ghl`).
- Optional background worker (if a durable job queue is added later): separate Render service from the same image with a different `CMD`.

## Modular monolith

- **Not** microservices at current scope.
- One Next.js process with **clear modules** (`src/services/`, `src/config/`, `app/api/` route handlers).
- Background work is async: webhook handlers fire-and-forget via `child_process.spawn()` of `.mjs` scripts; the web process itself stays responsive.

## Webhooks under burst load

During webinar/closing spikes, inline heavy work risks **timeouts / 5xx**. Pattern:

1. **Verify** (signatures, auth).
2. **Persist** event **idempotently** (or enqueue a durable job).
3. **Return 2xx quickly**.
4. **Worker** runs GHL sync, Zoom reconciliation, etc., with **retries** and **429** backoff.

This aligns with [[GHL-Multi-Location-Architecture]] (typed cursors, per-location limits) and the async direction in [[Engineering-And-Ops-Direction]].

## Job queue honesty

- If **`integration_jobs`** (or similar) is exposed, it should be **complete** or **removed** from the public surface until production-ready — avoid half-implemented paths.

## Non-goals

- **VAPI / AI voice** — dropped for the foreseeable future; clean legacy references when touching that code.

## Multi-provider credentials

- Per-**project** credentials (Zoom, future WhatsApp / closing numbers, etc.) follow the same idea as [[GHL-Multi-Location-Architecture]]: **connection records**, not only globals.

## Related

- [[NextJS-Consolidation-Architecture]]
- [[NextJS-Consolidation-Decision]]
- [[Engineering-And-Ops-Direction]]
- [[Product-Phase-Roadmap]]
- [[GHL-Webhook-Pipeline]]
- [[GHL-Sync-Operations]]
