/**
 * The roster, encrypted at rest.
 *
 * Guest notes were already encrypted (`notes-crypto.ts`); the roster was not.
 * That asymmetry was the largest gap left in the GDPR audit — the allergy a
 * receptionist TYPED was protected, while the same allergy arriving on the VIP
 * sheet sat in plaintext next to the guest's name and room number.
 *
 * THE CONSTRAINT that shapes this file: `storage.ts` is synchronous, and it is
 * read on the search path *during service* (`search/page.tsx` computes
 * expected-arrivals inside a `useMemo`). WebCrypto is async-only. Making the
 * storage layer async would push `await` into the one code path that must not
 * get slower at 06:30 with a queue waiting.
 *
 * So: an in-memory plaintext mirror, hydrated once when the app opens, with a
 * synchronous read/write API over it. Persistence happens in the background,
 * encrypted. Measured on a full house across a 90-day window, hydration costs
 * ~56ms on a development machine; `getHydrationMs()` reports the real figure on
 * the actual tablet, because an estimate is not a measurement.
 *
 * WHAT THIS BUYS, and what it does not. Same threat model as `notes-crypto.ts`,
 * deliberately: it defends against someone reading localStorage in devtools on
 * a shared reception iPad, a device backup or profile copy leaking, a storage
 * export ending up in a support ticket, and XSS that scrapes localStorage. It
 * does NOT defend against code running in the page that calls `secureGet`
 * itself. No browser-side scheme can, and claiming otherwise would be theatre.
 *
 * The note key is reused rather than a second key generated. On a single
 * device, two non-extractable keys in the same IndexedDB protect against
 * nothing that one does; a second key would only add a second way for the two
 * to drift out of sync and lose data.
 */
import { encryptString, decryptString } from "./notes-crypto";

/**
 * Every store holding a guest or employee name. A trailing underscore marks a
 * prefix (one key per date); the rest are exact keys.
 *
 * Deliberately NOT here:
 *  - `app_settings`, `app-lang`, `app-dark` — no personal data.
 *  - `access_log`, `purge_log` — hold a salted hash, never a name, and must
 *    stay independently readable: they are the evidence that survives an
 *    erasure request, and burying them inside this store would tie their
 *    lifetime to the data they exist to outlive.
 *  - `gn_*` notes — already encrypted, with their own dated envelope.
 */
export const SECURE_KEYS = [
  "dailyData_",
  "sessionHistory",
  "guest_profiles",
  "morningBrief_",
] as const;

export function isSecureKey(key: string): boolean {
  return SECURE_KEYS.some((k) => (k.endsWith("_") ? key.startsWith(k) : key === k));
}

/**
 * Marks a slot reserved but not yet written.
 *
 * `secureSet` must be able to report "storage full" SYNCHRONOUSLY — the
 * check-in screen shows a guest as served based on that boolean, and a save
 * that silently failed is a guest recorded as served who was not. Encryption is
 * async, so the space is reserved first, with a placeholder that carries no
 * guest data (writing the plaintext here, even for a millisecond, would defeat
 * the whole point of this file).
 *
 * The reservation is always at least as large as the ciphertext that replaces
 * it — the envelope gzips, so it is much smaller — which makes the check
 * conservative in the safe direction.
 *
 * If the app dies in the millisecond between reserving and writing, the key
 * holds this marker. Hydration DISCARDS such a key rather than adopting it: a
 * lost write is recoverable from the morning's printout, a day corrupted by a
 * run of zeros is not.
 */
const RESERVED = "\u0000reserved:";

/** Plaintext mirror. `null` until hydrated — see `secureGet`. */
let mirror: Map<string, string> | null = null;
let hydrationMs = -1;

/** Serialised write queue: one chain, so two writes to the same key cannot
 *  land out of order and leave the older value on disk. */
let writeChain: Promise<void> = Promise.resolve();

/** Test seam. */
export function __resetSecureStore(): void {
  mirror = null;
  hydrationMs = -1;
  writeChain = Promise.resolve();
}

/** Milliseconds the last hydration took, or -1 if it has not run. */
export function getHydrationMs(): number {
  return hydrationMs;
}

export function isHydrated(): boolean {
  return mirror !== null;
}

function rawKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isSecureKey(k)) out.push(k);
  }
  return out;
}

/**
 * Load and decrypt every protected key into memory.
 *
 * Also migrates a device that is already in service: its data is plaintext, and
 * hydration must ADOPT it rather than ignore it. Ignoring it would look, to
 * reception, exactly like every guest disappearing overnight.
 */
export async function hydrateSecureStore(): Promise<void> {
  if (typeof localStorage === "undefined") {
    mirror = new Map();
    hydrationMs = 0;
    return;
  }
  const started = Date.now();
  const next = new Map<string, string>();
  const toRewrite: string[] = [];

  for (const key of rawKeys()) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    if (raw.startsWith(RESERVED)) {
      // A write that never landed. Drop it; never adopt it as data.
      localStorage.removeItem(key);
      continue;
    }

    const plain = await decryptString(raw);
    if (plain !== null) {
      next.set(key, plain);
      continue;
    }
    // Not our ciphertext: either plaintext from before this change, or a value
    // written by a build that could not reach the key. Adopt it and schedule a
    // re-write. Never discard it — an unreadable day is recoverable from the
    // printout, but only if we did not delete it first.
    next.set(key, raw);
    toRewrite.push(key);
  }

  mirror = next;
  hydrationMs = Date.now() - started;

  for (const key of toRewrite) persist(key);
}

/**
 * Read. Returns `null` before hydration — the same answer as "nothing stored",
 * which every caller already handles because it is the first-run state.
 * `AppContext` hydrates before rendering, so callers do not see that window.
 */
export function secureGet(key: string): string | null {
  if (mirror === null) return null;
  return mirror.get(key) ?? null;
}

/**
 * Write. Returns false when storage is full — synchronously, so the caller can
 * warn before telling reception the guest is served.
 *
 * On failure the in-memory value is ROLLED BACK rather than kept. Keeping it
 * would show the check-in on screen while it was never saved, and it would
 * disappear on the next reload: a fake success, which is the specific failure
 * `storage-safety.test.ts` exists to prevent. Reception can act on "this did
 * not save"; it cannot act on a check-in that quietly evaporates.
 */
export function secureSet(key: string, value: string): boolean {
  if (mirror === null) mirror = new Map();
  const previous = mirror.get(key);

  try {
    localStorage.setItem(key, RESERVED + "0".repeat(value.length));
  } catch {
    if (previous === undefined) mirror.delete(key);
    else mirror.set(key, previous);
    return false;
  }

  mirror.set(key, value);
  persist(key);
  return true;
}

export function secureRemove(key: string): void {
  mirror?.delete(key);
  writeChain = writeChain.then(async () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing recoverable here */
    }
  });
}

/** Protected keys currently held, optionally filtered by prefix. */
export function secureKeys(prefix = ""): string[] {
  if (mirror === null) return [];
  return [...mirror.keys()].filter((k) => k.startsWith(prefix));
}

function persist(key: string): void {
  writeChain = writeChain.then(async () => {
    const value = mirror?.get(key);
    if (value === undefined) return;
    try {
      localStorage.setItem(key, await encryptString(value));
    } catch {
      // The reservation already reported this to the caller. Clear the
      // placeholder so a later hydration does not have to.
      try { localStorage.removeItem(key); } catch { /* nothing left to do */ }
    }
  });
}

/**
 * Await every pending write. Used by the check-in path, where a lost write is
 * a guest recorded as served who is not, and by tests.
 */
export async function flushSecureStore(): Promise<void> {
  await writeChain;
}
