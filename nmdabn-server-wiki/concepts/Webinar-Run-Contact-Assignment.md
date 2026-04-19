# Webinar Run — Contact Assignment

## Definition / scope

`ghl_contacts.webinar_run_id` links each synced contact to a specific webinar run. This link
is essential for all four dashboard RPCs — contacts without a `webinar_run_id` are invisible
to the dashboards because every RPC joins on `c.webinar_run_id = r.run_id`.

The assignment logic (backfill): for a given contact, find the first `webinar_runs` row for
the same `location_id` where `event_start_at > contact.date_added`. This assumes the contact
registered for (or will attend) the next scheduled run after their opt-in date.

---

## How it works here

### Assignment at webhook time (per-contact)

`src/services/ghl-webhook-post.ts` calls `assignNextWebinarRunForContactId(contactId)` after
upserting each contact received via a live GHL webhook event.

`src/services/assign-webinar-run.ts` wraps the RPC:

```typescript
await supabase.rpc("assign_next_webinar_run_for_contact", { p_contact_id });
```

SQL (migration 007):
```sql
SELECT r.id INTO v_run_id
FROM public.webinar_runs r
WHERE r.location_id = v_location_id
  AND COALESCE(r.is_active, TRUE)
  AND r.event_start_at > v_opt_in
ORDER BY r.event_start_at ASC, r.sort_order NULLS LAST, r.id ASC
LIMIT 1;
```

### Bulk backfill (all contacts for a location)

`backfill_webinar_runs_for_location(p_location_id TEXT)` (migration 007) runs the same logic
for all contacts in a location in a single `UPDATE … FROM (SELECT …)` statement. Returns the
count of rows updated.

### Backfill call after bulk sync (fixed 2026-04-13)

**Problem discovered:** `runGhlFullContactSyncForConnectionId` (the bulk GHL sync script
invocation) did **not** call the backfill RPC. As a result, all 5,061 CAE contacts imported
via the "Sync GHL" button had `webinar_run_id = null`, causing all dashboards to return empty.

**Fix applied:**  `app/api/actions/sync/ghl/route.ts` now includes after the contact sync:

```typescript
const { error: backfillError } = await supabase.rpc(
  "backfill_webinar_runs_for_location",
  { p_location_id: row.ghl_location_id }
);
if (backfillError !== null) {
  console.warn("backfill failed:", backfillError.message);
}
```

`ghl_connections` is now selected with `id, ghl_location_id` (was `id` only) to supply the
location ID needed by the backfill call.

---

## Assignment correctness assumptions

| Assumption | Implication if violated |
|---|---|
| One run per "time slot" for the location | Backfill may assign contacts to the wrong run if two runs overlap |
| Contact's `date_added` approximates registration date | Contacts whose actual registration predates their GHL `date_added` may land on a later run |
| Future runs exist beyond the last contact's `date_added` | Contacts added after the final `event_start_at` get `webinar_run_id = null` |

When the last run was 2026-03-19 (CAE) and contacts were synced on 2026-04-08, any contact
with `date_added > 2026-03-19` would have received `webinar_run_id = null` even after the
backfill. Future runs should be imported promptly to keep the assignment coverage current.

---

## Debugging checklist

If dashboards show empty even though contacts are synced:

1. Verify at least one `webinar_runs` row has `project_id = <project_id>`.
2. Query: `SELECT COUNT(*) FROM ghl_contacts WHERE location_id = '<loc>' AND webinar_run_id IS NULL`.
3. If > 0: run `SELECT backfill_webinar_runs_for_location('<location_id>')` in the Supabase SQL editor.
4. Check that future runs have been added so new contacts can be assigned.

---

## Related

- [[Dashboard-Architecture-Redesign-All-Runs]] — context and debug session
- [[All-Runs-Column-Table]] — why the assignment is needed (RPC join)
- [[Webinar-Run-Zoom-Linkage]] — webinar run creation and Zoom linkage
- [[GHL-Sync-Operations]] — bulk sync architecture that was missing the backfill call
- `../docs/database/migrations/007_traffic_dashboard_functions.sql` — `assign_next_webinar_run_for_contact` + `backfill_webinar_runs_for_location`
- `../src/services/assign-webinar-run.ts`
- `../src/services/ghl-webhook-post.ts`
- `../app/api/actions/sync/ghl/route.ts`

## Contradictions / history

- Prior to 2026-04-13 the bulk sync route did not call the backfill. The webhook handler did.
  This caused a silent data gap: contacts looked synced in the DB but were invisible to
  dashboards because they had no `webinar_run_id`.
