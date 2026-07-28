"use client";
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
 */
export default function ReportTiles({
  tiles,
  filter,
  onFilter,
}: {
  tiles: ReportTile[];
  filter: ReportFilter;
  onFilter: (f: ReportFilter) => void;
}) {
  return (
    <div className="flex gap-[7px] overflow-x-auto no-scrollbar" data-role="report-tiles">
      {tiles.map((tile) => {
        const on = filter === tile.key;
        return (
          <button
            key={tile.key}
            data-role="report-tile"
            data-tile={tile.key}
            aria-pressed={on}
            onClick={() => onFilter(on ? "all" : tile.key)}
            className="shrink-0 min-h-[56px] px-4 py-1.5 rounded-[13px] text-left transition-transform active:scale-[0.97]"
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
              className="text-[9.5px] font-black uppercase tracking-[0.11em] whitespace-nowrap"
              style={{ color: on ? "var(--brand-ink)" : tile.warn ? "var(--aur-warn-ink)" : "var(--tab-idle)" }}
            >
              {tile.label}
            </div>
            <div
              className="text-[22px] font-black leading-[1.15] tabular-nums"
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
    </div>
  );
}
