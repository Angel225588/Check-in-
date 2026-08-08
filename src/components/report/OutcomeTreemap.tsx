"use client";
import { Check, CircleHalf, X, Star, Gift } from "@phosphor-icons/react/dist/ssr";
import { OutcomeSplit, ReportFilter, treemapShares } from "@/lib/report-v2";

/**
 * The day's outcome as area.
 *
 * Area carries the proportion, so the split reads without counting anything and
 * colour is left doing only one job: labelling. That matters here — red/green is
 * the one pair a colour-blind reader loses, and every block also carries a
 * glyph and a percentage, so nothing is encoded in hue alone.
 *
 * An outcome that did not happen gets no block at all — a day with no partial
 * arrivals should not draw an empty "Partiel" rectangle, and the tiles above
 * the list still carry the 0 for anyone who wonders. Outcomes that DID happen
 * but are tiny are floored to a legible size instead (see treemapShares) and
 * drop to a compact layout, so a real 1-of-117 is never invisible and never
 * clipped down its own middle.
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

  // Column: Entrés against everything else. Row: partial against absent.
  const rest = split.partial + split.noShow;
  const [inS, restS] = treemapShares([split.allIn, rest], 0.26);
  const [paS, noS] = treemapShares([split.partial, split.noShow], 0.34);

  const block =
    "relative rounded-[12px] overflow-hidden text-left text-white flex flex-col justify-end transition-transform active:scale-[0.98] min-w-0";

  /** A widened block gets the compact treatment: one line, no sub-figures. */
  const Small = ({
    label,
    Icon,
    value,
    pct,
    tight,
    bg,
    on,
    onClick,
    flex,
  }: {
    label: string;
    Icon: typeof Check;
    value: number;
    pct: string;
    tight: boolean;
    bg: string;
    on: boolean;
    onClick: () => void;
    flex: number;
  }) => (
    <button
      onClick={onClick}
      data-role="treemap-block"
      aria-pressed={on}
      aria-label={`${label} ${value} (${pct})`}
      className={`${block} ${tight ? "px-2 py-2 justify-center" : "px-3 py-2"}`}
      style={{
        flex: `${flex} 1 0`,
        background: bg,
        outline: on ? "2px solid var(--brand-ink)" : undefined,
        outlineOffset: "-2px",
      }}
    >
      <span
        className={`flex items-center gap-1 font-black uppercase tracking-[0.08em] opacity-[0.92] min-w-0 ${
          tight ? "text-[9.5px]" : "text-[11px] gap-1.5 tracking-[0.12em]"
        }`}
      >
        <Icon weight="bold" size={tight ? 10 : 13} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {tight ? (
        /* One line for the figure, one for the label above it. Two lines fit a
           90px box; the single-line version truncated "Partiel" to "PARTI…". */
        <span className="flex items-baseline gap-1 mt-0.5 min-w-0">
          <span className="text-[22px] font-black leading-none tabular-nums">{value}</span>
          <span className="text-[10.5px] font-black tabular-nums opacity-90 truncate">{pct}</span>
        </span>
      ) : (
        <>
          <span className="text-[26px] font-black leading-none tracking-[-0.03em] tabular-nums">{value}</span>
          <span className="text-[13px] font-black tabular-nums opacity-95">{pct}</span>
        </>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0" data-role="report-treemap">
      <button
        onClick={() => onFilter(filter === "in" ? "all" : "in")}
        data-role="treemap-block"
        aria-pressed={filter === "in"}
        className={`${block} ${inS.floored ? "px-3 py-2 justify-center" : "px-4 py-3"}`}
        style={{
          flex: `${inS.share} 1 0`,
          background: "linear-gradient(150deg,#357D58,#255B41)",
          outline: filter === "in" ? "2px solid var(--brand-ink)" : undefined,
          outlineOffset: "-2px",
        }}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] opacity-[0.92]">
          <Check weight="bold" size={13} /> Entrés
        </span>
        {inS.floored ? (
          <span className="flex items-baseline gap-2 mt-0.5">
            <span className="text-[24px] font-black leading-none tabular-nums">{split.allIn}</span>
            <span className="text-[12px] font-black tabular-nums opacity-90">{pc(split.allIn)}</span>
          </span>
        ) : (
          <>
            <span className="text-[34px] font-black leading-none tracking-[-0.03em] tabular-nums mt-0.5">{split.allIn}</span>
            <span className="text-[15px] font-black tabular-nums opacity-95">{pc(split.allIn)}</span>
            {(vip > 0 || comp > 0) && (
              <span className="flex gap-1 mt-2">
                <span className="flex-1 rounded-[8px] px-2 py-1.5 min-w-0" style={{ background: "rgba(0,0,0,.28)" }}>
                  <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.09em]">
                    <Star weight="fill" size={10} /> VIP
                  </span>
                  <span className="block text-[16px] font-black tabular-nums">{vip}</span>
                </span>
                <span className="flex-1 rounded-[8px] px-2 py-1.5 min-w-0" style={{ background: "rgba(0,0,0,.28)" }}>
                  <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.09em]">
                    <Gift weight="fill" size={10} /> COMP
                  </span>
                  <span className="block text-[16px] font-black tabular-nums">{comp}</span>
                </span>
              </span>
            )}
          </>
        )}
      </button>

      {rest > 0 && (
      <div className="flex gap-2 min-h-[72px]" style={{ flex: `${restS.share} 1 0` }}>
        {split.partial > 0 && (
        <Small
          label="Partiel"
          Icon={CircleHalf}
          value={split.partial}
          pct={pc(split.partial)}
          tight={paS.floored}
          bg="linear-gradient(150deg,#96622A,#77491B)"
          on={filter === "partial"}
          onClick={() => onFilter(filter === "partial" ? "all" : "partial")}
          flex={paS.share}
        />
        )}
        {split.noShow > 0 && (
        <Small
          label="Absents"
          Icon={X}
          value={split.noShow}
          pct={pc(split.noShow)}
          tight={noS.floored}
          bg="linear-gradient(150deg,#A93F32,#802A1F)"
          on={filter === "no"}
          onClick={() => onFilter(filter === "no" ? "all" : "no")}
          flex={noS.share}
        />
        )}
      </div>
      )}
    </div>
  );
}
