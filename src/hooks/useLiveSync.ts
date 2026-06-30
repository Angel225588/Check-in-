"use client";
import { useEffect, useRef } from "react";
import { cachedLocation } from "@/lib/sync/session";
import { storedSyncCode, pullDayFromSupabase } from "@/lib/sync/push-day";
import { pullCheckinsFromSupabase } from "@/lib/sync/push-checkins";
import { getSupabase } from "@/lib/supabase";

/**
 * Keep this device's session live while a screen is open.
 *  - Check-ins: reconcile on mount, on window focus, every `intervalMs`, and instantly
 *    via Supabase Realtime — this is the high-frequency signal (the duplicate-killer).
 *  - Roster: reconcile on mount + focus + Realtime only (it changes rarely; keeping it
 *    out of the poll avoids decrypting the whole guest list every few seconds).
 * Calls `onChange()` after each successful reconcile so the screen re-reads localStorage.
 * Fully no-op when not connected — offline-first, localStorage stays authoritative.
 */
export function useLiveSync(onChange: () => void, intervalMs = 12000) {
  const busy = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const code = storedSyncCode();
    const loc = cachedLocation();
    if (!code || !loc) return;

    let cancelled = false;

    const pullCheckins = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        await pullCheckinsFromSupabase(code);
        if (!cancelled) onChangeRef.current();
      } catch {
        /* offline / transient — next tick heals it */
      } finally {
        busy.current = false;
      }
    };

    const pullRoster = async () => {
      try {
        await pullDayFromSupabase(code);
        if (!cancelled) onChangeRef.current();
      } catch {
        /* offline / transient */
      }
    };

    // Immediate reconcile of both on open.
    pullCheckins();
    pullRoster();

    const iv = setInterval(pullCheckins, intervalMs);
    const onFocus = () => {
      pullCheckins();
      pullRoster();
    };
    window.addEventListener("focus", onFocus);

    // Realtime: instant nudge whenever this location's check-ins / roster change.
    const channel = getSupabase()
      .channel(`live-${loc.locationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checkins", filter: `location_id=eq.${loc.locationId}` },
        () => pullCheckins(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients", filter: `location_id=eq.${loc.locationId}` },
        () => pullRoster(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      getSupabase().removeChannel(channel);
    };
  }, [intervalMs]);
}
