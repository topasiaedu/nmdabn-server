# Phase roadmap and Phase 1 dashboard

**Raw:** [2026-04-07-phase-roadmap-and-phase-1-dashboard.md](../raw/sources/2026-04-07-phase-roadmap-and-phase-1-dashboard.md)

## Summary

Authoritative **product/program** intent (snapshot date in filename). Three phases: **Phase 1** continuous sales-tracking dashboard with refreshed data; **Phase 2** GHL-centric automation (API, workflows, Zoom where applicable); **Phase 3** TBD.

## Phase 1 (Better data, faster decisions)

- **Goal:** All relevant data in one place; dashboard **lives** in the app (future monorepo frontend), data **refreshes** via pipelines (sync, imports, webhooks)—not one-off report generation.
- **Non-goal:** Deep GHL workflow automation (Phase 2).

## Engineering relationship

- **Supabase + GHL mirror + webhooks** are **enablers** for Phase 1 truth, not the milestone alone.
- **Zoom attendance** and **lead attribution** feed the same dashboard and later buyer-journey views.

## Open decisions (from raw)

- **“Showed”** definition: align with **attended** (Zoom), per current manual process.
- **Join keys** between Zoom participants and leads: typically **normalized email**.

## Related wiki

- [[Product-Phase-Roadmap]]
- [[Sales-Tracking-Dashboard-Spec-From-Sheet-Exports]]
- [[Buyer-Journey-Tracking-Zoom-GHL-First-Party]]
- [[Supabase-GHL-Mirror]]