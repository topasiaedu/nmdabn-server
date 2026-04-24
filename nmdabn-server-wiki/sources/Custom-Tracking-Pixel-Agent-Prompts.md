# Custom Tracking Pixel — Agent Implementation Prompts

**Raw:** `raw/sources/2026-04-22-custom-tracking-pixel-agent-prompts.md`
**Status:** Implemented — all three agents completed.

## Summary

Three structured Gemini agent prompts for implementing the custom tracking pixel. Agent 1 handled the DB migration, database types, and collector API. Agents 2 and 3 ran in parallel: Agent 2 wrote `public/tracker.js`; Agent 3 created the GHL ContactCreate → journey_event hook. All implemented successfully.

## Key facts

- **Agent 1:** `033_page_events.sql` migration, `src/database.types.ts` update (`page_events` table), `app/api/track/route.ts` collector
- **Agent 2:** `public/tracker.js` IIFE with session management, UTM capture, event queue, click/scroll/optin/mousemove listeners
- **Agent 3:** `src/services/ghl-contact-optin-journey.ts` + update to `ghl-webhook-post.ts`
- Post-implementation fix: replaced `navigator.sendBeacon` with `fetch(..., keepalive: true)` to resolve CORS error (sendBeacon defaults to `credentials: 'include'`, incompatible with wildcard `Access-Control-Allow-Origin: *`)

## Open questions

- None — all tasks implemented.

## Related

- [[Custom-Tracking-Pixel-Design]]
- [[First-Party-Tracking-Pixel]]
