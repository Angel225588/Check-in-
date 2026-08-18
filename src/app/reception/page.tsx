"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getTodayData } from "@/lib/storage";
import { useLiveSync } from "@/hooks/useLiveSync";
import { cachedLocation, signOut } from "@/lib/sync/session";
import { SYNC_ENABLED } from "@/lib/sync/config";
import { reportRequestedRecently } from "@/lib/sync/report-request";
import { clearArea } from "@/lib/area";

export default function ReceptionHome() {
  const router = useRouter();
  const [rooms, setRooms] = useState(0);
  const [requested, setRequested] = useState(false);

  const refresh = useCallback(() => {
    setRooms(getTodayData()?.clients.length ?? 0);
    reportRequestedRecently().then(setRequested).catch(() => {});
  }, []);

  useEffect(() => {
    // In local mode there is no Supabase location to cache, so this guard
    // must not bounce — otherwise it ping-pongs with the entry redirect.
    if (SYNC_ENABLED && !cachedLocation()) { router.replace("/"); return; }
    refresh();
  }, [refresh, router]);

  // Keep counts live so "documents transmis" reflects reality across devices.
  useLiveSync(refresh);

  const leave = async () => {
    clearArea();
    await signOut();
    // "?spaces" keeps the picker reachable in local mode, where the root is a
    // straight pass-through to /upload.
    router.replace("/?spaces=1");
  };

  const TILES = [
    {
      key: "contacts",
      title: "Contacts",
      sub: "Clients & VIP du jour",
      primary: false,
      disabled: true, // not ready yet
      onClick: () => {},
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      key: "upload",
      title: "Téléverser",
      sub: "Les documents du jour",
      primary: true,
      onClick: () => router.push("/upload?pick=1"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 9l5-5 5 5" /><path d="M12 4v12" />
        </svg>
      ),
    },
    {
      key: "files",
      title: "Fichiers",
      sub: "Archives par journée",
      primary: false,
      disabled: true, // not ready yet
      onClick: () => {},
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-dvh w-full max-w-md mx-auto px-6 pt-10 pb-10 bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.16em] text-brand font-bold">Courtyard · Petit-déjeuner</span>
        <button onClick={leave} className="text-xs font-semibold text-muted active:opacity-60">Changer d&apos;espace</button>
      </div>

      <div className="mt-10 mb-7">
        <h1 className="text-[32px] leading-[1.12] text-dark" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
          Une matinée sereine<br />commence ici.
        </h1>
        <p className="text-muted text-[14px] mt-3 leading-relaxed">
          Tout ce dont la réception a besoin, au calme. Trois gestes, rien de plus.
        </p>
      </div>

      {/* Restaurant is waiting — surfaced when a request is pending and nothing's uploaded yet. */}
      {requested && rooms === 0 && (
        <button
          onClick={() => router.push("/upload?pick=1")}
          className="mb-5 flex items-center gap-3 rounded-[16px] px-4 py-3.5 text-left bg-amber-500/12 border border-amber-500/30 active:scale-[0.99] transition-transform"
        >
          <span className="text-lg">🔔</span>
          <span className="flex-1 text-[13.5px] text-amber-800 dark:text-amber-300 leading-snug">
            <b>Le restaurant attend le rapport.</b> Touchez pour téléverser la journée.
          </span>
        </button>
      )}

      <div className="flex flex-col gap-3">
        {TILES.map((t) => (
          <button
            key={t.key}
            onClick={t.disabled ? undefined : t.onClick}
            disabled={t.disabled}
            aria-disabled={t.disabled}
            className={`flex items-center gap-4 rounded-[18px] px-5 py-4 text-left transition-transform ${
              t.disabled
                ? "glass-liquid text-dark opacity-45 cursor-not-allowed"
                : t.primary
                  ? "text-white shadow-lg shadow-brand/25 bg-gradient-to-br from-brand to-brand-light active:scale-[0.98]"
                  : "glass-liquid text-dark active:scale-[0.98]"
            }`}
          >
            <span className={`w-12 h-12 rounded-[14px] grid place-items-center shrink-0 ${t.primary && !t.disabled ? "bg-white/20 text-white" : "bg-brand/12 text-brand"}`}>
              {t.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[17px] font-bold">{t.title}</span>
              <span className={`block text-[12.5px] mt-0.5 ${t.primary && !t.disabled ? "text-white/85" : "text-muted"}`}>{t.sub}</span>
            </span>
            {t.disabled ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted bg-black/[0.05] dark:bg-white/10 rounded-full px-2 py-1">Bientôt</span>
            ) : (
              <svg className={`w-5 h-5 ${t.primary ? "text-white/70" : "text-muted/40"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-8 flex items-center justify-center gap-2 text-[12px] text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span>Aujourd&apos;hui · <b className="text-dark">{rooms} chambres</b> {rooms > 0 ? "transmises au restaurant" : "— en attente du rapport"}</span>
      </div>
    </div>
  );
}
