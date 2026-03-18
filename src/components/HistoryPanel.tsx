"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckInRecord } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { removeCheckIn } from "@/lib/storage";
import { useApp } from "@/contexts/AppContext";

interface HistoryPanelProps {
  checkIns: CheckInRecord[];
  isOpen: boolean;
  onClose: () => void;
  onUndo?: () => void;
}

export default function HistoryPanel({
  checkIns,
  isOpen,
  onClose,
  onUndo,
}: HistoryPanelProps) {
  const router = useRouter();
  const { t } = useApp();
  const [confirmUndo, setConfirmUndo] = useState<CheckInRecord | null>(null);
  const [undoToast, setUndoToast] = useState(false);

  if (!isOpen) return null;

  const sorted = [...checkIns].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const handleUndo = () => {
    if (!confirmUndo) return;
    removeCheckIn(confirmUndo.id);
    setConfirmUndo(null);
    setUndoToast(true);
    setTimeout(() => setUndoToast(false), 2000);
    onUndo?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 glass-dark" onClick={onClose} />
      <div className="ml-auto relative w-full max-w-sm bg-[#FBF8F3] dark:bg-[#0A0A0F] h-full shadow-xl flex flex-col">
        <div className="shrink-0 glass border-b border-white/20 dark:border-white/5 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark">{t("history.title")}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/40 dark:hover:bg-white/10 rounded-xl active:scale-90 transition-all">
            <svg className="w-6 h-6 text-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sorted.length === 0 && (
            <p className="text-muted text-center py-8">{t("history.noCheckins")}</p>
          )}
          {sorted.map((record) => (
            <div key={record.id} className="flex items-center gap-3 p-3 glass rounded-[14px]">
              <div className="text-sm text-muted font-mono w-14 shrink-0">
                {formatTime(record.timestamp)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold font-mono text-dark">{t("checkin.room")} {record.roomNumber}</div>
                <div className="text-sm text-muted truncate">{record.clientName}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="glass-brand text-brand px-2.5 py-1 rounded-full text-sm font-bold">
                  {record.peopleEntered}
                </span>
                <button
                  onClick={() => setConfirmUndo(record)}
                  className="p-1.5 rounded-full hover:bg-red-500/10 active:scale-90 transition-all"
                  title="Undo"
                >
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H7" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 6l-4 4 4 4" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 p-4">
          <button
            onClick={() => {
              onClose();
              router.push("/report");
            }}
            className="w-full bg-error/90 backdrop-blur-sm text-white py-4 rounded-[52px] text-lg font-bold active:scale-[0.98] transition-all shadow-lg shadow-error/20 dark:glow-error"
          >
            {t("history.closeDay")}
          </button>
        </div>
      </div>

      {/* Undo confirmation bottom-sheet */}
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
              Remove check-in for <strong className="text-dark">{confirmUndo.clientName}</strong>, Room <strong className="text-dark">{confirmUndo.roomNumber}</strong>?
              <br />
              <span className="text-xs">({confirmUndo.peopleEntered} {confirmUndo.peopleEntered === 1 ? "person" : "people"} at {formatTime(confirmUndo.timestamp)})</span>
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

      {/* Undo success toast */}
      {undoToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 bg-red-500 text-white px-4 py-2.5 rounded-full shadow-lg animate-[slideDown_0.2s_ease-out]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-semibold">Check-in undone</span>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
