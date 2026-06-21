// Stable identity for sync. Client.id is a random UUID minted ONCE at first
// localStorage entry and immutable for life — so room/name corrections never
// fork the row or resurrect a deleted one. The content key (clientLocalKey) is
// advisory only: local dedupe + first-contact cross-device match.
import type { Client } from "../types";
import { clientKey } from "../merge";

/** Advisory content key (room + normalized name). NEVER a primary/unique key. */
export const clientLocalKey = clientKey;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/** Mint a random immutable id on the client if it has none. Returns the id. */
export function ensureClientId(c: Client): string {
  if (!c.id) c.id = randomId();
  return c.id;
}
