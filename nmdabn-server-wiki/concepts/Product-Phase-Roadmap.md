# Product phase roadmap

Synthesizes program phases for this product line and how they relate to `nmdabn-server` work.

## Phases (authoritative intent from ingested source)

| Phase | Focus |
|-------|--------|
| **1** | Better data, faster decisions — **live** sales tracking dashboard, continuous refresh via pipelines. |
| **2** | Automation — orchestrate GHL (workflows, custom values, Zoom hooks) from **our** stack. |
| **3** | Nice-to-haves — TBD after Phase 2. |

## Server / data work as enabler

- GHL mirror, webhooks, and Supabase are **foundations** for Phase 1 metrics, not the product milestone by themselves.
- Zoom attendance + attribution are **inputs** to dashboard and journey.

## Open product decisions

- Definition of **showed** = Zoom **attended** (pending final sign-off).
- **Join keys** Zoom ↔ leads: typically normalized **email**.

## Related

- [[Phase-Roadmap-And-Phase-1-Dashboard]]
- [[Sales-Tracking-Dashboard-Spec-From-Sheet-Exports]]
- [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]]
- [[GHL-Sync-Operations]]
- [[Engineering-And-Ops-Direction]] · [[Platform-Engineering-Direction]] — delivery style (monorepo, hosting, non-goals).
