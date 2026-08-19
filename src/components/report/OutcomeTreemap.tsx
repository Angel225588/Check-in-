"use client";
import { Check, X, Star, Gift } from "@phosphor-icons/react/dist/ssr";
import { ReportFilter, treemapShares } from "@/lib/report-v2";

/**
 * The morning as area: who got breakfast, and who did not.
 *
 * Area carries the proportion, so the split reads without counting anything and
 * colour is left doing only one job: labelling. That matters here — red/green is
 * the one pair a colour-blind reader loses, and each block also carries a glyph,
 * a figure and a percentage, so nothing is encoded in hue alone.
 *
 * **It counts people, and it counts them once.** It used to be a three-way split
 * of ROOMS — entrés, partiel, absents — while the ring beside it reported a
 * share of PEOPLE. Two percentages, same morning, side by side: 86 % on the ring
 * and 84.6 % on the panel, then 49 % and 40 % once the panel switched to people
 * but kept partial rooms in their own block. Both were arithmetically right and
 * answering slightly different questions, and nobody standing at a desk should
 * have to work out which one is the real one.
 *
 * So there are two blocks over one population. A room can be half arrived; a
 * PERSON cannot — they ate or they did not. "Servi" is everyone who ate, which
 * is exactly the ring's numerator, so the two figures are the same number by
 * construction rather than by luck. Partiel keeps its tile above the list,
 * where the question is about rooms and the answer changes what you go and do.
 *
 * An outcome that did not happen gets no block at all: before anyone comes down
 * there is no green sliver over a red panel reading 100 %. One that DID happen
 * but is tiny is floored to a legible size instead (see treemapShares) and drops
 * to a compact layout, so a real 1-of-117 is never invisible and never clipped
 * down its own middle.
 */
export default function OutcomeTreemap({
  people,
  rooms,
  vip,
  comp,
  filter,
  onFilter,
}: {
  /** The house in people: served, missing, and the whole. The two parts add
   *  back to `total`, so every percentage on the report divides by one number. */
  people: { served: number; missing: number; total: number };
  /** The doors behind them, in small type — a block still filters a list of
   *  rooms, and "how many rooms is that" is the next question. */
  rooms: { served: number; missing: number };
  vip: number;
  comp: number;
  filter: ReportFilter;
  onFilter: (f: ReportFilter) => void;
}) {
  /* A day with rooms but no expected people would collapse both blocks to
     nothing; fall back to doors rather than draw an empty panel. */
  const byPeople = people.total > 0;
  const w = byPeople
    ? { served: people.served, missing: people.missing, total: people.total }
    : { served: rooms.served, missing: rooms.missing, total: rooms.served + rooms.missing };

  /* Whole percent, and the ring's denominator. A tenth of a point is precision
     nobody uses at 09:00 and one more thing to reconcile. */
  const pc = (n: number) => (w.total ? Math.round((n / w.total) * 100) : 0) + " %";

  const [servedS, missingS] = treemapShares([w.served, w.missing], 0.26);

  const block =
    "relative rounded-md overflow-hidden text-left text-white flex flex-col justify-end " +
    "transition-transform active:scale-[0.98] min-w-0";

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0" data-role="report-treemap">
      {w.served > 0 && (
        <button
          onClick={() => onFilter(filter === "servis" ? "all" : "servis")}
          data-role="treemap-block"
          data-block="servis"
          aria-pressed={filter === "servis"}
          aria-label={`Entrés ${w.served} personnes (${pc(w.served)}, ${rooms.served} chambres)`}
          className={`${block} ${servedS.floored ? "px-3 py-2 justify-center" : "px-4 py-3"}`}
          style={{
            flex: `${servedS.share} 1 0`,
            background: "linear-gradient(150deg,#357D58,#255B41)",
            outline: filter === "servis" ? "2px solid var(--brand-ink)" : undefined,
            outlineOffset: "-2px",
          }}
        >
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] opacity-[0.92]">
            <Check weight="bold" size={13} /> Entrés
          </span>
          {servedS.floored ? (
            <span className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black leading-none tabular-nums">{w.served}</span>
              <span className="text-xs font-black tabular-nums opacity-90">
                pers. · {pc(w.served)} · {rooms.served} ch.
              </span>
            </span>
          ) : (
            <>
              <span className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-4xl font-black leading-none tracking-[-0.03em] tabular-nums">{w.served}</span>
                <em className="not-italic text-sm font-black opacity-80">pers.</em>
              </span>
              <span className="text-base font-black tabular-nums opacity-95">
                {pc(w.served)}
                <em className="not-italic opacity-80"> · {rooms.served} ch.</em>
              </span>
              {(vip > 0 || comp > 0) && (
                <span className="flex gap-1 mt-2">
                  <span className="flex-1 rounded-sm px-2 py-1.5 min-w-0" style={{ background: "rgba(0,0,0,.28)" }}>
                    <span className="flex items-center gap-1 text-micro font-black uppercase tracking-[0.09em]">
                      <Star weight="fill" size={10} /> VIP
                    </span>
                    <span className="block text-base font-black tabular-nums">{vip}</span>
                  </span>
                  <span className="flex-1 rounded-sm px-2 py-1.5 min-w-0" style={{ background: "rgba(0,0,0,.28)" }}>
                    <span className="flex items-center gap-1 text-micro font-black uppercase tracking-[0.09em]">
                      <Gift weight="fill" size={10} /> COMP
                    </span>
                    <span className="block text-base font-black tabular-nums">{comp}</span>
                  </span>
                </span>
              )}
            </>
          )}
        </button>
      )}

      {w.missing > 0 && (
        <button
          onClick={() => onFilter(filter === "no" ? "all" : "no")}
          data-role="treemap-block"
          data-block="absents"
          aria-pressed={filter === "no"}
          aria-label={`Absents ${w.missing} personnes (${pc(w.missing)}, ${rooms.missing} chambres)`}
          className={`${block} min-h-[72px] ${missingS.floored ? "px-3 py-2 justify-center" : "px-4 py-3"}`}
          style={{
            flex: `${missingS.share} 1 0`,
            background: "linear-gradient(150deg,#A93F32,#802A1F)",
            outline: filter === "no" ? "2px solid var(--brand-ink)" : undefined,
            outlineOffset: "-2px",
          }}
        >
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] opacity-[0.92]">
            <X weight="bold" size={13} /> Absents
          </span>
          {missingS.floored ? (
            <span className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black leading-none tabular-nums">{w.missing}</span>
              <span className="text-xs font-black tabular-nums opacity-90">
                pers. · {pc(w.missing)} · {rooms.missing} ch.
              </span>
            </span>
          ) : (
            <>
              <span className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-4xl font-black leading-none tracking-[-0.03em] tabular-nums">{w.missing}</span>
                <em className="not-italic text-sm font-black opacity-80">pers.</em>
              </span>
              <span className="text-base font-black tabular-nums opacity-95">
                {pc(w.missing)}
                <em className="not-italic opacity-80"> · {rooms.missing} ch.</em>
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
