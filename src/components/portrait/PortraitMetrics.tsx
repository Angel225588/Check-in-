"use client";
import { List } from "@phosphor-icons/react/dist/ssr";
import { Client, CheckInRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount, getCompStats } from "@/lib/utils";
import { getChildrenCount, getGroupStats } from "@/lib/groups";
import { compactMetrics } from "@/lib/portrait";
import AnimatedNumber from "@/components/AnimatedNumber";
import type { MetricFilter } from "@/components/MetricsBar";

/**
 * The metrics bar, portrait width.
 *
 * Same numbers, same behaviour — read one and tap it to filter the list — but
 * four pills instead of eight, because eight across a phone is 45px each and
 * the labels get cut. Which four is not hard-coded: the outcome trio leads,
 * then the day decides (`compactMetrics`). A metric the day has none of never
 * takes a slot.
 *
 * The burger lives in this row rather than above it. A separate header line
 * costs 44px of the only screen where the pad, the field, the card and the
 * list all have to fit at once.
 */
export default function PortraitMetrics({
  clients,
  checkIns,
  activeFilter,
  onFilterChange,
  onMenu,
  expected,
}: {
  clients: Client[];
  checkIns: CheckInRecord[];
  activeFilter: MetricFilter;
  onFilterChange: (f: MetricFilter) => void;
  onMenu: () => void;
  expected?: { people: number; basedOn: string | null };
}) {
  const total = getTotalGuests(clients);
  const entered = getCheckedInCount(checkIns);
  const comp = getCompStats(clients, checkIns);
  const groups = getGroupStats(clients);

  const all: { key: MetricFilter & string; label: string; value: number; render?: React.ReactNode }[] = [
    { key: "total", label: "Total", value: total },
    { key: "entered", label: "Entrés", value: entered },
    { key: "remaining", label: "Restants", value: total - entered },
    // Attendus is a fact measured against a real previous service, so it is
    // absent rather than zero when there is no service to measure against.
    ...(expected?.basedOn ? [{ key: "expected" as const, label: "Attendus", value: expected.people }] : []),
    { key: "children" as const, label: "Enfants", value: getChildrenCount(clients) },
    { key: "groups" as const, label: "Groupes", value: groups.people },
    { key: "comp" as const, label: "Comp", value: comp.total },
    { key: "vip" as const, label: "VIP", value: clients.filter((c) => c.isVip).length },
  ];

  const chosen = compactMetrics(all.map((m) => ({ key: m.key, value: m.value })), clients.length);
  // A filter running from off-screen is how you end up staring at four rows
  // wondering why — the same rule the report's tile row follows.
  const keys = activeFilter && !chosen.includes(activeFilter)
    ? [...chosen.slice(0, chosen.length - 1), activeFilter]
    : chosen;
  const shown = keys.map((k) => all.find((m) => m.key === k)!).filter(Boolean);

  return (
    <div className="flex items-stretch gap-1.5 p-1.5 surface-chrome rounded-[14px]" data-role="portrait-metrics">
      <button
        onClick={onMenu}
        data-role="portrait-menu"
        aria-label="Ouvrir le menu du service"
        className="w-[52px] shrink-0 rounded-[12px] grid place-items-center active:scale-[0.94] transition-transform"
        style={{ background: "var(--aur-surface)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
      >
        <List size={21} weight="bold" style={{ color: "var(--brand-ink)" }} />
      </button>

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
    </div>
  );
}
