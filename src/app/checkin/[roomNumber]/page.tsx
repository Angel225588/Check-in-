"use client";
import { useState, useEffect, useMemo, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  Clock,
  X,
  House,
  CreditCard,
  Money,
  UserGear,
  AirplaneLanding,
  AirplaneTakeoff,
  Coffee,
  Prohibit,
  Star,
  ArrowsLeftRight,
  NotePencil,
} from "@phosphor-icons/react/dist/ssr";
import { Client, CheckInRecord } from "@/lib/types";
import {
  getTodayData,
  addCheckIn,
  updateClient,
  getSessionHistory,
  getSettings,
  saveSettings,
} from "@/lib/storage";
import { getRemainingForRoom, isComp, needsPaymentChoice } from "@/lib/utils";
import { stayFormule } from "@/lib/stay-formule";
import { arrivalPattern, hhmmOf } from "@/lib/arrival-pattern";
import { arrivalMinutesByGuest, guestKey } from "@/lib/expected-soon";
import { sidebarDocked, sidebarShows } from "@/lib/guest-sidebar";
import { FORMULE_LABEL, type Formule } from "@/lib/report-v2";
import { readSelection, checkinHref } from "@/lib/checkin-nav";
import { takeOrigin, peekOrigin } from "@/lib/back-nav";
import { useApp } from "@/contexts/AppContext";
import PeopleCounter from "@/components/PeopleCounter";
import ClientHistory from "@/components/ClientHistory";
import RoomEventBadges from "@/components/RoomEventBadges";
import NotesModal from "@/components/NotesModal";
import NotesPanel, { type NotesExpandRequest } from "@/components/NotesPanel";
import PinnedNoteChips from "@/components/PinnedNoteChips";
import SideNotesDigest from "@/components/SideNotesDigest";
import { useGuestNotes } from "@/hooks/useGuestNotes";
import { getRoomEvents, RoomEvent } from "@/lib/room-events";

function normalizeNameForId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join("");
}

// Payment methods shown when breakfast is not covered. Drops "Points" from the
// legacy set — reception asks room-charge / card / cash / supervisor.
const PAY_METHODS = [
  { key: "room", label: "Chambre", Icon: House },
  { key: "card", label: "Carte", Icon: CreditCard },
  { key: "cash", label: "Cash", Icon: Money },
  { key: "supervisor", label: "Supervisor", Icon: UserGear },
];

export default function CheckInPage({
  params,
}: {
  params: Promise<{ roomNumber: string }>;
}) {
  // The dynamic segment is an OPAQUE TOKEN, not the room number — keeping the
  // room out of the URL keeps it out of Vercel access logs. The real selection
  // is carried in sessionStorage (see lib/checkin-nav). We still fall back to
  // treating the segment as a literal room number for legacy/deep-link URLs.
  const { roomNumber: routeToken } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useApp();
  const [client, setClient] = useState<Client | null>(null);
  const [clientIndex, setClientIndex] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [count, setCount] = useState(1);
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  const [checkInError, setCheckInError] = useState(false);
  const [paymentAction, setPaymentAction] = useState<string | null>("room");
  const [editingRoom, setEditingRoom] = useState(false);
  const [editRoom, setEditRoom] = useState("");
  const [editingPeople, setEditingPeople] = useState(false);
  const [editAdults, setEditAdults] = useState("");
  const [editChildren, setEditChildren] = useState("");
  const [todayCheckIns, setTodayCheckIns] = useState<CheckInRecord[]>([]);
  const [roomEvents, setRoomEvents] = useState<RoomEvent[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false); // drawer on small screens
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // manual hide on tablet
  const [sideTab, setSideTab] = useState<"all" | "visites" | "notes">("all");
  // Bumping this starts a note from wherever you are. Writing one used to mean
  // finding the notes tab first and then the button under the list.
  const [composeSignal, setComposeSignal] = useState(0);
  // Notes open in the activity column first — a list you can scan — and only
  // move to the centred panel when you ask for the room, via ⤢. Landing in a
  // composer assumes you came to write; usually you came to check.
  const [notesCentre, setNotesCentre] = useState<NotesExpandRequest | null>(null);
  // Which edge the activity panel and its controls live on. Persisted, because
  // a left-hander should set this once and never think about it again.
  const [handSide, setHandSide] = useState<"left" | "right">("left");
  /** Where back goes, and what it is called. Read on mount so the label is
   *  right before anyone taps it. */
  const [cameFrom, setCameFrom] = useState<"search" | "report">("search");

  useEffect(() => {
    const st = getSettings();
    setHandSide(st.handSide === "right" ? "right" : "left");
    setCameFrom(peekOrigin());
  }, []);

  const flipHandSide = () => {
    const next = handSide === "left" ? "right" : "left";
    setHandSide(next);
    saveSettings({ ...getSettings(), handSide: next });
  };

  useEffect(() => {
    const data = getTodayData();
    if (!data) { router.push("/search"); return; }

    const sel = readSelection(routeToken);
    const roomNumber = sel?.roomNumber ?? routeToken;
    const selCi = sel?.ci;

    const ciFromUrl = searchParams.get("ci");
    const ciStr = selCi !== undefined ? String(selCi) : ciFromUrl;
    let found: Client | undefined;
    if (ciStr !== null) {
      const idx = parseInt(ciStr, 10);
      if (!isNaN(idx) && data.clients[idx]?.roomNumber === roomNumber) {
        found = data.clients[idx];
      }
    }
    if (!found) {
      found = data.clients.find((c) => c.roomNumber === roomNumber);
    }
    if (!found) { router.push("/search"); return; }

    const foundIndex = ciStr !== null ? parseInt(ciStr, 10) : data.clients.indexOf(found);
    setClientIndex(foundIndex >= 0 ? foundIndex : null);
    setClient(found);
    const rem = getRemainingForRoom(found, data.checkIns);
    setRemaining(rem);
    // The search screen may already have asked how many are walking in; honour
    // it, bounded by what the room still expects. Otherwise default to all.
    const asked = sel?.count;
    setCount(asked ? Math.min(Math.max(1, rem), asked) : Math.max(1, rem));

    setRoomEvents(getRoomEvents(roomNumber));

    if (found.pendingPaymentAction) {
      setPaymentAction(found.pendingPaymentAction);
    }

    const normName = found.name.trim().toLowerCase().replace(/\s+/g, " ");
    setTodayCheckIns(
      data.checkIns.filter(
        (ci) =>
          ci.roomNumber === found.roomNumber &&
          ci.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
      )
    );
  }, [routeToken, router, searchParams]);

  const guestId = useMemo(
    () => (client ? normalizeNameForId(client.name) : ""),
    [client]
  );

  /** Past stays for this guest, matched by normalized name (survives room changes).
   *
   *  Each carries how that morning was actually covered. The answer was always
   *  stored — reception's choice at the door is saved on the check-in — and had
   *  simply never been read back, so every row said "1 pers · ch. 718" and
   *  nothing about whether it went on the room, on a card, or was given away.
   *  That is the question asked at the door: a guest charged to the room three
   *  mornings running should not be asked a fourth time. */
  const pastStays = useMemo(() => {
    if (!guestId) return [];
    const sessions = getSessionHistory();
    const todayIso = new Date().toISOString().split("T")[0];
    const visits: Array<{
      date: string; roomNumber: string; pax: number; vipLevel?: string; formule: Formule | null;
    }> = [];
    for (const s of sessions) {
      if (s.date === todayIso) continue;
      for (const c of s.clients) {
        if (normalizeNameForId(c.name) !== guestId) continue;
        visits.push({
          date: s.date, roomNumber: c.roomNumber, pax: c.adults + c.children, vipLevel: c.vipLevel,
          formule: stayFormule(c, s.checkIns ?? []),
        });
        break;
      }
    }
    return visits.sort((a, b) => b.date.localeCompare(a.date));
  }, [guestId]);

  /**
   * When this guest tends to come down, from the mornings we recorded.
   *
   * MEASURED, so it says how many mornings it stands on and it says nothing at
   * all below three. A guest with no habit gets "varie" rather than a minute
   * picked out of a two-hour spread and presented as a pattern.
   */
  const arrival = useMemo(() => {
    if (!client) return null;
    // The same collection the "Attendus bientôt" pane reads. The two screens
    // used to each walk the history their own way and printed different hours
    // for the same guest — 07:15 on the pane, 09:40 here.
    const todayIso = new Date().toISOString().split("T")[0];
    const mins = arrivalMinutesByGuest(getSessionHistory(), todayIso).get(guestKey(client.name));
    return arrivalPattern(mins ?? []);
  }, [client]);

  /** What reception has done most often for this guest. Two mornings is not a
   *  habit; three is worth putting at the top of the list. */
  const usualFormule = useMemo(() => {
    const counts = new Map<Formule, number>();
    for (const v of pastStays) if (v.formule) counts.set(v.formule, (counts.get(v.formule) ?? 0) + 1);
    let best: Formule | null = null, n = 0;
    for (const [f, c] of counts) if (c > n) { best = f; n = c; }
    return n >= 3 ? { formule: best!, times: n } : null;
  }, [pastStays]);

  // Called unconditionally (hook rules); it simply resolves to an empty list
  // until the guest is loaded.
  const notesApi = useGuestNotes(client?.roomNumber ?? "", client?.name ?? "", "Réception");

  if (!client) {
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto bg-background dark:bg-ink p-4 pt-3 screen-safe">
        <div className="skeleton h-8 w-24 mb-4" />
        <div className="skeleton h-14 w-40 mb-2" />
        <div className="skeleton h-6 w-56 mb-6" />
        <div className="skeleton h-3 w-full mb-6" />
        <div className="skeleton h-24 w-full mb-4" />
        <div className="skeleton h-16 w-full" />
      </div>
    );
  }

  const handleSaveRoom = () => {
    if (!editRoom.trim() || clientIndex === null) return;
    updateClient(clientIndex, { roomNumber: editRoom.trim() });
    setClient({ ...client, roomNumber: editRoom.trim() });
    setEditingRoom(false);
    router.replace(checkinHref(editRoom.trim(), clientIndex));
  };

  const handleSavePeople = () => {
    if (clientIndex === null) return;
    const newAdults = Math.max(0, parseInt(editAdults, 10) || 0);
    const newChildren = Math.max(0, parseInt(editChildren, 10) || 0);
    updateClient(clientIndex, { adults: newAdults, children: newChildren });
    const updated = { ...client, adults: newAdults, children: newChildren };
    setClient(updated);
    const data = getTodayData();
    if (data) {
      const rem = getRemainingForRoom(updated, data.checkIns);
      setRemaining(rem);
      setCount(Math.max(1, rem));
    }
    setEditingPeople(false);
  };

  const total = client.adults + client.children;
  const comp = isComp(client);
  const allDone = remaining === 0;
  const isVip = !!client.isVip;
  const needsPay = needsPaymentChoice(client);
  const isFirstVisit = pastStays.length === 0; // R2/R5: a new guest has no past stays
  // Dock the sidebar on tablet ONLY when there's something worth showing; an
  // empty column just wastes horizontal space, so collapse it. Notes count, and
  // so does a check-in made this morning — that one was missing, so a
  // first-time guest who had already come down got a shut panel.
  const dockSidebar = sidebarDocked({
    pastStays: pastStays.length,
    notes: notesApi.notes.length,
    todayEntries: todayCheckIns.length,
  });
  const shows = sidebarShows({
    tab: sideTab,
    pastStays: pastStays.length,
    todayEntries: todayCheckIns.length,
  });
  const hasAlertNote = notesApi.notes.some((n) => n.tone === "alert");

  /** One tap from anywhere on the card straight into the notes list. */
  const openNotes = () => {
    setSideTab("notes");
    setSidebarOpen(true);
  };
  const showDock = dockSidebar && !sidebarCollapsed; // docked on tablet unless manually hidden

  const handleCheckIn = () => {
    if (count <= 0 || allDone || checkInSuccess) return;
    const record: CheckInRecord = {
      id: uuidv4(),
      roomNumber: client.roomNumber,
      clientName: client.name,
      peopleEntered: count,
      timestamp: new Date().toISOString(),
      ...(paymentAction ? { paymentAction } : {}),
    };
    // Only celebrate if the check-in was ACTUALLY persisted (honest save).
    const saved = addCheckIn(record);
    if (!saved) { setCheckInError(true); return; }
    setCheckInError(false);
    setCheckInSuccess(true);
    // 350ms, not 800. During a rush this animation is paid a hundred times,
    // and the confirmation only has to register — it does not have to be
    // watched. The failure path deliberately does NOT auto-dismiss: a
    // check-in that failed and then vanished is the silent loss we already
    // fixed once.
    setTimeout(() => router.push("/search"), 350);
  };

  const refreshAfterUndo = () => {
    const data = getTodayData();
    if (data && client) {
      const rem = getRemainingForRoom(client, data.checkIns);
      setRemaining(rem);
      setCount(Math.max(1, rem));
      const normName = client.name.trim().toLowerCase().replace(/\s+/g, " ");
      setTodayCheckIns(
        data.checkIns.filter(
          (ci) =>
            ci.roomNumber === client.roomNumber &&
            ci.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
        )
      );
    }
  };

  const cardVipStyle = isVip
    ? { background: "linear-gradient(135deg,#96590F,#B57619 48%,#8A5010)", boxShadow: "0 16px 44px -14px rgba(120,74,12,.55)" }
    : undefined;
  const onGold = isVip ? "text-white" : "text-dark";

  return (
    // `flex-row-reverse` mirrors the whole layout when the panel is set to the
    // right, so the docked column and every control follow the working hand.
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-background dark:bg-ink screen-safe">
      {/* ===== SUCCESS overlay ===== */}
      {checkInSuccess && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-green-500/20 dark:bg-green-500/10 backdrop-blur-sm animate-[fadeIn_0.09s_ease-out] pointer-events-none screen-safe">
          <div className="flex flex-col items-center gap-3 animate-[popIn_0.18s_cubic-bezier(0.175,0.885,0.32,1.4)]">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-2xl shadow-green-500/40">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm font-bold text-green-700 dark:text-green-300 bg-green-500/10 px-4 py-1.5 rounded-full">{t("checkin.confirmed")}</span>
          </div>
        </div>
      )}

      {/* ===== SAVE-FAILURE overlay ===== */}
      {checkInError && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out] p-6 screen-safe">
          <div className="w-full max-w-sm bg-background dark:bg-surface-dark rounded-xl p-6 shadow-2xl text-center animate-[popIn_0.25s_cubic-bezier(0.175,0.885,0.32,1.4)]">
            <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/40">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <div className="text-lg font-black text-red-600 dark:text-red-400 mb-2 uppercase tracking-wide">{t("checkin.saveFailed")}</div>
            <p className="text-sm text-dark/80 leading-relaxed mb-5">{t("checkin.saveFailedDesc")}</p>
            <button onClick={() => { setCheckInError(false); handleCheckIn(); }} className="w-full bg-brand text-white py-3 rounded-full text-base font-bold active:scale-[0.97] transition-all mb-2">{t("checkin.retry")}</button>
            <button onClick={() => setCheckInError(false)} className="w-full py-2 rounded-full glass-liquid text-muted font-semibold text-sm">{t("checkin.cancel")}</button>
          </div>
        </div>
      )}

      {/* The screen's own top bar, above both columns. Back lived inside the
          main column, so opening the activity rail pushed it 300px to the
          right — the one control that has to be in the same place every time
          was the one moving most. */}
      <div className="shrink-0 flex items-center gap-2 px-3 pt-3 pb-2 min-h-[68px]">

            <button
              onClick={() => router.push(takeOrigin())}
              data-role="back"
              data-origin={cameFrom}
              className="shrink-0 flex items-center gap-1.5 px-4 min-h-[44px] glass-liquid rounded-full active:scale-[0.96] transition-all"
            >
              <svg className="w-4 h-4" style={{ color: "var(--brand-ink)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
              <span className="text-sm font-medium" style={{ color: "var(--brand-ink)" }}>{cameFrom === "report" ? "Rapport" : t("checkin.search")}</span>
            </button>

            <div className={`flex-1 min-w-0 flex items-center gap-2 ${handSide === "right" ? "flex-row-reverse" : ""}`}>
              <button
                onClick={() => { setSidebarCollapsed(false); setSidebarOpen(true); }}
                data-role="activity-toggle"
                aria-label="Ouvrir l'activité et les notes"
                className={`${showDock ? "md:hidden" : ""} flex items-center gap-1.5 px-4 min-h-[44px] glass-liquid rounded-full active:scale-[0.96] relative`}
              >
                <Clock weight="duotone" size={16} className="text-brand" />
                {pastStays.length > 0 && <span className="text-xs font-black text-brand tabular-nums">{pastStays.length}</span>}
                {/* A guest can have an allergy on their very first visit. */}
                {hasAlertNote && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background dark:border-ink" style={{ background: "var(--aur-bad)" }} />
                )}
              </button>

              {/* A plain spacer, not `ml-auto` — auto margins resolve against
                  the main axis, so they flip meaning under `flex-row-reverse`. */}
              <div className="flex-1" />

              <button
                onClick={flipHandSide}
                data-role="hand-toggle"
                aria-label={handSide === "left" ? "Passer les commandes à droite" : "Passer les commandes à gauche"}
                title={handSide === "left" ? "Commandes à droite (droitier)" : "Commandes à gauche (gaucher)"}
                className="flex items-center gap-1.5 px-3 min-h-[44px] glass-liquid rounded-full active:scale-[0.96] transition-all"
              >
                <ArrowsLeftRight weight="bold" size={15} style={{ color: "var(--brand-ink)" }} />
                <span className="text-xs font-extrabold" style={{ color: "var(--brand-ink)" }}>
                  {handSide === "left" ? "Gauche" : "Droite"}
                </span>
              </button>
            </div>
      </div>

      <div className={`flex-1 min-h-0 flex ${handSide === "right" ? "flex-row-reverse" : ""}`}>
      {/* ===== ACTIVITY SIDEBAR (left) — docked from md up whenever there is
           history to show; a first-visit guest has nothing to display, so it
           auto-collapses to a drawer and the card gets the full width. ===== */}
      {sidebarOpen && (
        <div className={`fixed inset-0 z-30 bg-black/45 backdrop-blur-sm ${showDock ? "md:hidden" : ""}`} onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={`fixed bottom-0 top-[68px] ${handSide === "right" ? "right-0" : "left-0"} z-40 w-[300px] lg:w-[398px] max-w-[92vw] shrink-0 pb-3 px-3 transition-[transform,width] duration-200 ${showDock ? "md:static md:translate-x-0" : ""} ${sidebarOpen ? "translate-x-0" : handSide === "right" ? "translate-x-full" : "-translate-x-full"}`}
      >
        {/* An opaque surface, not glass. As a drawer this sits over the gold
            guest card, and a translucent panel turned note titles into
            something you squint at. */}
        <div
          className="h-full rounded-xl p-4 flex flex-col gap-3 overflow-hidden"
          style={{ background: "var(--aur-bg-elev)", boxShadow: "0 24px 60px -24px rgba(20,12,0,.55), inset 0 0 0 1px var(--aur-hairline)" }}
        >
          <div className="flex items-center justify-between">
            <b className="text-base text-dark flex items-center gap-1.5"><Clock weight="duotone" size={17} /> Activité</b>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setSideTab("notes"); setComposeSignal((n) => n + 1); }}
                data-role="side-compose"
                aria-label="Écrire une note"
                title="Écrire une note"
                className="w-11 h-11 rounded-full grid place-items-center glass-liquid active:scale-[0.94] transition-transform"
              >
                <NotePencil size={17} weight="duotone" style={{ color: "var(--brand-ink)" }} />
              </button>
              <button onClick={() => { setSidebarOpen(false); setSidebarCollapsed(true); }} className="w-11 h-11 rounded-full grid place-items-center glass-liquid" aria-label="Masquer l'activité"><X size={15} /></button>
            </div>
          </div>

          {/* The tab row renders for EVERY guest. It used to be gated on
              `!isFirstVisit`, which meant a first-time guest had no route to
              their own notes — so a severe allergy recorded at booking was
              unreachable from the one screen that decides whether they eat. */}
          <div className="flex gap-1.5 bg-black/[0.05] dark:bg-white/[0.06] rounded-full p-1">
            {(["all", "visites", "notes"] as const).map((tb) => (
              <button key={tb} onClick={() => setSideTab(tb)}
                aria-pressed={sideTab === tb}
                data-role={`side-tab-${tb}`}
                className="flex-1 min-h-[44px] rounded-full text-xs font-extrabold capitalize transition-all relative"
                // The selected pill keeps a light background in dark mode, so its
                // label must stay dark. `text-dark` can't be used: globals.css has
                // `.dark .text-dark { color:#F0F0F5 !important }`, which would win
                // over any dark: variant and render white-on-white.
                style={sideTab === tb
                  ? { background: "#FFFFFF", color: "#1C1C1C", boxShadow: "var(--shadow-warm-1)" }
                  // Unselected labels sit on a near-background tint; the default
                  // muted grey only reached 4.24:1 there, under the 4.5 minimum
                  // for this size. These warm tones clear it in both schemes.
                  : { color: "var(--tab-idle, #5C564C)" }}>
                {tb === "all" ? "Tout" : tb === "visites" ? "Visites" : "Notes"}
                {tb === "notes" && hasAlertNote && (
                  <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full" style={{ background: "var(--aur-bad)" }} />
                )}
              </button>
            ))}
          </div>

          {/* Notes come before the first-visit branch on purpose: a first-time
              guest is exactly the one whose allergy is easiest to lose. */}
          {sideTab === "notes" ? (
            <div className="flex-1 min-h-0 -mx-1 px-1">
              <NotesPanel api={notesApi} onExpand={setNotesCentre} composeSignal={composeSignal} />
            </div>
          ) : (
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-2">
            {/* One panel, one order, whether or not this guest has been here
                before. It used to fork into two branches and only one of them
                drew today — so a first-time guest who had already come down was
                told "Aucune visite précédente" over their own check-in, with no
                undo anywhere on the screen. See src/lib/guest-sidebar.ts. */}
            <>
                {shows.firstVisitBadge && (
                  /* Dark ink on the gold, not white: white on #DD9C28 measures
                     2.37:1, which is unreadable at this size. */
                  <span className="self-start inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-black text-xs shadow-[0_6px_16px_-6px] shadow-brand/60"
                    style={{ background: "linear-gradient(135deg,#E9B44C,#C08A3A)", color: "#241F19" }}><Star weight="fill" size={13} /> Première visite</span>
                )}
                {shows.todayActivity && (
                  <ClientHistory roomNumber={client.roomNumber} clientName={client.name} todayCheckIns={todayCheckIns} onUndo={refreshAfterUndo} />
                )}
                {shows.notesDigest && (
                  <SideNotesDigest notes={notesApi.notes} onOpen={() => setSideTab("notes")} />
                )}
                {shows.emptyState && (
                  <div className="text-sm text-muted text-center py-6">Aucune visite précédente</div>
                )}
                {/* The habit, before the list of it. "Chambre · 4 fois" is the
                    sentence reception would otherwise assemble by reading six
                    rows, and it is the one that decides what to ask. */}
                {arrival && (
                  <div
                    data-role="arrival-pattern"
                    className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md"
                    style={{ background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
                  >
                    <Clock size={14} weight="duotone" style={{ color: "var(--tab-idle)" }} />
                    <b className="text-sm font-black" style={{ color: "var(--aur-ink-2)" }}>
                      {arrival.steady
                        ? `Descend vers ${hhmmOf(arrival.typical)}`
                        : `Descend entre ${hhmmOf(arrival.band[0])} et ${hhmmOf(arrival.band[1])}`}
                    </b>
                    {/* The basis, always. A measured number without it is a
                        guess wearing a uniform. */}
                    <span className="text-xs font-bold tabular-nums ml-auto" style={{ color: "var(--tab-idle)" }}>
                      {arrival.days} matins
                    </span>
                  </div>
                )}
                {usualFormule && (
                  <div
                    data-role="usual-formule"
                    className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md"
                    style={{ background: "var(--aur-gold-soft)", boxShadow: "inset 0 0 0 1px var(--aur-gold)" }}
                  >
                    <span className="text-micro font-black uppercase tracking-[0.1em]" style={{ color: "var(--tab-idle)" }}>
                      D&apos;habitude
                    </span>
                    <b className="text-sm font-black" style={{ color: "var(--brand-ink)" }}>
                      {FORMULE_LABEL[usualFormule.formule]}
                    </b>
                    <span className="text-xs font-bold tabular-nums" style={{ color: "var(--tab-idle)" }}>
                      · {usualFormule.times} fois
                    </span>
                  </div>
                )}
                {shows.pastStays && (
                  <div className="text-micro uppercase tracking-wide text-muted mt-1">Séjours précédents</div>
                )}
                {pastStays.map((v, i) => (
                  <div key={`${v.date}-${i}`} className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-black/[0.03] dark:bg-white/[0.04]">
                    <span className="leading-tight">
                      <span className="block text-sm font-extrabold text-dark tabular-nums">
                        {new Date(v.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                      </span>
                      <span className="block text-micro first-letter:uppercase" style={{ color: "var(--tab-idle)" }}>
                        {new Date(v.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" })}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-right" style={{ color: "var(--tab-idle)" }}>
                        {v.pax} pers · ch. {v.roomNumber}{v.vipLevel ? ` · ${v.vipLevel}` : ""}
                      </span>
                      {/* Null means they did not come down. Saying "à encaisser"
                          there would invent a refusal out of an absence. */}
                      <span
                        data-role="stay-formule"
                        data-formule={v.formule ?? "absent"}
                        className="shrink-0 text-micro font-black px-2 py-1 rounded-full whitespace-nowrap"
                        style={v.formule
                          ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)" }
                          : { background: "rgba(128,128,128,.12)", color: "var(--tab-idle)" }}
                      >
                        {v.formule ? FORMULE_LABEL[v.formule] : "Pas descendu"}
                      </span>
                    </span>
                  </div>
                ))}
            </>
          </div>
          )}
        </div>
      </aside>

      <NotesModal
        open={!!notesCentre}
        onClose={() => setNotesCentre(null)}
        initialView={notesCentre?.view ?? "list"}
        initialNoteId={notesCentre?.noteId ?? null}
        initialDraft={notesCentre?.draft ?? null}
        api={notesApi}
        roomNumber={client.roomNumber}
        guestName={client.name}
        visits={pastStays.length}
        pax={total}
      />

      {/* ===== MAIN ===== */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-3 md:px-4 pt-3 flex flex-col gap-3">
          {/* IDENTITY CARD — gold when VIP */}
          <div className={`rounded-xl px-5 py-5 relative ${isVip ? "" : "glass-liquid border border-black/[0.06] dark:border-white/[0.10]"}`} style={cardVipStyle}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                {isVip && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 border border-white/30 px-3 py-1 font-black text-sm text-white mb-2">
                    <Star weight="fill" size={13} /> {client.vipLevel || "VIP"}
                  </span>
                )}
                <div className="flex items-baseline gap-4 flex-wrap">
                  {editingRoom ? (
                    <div className="flex items-center gap-2">
                      <input type="text" inputMode="numeric" value={editRoom} onChange={(e) => setEditRoom(e.target.value)} autoFocus maxLength={10}
                        className="w-28 text-5xl font-black font-mono text-dark bg-white/60 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30" />
                      <button onClick={handleSaveRoom} className={`font-bold text-sm ${onGold}`}>{t("checkin.save")}</button>
                      <button onClick={() => setEditingRoom(false)} className={`text-sm ${isVip ? "text-white/80" : "text-muted"}`}>{t("checkin.cancel")}</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditRoom(client.roomNumber); setEditingRoom(true); }}
                      className={`text-6xl leading-[0.85] tracking-tight active:opacity-70 transition-opacity ${isVip ? "text-white" : "text-brand"}`}
                      style={{ fontFamily: "var(--font-aur-serif)", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                      {client.roomNumber}
                    </button>
                  )}
                  <h2 className={`text-4xl leading-[0.9] tracking-tight ${onGold}`} style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>{client.name}</h2>
                </div>

                {/* TAGS — COMP (no price), dates, breakfast-not-included */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {comp && (
                    <span className={`text-sm font-extrabold px-3 py-1.5 rounded-full ${isVip ? "bg-white/90 text-purple-600" : "bg-purple-500/10 text-purple-600 dark:text-purple-400"}`}>COMP</span>
                  )}
                  {client.arrivalDate && <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full ${isVip ? "bg-black/25 text-white" : "bg-black/[0.05] text-dark"}`}><AirplaneLanding weight="duotone" size={14} /> {client.arrivalDate}</span>}
                  {client.departureDate && <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full ${isVip ? "bg-black/25 text-white" : "bg-black/[0.05] text-dark"}`}><AirplaneTakeoff weight="duotone" size={14} /> {client.departureDate}</span>}
                  {needsPay && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-full text-white" style={{ background: "var(--aur-bad)", boxShadow: "0 6px 18px -8px rgba(161,59,44,.6)" }}>
                      <Coffee weight="duotone" size={14} /><Prohibit weight="bold" size={12} /> PETIT-DÉJ NON INCLUS
                    </span>
                  )}
                </div>
              </div>

              {/* Adultes / Enfants chips — tap to edit (no Total; the counter carries it) */}
              {editingPeople ? (
                <div className="glass-liquid rounded-md p-3 space-y-2 w-full sm:w-auto">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-micro text-muted uppercase">{t("checkin.adults")}</label>
                      <input type="number" inputMode="numeric" value={editAdults} onChange={(e) => setEditAdults(e.target.value)} min="0" max="20" autoFocus className="w-full mt-1 px-2 py-1.5 rounded-md bg-white/60 text-dark font-mono text-lg text-center focus:outline-none focus:ring-2 focus:ring-brand/30" /></div>
                    <div><label className="text-micro text-muted uppercase">{t("checkin.children")}</label>
                      <input type="number" inputMode="numeric" value={editChildren} onChange={(e) => setEditChildren(e.target.value)} min="0" max="20" className="w-full mt-1 px-2 py-1.5 rounded-md bg-white/60 text-dark font-mono text-lg text-center focus:outline-none focus:ring-2 focus:ring-brand/30" /></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingPeople(false)} className="flex-1 py-1.5 rounded-full glass-liquid text-muted font-semibold text-xs">{t("checkin.cancel")}</button>
                    <button onClick={handleSavePeople} className="flex-1 py-1.5 rounded-full bg-brand text-white font-bold text-xs">{t("checkin.save")}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setEditAdults(String(client.adults)); setEditChildren(String(client.children)); setEditingPeople(true); }} className="flex gap-2 active:opacity-70 transition-opacity">
                  {[{ k: t("checkin.adults"), v: client.adults }, { k: t("checkin.children"), v: client.children }].map((s, i) => (
                    <div key={i} className={`min-w-[74px] text-center rounded-lg px-3 py-2 ${isVip ? "bg-black/20 border border-white/20" : "bg-white/60 border border-black/[0.06]"}`}>
                      <div className={`text-micro uppercase tracking-wide ${isVip ? "text-white" : "text-muted"}`}>{s.k}</div>
                      <div className={`text-2xl font-extrabold mt-0.5 ${onGold}`}>{s.v}</div>
                    </div>
                  ))}
                </button>
              )}
            </div>
          </div>

          {/* Pinned notes — an allergy has to be readable without opening
              anything, on the card, before the guest is waved through. */}
          <PinnedNoteChips notes={notesApi.notes} onOpen={openNotes} onOpenAll={openNotes} />

          {/* Morning-brief room events */}
          {roomEvents.length > 0 && <RoomEventBadges events={roomEvents} variant="stack" showReason />}

          {/* Breakfast INCLUDED — fill the empty space with calm reassurance */}
          {!needsPay && (
            <div className="flex-1 grid place-items-center py-8">
              <div className="flex flex-col items-center gap-3 text-center animate-[fadeIn_0.4s_ease]">
                <span className="w-[68px] h-[68px] rounded-full grid place-items-center" style={{ background: "var(--aur-good-soft)", boxShadow: "inset 0 0 0 1px rgba(47,111,79,.18)" }}>
                  <Coffee weight="duotone" size={32} color="var(--aur-good-ink)" />
                </span>
                <div>
                  <div className="text-lg font-black" style={{ color: "var(--aur-good-ink)" }}>{comp ? "Petit-déjeuner offert" : "Petit-déjeuner inclus"}</div>
                  <div className="text-sm text-muted mt-0.5">Rien à encaisser — bon appétit</div>
                </div>
              </div>
            </div>
          )}

          {/* Breakfast NOT included — prompt to collect payment */}
          {needsPay && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: "linear-gradient(90deg,#FFF4E0,#FFE9C7)", border: "1.5px solid #E7A427", boxShadow: "0 8px 24px -12px rgba(180,110,10,.5)" }}>
              <span className="grid place-items-center gap-0.5 w-10 h-10 rounded-md bg-brand-light text-white shrink-0" style={{gridAutoFlow:"column"}}><Coffee weight="duotone" size={17} /><Prohibit weight="bold" size={12} /></span>
              <div className="min-w-0">
                <div className="font-black text-base text-notice-ink">Petit-déjeuner NON inclus — à encaisser</div>
                <div className="text-xs font-semibold text-notice-ink-2">Demandez au client : l&apos;ajouter à la chambre, ou payer maintenant ?</div>
              </div>
            </div>
          )}

          {/* The swap. A VIP whose rate gives points instead of breakfast can
              keep the points and put breakfast on the room — reception offers
              it, the guest decides, and it is worth its own control because it
              is the one case where the answer to "not included" is neither
              paying nor refusing. Its own formule too, so the briefing can see
              how often it happens. */}
          {needsPay && client.isVip && (
            <button
              onClick={() => {
                const next = paymentAction === "points_to_bkf" ? null : "points_to_bkf";
                setPaymentAction(next);
                if (clientIndex !== null) updateClient(clientIndex, { pendingPaymentAction: next ?? undefined });
              }}
              data-role="points-swap"
              aria-pressed={paymentAction === "points_to_bkf"}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-transform active:scale-[0.98]"
              style={paymentAction === "points_to_bkf"
                ? { background: "var(--aur-good-soft)", boxShadow: "inset 0 0 0 1.5px var(--aur-good)" }
                : { background: "var(--color-card, #fff)", boxShadow: "var(--shadow-aur-2)" }}
            >
              <Coffee weight="duotone" size={22} style={{ color: paymentAction === "points_to_bkf" ? "var(--aur-good-ink)" : "var(--brand-ink)" }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black" style={{ color: paymentAction === "points_to_bkf" ? "var(--aur-good-ink)" : undefined }}>
                  Garder les points, petit-déjeuner sur la chambre
                </span>
                <span className="block text-xs font-semibold" style={{ color: "var(--tab-idle)" }}>
                  {paymentAction === "points_to_bkf" ? "Échange accepté — rien à encaisser" : "À proposer au client VIP"}
                </span>
              </span>
              {/* A switch, not a checkbox: it reads as a state you flip, and
                  the guest is being asked a yes/no question. */}
              <span
                className="shrink-0 w-[52px] h-[30px] rounded-full relative transition-colors"
                style={{ background: paymentAction === "points_to_bkf" ? "var(--aur-good)" : "rgba(128,128,128,.28)" }}
              >
                <span
                  className="absolute top-[3px] w-6 h-6 rounded-full bg-white transition-all"
                  style={{ left: paymentAction === "points_to_bkf" ? 25 : 3, boxShadow: "0 2px 6px rgba(0,0,0,.25)" }}
                />
              </span>
            </button>
          )}

          {/* Payment methods — only when needed, and not once the swap is on */}
          {needsPay && paymentAction !== "points_to_bkf" && (
            <div className="grid grid-cols-4 gap-2">
              {PAY_METHODS.map((opt) => {
                const active = paymentAction === opt.key;
                return (
                  <button key={opt.key} onClick={() => { setPaymentAction(opt.key); if (clientIndex !== null) updateClient(clientIndex, { pendingPaymentAction: opt.key }); }}
                    aria-pressed={active}
                    className="flex flex-col items-center gap-2 py-3 rounded-lg transition-all active:scale-[0.97]"
                    style={active
                      ? { background: "var(--aur-gold-soft-2)", boxShadow: "inset 0 0 0 1.5px var(--color-brand)", color: "var(--brand-ink)" }
                      : { background: "var(--color-card, #fff)", boxShadow: "var(--shadow-aur-2)" }}>
                    <opt.Icon weight="duotone" size={24} color={active ? "var(--brand-ink)" : "currentColor"} />
                    <span className="text-sm font-extrabold leading-none">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== PINNED ACTION BOX — always reachable (R1) ===== */}
        <div className="shrink-0 px-3 md:px-4 pt-2 pb-3">
          {allDone ? (
            <div className="glass-liquid rounded-xl py-6 text-center">
              <div className="text-xl font-bold text-green-600 dark:text-green-400 mb-1">{t("checkin.allDone")}</div>
              <p className="text-muted text-sm">{t("checkin.allDoneDesc", { count: total })}</p>
            </div>
          ) : (
            <div className="glass-liquid rounded-xl p-4">
              <div className="text-center text-xs text-muted mb-2 font-medium">{remaining} {t("checkin.of")} {total} {t("checkin.remaining")}</div>
              <div className="mb-3"><PeopleCounter value={count} min={1} max={remaining} onChange={setCount} /></div>
              <button onClick={handleCheckIn} disabled={checkInSuccess}
                className="w-full text-white py-4 rounded-pill text-2xl font-black active:scale-[0.97] transition-all disabled:opacity-60"
                style={{ background: "var(--aur-good)", boxShadow: "0 8px 24px -10px rgba(47,111,79,.45)" }}>
                {t("checkin.button")}
              </button>
            </div>
          )}
        </div>
      </main>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
