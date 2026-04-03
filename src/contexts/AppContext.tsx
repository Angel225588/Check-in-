"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Lang, TranslationKey, t as translate } from "@/lib/i18n";
import { autoCloseStale } from "@/lib/storage";

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

    // Auto-close any sessions from previous days that were never closed
    try { autoCloseStale(); } catch (e) { console.error("autoCloseStale failed:", e); }
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
