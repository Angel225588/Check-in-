"use client";
import { Client, CheckInRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount, getCompStats } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";

export type MetricFilter = "total" | "entered" | "remaining" | "comp" | null;

interface MetricsBarProps {
  clients: Client[];
  checkIns: CheckInRecord[];
  onHistoryToggle: () => void;
  activeFilter?: MetricFilter;
  onFilterChange?: (filter: MetricFilter) => void;
}

export default function MetricsBar({
  clients,
  checkIns,
  onHistoryToggle,
  activeFilter = null,
  onFilterChange,
}: MetricsBarProps) {
  const { t } = useApp();
  const total = getTotalGuests(clients);
  const entered = getCheckedInCount(checkIns);
  const comp = getCompStats(clients, checkIns);

  const handleFilter = (filter: MetricFilter) => {
    if (!onFilterChange) return;
    onFilterChange(activeFilter === filter ? null : filter);
  };

  const pillBase =
    "flex-1 text-center py-1.5 md:py-2.5 px-1 rounded-xl transition-all cursor-pointer active:scale-[0.96]";

  return (
    <div className="flex items-center gap-1 md:gap-1.5 p-1.5 md:p-2 glass-liquid rounded-[14px]">
      <button
        onClick={() => handleFilter("total")}
        className={`${pillBase} ${
          activeFilter === "total"
            ? "glass-liquid-active"
            : "hover:bg-white/30 dark:hover:bg-white/5"
        }`}
      >
        <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">{t("metrics.total")}</div>
        <div className="text-xl md:text-2xl font-bold text-dark">{total}</div>
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
        <div className="text-xl md:text-2xl font-bold text-green-600 dark:text-green-400">{entered}</div>
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
        <div className="text-xl md:text-2xl font-bold text-brand">{total - entered}</div>
      </button>
      <button
        onClick={() => handleFilter("comp")}
        className={`${pillBase} ${
          activeFilter === "comp"
            ? "glass-liquid-active"
            : "hover:bg-white/30 dark:hover:bg-white/5"
        }`}
      >
        <div className="text-[10px] md:text-xs text-muted uppercase tracking-wide">{t("metrics.comp")}</div>
        <div className="text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400">
          {comp.entered}/{comp.total}
        </div>
      </button>
      <button
        onClick={onHistoryToggle}
        className="p-1.5 md:p-2.5 rounded-xl hover:bg-white/30 dark:hover:bg-white/5 active:bg-white/50 transition-colors"
        aria-label="History"
      >
        <svg className="w-6 h-6 md:w-7 md:h-7 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
  );
}
