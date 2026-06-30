"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Agent-style narration shown while an upload is analysed. Plain words ("reading,
 * checking, analysing"), one step at a time: pending dot → spinner → drawn check.
 * Self-driving; the parent unmounts it when the real OCR finishes. If the animation
 * outruns the work, it holds the last step spinning ("finalisation") until then.
 */
const STEPS = [
  { lab: "Lecture des documents", sub: "pages" },
  { lab: "Analyse du contenu", sub: "lignes" },
  { lab: "Recherche de doublons", sub: "" },
  { lab: "Vérification des totaux", sub: "Inclus · Comp · Hors-liste" },
  { lab: "Contrôle de cohérence", sub: "dernière page" },
];

export default function AnalyseLoading({
  pages,
  subs,
}: {
  pages?: number;
  subs?: (string | undefined)[];
}) {
  const [active, setActive] = useState(0);
  const [settled, setSettled] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let i = 0;
    const tick = () => {
      i += 1;
      if (i < STEPS.length) {
        setActive(i);
        timers.current.push(setTimeout(tick, 900));
      } else {
        setSettled(true); // all revealed; last step keeps spinning until parent leaves
      }
    };
    timers.current.push(setTimeout(tick, 900));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const subFor = (i: number): string => {
    if (subs && subs[i]) return subs[i] as string;
    if (i === 0 && pages) return `${pages} page${pages > 1 ? "s" : ""}`;
    return STEPS[i].sub;
  };

  return (
    <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-6 pt-10 pb-8">
      <div className="text-center mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted mb-2">
          Courtyard · Petit-déjeuner
        </p>
        <h1 className="text-[26px] font-bold text-dark" style={{ fontFamily: "'Nunito', sans-serif" }}>
          Analyse de la journée
        </h1>
      </div>

      <div className="flex flex-col gap-1.5 my-auto">
        {STEPS.map((s, i) => {
          const done = i < active || (settled && i < STEPS.length - 1);
          const isActive = i === active && !done;
          return (
            <div
              key={i}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                isActive ? "bg-white dark:bg-white/[0.06] shadow-[0_6px_20px_-8px_rgba(166,105,20,0.25)] opacity-100" : done ? "opacity-100" : "opacity-40"
              }`}
            >
              <span className="w-[34px] h-[34px] rounded-full grid place-items-center shrink-0 relative">
                {done ? (
                  <span className="w-[34px] h-[34px] rounded-full bg-brand grid place-items-center">
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12l4 4L19 7"
                        stroke="#fff"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ strokeDasharray: 24, strokeDashoffset: 0, animation: "imkDraw .35s ease forwards" }}
                      />
                    </svg>
                  </span>
                ) : isActive ? (
                  <span className="w-[34px] h-[34px] rounded-full bg-brand/15 grid place-items-center">
                    <span className="w-[18px] h-[18px] rounded-full border-[2.5px] border-brand/25 border-t-brand animate-spin" />
                  </span>
                ) : (
                  <span className="w-[34px] h-[34px] rounded-full bg-black/[0.04] dark:bg-white/[0.06] grid place-items-center">
                    <span className="w-[7px] h-[7px] rounded-full bg-black/15 dark:bg-white/20" />
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <div className="font-bold text-[15.5px] text-dark leading-tight">{s.lab}</div>
                <div className="text-[12.5px] text-muted mt-0.5 min-h-[14px]">
                  {done ? subFor(i) : isActive ? "…" : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[12.5px] text-muted mt-7 flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Données chiffrées · sécurisées
      </div>

      <style jsx>{`
        @keyframes imkDraw {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
