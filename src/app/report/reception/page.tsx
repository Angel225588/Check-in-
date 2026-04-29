"use client";
import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getTodayData,
  getSessionHistory,
  getDataForDate,
} from "@/lib/storage";
import {
  getReceptionWatchlist,
  countByStatus,
  ReceptionStatus,
  ReceptionWatchlistEntry,
} from "@/lib/reception-report";
import { formatTime } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import type { TranslationKey } from "@/lib/i18n";

type Filter = "all" | "not_yet" | "came";

function statusKey(s: ReceptionStatus): TranslationKey {
  switch (s) {
    case "not_yet":
      return "reception.statusNotYet";
    case "came_points":
      return "reception.statusPoints";
    case "came_paid_onsite":
      return "reception.statusPaid";
    case "came_room_charge":
      return "reception.statusRoom";
    case "came_pass":
      return "reception.statusPass";
    case "came_compliment":
      return "reception.statusCompliment";
    default:
      return "reception.statusCame";
  }
}

function statusStyles(s: ReceptionStatus): string {
  if (s === "not_yet") return "bg-error/10 text-error";
  if (s === "came_compliment")
    return "bg-green-500/15 text-green-700 dark:text-green-400";
  if (s === "came_points") return "bg-blue-500/12 text-blue-700 dark:text-blue-400";
  if (s === "came_paid_onsite")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  if (s === "came_room_charge")
    return "bg-purple-500/12 text-purple-700 dark:text-purple-400";
  if (s === "came_pass") return "glass-liquid text-muted";
  return "glass-brand text-brand";
}

export default function ReceptionReportWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
          <div className="text-muted">Loading…</div>
        </div>
      }
    >
      <ReceptionReportPage />
    </Suspense>
  );
}

function ReceptionReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useApp();
  const [entries, setEntries] = useState<ReceptionWatchlistEntry[]>([]);
  const [date, setDate] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const dateParam = searchParams.get("date");
    let data = null;
    if (dateParam) {
      const sessions = getSessionHistory();
      const session = sessions.find((s) => s.date === dateParam);
      const unclosed = getDataForDate(dateParam);
      if (session) {
        data = {
          date: session.date,
          clients: session.clients,
          checkIns: session.checkIns,
        };
      } else if (unclosed) {
        data = unclosed;
      }
    } else {
      data = getTodayData();
    }
    if (!data || data.clients.length === 0) {
      setEntries([]);
      setDate(dateParam || new Date().toISOString().split("T")[0]);
      setLoaded(true);
      return;
    }
    setEntries(getReceptionWatchlist(data.clients, data.checkIns));
    setDate(data.date);
    setLoaded(true);
  }, [searchParams]);

  const counts = useMemo(() => countByStatus(entries), [entries]);
  const cameTotal =
    entries.length - counts.not_yet;
  const isLegacy = entries.length > 0 && entries[0].isLegacyData;

  const filtered = useMemo(() => {
    let list = entries;
    if (filter === "not_yet") list = list.filter((e) => e.status === "not_yet");
    else if (filter === "came")
      list = list.filter((e) => e.status !== "not_yet");
    // sort: not_yet first, then by check-in time
    return [...list].sort((a, b) => {
      if (a.status === "not_yet" && b.status !== "not_yet") return -1;
      if (b.status === "not_yet" && a.status !== "not_yet") return 1;
      const ta = a.checkInTimestamp || "";
      const tb = b.checkInTimestamp || "";
      return ta.localeCompare(tb);
    });
  }, [entries, filter]);

  const formatDate = (d: string) => {
    try {
      const dt = new Date(d + "T12:00:00");
      return dt.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="min-h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        {/* HEADER */}
        <div className="sticky top-0 z-30 bg-[#FBF8F3]/90 dark:bg-[#0A0A0F]/90 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push("/report")}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
              >
                <svg
                  className="w-4 h-4 text-brand"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                <span className="text-sm font-medium text-brand">
                  {t("report.back")}
                </span>
              </button>
              <div className="flex flex-col items-end">
                <span
                  className="text-sm font-bold tracking-[0.08em] text-brand leading-tight"
                  style={{ fontFamily: "'Nunito', sans-serif" }}
                >
                  COURTYARD
                </span>
                <span className="text-[10px] text-muted leading-tight">
                  by{" "}
                  <span className="font-bold tracking-[0.05em] text-slate">
                    MARRIOTT
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-32 space-y-4 pt-2">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-lg font-black text-dark capitalize">
              {formatDate(date)}
            </h1>
            <p className="text-xs text-muted">{t("reception.title")}</p>
            <p className="text-[10px] text-muted/80 mt-0.5">
              {t("reception.subtitle")}
            </p>
          </div>

          {/* Legacy banner */}
          {isLegacy && (
            <div className="glass-liquid rounded-[14px] p-3 border border-amber-500/20 bg-amber-500/5">
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                {t("reception.legacyBanner")}
              </p>
            </div>
          )}

          {/* KPI strip */}
          {entries.length > 0 && (
            <div className="glass-liquid rounded-[14px] p-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-2xl font-black text-dark tabular-nums">
                    {entries.length}
                  </div>
                  <div className="text-[8px] text-muted uppercase tracking-wide">
                    Total
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-error tabular-nums">
                    {counts.not_yet}
                  </div>
                  <div className="text-[8px] text-muted uppercase tracking-wide">
                    {t("reception.statusNotYet")}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-green-600 dark:text-green-400 tabular-nums">
                    {cameTotal}
                  </div>
                  <div className="text-[8px] text-muted uppercase tracking-wide">
                    {t("reception.statusCame")}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-brand tabular-nums">
                    {counts.came_points + counts.came_paid_onsite + counts.came_room_charge}
                  </div>
                  <div className="text-[8px] text-muted uppercase tracking-wide">
                    Pts/Pay/Ch
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/8 grid grid-cols-3 gap-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted">{t("reception.statusPoints")}</span>
                  <span className="font-bold text-blue-700 dark:text-blue-400 tabular-nums">{counts.came_points}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">{t("reception.statusPaid")}</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">{counts.came_paid_onsite}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">{t("reception.statusCompliment")}</span>
                  <span className="font-bold text-green-700 dark:text-green-400 tabular-nums">{counts.came_compliment}</span>
                </div>
              </div>
            </div>
          )}

          {/* Filter pills */}
          {entries.length > 0 && (
            <div className="no-print flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { key: "all", label: t("reception.filterAll"), count: entries.length },
                  { key: "not_yet", label: t("reception.filterNotYet"), count: counts.not_yet },
                  { key: "came", label: t("reception.filterCame"), count: cameTotal },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-[0.96] ${
                    filter === tab.key
                      ? "bg-dark text-white dark:bg-white dark:text-black"
                      : "glass-liquid text-muted"
                  }`}
                >
                  {tab.label}{" "}
                  <span className="opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Table */}
          {entries.length === 0 ? (
            <div className="glass-liquid rounded-[14px] p-8 text-center">
              <p className="text-sm text-muted">{t("reception.empty")}</p>
            </div>
          ) : (
            <div className="glass-liquid rounded-[14px] overflow-hidden">
              <div className="grid grid-cols-[46px_1fr_60px_56px_84px] px-3 py-2 border-b border-black/5 dark:border-white/8">
                <span className="text-[7px] text-muted uppercase font-semibold">
                  {t("reception.colRoom")}
                </span>
                <span className="text-[7px] text-muted uppercase font-semibold">
                  {t("reception.colName")}
                </span>
                <span className="text-[7px] text-muted uppercase font-semibold text-center">
                  {t("reception.colLevel")}
                </span>
                <span className="text-[7px] text-muted uppercase font-semibold text-center">
                  {t("reception.colTime")}
                </span>
                <span className="text-[7px] text-muted uppercase font-semibold text-right">
                  {t("reception.colMode")}
                </span>
              </div>

              {filtered.map((e, i) => (
                <div
                  key={`${e.roomNumber}-${e.name}-${i}`}
                  className={`grid grid-cols-[46px_1fr_60px_56px_84px] px-3 py-2.5 items-center border-b border-black/3 dark:border-white/5 last:border-0 ${
                    e.status === "not_yet"
                      ? "bg-error/[0.04]"
                      : e.status === "came_compliment"
                      ? "bg-green-500/[0.05]"
                      : ""
                  }`}
                >
                  {/* Room */}
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs font-bold font-mono text-dark">
                      {e.roomNumber}
                    </span>
                  </div>

                  {/* Name + source tag */}
                  <div className="min-w-0 pr-1">
                    <span className="text-[11px] text-dark truncate block">
                      {e.name}
                    </span>
                    <span className="text-[8px] text-muted/80">
                      {e.vipSource === "walk_in"
                        ? t("reception.sourceWalkIn")
                        : t("reception.sourceListOnly")}
                    </span>
                  </div>

                  {/* VIP level */}
                  <div className="text-center">
                    <span className="text-[9px] bg-gradient-to-r from-brand to-brand-light text-white px-1.5 py-0.5 rounded-full font-black leading-none">
                      {e.vipLevel || "VIP"}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="text-center">
                    <span className="text-[9px] font-mono text-muted">
                      {e.checkInTimestamp ? formatTime(e.checkInTimestamp) : "—"}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div className="text-right">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusStyles(
                        e.status
                      )}`}
                    >
                      {t(statusKey(e.status))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FAB */}
        <div className="no-print fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#FBF8F3] dark:from-[#0A0A0F] via-[#FBF8F3] dark:via-[#0A0A0F] to-transparent pt-6">
          <div className="max-w-2xl mx-auto px-4 pb-4">
            <button
              onClick={() => window.print()}
              className="w-full glass-liquid py-3 rounded-[52px] text-base font-bold text-dark dark:border dark:border-white/20 active:scale-[0.97] transition-all"
            >
              {t("reception.print")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
