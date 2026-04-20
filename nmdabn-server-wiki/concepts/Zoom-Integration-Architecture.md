# Zoom integration architecture

## Definition / scope

How this platform authenticates with Zoom, stores credentials per project, exchanges tokens, and calls participant report APIs. Covers Server-to-Server OAuth only (user-level OAuth is out of scope).

## How it works here

### Credential storage

Zoom credentials are stored in the existing `integration_accounts` table (`provider = 'zoom'`). Three fields are required for Zoom S2S OAuth:

| Field | Meaning |
|-------|---------|
| `account_id` | Zoom account ID (from Zoom Marketplace app) |
| `client_id` | OAuth app client ID |
| `client_secret` | OAuth app client secret (**must be encrypted at rest**) |

The table is workspace-scoped. Each project links to one Zoom account via `projects.zoom_integration_account_id` (FK to `integration_accounts.id`). A workspace can have multiple Zoom accounts (one per project, or shared if projects share an account).

### Per-project scoping

Each project has its own Zoom account. The link is:

```
webinar_run.project_id
  → projects.zoom_integration_account_id
  → integration_accounts (client_id, client_secret, account_id)
```

This follows the credentials-as-data pattern established for GHL in [[GHL-Multi-Location-Architecture]].

### Token exchange (S2S OAuth)

```
POST https://accounts.zoom.us/oauth/token
  ?grant_type=account_credentials
  &account_id={account_id}
Authorization: Basic base64(client_id:client_secret)
```

Response contains a `Bearer` token valid for **1 hour**. The token service must cache the token in memory keyed on `integration_account_id`; do not re-exchange on every API call.

### Security: client_secret at rest

`client_secret` must be **encrypted** before insert and **decrypted** in the token service. The encryption approach (AES-256-GCM with an application-level env key, or Supabase Vault) is an [[Phase-1-Open-Decisions|open decision]] that must be resolved before Zoom credentials go to production. All other fields (`client_id`, `account_id`) are non-secret and can be stored plaintext.

### RLS audit

`integration_accounts` RLS policies must prevent rows from being read across workspaces. Verify this before the Zoom credentials UI goes live.

### Admin UI

A credentials page where the operator pastes `account_id`, `client_id`, `client_secret`. Before saving, the server performs a test token exchange. If the exchange succeeds the credentials are saved; if it fails the operator sees an error. This prevents storing invalid credentials silently.

## API endpoints used

| Use | Zoom endpoint |
|-----|---------------|
| Fetch meeting participants | `GET /v2/report/meetings/{meetingId}/participants` |
| Fetch webinar participants | `GET /v2/report/webinars/{webinarId}/participants` |

Both return paginated results via `next_page_token`. The sync service must follow all pages. See [[Webinar-Run-Zoom-Linkage]] for how the correct endpoint is chosen per webinar run.

## Related

- [[Zoom-Attendance-Segments-And-Journey]] (segment ingest + rollup shipped; recording UX notes optional)
- [[Webinar-Run-Zoom-Linkage]]
- [[Phase-1-Execution-Plan-And-Zoom-Design]]
- [[Buyer-Journey-Event-Store]]
- [[GHL-Multi-Location-Architecture]]
- [[Phase-1-Open-Decisions]]
- `../src/routes/integrations.ts` — existing `POST /api/integrations/accounts/zoom`
- `../docs/database/migrations/012_*.sql` (planned)

## Contradictions / history

- Prior wiki and raw notes described Zoom as "manual export stand-in for Phase 1." This is superseded. Decided 2026-04-13: go straight to full S2S API integration; manual import is skipped.
