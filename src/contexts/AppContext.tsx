"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Lang, TranslationKey, t as translate } from "@/lib/i18n";
import { autoCloseStale, reclaimStorageSpace } from "@/lib/storage";
import { ensureNotesMigration } from "@/lib/notes-migrate";
import { purgeExpired } from "@/lib/privacy/purge";
import { pruneAccessLog } from "@/lib/privacy/access-log";
import { hydrateSecureStore, getHydrationMs } from "@/lib/secure-store";

interface AppContextValue {
  lang: Lang;
  toggleLang: () => void;
  dark: boolean;
  toggleDark: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /** How long the roster took to unlock on THIS device, in ms. -1 before it
   *  runs. Shown on /debug so the figure is measured, not estimated. */
  unlockMs: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("fr");
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [unlockMs, setUnlockMs] = useState(-1);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const storedLang = localStorage.getItem("app-lang") as Lang | null;
    const storedDark = localStorage.getItem("app-dark");
    if (storedLang === "en" || storedLang === "fr") setLang(storedLang);
    // Respect stored preference, or fall back to OS preference
    if (storedDark === "true" || storedDark === "false") {
      setDark(storedDark === "true");
    } else {
      setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    setMounted(true);

    // Unlock the roster BEFORE anything reads it.
    //
    // Guest names and room numbers are encrypted at rest, and every read in
    // storage.ts is synchronous, so the decrypted mirror has to exist before
    // the first render that touches it. Everything below depends on that, and
    // so does the search page's expected-arrivals memo.
    //
    // Nobody types anything: the key is a non-extractable CryptoKey in
    // IndexedDB and the app unlocks itself. Measured at ~56ms for a full house
    // across a 90-day window on a development machine; the real figure for this
    // device is on /debug, because an estimate is not a measurement.
    let cancelled = false;
    void (async () => {
      try {
        await hydrateSecureStore();
      } catch (e) {
        console.error("secure store hydration failed:", e);
      }
      if (cancelled) return;
      setUnlockMs(getHydrationMs());
      setUnlocked(true);
      startup();
    })();

    return () => { cancelled = true; };
  }, []);

  const startup = () => {
    // Reclaim localStorage space first: older builds saved multi-MB raw OCR
    // dumps that can fill a small-quota browser (iPad Safari / PWA) and block
    // today's session from saving. Trim them before anything else runs.
    try { reclaimStorageSpace(); } catch (e) { console.error("reclaimStorageSpace failed:", e); }

    // Auto-close any sessions from previous days that were never closed
    try { autoCloseStale(); } catch (e) { console.error("autoCloseStale failed:", e); }

    // Ask the browser not to evict us under storage pressure. Notes are the
    // only thing here that is genuinely irreplaceable — a lost day can be
    // re-uploaded from the printout, a lost allergy cannot. Best-effort by
    // design: it resolves false where the browser declines, and that is not an
    // error worth a console line on a tablet.
    try {
      void navigator.storage?.persist?.();
    } catch { /* not supported — nothing to do */ }

    // Recover notes written under the old room-scoped key. Runs once per
    // device, is idempotent, and never throws. See notes-migrate.ts.
    void ensureNotesMigration();

    // Retention. The purge runs on load rather than on a timer because the app
    // is a PWA on a tablet that is opened each morning and closed after
    // service — there is no long-lived process to schedule against, and a
    // window that only shrinks while someone is looking at the screen would
    // never run at all. Both purges are idempotent and log what they removed.
    void (async () => {
      try {
        await purgeExpired({ triggerSource: "auto" });
      } catch (e) {
        console.error("retention purge failed:", e);
      }
      try {
        // The audit trail has its own, longer window (see privacy/config.ts).
        pruneAccessLog();
      } catch (e) {
        console.error("access log prune failed:", e);
      }
    })();
  };

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("app-lang", lang);
  }, [lang, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("app-dark", String(dark));
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark, mounted]);

  const toggleLang = useCallback(() => setLang((l) => (l === "fr" ? "en" : "fr")), []);
  const toggleDark = useCallback(() => setDark((d) => !d), []);
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(key, lang, vars),
    [lang]
  );

  return (
    <AppContext.Provider value={{ lang, toggleLang, dark, toggleDark, t, unlockMs }}>
      {/*
        Children wait for the unlock.

        Not cosmetic. Reads in storage.ts are synchronous, and pages compute
        their lists inside a useMemo that runs once — the search page's
        expected-arrivals is the one that matters. Rendering before the roster
        is decrypted would compute those memos against an empty store, and
        reception would see a morning with no guests in it. A blank frame for a
        few dozen milliseconds is the correct trade against that.
      */}
      {unlocked ? children : null}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
