"use client";
import { Client, CheckInRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount, getCompStats } from "@/lib/utils";

interface MetricsBarProps {
  clients: Client[];
  checkIns: CheckInRecord[];
  onHistoryToggle: () => void;
}

export default function MetricsBar({
  clients,
  checkIns,
  onHistoryToggle,
}: MetricsBarProps) {
  const total = getTotalGuests(clients);
  const entered = getCheckedInCount(checkIns);
  const comp = getCompStats(clients, checkIns);

  return (
    <div className="flex items-center gap-1 p-2 bg-white rounded-xl shadow-sm">
      <div className="flex-1 text-center border-r">
        <div className="text-[10px] text-gray-500 uppercase">Total</div>
        <div className="text-xl font-bold">{total}</div>
      </div>
      <div className="flex-1 text-center border-r">
        <div className="text-[10px] text-gray-500 uppercase">Entered</div>
        <div className="text-xl font-bold text-green-600">
          {entered}
        </div>
      </div>
      <div className="flex-1 text-center border-r">
        <div className="text-[10px] text-gray-500 uppercase">Remaining</div>
        <div className="text-xl font-bold text-orange-600">
          {total - entered}
        </div>
      </div>
      <div className="flex-1 text-center border-r">
        <div className="text-[10px] text-gray-500 uppercase">Comp</div>
        <div className="text-xl font-bold text-purple-600">
          {comp.entered}/{comp.total}
        </div>
      </div>
      <button
        onClick={onHistoryToggle}
        className="p-1.5 rounded-lg hover:bg-gray-100"
        aria-label="History"
      >
        <svg
          className="w-6 h-6 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </div>
  );
}
