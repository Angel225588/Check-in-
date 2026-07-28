"use client";
import { Check, CircleHalf, X, Star, Gift } from "@phosphor-icons/react/dist/ssr";
import { OutcomeSplit } from "@/lib/report-v2";
import { ReportFilter } from "@/lib/report-v2";

/**
 * The day's outcome as area.
 *
 * Area carries the proportion, so the split reads without counting anything and
 * colour is left doing only one job: labelling. That matters here — red/green is
 * the one pair a colour-blind reader loses, and every block also carries a
 * glyph and a percentage, so nothing is encoded in hue alone.
 */
export default function OutcomeTreemap({
  split,
  vip,
  comp,
  filter,
  onFilter,
}: {
  split: OutcomeSplit;
  vip: number;
  comp: number;
  filter: ReportFilter;
  onFilter: (f: ReportFilter) => void;
}) {
  const pc = (n: number) => (split.total ? ((n / split.total) * 100).toFixed(1) : "0.0") + " %";
  const rest = split.partial + split.noShow;

  const block =
    "relative rounded-[12px] overflow-hidden text-left text-white flex flex-col justify-end transition-transform active:scale-[0.98]";

  return (
    <div className="flex flex-col gap-[7px] flex-1 min-h-0" data-role="report-treemap">
      <button
        onClick={() => onFilter(filter === "in" ? "all" : "in")}
        data-role="treemap-block"
        aria-pressed={filter === "in"}
        className={`${block} px-4 py-3.5`}
        style={{
          flex: Math.max(split.allIn, 0.35),
          background: "linear-gradient(150deg,#357D58,#255B41)",
          outline: filter === "in" ? "2px solid var(--brand-ink)" : undefined,
          outlineOffset: "-2px",
        }}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] opacity-[0.92]">
          <Check weight="bold" size={13} /> Entrés
        </span>
        <span className="text-[34px] font-black leading-none tracking-[-0.03em] tabular-nums mt-0.5">{split.allIn}</span>
        <span className="text-[15px] font-black tabular-nums opacity-95">{pc(split.allIn)}</span>
        {(vip > 0 || comp > 0) && (
          <span className="flex gap-[5px] mt-2.5">
            <span className="flex-1 rounded-[8px] px-2.5 py-1.5" style={{ background: "rgba(0,0,0,.28)" }}>
              <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.09em]">
                <Star weight="fill" size={10} /> VIP
              </span>
              <span className="block text-[16px] font-black tabular-nums">{vip}</span>
            </span>
            <span className="flex-1 rounded-[8px] px-2.5 py-1.5" style={{ background: "rgba(0,0,0,.28)" }}>
              <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.09em]">
                <Gift weight="fill" size={10} /> COMP
              </span>
              <span className="block text-[16px] font-black tabular-nums">{comp}</span>
            </span>
          </span>
        )}
      </button>

      <div className="flex gap-[7px]" style={{ flex: Math.max(rest, 0.5) }}>
        <button
          onClick={() => onFilter(filter === "partial" ? "all" : "partial")}
          data-role="treemap-block"
          aria-pressed={filter === "partial"}
          className={`${block} px-3 py-2.5`}
          style={{
            flex: Math.max(split.partial, 0.35),
            background: "linear-gradient(150deg,#96622A,#77491B)",
            outline: filter === "partial" ? "2px solid var(--brand-ink)" : undefined,
            outlineOffset: "-2px",
          }}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] opacity-[0.92]">
            <CircleHalf weight="fill" size={13} /> Partiel
          </span>
          <span className="text-[26px] font-black leading-none tracking-[-0.03em] tabular-nums">{split.partial}</span>
          <span className="text-[13px] font-black tabular-nums opacity-95">{pc(split.partial)}</span>
        </button>
        <button
          onClick={() => onFilter(filter === "no" ? "all" : "no")}
          data-role="treemap-block"
          aria-pressed={filter === "no"}
          className={`${block} px-3 py-2.5`}
          style={{
            flex: Math.max(split.noShow, 0.35),
            background: "linear-gradient(150deg,#A93F32,#802A1F)",
            outline: filter === "no" ? "2px solid var(--brand-ink)" : undefined,
            outlineOffset: "-2px",
          }}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] opacity-[0.92]">
            <X weight="bold" size={13} /> Absents
          </span>
          <span className="text-[26px] font-black leading-none tracking-[-0.03em] tabular-nums">{split.noShow}</span>
          <span className="text-[13px] font-black tabular-nums opacity-95">{pc(split.noShow)}</span>
        </button>
      </div>
    </div>
  );
}
