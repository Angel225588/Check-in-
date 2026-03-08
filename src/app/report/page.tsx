"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTodayData, closeDay } from "@/lib/storage";
import { generateDayReport, exportReportCSV, DayReport, RoomReport } from "@/lib/report";
import { formatTime } from "@/lib/utils";

function StatusBadge({ status }: { status: RoomReport["status"] }) {
  const styles = {
    "all-in": "bg-green-100 text-green-700",
    partial: "bg-brand-50 text-brand",
    "no-show": "bg-red-50 text-error",
  };
  const labels = { "all-in": "All In", partial: "Partial", "no-show": "No Show" };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<DayReport | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  useEffect(() => {
    const data = getTodayData();
    if (!data || data.clients.length === 0) {
      router.push("/search");
      return;
    }
    setReport(generateDayReport(data.clients, data.checkIns));
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
      <div className="flex items-center justify-center h-dvh">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const allIn = report.rooms.filter((r) => r.status === "all-in");
  const partial = report.rooms.filter((r) => r.status === "partial");
  const noShow = report.rooms.filter((r) => r.status === "no-show");

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto p-4 space-y-6 pb-48">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-dark">End of Day Report</h1>
            <p className="text-sm text-muted">{report.date}</p>
          </div>
          <button
            onClick={() => router.push("/search")}
            className="text-brand underline text-sm no-print"
          >
            Back
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-[14px] p-4 shadow-sm border border-border text-center">
            <div className="text-xs text-muted uppercase">Total Rooms</div>
            <div className="text-3xl font-bold text-dark">{report.totalRooms}</div>
          </div>
          <div className="bg-white rounded-[14px] p-4 shadow-sm border border-border text-center">
            <div className="text-xs text-muted uppercase">Total Guests</div>
            <div className="text-3xl font-bold text-dark">{report.totalGuests}</div>
          </div>
          <div className="bg-green-50 rounded-[14px] p-4 shadow-sm border border-green-200 text-center">
            <div className="text-xs text-green-700 uppercase">Entered</div>
            <div className="text-3xl font-bold text-green-700">{report.totalEntered}</div>
          </div>
          <div className="bg-red-50 rounded-[14px] p-4 shadow-sm border border-red-200 text-center">
            <div className="text-xs text-error uppercase">Remaining</div>
            <div className="text-3xl font-bold text-error">{report.totalRemaining}</div>
          </div>
          {report.totalVip > 0 && (
            <div className="bg-brand-50 rounded-[14px] p-4 shadow-sm border border-brand-light text-center">
              <div className="text-xs text-brand uppercase">VIP Rooms</div>
              <div className="text-3xl font-bold text-brand">{report.totalVip}</div>
            </div>
          )}
          {report.totalComp > 0 && (
            <div className="bg-purple-50 rounded-[14px] p-4 shadow-sm border border-purple-200 text-center">
              <div className="text-xs text-purple-700 uppercase">Comp Rooms</div>
              <div className="text-3xl font-bold text-purple-700">{report.totalComp}</div>
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="bg-white rounded-[14px] p-4 shadow-sm border border-border">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>All In: <b>{allIn.length}</b></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-brand" />
              <span>Partial: <b>{partial.length}</b></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-error" />
              <span>No Show: <b>{noShow.length}</b></span>
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
          <h2 className="text-lg font-bold mb-2">Room Breakdown</h2>
          <div className="overflow-x-auto border border-border rounded-[14px]">
            <table className="w-full text-sm">
              <thead className="bg-bg-alt">
                <tr>
                  <th className="px-3 py-2 text-left">Room</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-center">In/Total</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.rooms.map((room, i) => (
                  <tr
                    key={i}
                    className={`border-t border-border ${
                      room.isVip ? "bg-brand-50" : room.status === "no-show" ? "bg-red-50/50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono font-bold">
                      <span className="flex items-center gap-1">
                        {room.roomNumber}
                        {room.isVip && (
                          <span className="text-[9px] font-bold bg-brand-light text-dark px-1 py-0.5 rounded">VIP</span>
                        )}
                        {room.isComp && (
                          <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1 py-0.5 rounded">C</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{room.name}</td>
                    <td className="px-3 py-2 text-center font-mono font-bold">
                      {room.entered}/{room.totalGuests}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={room.status} />
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
            <h2 className="text-lg font-bold mb-2">Check-in Timeline</h2>
            <div className="space-y-1.5">
              {report.checkIns.map((record) => (
                <div key={record.id} className="flex items-center gap-3 p-2 bg-bg-alt rounded-lg text-sm">
                  <span className="font-mono text-muted w-14 shrink-0">{formatTime(record.timestamp)}</span>
                  <span className="font-bold font-mono">{record.roomNumber}</span>
                  <span className="text-muted truncate flex-1">{record.clientName}</span>
                  <span className="bg-brand-50 text-brand px-2 py-0.5 rounded-full text-xs font-bold">
                    {record.peopleEntered}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating action bar */}
      <div className="no-print fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg">
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          {/* Export buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleExportPDF}
              className="flex-1 bg-brand text-white py-3 rounded-[52px] text-base font-bold active:opacity-90 transition-opacity"
            >
              Export PDF
            </button>
            <button
              onClick={handleExportCSV}
              className="flex-1 bg-bg-alt text-dark py-3 rounded-[52px] text-base font-bold border border-border active:bg-border transition-colors"
            >
              Export CSV
            </button>
          </div>

          {/* Close Day */}
          {!showConfirmClose ? (
            <button
              onClick={() => setShowConfirmClose(true)}
              className="w-full bg-error text-white py-4 rounded-[52px] text-lg font-bold active:opacity-90 transition-opacity"
            >
              Close Day & Start New
            </button>
          ) : (
            <div className="bg-red-50 border border-error rounded-[14px] p-4">
              <p className="text-error text-sm font-medium mb-3">
                This will save today&apos;s session to history and clear all data. Make sure you&apos;ve exported the report first.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCloseDay}
                  className="flex-1 bg-error text-white py-3 rounded-[52px] font-bold"
                >
                  Yes, Close Day
                </button>
                <button
                  onClick={() => setShowConfirmClose(false)}
                  className="flex-1 bg-white text-dark py-3 rounded-[52px] font-bold border border-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
