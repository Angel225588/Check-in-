// One-time, idempotent, versioned backfill: walk every localStorage day + the
// session history and stamp random ids + local keys + client_rev=0 onto clients
// that predate sync. Safe to re-run; only mints ids that are missing.
import type { Client, DailyData, SessionRecord } from "../types";
import { ensureClientId, clientLocalKey } from "./ids";

const BACKFILL_FLAG = "imarketin_id_backfill_v2";

function backfillClients(clients: Client[]): number {
  let minted = 0;
  for (const c of clients) {
    if (!c.id) {
      ensureClientId(c);
      minted++;
    }
    if (c.clientLocalKey == null) c.clientLocalKey = clientLocalKey(c);
    if (c.clientRev == null) c.clientRev = 0;
  }
  return minted;
}

/** Backfill ids/keys/rev across all stored days + history. Idempotent. */
export function runIdBackfill(): { migrated: number } {
  if (typeof window === "undefined") return { migrated: 0 };
  let migrated = 0;

  // Daily data keys
  const dayKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("dailyData_")) dayKeys.push(k);
  }
  for (const k of dayKeys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const d = JSON.parse(raw) as DailyData;
      const before = JSON.stringify(d.clients ?? []);
      migrated += backfillClients(d.clients ?? []);
      for (const ci of d.checkIns ?? []) {
        if (ci.clientRev == null) ci.clientRev = 0;
      }
      if (JSON.stringify(d.clients ?? []) !== before) localStorage.setItem(k, JSON.stringify(d));
    } catch {
      // skip corrupt entry
    }
  }

  // Session history
  const histRaw = localStorage.getItem("sessionHistory");
  if (histRaw) {
    try {
      const hist = JSON.parse(histRaw) as SessionRecord[];
      let changed = false;
      for (const s of hist) {
        const m = backfillClients(s.clients ?? []);
        if (m > 0) changed = true;
        migrated += m;
      }
      if (changed) localStorage.setItem("sessionHistory", JSON.stringify(hist));
    } catch {
      // skip corrupt history
    }
  }

  localStorage.setItem(BACKFILL_FLAG, "1");
  return { migrated };
}
