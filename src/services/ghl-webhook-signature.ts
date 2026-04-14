import { createPublicKey, createVerify, verify } from "node:crypto";

/**
 * Header bag compatible with Node `IncomingHttpHeaders` and plain objects built from `Headers` / `NextRequest`.
 */
export type WebhookHeaderBag = Record<string, string | string[] | undefined>;

/**
 * Builds a header bag from Fetch API `Headers` (e.g. `NextRequest.headers`) for signature verification.
 */
export function webhookHeaderBagFromHeaders(headers: Headers): WebhookHeaderBag {
  const out: WebhookHeaderBag = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Official HighLevel webhook signing keys (marketplace docs — Webhook Integration Guide).
 * Prefer X-GHL-Signature (Ed25519); X-WH-Signature (RSA-SHA256) is legacy until July 2026.
 */
const GHL_ED25519_PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=\n" +
  "-----END PUBLIC KEY-----";

const GHL_LEGACY_RSA_PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSCFrm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfBcsedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpvuxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKUJ062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXpIocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzNh/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhCHULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJPQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAykT1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==\n" +
  "-----END PUBLIC KEY-----";

function headerValue(
  headers: WebhookHeaderBag,
  name: string
): string | undefined {
  const key = name.toLowerCase();
  const v = headers[key];
  if (typeof v === "string") {
    return v;
  }
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") {
    return v[0];
  }
  return undefined;
}

/**
 * Verifies the raw webhook body bytes (UTF-8 string must match the wire payload exactly).
 */
export function verifyGhlWebhookSignature(
  rawBodyUtf8: string,
  headers: WebhookHeaderBag
): { ok: true } | { ok: false; reason: string } {
  const ghlSig = headerValue(headers, "x-ghl-signature");
  const legacySig = headerValue(headers, "x-wh-signature");

  if (
    ghlSig !== undefined &&
    ghlSig !== "" &&
    ghlSig !== "N/A"
  ) {
    try {
      const key = createPublicKey(GHL_ED25519_PUBLIC_KEY_PEM);
      const payloadBuffer = Buffer.from(rawBodyUtf8, "utf8");
      const signatureBuffer = Buffer.from(ghlSig, "base64");
      const ok = verify(null, payloadBuffer, key, signatureBuffer);
      if (ok) {
        return { ok: true };
      }
      return { ok: false, reason: "X-GHL-Signature verification failed" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return { ok: false, reason: msg };
    }
  }

  if (
    legacySig !== undefined &&
    legacySig !== "" &&
    legacySig !== "N/A"
  ) {
    try {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(rawBodyUtf8);
      verifier.end();
      const ok = verifier.verify(
        GHL_LEGACY_RSA_PUBLIC_KEY_PEM,
        legacySig,
        "base64"
      );
      if (ok) {
        return { ok: true };
      }
      return { ok: false, reason: "X-WH-Signature verification failed" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return { ok: false, reason: msg };
    }
  }

  return { ok: false, reason: "Missing X-GHL-Signature and X-WH-Signature" };
}
