"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FunnelSimple } from "@phosphor-icons/react/dist/ssr";
import { Client, CheckInRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount, needsPaymentChoice, isComp } from "@/lib/utils";
import { getChildrenCount, getGroupStats, groupBlocks } from "@/lib/groups";
import { chooseMetrics, toggleMetric } from "@/lib/metric-choice";
import { weakestMetric } from "@/lib/portrait";
import { subsetProgress } from "@/lib/metric-progress";
import MetricChecklistSheet from "@/components/MetricChecklistSheet";
import { useApp } from "@/contexts/AppContext";
import AnimatedNumber from "@/components/AnimatedNumber";

export type MetricFilter = "total" | "entered" | "remaining" | "comp" | "vip" | "children" | "groups" | "expected" | "notincluded" | null;

interface MetricsBarProps {
  clients: Client[];
  checkIns: CheckInRecord[];
  onHistoryToggle: () => void;
  activeFilter?: MetricFilter;
  onFilterChange?: (filter: MetricFilter) => void;
  /** Hide the history + dashboard nav buttons on the right. Use when reusing this component outside the main check-in screen. */
  hideNav?: boolean;
  /** People who came down yesterday and are still in the house. A fact, not a
   *  forecast — omitted entirely when there is no previous day to measure
   *  against, because a confident zero would be a lie. */
  expected?: { people: number; basedOn: string | null };
  /** Reception's own list, shared with portrait. null means "you decide". */
  chosen?: string[] | null;
  onChoose?: (next: string[]) => void;
}

/**
 * The metrics bar, landscape.
 *
 * It used to render every metric the day had — up to eight pills across the
 * top, each one narrower than the last, and the labels the first casualty.
 * Angel, holding the tablet: "too much options, too much metrics".
 *
 * It is the same bar as portrait now: six slots, ranked, with the funnel for
 * the rest. Not a copy of the logic — the same `metric-choice`, the same
 * checklist sheet, the same stored preference. Two bars that disagree about
 * which metrics exist would be two mental models for one number, and reception
 * turns the tablet round twenty times a morning.
 */
export default function MetricsBar({
  clients,
  checkIns,
  onHistoryToggle,
  activeFilter = null,
  onFilterChange,
  hideNav = false,
  expected,
  chosen,
  onChoose,
}: MetricsBarProps) {
  const { t } = useApp();
  const router = useRouter();

  const { total, entered, groups, groupRooms, children, vipCount, notIncluded } = useMemo(() => ({
    total: getTotalGuests(clients),
    entered: getCheckedInCount(checkIns),
    groups: getGroupStats(clients),
    groupRooms: new Set(groupBlocks(clients).flatMap((b) => b.roomNumbers)),
    children: getChildrenCount(clients),
    vipCount: clients.filter((c) => c.isVip).length,
    notIncluded: clients.filter((c) => needsPaymentChoice(c)).length,
  }), [clients, checkIns]);

  /* How many are due and how many came — the half a bare number drops. */
  const progress = useMemo(() => ({
    comp: subsetProgress(clients, checkIns, (c) => isComp(c)),
    vip: subsetProgress(clients, checkIns, (c) => !!c.isVip),
    groups: subsetProgress(clients, checkIns, (c) => groupRooms.has(c.roomNumber)),
    children: subsetProgress(clients, checkIns, (c) => (c.children || 0) > 0),
    notincluded: subsetProgress(clients, checkIns, (c) => needsPaymentChoice(c)),
  } as Record<string, ReturnType<typeof subsetProgress>>), [clients, checkIns, groupRooms]);

  const all: { key: MetricFilter & string; label: string; value: number }[] = [
    { key: "total", label: t("metrics.total"), value: total },
    { key: "entered", label: t("metrics.entered"), value: entered },
    /* Never negative: more people down than the sheet expected is an écart, a
       fact the report carries, not minus sixteen people still to come. */
    { key: "remaining", label: t("metrics.remaining"), value: Math.max(0, total - entered) },
    ...(expected?.basedOn ? [{ key: "expected" as const, label: "Attendus", value: expected.people }] : []),
    { key: "children" as const, label: "Enfants", value: children },
    { key: "groups" as const, label: "Groupes", value: groups.people },
    { key: "comp" as const, label: t("metrics.comp"), value: clients.filter((c) => isComp(c)).length },
    { key: "vip" as const, label: "VIP", value: vipCount },
    { key: "notincluded" as const, label: "Non inclus", value: notIncluded },
  ];

  const [sheet, setSheet] = useState(false);
  /* Six across a 1194px iPad is 170px a pill — room for the label and two
     numbers. Eight was 128px and the labels were being cut. Five below 900px,
     where the column shares the row with the nav tiles. */
  const [slots, setSlots] = useState(6);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const apply = () => setSlots(mq.matches ? 6 : 5);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const candidates = all.map((m) => ({ key: m.key, value: m.value }));
  const choice = chooseMetrics(candidates, chosen, clients.length, slots);
  /* A filter running from off-screen is how you end up staring at four rows
     wondering why. When it has to force its way on it displaces the weakest
     pill, so the bar keeps its own ranking. */
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

  const handleFilter = (filter: MetricFilter) => {
    if (!onFilterChange) return;
    onFilterChange(activeFilter === filter ? null : filter);
  };

  /* Cut into the bar, not painted on it — the same treatment portrait has had
     since it was built. Four numbers in a row need to read as four things, and
     light does that without putting a cage between them. Landscape had a hover
     tint and nothing else, so the shell reception actually works on was the
     flat one. `surface-inset` is a box-shadow: it paints, it does not
     composite, so this costs nothing on the iPad. */
  const pillBase =
    "flex-1 min-w-0 text-center py-1.5 md:py-2 px-1 rounded-[14px] transition-all cursor-pointer active:scale-[0.96]";

  return (
    <div className="flex items-center gap-1 md:gap-1.5 p-2 surface-chrome rounded-[14px]" role="group" aria-label="Guest metrics" data-role="metrics-bar">
      {shown.map((m) => {
        const on = activeFilter === m.key;
        const p = progress[m.key];
        return (
          <button
            key={m.key}
            data-role="metric"
            data-metric={m.key}
            aria-pressed={on}
            onClick={() => handleFilter(m.key)}
            className={`${pillBase} ${on ? "glass-liquid-active" : "surface-inset"}`}
          >
            <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide truncate">{m.label}</div>
            {p ? (
              <div className="text-xl md:text-2xl font-bold text-dark tabular-nums">
                <AnimatedNumber value={p.done} />
                <span className="text-muted text-sm font-semibold">/{p.of}</span>
              </div>
            ) : (
              <AnimatedNumber
                value={m.value}
                className={`font-bold tabular-nums ${m.key === "remaining" ? "text-2xl md:text-[28px] font-black text-brand" : "text-xl md:text-2xl text-dark"}`}
              />
            )}
          </button>
        );
      })}

      {hidden.length > 0 && (
        <button
          onClick={() => setSheet(true)}
          data-role="metric-more"
          aria-label={`Choisir les métriques (${hidden.length} de côté)`}
          className="surface-inset relative shrink-0 w-[46px] self-stretch min-h-[52px] rounded-[14px] grid place-items-center transition-transform active:scale-[0.94]"
        >
          <FunnelSimple size={18} weight="bold" style={{ color: "var(--tab-idle)" }} />
          <span className="absolute bottom-1 text-[9px] font-black tabular-nums" style={{ color: "var(--tab-idle)" }}>
            +{hidden.length}
          </span>
        </button>
      )}

      {sheet && onChoose && (
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

      {!hideNav && (
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={onHistoryToggle}
            className="p-1.5 md:p-2 rounded-xl hover:bg-white/30 dark:hover:bg-white/5 active:bg-white/50 transition-colors"
            aria-label="History"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 md:p-2 rounded-xl hover:bg-white/30 dark:hover:bg-white/5 active:bg-white/50 transition-colors"
            aria-label="Dashboard"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h4v8H3V13zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
