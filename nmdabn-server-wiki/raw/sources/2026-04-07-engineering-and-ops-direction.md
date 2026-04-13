# Engineering and operations direction (from program discussion)

- Source type: `architecture / delivery decisions`
- Snapshot date: `2026-04-07`
- Scope: Repo layout, hosting, scale pattern, explicit non-goals discussed in planning (not necessarily implemented yet)

## Monorepo without shared packages

- Prefer a **monorepo** that holds **frontend and backend** so the **source of truth stays in one place** and contracts do not drift across repos.
- **Do not** add a `packages/shared` (or similar) shared library: types, utils, and helpers stay **inside each app folder** (e.g. under `frontend/` and `backend/`). **Duplication** between apps is acceptable if **modularization within each tree** is clean.
- Rationale: avoids painful extraction later if the repo is ever split; each app remains self-contained.

## Hosting

- **Render** with **Docker** is the likely deployment target (configure services, health checks, env per service as Render requires).

## Architecture style

- **Not** a microservice architecture for this product — **scope is too large for the value**.
- Target a **modular monolith**: clear modules inside one API process; optional **background worker** (same image, different `CMD`) if async work is needed — still one codebase, not many deployables.

## Scale and webhooks (webinar / closing spikes)

- Expect **burst traffic** on webhook endpoints during high-intensity windows (e.g. webinar night, closing). Risk is **timeout / 5xx** if heavy work runs inline on the HTTP request.
- Directional pattern: **verify → persist idempotently → enqueue or mark pending → return 2xx quickly**; **worker** performs GHL sync, Zoom reconciliation, etc., with **retries/backoff** (e.g. 429). Aligns with typed cursors and per-project rate limits in [[Multi-Location-GHL-Architecture-Recommendation]].
- Existing **`integration_jobs`** / job plumbing in repo should be **either completed properly or removed** from the public surface until it is real (avoid half-implemented paths).

## Explicit non-goals (current company direction)

- **VAPI / AI voice calling** — **dropped**; not planned for the foreseeable future. Treat VAPI-related routes/docs as **legacy or to be removed** when cleaning the codebase.

## Multi-project credentials (beyond GHL)

- Each **project** may use **different integration credentials** (e.g. **Zoom**, future **WhatsApp / personal closing numbers**). This extends the same principle as multi-location GHL: **credentials as data** (per project or connection row), not only global env vars.
- See [[GHL-Multi-Location-Architecture]] for GHL-specific shape; other providers should follow a **similar connection model** when implemented.

## Optional hygiene (from codebase audit, not product spec)

- Production **CORS** should come from config, not placeholders.
- Clarify **Supabase service role** vs **user JWT + RLS** per route category as the app grows.
- Prefer **structured logging** and **request correlation** for webhook debugging.

## Related

- [[Product-Phase-Roadmap]]
- [[GHL-Multi-Location-Architecture]]
- `raw/sources/2026-04-07-agent-multi-location-ghl-architecture-recommendation.md`
- `raw/sources/2026-04-07-agent-ghl-contacts-sync-pagination-and-throughput-fix.md`
