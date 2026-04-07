# Multi-location GHL architecture recommendation (raw source note)

- Source type: `agent architecture recommendation`
- Snapshot date: `2026-04-07`
- Scope: support multiple GHL subaccounts/locations mapped to app projects

## Context

Current implementation behaves as single-location at runtime:

1. Webhook pipeline filters by one global `GHL_LOCATION_ID` and skips mismatches.
2. Sync scripts read one global `GHL_LOCATION_ID`.
3. One global `GHL_PRIVATE_INTEGRATION_TOKEN` is used for all operations.

This is acceptable for one subaccount, but not for multi-project systems where each project belongs to a different GHL location/subaccount.

## Problem statement

If each project has its own GHL location, global env-based location/token causes:

1. Incorrect routing (webhooks from other valid project locations are skipped).
2. Operational friction (manual env switching for each project sync).
3. Security/scaling risk (single token blast radius, no per-project rate control).

## Recommended target architecture

Move to a multi-tenant GHL integration model.

### 1) Per-project GHL connection configuration

Create a persistent config table, e.g. `ghl_connections`:

- `id` (pk)
- `project_id` (fk to app projects)
- `ghl_location_id` (unique)
- `ghl_private_integration_token_encrypted`
- `enabled`
- `created_at`, `updated_at`
- optional metadata (`token_last_rotated_at`, `notes`)

Notes:
- Encrypt token at rest.
- Keep decryption only in trusted server path.

### 2) Webhook routing by payload location

Webhook handling should:

1. Verify signature as today.
2. Extract `payloadLocationId`.
3. Lookup enabled `ghl_connections` by `ghl_location_id`.
4. If found, dispatch sync using that connection’s credentials.
5. If not found, return 200 ignored with explicit reason (unknown location).

This replaces the single global location gate.

### 3) Sync execution inputs

Sync entry points should accept explicit runtime inputs:

- `--location-id=<...>`
- token source via:
  - `--connection-id=<...>` (recommended, server resolves token internally), or
  - direct token arg/env override for CLI admin usage

Keep backwards compatibility with env defaults for local development.

### 4) Cursor and progress model

Current `ghl_sync_cursors` is keyed by `location_id` (good baseline).
Improve semantics by adding cursor mode/type:

- `location_id`
- `sync_domain` (`contacts`, `orders`, `invoices`)
- `cursor_kind` (`search_page`, `start_after_id`, etc.)
- `cursor_value`
- `updated_at`

This avoids overloading one column with changing cursor meanings.

### 5) Worker/rate-limit isolation

Given multiple locations and 429 behavior, run sync work via queue/worker:

- queue jobs include `connection_id`, domain, and id/list mode
- apply per-location concurrency limits
- retry policy with backoff/jitter
- dead-letter for persistent failures

This aligns with existing wiki guidance that spawn-per-event is simple but may not scale.

## Migration plan (incremental)

1. **Schema**
   - add `ghl_connections`
   - add/extend cursor table for typed cursor semantics
2. **Read path**
   - build connection resolver by `ghl_location_id`
3. **Webhook**
   - replace single env location filter with config lookup routing
4. **Sync CLI/service**
   - add explicit location/connection arguments
   - keep env fallback for dev
5. **Ops**
   - add per-project sync status/last error metrics
   - add token rotation procedure

## Backward compatibility guidance

During transition:

1. Preserve current env behavior when no `ghl_connections` record is configured.
2. Log warnings when running in single-location compatibility mode.
3. Gradually migrate projects into connection table and disable global mode.

## Risks and mitigations

1. **Risk:** token leakage across projects
   - **Mitigation:** encrypted storage + strict resolver boundaries
2. **Risk:** mixed cursors after pagination strategy changes
   - **Mitigation:** typed cursor fields (`cursor_kind`)
3. **Risk:** rate-limit contention
   - **Mitigation:** per-location queue/concurrency control

## Decision summary

For multi-project, multi-subaccount GHL usage, the system should move from global env-based GHL config to project/location-scoped connection records and routed sync execution.

