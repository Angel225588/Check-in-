"use client";
import { useState, useEffect } from "react";
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

  const handleSelectRoom = (roomNumber: string) => {
    router.push(`/checkin/${roomNumber}`);
  };

  // Refresh on focus (when returning from check-in screen)
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-4 p-4">
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
    <div className="flex flex-col h-dvh w-full max-w-md mx-auto overflow-hidden">
      {/* Metrics Bar */}
      <div className="shrink-0 p-2 pt-2">
        <MetricsBar
          clients={clients}
          checkIns={checkIns}
          onHistoryToggle={() => setHistoryOpen(true)}
        />
      </div>

      {/* Search Input */}
      <div className="shrink-0 px-2 pb-1">
        <SearchInput query={query} mode={mode} onClear={clear} />
      </div>

      {/* Suggestions - scrollable middle area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-1.5">
        {results.map((client) => (
          <SuggestionCard
            key={client.roomNumber}
            client={client}
            checkIns={checkIns}
            onSelect={handleSelectRoom}
          />
        ))}
        {query && results.length === 0 && (
          <div className="text-center text-gray-400 py-4 text-sm">No rooms found</div>
        )}
      </div>

      {/* Keypad - pinned to bottom */}
      <div className="shrink-0 p-2 pt-0">
        <div className="flex items-center justify-between mb-1 px-1">
          <button
            onClick={() => router.push("/upload")}
            className="text-xs text-gray-400 underline"
          >
            Re-upload data
          </button>
        </div>
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
