"use client";
import { Check } from "@phosphor-icons/react/dist/ssr";
import type { GroupBlock } from "@/lib/groups";
import { toggleGroup } from "@/lib/group-pick";

/**
 * US-21 — which coach.
 *
 * "Groupes" as one pill answers a question reception rarely asks. Two tours on
 * the same morning are two different mornings: one is downstairs at 06:40 with
 * a 07:15 departure, the other drifts in until half past nine. Filtering to
 * "the group" and getting both is filtering to nothing.
 *
 * One line, one tap per tick — a checklist, not a sheet. There are two or three
 * blocks in a house, and making someone open a modal to choose between three
 * things costs more than it saves. "Tous" is a real state, not the absence of
 * one: with nothing ticked the pill behaves exactly as it did before.
 *
 * Not shown at all when the day has one block. A control with a single option
 * is a control that only ever teaches you it does nothing.
 */
export default function GroupPicker({
  blocks,
  picked,
  onPick,
}: {
  blocks: GroupBlock[];
  picked: string[];
  onPick: (next: string[]) => void;
}) {
  if (blocks.length < 2) return null;

  const chip =
    "min-h-[40px] shrink-0 px-3 rounded-[12px] inline-flex items-center gap-2 text-left transition-transform active:scale-[0.97]";

  return (
    <div
      data-role="group-picker"
      /* No negative margin. It bled four pixels past the content box of the
         list that holds it, and a list with `overflow-y: auto` and no explicit
         overflow-x is scrollable on BOTH axes — so those four pixels were
         enough for a touch to grab the horizontal one and drag the whole
         column sideways. It only ever happened with Groupes because this is
         the only control that sits inside that list. */
      className="shrink-0 flex items-center gap-1.5 overflow-x-auto pb-1"
      /* The chips scroll sideways; nothing else does. `pan-x` keeps a vertical
         drag that starts on a chip going to the list underneath, and `contain`
         stops the chips handing their overscroll back up the tree. */
      style={{ scrollbarWidth: "none", touchAction: "pan-x", overscrollBehaviorX: "contain" }}
      role="group"
      aria-label="Filtrer par groupe"
    >
      <button
        data-role="group-pick-all"
        role="checkbox"
        aria-checked={picked.length === 0}
        onClick={() => onPick([])}
        className={chip}
        style={picked.length === 0
          ? { background: "var(--aur-gold-soft)", boxShadow: "inset 0 0 0 1.5px var(--aur-gold)" }
          : { background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px rgba(128,128,128,.12)" }}
      >
        <span className="text-[13px] font-black text-dark">Tous</span>
        <b className="text-[13px] font-black tabular-nums" style={{ color: "var(--tab-idle)" }}>
          {blocks.length}
        </b>
      </button>

      {blocks.map((b) => {
        const on = picked.includes(b.key);
        return (
          <button
            key={b.key}
            data-role="group-pick-option"
            data-group={b.key}
            role="checkbox"
            aria-checked={on}
            onClick={() => onPick(toggleGroup(picked, b.key))}
            className={chip}
            style={on
              ? { background: "var(--aur-gold-soft)", boxShadow: "inset 0 0 0 1.5px var(--aur-gold)" }
              : { background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px rgba(128,128,128,.12)" }}
          >
            <span
              className="w-[18px] h-[18px] shrink-0 rounded-[6px] grid place-items-center"
              style={on
                ? { background: "var(--aur-gold)" }
                : { boxShadow: "inset 0 0 0 1.5px rgba(128,128,128,.4)" }}
            >
              {on && <Check size={11} weight="bold" color="#fff" />}
            </span>
            {/* The rate code is what the tour is called at the desk — it is on
                the arrivals list and on the coach's paperwork. It is not unique
                though: two blocks can share one code and differ only by their
                stay window, and two identical chips is a control you cannot
                aim. The arrival date is what separates them. */}
            <span className="text-[13px] font-black text-dark whitespace-nowrap">
              {b.rateCode || "Groupe"}
              {blocks.filter((x) => x.rateCode === b.rateCode).length > 1 && (
                <span className="font-bold" style={{ color: "var(--tab-idle)" }}> · {b.arrivalDate.slice(0, 5)}</span>
              )}
            </span>
            <b className="text-[13px] font-black tabular-nums" style={{ color: "var(--tab-idle)" }}>
              {b.rooms}
            </b>
          </button>
        );
      })}
    </div>
  );
}
