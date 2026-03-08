"use client";
import { useApp } from "@/contexts/AppContext";

export default function SettingsToggle() {
  const { lang, toggleLang, dark, toggleDark } = useApp();

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 p-1 glass-liquid dark:glass-dark-float rounded-full shadow-lg">
      <button
        onClick={toggleLang}
        className="px-2.5 py-1.5 text-xs font-bold rounded-full transition-all active:scale-90 text-dark dark:text-white/90 hover:bg-white/30 dark:hover:bg-white/10"
      >
        {lang === "fr" ? "FR" : "EN"}
      </button>
      <div className="w-px h-4 bg-border dark:bg-white/20" />
      <button
        onClick={toggleDark}
        className="p-1.5 rounded-full transition-all active:scale-90 hover:bg-white/30 dark:hover:bg-white/10"
      >
        {dark ? (
          <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    </div>
  );
}
