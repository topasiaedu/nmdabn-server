# Multi-location GHL architecture recommendation

**Raw snapshot:** [2026-04-07-agent-multi-location-ghl-architecture-recommendation.md](../raw/sources/2026-04-07-agent-multi-location-ghl-architecture-recommendation.md)

## Summary

This source proposes moving from single global GHL runtime config (`GHL_LOCATION_ID`, `GHL_PRIVATE_INTEGRATION_TOKEN`) to a project/location-scoped integration model for multi-project systems.

Primary recommendation: introduce `ghl_connections` (per-project location + encrypted token), route webhooks by `payloadLocationId`, and execute sync work using resolved per-connection credentials.

## Why

Single-location globals cause:

- valid webhooks from other project locations to be skipped
- manual env switching for sync operations
- larger blast radius for one token and no per-location throttling boundaries

## Proposed architecture highlights

- `ghl_connections` table keyed by `ghl_location_id` and linked to `project_id`
- webhook routing lookup by payload location
- sync commands accept explicit runtime identifiers (`connection_id`/`location_id`) with dev fallbacks
- typed cursor semantics (`cursor_kind`, `cursor_value`) to avoid cursor overload
- queue/worker model for per-location rate-limit isolation

## Related wiki

- [[GHL-Multi-Location-Architecture]]
- [[GHL-Webhook-Pipeline]]
- [[GHL-Sync-Operations]]
