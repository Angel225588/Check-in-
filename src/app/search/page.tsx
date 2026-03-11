"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDailyData } from "@/hooks/useDailyData";
import { useSearch } from "@/hooks/useSearch";
import { useApp } from "@/contexts/AppContext";
import { addClient, mergeVipIntoSession } from "@/lib/storage";
import { Client } from "@/lib/types";
import MetricsBar, { MetricFilter } from "@/components/MetricsBar";
import SearchInput from "@/components/SearchInput";
import SuggestionCard from "@/components/SuggestionCard";
import NumericKeypad from "@/components/NumericKeypad";
import AlphaKeypad from "@/components/AlphaKeypad";
import HistoryPanel from "@/components/HistoryPanel";
import PhotoCapture, { PhotoCaptureHandle } from "@/components/PhotoCapture";
import { getRemainingForRoom, isComp } from "@/lib/utils";

export default function SearchPage() {
  const router = useRouter();
  const { t } = useApp();
  const { clients, checkIns, hasData, loading, refresh } = useDailyData();
  const { query, mode, results, appendKey, backspace, clear, toggleMode } =
    useSearch(clients);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MetricFilter>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [newName, setNewName] = useState("");
  const [newAdults, setNewAdults] = useState("1");
  const [newChildren, setNewChildren] = useState("0");
  const [vipMergedMsg, setVipMergedMsg] = useState(false);
  const vipCaptureRef = useRef<PhotoCaptureHandle>(null);

  const filteredClients = useMemo(() => {
    if (!activeFilter) return [];
    switch (activeFilter) {
      case "total":
        return clients;
      case "entered":
        return clients.filter((c) => {
          const entered = checkIns
            .filter((ci) => ci.roomNumber === c.roomNumber)
            .reduce((sum, ci) => sum + ci.peopleEntered, 0);
          return entered > 0;
        });
      case "remaining":
        return clients.filter((c) => getRemainingForRoom(c, checkIns) > 0);
      case "comp":
        return clients.filter((c) => isComp(c));
      case "vip":
        return clients.filter((c) => c.isVip);
      default:
        return [];
    }
  }, [activeFilter, clients, checkIns]);

  const handleSelectRoom = (roomNumber: string, clientIndex?: number) => {
    const url = clientIndex !== undefined
      ? `/checkin/${roomNumber}?ci=${clientIndex}`
      : `/checkin/${roomNumber}`;
    router.push(url);
  };

  const handleAddClient = () => {
    if (!newRoom.trim() || !newName.trim()) return;
    const client: Client = {
      roomNumber: newRoom.trim(),
      roomType: "",
      rtc: "",
      confirmationNumber: "",
      name: newName.trim(),
      arrivalDate: "",
      departureDate: "",
      reservationStatus: "",
      adults: Math.max(0, parseInt(newAdults, 10) || 1),
      children: Math.max(0, parseInt(newChildren, 10) || 0),
      rateCode: "",
      packageCode: "",
    };
    addClient(client);
    setAddClientOpen(false);
    setNewRoom("");
    setNewName("");
    setNewAdults("1");
    setNewChildren("0");
    refresh();
  };

  const handleFilterChange = (filter: MetricFilter) => {
    setActiveFilter(filter);
    if (filter) clear();
  };

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (query) setActiveFilter(null);
  }, [query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!hasData) {
    router.push("/upload");
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const handleVipProcessed = (vipClients: Client[]) => {
    if (vipClients.length > 0) {
      mergeVipIntoSession(vipClients);
      refresh();
      setVipMergedMsg(true);
      setTimeout(() => setVipMergedMsg(false), 3000);
    }
  };

  const showFiltered = activeFilter && !query;
  const displayClients = showFiltered ? filteredClients : results;
  const filterLabels: Record<string, string> = {
    total: t("search.allClients"),
    entered: t("search.entered"),
    remaining: t("search.remaining"),
    comp: t("search.comp"),
    vip: "VIP",
  };

  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      <div className="shrink-0 p-2 md:p-3 pt-2 md:pt-3">
        {/* Header row: back button + logo */}
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <button
            onClick={() => router.push("/upload")}
            className="flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
          >
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium text-brand">{t("search.upload")}</span>
          </button>

          <div className="flex flex-col items-end">
            <span className="text-sm md:text-base font-bold tracking-[0.08em] text-brand leading-tight" style={{ fontFamily: "'Nunito', sans-serif" }}>
              COURTYARD
            </span>
            <span className="text-[10px] md:text-xs text-muted leading-tight">
              by <span className="font-bold tracking-[0.05em] text-slate">MARRIOTT</span>
            </span>
          </div>
        </div>

        <MetricsBar
          clients={clients}
          checkIns={checkIns}
          onHistoryToggle={() => setHistoryOpen(true)}
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
        />
      </div>

      <div className="shrink-0 px-2 md:px-3 pb-1">
        <SearchInput query={query} mode={mode} onClear={clear} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 md:px-3 py-1 space-y-1.5 md:space-y-2">
        {showFiltered && (
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-xs md:text-sm font-semibold text-muted uppercase tracking-wide">
              {filterLabels[activeFilter]} ({filteredClients.length} {t("upload.rooms")})
            </span>
            <button
              onClick={() => setActiveFilter(null)}
              className="text-xs md:text-sm text-brand font-medium active:opacity-70"
            >
              {t("upload.clear")}
            </button>
          </div>
        )}
        {displayClients.map((client, i) => {
          const ci = clients.indexOf(client);
          return (
            <SuggestionCard
              key={`${client.roomNumber}-${i}`}
              client={client}
              checkIns={checkIns}
              onSelect={handleSelectRoom}
              clientIndex={ci >= 0 ? ci : undefined}
            />
          );
        })}
        {query && results.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="text-muted text-sm">{t("search.noRooms")}</div>
            <button
              onClick={() => {
                setNewRoom(query);
                setNewName("");
                setNewAdults("1");
                setNewChildren("0");
                setAddClientOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              {t("search.addRoom")} {mode === "numeric" ? query : ""}
            </button>
          </div>
        )}
        {showFiltered && filteredClients.length === 0 && (
          <div className="text-center text-muted py-4 text-sm md:text-base">{t("search.noClients")}</div>
        )}
      </div>

      <div className="shrink-0 p-2 md:p-3 pt-0">
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

      {/* Hidden VIP PhotoCapture */}
      <div className="hidden">
        <PhotoCapture ref={vipCaptureRef} onProcessed={handleVipProcessed} apiEndpoint="/api/ocr-unified" />
      </div>

      {/* VIP merged success toast */}
      {vipMergedMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-green-500 text-white px-4 py-2.5 rounded-full shadow-lg shadow-green-500/30 animate-[slideDown_0.2s_ease-out]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-semibold">{t("search.vipMerged")}</span>
        </div>
      )}

      {/* Floating buttons removed — VIP filter is in MetricsBar, Add Client appears on no-results */}

      {/* Add client modal */}
      {addClientOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 dark:bg-black/60" onClick={() => setAddClientOpen(false)}>
          <div
            className="w-full max-w-2xl bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-5 pb-8 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-dark mb-4">{t("checkin.addClient")}</h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.roomNumber")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="101"
                  maxLength={10}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.guestName")}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="Dupont"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.adultsCount")}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={newAdults}
                  onChange={(e) => setNewAdults(e.target.value)}
                  min="0"
                  max="20"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.childrenCount")}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={newChildren}
                  onChange={(e) => setNewChildren(e.target.value)}
                  min="0"
                  max="20"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAddClientOpen(false)}
                className="flex-1 py-3 rounded-[52px] glass-liquid text-muted font-semibold active:scale-[0.97] transition-all"
              >
                {t("checkin.cancel")}
              </button>
              <button
                onClick={handleAddClient}
                disabled={!newRoom.trim() || !newName.trim()}
                className="flex-1 py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/20 disabled:opacity-40 dark:glow-brand"
              >
                {t("checkin.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <HistoryPanel
        checkIns={checkIns}
        isOpen={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          refresh();
        }}
      />

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
