"use client";
import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getTodayData, closeDay, getSessionHistory } from "@/lib/storage";
import { generateDayReport, exportReportCSV, DayReport, RoomReport } from "@/lib/report";
import { formatTime } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import type { TranslationKey } from "@/lib/i18n";

type MetricFilter = "all" | "allIn" | "partial" | "noshow" | "comp" | null;

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

export default function ReportPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto bg-[#FBF8F3] dark:bg-[#0A0A0F] p-4">
        <div className="skeleton h-8 w-40 mb-4" />
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14" />)}
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
  const [rawUploadText, setRawUploadText] = useState<string>("");
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(null);
  const [tablePage, setTablePage] = useState(0);
  const [isHistorical, setIsHistorical] = useState(false);
  const ROWS_PER_PAGE = 15;

  useEffect(() => {
    const dateParam = searchParams.get("date");

    if (dateParam) {
      // Historical report — load from session history
      const sessions = getSessionHistory();
      const session = sessions.find((s) => s.date === dateParam);
      if (!session) {
        router.push("/reports");
        return;
      }
      setReport(generateDayReport(session.clients, session.checkIns));
      setRawUploadText(session.rawUploadText || "");
      setIsHistorical(true);
    } else {
      // Today's report
      const data = getTodayData();
      if (!data || data.clients.length === 0) {
        router.push("/reports");
        return;
      }
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

  const handleExportPDF = () => {
    window.print();
  };

  const handleCloseDay = () => {
    closeDay();
    router.push("/upload");
  };

  const handleMetricTap = (filter: MetricFilter) => {
    setMetricFilter(metricFilter === filter ? null : filter);
    setTablePage(0);
  };

  // Filtered rooms based on metric tap
  const filteredRooms = useMemo(() => {
    if (!report) return [];
    if (metricFilter === "all") return report.rooms;
    if (metricFilter === "allIn") return report.rooms.filter((r) => r.status === "all-in");
    if (metricFilter === "partial") return report.rooms.filter((r) => r.status === "partial");
    if (metricFilter === "noshow") return report.rooms.filter((r) => r.status === "no-show");
    if (metricFilter === "comp") return report.rooms.filter((r) => r.isComp);
    return report.rooms;
  }, [report, metricFilter]);

  const totalPages = Math.ceil(filteredRooms.length / ROWS_PER_PAGE);
  const pageRooms = filteredRooms.slice(tablePage * ROWS_PER_PAGE, (tablePage + 1) * ROWS_PER_PAGE);

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
  const allInGuests = allIn.reduce((s, r) => s + r.entered, 0);
  const partialGuests = partial.reduce((s, r) => s + r.entered, 0);

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
        {/* ═══ STICKY HEADER + METRICS ═══ */}
        <div className="sticky top-0 z-30 bg-[#FBF8F3]/90 dark:bg-[#0A0A0F]/90 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-2">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => router.push(isHistorical ? "/reports" : "/search")}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
              >
                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium text-brand">{isHistorical ? t("reports.title") : t("report.back")}</span>
              </button>
              <div className="text-right">
                <h1 className="text-lg font-black text-dark">{t("report.title")}</h1>
                <p className="text-xs text-muted">{report.date}</p>
              </div>
            </div>

            {/* ═══ METRIC FILTER CARDS (tappable) ═══ */}
            <div className="grid grid-cols-5 gap-1.5">
              <button onClick={() => handleMetricTap("all")}
                className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${metricFilter === "all" ? "glass-liquid-active ring-1 ring-brand/30" : "glass-liquid"}`}>
                <div className="text-[8px] text-muted uppercase tracking-wide">{t("report.totalRooms")}</div>
                <div className="text-xl font-black text-dark">{report.totalRooms}</div>
                <div className="text-[9px] text-muted">{report.totalGuests} pax</div>
              </button>
              <button onClick={() => handleMetricTap("allIn")}
                className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${metricFilter === "allIn" ? "glass-liquid-active ring-1 ring-green-500/30" : "glass-liquid"}`}>
                <div className="text-[8px] text-green-700 dark:text-green-400 uppercase tracking-wide">{t("report.allIn")}</div>
                <div className="text-xl font-black text-green-700 dark:text-green-400">{allIn.length}</div>
                <div className="text-[9px] text-green-700/60 dark:text-green-400/60">{allInGuests} pax</div>
              </button>
              <button onClick={() => handleMetricTap("partial")}
                className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${metricFilter === "partial" ? "glass-liquid-active ring-1 ring-brand/30" : "glass-liquid"}`}>
                <div className="text-[8px] text-brand uppercase tracking-wide">{t("report.partial")}</div>
                <div className="text-xl font-black text-brand">{partial.length}</div>
                <div className="text-[9px] text-brand/60">{partialGuests} pax</div>
              </button>
              <button onClick={() => handleMetricTap("noshow")}
                className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${metricFilter === "noshow" ? "glass-liquid-active ring-1 ring-red-500/30" : "glass-liquid"}`}>
                <div className="text-[8px] text-error uppercase tracking-wide">{t("report.noShows")}</div>
                <div className="text-xl font-black text-error">{noShow.length}</div>
                <div className="text-[9px] text-error/60">{report.totalGuests - report.totalEntered} pax</div>
              </button>
              <button onClick={() => handleMetricTap("comp")}
                className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${metricFilter === "comp" ? "glass-liquid-active ring-1 ring-green-500/30" : "glass-liquid"}`}>
                <div className="text-[8px] text-muted uppercase tracking-wide">COMP</div>
                <div className="text-xl font-black text-green-700 dark:text-green-400">{report.totalComp}</div>
              </button>
            </div>
          </div>
        </div>

        {/* ═══ SCROLLABLE CONTENT ═══ */}
        <div className="max-w-2xl mx-auto px-4 pb-48 space-y-4 pt-3">
          {/* Status breakdown bar — ROOMS */}
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="text-[9px] text-muted uppercase tracking-wider font-semibold mb-2">{t("report.roomBreakdown")}</div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-dark">{t("report.allIn")}: <b>{allIn.length}</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-brand" />
                <span className="text-dark">{t("report.partial")}: <b>{partial.length}</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-error" />
                <span className="text-dark">{t("report.noShow")}: <b>{noShow.length}</b></span>
              </div>
            </div>
            {report.totalRooms > 0 && (
              <div className="flex h-3 rounded-full overflow-hidden mt-3">
                {allIn.length > 0 && (
                  <div className="bg-green-500" style={{ width: `${(allIn.length / report.totalRooms) * 100}%` }} />
                )}
                {partial.length > 0 && (
                  <div className="bg-brand" style={{ width: `${(partial.length / report.totalRooms) * 100}%` }} />
                )}
                {noShow.length > 0 && (
                  <div className="bg-error" style={{ width: `${(noShow.length / report.totalRooms) * 100}%` }} />
                )}
              </div>
            )}

            {/* Guest count summary — separate section, clear GUESTS unit */}
            <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/8">
              <div className="text-[9px] text-muted uppercase tracking-wider font-semibold mb-1.5">Guests (pax)</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-black text-dark tabular-nums">{report.totalGuests}</div>
                  <div className="text-[9px] text-muted">{t("report.totalGuests")}</div>
                </div>
                <div>
                  <div className="text-lg font-black text-green-600 dark:text-green-400 tabular-nums">{report.totalEntered}</div>
                  <div className="text-[9px] text-green-700/60 dark:text-green-400/60">{t("report.entered")}</div>
                </div>
                <div>
                  <div className="text-lg font-black text-error tabular-nums">{report.totalRemaining}</div>
                  <div className="text-[9px] text-error/60">{t("report.remaining")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ PAGINATED ROOM TABLE ═══ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">
                {metricFilter ? `${filteredRooms.length} ${t("upload.rooms")}` : t("report.roomBreakdown")}
              </h2>
              {metricFilter && (
                <button onClick={() => setMetricFilter(null)} className="text-xs text-brand font-medium active:opacity-70">
                  {t("upload.clear")}
                </button>
              )}
            </div>

            <div className="glass-liquid rounded-[14px] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[60px_1fr_55px_55px] px-4 py-2 border-b border-black/5 dark:border-white/8">
                <span className="text-[9px] text-muted uppercase font-semibold">{t("report.room")}</span>
                <span className="text-[9px] text-muted uppercase font-semibold">{t("report.name")}</span>
                <span className="text-[9px] text-muted uppercase font-semibold text-center">N</span>
                <span className="text-[9px] text-muted uppercase font-semibold text-right">{t("report.status")}</span>
              </div>

              {/* Table rows */}
              {pageRooms.map((room, i) => (
                <div
                  key={`${room.roomNumber}-${i}`}
                  className={`grid grid-cols-[60px_1fr_55px_55px] px-4 py-2.5 items-center border-b border-black/3 dark:border-white/5 last:border-0 ${
                    room.isComp ? "bg-green-500/5 dark:bg-green-500/8" :
                    room.isVip ? "bg-brand/5" :
                    room.status === "no-show" ? "bg-error/5" : ""
                  }`}
                >
                  {/* Room */}
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold font-mono text-dark">{room.roomNumber}</span>
                    {room.isVip && (
                      <span className="text-[7px] bg-gradient-to-r from-brand to-brand-light text-white px-1 py-0.5 rounded-full font-black leading-none">V</span>
                    )}
                  </div>

                  {/* Name — COMP gets green underline */}
                  <div className="min-w-0">
                    <span className={`text-xs text-dark truncate block ${
                      room.isComp ? "underline decoration-green-500 decoration-2 underline-offset-2" : ""
                    }`}>
                      {room.name}
                    </span>
                  </div>

                  {/* People entered / total */}
                  <div className="text-center">
                    <span className={`text-sm font-bold font-mono ${
                      room.status === "all-in" ? "text-green-600 dark:text-green-400" :
                      room.status === "no-show" ? "text-error" : "text-dark"
                    }`}>
                      {room.entered}/{room.totalGuests}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="text-right">
                    {room.isComp ? (
                      <span className="text-[8px] bg-green-500/15 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold">COMP</span>
                    ) : (
                      <StatusBadge status={room.status} t={t} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination arrows */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-2 px-1">
                <button
                  onClick={() => setTablePage(Math.max(0, tablePage - 1))}
                  disabled={tablePage === 0}
                  aria-label="Previous page"
                  className="px-4 py-1.5 rounded-full glass-liquid text-sm font-bold text-dark disabled:opacity-30 active:scale-95 transition-all"
                >
                  ←
                </button>
                <span className="text-xs text-muted font-medium" aria-live="polite">{tablePage + 1} / {totalPages}</span>
                <button
                  onClick={() => setTablePage(Math.min(totalPages - 1, tablePage + 1))}
                  disabled={tablePage >= totalPages - 1}
                  aria-label="Next page"
                  className="px-4 py-1.5 rounded-full glass-liquid text-sm font-bold text-dark disabled:opacity-30 active:scale-95 transition-all"
                >
                  →
                </button>
              </div>
            )}
          </div>

          {/* Timeline */}
          {report.checkIns.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("report.timeline")}</h2>
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
            </div>
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

        {/* Floating action bar */}
        <div className="no-print fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#FBF8F3] dark:from-[#0A0A0F] via-[#FBF8F3] dark:via-[#0A0A0F] to-transparent pt-6">
          <div className="max-w-2xl mx-auto px-4 pb-4 space-y-3">
            <div className="flex gap-3">
              <button
                onClick={handleExportPDF}
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
                  <p className="text-error text-sm font-medium mb-3">
                    {t("report.confirmClose")}
                  </p>
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
