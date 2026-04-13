# Phase roadmap and Phase 1 dashboard (source of truth)

- Source type: `product / program definition`
- Snapshot date: `2026-04-07`
- Status: `authoritative intent`; implementation order may shift

## Program phases

### Phase 1 — Better data, faster decisions

**Goal:** See **all relevant data** in one place and run the **sales tracking dashboard** continuously updated (not a one-off “generate on click” report).

**Primary artifact:** A **dedicated app page** (in the future monorepo frontend) where the dashboard **lives**; underlying data **refreshes** as pipelines run (sync, imports, webhooks).

**Non-goal for Phase 1:** Deep GHL workflow automation (that is Phase 2).

### Phase 2 — Automation

**Goal:** Use **GoHighLevel API** to extend automation already built inside GHL: workflows (enroll/update contacts), **Zoom** lifecycle where applicable, **custom values**, and other CRM-side actions. Webinar funnel logic remains largely **custom-field and journey-driven** in GHL today; Phase 2 pushes orchestration from **our** stack.

### Phase 3 — Nice-to-haves

**Status:** **TBD** after Phase 2, prioritized by whatever the business needs most.

## Relationship to engineering work

- **Supabase + GHL mirror + webhooks** are **enablers** for Phase 1 truth, not the product milestone by themselves.
- **Zoom attendance** and **lead attribution** are **inputs** to the same dashboard and later **buyer journey** views.

## Open decisions (explicit)

- Exact **definition** of “showed” for reporting: **attended** (Zoom), aligned with current manual process.
- Authoritative **join keys** between Zoom participants and leads (typically **normalized email**).
