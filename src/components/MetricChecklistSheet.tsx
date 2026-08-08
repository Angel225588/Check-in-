"use client";
import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { toggleMetric, CORE_METRICS as CORE } from "@/lib/metric-choice";
import type { MetricCandidate } from "@/lib/portrait";
import type { Progress } from "@/lib/metric-progress";

/**
 * "Sur la barre" — the same checklist in both orientations.
 *
 * It was written for portrait and landscape had nothing: eight pills, all of
 * them, always. Two bars that disagree about which metrics exist is two mental
 * models for one number, so this is the one sheet and `metric-choice` is the
 * one rule. What differs between the shells is how many slots there are, and
 * that is a parameter.
 *
 * A checklist, not a filter list: what is ON the bar and what is not. Filtering
 * stays on the pill, where reading a number and acting on it are one gesture.
 * Metrics the day has none of are listed greyed rather than hidden, so "why is
 * Groupes missing" answers itself.
 */
export default function MetricChecklistSheet({
  all,
  candidates,
  shown,
  chosen,
  progress,
  slots,
  rooms,
  activeFilter,
  onChoose,
  onClose,
}: {
  all: { key: string; label: string; value: number }[];
  candidates: MetricCandidate[];
  shown: string[];
  chosen?: string[] | null;
  progress: Record<string, Progress | null>;
  slots: number;
  rooms: number;
  activeFilter: string | null;
  onChoose: (next: string[]) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center screen-safe" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35 dark:bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        data-role="portrait-filter-sheet"
        className="relative w-full max-w-[520px] max-h-[76dvh] overflow-y-auto rounded-t-[24px] p-4 pb-8 flex flex-col gap-2 animate-[sheetUp_.22s_cubic-bezier(.2,.9,.25,1)]"
        style={{ background: "var(--aur-bg-elev)", boxShadow: "0 -20px 60px -24px rgba(20,12,0,.55)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <div>
            <b className="text-[15px] text-dark block">Sur la barre</b>
            <span className="text-[12px] font-semibold" style={{ color: "var(--tab-idle)" }}>
              {slots} places · une nouvelle remplace la moins parlante
            </span>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            className="w-11 h-11 rounded-full grid place-items-center">
            <X size={15} weight="bold" style={{ color: "var(--brand-ink)" }} />
          </button>
        </div>

        {all.map((m) => {
          const on = shown.includes(m.key);
          const absent = m.value <= 0 && !CORE.includes(m.key);
          return (
            <button
              key={m.key}
              data-role="metric-choice-option"
              data-metric={m.key}
              role="checkbox"
              aria-checked={on}
              disabled={absent}
              onClick={() =>
                onChoose(
                  toggleMetric(chosen, m.key, shown, slots, candidates, rooms,
                    activeFilter ? [activeFilter] : [])
                )
              }
              className="min-h-[56px] px-4 rounded-[14px] flex items-center gap-3 text-left transition-transform active:scale-[0.98] disabled:opacity-40"
              style={{
                background: on ? "var(--aur-gold-soft)" : "rgba(128,128,128,.08)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--aur-gold)" : "inset 0 0 0 1px rgba(128,128,128,.12)",
              }}
            >
              <span
                className="w-6 h-6 shrink-0 rounded-[7px] grid place-items-center"
                style={on
                  ? { background: "var(--aur-gold)" }
                  : { boxShadow: "inset 0 0 0 1.5px rgba(128,128,128,.4)" }}
              >
                {on && <Check size={14} weight="bold" color="#fff" />}
              </span>
              <span className="flex-1 text-[15px] font-bold text-dark">{m.label}</span>
              <b className="text-[18px] font-black tabular-nums"
                style={{ color: on ? "var(--brand-ink)" : "var(--tab-idle)" }}>
                {absent ? "—" : progress[m.key] ? `${progress[m.key]!.done}/${progress[m.key]!.of}` : m.value}
              </b>
            </button>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes sheetUp { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </div>
  );
}
