/**
 * Zero-knowledge field encryption for guest PII (name, allergy/dietary notes).
 *
 * The data-encryption key is DERIVED FROM THE LOCATION ACCESS CODE and never
 * leaves the device. The server (and we, the project owner) store only
 * ciphertext we cannot decrypt — "it's the hotel's data, not ours."
 *
 *  - Confidentiality: AES-256-GCM, random 96-bit IV per field.
 *  - Searchable equality: HMAC-SHA256 blind index (deterministic, one-way).
 *  - Key stretching: PBKDF2-SHA256 (OWASP 2023 floor) from code + per-location salt.
 *
 * Standard Web Crypto only — runs in the browser and Node 20+. No dependencies.
 * The salt is NOT secret (stored per-location server-side); the access code is.
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

const PBKDF2_ITERS = 210_000; // OWASP 2023 minimum for PBKDF2-HMAC-SHA256
const LABEL_DEK = "imk-dek-v1"; // domain-separates the encryption key…
const LABEL_IDX = "imk-idx-v1"; // …from the blind-index key
const IV_BYTES = 12;
const SALT_BYTES = 16;
const PREFIX = "v1:";

export interface LocationKeys {
  /** AES-256-GCM key for encrypt/decrypt of PII fields. */
  dek: CryptoKey;
  /** HMAC-SHA256 key for the searchable blind index. */
  indexKey: CryptoKey;
}

// ---- small byte helpers (cross-env: browser + Node) ----
// TS 5.7+ lib.dom types WebCrypto BufferSource as ArrayBuffer-backed; TextEncoder
// yields Uint8Array<ArrayBufferLike>, so we normalize crypto inputs to ArrayBuffer-backed views.
function utf8(s: string): Uint8Array<ArrayBuffer> {
  const u = ENC.encode(s);
  const out = new Uint8Array(u.byteLength);
  out.set(u);
  return out;
}
function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}
function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}

/** A fresh, non-secret per-location salt (base64). Store it server-side. */
export function newLocationSalt(): string {
  return b64encode(globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * Derive the per-location encryption key + blind-index key from the access code.
 * Runs once at login; keys live only in the device session (never sent to the server).
 */
export async function deriveLocationKeys(code: string, saltB64: string): Promise<LocationKeys> {
  const salt = b64decode(saltB64);
  const base = await subtle().importKey(
    "raw",
    utf8(code.trim()),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const dek = await subtle().deriveKey(
    { name: "PBKDF2", salt: concat(salt, utf8(LABEL_DEK)), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const indexKey = await subtle().deriveKey(
    { name: "PBKDF2", salt: concat(salt, utf8(LABEL_IDX)), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return { dek, indexKey };
}

/** Encrypt a PII string. Returns `v1:base64(iv|ciphertext+tag)`. */
export async function encryptField(dek: CryptoKey, plaintext: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, dek, utf8(plaintext)),
  );
  return PREFIX + b64encode(concat(iv, ct));
}

/** Decrypt a value produced by {@link encryptField}. Throws if the key is wrong (auth tag fails). */
export async function decryptField(dek: CryptoKey, payload: string): Promise<string> {
  const raw = b64decode(payload.startsWith(PREFIX) ? payload.slice(PREFIX.length) : payload);
  const iv = raw.slice(0, IV_BYTES);
  const ct = raw.slice(IV_BYTES);
  const pt = await subtle().decrypt({ name: "AES-GCM", iv }, dek, ct);
  return DEC.decode(pt);
}

/**
 * Deterministic, one-way blind index for equality search (e.g. by guest name).
 * Same value + same code → same index, so any device with the code can search;
 * the server stores the index but cannot reverse it to the plaintext.
 */
export async function blindIndex(indexKey: CryptoKey, value: string): Promise<string> {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  const sig = new Uint8Array(await subtle().sign("HMAC", indexKey, utf8(normalized)));
  return toHex(sig);
}
