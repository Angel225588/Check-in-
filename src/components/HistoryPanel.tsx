"use client";
import { CheckInRecord } from "@/lib/types";
import { formatTime } from "@/lib/utils";

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
  if (!isOpen) return null;

  const sorted = [...checkIns].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="ml-auto relative w-full max-w-sm bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Check-in History</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-2">
          {sorted.length === 0 && (
            <p className="text-gray-500 text-center py-8">
              No check-ins yet today
            </p>
          )}
          {sorted.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <div className="text-sm text-gray-500 font-mono w-14 shrink-0">
                {formatTime(record.timestamp)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold font-mono">
                  Room {record.roomNumber}
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {record.clientName}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm font-bold">
                  {record.peopleEntered}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
