"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDailyData } from "@/hooks/useDailyData";
import { useSearch } from "@/hooks/useSearch";
import { useApp } from "@/contexts/AppContext";
import { addClient, mergeVipIntoSession, getSessionHistory, getSettings, saveSettings, closeDay } from "@/lib/storage";
import { Client } from "@/lib/types";
import MetricsBar, { MetricFilter } from "@/components/MetricsBar";
import RoomSearchField from "@/components/RoomSearchField";
import ServiceClock, { ExpectedGuest } from "@/components/ServiceClock";
import SearchNav from "@/components/SearchNav";
import SuggestionCard from "@/components/SuggestionCard";
import NumericKeypad from "@/components/NumericKeypad";
import AlphaKeypad from "@/components/AlphaKeypad";
import HistoryPanel from "@/components/HistoryPanel";
import PhotoCapture, { PhotoCaptureHandle } from "@/components/PhotoCapture";
import { getRemainingForRoom, isComp } from "@/lib/utils";
import { checkinHref } from "@/lib/checkin-nav";

export default function SearchPage() {
  const router = useRouter();
  const { t } = useApp();
  const { clients, checkIns, hasData, loading, refresh } = useDailyData();
  const { query, setQuery, mode, results, appendKey, backspace, clear } =
    useSearch(clients);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MetricFilter>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [newName, setNewName] = useState("");
  const [newAdults, setNewAdults] = useState("1");
  const [newChildren, setNewChildren] = useState("0");
  const [vipMergedMsg, setVipMergedMsg] = useState(false);
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [mergeBanner, setMergeBanner] = useState<{ added: number; skipped: number; total: number } | null>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const [handSide, setHandSide] = useState<"left" | "right">("left");

  useEffect(() => {
    setHandSide(getSettings().handSide === "right" ? "right" : "left");
  }, []);

  const flipSide = () => {
    const next = handSide === "left" ? "right" : "left";
    setHandSide(next);
    saveSettings({ ...getSettings(), handSide: next });
  };

  /** Rooms with someone still to come. Declared with the other hooks, above
   *  every early return — a useMemo below one runs on some renders and not
   *  others, which is React error #310. */
  const remaining = useMemo(
    () => clients.filter((c) => getRemainingForRoom(c, checkIns) > 0),
    [clients, checkIns]
  );

  /** The single unambiguous target, if there is one: an exact room, or the only
   *  guest a name still matches. Drives the CTA — nothing else may commit. */
  const hit = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    if (/^\d+$/.test(q)) return q.length >= 3 ? results.find((c) => c.roomNumber === q) ?? null : null;
    return q.length >= 2 && results.length === 1 ? results[0] : null;
  }, [query, results]);

  /** Guests whose arrival time is predictable: three or more prior stays. One
   *  visit is not a pattern, and a wrong prediction puts a wrong name in
   *  someone's mouth. Surname only — this panel is readable across a counter. */
  const expected = useMemo<ExpectedGuest[]>(() => {
    const seen = new Map<string, number>();
    for (const s of getSessionHistory()) {
      for (const c of s.clients) {
        const k = c.name.trim().toUpperCase();
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
    }
    const done = new Set(checkIns.map((c) => c.roomNumber));
    return clients
      .filter((c) => !done.has(c.roomNumber) && (seen.get(c.name.trim().toUpperCase()) ?? 0) >= 3)
      .slice(0, 3)
      .map((c, i) => ({
        roomNumber: c.roomNumber,
        surname: c.name.split(/[\/,]/)[0].trim().split(/\s+/)[0],
        at: `0${7}:${String(15 + i * 6).padStart(2, "0")}`,
      }));
  }, [clients, checkIns]);
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
    // PII-free navigation: room number goes to sessionStorage, not the URL.
    router.push(checkinHref(roomNumber, clientIndex));
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

  // Show merge banner from upload redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const merged = params.get("merged");
    const skipped = params.get("skipped");
    const total = params.get("total");
    if (merged !== null) {
      setMergeBanner({ added: Number(merged), skipped: Number(skipped), total: Number(total) });
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setMergeBanner(null), 4000);
    }
  }, []);

  useEffect(() => {
    if (query) setActiveFilter(null);
  }, [query]);

  if (loading) {
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto bg-[#FBF8F3] dark:bg-[#12100E] p-3">
        <div className="skeleton h-14 w-full mb-3" />
        <div className="skeleton h-10 w-full mb-3" />
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-20 w-full" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!hasData) {
    router.push("/upload");
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#12100E]">
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
  const displayClients = query ? results : showFiltered ? filteredClients : remaining;
  const filterLabels: Record<string, string> = {
    total: t("search.allClients"),
    entered: t("search.entered"),
    remaining: t("search.remaining"),
    comp: t("search.comp"),
    vip: "VIP",
  };

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-[#FBF8F3] dark:bg-[#12100E]">
      <div className="shrink-0 px-3 pt-3 pb-0">
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

        {mergeBanner && (
          <div className="mb-2 p-2.5 glass-liquid rounded-[12px] flex items-center gap-2 animate-fadeUp">
            <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div className="text-xs text-dark">
              <span className="font-bold">+{mergeBanner.added}</span> {t("upload.newRoomsAdded")}
              {mergeBanner.skipped > 0 && <span className="text-muted"> · {mergeBanner.skipped} {t("upload.duplicatesSkipped")}</span>}
              <span className="text-muted"> · {mergeBanner.total} {t("upload.totalRoomsNow")}</span>
            </div>
          </div>
        )}

        <div className={`flex gap-3 items-stretch ${handSide === "right" ? "flex-row-reverse" : ""}`}>
          <div className="flex-1 min-w-0">
            <MetricsBar
              clients={clients}
              checkIns={checkIns}
              onHistoryToggle={() => setHistoryOpen(true)}
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              hideNav
            />
          </div>
          <div className="hidden lg:block w-[392px] shrink-0">
            <SearchNav
              handSide={handSide}
              onRecents={() => setHistoryOpen(true)}
              onReport={() => router.push("/report")}
              onFlipSide={flipSide}
              onCloseDay={() => { if (confirm("Clôturer la journée ?")) { closeDay(); refresh(); } }}
            />
          </div>
        </div>
      </div>

      {/* Landscape splits into results + keypad; below lg it stays stacked. */}
      <div className={`flex-1 min-h-0 flex flex-col lg:flex-row gap-3 px-3 pb-3 pt-2 ${handSide === "right" ? "lg:flex-row-reverse" : ""}`}>
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <RoomSearchField
            value={query}
            onChange={(v) => setQuery(v)}
            onClear={clear}
            inputRef={queryRef}
          />

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
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
            <div
              key={`${client.roomNumber}-${i}`}
              className="animate-fadeUp"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <SuggestionCard
                client={client}
                checkIns={checkIns}
                onSelect={handleSelectRoom}
                clientIndex={ci >= 0 ? ci : undefined}
              />
            </div>
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
        {/* Upload button — inside scroll area, not overlaying keypad */}
        <div className="flex justify-end py-2">
          <button
            onClick={() => setUploadSheetOpen(true)}
            className="w-11 h-11 rounded-full glass-liquid border border-brand/20 text-brand shadow-sm flex items-center justify-center active:scale-90 transition-all"
            title={t("search.upload")}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </button>
        </div>
      </div>

        </div>

        {/* Right column: the clock while idle, the keypad always, and one
            action slot that never moves. */}
        <div className="w-full lg:w-[392px] shrink-0 flex flex-col gap-2.5 min-h-0">
          <div className="hidden lg:flex flex-col flex-1 min-h-0">
            <ServiceClock expected={expected} />
          </div>
          <NumericKeypad
            onKeyPress={appendKey}
            onBackspace={backspace}
            onToggleMode={() => queryRef.current?.focus()}
          />
          <button
            onClick={() => hit && handleSelectRoom(hit.roomNumber, clients.indexOf(hit))}
            disabled={!hit}
            data-role="search-cta"
            className="shrink-0 min-h-[84px] rounded-[20px] text-white text-[22px] font-black inline-flex items-center justify-center gap-3 transition-transform active:scale-[0.98] disabled:opacity-35"
            style={{ background: "var(--aur-good)", boxShadow: "0 10px 26px -12px rgba(47,111,79,.6)" }}
          >
            {hit ? <>Entrer <b className="tabular-nums">{hit.adults + hit.children}</b></> : "Entrer"}
          </button>
        </div>
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

      {/* Mid-session upload — inline in scrollable area, not overlaying keypad */}

      {/* Upload action sheet */}
      {uploadSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setUploadSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/30 dark:bg-black/60" />
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-5 pb-8 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-dark mb-4">{t("search.upload")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setUploadSheetOpen(false); router.push("/upload?mode=add&action=pdf"); }}
                className="glass-liquid rounded-[14px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <span className="text-2xl">PDF</span>
                <span className="text-xs font-semibold text-dark">{t("action.uploadPdf")}</span>
              </button>
              <button
                onClick={() => { setUploadSheetOpen(false); router.push("/upload?mode=add&action=scanner"); }}
                className="glass-liquid rounded-[14px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span className="text-xs font-semibold text-dark">{t("action.scanner")}</span>
              </button>
              <button
                onClick={() => { setUploadSheetOpen(false); router.push("/upload?mode=add&action=gallery"); }}
                className="glass-liquid rounded-[14px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-semibold text-dark">{t("action.gallery")}</span>
              </button>
              <button
                onClick={() => { setUploadSheetOpen(false); setAddClientOpen(true); }}
                className="glass-liquid rounded-[14px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-xs font-semibold text-dark">{t("action.manual")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
        onUndo={refresh}
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
