"use client";
import { useState } from "react";
import type { ImpactSummary } from "@/lib/impact";

/** Tap-to-explain copy — plain French, one job each. */
const EXPLAIN: Record<string, [string, string]> = {
  total: ["Total couverts", "Tous les petits-déjeuners attendus ce matin — la somme de toutes les catégories."],
  inclus: ["Inclus", "Petit-déjeuner compris dans la réservation. Rien à encaisser."],
  comp: ["Comp (offert)", "Offert par la direction. Gratuit pour le client."],
  vip: ["VIP", "Client prioritaire — accueil soigné, attentions particulières."],
  hors: ["Hors liste", "Pas sur la liste, ou sans forfait petit-déjeuner. À encaisser au comptoir."],
  verif: ["À vérifier", "Lignes incomplètes au scan (nom, chambre ou couverts manquants). À contrôler — souvent des enfants non comptés."],
};

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function dateLabel(): string {
  try {
    return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return "";
  }
}

export default function ImpactScreen({
  impact,
  elapsedSec,
  onStart,
}: {
  impact: ImpactSummary;
  elapsedSec: number;
  onStart: () => void;
}) {
  const [pop, setPop] = useState<[string, string] | null>(null);
  const elapsed = elapsedSec > 0 ? elapsedSec.toFixed(1).replace(".", ",") : "—";

  const Box = ({
    k,
    n,
    label,
    tone,
  }: {
    k: string;
    n: number;
    label: string;
    tone?: "gold" | "alert";
  }) => (
    <button
      onClick={() => setPop(EXPLAIN[k])}
      className="relative glass-liquid rounded-[18px] px-3 py-4 text-center active:scale-[0.96] transition-transform"
    >
      <span className="absolute top-2.5 right-3 text-[11px] font-extrabold text-black/15 dark:text-white/20">i</span>
      <div
        className={`leading-none ${tone === "gold" ? "text-brand" : tone === "alert" ? "text-red-500" : "text-dark"}`}
        style={{ fontFamily: "'Instrument Serif', serif", fontSize: 34, fontWeight: 400 }}
      >
        {n}
      </div>
      <div className="text-[11px] text-muted mt-1.5 uppercase tracking-wide">{label}</div>
    </button>
  );

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-5 pt-8 pb-6 overflow-y-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[15px] font-bold tracking-[0.18em] text-dark">
          IMARKETIN<span className="text-brand">.</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-brand bg-brand/10 border border-brand/20 rounded-full px-3 py-1.5">
          ⚡ Analysé en {elapsed} s
        </span>
      </div>

      {/* Hero */}
      <div className="mt-6 mb-1">
        <h1 className="text-[40px] leading-[1.05] text-dark" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
          Bonjour l&apos;équipe
        </h1>
        <p className="text-muted text-[15px] mt-2">Voici la journée · {dateLabel()}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mt-6">
        {/* Big textured-gold TOTAL */}
        <button
          onClick={() => setPop(EXPLAIN.total)}
          className="relative col-span-3 rounded-[20px] overflow-hidden text-white px-4 py-5 active:scale-[0.98] transition-transform"
          style={{
            background: "linear-gradient(158deg,#E8B24A 0%,#C8821C 52%,#9E6212 100%)",
            boxShadow:
              "0 14px 34px rgba(166,105,20,.42), inset 0 1px 0 rgba(255,255,255,.45), inset 0 -10px 24px rgba(120,72,10,.35)",
          }}
        >
          <span
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(120% 90% at 18% 0%,rgba(255,255,255,.40),transparent 45%),linear-gradient(118deg,transparent 36%,rgba(255,255,255,.22) 47%,transparent 58%)",
            }}
          />
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ opacity: 0.16, mixBlendMode: "overlay", backgroundImage: NOISE }}
          />
          <span className="absolute top-3 right-3.5 text-[11px] font-extrabold text-white/55">i</span>
          <div
            className="relative leading-none"
            style={{ fontFamily: "'Instrument Serif', serif", fontSize: 48, fontWeight: 400, textShadow: "0 1px 1px rgba(120,72,10,.4)" }}
          >
            {impact.total}
          </div>
          <div className="relative text-white/90 text-[11.5px] mt-2 uppercase tracking-wide">Total couverts</div>
        </button>

        <Box k="inclus" n={impact.inclus} label="Inclus" />
        <Box k="comp" n={impact.comp} label="Comp" />
        <Box k="vip" n={impact.vip} label="VIP" tone="gold" />
        <Box k="hors" n={impact.hors} label="Hors liste" />
        <Box k="verif" n={impact.aVerifier} label="À vérifier" tone={impact.aVerifier > 0 ? "alert" : undefined} />
        <div className="glass-liquid rounded-[18px] px-3 py-4 text-center flex flex-col justify-center">
          <div className="leading-none text-dark" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 34, fontWeight: 400 }}>
            {impact.rooms}
          </div>
          <div className="text-[11px] text-muted mt-1.5 uppercase tracking-wide">Chambres</div>
        </div>
      </div>

      {/* Coherence — honest data-quality flag, only when something needs a look */}
      {impact.aVerifier > 0 && (
        <div className="flex items-start gap-3 rounded-[16px] px-4 py-3.5 mt-5 text-[13.5px] leading-relaxed bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
          <span className="text-[18px] leading-tight">⚠️</span>
          <div>
            <b>Cohérence à vérifier.</b> {impact.aVerifier} ligne{impact.aVerifier > 1 ? "s" : ""} incomplète
            {impact.aVerifier > 1 ? "s" : ""} au scan — souvent des <b>enfants non comptés</b>. Vérifiez la dernière page du rapport.
          </div>
        </div>
      )}

      {/* Future — habit-based prediction (static placeholder for now) */}
      <p className="text-center text-[15px] text-muted italic mt-6" style={{ fontFamily: "'Instrument Serif', serif" }}>
        « Affluence prévue vers 8h15 — d&apos;après vos habitués. »
      </p>

      {/* CTA */}
      <button
        onClick={onStart}
        className="mt-7 w-full bg-gradient-to-r from-brand to-brand-light text-white py-4 rounded-[52px] text-lg font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/25"
      >
        Commencer le service
      </button>

      {/* Explain popover */}
      {pop && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setPop(null)}>
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#FBF8F3] dark:bg-[#14141A] rounded-t-[24px] p-6 pb-8 shadow-2xl animate-[imkUp_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
            <h3 className="text-[22px] text-dark mb-2" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
              {pop[0]}
            </h3>
            <p className="text-[15px] text-muted leading-relaxed mb-5">{pop[1]}</p>
            <button
              onClick={() => setPop(null)}
              className="w-full bg-gradient-to-r from-brand to-brand-light text-white py-3.5 rounded-[52px] font-bold active:scale-[0.97] transition-all"
            >
              Compris
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes imkUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
