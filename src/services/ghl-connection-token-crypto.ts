import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM IV length (bytes). */
const GCM_IV_LENGTH = 12;

/** AES-256-GCM auth tag length (bytes). */
const GCM_TAG_LENGTH = 16;

/** First byte of wire format; bump when algorithm changes. */
const WIRE_VERSION = 1;

/**
 * Parses a 32-byte AES key from env: base64 (44-char typical) or 64 hex chars.
 *
 * @param raw - Raw env string (non-empty after trim).
 * @returns 32-byte key material.
 */
export function parseGhlConnectionTokenEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error("GHL_CONNECTION_TOKEN_ENCRYPTION_KEY is empty");
  }
  const fromBase64 = Buffer.from(trimmed, "base64");
  if (fromBase64.length === 32) {
    return fromBase64;
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  throw new Error(
    "GHL_CONNECTION_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64) or be 64 hex characters"
  );
}

/**
 * Loads and parses the encryption key from `process.env.GHL_CONNECTION_TOKEN_ENCRYPTION_KEY`.
 */
export function loadGhlConnectionTokenEncryptionKeyFromEnv(): Buffer {
  const raw = process.env.GHL_CONNECTION_TOKEN_ENCRYPTION_KEY;
  if (raw === undefined || raw.trim() === "") {
    throw new Error("Missing GHL_CONNECTION_TOKEN_ENCRYPTION_KEY");
  }
  return parseGhlConnectionTokenEncryptionKey(raw);
}

/**
 * Encrypts a GHL private integration token for storage in `ghl_connections`.
 *
 * @param plaintext - Raw API token.
 * @param key - 32-byte AES-256 key.
 * @returns Base64 wire string (v1 layout).
 */
export function encryptGhlConnectionToken(plaintext: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes");
  }
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  if (tag.length !== GCM_TAG_LENGTH) {
    throw new Error("Unexpected GCM tag length");
  }
  const wire = Buffer.concat([
    Buffer.from([WIRE_VERSION]),
    iv,
    tag,
    ciphertext,
  ]);
  return wire.toString("base64");
}

/**
 * Decrypts a value produced by {@link encryptGhlConnectionToken}.
 *
 * @param ciphertextB64 - Base64 wire string.
 * @param key - Same 32-byte key used for encryption.
 * @returns UTF-8 plaintext token.
 */
export function decryptGhlConnectionToken(
  ciphertextB64: string,
  key: Buffer
): string {
  if (key.length !== 32) {
    throw new Error("Decryption key must be 32 bytes");
  }
  const wire = Buffer.from(ciphertextB64, "base64");
  const minLen = 1 + GCM_IV_LENGTH + GCM_TAG_LENGTH + 1;
  if (wire.length < minLen) {
    throw new Error("Ciphertext blob too short");
  }
  const version = wire.readUInt8(0);
  if (version !== WIRE_VERSION) {
    throw new Error(`Unsupported ciphertext version: ${String(version)}`);
  }
  const iv = wire.subarray(1, 1 + GCM_IV_LENGTH);
  const tag = wire.subarray(
    1 + GCM_IV_LENGTH,
    1 + GCM_IV_LENGTH + GCM_TAG_LENGTH
  );
  const enc = wire.subarray(1 + GCM_IV_LENGTH + GCM_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString("utf8");
}
