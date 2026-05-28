"use client";
import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Door, User, TrendUp, TrendDown, Minus } from "@phosphor-icons/react/dist/ssr";
import { getTodayData, closeDay, getSessionHistory, getDataForDate } from "@/lib/storage";
import { generateDayReport, exportReportCSV, DayReport, RoomReport } from "@/lib/report";
import { formatTime } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import type { TranslationKey } from "@/lib/i18n";
import type { DailyData } from "@/lib/types";
import RushHourChart from "@/components/RushHourChart";
import RoomEventBadges from "@/components/RoomEventBadges";
import MetricsBar, { MetricFilter } from "@/components/MetricsBar";
import { getRoomEvents } from "@/lib/room-events";
import { getMorningBrief } from "@/lib/morning-brief";

type StatusFilter =
  | "all"
  | "allIn"
  | "partial"
  | "noshow"
  | "comp"
  | "extras"
  | "offlist"
  | "entered"
  | "remaining"
  | "vip";

// Map the MetricsBar's MetricFilter to our local StatusFilter.
// MetricsBar emits "total" | "entered" | "remaining" | "comp" | "vip" | null.
function metricToStatusFilter(metric: MetricFilter): StatusFilter {
  if (metric === null) return "all";
  if (metric === "total") return "all";
  // "entered" | "remaining" | "comp" | "vip" map 1-to-1
  return metric;
}

function statusToMetricFilter(status: StatusFilter): MetricFilter {
  if (status === "all") return "total";
  if (status === "entered" || status === "remaining" || status === "comp" || status === "vip") {
    return status;
  }
  // status-only filters (allIn / partial / noshow / extras / offlist) don't map back —
  // the MetricsBar pill will appear inactive, but the status filter chips above stay active.
  return null;
}

function StatusBadge({ status, t }: { status: RoomReport["status"]; t: (key: TranslationKey) => string }) {
  const styles = {
    "all-in": "bg-green-500/10 text-green-700 dark:text-green-400",
    partial: "glass-brand text-brand",
    "no-show": "bg-error/10 text-error",
  };
  const labels = {
    "all-in": t("report.allIn"),
    partial: t("report.partial"),
    "no-show": t("report.noShow"),
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/* ── Donut Ring ── */
function DonutRing({ percent, size = 120, stroke = 10 }: { percent: number; size?: number; stroke?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = mounted ? circ - (Math.min(percent, 100) / 100) * circ : circ;
  const color = percent >= 70 ? "stroke-green-500 dark:stroke-green-400" : percent >= 40 ? "stroke-brand" : "stroke-red-500 dark:stroke-red-400";
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-black/[0.04] dark:stroke-white/[0.06]" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className={color} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.25,.46,.45,.94)" }} />
    </svg>
  );
}

export default function ReportPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto bg-[#FBF8F3] dark:bg-[#0A0A0F] p-4">
        <div className="skeleton h-8 w-40 mb-4" />
        <div className="skeleton h-32 w-32 rounded-full mx-auto mb-4" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}
        </div>
        <div className="skeleton h-64 w-full" />
      </div>
    }>
      <ReportPage />
    </Suspense>
  );
}

function ReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useApp();
  const [report, setReport] = useState<DayReport | null>(null);
  const [dailyData, setDailyData] = useState<DailyData | null>(null);
  const [rawUploadText, setRawUploadText] = useState<string>("");
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isHistorical, setIsHistorical] = useState(false);

  useEffect(() => {
    const dateParam = searchParams.get("date");

    if (dateParam) {
      // Try session history first, then fall back to unclosed dailyData
      const sessions = getSessionHistory();
      const session = sessions.find((s) => s.date === dateParam);
      const unclosedData = getDataForDate(dateParam);

      if (session) {
        const data: DailyData = { date: session.date, clients: session.clients, checkIns: session.checkIns, rawUploadText: session.rawUploadText };
        setDailyData(data);
        setReport(generateDayReport(session.clients, session.checkIns));
        setRawUploadText(session.rawUploadText || "");
      } else if (unclosedData && unclosedData.clients.length > 0) {
        setDailyData(unclosedData);
        setReport(generateDayReport(unclosedData.clients, unclosedData.checkIns));
        setRawUploadText(unclosedData.rawUploadText || "");
      } else {
        router.push("/reports"); return;
      }
      setIsHistorical(true);
    } else {
      const data = getTodayData();
      if (!data || data.clients.length === 0) { router.push("/reports"); return; }
      setDailyData(data);
      setReport(generateDayReport(data.clients, data.checkIns));
      setRawUploadText(data.rawUploadText || "");
      setIsHistorical(false);
    }
  }, [router, searchParams]);

  const handleExportCSV = () => {
    if (!report) return;
    const csv = exportReportCSV(report);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkin-report-${report.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCloseDay = () => {
    closeDay();
    router.push("/upload");
  };

  // Compute check-in time per room for the table
  const checkInTimeMap = useMemo(() => {
    if (!report) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const ci of report.checkIns) {
      const key = `${ci.roomNumber}::${ci.clientName.trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, formatTime(ci.timestamp));
    }
    return map;
  }, [report]);

  // Average check-in time removed — peak is shown in the rush chart instead.

  // Yesterday's presence — for the ±% delta indicator on the donut.
  const yesterdayPercent = useMemo(() => {
    if (!report) return null;
    const today = new Date(report.date + "T00:00:00");
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const yestDate = yest.toISOString().split("T")[0];

    // Look in session history first, then unclosed daily data
    const sessions = getSessionHistory();
    const session = sessions.find((s) => s.date === yestDate);
    let clients = session?.clients;
    let checkIns = session?.checkIns;
    if (!session) {
      const u = getDataForDate(yestDate);
      if (u) {
        clients = u.clients;
        checkIns = u.checkIns;
      }
    }
    if (!clients || !checkIns) return null;
    const expected = clients.reduce((s, c) => s + c.adults + c.children, 0);
    if (expected === 0) return null;
    const entered = checkIns.reduce((s, c) => s + c.peopleEntered, 0);
    return Math.min(100, Math.round((entered / expected) * 100));
  }, [report]);

  // Filtered + searched rooms
  const filteredRooms = useMemo(() => {
    if (!report) return [];
    let rooms = report.rooms;

    // Status filter
    if (statusFilter === "allIn") rooms = rooms.filter((r) => r.status === "all-in");
    else if (statusFilter === "partial") rooms = rooms.filter((r) => r.status === "partial");
    else if (statusFilter === "noshow") rooms = rooms.filter((r) => r.status === "no-show");
    else if (statusFilter === "comp") rooms = rooms.filter((r) => r.isComp);
    else if (statusFilter === "extras") rooms = rooms.filter((r) => r.extras > 0);
    else if (statusFilter === "entered") rooms = rooms.filter((r) => r.entered > 0);
    else if (statusFilter === "remaining") rooms = rooms.filter((r) => r.remaining > 0);
    else if (statusFilter === "vip") rooms = rooms.filter((r) => r.isVip);
    else if (statusFilter === "offlist") {
      // VIPs hors liste PDJ (vipSource = list_only ou walk_in)
      rooms = rooms.filter(
        (r) => r.isVip && (r.vipSource === "list_only" || r.vipSource === "walk_in")
      );
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rooms = rooms.filter(
        (r) => r.roomNumber.includes(q) || r.name.toLowerCase().includes(q)
      );
    }

    return rooms;
  }, [report, statusFilter, searchQuery]);

  if (!report) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const allIn = report.rooms.filter((r) => r.status === "all-in");
  const partial = report.rooms.filter((r) => r.status === "partial");
  const noShow = report.rooms.filter((r) => r.status === "no-show");
  const extrasRooms = report.rooms.filter((r) => r.extras > 0);
  const presencePercent = report.totalGuests > 0 ? Math.round((report.totalEntered / report.totalGuests) * 100) : 0;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    } catch { return dateStr; }
  };

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
        {/* ═══ HEADER ═══ */}
        <div className="sticky top-0 z-30 bg-[#FBF8F3]/90 dark:bg-[#0A0A0F]/90 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push(isHistorical ? "/reports" : "/search")}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
              >
                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium text-brand">{isHistorical ? t("reports.title") : t("report.back")}</span>
              </button>
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold tracking-[0.08em] text-brand leading-tight" style={{ fontFamily: "'Nunito', sans-serif" }}>
                  COURTYARD
                </span>
                <span className="text-[10px] text-muted leading-tight">
                  by <span className="font-bold tracking-[0.05em] text-slate">MARRIOTT</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SCROLLABLE CONTENT ═══ */}
        <div className="max-w-2xl mx-auto px-4 pb-52 space-y-4 pt-2">

          {/* Date title */}
          <div className="text-center">
            <h1 className="text-lg font-black text-dark capitalize">{formatDate(report.date)}</h1>
            <p className="text-xs text-muted">{t("report.title")}</p>
          </div>

          {/* ═══ DONUT + PRESENCE (with ±% vs hier) — compact ═══ */}
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center justify-center gap-5">
              {/* Donut — compact 90px */}
              <div className="relative">
                <DonutRing percent={presencePercent} size={90} stroke={8} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-black tabular-nums leading-none ${presencePercent >= 70 ? "text-green-600 dark:text-green-400" : presencePercent >= 40 ? "text-brand" : "text-error"}`}>
                    {presencePercent}%
                  </span>
                  <span className="text-[7px] text-muted uppercase tracking-wide mt-0.5">{t("report.presence")}</span>
                </div>
              </div>

              {/* Delta vs hier — chip outside the donut */}
              {yesterdayPercent !== null && (() => {
                const delta = presencePercent - yesterdayPercent;
                if (delta === 0) {
                  return (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted bg-black/[0.04] dark:bg-white/[0.06] px-2 py-1 rounded-full self-start">
                      <Minus weight="bold" className="size-3" />
                      {t("report.vsYesterday")}
                    </span>
                  );
                }
                const positive = delta > 0;
                return (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full self-start ${
                      positive
                        ? "text-green-700 dark:text-green-400 bg-green-500/15"
                        : "text-error bg-error/15"
                    }`}
                  >
                    {positive ? (
                      <TrendUp weight="duotone" className="size-3" />
                    ) : (
                      <TrendDown weight="duotone" className="size-3" />
                    )}
                    {positive ? "+" : ""}
                    {delta}% {t("report.vsYesterday")}
                  </span>
                );
              })()}

              {/* Key metrics beside donut — compact, lecture < 3 sec */}
              <div className="flex items-center gap-5">
                <div>
                  <div className="text-xl font-black text-dark tabular-nums leading-none">
                    {report.totalEntered}
                    <span className="text-xs font-medium text-muted">/{report.totalGuests}</span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-[9px] text-muted uppercase tracking-wide mt-1">
                    <User weight="duotone" className="size-3 text-brand" />
                    {t("report.persons")}
                  </div>
                </div>
                <div>
                  <div className="text-xl font-black text-dark tabular-nums leading-none">
                    {allIn.length + partial.length}
                    <span className="text-xs font-medium text-muted">/{report.totalRooms}</span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-[9px] text-muted uppercase tracking-wide mt-1">
                    <Door weight="duotone" className="size-3 text-brand" />
                    {t("report.rooms")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ STATUS BAR (green/brown/red) — chambres + pax séparés ═══ */}
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-dark font-bold">{t("report.allIn")}</span>
                </div>
                <div className="text-muted/90 tabular-nums pl-4">
                  <Door weight="duotone" className="inline size-2.5 mr-0.5" />
                  {allIn.length} ch
                  <span className="mx-1 text-muted/50">·</span>
                  <User weight="duotone" className="inline size-2.5 mr-0.5" />
                  {allIn.reduce((s, r) => s + r.entered, 0)} pers
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />
                  <span className="text-dark font-bold">{t("report.partial")}</span>
                </div>
                <div className="text-muted/90 tabular-nums pl-4">
                  <Door weight="duotone" className="inline size-2.5 mr-0.5" />
                  {partial.length} ch
                  <span className="mx-1 text-muted/50">·</span>
                  <User weight="duotone" className="inline size-2.5 mr-0.5" />
                  {partial.reduce((s, r) => s + r.entered, 0)} pers
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-error shrink-0" />
                  <span className="text-dark font-bold">{t("report.noShow")}</span>
                </div>
                <div className="text-muted/90 tabular-nums pl-4">
                  <Door weight="duotone" className="inline size-2.5 mr-0.5" />
                  {noShow.length} ch
                  <span className="mx-1 text-muted/50">·</span>
                  <User weight="duotone" className="inline size-2.5 mr-0.5" />
                  {noShow.reduce((s, r) => s + r.totalGuests - r.entered, 0)} pers
                </div>
              </div>
            </div>
            {report.totalRooms > 0 && (
              <div className="flex h-3 rounded-full overflow-hidden">
                {allIn.length > 0 && <div className="bg-green-500 transition-all duration-200" style={{ width: `${(allIn.length / report.totalRooms) * 100}%` }} />}
                {partial.length > 0 && <div className="bg-brand transition-all duration-200" style={{ width: `${(partial.length / report.totalRooms) * 100}%` }} />}
                {noShow.length > 0 && <div className="bg-error transition-all duration-200" style={{ width: `${(noShow.length / report.totalRooms) * 100}%` }} />}
              </div>
            )}

            {/* Compliment + Extras + VIP — petite ligne discrète sous la barre */}
            {(report.totalCompPersons > 0 || report.totalExtras > 0 || report.totalVip > 0) && (
              <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/8 flex items-center justify-center gap-4 text-[10px]">
                {report.totalCompPersons > 0 && (
                  <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                    <span className="font-black tabular-nums">{report.totalCompPersonsEntered}/{report.totalCompPersons}</span>
                    <span className="uppercase opacity-70">{t("metrics.comp")}</span>
                  </span>
                )}
                {report.totalExtras > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <span className="font-black tabular-nums">+{report.totalExtras}</span>
                    <span className="uppercase opacity-70">Extras</span>
                  </span>
                )}
                {report.totalVip > 0 && (
                  <span className="inline-flex items-center gap-1 text-brand">
                    <span className="font-black tabular-nums">{report.totalVip}</span>
                    <span className="uppercase opacity-70">VIP</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ═══ RUSH HOUR CHART (zoomable 5/10/30/60 min) ═══ */}
          {dailyData && <RushHourChart data={dailyData} />}

          {/* ═══ SOURCE BREAKDOWN — Liste vs VIP-only vs Walk-in ═══ */}
          <div className="glass-liquid rounded-[14px] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] text-muted uppercase tracking-wider font-semibold">
                  {t("report.sourceBreakdownTitle")}
                </span>
                <span className="text-[8px] text-muted/80">
                  {t("report.sourceBreakdownDesc")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-[10px] bg-black/[0.03] dark:bg-white/[0.04] p-2.5">
                  <div className="text-[8px] text-muted uppercase font-semibold">
                    {t("report.sourceList")}
                  </div>
                  <div className="text-lg font-black text-dark tabular-nums">
                    {report.sourceBreakdown.listEntered}
                  </div>
                  <div className="text-[8px] text-muted">
                    {report.sourceBreakdown.listRooms} {t("upload.rooms")}
                  </div>
                </div>
                <div className="rounded-[10px] bg-brand/[0.06] p-2.5">
                  <div className="text-[8px] text-brand uppercase font-semibold">
                    {t("report.sourceVipOnly")}
                  </div>
                  <div className="text-lg font-black text-brand tabular-nums">
                    {report.sourceBreakdown.vipListOnlyEntered}
                  </div>
                  <div className="text-[8px] text-brand/70">
                    {report.sourceBreakdown.vipListOnlyRooms} {t("upload.rooms")}
                  </div>
                </div>
                <div className="rounded-[10px] bg-amber-500/[0.08] p-2.5">
                  <div className="text-[8px] text-amber-700 dark:text-amber-400 uppercase font-semibold">
                    {t("report.sourceWalkIn")}
                  </div>
                  <div className="text-lg font-black text-amber-700 dark:text-amber-400 tabular-nums">
                    {report.sourceBreakdown.walkInEntered}
                  </div>
                  <div className="text-[8px] text-amber-700/70 dark:text-amber-400/70">
                    {report.sourceBreakdown.walkInRooms} {t("upload.rooms")}
                  </div>
                </div>
              </div>

              {/* Payment breakdown for off-list guests */}
              {(report.sourceBreakdown.byPayment.points +
                report.sourceBreakdown.byPayment.cash +
                report.sourceBreakdown.byPayment.room +
                report.sourceBreakdown.byPayment.compliment +
                report.sourceBreakdown.byPayment.supervisor) > 0 && (
                <div className="pt-2 border-t border-black/5 dark:border-white/8">
                  <div className="text-[8px] text-muted uppercase font-semibold mb-1.5">
                    {t("report.paymentMixOffList")}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    <div>
                      <div className="text-sm font-black text-blue-600 dark:text-blue-400 tabular-nums">
                        {report.sourceBreakdown.byPayment.points}
                      </div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusPoints")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums">
                        {report.sourceBreakdown.byPayment.cash}
                      </div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusPaid")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-purple-600 dark:text-purple-400 tabular-nums">
                        {report.sourceBreakdown.byPayment.room}
                      </div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusRoom")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-green-600 dark:text-green-400 tabular-nums">
                        {report.sourceBreakdown.byPayment.compliment}
                      </div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusCompliment")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-muted tabular-nums">
                        {report.sourceBreakdown.byPayment.supervisor}
                      </div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusPass")}</div>
                    </div>
                  </div>
                </div>
              )}
          </div>

          {/* ═══ VIPs HORS LISTE — VIPs sans PDJ inclus qui sont venus ═══ */}
          {(() => {
            const offlistVips = report.rooms.filter(
              (r) =>
                r.isVip &&
                (r.vipSource === "list_only" || r.vipSource === "walk_in") &&
                r.entered > 0
            );
            const labelFor = (action?: string, isComp?: boolean) => {
              if (isComp) return "Compliment";
              switch (action) {
                case "points": return "Points";
                case "cash":
                case "pay_onsite": return "Cash";
                case "room":
                case "room_charge": return "Chambre";
                case "card": return "Carte B";
                case "supervisor": return "Supervisor";
                case "pass": return "Pass";
                default: return "(à confirmer)";
              }
            };
            return (
              <div className="glass-liquid rounded-[14px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[9px] text-brand uppercase tracking-wider font-semibold">
                      {t("report.offListVipsTitle")}
                    </span>
                    <p className="text-[8px] text-muted mt-0.5">
                      {t("report.offListVipsDesc")}
                    </p>
                  </div>
                  <span className="text-lg font-black text-brand tabular-nums">
                    {offlistVips.length}
                  </span>
                </div>
                {offlistVips.length === 0 ? (
                  <p className="text-[11px] text-muted text-center py-2">
                    Aucun VIP hors-liste enregistré aujourd&apos;hui.
                  </p>
                ) : (
                <div className="space-y-1.5">
                  {offlistVips.map((room, i) => {
                    const chosen = labelFor(room.paymentAction, room.isComp);
                    return (
                      <div
                        key={`offlist-${room.roomNumber}-${i}`}
                        className="flex items-center justify-between bg-brand/[0.06] dark:bg-brand/[0.10] rounded-[10px] px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-bold font-mono text-dark shrink-0">
                            {room.roomNumber}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-gradient-to-r from-brand to-brand-light text-white px-2 py-0.5 rounded-full shrink-0">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 6l5.5 5L12 4l3.5 7L21 6l-2 10H5zm14 3H5v-2h14v2z"/></svg>
                            {room.vipLevel || "VIP"}
                          </span>
                          <span className="text-xs text-dark truncate">{room.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted">(Points)</span>
                          <span className="text-[10px] text-brand">→</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            chosen === "Compliment" ? "bg-green-500/15 text-green-700 dark:text-green-400" :
                            chosen === "Points" ? "bg-purple-500/15 text-purple-700 dark:text-purple-400" :
                            chosen === "Cash" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" :
                            chosen === "Chambre" ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" :
                            chosen === "Carte B" ? "bg-orange-500/15 text-orange-700 dark:text-orange-400" :
                            chosen === "Supervisor" ? "bg-slate-500/15 text-slate-700 dark:text-slate-400" :
                            "bg-muted/15 text-muted"
                          }`}>
                            ({chosen})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })()}

          {/* ═══ EXTRAS — RECEPTION DISCREPANCIES ═══ */}
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[9px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-semibold">{t("report.extras")}</span>
                <p className="text-[8px] text-muted mt-0.5">{t("report.extrasDesc")}</p>
              </div>
              <span className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums">+{report.totalExtras}</span>
            </div>
            {extrasRooms.length === 0 ? (
              <p className="text-[11px] text-muted text-center py-2">Aucun écart pour le moment.</p>
            ) : (
              <div className="space-y-1.5">
                {extrasRooms.map((room) => (
                  <div key={`extra-${room.roomNumber}-${room.name}`} className="flex items-center justify-between bg-amber-500/8 dark:bg-amber-500/10 rounded-[10px] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-dark">{room.roomNumber}</span>
                      <span className="text-xs text-dark truncate max-w-[160px]">{room.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted tabular-nums">{room.totalGuests} {t("report.expected").toLowerCase()}</span>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">→ {room.entered}</span>
                      <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full">+{room.extras}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ CLIENT TABLE ═══ */}
          <div>
            {/* MetricsBar — same component as the main check-in screen, ensures the same Comp counter (persons entered/expected) is shown here */}
            {dailyData && (
              <div className="mb-2">
                <MetricsBar
                  clients={dailyData.clients}
                  checkIns={dailyData.checkIns}
                  onHistoryToggle={() => {}}
                  activeFilter={statusToMetricFilter(statusFilter)}
                  onFilterChange={(metric) => {
                    setStatusFilter(metricToStatusFilter(metric));
                    setSearchQuery("");
                  }}
                  hideNav
                />
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 mb-2 overflow-x-auto">
              {(() => {
                const offlistCount = report.rooms.filter(
                  (r) => r.isVip && (r.vipSource === "list_only" || r.vipSource === "walk_in")
                ).length;
                // Comp count shown in the chip uses persons entered/expected (matches the MetricsBar + top frame).
                // Other chips remain as room counts (since they're status-based, not progress-based).
                const compChipCount: string | number = report.totalCompPersons > 0
                  ? `${report.totalCompPersonsEntered}/${report.totalCompPersons}`
                  : 0;
                return [
                  { key: "all" as const, label: t("report.all"), count: report.rooms.length as string | number },
                  { key: "allIn" as const, label: t("report.allIn"), count: allIn.length as string | number },
                  { key: "partial" as const, label: t("report.partial"), count: partial.length as string | number },
                  { key: "noshow" as const, label: t("report.noShows"), count: noShow.length as string | number },
                  { key: "comp" as const, label: t("metrics.comp"), count: compChipCount },
                  ...(offlistCount > 0 ? [{ key: "offlist" as const, label: t("report.filterOffList"), count: offlistCount as string | number }] : []),
                  ...(extrasRooms.length > 0 ? [{ key: "extras" as const, label: "Extras", count: extrasRooms.length as string | number }] : []),
                ];
              })().map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setStatusFilter(tab.key); setSearchQuery(""); }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-[0.96] ${
                    statusFilter === tab.key
                      ? "bg-dark text-white dark:bg-white dark:text-black"
                      : "glass-liquid text-muted"
                  }`}
                >
                  {tab.label} <span className="opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div className="relative mb-2">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("report.searchPlaceholder")}
                className="w-full pl-9 pr-3 py-2.5 rounded-[12px] glass-liquid text-sm text-dark placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-brand/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted active:opacity-70"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] text-muted">{filteredRooms.length} {t("report.rooms").toLowerCase()}</span>
            </div>

            {/* Table */}
            <div className="glass-liquid rounded-[14px] overflow-hidden overflow-x-auto">
              {/* Header */}
              <div className="grid grid-cols-[46px_1fr_40px_42px_52px_48px] min-w-[380px] px-3 py-2 border-b border-black/5 dark:border-white/8">
                <span className="text-[7px] text-muted uppercase font-semibold">{t("report.room")}</span>
                <span className="text-[7px] text-muted uppercase font-semibold">{t("report.name")}</span>
                <span className="text-[7px] text-muted uppercase font-semibold text-center">Pax</span>
                <span className="text-[7px] text-muted uppercase font-semibold text-center">{t("report.time")}</span>
                <span className="text-[7px] text-muted uppercase font-semibold text-center">PKG</span>
                <span className="text-[7px] text-muted uppercase font-semibold text-right">{t("report.status")}</span>
              </div>

              {/* Rows */}
              {filteredRooms.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted">
                  {searchQuery ? t("clients.noResults") : "—"}
                </div>
              ) : (
                filteredRooms.map((room, i) => {
                  const timeKey = `${room.roomNumber}::${room.name.trim().toLowerCase()}`;
                  const checkInTime = checkInTimeMap.get(timeKey);

                  return (
                    <div
                      key={`${room.roomNumber}-${i}`}
                      className={`grid grid-cols-[46px_1fr_40px_42px_52px_48px] min-w-[380px] px-3 py-2.5 items-center border-b border-black/3 dark:border-white/5 last:border-0 ${
                        room.extras > 0 ? "bg-amber-500/8 dark:bg-amber-500/10" :
                        room.isComp ? "bg-green-500/5 dark:bg-green-500/8" :
                        room.isVip ? "bg-brand/5" :
                        room.status === "no-show" ? "bg-error/[0.03]" : ""
                      }`}
                    >
                      {/* Room */}
                      <div className="flex items-center">
                        <span className="text-xs font-bold font-mono text-dark">{room.roomNumber}</span>
                      </div>

                      {/* Name + VIP crown badge + event icons */}
                      <div className="min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          {room.isVip && (
                            <span className="inline-flex items-center gap-0.5 text-[8px] font-bold bg-gradient-to-r from-brand to-brand-light text-white px-1.5 py-0.5 rounded-full leading-none shrink-0">
                              <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 6l5.5 5L12 4l3.5 7L21 6l-2 10H5zm14 3H5v-2h14v2z"/></svg>
                              {room.vipLevel || "VIP"}
                            </span>
                          )}
                          <span className={`text-[11px] text-dark truncate ${
                            room.isComp ? "underline decoration-green-500 decoration-2 underline-offset-2" : ""
                          }`}>
                            {room.name}
                          </span>
                          <RoomEventBadges
                            events={getRoomEvents(room.roomNumber, getMorningBrief(report.date))}
                            variant="inline"
                          />
                        </div>
                      </div>

                      {/* Pax + extras indicator */}
                      <div className="text-center">
                        <span className={`text-xs font-bold font-mono ${
                          room.extras > 0 ? "text-amber-600 dark:text-amber-400" :
                          room.status === "all-in" ? "text-green-600 dark:text-green-400" :
                          room.status === "no-show" ? "text-error" : "text-dark"
                        }`}>
                          {room.entered}/{room.totalGuests}
                        </span>
                        {room.extras > 0 && (
                          <div className="text-[7px] font-bold text-amber-600 dark:text-amber-400">+{room.extras}</div>
                        )}
                      </div>

                      {/* Time */}
                      <div className="text-center">
                        <span className="text-[9px] font-mono text-muted">
                          {checkInTime || "—"}
                        </span>
                      </div>

                      {/* Package code */}
                      <div className="text-center">
                        {room.isComp ? (
                          <span className="text-[7px] bg-green-500/15 text-green-700 dark:text-green-400 px-1 py-0.5 rounded font-bold">COMP</span>
                        ) : room.hasBreakfast ? (
                          <span className="text-[7px] bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1 py-0.5 rounded font-bold">BKF</span>
                        ) : (
                          <span className="text-[7px] text-muted/40">—</span>
                        )}
                      </div>

                      {/* Status */}
                      <div className="text-right">
                        <StatusBadge status={room.status} t={t} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ═══ CHECK-IN TIMELINE ═══ */}
          {report.checkIns.length > 0 && (
            <details>
              <summary className="text-xs text-muted cursor-pointer font-semibold uppercase tracking-wide mb-2">
                {t("report.timeline")} ({report.checkIns.length})
              </summary>
              <div className="glass-liquid rounded-[14px] divide-y divide-black/5 dark:divide-white/8 overflow-hidden">
                {report.checkIns.map((record) => (
                  <div key={record.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-muted text-xs w-14 shrink-0">{formatTime(record.timestamp)}</span>
                    <span className="font-bold font-mono text-sm text-dark w-12 shrink-0">{record.roomNumber}</span>
                    <span className="text-xs text-muted truncate flex-1">{record.clientName}</span>
                    <span className="glass-brand text-brand px-2.5 py-0.5 rounded-full text-xs font-bold">
                      {record.peopleEntered}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Raw OCR Data */}
          {rawUploadText && (
            <details>
              <summary className="text-xs text-muted cursor-pointer font-medium uppercase tracking-wide">{t("report.rawData")}</summary>
              <pre className="mt-2 text-[10px] glass-liquid p-3 rounded-[14px] overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto text-dark">
                {rawUploadText}
              </pre>
            </details>
          )}
        </div>

        {/* ═══ FLOATING ACTION BAR ═══ */}
        <div className="no-print fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#FBF8F3] dark:from-[#0A0A0F] via-[#FBF8F3] dark:via-[#0A0A0F] to-transparent pt-6">
          <div className="max-w-2xl mx-auto px-4 pb-4 space-y-3">
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 glass-liquid py-3 rounded-[52px] text-base font-bold text-dark dark:border dark:border-white/20 active:scale-[0.97] transition-all"
              >
                {t("report.exportPdf")}
              </button>
              <button
                onClick={handleExportCSV}
                className="flex-1 glass-liquid py-3 rounded-[52px] text-base font-bold text-dark dark:border dark:border-white/20 active:scale-[0.97] transition-all"
              >
                {t("report.exportCsv")}
              </button>
            </div>

            {!isHistorical && (
              !showConfirmClose ? (
                <button
                  onClick={() => setShowConfirmClose(true)}
                  className="w-full bg-error/90 backdrop-blur-sm text-white py-4 rounded-[52px] text-lg font-bold active:scale-[0.97] transition-all shadow-lg shadow-error/20 dark:glow-error"
                >
                  {t("report.closeDay")}
                </button>
              ) : (
                <div className="bg-error/5 border border-error/20 rounded-[14px] p-4">
                  <p className="text-error text-sm font-medium mb-3">{t("report.confirmClose")}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleCloseDay}
                      className="flex-1 bg-error text-white py-3 rounded-[52px] font-bold active:scale-[0.97] transition-all"
                    >
                      {t("report.confirmYes")}
                    </button>
                    <button
                      onClick={() => setShowConfirmClose(false)}
                      className="flex-1 glass-liquid text-dark py-3 rounded-[52px] font-bold active:scale-[0.97] transition-all"
                    >
                      {t("checkin.cancel")}
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
