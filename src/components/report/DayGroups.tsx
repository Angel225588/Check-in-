"use client";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { GroupBlock } from "@/lib/groups";

/**
 * The day's group blocks — the part of the briefing that explains the shape of
 * the morning.
 *
 * A tour is not forty individuals. It arrives on one coach inside twenty
 * minutes, and it leaves on one morning. Both facts change what the kitchen
 * puts out and when, and neither is visible in a total.
 *
 * The departure date is here on purpose: the morning a block checks out is a
 * big early peak, and the morning after is a cliff. Ordering follows the
 * change more than the level.
 */
export default function DayGroups({
  blocks,
  today,
  onFilter,
  active,
}: {
  blocks: GroupBlock[];
  /** dd/mm/yy as the report writes it, for spotting a departure today. */
  today: string;
  onFilter: () => void;
  active: boolean;
}) {
  if (blocks.length === 0) return null;
  const people = blocks.reduce((n, b) => n + b.people, 0);

  return (
    <div className="surface-card rounded-[20px] px-4 pt-3 pb-4 flex flex-col gap-3 shrink-0" data-role="report-groups">
      <div className="flex items-baseline justify-between">
        <span className="text-[10.5px] font-black uppercase tracking-[0.14em] inline-flex items-center gap-1.5" style={{ color: "var(--tab-idle)" }}>
          <UsersThree weight="duotone" size={14} /> Groupes
        </span>
        <b className="text-[12px] font-bold tabular-nums" style={{ color: "var(--aur-ink-2)" }}>
          {people} pers. · {blocks.length} bloc{blocks.length > 1 ? "s" : ""}
        </b>
      </div>

      <button
        onClick={onFilter}
        data-role="report-groups-filter"
        aria-pressed={active}
        className="flex flex-col gap-2 text-left max-h-[196px] overflow-y-auto no-scrollbar"
      >
        {blocks.map((b) => {
          const leavingToday = !!today && b.departureDate === today;
          return (
            <span
              key={b.key}
              className="flex items-center gap-3 rounded-[14px] px-3 py-2"
              style={{
                background: active ? "var(--aur-gold-soft)" : "rgba(128,128,128,.08)",
                boxShadow: leavingToday ? "inset 0 0 0 1.5px var(--aur-warn)" : "inset 0 0 0 1px rgba(128,128,128,.12)",
              }}
            >
              <b className="text-[22px] font-black tabular-nums leading-none" style={{ color: "var(--brand-ink)" }}>
                {b.people}
              </b>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[12.5px] font-bold truncate">
                  {b.rateCode || "Groupe"} · {b.rooms} ch.
                </span>
                <span className="block text-[11px] tabular-nums" style={{ color: "var(--tab-idle)" }}>
                  {b.arrivalDate} → {b.departureDate}
                </span>
              </span>
              {leavingToday && (
                <span className="shrink-0 text-[9.5px] font-black uppercase tracking-[0.1em] px-2 py-1 rounded-full"
                  style={{ background: "var(--aur-warn-soft)", color: "var(--aur-warn-ink)" }}>
                  Départ
                </span>
              )}
            </span>
          );
        })}
      </button>
    </div>
  );
}
