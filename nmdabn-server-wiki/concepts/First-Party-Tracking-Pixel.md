# First-Party Tracking Pixel

## Definition / scope

A vanilla JavaScript IIFE (`public/tracker.js`) served as a static asset from the Next.js app. Embed once per GHL Funnel page via a `<script>` tag; it collects visitor events and sends them to the `POST /api/track` collector API, storing data in the `page_events` Postgres table.

## How it works here

### Embedding

```html
<script
  src="https://nmdabn-server.vercel.app/tracker.js"
  data-site-id="YOUR_PROJECT_UUID"
  async
></script>
```

Add `data-heatmap="true"` to enable mousemove events (off by default — high write volume).

### Session identity

| localStorage key | Value | Purpose |
|---|---|---|
| `nm_sid` | UUID | Session ID, reset after 30 min inactivity |
| `nm_last` | epoch ms | Last event time for inactivity check |
| `nm_cid` | GHL contact ID | Set when visitor submits a form |

### Events

| Trigger | `event_type` | Key fields |
|---|---|---|
| Page load | `pageview` | url, referrer, UTMs, fbclid |
| Any click | `click` | x/y (viewport %), element_tag, element_text |
| `beforeunload` | `scroll_depth` | max scroll % during visit |
| `hl-form-submitted` / form submit | `optin` | url, UTMs, ghl_contact_id |
| GHL form submit (detail) | `identify` | ghl_contact_id — links session retroactively |
| mousemove (heatmap mode) | `mousemove` | x/y viewport %, throttled 1/sec |

### Event flush

Events are queued locally and flushed:
- Every 5 seconds via `setInterval`
- On `beforeunload` and `pagehide`
- Transport: `fetch(ENDPOINT, { method: "POST", keepalive: true, credentials: "omit" })` — `credentials: "omit"` is required to avoid CORS conflict with wildcard `Access-Control-Allow-Origin: *` (sendBeacon defaults to `credentials: 'include'` which would fail)

### Collector API (`app/api/track/route.ts`)

- Public endpoint, no auth required
- Validates `site_id` against `projects` table; unknown site_id returns 200 with `ignored: true` (avoids leaking project existence)
- Caps events at 50 per batch
- Uses `after()` from `next/server` to defer DB insert after HTTP response
- Single `supabase.from("page_events").insert(rows)` per batch

### Opt-in linkage

When GHL fires `hl-form-submitted`, the tracker:
1. Reads `event.detail.contact_id` (or `contactId`)
2. Stores contact ID in `nm_cid` localStorage key
3. Sends `identify` event (links all prior session events to the contact)
4. Sends `optin` event

### Joining with journey_events

`page_events.ghl_contact_id` joins to `ghl_contacts.id` and through that to `journey_events.contact_id`. This enables full-funnel analysis: ad spend → page view → opt-in → show up → purchase.

### Heatmap (Phase 2)

`page_events` has `x`, `y` columns (viewport %) and `event_type='mousemove'`. Rendering heatmaps requires normalising coordinates against the page layout at different viewport sizes — deferred to Phase 2. Data collection is ready from day one.

## Related

- [[Custom-Tracking-Pixel-Design]]
- [[Buyer-Journey-Event-Store]]
- [[GHL-ContactCreate-Optin-Hook]]
- `../docs/database/migrations/033_page_events.sql`
- `../public/tracker.js`
- `../app/api/track/route.ts`
- [[GoHighLevel]]
