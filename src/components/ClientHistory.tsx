"use client";
import { useState, useEffect } from "react";
import { CheckInRecord } from "@/lib/types";
import { getClientHistory, removeCheckIn } from "@/lib/storage";
import { formatTime } from "@/lib/utils";

interface ClientHistoryProps {
  roomNumber: string;
  clientName: string;
  todayCheckIns: CheckInRecord[];
  onUndo?: () => void;
}

export default function ClientHistory({ roomNumber, clientName, todayCheckIns, onUndo }: ClientHistoryProps) {
  const [history, setHistory] = useState<{ date: string; checkIns: CheckInRecord[] }[]>([]);
  const [confirmUndo, setConfirmUndo] = useState<CheckInRecord | null>(null);

  useEffect(() => {
    setHistory(getClientHistory(roomNumber, clientName));
  }, [roomNumber, clientName]);

  const handleUndo = () => {
    if (!confirmUndo) return;
    removeCheckIn(confirmUndo.id);
    setConfirmUndo(null);
    onUndo?.();
  };

  const pastDates = history.slice(0, 3);
  const hasTodayEntries = todayCheckIns.length > 0;
  const hasHistory = pastDates.length > 0;

  if (!hasTodayEntries && !hasHistory) return null;

  return (
    <div className="shrink-0 mb-3">
      <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5 font-medium">History</div>

      {/* Past dates as chips */}
      {hasHistory && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
          {pastDates.map((h) => (
            <div key={h.date} className="shrink-0 glass-liquid rounded-full px-3 py-1.5 flex items-center gap-1.5">
              <span className="text-xs font-semibold text-dark">{h.date}</span>
              <span className="text-[10px] text-muted">
                {h.checkIns.reduce((s, ci) => s + ci.peopleEntered, 0)} pax
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Today's entries */}
      {hasTodayEntries && (
        <div className="space-y-1.5">
          {todayCheckIns.map((ci) => (
            <div key={ci.id} className="flex items-center gap-2 glass rounded-[10px] px-3 py-2">
              <span className="text-xs text-muted font-mono w-12 shrink-0">{formatTime(ci.timestamp)}</span>
              <span className="text-xs font-semibold text-dark flex-1">
                {ci.peopleEntered} {ci.peopleEntered === 1 ? "person" : "people"}
              </span>
              {ci.paymentAction && (
                <span className="text-[10px] text-muted uppercase">{ci.paymentAction}</span>
              )}
              <button
                onClick={() => setConfirmUndo(ci)}
                className="p-1 rounded-full hover:bg-red-500/10 active:scale-90 transition-all"
              >
                <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H7" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 6l-4 4 4 4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Undo confirmation */}
      {confirmUndo && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setConfirmUndo(null)}>
          <div className="absolute inset-0 bg-black/30 dark:bg-black/60" />
          <div
            className="relative w-full max-w-sm bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-5 pb-8 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-dark mb-1">Undo Check-in</h3>
            <p className="text-muted text-sm mb-5">
              Remove {confirmUndo.peopleEntered} {confirmUndo.peopleEntered === 1 ? "person" : "people"} at {formatTime(confirmUndo.timestamp)}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmUndo(null)}
                className="flex-1 py-3 rounded-[52px] glass-liquid text-muted font-semibold active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleUndo}
                className="flex-1 py-3 rounded-[52px] bg-red-500 text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-red-500/20"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
