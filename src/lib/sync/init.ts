// Sync bootstrap: runs once (after login) when the flag is on. Backfills ids,
// then flushes the outbox + pulls remote changes on reconnect, tab focus, and a
// timer. Silent + automatic (no button); never throws into the app.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { SYNC_ENABLED } from "./config";
import { runIdBackfill } from "./backfill";
import { flushOnce, createSupabaseApply } from "./engine";
import {
  pullClientsSince,
  pullCheckinsSince,
  mergePulledClients,
  mergePulledCheckins,
} from "./pull";
import { getSupabase } from "../supabase";
import { currentLocationId, hasSession } from "./session";
import { getTodayData, saveTodayData } from "../storage";
import { peekAll } from "./outbox";

const CURSOR = "imarketin_pull_cursor";
let started = false;
let ticking = false;

export function initSync(): void {
  if (!SYNC_ENABLED || typeof window === "undefined" || started) return;
  started = true;
  try {
    runIdBackfill();
  } catch {
    // ignore backfill errors
  }
  window.addEventListener("online", () => void tick());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tick();
  });
  window.setInterval(() => void tick(), 30_000);
  void tick();
}

/** Force a sync cycle now (e.g. right after login / a local change). */
export async function tick(): Promise<void> {
  if (!SYNC_ENABLED || ticking) return;
  ticking = true;
  try {
    if (!(await hasSession())) return;
    const sb = getSupabase();
    const loc = await currentLocationId();
    if (!loc) return;
    await flushOnce({ apply: createSupabaseApply(sb, () => loc) });
    await pullMergeToday(sb, loc);
  } catch {
    // never break the app on a sync error
  } finally {
    ticking = false;
  }
}

// NOTE: pilot scope merges pulled rows into the active day. Cross-day attribution
// (via session_id -> service_date) is a later refinement.
async function pullMergeToday(sb: SupabaseClient<Database>, loc: string): Promise<void> {
  const since = localStorage.getItem(CURSOR) ?? "1970-01-01T00:00:00Z";
  const safe = new Date(Date.parse(since) - 60_000).toISOString(); // trailing safety window
  const [clients, checkins] = await Promise.all([
    pullClientsSince(sb, loc, safe),
    pullCheckinsSince(sb, loc, safe),
  ]);
  if (clients.length || checkins.length) {
    const data = getTodayData();
    if (data) {
      const pending = new Set(
        peekAll().map((m) => m.rowId).filter((x): x is string => !!x)
      );
      data.clients = mergePulledClients(data.clients, clients, pending);
      data.checkIns = mergePulledCheckins(data.checkIns, checkins, pending);
      saveTodayData(data);
    }
  }
  localStorage.setItem(CURSOR, new Date().toISOString());
}
