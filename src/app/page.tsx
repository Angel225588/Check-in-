"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { exchangeCode, cachedLocation } from "@/lib/sync/session";
import { storeSyncCode, storedSyncCode, pullDayFromSupabase, ensureSession } from "@/lib/sync/push-day";
import { pullCheckinsFromSupabase } from "@/lib/sync/push-checkins";
import { SUPABASE_URL, DEFAULT_SYNC_CODE, SYNC_ENABLED } from "@/lib/sync/config";
import { Area, AREA_HOME, AREA_LABEL, storeArea } from "@/lib/area";

const DOORS: { area: Area; desc: string; icon: React.ReactNode }[] = [
  {
    area: "reception",
    desc: "Téléverser le rapport du jour",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    area: "restaurant",
    desc: "Voir la journée · pointer les arrivées",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M5 3v8a3 3 0 003 3v7M8 3v6M5 6h3M19 3c-1.5 0-2.5 1.8-2.5 4.5S17.5 12 19 12v9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    area: "direction",
    desc: "Tableau de bord · chiffres",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
        <path d="M4 20V10m6 10V4m6 16v-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Entry() {
  const router = useRouter();
  const [active, setActive] = useState<Area | null>(null);
  const [code, setCode] = useState(DEFAULT_SYNC_CODE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showDoors, setShowDoors] = useState(false);

  /**
   * Local mode home per area. Réception goes to /upload rather than /reception
   * so the team lands on the same "Démarrer la Journée" screen as production.
   */
  const localHome = (area: Area) => (area === "reception" ? "/upload" : AREA_HOME[area]);

  /**
   * Local mode (SYNC_ENABLED=false) goes straight to /upload — byte-identical
   * to what production does (main's root page is redirect("/upload")). The team
   * lands on the familiar "Démarrer la Journée" screen with no new step and no
   * access code in the way.
   *
   * The door/code screen is not deleted, only skipped: it authenticates against
   * Supabase, and until the data migration is done there is nothing for a code
   * to unlock. Set NEXT_PUBLIC_SYNC_ENABLED=true to bring the doors back.
   */
  useEffect(() => {
    if (SYNC_ENABLED) return;
    // "?spaces" is the explicit escape hatch used by "Changer d'espace".
    // Without it the root is a straight pass-through to the upload screen.
    if (new URLSearchParams(window.location.search).has("spaces")) {
      setShowDoors(true);
      return;
    }
    storeArea("reception");
    router.replace("/upload");
  }, [router]);

  // Nothing to paint while the redirect resolves (avoids flashing the doors).
  if (!SYNC_ENABLED && !showDoors) return null;

  // Tapping a door: if already connected, enter instantly; otherwise ask for the code.
  function onDoor(area: Area) {
    setErr("");
    // No Supabase yet, so there is nothing to authenticate against — enter the
    // space directly instead of demanding a code that cannot unlock anything.
    if (!SYNC_ENABLED) {
      storeArea(area);
      router.replace(localHome(area));
      return;
    }
    if (cachedLocation() && storedSyncCode()) {
      enterDirect(area);
    } else {
      setActive(area);
    }
  }

  async function enterDirect(area: Area) {
    const c = storedSyncCode();
    setBusy(true);
    // The cache can outlive the session — re-authenticate with the stored code so
    // the device is properly logged in (otherwise writes hit RLS). If it fails,
    // fall back to asking for the code.
    if (!(await ensureSession())) {
      setBusy(false);
      setActive(area);
      return;
    }
    storeArea(area);
    try { await pullDayFromSupabase(c); } catch { /* offline */ }
    void pullCheckinsFromSupabase(c).catch(() => {});
    router.replace(AREA_HOME[area]);
  }

  async function enter(area: Area) {
    const c = code.trim();
    if (!c) { setErr("Entre le code d'accès."); return; }
    if (!SUPABASE_URL) { setErr("Synchronisation non configurée sur ce serveur."); return; }
    setBusy(true);
    setErr("");
    try {
      await exchangeCode(c);
      storeSyncCode(c);
      storeArea(area);
      try { await pullDayFromSupabase(c); } catch { /* offline — local stays authoritative */ }
      void pullCheckinsFromSupabase(c).catch(() => {});
      router.replace(AREA_HOME[area]);
    } catch (e) {
      const m = (e as Error).message;
      setErr(
        m === "invalid_code" ? "Code invalide."
        : m === "rate_limited" ? "Trop d'essais — réessaie dans quelques minutes."
        : m.startsWith("auth_failed") ? `Le serveur a refusé la connexion (${m.replace("auth_failed_", "HTTP ")}).`
        : "Serveur injoignable — vérifie la connexion."
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-dvh w-full max-w-md mx-auto px-6 pt-16 pb-10 bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      {/* Brand */}
      <div className="text-center mb-2">
        <div className="text-lg font-bold tracking-[0.10em] text-brand leading-tight" style={{ fontFamily: "'Nunito', sans-serif" }}>
          COURTYARD
        </div>
        <div className="text-[11px] text-muted">
          by <span className="font-bold tracking-[0.05em] text-slate">MARRIOTT</span>
        </div>
      </div>
      <h1 className="text-center text-[30px] leading-tight text-dark mt-8 mb-1" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
        Bienvenue
      </h1>
      <p className="text-center text-muted text-[14px] mb-9">Choisis ton espace</p>

      {/* Doors */}
      <div className="flex flex-col gap-3">
        {DOORS.map((d) => (
          <button
            key={d.area}
            onClick={() => onDoor(d.area)}
            className="flex items-center gap-4 glass-liquid rounded-[18px] px-5 py-4 text-left active:scale-[0.98] transition-transform"
          >
            <span className="w-12 h-12 rounded-[14px] grid place-items-center shrink-0 bg-gradient-to-br from-brand/15 to-brand-light/10 text-brand">
              {d.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[17px] font-bold text-dark">{AREA_LABEL[d.area]}</span>
              <span className="block text-[12.5px] text-muted mt-0.5">{d.desc}</span>
            </span>
            <svg className="w-5 h-5 text-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>

      <p className="text-center text-[11px] text-muted mt-8 flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Données chiffrées · hébergées en Europe
      </p>

      {/* Code sheet */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => !busy && setActive(null)}>
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#FBF8F3] dark:bg-[#14141A] rounded-t-[24px] sm:rounded-[24px] p-6 pb-8 shadow-2xl animate-[imkUp_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-5 sm:hidden" />
            <h3 className="text-[22px] text-dark" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
              Espace {AREA_LABEL[active]}
            </h3>
            <p className="text-[13px] text-muted mt-1 mb-5">Entre le code d&apos;accès de ton hôtel.</p>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CODE-XXXX-XXXX"
              className="w-full px-4 py-3.5 rounded-[14px] glass-liquid text-dark font-mono text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-brand/30"
              autoFocus
            />
            {err && <p className="text-[13px] text-red-500 mt-3">{err}</p>}
            <button
              onClick={() => enter(active)}
              disabled={busy}
              className="mt-5 w-full bg-gradient-to-r from-brand to-brand-light text-white py-4 rounded-[52px] text-lg font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/25 disabled:opacity-60"
            >
              {busy ? "Connexion…" : `Entrer en ${AREA_LABEL[active]}`}
            </button>
            <button onClick={() => !busy && setActive(null)} className="mt-3 w-full text-muted text-sm font-semibold">
              Annuler
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes imkUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
