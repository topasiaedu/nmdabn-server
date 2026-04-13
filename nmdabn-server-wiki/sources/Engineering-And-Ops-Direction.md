# Engineering and operations direction

**Raw:** [2026-04-07-engineering-and-ops-direction.md](../raw/sources/2026-04-07-engineering-and-ops-direction.md)

## Summary

Architecture and delivery decisions from program discussion (intent; not all implemented). Covers **monorepo without shared packages**, **Render + Docker**, **modular monolith** (not microservices), **webhook burst handling** (verify → persist → async work), **VAPI as non-goal**, and **per-project integration credentials** beyond GHL (Zoom, future channels).

## Decisions (from raw)

| Topic | Direction |
|-------|-----------|
| Repo shape | Monorepo with frontend + backend; **no** `packages/shared` — duplication across apps acceptable; keep each app tree modular. |
| Hosting | **Render** with **Docker**. |
| Service style | **Modular monolith**; optional worker same image, different `CMD` — not many deployables. |
| Webhook spikes | **Fast 2xx**: verify, idempotent persist, enqueue or mark pending; heavy sync in worker with retries/backoff. |
| Jobs surface | **`integration_jobs`** / job API should be finished properly or removed from public surface until real. |
| VAPI / AI voice | **Out of scope** — treat related routes/docs as legacy / remove when cleaning. |
| Multi-provider creds | Same pattern as multi-location GHL: **credentials as data** per project/connection, not only global env. |

## Hygiene called out (audit notes)

- Production **CORS** from config, not placeholders.
- Clarify **service role** vs **user JWT + RLS** by route category as the app grows.
- **Structured logging** + **request correlation** for webhook debugging.

## Related wiki

- [[Platform-Engineering-Direction]]
- [[Product-Phase-Roadmap]]
- [[GHL-Multi-Location-Architecture]]
- [[Multi-Location-GHL-Architecture-Recommendation]]
- [[GHL-Contacts-Sync-Pagination-And-Throughput-Fix]]
