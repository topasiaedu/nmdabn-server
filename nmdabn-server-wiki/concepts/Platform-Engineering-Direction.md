# Platform engineering direction

Synthesis of **how we build and run** the product stack: repo layout, deployment shape, request handling under load, and explicit non-goals.

## Monorepo, no shared package layer

- One repo for **frontend + backend** so contracts stay aligned.
- **Avoid** a cross-app `packages/shared` library; keep types and helpers **inside** `frontend/` and `backend/` (or equivalent). Duplication is acceptable if each tree stays clean.

## Deployment

- Target **Render** with **Docker** (per-service env and health checks as Render requires).

## Modular monolith

- **Not** microservices at current scope.
- One API process with **clear modules**; optional **background worker** from the **same** image for async work.

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

- [[Engineering-And-Ops-Direction]]
- [[Product-Phase-Roadmap]]
- [[GHL-Webhook-Pipeline]]
- [[GHL-Sync-Operations]]
