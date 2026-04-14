/**
 * AES-256-GCM helpers for `ghl_connections.private_integration_token_encrypted`.
 * Wire format MUST stay aligned with `src/services/ghl-connection-token-crypto.ts`.
 */
import { createDecipheriv, createCipheriv, randomBytes } from "node:crypto";

const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const WIRE_VERSION = 1;

/**
 * @param {string} raw
 * @returns {Buffer}
 */
export function parseGhlConnectionTokenEncryptionKey(raw) {
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
 * @param {string} ciphertextB64
 * @param {Buffer} key
 * @returns {string}
 */
export function decryptGhlConnectionToken(ciphertextB64, key) {
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

/**
 * @param {string} plaintext
 * @param {Buffer} key
 * @returns {string}
 */
export function encryptGhlConnectionToken(plaintext, key) {
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
  const wire = Buffer.concat([
    Buffer.from([WIRE_VERSION]),
    iv,
    tag,
    ciphertext,
  ]);
  return wire.toString("base64");
}
