"use client";
import { useEffect, useMemo, useState } from "react";
import { FunnelSimple } from "@phosphor-icons/react/dist/ssr";
import { Client, CheckInRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount, getCompStats, needsPaymentChoice, isComp } from "@/lib/utils";
import { subsetProgress } from "@/lib/metric-progress";
import { getChildrenCount, getGroupStats, groupBlocks } from "@/lib/groups";
import { chooseMetrics } from "@/lib/metric-choice";
import { weakestMetric } from "@/lib/portrait";
import AnimatedNumber from "@/components/AnimatedNumber";
import MetricChecklistSheet from "@/components/MetricChecklistSheet";
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
  chosen,
  onChoose,
}: {
  clients: Client[];
  checkIns: CheckInRecord[];
  activeFilter: MetricFilter;
  onFilterChange: (f: MetricFilter) => void;
  expected?: { people: number; basedOn: string | null };
  /** Reception's own list, or null for "you decide". */
  chosen?: string[] | null;
  onChoose: (next: string[]) => void;
}) {
  /* Memoised because this bar re-renders on every keystroke, and getGroupStats
     rebuilds every tour block from scratch — a full pass over the house to
     redraw four numbers that did not change because someone typed a 2. */
  const { total, entered, comp, groups, groupRooms, children, vipCount, notIncluded } = useMemo(() => ({
    total: getTotalGuests(clients),
    entered: getCheckedInCount(checkIns),
    comp: getCompStats(clients, checkIns),
    groups: getGroupStats(clients),
    groupRooms: new Set(groupBlocks(clients).flatMap((b) => b.roomNumbers)),
    children: getChildrenCount(clients),
    vipCount: clients.filter((c) => c.isVip).length,
    notIncluded: clients.filter((c) => needsPaymentChoice(c)).length,
  }), [clients, checkIns]);

  /* "How many are coming and how many came." A bare 15 under COMP answers half
     of what is being asked, and drops the half that changes what reception does
     next. Landscape has said 2/15 since the beginning; the port lost it. */
  const progress = useMemo(() => ({
    comp: subsetProgress(clients, checkIns, (c) => isComp(c)),
    vip: subsetProgress(clients, checkIns, (c) => !!c.isVip),
    groups: subsetProgress(clients, checkIns, (c) => groupRooms.has(c.roomNumber)),
    children: subsetProgress(clients, checkIns, (c) => (c.children || 0) > 0),
    notincluded: subsetProgress(clients, checkIns, (c) => needsPaymentChoice(c)),
  } as Record<string, ReturnType<typeof subsetProgress>>), [clients, checkIns, groupRooms]);

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
    { key: "notincluded" as const, label: "Non inclus", value: notIncluded },
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
  const candidates = all.map((m) => ({ key: m.key, value: m.value }));
  const choice = chooseMetrics(candidates, chosen, clients.length, slots);
  /* A filter running from off-screen is how you end up staring at four rows
     wondering why — the same rule the report's tile row follows. When it has to
     force its way on, it displaces the weakest pill rather than whatever
     happens to be last, so the bar keeps its own ranking. */
  const keys = activeFilter && !choice.shown.includes(activeFilter)
    ? [
        ...choice.shown.filter(
          (k) => k !== (weakestMetric(choice.shown, candidates, clients.length, [activeFilter]) ?? choice.shown[choice.shown.length - 1])
        ),
        activeFilter,
      ]
    : choice.shown;
  const shown = keys.map((k) => all.find((m) => m.key === k)!).filter(Boolean);
  const hidden = choice.hidden;

  return (
    <div className="flex items-stretch gap-2 p-2 surface-chrome rounded-lg" data-role="portrait-metrics">
      {shown.map((m) => {
        const on = activeFilter === m.key;
        return (
          <button
            key={m.key}
            data-role="portrait-metric"
            data-metric={m.key}
            aria-pressed={on}
            onClick={() => onFilterChange(on ? null : m.key)}
            /* Cut into the bar rather than outlined on it: four numbers in a
               row need to read as four things, and a border between each is a
               cage. Depth does it with light instead. */
            className={`flex-1 min-w-0 min-h-[56px] px-1.5 rounded-card text-center transition-transform active:scale-[0.96] ${
              on ? "glass-liquid-active" : "surface-inset"
            }`}
          >
            <div className="text-micro font-black uppercase tracking-[0.08em] truncate text-muted">{m.label}</div>
            {progress[m.key] ? (
              <div className={`text-xl font-black leading-[1.1] tabular-nums ${on ? "text-dark" : "text-dark"}`}>
                <AnimatedNumber value={progress[m.key]!.done} />
                <span style={{ color: "var(--tab-idle)" }}>/{progress[m.key]!.of}</span>
              </div>
            ) : (
              <AnimatedNumber
                value={m.value}
                className={`text-xl font-black leading-[1.1] tabular-nums ${
                  m.key === "remaining" ? "text-brand" : "text-dark"
                }`}
              />
            )}
          </button>
        );
      })}

      {hidden.length > 0 && (
        <button
          onClick={() => setSheet(true)}
          data-role="portrait-filter-more"
          aria-label={`Choisir les métriques (${hidden.length} de côté)`}
          className="surface-inset relative shrink-0 w-[46px] min-h-[56px] rounded-card grid place-items-center transition-transform active:scale-[0.94]"
        >
          <FunnelSimple size={18} weight="bold" style={{ color: "var(--tab-idle)" }} />
          <span className="absolute bottom-1 text-micro font-black tabular-nums" style={{ color: "var(--tab-idle)" }}>
            +{hidden.length}
          </span>
        </button>
      )}

      {/* The whole list, not the leftovers: a sheet that shows a subset makes
          you remember which half you are looking at. Shared with landscape —
          two bars that disagree about which metrics exist would be two mental
          models for one number. */}
      {sheet && (
        <MetricChecklistSheet
          all={all}
          candidates={candidates}
          shown={keys}
          chosen={chosen}
          progress={progress}
          slots={slots}
          rooms={clients.length}
          activeFilter={activeFilter}
          onChoose={onChoose}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}
