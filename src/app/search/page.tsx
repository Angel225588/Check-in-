"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDailyData } from "@/hooks/useDailyData";
import { useSearch } from "@/hooks/useSearch";
import MetricsBar from "@/components/MetricsBar";
import SearchInput from "@/components/SearchInput";
import SuggestionCard from "@/components/SuggestionCard";
import NumericKeypad from "@/components/NumericKeypad";
import AlphaKeypad from "@/components/AlphaKeypad";
import HistoryPanel from "@/components/HistoryPanel";

export default function SearchPage() {
  const router = useRouter();
  const { clients, checkIns, hasData, loading, refresh } = useDailyData();
  const { query, mode, results, appendKey, backspace, clear, toggleMode } =
    useSearch(clients);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Refresh data when returning from check-in
  const handleSelectRoom = (roomNumber: string) => {
    router.push(`/checkin/${roomNumber}`);
  };

  // Refresh on focus (when returning from check-in screen)
  if (typeof window !== "undefined") {
    window.onfocus = refresh;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">No Data for Today</h1>
          <p className="text-gray-500">
            Upload the daily report to start checking in guests.
          </p>
        </div>
        <button
          onClick={() => router.push("/upload")}
          className="bg-blue-600 text-white py-4 px-8 rounded-xl text-xl font-bold"
        >
          Upload Report
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto">
      {/* Metrics Bar */}
      <div className="p-3">
        <MetricsBar
          clients={clients}
          checkIns={checkIns}
          onHistoryToggle={() => setHistoryOpen(true)}
        />
      </div>

      {/* Search Input */}
      <div className="px-3">
        <SearchInput query={query} mode={mode} onClear={clear} />
      </div>

      {/* Suggestions */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {results.map((client) => (
          <SuggestionCard
            key={client.roomNumber}
            client={client}
            checkIns={checkIns}
            onSelect={handleSelectRoom}
          />
        ))}
        {query && results.length === 0 && (
          <div className="text-center text-gray-400 py-8">No rooms found</div>
        )}
      </div>

      {/* Upload link */}
      <div className="px-3 pb-1">
        <button
          onClick={() => router.push("/upload")}
          className="text-xs text-gray-400 underline"
        >
          Re-upload data
        </button>
      </div>

      {/* Keypad */}
      <div className="p-3 pt-0">
        {mode === "numeric" ? (
          <NumericKeypad
            onKeyPress={appendKey}
            onBackspace={backspace}
            onToggleMode={toggleMode}
          />
        ) : (
          <AlphaKeypad
            onKeyPress={appendKey}
            onBackspace={backspace}
            onToggleMode={toggleMode}
          />
        )}
      </div>

      {/* History Panel */}
      <HistoryPanel
        checkIns={checkIns}
        isOpen={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
