"use client";
import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getTodayData, closeDay, getSessionHistory, getDataForDate } from "@/lib/storage";
import { generateDayReport, exportReportCSV, DayReport, RoomReport } from "@/lib/report";
import { formatTime } from "@/lib/utils";
import { getRushHourSlots } from "@/lib/analytics";
import { useApp } from "@/contexts/AppContext";
import type { TranslationKey } from "@/lib/i18n";
import type { DailyData } from "@/lib/types";

type StatusFilter = "all" | "allIn" | "partial" | "noshow" | "comp";

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

  // Rush hour data
  const rushSlots = useMemo(() => (dailyData ? getRushHourSlots(dailyData) : []), [dailyData]);
  const maxRush = useMemo(() => Math.max(...rushSlots.map((s) => s.count), 1), [rushSlots]);
  const peakSlot = useMemo(() => rushSlots.find((s) => s.isPeak && s.count > 0), [rushSlots]);

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

  // Average check-in time
  const avgCheckInTime = useMemo(() => {
    if (!report || report.checkIns.length === 0) return null;
    const totalMinutes = report.checkIns.reduce((sum, ci) => {
      const d = new Date(ci.timestamp);
      return sum + d.getHours() * 60 + d.getMinutes();
    }, 0);
    const avg = totalMinutes / report.checkIns.length;
    const h = Math.floor(avg / 60);
    const m = Math.round(avg % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

          {/* ═══ DONUT + PRESENCE ═══ */}
          <div className="glass-liquid rounded-[14px] p-5">
            <div className="flex items-center justify-center gap-6">
              {/* Donut */}
              <div className="relative">
                <DonutRing percent={presencePercent} size={120} stroke={10} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-black tabular-nums ${presencePercent >= 70 ? "text-green-600 dark:text-green-400" : presencePercent >= 40 ? "text-brand" : "text-error"}`}>
                    {presencePercent}%
                  </span>
                  <span className="text-[9px] text-muted uppercase tracking-wide">{t("report.presence")}</span>
                </div>
              </div>

              {/* Key metrics beside donut */}
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-black text-dark tabular-nums">{report.totalEntered}<span className="text-sm font-medium text-muted">/{report.totalGuests}</span></div>
                  <div className="text-[9px] text-muted uppercase tracking-wide">{t("report.persons")}</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-dark tabular-nums">{allIn.length + partial.length}<span className="text-sm font-medium text-muted">/{report.totalRooms}</span></div>
                  <div className="text-[9px] text-muted uppercase tracking-wide">{t("report.rooms")}</div>
                </div>
                {avgCheckInTime && (
                  <div>
                    <div className="text-lg font-black text-dark tabular-nums">{avgCheckInTime}</div>
                    <div className="text-[9px] text-muted uppercase tracking-wide">{t("report.avgTime")}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ STATUS BAR (green/brown/red) ═══ */}
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center gap-3 text-sm mb-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-dark font-medium">{t("report.allIn")}: <b>{allIn.length}</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-brand" />
                <span className="text-dark font-medium">{t("report.partial")}: <b>{partial.length}</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-error" />
                <span className="text-dark font-medium">{t("report.noShow")}: <b>{noShow.length}</b></span>
              </div>
            </div>
            {report.totalRooms > 0 && (
              <div className="flex h-3 rounded-full overflow-hidden">
                {allIn.length > 0 && <div className="bg-green-500 transition-all duration-700" style={{ width: `${(allIn.length / report.totalRooms) * 100}%` }} />}
                {partial.length > 0 && <div className="bg-brand transition-all duration-700" style={{ width: `${(partial.length / report.totalRooms) * 100}%` }} />}
                {noShow.length > 0 && <div className="bg-error transition-all duration-700" style={{ width: `${(noShow.length / report.totalRooms) * 100}%` }} />}
              </div>
            )}

            {/* Guest pax breakdown */}
            <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/8">
              <div className="grid grid-cols-5 gap-1.5 text-center">
                <div>
                  <div className="text-base font-black text-dark tabular-nums">{report.totalGuests}</div>
                  <div className="text-[8px] text-muted uppercase">{t("report.expected")}</div>
                </div>
                <div>
                  <div className="text-base font-black text-green-600 dark:text-green-400 tabular-nums">{report.totalEntered}</div>
                  <div className="text-[8px] text-green-700/60 dark:text-green-400/60 uppercase">{t("report.received")}</div>
                </div>
                <div>
                  <div className="text-base font-black text-error tabular-nums">{report.totalRemaining}</div>
                  <div className="text-[8px] text-error/60 uppercase">{t("report.noShows")}</div>
                </div>
                <div>
                  <div className="text-base font-black text-green-700 dark:text-green-400 tabular-nums">{report.totalComp}</div>
                  <div className="text-[8px] text-green-700/60 dark:text-green-400/60 uppercase">COMP</div>
                </div>
                {report.totalExtras > 0 && (
                  <div>
                    <div className="text-base font-black text-amber-600 dark:text-amber-400 tabular-nums">+{report.totalExtras}</div>
                    <div className="text-[8px] text-amber-600/60 uppercase">Extras</div>
                  </div>
                )}
                {report.totalExtras === 0 && (
                  <div>
                    <div className="text-base font-black text-dark tabular-nums">{report.totalVip}</div>
                    <div className="text-[8px] text-muted uppercase">VIP</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ RUSH HOUR CHART ═══ */}
          {rushSlots.length > 0 && rushSlots.some(s => s.count > 0) && (
            <div className="glass-liquid rounded-[14px] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] text-muted uppercase tracking-wider font-semibold">{t("report.rushHour")}</span>
                {peakSlot && (
                  <span className="text-[9px] font-bold text-brand px-2 py-0.5 glass-brand rounded-full">
                    {t("report.peakTime")}: {peakSlot.label}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-[3px] h-20">
                {rushSlots.map((slot) => (
                  <div key={slot.time} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[8px] font-bold tabular-nums ${slot.isPeak ? "text-brand" : "text-muted"}`}>
                      {slot.count > 0 ? slot.count : ""}
                    </span>
                    <div className="w-full relative" style={{ height: "48px" }}>
                      <div
                        className={`absolute bottom-0 w-full rounded-t-[3px] transition-all duration-700 ${slot.isPeak ? "bg-brand" : "bg-brand/30 dark:bg-brand/40"}`}
                        style={{ height: `${maxRush > 0 ? (slot.count / maxRush) * 100 : 0}%`, minHeight: slot.count > 0 ? "3px" : "0" }}
                      />
                    </div>
                    <span className={`text-[7px] tabular-nums ${slot.isPeak ? "text-brand font-bold" : "text-muted"}`}>
                      {slot.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ CLIENT TABLE ═══ */}
          <div>
            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 mb-2 overflow-x-auto">
              {([
                { key: "all", label: t("report.all"), count: report.rooms.length },
                { key: "allIn", label: t("report.allIn"), count: allIn.length, color: "green" },
                { key: "partial", label: t("report.partial"), count: partial.length, color: "brand" },
                { key: "noshow", label: t("report.noShows"), count: noShow.length, color: "red" },
                { key: "comp", label: "COMP", count: report.totalComp, color: "green" },
              ] as const).map((tab) => (
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
                      <div className="flex items-center gap-0.5">
                        <span className="text-xs font-bold font-mono text-dark">{room.roomNumber}</span>
                        {room.isVip && (
                          <span className="text-[6px] bg-gradient-to-r from-brand to-brand-light text-white px-1 py-0.5 rounded-full font-black leading-none">V</span>
                        )}
                      </div>

                      {/* Name */}
                      <div className="min-w-0 pr-1">
                        <span className={`text-[11px] text-dark truncate block ${
                          room.isComp ? "underline decoration-green-500 decoration-2 underline-offset-2" : ""
                        }`}>
                          {room.name}
                        </span>
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
