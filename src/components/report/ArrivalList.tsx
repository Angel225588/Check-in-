"use client";
import { MagnifyingGlass, X, Star, Check, CircleHalf, XCircle } from "@phosphor-icons/react/dist/ssr";
import { ArrivalRow, FORMULE_LABEL, type Formule } from "@/lib/report-v2";

/* How the breakfast was covered. Quiet by default — it is a column you read
   down, not a status. Only "à encaisser" is tinted, because it is the one that
   is still an open question at the briefing. */
const FORMULE_STYLE: Record<Formule, { bg: string; fg: string }> = {
  inclus: { bg: "var(--aur-hairline)", fg: "var(--tab-idle)" },
  comp: { bg: "rgba(90,59,143,.16)", fg: "var(--aur-pm-points)" },
  points: { bg: "rgba(90,59,143,.16)", fg: "var(--aur-pm-points)" },
  chambre: { bg: "var(--aur-info-soft)", fg: "var(--aur-info-ink)" },
  carte: { bg: "var(--aur-info-soft)", fg: "var(--aur-info-ink)" },
  cash: { bg: "var(--aur-warn-soft)", fg: "var(--aur-warn-ink)" },
  supervisor: { bg: "var(--aur-hairline)", fg: "var(--tab-idle)" },
  "a-encaisser": { bg: "var(--aur-bad-soft)", fg: "var(--aur-bad-ink)" },
};

const STATUS = {
  "all-in": { label: "Entré", fg: "var(--aur-good-ink)", bg: "rgba(47,111,79,.20)", Icon: Check },
  partial: { label: "Partiel", fg: "var(--aur-warn-ink)", bg: "rgba(184,115,51,.20)", Icon: CircleHalf },
  "no-show": { label: "Absent", fg: "var(--aur-bad-ink)", bg: "rgba(161,59,44,.20)", Icon: XCircle },
} as const;

/**
 * Every room of the service, in the order people actually walked in.
 *
 * Arrival order is what reception reconstructs a morning from — "the family
 * just after the 8:10 rush" is how the day is remembered, not room 412.
 */
export default function ArrivalList({
  rows,
  query,
  onQuery,
  ecartRooms,
  onOpen,
}: {
  rows: ArrivalRow[];
  query: string;
  onQuery: (v: string) => void;
  ecartRooms: Set<string>;
  /** Open the guest's own screen. Reading the report and finding a note or
   *  fixing a count are the same errand — the row is where you notice, so the
   *  row is where you should be able to act. */
  onOpen?: (row: ArrivalRow) => void;
}) {
  return (
    <>
      <div className="flex gap-2 items-stretch my-2">
        <div
          className="flex-1 flex items-center gap-3 px-4 min-h-[50px] rounded-[14px]"
          style={{ background: "var(--aur-surface)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
        >
          <MagnifyingGlass size={18} weight="bold" style={{ color: "var(--tab-idle)" }} className="shrink-0" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            data-role="report-search"
            placeholder="Chambre ou nom du client…"
            aria-label="Chercher dans le rapport"
            autoComplete="off"
            className="flex-1 min-w-0 bg-transparent outline-none text-[16px] font-bold placeholder:font-normal placeholder:italic"
            style={{ color: "var(--brand-ink)", fontFamily: "inherit" }}
          />
          {query && (
            <button
              onClick={() => onQuery("")}
              aria-label="Effacer"
              className="w-11 h-11 shrink-0 -mr-2 rounded-full grid place-items-center active:scale-[0.94] transition-transform"
            >
              <X size={15} weight="bold" style={{ color: "var(--tab-idle)" }} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1" data-role="report-list">
        {rows.length === 0 && (
          <div className="py-10 text-center text-[14px] font-semibold" style={{ color: "var(--tab-idle)" }}>
            Aucune chambre ne correspond.
          </div>
        )}
        {rows.map((r) => {
          const s = STATUS[r.status];
          return (
            <button
              key={`${r.roomNumber}-${r.name}`}
              data-role="report-row"
              onClick={() => onOpen?.(r)}
              disabled={!onOpen}
              aria-label={`Ouvrir la chambre ${r.roomNumber}`}
              className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-[12px] min-h-[44px] enabled:active:scale-[0.995] transition-transform"
              style={{ background: "var(--aur-surface)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
            >
              <span className="text-[14px] font-black tabular-nums min-w-[52px]" style={{ color: "var(--tab-idle)" }}>
                {r.time}
              </span>
              <span className="text-[19px] font-black tabular-nums min-w-[52px]" style={{ color: "var(--brand-ink)" }}>
                {r.roomNumber}
              </span>
              <span className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-[14.5px] font-bold truncate" style={{ color: "var(--aur-ink-2)" }}>
                  {r.name}
                </span>
                {r.isVip && (
                  <Star weight="fill" size={13} style={{ color: "var(--aur-gold)" }} aria-label="VIP" className="shrink-0" />
                )}
                {r.offList && (
                  <span className="shrink-0 text-[9.5px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)" }}>
                    HORS LISTE
                  </span>
                )}
                {ecartRooms.has(r.roomNumber) && (
                  <span className="shrink-0 text-[9.5px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: "var(--aur-warn-soft)", color: "var(--aur-warn-ink)" }}>
                    ÉCART
                  </span>
                )}
              </span>
              <span
                data-role="report-formule"
                data-formule={r.formule}
                className="shrink-0 w-[104px] text-center text-[11px] font-black px-2 py-1 rounded-[8px] whitespace-nowrap"
                style={{ background: FORMULE_STYLE[r.formule].bg, color: FORMULE_STYLE[r.formule].fg }}
              >
                {FORMULE_LABEL[r.formule]}
              </span>
              <span
                className="shrink-0 flex items-center gap-1.5 text-[12px] font-black px-3 py-1.5 rounded-full whitespace-nowrap"
                style={{ background: s.bg, color: s.fg }}
              >
                <s.Icon weight="bold" size={12} />
                {s.label}
                <b className="tabular-nums">
                  {r.status === "partial"
                    ? ` ${r.entered}/${r.totalGuests}`
                    : r.status === "all-in"
                      ? ` ${r.entered}`
                      : ""}
                </b>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
