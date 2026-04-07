# Express raw body for GHL webhooks

## Problem

HighLevel signs the **exact** HTTP body. If Express parses JSON first:

- Whitespace, key order, or Unicode normalization can change the serialized form.
- The verifier compares the signature to a **reconstructed** string that may not match what GHL signed → spurious **401** errors.

## What this repo does

In `../src/index.ts`, the GHL route is registered **before** the global `express.json()` middleware (order matters), and uses:

```typescript
express.raw({ type: "*/*", limit: "10mb" }),
ghlWebhookHandler
```

The handler treats `req.body` as a **`Buffer`**, converts to UTF-8 **once**, uses that string for both **verify** and **JSON.parse**.

## Rules of thumb

- **Do not** put `express.json()` ahead of this route for the same path.
- **Do not** stringify parsed objects and verify the string — you are no longer on the signed bytes.
- **Proxies:** must forward the raw body unchanged if they terminate TLS in front of Node.

## Related

- [[GHL-Webhook-Security]]
- [[GHL-Webhook-Pipeline]]
- [[GHL-Webhooks]]
