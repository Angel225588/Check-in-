"use client";
import { Check, Package, ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import type { BoxRow } from "@/lib/box-list";
import { boxCount } from "@/lib/box-list";

/**
 * US-34 — the box run.
 *
 * Forty rooms, three minutes, a driver outside. Every design choice here is
 * downstream of that:
 *
 * - **One line per room, room order.** It is read against the coach's paper
 *   manifest, and a coach's rooms run consecutively. Sorting by arrival would
 *   reshuffle the list under the finger with every tick.
 * - **One tap serves the whole room.** Not a stepper: a bag per person is the
 *   case, and the exception can be corrected on the guest's own screen.
 * - **The number is on the left, big.** The room number is what is being
 *   matched against the bag in reception's hand.
 * - **Undo in place, two-step.** Same as the activity list. Mid-run there is no
 *   attention to spare for a confirm dialog, and no forgiveness for a tap that
 *   silently undid a room.
 */
export default function BoxList({
  rows,
  onServe,
  onUndo,
}: {
  rows: BoxRow[];
  onServe: (row: BoxRow) => void;
  /** Present only for rows this screen actually recorded. */
  onUndo?: (row: BoxRow) => void;
}) {
  const { done, of } = boxCount(rows);

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-role="box-list">
      <div className="shrink-0 flex items-baseline gap-2 px-1 pb-1.5">
        <Package size={15} weight="duotone" style={{ color: "var(--brand-ink)" }} />
        <b className="text-[12px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--brand-ink)" }}>
          Paniers
        </b>
        <span className="flex-1" />
        {/* The only number this screen owes anyone: how far through the run. */}
        <b className="text-[13px] font-black tabular-nums" data-role="box-progress"
          style={{ color: done === of ? "var(--aur-good)" : "var(--tab-idle)" }}>
          {done}/{of}
        </b>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-0.5">
        {rows.map((r) => (
          <div
            key={r.roomNumber + r.name}
            data-role="box-row"
            data-room={r.roomNumber}
            data-done={r.done}
            className="shrink-0 flex items-center gap-3 min-h-[56px] px-3 rounded-[14px]"
            style={r.done
              ? { background: "var(--aur-good-soft)", boxShadow: "inset 0 0 0 1.5px var(--aur-good)" }
              : { background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px rgba(128,128,128,.14)" }}
          >
            <b className="text-[22px] font-black tabular-nums w-[68px] shrink-0"
              style={{ color: r.done ? "var(--aur-good-ink)" : "var(--brand-ink)" }}>
              {r.roomNumber}
            </b>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-dark truncate">{r.name.replace("/", " ")}</div>
              <div className="text-[11.5px] font-semibold" style={{ color: "var(--tab-idle)" }}>
                {r.done
                  ? r.viaBox ? `${r.taken} panier${r.taken > 1 ? "s" : ""}` : `${r.taken} au restaurant`
                  : `${r.due - r.taken} à servir${r.taken > 0 ? ` · ${r.taken} déjà` : ""}`}
              </div>
            </div>

            {/* Two buttons side by side, never a button inside a button. */}
            {r.done ? (
              onUndo ? (
                <button
                  onClick={() => onUndo(r)}
                  data-role="box-undo"
                  aria-label={`Annuler le panier de la chambre ${r.roomNumber}`}
                  className="shrink-0 w-[52px] h-[44px] rounded-[12px] grid place-items-center active:scale-[0.94] transition-transform"
                  style={{ background: "rgba(128,128,128,.10)" }}
                >
                  <ArrowCounterClockwise size={17} weight="bold" style={{ color: "var(--tab-idle)" }} />
                </button>
              ) : (
                <span className="shrink-0 w-[52px] h-[44px] rounded-[12px] grid place-items-center">
                  <Check size={19} weight="bold" style={{ color: "var(--aur-good)" }} />
                </span>
              )
            ) : (
              <button
                onClick={() => onServe(r)}
                data-role="box-serve"
                aria-label={`Donner ${r.due - r.taken} panier(s) à la chambre ${r.roomNumber}`}
                className="shrink-0 min-w-[76px] h-[44px] rounded-[12px] inline-flex items-center justify-center gap-1.5 text-white text-[14px] font-black active:scale-[0.95] transition-transform"
                style={{ background: "var(--aur-good)" }}
              >
                <Check size={17} weight="bold" />
                {r.due - r.taken}
              </button>
            )}
          </div>
        ))}

        {rows.length === 0 && (
          <div className="text-center text-[13px] py-6" style={{ color: "var(--tab-idle)" }}>
            Choisissez un groupe pour préparer ses paniers.
          </div>
        )}
      </div>
    </div>
  );
}
