"use client";
import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { freeUpSpace } from "@/lib/storage";

export default function SettingsToggle() {
  const { lang, toggleLang, dark, toggleDark } = useApp();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [freedMsg, setFreedMsg] = useState<string | null>(null);

  const fr = lang === "fr";

  const handleFreeUp = () => {
    let freed = 0;
    try {
      freed = freeUpSpace();
    } catch (e) {
      console.error("freeUpSpace failed:", e);
    }
    setConfirmOpen(false);
    const kb = Math.max(1, Math.round(freed / 1024));
    setFreedMsg(
      fr
        ? `Espace libéré : ${kb} Ko. Toutes vos chambres et sessions sont conservées.`
        : `Freed ${kb} KB. All your rooms and sessions are kept.`
    );
    setTimeout(() => setFreedMsg(null), 5000);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 p-1 glass-liquid dark:glass-dark-float rounded-full shadow-lg">
        <button
          onClick={toggleLang}
          aria-label={fr ? "Switch to English" : "Passer en français"}
          className="px-2.5 py-1.5 text-xs font-bold rounded-full transition-all active:scale-90 text-dark dark:text-white/90 hover:bg-white/30 dark:hover:bg-white/10"
        >
          {fr ? "FR" : "EN"}
        </button>
        <div className="w-px h-4 bg-border dark:bg-white/20" />
        <button
          onClick={toggleDark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
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
        <div className="w-px h-4 bg-border dark:bg-white/20" />
        <button
          onClick={() => setConfirmOpen(true)}
          aria-label={fr ? "Libérer de l'espace de stockage" : "Free up storage space"}
          title={fr ? "Libérer de l'espace" : "Free up space"}
          className="p-1.5 rounded-full transition-all active:scale-90 hover:bg-white/30 dark:hover:bg-white/10"
        >
          {/* broom / cleanup icon */}
          <svg className="w-4 h-4 text-slate dark:text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </button>
      </div>

      {/* Freed-space toast */}
      {freedMsg && (
        <div className="fixed bottom-20 right-4 z-50 max-w-xs glass-liquid dark:glass-dark-float rounded-[14px] px-4 py-3 shadow-lg animate-[fadeSlideUp_0.3s_ease-out]">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-dark dark:text-white/90 font-medium">{freedMsg}</span>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 dark:bg-black/60"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-5 pb-8 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-dark mb-1">
              {fr ? "Libérer de l'espace ?" : "Free up space?"}
            </h3>
            <p className="text-sm text-muted mb-2">
              {fr
                ? "Cela supprime uniquement les données brutes des scans (texte désorganisé non utilisé)."
                : "This only removes the raw scan data (the unused, disorganized text)."}
            </p>
            <div className="glass-liquid rounded-[14px] p-3 mb-5">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                {fr ? "✓ Conservé" : "✓ Kept"}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {fr
                  ? "Toutes vos chambres, check-ins, sessions des 30 jours, VIP et statistiques."
                  : "All your rooms, check-ins, 30-day sessions, VIP and statistics."}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3 rounded-[52px] glass-liquid text-muted font-semibold active:scale-[0.97] transition-all"
              >
                {fr ? "Annuler" : "Cancel"}
              </button>
              <button
                onClick={handleFreeUp}
                className="flex-1 py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/20 dark:glow-brand"
              >
                {fr ? "Libérer" : "Free up"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
