"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getTodayData } from "@/lib/storage";
import { useLiveSync } from "@/hooks/useLiveSync";
import { cachedLocation, signOut } from "@/lib/sync/session";
import { clearArea } from "@/lib/area";

export default function ReceptionHome() {
  const router = useRouter();
  const [rooms, setRooms] = useState(0);

  const refresh = useCallback(() => {
    setRooms(getTodayData()?.clients.length ?? 0);
  }, []);

  useEffect(() => {
    if (!cachedLocation()) { router.replace("/"); return; }
    refresh();
  }, [refresh, router]);

  // Keep counts live so "documents transmis" reflects reality across devices.
  useLiveSync(refresh);

  const leave = async () => {
    clearArea();
    await signOut();
    router.replace("/");
  };

  const TILES = [
    {
      key: "contacts",
      title: "Contacts",
      sub: "Clients & VIP du jour",
      primary: false,
      onClick: () => router.push("/search"),
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
      onClick: () => router.push("/upload"),
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
      onClick: () => router.push("/report"),
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

      <div className="mt-10 mb-9">
        <h1 className="text-[32px] leading-[1.12] text-dark" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
          Une matinée sereine<br />commence ici.
        </h1>
        <p className="text-muted text-[14px] mt-3 leading-relaxed">
          Tout ce dont la réception a besoin, au calme. Trois gestes, rien de plus.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {TILES.map((t) => (
          <button
            key={t.key}
            onClick={t.onClick}
            className={`flex items-center gap-4 rounded-[18px] px-5 py-4 text-left active:scale-[0.98] transition-transform ${
              t.primary
                ? "text-white shadow-lg shadow-brand/25 bg-gradient-to-br from-brand to-brand-light"
                : "glass-liquid text-dark"
            }`}
          >
            <span className={`w-12 h-12 rounded-[14px] grid place-items-center shrink-0 ${t.primary ? "bg-white/20 text-white" : "bg-brand/12 text-brand"}`}>
              {t.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[17px] font-bold">{t.title}</span>
              <span className={`block text-[12.5px] mt-0.5 ${t.primary ? "text-white/85" : "text-muted"}`}>{t.sub}</span>
            </span>
            <svg className={`w-5 h-5 ${t.primary ? "text-white/70" : "text-muted/40"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
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
