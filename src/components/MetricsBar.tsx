"use client";
import { useRouter } from "next/navigation";
import { Client, CheckInRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount, getCompStats } from "@/lib/utils";
import { getChildrenCount, getGroupStats } from "@/lib/groups";
import { useApp } from "@/contexts/AppContext";
import AnimatedNumber from "@/components/AnimatedNumber";

export type MetricFilter = "total" | "entered" | "remaining" | "comp" | "vip" | "children" | "groups" | "expected" | null;

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
}

export default function MetricsBar({
  clients,
  checkIns,
  onHistoryToggle,
  activeFilter = null,
  onFilterChange,
  hideNav = false,
  expected,
}: MetricsBarProps) {
  const { t } = useApp();
  const router = useRouter();
  const total = getTotalGuests(clients);
  const entered = getCheckedInCount(checkIns);
  const comp = getCompStats(clients, checkIns);
  const vipCount = clients.filter((c) => c.isVip).length;
  const children = getChildrenCount(clients);
  // Groups get their own tile because forty people off one coach are not forty
  // individuals: they arrive together and they decide the peak.
  const groups = getGroupStats(clients);

  const handleFilter = (filter: MetricFilter) => {
    if (!onFilterChange) return;
    onFilterChange(activeFilter === filter ? null : filter);
  };

  const pillBase =
    "flex-1 text-center py-1.5 md:py-2 px-1 rounded-xl transition-all cursor-pointer active:scale-[0.96]";

  return (
    <div className="flex items-center gap-1 md:gap-1.5 p-2 surface-chrome rounded-[14px]" role="group" aria-label="Guest metrics">
      <button
        onClick={() => handleFilter("total")}
        className={`${pillBase} ${
          activeFilter === "total"
            ? "glass-liquid-active"
            : "hover:bg-white/30 dark:hover:bg-white/5"
        }`}
      >
        <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">{t("metrics.total")}</div>
        <AnimatedNumber value={total} className="text-xl md:text-2xl font-bold text-dark" />
      </button>
      <button
        onClick={() => handleFilter("entered")}
        className={`${pillBase} ${
          activeFilter === "entered"
            ? "glass-liquid-active"
            : "hover:bg-white/30 dark:hover:bg-white/5"
        }`}
      >
        <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">{t("metrics.entered")}</div>
        <AnimatedNumber value={entered} className="text-xl md:text-2xl font-bold text-dark" />
      </button>
      <button
        onClick={() => handleFilter("remaining")}
        className={`${pillBase} ${
          activeFilter === "remaining"
            ? "glass-liquid-active"
            : "hover:bg-white/30 dark:hover:bg-white/5"
        }`}
      >
        <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">{t("metrics.remaining")}</div>
        <AnimatedNumber value={total - entered} className="text-2xl md:text-[28px] font-black text-brand" />
      </button>
      {expected && expected.basedOn && (
        <button
          onClick={() => handleFilter("expected")}
          title={`D'après le service du ${expected.basedOn}`}
          className={`${pillBase} ${
            activeFilter === "expected"
              ? "glass-liquid-active"
              : "hover:bg-white/30 dark:hover:bg-white/5"
          }`}
        >
          <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">Attendus</div>
          <AnimatedNumber value={expected.people} className="text-xl md:text-2xl font-bold text-dark" />
        </button>
      )}
      {children > 0 && (
        <button
          onClick={() => handleFilter("children")}
          className={`${pillBase} ${
            activeFilter === "children"
              ? "glass-liquid-active"
              : "hover:bg-white/30 dark:hover:bg-white/5"
          }`}
        >
          <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">Enfants</div>
          <AnimatedNumber value={children} className="text-xl md:text-2xl font-bold text-dark" />
        </button>
      )}
      {groups.blocks > 0 && (
        <button
          onClick={() => handleFilter("groups")}
          className={`${pillBase} ${
            activeFilter === "groups"
              ? "glass-liquid-active"
              : "hover:bg-white/30 dark:hover:bg-white/5"
          }`}
        >
          <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">Groupes</div>
          {/* People over blocks: "62/3" is the number that matters and the
              number of coaches it arrives on, in one glance. */}
          <div className="text-xl md:text-2xl font-bold text-dark tabular-nums">
            {groups.people}<span className="text-muted text-sm font-semibold">/{groups.blocks}</span>
          </div>
        </button>
      )}
      <button
        onClick={() => handleFilter("comp")}
        className={`${pillBase} ${
          activeFilter === "comp"
            ? "glass-liquid-active"
            : "hover:bg-white/30 dark:hover:bg-white/5"
        }`}
      >
        <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">{t("metrics.comp")}</div>
        <div className="text-xl md:text-2xl font-bold text-dark">
          {comp.total > 0 ? <><AnimatedNumber value={comp.entered} />/<AnimatedNumber value={comp.total} /></> : <AnimatedNumber value={0} />}
        </div>
      </button>
      {vipCount > 0 && (
        <button
          onClick={() => handleFilter("vip")}
          className={`${pillBase} ${
            activeFilter === "vip"
              ? "bg-gradient-to-b from-brand/20 to-brand-light/10 ring-1 ring-brand/30"
              : "hover:bg-white/30 dark:hover:bg-white/5"
          }`}
        >
          <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide font-bold">VIP</div>
          <AnimatedNumber value={vipCount} className="text-xl md:text-2xl font-bold text-dark" />
        </button>
      )}
      {!hideNav && (
        <div className="flex flex-col gap-0.5">
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
