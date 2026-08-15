"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getTodayData } from "@/lib/storage";
import { computeImpact } from "@/lib/impact";
import { Client } from "@/lib/types";
import ImpactScreen from "@/components/ImpactScreen";
import { useLiveSync } from "@/hooks/useLiveSync";
import { cachedLocation, signOut } from "@/lib/sync/session";
import { SYNC_ENABLED } from "@/lib/sync/config";
import { requestReport } from "@/lib/sync/report-request";
import { clearArea } from "@/lib/area";

export default function RestaurantHome() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [notified, setNotified] = useState(false);

  const notifyReception = async () => {
    try {
      await requestReport();
      setNotified(true);
    } catch {
      setNotified(true); // optimistic — the nudge is best-effort
    }
  };

  const refresh = useCallback(() => {
    const d = getTodayData();
    setClients(d?.clients ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // In local mode there is no Supabase location to cache, so this guard
    // must not bounce — otherwise it ping-pongs with the entry redirect.
    if (SYNC_ENABLED && !cachedLocation()) { router.replace("/"); return; }
    refresh();
  }, [refresh, router]);

  // Keep the roster + check-ins live (poll + Realtime) so the restaurant always
  // reflects what reception uploaded and what other stations checked in.
  useLiveSync(refresh);

  const leave = async () => {
    clearArea();
    await signOut();
    router.replace("/");
  };

  const impact = computeImpact(clients);
  const hasRoster = clients.length > 0;

  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      <div className="shrink-0 flex items-center justify-between px-4 pt-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted">Restaurant · Petit-déjeuner</span>
        <button onClick={leave} className="text-xs font-semibold text-muted active:opacity-60">Changer d&apos;espace</button>
      </div>

      {loading ? (
        <div className="flex-1 grid place-items-center text-muted text-sm">Chargement…</div>
      ) : hasRoster ? (
        <div className="flex-1 min-h-0">
          <ImpactScreen
            impact={impact}
            elapsedSec={0}
            clients={clients}
            onStart={() => router.push("/search")}
            ctaLabel="Commencer le service"
          />
        </div>
      ) : (
        <div className="flex-1 grid place-items-center px-8 text-center">
          <div className="w-full max-w-sm">
            <div className="w-16 h-16 rounded-full bg-brand/10 grid place-items-center mx-auto mb-4">
              <span className="w-7 h-7 rounded-full border-[3px] border-brand/25 border-t-brand animate-spin" />
            </div>
            <h2 className="text-[22px] text-dark" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
              En attente du rapport
            </h2>
            <p className="text-muted text-sm mt-2 leading-relaxed">
              La réception n&apos;a pas encore téléversé la journée.<br />Dès qu&apos;elle le fait, la liste apparaît ici automatiquement.
            </p>

            {/* Not blocked: upload it here, or nudge reception. */}
            <button
              onClick={() => router.push("/upload?pick=1")}
              className="mt-6 w-full bg-gradient-to-r from-brand to-brand-light text-white py-3.5 rounded-[52px] font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/25"
            >
              Téléverser les documents
            </button>
            <button
              onClick={notifyReception}
              disabled={notified}
              className="mt-3 w-full glass-liquid text-dark py-3.5 rounded-[52px] font-semibold active:scale-[0.97] transition-all disabled:opacity-60"
            >
              {notified ? "✓ Réception prévenue" : "Prévenir la réception"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
