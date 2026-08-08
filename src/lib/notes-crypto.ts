/**
 * Encryption at rest for guest notes.
 *
 * THREAT MODEL — what this does and does not buy you.
 *
 * Defends against: someone reading localStorage in devtools on a shared
 * reception iPad, a device backup or profile copy leaking note text, a
 * localStorage export ending up in a support ticket, and XSS that scrapes
 * localStorage. All of those yield ciphertext only.
 *
 * Does NOT defend against: code running in the page that calls `decryptString`
 * itself. No browser-side scheme can, and claiming otherwise would be the kind
 * of security theatre that gets people hurt. The mitigation there is the strict
 * CSP and keeping note text out of logs (see `notes-store.ts`).
 *
 * The key is an AES-GCM 256 CryptoKey created with `extractable: false` and
 * kept in IndexedDB as a live key object. The raw bytes never exist in JS, so
 * they cannot be read out, logged, or copied to another device — even by code
 * running in the page.
 */

const DB_NAME = "checkin-notes-key";
const STORE = "keys";
const KEY_ID = "note-key";

/** In-memory handle for the current page. Cleared by `__resetKeyCache`. */
let cached: CryptoKey | null = null;
let inMemoryFallback: CryptoKey | null = null;

/** Test seam — forget the cached handle so the next call re-reads IndexedDB. */
export function __resetKeyCache(): void {
  cached = null;
  inMemoryFallback = null;
}

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/**
 * Open, use, close. We never hold the connection: a lingering one blocks
 * `deleteDatabase`, which is exactly what a "forget this device" action needs
 * to be able to do.
 */
function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return new Promise((resolve) => {
    let db: IDBDatabase | null = null;
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    open.onupgradeneeded = () => {
      const d = open.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      db = open.result;
      try {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => {
          const value = req.result as T;
          tx.oncomplete = () => { db?.close(); resolve(value ?? null); };
        };
        req.onerror = () => { db?.close(); resolve(null); };
        tx.onerror = () => { db?.close(); resolve(null); };
      } catch {
        db?.close();
        resolve(null);
      }
    };
  });
}

async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/**
 * The device key. Created once and reused; if IndexedDB is unavailable or
 * cannot hold a CryptoKey, we keep it in memory for the page's lifetime rather
 * than falling back to writing notes in the clear.
 */
export async function getNoteKey(): Promise<CryptoKey> {
  if (cached) return cached;

  if (hasIDB()) {
    const existing = await withStore<CryptoKey>("readonly", (s) => s.get(KEY_ID));
    if (existing && typeof (existing as CryptoKey).algorithm === "object") {
      cached = existing as CryptoKey;
      return cached;
    }
    const fresh = await generateKey();
    // Storing may fail if the environment cannot structured-clone a CryptoKey.
    // That is survivable — we just lose persistence, not confidentiality.
    await withStore("readwrite", (s) => s.put(fresh, KEY_ID));
    const verify = await withStore<CryptoKey>("readonly", (s) => s.get(KEY_ID));
    if (verify && typeof (verify as CryptoKey).algorithm === "object") {
      cached = verify as CryptoKey;
      return cached;
    }
    inMemoryFallback = fresh;
    cached = fresh;
    return cached;
  }

  if (!inMemoryFallback) inMemoryFallback = await generateKey();
  cached = inMemoryFallback;
  return cached;
}

// --- base64 for binary payloads -------------------------------------------

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// --- compaction ------------------------------------------------------------
// Note bodies are prose and compress well. Doing it before encryption keeps
// the localStorage footprint small on the iPad's tight budget.

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

function canCompress(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return drain(cs.readable);
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return drain(ds.readable);
}

// --- envelope --------------------------------------------------------------
// Format: "<version>.<iv-b64>.<ciphertext-b64>"
//   v1  — AES-GCM over raw UTF-8
//   v1z — AES-GCM over gzipped UTF-8
// The version prefix exists so a future format can be added without silently
// mis-reading notes written by an older build.

const V_PLAIN = "v1";
const V_GZIP = "v1z";

export async function encryptString(plain: string): Promise<string> {
  const key = await getNoteKey();
  const raw = new TextEncoder().encode(plain);

  let payload: Uint8Array<ArrayBuffer> = raw;
  let version = V_PLAIN;
  if (canCompress()) {
    try {
      const packed = await deflate(raw);
      // Only keep the compressed form when it actually wins; gzip framing makes
      // short strings bigger.
      if (packed.length < raw.length) { payload = packed; version = V_GZIP; }
    } catch {
      /* fall back to the uncompressed form */
    }
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
  return `${version}.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

/**
 * Returns null on any failure — wrong key, tampered bytes, truncated blob,
 * unknown version. Never a partial or guessed result: showing one guest's
 * allergy on another guest's screen is worse than showing nothing.
 */
export async function decryptString(envelope: string): Promise<string | null> {
  if (typeof envelope !== "string" || !envelope) return null;
  const parts = envelope.split(".");
  if (parts.length !== 3) return null;
  const [version, ivB64, ctB64] = parts;
  if (version !== V_PLAIN && version !== V_GZIP) return null;
  if (!ivB64 || !ctB64) return null;

  const iv = fromB64(ivB64);
  const ct = fromB64(ctB64);
  if (!iv || !ct || iv.length !== 12 || ct.length === 0) return null;

  try {
    const key = await getNoteKey();
    const plainBytes = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)
    );
    const out = version === V_GZIP ? await inflate(plainBytes) : plainBytes;
    return new TextDecoder().decode(out);
  } catch {
    // Authentication failure is the expected path for tampered or foreign
    // ciphertext. Deliberately silent: the content must not reach the console.
    return null;
  }
}
