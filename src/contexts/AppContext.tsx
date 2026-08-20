"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Lang, TranslationKey, t as translate } from "@/lib/i18n";
import { autoCloseStale, reclaimStorageSpace } from "@/lib/storage";
import { runNotesMigrationOnce } from "@/lib/notes-migrate";

interface AppContextValue {
  lang: Lang;
  toggleLang: () => void;
  dark: boolean;
  toggleDark: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("fr");
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

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
    void runNotesMigrationOnce().catch(() => { /* silent: see notes-store */ });
  }, []);

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
    <AppContext.Provider value={{ lang, toggleLang, dark, toggleDark, t }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
