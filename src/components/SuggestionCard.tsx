"use client";
import { Client, CheckInRecord } from "@/lib/types";
import { getRemainingForRoom, isComp } from "@/lib/utils";

interface SuggestionCardProps {
  client: Client;
  checkIns: CheckInRecord[];
  onSelect: (roomNumber: string) => void;
}

export default function SuggestionCard({
  client,
  checkIns,
  onSelect,
}: SuggestionCardProps) {
  const remaining = getRemainingForRoom(client, checkIns);
  const total = client.adults + client.children;
  const allCheckedIn = remaining === 0;
  const comp = isComp(client);

  return (
    <button
      onClick={() => onSelect(client.roomNumber)}
      className={`w-full text-left p-4 bg-white rounded-xl shadow-sm border flex items-center gap-4 transition-colors ${
        allCheckedIn
          ? "opacity-50 border-green-300 bg-green-50"
          : "hover:bg-blue-50 border-gray-200"
      }`}
    >
      <div
        className={`w-1.5 h-12 rounded-full ${
          comp ? "bg-purple-500" : "bg-blue-500"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold font-mono">
            {client.roomNumber}
          </span>
          {comp && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              COMP
            </span>
          )}
          {allCheckedIn && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              DONE
            </span>
          )}
        </div>
        <div className="text-sm text-gray-600 truncate">{client.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-bold">
          {remaining}/{total}
        </div>
        <div className="text-xs text-gray-500">remaining</div>
      </div>
    </button>
  );
}
