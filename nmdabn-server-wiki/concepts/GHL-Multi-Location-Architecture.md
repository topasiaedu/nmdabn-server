# GHL multi-location architecture

Design target for supporting multiple GoHighLevel subaccounts/locations mapped to app projects.

## Problem with current single-location mode

Global env-based config (`GHL_LOCATION_ID`, one token) only cleanly supports one location:

- webhook events from other valid locations are skipped
- sync workflows require env switching
- one token has broad operational blast radius

## Recommended model

1. Add project-scoped connection records (`ghl_connections`) containing location id, encrypted token, and enabled state.
2. Route webhooks by payload location lookup instead of one global equality check.
3. Run sync by explicit connection context (prefer `connection_id`), not implicit global env.
4. Split cursor semantics into typed fields (`cursor_kind`, `cursor_value`) to avoid overloaded state.
5. Move high-volume execution to queue/worker with per-location concurrency limits.

## Migration strategy

- Keep backwards-compatible env fallback for local/single-location mode.
- Introduce warnings when fallback mode is used.
- Migrate projects incrementally into `ghl_connections`.

## Related

- [[Multi-Location-GHL-Architecture-Recommendation]]
- [[GHL-Webhook-Pipeline]]
- [[GHL-Sync-Operations]]
