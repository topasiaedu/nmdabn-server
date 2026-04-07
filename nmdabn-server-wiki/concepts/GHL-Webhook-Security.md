# GHL webhook security

How inbound GoHighLevel webhooks are authenticated and what can go wrong.

## Trust model

- **Assumption:** Only HighLevel (or anyone with the signing key material) can produce valid signatures over a given body.
- **Defense in depth:** `GHL_LOCATION_ID` drops events for other sub-accounts even if something misroutes a payload.

## Signature algorithm and headers

- **Preferred:** `X-GHL-Signature` — **Ed25519** over the raw body (UTF-8 bytes as received).
- **Legacy:** `X-WH-Signature` — **RSA-SHA256** during marketplace transition; code comments reference **July 2026** for legacy relevance.
- **Implementation:** `../src/services/ghl-webhook-signature.ts` embeds the **official PEM public keys** from the marketplace Webhook Integration Guide (keep in sync if GHL rotates keys).

## Skip verification (development only)

- Env: `GHL_WEBHOOK_SKIP_VERIFY=true` or `1`.
- **Gated:** Only when `NODE_ENV` is **not** `production`. Otherwise verification still runs.
- **Use case:** Local tools or proxies that cannot reproduce GHL headers.
- **Risk:** Any caller could POST arbitrary JSON and trigger sync/delete paths → **never** enable in production.

## Common failure modes

| Symptom | Likely cause |
|---------|----------------|
| 401 Invalid signature | Body altered (JSON pretty-print, charset, gzip, wrong middleware order) |
| 400 Expected raw JSON body | Route hit without `express.raw` or body parser consumed buffer |
| 200 skipped location_mismatch | Event for a different GHL location than `GHL_LOCATION_ID` |

## Related

- [[Express-Raw-Webhook-Body]] — why `express.json()` must not run first for this route
- [[GHL-Webhooks]] — env table including `GHL_WEBHOOK_SKIP_VERIFY`
- [[GHL-Webhook-Pipeline]] — where verify sits in the handler
