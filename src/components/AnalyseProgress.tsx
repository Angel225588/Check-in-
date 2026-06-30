"use client";

/**
 * Compact, real-progress analysis indicator. A slim card (not a full screen):
 * file row + inline elapsed counter + a 5-segment stepper whose active segment
 * reflects the ACTUAL stage (driven by the parent's real upload/OCR status).
 */
const STAGES = [
  "Téléversement",
  "Lecture du document",
  "Extraction des données",
  "Recherche de doublons",
  "Prêt",
];

export default function AnalyseProgress({
  stage,
  elapsed,
  fileName,
}: {
  stage: number;
  elapsed: number;
  fileName?: string;
}) {
  const i = Math.max(0, Math.min(stage, STAGES.length - 1));
  const done = i >= STAGES.length - 1;
  const secs = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${Math.round(elapsed % 60)}s` : `${Math.round(elapsed)}s`;

  return (
    <div className="glass-liquid rounded-[18px] p-4 w-full max-w-md mx-auto">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-[12px] bg-brand/12 grid place-items-center shrink-0">
          {done ? (
            <svg className="w-5 h-5 text-brand" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span className="w-[18px] h-[18px] rounded-full border-[2.5px] border-brand/25 border-t-brand animate-spin" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-dark truncate">{fileName || "Analyse de la journée"}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full shrink-0 tabular-nums">
              ⚡ {secs}
            </span>
          </div>
          <div className="text-[12.5px] text-muted mt-0.5">{done ? "Terminé" : `${STAGES[i]}…`}</div>
        </div>
      </div>

      {/* 5-segment stepper — fills as real stages complete */}
      <div className="flex items-center gap-1.5 mt-3.5">
        {STAGES.map((s, idx) => (
          <div key={s} className="flex-1 h-1.5 rounded-full overflow-hidden bg-black/[0.06] dark:bg-white/[0.08]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: idx < i ? "100%" : idx === i ? (done ? "100%" : "55%") : "0%",
                background: "linear-gradient(90deg,#A66914,#DD9C28)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
