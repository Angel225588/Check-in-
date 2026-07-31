"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDailyData } from "@/hooks/useDailyData";
import { useSearch } from "@/hooks/useSearch";
import { useApp } from "@/contexts/AppContext";
import { addClient, mergeVipIntoSession, getSessionHistory, getSettings, saveSettings, closeDay, addCheckIn } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";
import { Check, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useGuestNotes } from "@/hooks/useGuestNotes";
import { Client } from "@/lib/types";
import MetricsBar, { MetricFilter } from "@/components/MetricsBar";
import RoomSearchField from "@/components/RoomSearchField";
import ServiceClock, { ExpectedGuest } from "@/components/ServiceClock";
import SearchNav from "@/components/SearchNav";
import GuestPreviewCard from "@/components/GuestPreviewCard";
import PreviewCarousel, { type Pane } from "@/components/PreviewCarousel";
import { ExpectedPane, RecentsPane, NotesPane, HistoryPane, type RecentEntry, type StayEntry } from "@/components/PreviewPanes";
import SuggestionCard from "@/components/SuggestionCard";
import NumericKeypad from "@/components/NumericKeypad";
import AlphaKeypad from "@/components/AlphaKeypad";
import HistoryPanel from "@/components/HistoryPanel";
import PhotoCapture, { PhotoCaptureHandle } from "@/components/PhotoCapture";
import { getRemainingForRoom, isComp, needsPaymentChoice } from "@/lib/utils";
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
  /** How many of the room are actually walking in. Defaults to everyone still
   *  expected, because that is the common case; the stepper handles the rest
   *  without loading the check-in screen. */
  const [count, setCount] = useState(1);

  useEffect(() => {
    setHandSide(getSettings().handSide === "right" ? "right" : "left");
  }, []);

  const flipSide = () => {
    const next = handSide === "left" ? "right" : "left";
    setHandSide(next);
    saveSettings({ ...getSettings(), handSide: next });
  };

  /** The single unambiguous target, if there is one: an exact room, or the only
   *  guest a name still matches. Drives the CTA — nothing else may commit. */
  const hit = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    if (/^\d+$/.test(q)) return q.length >= 3 ? results.find((c) => c.roomNumber === q) ?? null : null;
    return q.length >= 2 && results.length === 1 ? results[0] : null;
  }, [query, results]);

  const maxCount = hit ? getRemainingForRoom(hit, checkIns) : 0;
  useEffect(() => { setCount(Math.max(1, maxCount)); }, [hit?.roomNumber, maxCount]);

  /** Notes for the one resolved room — one decrypt per resolved guest, not per
   *  row. An alert here is the whole reason the shortcut must not fire. */
  const hitNotes = useGuestNotes(hit?.roomNumber ?? "", hit?.name ?? "", "reception");

  /**
   * Can this be committed from here, or does it need the room's own screen?
   *
   * The shortcut only fires when nothing on the check-in screen would have
   * asked the receptionist a question: no payment to take, no flagged
   * reservation, no alert note, and someone still expected. Everything else
   * opens the screen that shows what needs deciding — a check-in is not worth
   * one tap if the tap skips an allergy.
   */
  const needsScreen =
    !hit ||
    maxCount === 0 ||
    !hitNotes.ready ||
    needsPaymentChoice(hit) ||
    hit.pendingPaymentAction === "alert" ||
    hitNotes.notes.some((n) => n.tone === "alert");

  const [flash, setFlash] = useState<{ room: string; n: number } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  /** Commit from the search screen, honestly: a check-in that did not persist
   *  must say so rather than flash green. */
  const commitHere = () => {
    if (!hit) return;
    const ok = addCheckIn({
      id: uuidv4(),
      roomNumber: hit.roomNumber,
      clientName: hit.name,
      peopleEntered: count,
      timestamp: new Date().toISOString(),
      ...(hit.pendingPaymentAction ? { paymentAction: hit.pendingPaymentAction } : {}),
    });
    if (!ok) { setSaveFailed(true); return; }
    setSaveFailed(false);
    setFlash({ room: hit.roomNumber, n: count });
    clear();
    refresh();
    setTimeout(() => setFlash(null), 2200);
  };

  /** The last people through the door — the "did I already do 224?" check. */
  const recents = useMemo<RecentEntry[]>(() => {
    return [...checkIns]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      // The pane scrolls, so this is not "the last three" any more — it is the
      // whole service, newest first, for the "did I already do 224?" question.
      .slice(0, 40)
      .map((c) => ({
        roomNumber: c.roomNumber,
        name: c.clientName,
        pax: c.peopleEntered,
        at: new Date(c.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      }));
  }, [checkIns]);

  /** Prior stays per guest, for the preview's first-visit / regular badge. */
  const visitCounts = useMemo(() => {
    const m = new Map<string, number>();
    const today = new Date().toISOString().split("T")[0];
    for (const s of getSessionHistory()) {
      if (s.date === today) continue;
      for (const c of s.clients) {
        const k = c.name.trim().toUpperCase();
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return m;
  }, []);
  const visitsFor = (name: string) => visitCounts.get(name.trim().toUpperCase()) ?? 0;

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

  const handleSelectRoom = (roomNumber: string, clientIndex?: number, people?: number) => {
    // PII-free navigation: room number goes to sessionStorage, not the URL.
    // The arrival count rides along, so the stepper you just set is the number
    // waiting on the check-in screen rather than a figure you set twice.
    router.push(checkinHref(roomNumber, clientIndex, people));
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

  /* ── The preview slot's faces ──────────────────────────────────────────
     Idle rotates on its own; a resolved room never does. Both are reachable
     by swipe or by tapping a dot — see PreviewCarousel. */
  const idlePanes: Pane[] = [
    { key: "clock", label: "Heure", node: <ServiceClock /> },
    { key: "expected", label: "Attendus bientôt", node: <ExpectedPane expected={expected} /> },
    { key: "recents", label: "Récents", node: <RecentsPane recents={recents} /> },
  ];

  const hitStays: StayEntry[] = hit
    ? getSessionHistory()
        .filter((sess) => sess.date !== new Date().toISOString().split("T")[0])
        .flatMap((sess) =>
          sess.clients
            .filter((c) => c.name.trim().toUpperCase() === hit.name.trim().toUpperCase())
            .slice(0, 1)
            .map((c) => ({ date: sess.date, roomNumber: c.roomNumber, pax: c.adults + c.children }))
        )
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const hitToday: RecentEntry[] = hit
    ? checkIns
        .filter((c) => c.roomNumber === hit.roomNumber)
        .map((c) => ({
          roomNumber: c.roomNumber,
          name: c.clientName,
          pax: c.peopleEntered,
          at: new Date(c.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        }))
    : [];

  const hitPanes: Pane[] = hit
    ? [
        {
          key: "apercu",
          label: "Aperçu",
          node: <GuestPreviewCard client={hit} visits={visitsFor(hit.name)} notes={hitNotes.notes} />,
        },
        { key: "notes", label: "Notes", node: <NotesPane notes={hitNotes.notes} ready={hitNotes.ready} /> },
        { key: "historique", label: "Historique", node: <HistoryPane stays={hitStays} today={hitToday} /> },
      ]
    : [];

  const showFiltered = activeFilter && !query;
  const displayClients = query ? results : showFiltered ? filteredClients : [];
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
            {/* brand-ink, not brand: #A66914 on the cream page measures 4.36:1,
                just under AA. The ink variant is the same hue, one step deeper. */}
            <span className="text-sm font-medium" style={{ color: "var(--brand-ink)" }}>{t("search.upload")}</span>
          </button>

          <div className="flex flex-col items-end">
            <span className="text-sm md:text-base font-bold tracking-[0.08em] leading-tight" style={{ fontFamily: "'Nunito', sans-serif", color: "var(--brand-ink)" }}>
              COURTYARD
            </span>
            <span className="text-[10px] md:text-xs text-muted leading-tight">
              by <span className="font-bold tracking-[0.05em] text-slate">MARRIOTT</span>
            </span>
          </div>
        </div>

        {mergeBanner && (
          <div className="mb-2 p-2 glass-liquid rounded-[12px] flex items-center gap-2 animate-fadeUp">
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
      <div className={`flex-1 min-h-0 flex flex-col lg:flex-row gap-3 px-3 pb-3 pt-3 ${handSide === "right" ? "lg:flex-row-reverse" : ""}`}>
        <div className="flex-1 min-w-0 flex flex-col gap-3">
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

        {/* Right column, top to bottom: what you are looking at, what you are
            about to do, and the keys you do it with.

            The commit row used to sit under the keypad. On a 13" screen that put
            it at the far bottom edge — the longest reach on the screen, and the
            furthest point from both the number just read and the keys just
            pressed. Directly under the preview it is next to the thing being
            confirmed and a short move from the pad. Its position never changes
            between states, so the hand can learn it. */}
        <div className="w-full lg:w-[392px] shrink-0 flex flex-col gap-3 min-h-0">
          {/* Capped, not greedy: with flex-1 the preview swallowed every spare
              pixel and then centred its content, manufacturing a band of air
              above the keypad. Spare height goes to the keys instead. */}
          <div className="hidden lg:flex flex-col shrink-0 h-[clamp(124px,24vh,252px)]">
            {hit ? (
              <PreviewCarousel panes={hitPanes} auto={false} resetKey={hit.roomNumber} />
            ) : flash ? (
              /* Confirmation lands in the box the eye is already on, and the
                 field is already cleared for the next guest. */
              <div
                data-role="checkin-flash"
                className="relative flex-1 min-h-[150px] rounded-[24px] px-5 flex flex-col justify-center gap-1 text-white animate-[cardIn_.3s_cubic-bezier(.2,.9,.25,1)]"
                style={{ background: "linear-gradient(150deg,#357D58,#255B41)", boxShadow: "0 16px 44px -14px rgba(30,80,55,.55)" }}
              >
                <span className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] opacity-90">
                  <Check weight="bold" size={15} /> Enregistré
                </span>
                <span className="text-[clamp(40px,5vw,68px)] font-black leading-[0.9] tracking-[-0.045em] tabular-nums">
                  {flash.room}
                </span>
                <span className="text-[17px] font-bold">{flash.n} pers. entrées</span>
              </div>
            ) : (
              <PreviewCarousel panes={idlePanes} auto resetKey="idle" />
            )}
          </div>

          {saveFailed && (
            <div
              data-role="checkin-save-error"
              className="shrink-0 flex items-start gap-2 rounded-[16px] px-4 py-3"
              style={{ background: "var(--aur-bad-soft)", boxShadow: "inset 0 0 0 1.5px var(--aur-bad)" }}
            >
              <WarningCircle weight="duotone" size={19} color="var(--aur-bad-ink)" className="shrink-0 mt-0.5" />
              <div className="text-[13px] font-bold leading-snug" style={{ color: "var(--aur-bad-ink)" }}>
                NON enregistré — stockage plein. Ouvrez la fiche et réessayez.
                <button onClick={() => setSaveFailed(false)} className="underline ml-1 font-black">Fermer</button>
              </div>
            </div>
          )}
          {/* − N + so a partial arrival is one tap away instead of a screen
              away. The middle commits; the sides only change the number. */}
          <div className="shrink-0 flex gap-2" data-role="search-cta">
            <button
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              disabled={!hit || count <= 1}
              aria-label="Une personne de moins"
              className="w-[84px] min-h-[clamp(64px,9vh,84px)] rounded-[20px] text-[34px] font-black grid place-items-center glass-liquid active:scale-[0.96] transition-transform disabled:opacity-30"
            >
              −
            </button>
            {/* Two actions, told apart by colour as well as words. Green
                commits here and clears for the next guest; gold opens the room,
                because something on that screen needs a decision — a payment to
                take, a flagged reservation, an allergy. A room with nobody
                outstanding also opens rather than offering "Entrer 1", which a
                mis-tap would turn into a phantom guest. */}
            <button
              onClick={() =>
                needsScreen
                  ? hit && handleSelectRoom(hit.roomNumber, clients.indexOf(hit), maxCount > 0 ? count : undefined)
                  : commitHere()
              }
              disabled={!hit}
              data-role="search-enter"
              data-mode={!hit ? "idle" : needsScreen ? "open" : "commit"}
              className="flex-1 min-h-[clamp(64px,9vh,84px)] rounded-[20px] text-white text-[22px] font-black inline-flex items-center justify-center gap-3 transition-transform active:scale-[0.98] disabled:opacity-35"
              /* Idle keeps the resting green: gold means "this one needs you",
                 and an empty field needs nothing. */
              style={hit && needsScreen
                ? { background: "linear-gradient(135deg,#A66914,#8A5010)", boxShadow: "0 10px 26px -12px rgba(120,74,12,.6)" }
                : { background: "var(--aur-good)", boxShadow: "0 10px 26px -12px rgba(47,111,79,.6)" }}
            >
              {!hit ? (
                "Entrer"
              ) : maxCount === 0 ? (
                "Ouvrir la fiche"
              ) : needsScreen ? (
                <>Vérifier <b className="text-[30px] tabular-nums">{count}</b></>
              ) : (
                <><Check weight="bold" size={24} /> Entrer <b className="text-[30px] tabular-nums">{count}</b></>
              )}
            </button>
            <button
              onClick={() => setCount((c) => Math.min(Math.max(1, maxCount), c + 1))}
              disabled={!hit || count >= maxCount}
              aria-label="Une personne de plus"
              className="w-[84px] min-h-[clamp(64px,9vh,84px)] rounded-[20px] text-[34px] font-black grid place-items-center glass-liquid active:scale-[0.96] transition-transform disabled:opacity-30"
            >
              +
            </button>
          </div>

          {/* The pad takes whatever height is left, so the keys grow on a big
              screen instead of the layout growing a gap. */}
          <div className="flex-1 min-h-[196px]">
            <NumericKeypad
              onKeyPress={appendKey}
              onBackspace={backspace}
              onToggleMode={() => queryRef.current?.focus()}
            />
          </div>
        </div>
      </div>

      {/* Hidden VIP PhotoCapture */}
      <div className="hidden">
        <PhotoCapture ref={vipCaptureRef} onProcessed={handleVipProcessed} apiEndpoint="/api/ocr-unified" />
      </div>

      {/* VIP merged success toast */}
      {vipMergedMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg shadow-green-500/30 animate-[slideDown_0.2s_ease-out]">
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
                  className="w-full mt-1 px-3 py-2 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                  className="w-full mt-1 px-3 py-2 rounded-xl glass-liquid text-dark text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                  className="w-full mt-1 px-3 py-2 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                  className="w-full mt-1 px-3 py-2 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
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
