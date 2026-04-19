# Zoom attendance segments + journey rollup — design note (raw)

**Captured:** 2026-04-15  
**Status:** Product / architecture intent — **not yet implemented** in `docs/database/migrations/` or application code.  
**Context:** Follow-up to current Zoom participant sync (`journey_events` only) and UI progress for multi-run sync.

---

## 1. Audience curve (drop-off / peak concurrent)

**Goal:** Chart **where attendance drops** or **peaks** over the webinar timeline. The chart does **not** need to show *who* was in the room at each instant—only **counts** (or similar aggregates) over time.

**Data approach:** Derive a **time series** from Zoom participant report facts:

- Use per-participant **`join_time`**, **`leave_time`**, and **`duration`** (or equivalent fields returned by the Reports API).
- Build **concurrent viewer count** over time (interval sweep or fixed buckets, e.g. one minute).

**Recording + playback (deferred / light UX):**

- Optional: show **cloud recording** near the chart so operators can **scrub manually** to the rough time—no requirement for graph-click-to-seek or server-side full-file download to disk.
- Zoom **Cloud Recording** API (`GET /meetings/{meetingId}/recordings`) exposes **`play_url`** (playback) and **`download_url`** (file pull); private recordings need `access_token` on the URL per Zoom docs. No commitment to deep player integration in v1.

---

## 2. User journey — join / leave detail vs collapsed “attended X mins”

**Goal:** In the **user journey** UI:

- **Collapsed:** one line — person **attended for X minutes** (rollup).
- **Expanded:** every **join** and **leave** (including **multiple** re-entries).

**Data approach:** Persist **segment-level** rows (each contiguous presence or each API line as appropriate), then compute rollup for display.

---

## 3. Show Up dashboard — binary “attended”

**Goal:** For Show Up, only **whether** the contact **attended** matters: if Zoom email **matches** the known contact, **any** presence (even **1 second**) counts as **attended = 1** for that run.

**Data approach:** Keep a **single boolean-style fact** per contact per webinar run at the dashboard layer—either one `journey_events` row meaning “attended this run” or an equivalent rule derived from segments.

---

## 4. Zoom email ≠ GHL email — app-only contact

**Goal:** When someone joins Zoom with an **email that does not match** an existing GHL-mirrored contact, **create a contact in our app** only — **do not** push/create that person in GoHighLevel.

**Data approach:** Local contact record (or flagged row on `ghl_contacts` with **no GHL sync** / `sync_to_ghl = false` / absence of outbound mirror), scoped to **project**, keyed by normalized email (and optional Zoom participant id when available). Journey and attendance link to this `contact_id`.

---

## 5. Decided storage split (schema direction)

| Layer | Role |
|-------|------|
| **`zoom_attendance_segments`** (new dedicated table) | Append-only or idempotent **facts**: one row per segment (or per join/leave pair), `webinar_run_id`, `project_id`, `zoom_meeting_id`, timestamps, `duration_seconds`, optional `raw_payload` jsonb, `contact_id` (nullable until linked), idempotency key from Zoom fields. |
| **`journey_events`** | **Rollup / journey signal:** at minimum **“attended this run”** for Show Up and journey summary; optional aggregate fields (`duration_seconds` sum, first/last join in payload). |

Relationship: segments link to `contact_id`; the journey row references the same contact + `webinar_run_id`. Optional FK `parent_journey_event_id` from segment → summary row if useful.

---

## 6. Implementation notes (for future agents)

- Current code path: `src/services/zoom-participants-sync.ts` inserts **`journey_events`** only; segment table does not exist yet.
- Idempotency for segments must tolerate **re-sync** (hash or natural key from meeting + participant identity + `join_time`).
- **Show up** metric: unchanged rule at product level — **any** linked attendance for run + contact → count **1**.
- **Duplicate row reads:** `maybeSingle()` + `limit(1)` pattern applied 2026-04-15 for existing journey/contact lookups when duplicates exist in DB (operational fix, separate from segments schema).

---

## 7. Related wiki (pre-change)

- [[Buyer-Journey-Event-Store]]
- [[Zoom-Integration-Architecture]]
- [[Webinar-Run-Zoom-Linkage]]
- [[Phase-1-Build-Order]]

(Path references above are Obsidian wikilinks inside the vault; this file lives under `raw/sources/` and is the **frozen** design input for ingest.)
