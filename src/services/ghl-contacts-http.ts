import { env } from "@/config/env";
import type { GhlWebhookCredentials } from "@/services/ghl-connection-resolve";

const GHL_BASE = "https://services.leadconnectorhq.com";

function apiVersion(): string {
  return env.ghl?.apiVersionContacts ?? "2021-07-28";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * POST /contacts/search — returns first matching contact id or null.
 */
export async function ghlSearchContactByEmail(
  creds: GhlWebhookCredentials,
  email: string
): Promise<string | null> {
  const trimmed = email.trim().toLowerCase();
  if (trimmed === "") {
    return null;
  }

  const url = `${GHL_BASE}/contacts/search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.privateIntegrationToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Version: apiVersion(),
    },
    body: JSON.stringify({
      locationId: creds.locationId,
      page: 1,
      pageLimit: 5,
      query: trimmed,
    }),
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { _raw: text };
  }

  if (!res.ok) {
    const preview =
      typeof body === "object" && body !== null
        ? JSON.stringify(body).slice(0, 400)
        : String(body);
    throw new Error(`GHL search failed ${res.status}: ${preview}`);
  }

  if (!isRecord(body)) {
    return null;
  }
  const contacts = body.contacts;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return null;
  }
  const first = contacts[0];
  if (!isRecord(first) || typeof first.id !== "string" || first.id === "") {
    return null;
  }
  return first.id;
}

/**
 * GET /contacts/:id — full JSON body (envelope + contact) as returned by GHL.
 */
export async function ghlGetContactDetail(
  creds: GhlWebhookCredentials,
  contactId: string
): Promise<unknown> {
  const url = `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.privateIntegrationToken}`,
      Accept: "application/json",
      Version: apiVersion(),
    },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { _raw: text };
  }

  if (!res.ok) {
    const preview =
      typeof body === "object" && body !== null
        ? JSON.stringify(body).slice(0, 400)
        : String(body);
    throw new Error(`GHL get contact failed ${res.status}: ${preview}`);
  }

  return body;
}

/**
 * GET /contacts/:id — returns tags array from nested contact.
 */
export async function ghlGetContactTags(
  creds: GhlWebhookCredentials,
  contactId: string
): Promise<string[]> {
  const url = `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.privateIntegrationToken}`,
      Accept: "application/json",
      Version: apiVersion(),
    },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { _raw: text };
  }

  if (!res.ok) {
    const preview =
      typeof body === "object" && body !== null
        ? JSON.stringify(body).slice(0, 400)
        : String(body);
    throw new Error(`GHL get contact failed ${res.status}: ${preview}`);
  }

  if (!isRecord(body)) {
    return [];
  }
  const inner = isRecord(body.contact) ? body.contact : body;
  const tags = inner.tags;
  if (!Array.isArray(tags)) {
    return [];
  }
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t === "string" && t.trim() !== "") {
      out.push(t.trim());
    }
  }
  return out;
}

/**
 * POST /contacts — create contact; returns new contact id.
 */
export async function ghlCreateContact(
  creds: GhlWebhookCredentials,
  args: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    tags: string[];
  }
): Promise<string> {
  const url = `${GHL_BASE}/contacts/`;
  const body: Record<string, unknown> = {
    locationId: creds.locationId,
    email: args.email.trim().toLowerCase(),
    firstName: args.firstName.trim() === "" ? "Unknown" : args.firstName.trim(),
    lastName: args.lastName.trim() === "" ? "." : args.lastName.trim(),
    tags: args.tags,
  };
  if (args.phone.trim() !== "") {
    body.phone = args.phone.trim();
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.privateIntegrationToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Version: apiVersion(),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    parsed = { _raw: text };
  }

  if (!res.ok) {
    /** Full body on duplicate errors so callers can read `meta.contactId`. */
    const preview =
      res.status === 400 &&
      typeof parsed === "object" &&
      parsed !== null &&
      isRecord(parsed) &&
      typeof parsed.message === "string" &&
      parsed.message.includes("duplicated contacts")
        ? JSON.stringify(parsed)
        : typeof parsed === "object" && parsed !== null
          ? JSON.stringify(parsed).slice(0, 500)
          : String(parsed);
    throw new Error(`GHL create contact failed ${res.status}: ${preview}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("GHL create contact: invalid response");
  }
  const inner = isRecord(parsed.contact) ? parsed.contact : parsed;
  const id = inner.id;
  if (typeof id !== "string" || id === "") {
    throw new Error("GHL create contact: missing id in response");
  }
  return id;
}

/**
 * Parses `GHL create contact failed …` errors when HighLevel rejects a duplicate
 * (same phone or email). Returns the existing contact id from `meta.contactId`.
 */
export function extractDuplicateContactIdFromGhlCreateError(
  err: unknown
): string | null {
  if (!(err instanceof Error)) {
    return null;
  }
  const m = /^GHL create contact failed \d+: ([\s\S]+)$/.exec(err.message);
  if (m === null || m[1] === undefined) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1].trim()) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const msg = parsed.message;
  if (
    typeof msg !== "string" ||
    !msg.toLowerCase().includes("duplicated contacts")
  ) {
    return null;
  }
  const meta = parsed.meta;
  if (!isRecord(meta)) {
    return null;
  }
  const cid = meta.contactId;
  if (typeof cid !== "string" || cid.trim() === "") {
    return null;
  }
  return cid.trim();
}

/**
 * PUT /contacts/:id — merge tags with existing (dedupe, case-sensitive as GHL stores).
 */
export async function ghlMergeContactTags(
  creds: GhlWebhookCredentials,
  contactId: string,
  tagsToAdd: string[]
): Promise<void> {
  const existing = await ghlGetContactTags(creds, contactId);
  const merged = [...existing];
  for (const t of tagsToAdd) {
    const trimmed = t.trim();
    if (trimmed !== "" && !merged.includes(trimmed)) {
      merged.push(trimmed);
    }
  }

  const url = `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${creds.privateIntegrationToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Version: apiVersion(),
    },
    body: JSON.stringify({
      tags: merged,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
    const preview =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed).slice(0, 500)
        : String(parsed);
    throw new Error(`GHL update contact tags failed ${res.status}: ${preview}`);
  }
}
