"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTodayData, closeDay } from "@/lib/storage";
import { generateDayReport, exportReportCSV, DayReport, RoomReport } from "@/lib/report";
import { formatTime } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import type { TranslationKey } from "@/lib/i18n";

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

export default function ReportPage() {
  const router = useRouter();
  const { t } = useApp();
  const [report, setReport] = useState<DayReport | null>(null);
  const [rawUploadText, setRawUploadText] = useState<string>("");
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  useEffect(() => {
    const data = getTodayData();
    if (!data || data.clients.length === 0) {
      router.push("/search");
      return;
    }
    setReport(generateDayReport(data.clients, data.checkIns));
    setRawUploadText(data.rawUploadText || "");
  }, [router]);

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

  if (!report) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#F2F2F7] dark:bg-[#0A0A0F]">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const allIn = report.rooms.filter((r) => r.status === "all-in");
  const partial = report.rooms.filter((r) => r.status === "partial");
  const noShow = report.rooms.filter((r) => r.status === "no-show");
  const noShowGuests = noShow.reduce((s, r) => s + r.totalGuests, 0);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="min-h-dvh bg-[#F2F2F7] dark:bg-[#0A0A0F]">
        <div className="max-w-2xl mx-auto p-4 space-y-4 pb-48">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/search")}
              className="no-print flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
            >
              <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium text-brand">{t("report.back")}</span>
            </button>
            <div className="text-right">
              <h1 className="text-lg md:text-xl font-black text-dark">{t("report.title")}</h1>
              <p className="text-xs text-muted">{report.date}</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-muted uppercase">{t("report.totalRooms")}</div>
              <div className="text-2xl md:text-3xl font-black text-dark">{report.totalRooms}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-muted uppercase">{t("report.totalGuests")}</div>
              <div className="text-2xl md:text-3xl font-black text-dark">{report.totalGuests}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-green-700 dark:text-green-400 uppercase">{t("report.entered")}</div>
              <div className="text-2xl md:text-3xl font-black text-green-700 dark:text-green-400">{report.totalEntered}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-brand uppercase">{t("report.remaining")}</div>
              <div className="text-2xl md:text-3xl font-black text-brand">{report.totalRemaining}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-error uppercase">{t("report.noShows")}</div>
              <div className="text-2xl md:text-3xl font-black text-error">{noShow.length}</div>
              <div className="text-[10px] text-error/70">{noShowGuests} {t("dash.guests")}</div>
            </div>
            {report.totalVip > 0 && (
              <div className="glass-liquid rounded-[14px] p-3 text-center">
                <div className="text-[10px] text-brand uppercase">{t("report.vipRooms")}</div>
                <div className="text-2xl md:text-3xl font-black text-brand">{report.totalVip}</div>
              </div>
            )}
          </div>

          {/* Status breakdown bar */}
          <div className="glass-liquid rounded-[14px] p-4">
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
          </div>

          {/* Room Table */}
          <div>
            <h2 className="text-sm font-bold text-dark mb-2">{t("report.roomBreakdown")}</h2>
            <div className="overflow-x-auto glass-liquid rounded-[14px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 dark:border-white/5">
                    <th className="px-3 py-2 text-left text-xs text-muted font-medium">{t("report.room")}</th>
                    <th className="px-3 py-2 text-left text-xs text-muted font-medium">{t("report.name")}</th>
                    <th className="px-3 py-2 text-center text-xs text-muted font-medium">{t("report.inTotal")}</th>
                    <th className="px-3 py-2 text-center text-xs text-muted font-medium">{t("report.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rooms.map((room, i) => (
                    <tr
                      key={i}
                      className={`border-t border-black/5 dark:border-white/5 ${
                        room.isVip ? "bg-brand/5" : room.status === "no-show" ? "bg-error/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono font-bold text-dark">
                        <span className="flex items-center gap-1">
                          {room.roomNumber}
                          {room.isVip && (
                            <span className="text-[9px] font-bold bg-gradient-to-r from-brand to-brand-light text-white px-1.5 py-0.5 rounded-full">VIP</span>
                          )}
                          {room.isComp && (
                            <span className="text-[9px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full">C</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-dark">{room.name}</td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-dark">
                        {room.entered}/{room.totalGuests}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={room.status} t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Timeline */}
          {report.checkIns.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-dark mb-2">{t("report.timeline")}</h2>
              <div className="space-y-1.5">
                {report.checkIns.map((record) => (
                  <div key={record.id} className="flex items-center gap-3 p-2.5 glass-liquid rounded-[14px] text-sm">
                    <span className="font-mono text-muted w-14 shrink-0">{formatTime(record.timestamp)}</span>
                    <span className="font-bold font-mono text-dark">{record.roomNumber}</span>
                    <span className="text-muted truncate flex-1">{record.clientName}</span>
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
              <summary className="text-sm text-muted cursor-pointer font-medium">{t("report.rawData")}</summary>
              <pre className="mt-2 text-[10px] glass-liquid p-3 rounded-[14px] overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto text-dark">
                {rawUploadText}
              </pre>
            </details>
          )}
        </div>

        {/* Floating action bar */}
        <div className="no-print fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#F2F2F7] dark:from-[#0A0A0F] via-[#F2F2F7] dark:via-[#0A0A0F] to-transparent pt-6">
          <div className="max-w-2xl mx-auto px-4 pb-4 space-y-3">
            <div className="flex gap-3">
              <button
                onClick={handleExportPDF}
                className="flex-1 glass-liquid py-3 rounded-[52px] text-base font-bold text-dark active:scale-[0.97] transition-all"
              >
                {t("report.exportPdf")}
              </button>
              <button
                onClick={handleExportCSV}
                className="flex-1 glass-liquid py-3 rounded-[52px] text-base font-bold text-dark active:scale-[0.97] transition-all"
              >
                {t("report.exportCsv")}
              </button>
            </div>

            {!showConfirmClose ? (
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
            )}
          </div>
        </div>
      </div>
    </>
  );
}
