"use client";
import { useEffect, useMemo, useState } from "react";
import { FunnelSimple, Check, X } from "@phosphor-icons/react/dist/ssr";
import { Client, CheckInRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount, getCompStats } from "@/lib/utils";
import { getChildrenCount, getGroupStats } from "@/lib/groups";
import { compactMetrics } from "@/lib/portrait";
import AnimatedNumber from "@/components/AnimatedNumber";
import type { MetricFilter } from "@/components/MetricsBar";

/**
 * The metrics bar, portrait width.
 *
 * The burger used to live in this row. It is navigation, not a number, and
 * sitting inside the same tinted box it read as a fifth metric — so it is its
 * own control now, beside the bar rather than in it.
 *
 * Same numbers, same behaviour — read one and tap it to filter the list — but
 * four pills instead of eight, because eight across a phone is 45px each and
 * the labels get cut. Which four is not hard-coded: the outcome trio leads,
 * then the day decides (`compactMetrics`). A metric the day has none of never
 * takes a slot.
 */
export default function PortraitMetrics({
  clients,
  checkIns,
  activeFilter,
  onFilterChange,
  expected,
}: {
  clients: Client[];
  checkIns: CheckInRecord[];
  activeFilter: MetricFilter;
  onFilterChange: (f: MetricFilter) => void;
  expected?: { people: number; basedOn: string | null };
}) {
  /* Memoised because this bar re-renders on every keystroke, and getGroupStats
     rebuilds every tour block from scratch — a full pass over the house to
     redraw four numbers that did not change because someone typed a 2. */
  const { total, entered, comp, groups, children, vipCount } = useMemo(() => ({
    total: getTotalGuests(clients),
    entered: getCheckedInCount(checkIns),
    comp: getCompStats(clients, checkIns),
    groups: getGroupStats(clients),
    children: getChildrenCount(clients),
    vipCount: clients.filter((c) => c.isVip).length,
  }), [clients, checkIns]);

  const all: { key: MetricFilter & string; label: string; value: number; render?: React.ReactNode }[] = [
    { key: "total", label: "Total", value: total },
    { key: "entered", label: "Entrés", value: entered },
    /* Never negative. More people down than the sheet expected is an écart —
       a fact the report carries — not minus sixteen people still to come. */
    { key: "remaining", label: "Restants", value: Math.max(0, total - entered) },
    // Attendus is a fact measured against a real previous service, so it is
    // absent rather than zero when there is no service to measure against.
    ...(expected?.basedOn ? [{ key: "expected" as const, label: "Attendus", value: expected.people }] : []),
    { key: "children" as const, label: "Enfants", value: children },
    { key: "groups" as const, label: "Groupes", value: groups.people },
    { key: "comp" as const, label: "Comp", value: comp.total },
    { key: "vip" as const, label: "VIP", value: vipCount },
  ];

  const [sheet, setSheet] = useState(false);
  /* Four pills fit 390px; four pills AND the funnel do not, and the first
     casualty is the label — "RESTANTS" became "RESTA…", which is a number
     with no name on it. Three on a phone, four once there is room. */
  const [slots, setSlots] = useState(4);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 430px)");
    const apply = () => setSlots(mq.matches ? 4 : 3);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const chosen = compactMetrics(all.map((m) => ({ key: m.key, value: m.value })), clients.length, slots);
  // A filter running from off-screen is how you end up staring at four rows
  // wondering why — the same rule the report's tile row follows.
  const keys = activeFilter && !chosen.includes(activeFilter)
    ? [...chosen.slice(0, chosen.length - 1), activeFilter]
    : chosen;
  const shown = keys.map((k) => all.find((m) => m.key === k)!).filter(Boolean);
  // Everything the day has that did not fit. Zero-value metrics never enter the
  // funnel either: a filter that can only ever return nothing is not a filter.
  const hidden = all.filter((m) => !keys.includes(m.key) && m.value > 0);

  return (
    <div className="flex items-stretch gap-1.5 p-1.5 surface-chrome rounded-[14px]" data-role="portrait-metrics">
      {shown.map((m) => {
        const on = activeFilter === m.key;
        return (
          <button
            key={m.key}
            data-role="portrait-metric"
            data-metric={m.key}
            aria-pressed={on}
            onClick={() => onFilterChange(on ? null : m.key)}
            className={`flex-1 min-w-0 min-h-[52px] px-1 rounded-[12px] text-center transition-transform active:scale-[0.96] ${
              on ? "glass-liquid-active" : ""
            }`}
          >
            <div className="text-[9.5px] font-black uppercase tracking-[0.08em] truncate text-muted">{m.label}</div>
            <AnimatedNumber
              value={m.value}
              className={`text-[21px] font-black leading-[1.1] tabular-nums ${
                m.key === "remaining" ? "text-brand" : "text-dark"
              }`}
            />
          </button>
        );
      })}

      {hidden.length > 0 && (
        <button
          onClick={() => setSheet(true)}
          data-role="portrait-filter-more"
          aria-label={`Autres filtres (${hidden.length})`}
          className="relative shrink-0 w-[44px] min-h-[52px] rounded-[12px] grid place-items-center transition-transform active:scale-[0.94]"
          style={{ background: "var(--aur-surface)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
        >
          <FunnelSimple size={18} weight="bold" style={{ color: "var(--tab-idle)" }} />
          <span className="absolute bottom-1 text-[9px] font-black tabular-nums" style={{ color: "var(--tab-idle)" }}>
            +{hidden.length}
          </span>
        </button>
      )}

      {/* The whole list, not the leftovers: a sheet that shows a subset makes
          you remember which half you are looking at. Picking one promotes it
          into the visible row, so the list is never filtered by something you
          cannot see — the rule the report's tile row already follows. */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setSheet(false)}>
          <div className="absolute inset-0 bg-black/35 dark:bg-black/60" />
          <div
            onClick={(e) => e.stopPropagation()}
            data-role="portrait-filter-sheet"
            className="relative w-full max-w-[520px] max-h-[76dvh] overflow-y-auto rounded-t-[24px] p-4 pb-8 flex flex-col gap-2 animate-[sheetUp_.22s_cubic-bezier(.2,.9,.25,1)]"
            style={{ background: "var(--aur-bg-elev)", boxShadow: "0 -20px 60px -24px rgba(20,12,0,.55)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <b className="text-[15px] text-dark">Filtrer</b>
              <button onClick={() => setSheet(false)} aria-label="Fermer"
                className="w-11 h-11 rounded-full grid place-items-center">
                <X size={15} weight="bold" style={{ color: "var(--brand-ink)" }} />
              </button>
            </div>
            {all.filter((m) => m.value > 0).map((m) => {
              const on = activeFilter === m.key;
              return (
                <button
                  key={m.key}
                  data-role="portrait-filter-option"
                  data-metric={m.key}
                  onClick={() => { onFilterChange(on ? null : m.key); setSheet(false); }}
                  className="min-h-[56px] px-4 rounded-[14px] flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
                  style={{
                    background: on ? "var(--aur-gold-soft)" : "rgba(128,128,128,.08)",
                    boxShadow: on ? "inset 0 0 0 1.5px var(--aur-gold)" : "inset 0 0 0 1px rgba(128,128,128,.12)",
                  }}
                >
                  <span className="w-5 shrink-0">
                    {on && <Check size={16} weight="bold" style={{ color: "var(--brand-ink)" }} />}
                  </span>
                  <span className="flex-1 text-[15px] font-bold text-dark">{m.label}</span>
                  <b className="text-[18px] font-black tabular-nums"
                    style={{ color: on ? "var(--brand-ink)" : "var(--tab-idle)" }}>{m.value}</b>
                </button>
              );
            })}
          </div>
          <style jsx>{`
            @keyframes sheetUp { from { transform: translateY(100%) } to { transform: none } }
          `}</style>
        </div>
      )}
    </div>
  );
}
