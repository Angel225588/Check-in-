"use client";
import { useState, useEffect } from "react";
import { FunnelSimple, Check, X } from "@phosphor-icons/react/dist/ssr";
import { ReportFilter } from "@/lib/report-v2";

export interface ReportTile {
  key: ReportFilter;
  label: string;
  value: string | number;
  /** Secondary figure, e.g. "+9 pers." on the reception-error tile. */
  sub?: string;
  /** The reception-error tile measures the source data, not the service. */
  warn?: boolean;
}

/**
 * The metrics double as the filter row: reading a number and acting on it are
 * the same gesture, and they sit directly on top of the list they filter.
 *
 * Eight of them was too many — the row wrapped onto a second line and ate the
 * list it was meant to serve. Five are shown (four on a narrower screen) and
 * the rest live behind a funnel, which is what Base44, Twenty and Remote all
 * do with the same problem.
 *
 * The rule that makes an overflow honest, taken from those three: whatever is
 * ACTIVE is always in the visible row. Pick "Enfants" out of the funnel and it
 * takes a visible slot, so the list is never filtered by something you cannot
 * see, which also means the funnel never needs an "active" badge.
 */

/** Most useful first. What survives to the visible row when space is short. */
const PRIORITY: ReportFilter[] = ["in", "no", "partial", "ecart", "groupe", "vip", "comp", "enfants", "offlist"];

function useVisibleCount(): number {
  const [n, setN] = useState(5);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const apply = () => setN(mq.matches ? 5 : 4);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return n;
}

export default function ReportTiles({
  tiles,
  filter,
  onFilter,
}: {
  tiles: ReportTile[];
  filter: ReportFilter;
  onFilter: (f: ReportFilter) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const max = useVisibleCount();

  const ranked = [...tiles].sort(
    (a, b) => PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key)
  );
  const visible = ranked.slice(0, max);
  let hidden = ranked.slice(max);

  // Promote the active filter if the ranking buried it. Something filtering the
  // list from off-screen is how you end up staring at four rows wondering why.
  if (filter !== "all" && hidden.some((t) => t.key === filter)) {
    const promoted = hidden.find((t) => t.key === filter)!;
    hidden = [...hidden.filter((t) => t.key !== filter), visible[visible.length - 1]];
    visible[visible.length - 1] = promoted;
  }

  return (
    <>
      <div className="flex gap-2" data-role="report-tiles">
        {visible.map((tile) => {
          const on = filter === tile.key;
          return (
            <button
              key={tile.key}
              data-role="report-tile"
              data-tile={tile.key}
              aria-pressed={on}
              onClick={() => onFilter(on ? "all" : tile.key)}
              /* Every tile the same width. A row that sizes each box to its own
                 label reads as assembled rather than designed, and the labels
                 are short enough now that nothing has to be squeezed. */
              className="flex-1 min-w-0 min-h-[56px] px-3 py-2 rounded-[14px] text-left transition-transform active:scale-[0.97]"
              style={
                on
                  ? {
                      background: "linear-gradient(180deg,var(--aur-gold-soft-2),var(--aur-gold-soft))",
                      boxShadow: "inset 0 1px 0 rgba(255,222,160,.26)",
                    }
                  : {
                      background: "var(--aur-surface)",
                      boxShadow: `inset 0 0 0 1px ${tile.warn ? "rgba(184,115,51,.45)" : "var(--aur-hairline)"}`,
                    }
              }
            >
              <div
                className="text-[9.5px] font-black uppercase tracking-[0.11em] truncate"
                style={{ color: on ? "var(--brand-ink)" : tile.warn ? "var(--aur-warn-ink)" : "var(--tab-idle)" }}
              >
                {tile.label}
              </div>
              <div
                className="text-[22px] font-black leading-[1.15] tabular-nums truncate"
                style={{ color: on ? "var(--brand-ink)" : "var(--aur-ink-2)" }}
              >
                {tile.value}
                {tile.sub && (
                  <em className="not-italic text-[12px] font-black ml-1.5" style={{ color: "var(--aur-warn-ink)" }}>
                    {tile.sub}
                  </em>
                )}
              </div>
            </button>
          );
        })}

        {hidden.length > 0 && (
          <button
            onClick={() => setSheet(true)}
            data-role="report-filter-more"
            aria-label={`Autres filtres (${hidden.length})`}
            className="relative shrink-0 w-[56px] min-h-[56px] rounded-[14px] grid place-items-center transition-transform active:scale-[0.94]"
            style={{ background: "var(--aur-surface)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
          >
            <FunnelSimple size={19} weight="bold" style={{ color: "var(--tab-idle)" }} />
            <span className="absolute bottom-1.5 text-[9px] font-black tabular-nums" style={{ color: "var(--tab-idle)" }}>
              +{hidden.length}
            </span>
          </button>
        )}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setSheet(false)}>
          <div className="absolute inset-0 bg-black/35 dark:bg-black/60" />
          <div
            className="relative w-full max-w-[420px] rounded-[24px] p-4 flex flex-col gap-2 animate-[cardIn_.2s_cubic-bezier(.2,.9,.25,1)]"
            style={{ background: "var(--aur-bg-elev)", boxShadow: "0 24px 60px -24px rgba(20,12,0,.55), inset 0 0 0 1px var(--aur-hairline)" }}
            onClick={(e) => e.stopPropagation()}
            data-role="report-filter-sheet"
          >
            <div className="flex items-center justify-between mb-1">
              <b className="text-[15px] text-dark">Filtrer</b>
              <button onClick={() => setSheet(false)} aria-label="Fermer" className="w-11 h-11 rounded-full grid place-items-center glass-liquid">
                <X size={15} weight="bold" />
              </button>
            </div>

            {/* Every filter, not only the hidden ones — a sheet that lists a
                subset makes you remember which half you are looking at. */}
            {ranked.map((t) => {
              const on = filter === t.key;
              return (
                <button
                  key={t.key}
                  data-role="report-filter-option"
                  data-tile={t.key}
                  onClick={() => { onFilter(on ? "all" : t.key); setSheet(false); }}
                  className="min-h-[52px] px-4 rounded-[14px] flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
                  style={{
                    background: on ? "var(--aur-gold-soft)" : "rgba(128,128,128,.08)",
                    boxShadow: on ? "inset 0 0 0 1.5px var(--aur-gold)" : "inset 0 0 0 1px rgba(128,128,128,.12)",
                  }}
                >
                  <span className="w-5 shrink-0">
                    {on && <Check size={16} weight="bold" style={{ color: "var(--brand-ink)" }} />}
                  </span>
                  <span className="flex-1 text-[14px] font-bold text-dark">{t.label}</span>
                  <b className="text-[16px] font-black tabular-nums" style={{ color: on ? "var(--brand-ink)" : "var(--tab-idle)" }}>
                    {t.value}
                  </b>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
