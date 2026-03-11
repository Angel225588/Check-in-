"use client";
import { useRouter } from "next/navigation";
import { CheckInRecord } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";

interface HistoryPanelProps {
  checkIns: CheckInRecord[];
  isOpen: boolean;
  onClose: () => void;
}

export default function HistoryPanel({
  checkIns,
  isOpen,
  onClose,
}: HistoryPanelProps) {
  const router = useRouter();
  const { t } = useApp();

  if (!isOpen) return null;

  const sorted = [...checkIns].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

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
              <div className="text-right shrink-0">
                <span className="glass-brand text-brand px-2.5 py-1 rounded-full text-sm font-bold">
                  {record.peopleEntered}
                </span>
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
    </div>
  );
}
