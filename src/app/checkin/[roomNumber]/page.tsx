"use client";
import { useState, useEffect, useMemo, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Clock, Star, X } from "@phosphor-icons/react/dist/ssr";
import { Client, CheckInRecord } from "@/lib/types";
import {
  getTodayData,
  addCheckIn,
  updateClient,
  getSettings,
  getSessionHistory,
} from "@/lib/storage";
import { getRemainingForRoom, isComp, needsPaymentChoice } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import PeopleCounter from "@/components/PeopleCounter";
import ClientHistory from "@/components/ClientHistory";
import RoomEventBadges from "@/components/RoomEventBadges";
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

export default function CheckInPage({
  params,
}: {
  params: Promise<{ roomNumber: string }>;
}) {
  const { roomNumber } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useApp();
  const [client, setClient] = useState<Client | null>(null);
  const [clientIndex, setClientIndex] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [count, setCount] = useState(1);
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  // Default = Chambre (room charge). Reception is required to ASK the guest;
  // the UI prompts even when the default is fine, so the question gets asked.
  const [paymentAction, setPaymentAction] = useState<string | null>("room");
  const [editingRoom, setEditingRoom] = useState(false);
  const [editRoom, setEditRoom] = useState("");
  const [editingPeople, setEditingPeople] = useState(false);
  const [editAdults, setEditAdults] = useState("");
  const [editChildren, setEditChildren] = useState("");
  const [costPerCover, setCostPerCover] = useState(26);
  const [todayCheckIns, setTodayCheckIns] = useState<CheckInRecord[]>([]);
  const [roomEvents, setRoomEvents] = useState<RoomEvent[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const data = getTodayData();
    if (!data) { router.push("/search"); return; }

    // Use client index if provided (handles shared rooms)
    const ciParam = searchParams.get("ci");
    let found: Client | undefined;
    if (ciParam !== null) {
      const idx = parseInt(ciParam, 10);
      if (!isNaN(idx) && data.clients[idx]?.roomNumber === roomNumber) {
        found = data.clients[idx];
      }
    }
    // Fallback to room number match
    if (!found) {
      found = data.clients.find((c) => c.roomNumber === roomNumber);
    }
    if (!found) { router.push("/search"); return; }

    // Track client index for updates
    const foundIndex = ciParam !== null ? parseInt(ciParam, 10) : data.clients.indexOf(found);
    setClientIndex(foundIndex >= 0 ? foundIndex : null);
    setClient(found);
    const rem = getRemainingForRoom(found, data.checkIns);
    setRemaining(rem);
    setCount(Math.max(1, rem));
    setCostPerCover(getSettings().costPerCover);

    // Pull morning-brief events that touch this room (anniversaire,
    // honeymoon, ambassador, top VIP, complaint) so the team sees them
    // before checking the guest in.
    setRoomEvents(getRoomEvents(roomNumber));

    // Restore persisted payment selection
    if (found.pendingPaymentAction) {
      setPaymentAction(found.pendingPaymentAction);
    }

    // Load today's check-ins for this client
    const normName = found.name.trim().toLowerCase().replace(/\s+/g, " ");
    setTodayCheckIns(
      data.checkIns.filter(
        (ci) =>
          ci.roomNumber === found.roomNumber &&
          ci.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
      )
    );
  }, [roomNumber, router, searchParams]);

  // Hooks must run unconditionally, BEFORE any early return.
  const guestId = useMemo(
    () => (client ? normalizeNameForId(client.name) : ""),
    [client]
  );

  /** Past stays for this guest, identified by normalized-name ID
   *  (so they map even when they come back to a different room). */
  const pastStays = useMemo(() => {
    if (!guestId) return [];
    const sessions = getSessionHistory();
    const todayIso = new Date().toISOString().split("T")[0];
    const visits: Array<{
      date: string;
      roomNumber: string;
      pax: number;
      vipLevel?: string;
    }> = [];
    for (const s of sessions) {
      if (s.date === todayIso) continue;
      for (const c of s.clients) {
        if (normalizeNameForId(c.name) !== guestId) continue;
        visits.push({
          date: s.date,
          roomNumber: c.roomNumber,
          pax: c.adults + c.children,
          vipLevel: c.vipLevel,
        });
        break;
      }
    }
    return visits.sort((a, b) => b.date.localeCompare(a.date));
  }, [guestId]);

  if (!client) {
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto bg-[#FBF8F3] dark:bg-[#0A0A0F] p-4">
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
    // Navigate to the new room URL
    router.replace(`/checkin/${editRoom.trim()}?ci=${clientIndex}`);
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
  const entered = total - remaining;
  const progressPercent = total > 0 ? (entered / total) * 100 : 0;

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
    addCheckIn(record);
    setCheckInSuccess(true);
    setTimeout(() => router.push("/search"), 800);
  };

  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      {/* Success overlay — prominent green flash with checkmark */}
      {checkInSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-green-500/20 dark:bg-green-500/10 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="flex flex-col items-center gap-3 animate-[popIn_0.25s_cubic-bezier(0.175,0.885,0.32,1.4)]">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-2xl shadow-green-500/40 dark:shadow-green-500/60">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-bold text-green-700 dark:text-green-300 bg-green-500/10 px-4 py-1.5 rounded-full">
              {t("checkin.confirmed")}
            </span>
          </div>
        </div>
      )}

      {/* Header area with brand gradient */}
      <div className={`shrink-0 relative overflow-hidden mx-3 mt-3 rounded-[20px] ${
        client.isVip ? "vip-glow" : ""
      }`}>
        <div className={
          client.isVip
            ? "absolute inset-0 bg-gradient-to-br from-brand/25 via-brand-light/15 to-brand/20 dark:from-brand/30 dark:via-brand-light/20 dark:to-brand/25"
            : "absolute inset-0 bg-gradient-to-br from-brand/8 to-brand-light/5 dark:from-brand/5 dark:to-brand-light/3"
        } />
        {client.isVip && (
          <>
            {/* Halo doré — diffusion radiale subtile */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: "radial-gradient(circle at 70% 30%, rgba(221,156,40,0.18), transparent 60%)",
            }} />
            {/* Bordure inférieure dorée — délimite la card VIP */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-[3px] bg-gradient-to-r from-transparent via-brand-light to-transparent blur-sm" />
          </>
        )}
        <div className="relative px-4 pt-3 pb-4">
          <button
            onClick={() => router.push("/search")}
            className="self-start mb-3 flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
          >
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium text-brand">{t("checkin.search")}</span>
          </button>

          {/* Hero card — room # + guest name on one line, with depth */}
          <div className="glass-liquid rounded-[20px] px-5 py-5 mb-3 relative">
            {/* Clock icon → past-stays history */}
            <button
              onClick={() => setHistoryOpen(true)}
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-muted hover:text-brand active:scale-[0.94] transition-all"
              aria-label="Historique du client"
              title={pastStays.length > 0 ? `${pastStays.length} séjour(s) précédent(s)` : "Aucun séjour précédent"}
            >
              <Clock weight="duotone" size={14} />
              {pastStays.length > 0 && (
                <span className="text-[10px] font-black tabular-nums">{pastStays.length}</span>
              )}
            </button>

            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">
              {t("checkin.room")}
            </div>

            {editingRoom ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={editRoom}
                  onChange={(e) => setEditRoom(e.target.value)}
                  className="w-32 text-5xl font-black font-mono text-dark bg-white/50 rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  autoFocus
                  maxLength={10}
                />
                <button onClick={handleSaveRoom} className="text-brand font-bold text-sm">{t("checkin.save")}</button>
                <button onClick={() => setEditingRoom(false)} className="text-muted text-sm">{t("checkin.cancel")}</button>
              </div>
            ) : (
              <div className="flex items-baseline gap-4 flex-wrap">
                <button
                  onClick={() => { setEditRoom(client.roomNumber); setEditingRoom(true); }}
                  className="text-6xl font-black font-mono text-brand leading-none tracking-tight active:opacity-70 transition-opacity"
                >
                  {client.roomNumber}
                </button>
                <h2
                  className="text-[34px] text-dark leading-none tracking-tight"
                  style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}
                >
                  {client.name}
                </h2>
              </div>
            )}

            {/* COMP cost badge */}
            {comp && (
              <div className="mt-3 inline-flex items-center gap-2 bg-purple-500/10 dark:bg-purple-500/15 rounded-full px-3 py-1">
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wide">COMP</span>
                <span className="text-sm font-black text-purple-700 dark:text-purple-300 tabular-nums">{total * costPerCover}€</span>
              </div>
            )}
          </div>

          {/* VIP banner — same prominent gradient as the Ambassador banner.
              Shown ONLY when the guest is on the VIP list (client.isVip = true). */}
          {client.isVip && (
            <div className="flex items-center gap-3 px-4 py-3 mb-3 rounded-[14px] bg-gradient-to-r from-brand via-brand-light to-brand text-white shadow-[0_4px_20px_-4px] shadow-brand/50">
              <span className="grid place-items-center size-9 rounded-full bg-white/20 backdrop-blur-sm">
                <Star weight="fill" className="size-5 text-white drop-shadow" />
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-black tracking-[0.10em] uppercase drop-shadow-sm">
                  {client.vipLevel || "VIP"}
                </span>
                <p className="text-[11px] text-white/90 mt-0.5 leading-relaxed">
                  Client VIP — accueil prioritaire
                </p>
              </div>
            </div>
          )}

          {/* Morning brief events for this room — anniversaire, honeymoon,
              ambassador. Maps to /checkin via the room number. */}
          {roomEvents.length > 0 && (
            <RoomEventBadges events={roomEvents} variant="stack" showReason />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 pt-2 pb-4 overflow-hidden">
        {/* Progress bar */}
        <div className="shrink-0 mb-4">
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-xs text-muted font-medium">{t("checkin.progress")}</span>
            <span className="text-xs font-bold text-dark">{entered}/{total}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200 ease-out"
              style={{
                width: `${progressPercent}%`,
                background: allDone
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #A66914, #DD9C28)",
              }}
            />
          </div>
        </div>

        {/* Stats grid — tap to edit */}
        {editingPeople ? (
          <div className="shrink-0 glass-liquid rounded-[14px] p-4 mb-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide font-medium">{t("checkin.adults")}</label>
                <input type="number" inputMode="numeric" value={editAdults} onChange={(e) => setEditAdults(e.target.value)} min="0" max="20" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/50 text-dark font-mono text-xl text-center focus:outline-none focus:ring-2 focus:ring-brand/30" autoFocus />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide font-medium">{t("checkin.children")}</label>
                <input type="number" inputMode="numeric" value={editChildren} onChange={(e) => setEditChildren(e.target.value)} min="0" max="20" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/50 text-dark font-mono text-xl text-center focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingPeople(false)} className="flex-1 py-2 rounded-full glass-liquid text-muted font-semibold text-sm">{t("checkin.cancel")}</button>
              <button onClick={handleSavePeople} className="flex-1 py-2 rounded-full bg-brand text-white font-bold text-sm">{t("checkin.save")}</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setEditAdults(String(client.adults)); setEditChildren(String(client.children)); setEditingPeople(true); }}
            className="shrink-0 grid grid-cols-3 gap-2 mb-3 w-full active:opacity-70 transition-opacity"
          >
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.adults")}</div>
              <div className="text-2xl font-bold text-dark mt-0.5">{client.adults}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.children")}</div>
              <div className="text-2xl font-bold text-dark mt-0.5">{client.children}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3 text-center">
              <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.total")}</div>
              <div className="text-2xl font-bold text-brand mt-0.5">{total}</div>
            </div>
          </button>
        )}

        {/* Mode de paiement — 5 gros boutons 3D Aurelle style.
            Défaut : Chambre. La réception doit DEMANDER au client.
            Affiché UNIQUEMENT quand le petit-déjeuner n'est pas déjà inclus
            dans le forfait (off-list VIPs ou clients sans BKF INC/GRP/etc.) */}
        {needsPaymentChoice(client) && (
        <div className="shrink-0 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-muted uppercase tracking-wide font-medium">
              {t("checkin.paymentMethod")}
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] text-brand bg-brand/10 px-2 py-0.5 rounded-full">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
              demande au client
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { key: "room",       label: "Chambre",    icon: "🏨" },
              { key: "points",     label: "Points",     icon: "⭐" },
              { key: "cash",       label: "Cash",       icon: "💵" },
              { key: "card",       label: "Carte B",    icon: "💳" },
              { key: "supervisor", label: "Supervisor", icon: "👤" },
            ].map((opt) => {
              const active = paymentAction === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => {
                    setPaymentAction(opt.key);
                    if (clientIndex !== null) {
                      updateClient(clientIndex, { pendingPaymentAction: opt.key });
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-1 py-3 rounded-[16px] transition-all active:scale-[0.94] ${
                    active
                      ? "bg-dark text-white shadow-lg shadow-black/30 dark:bg-white dark:text-black"
                      : "glass-liquid text-dark"
                  }`}
                  aria-pressed={active}
                >
                  <span
                    className={`w-9 h-9 rounded-[12px] grid place-items-center text-lg ${
                      active
                        ? "bg-gradient-to-br from-brand to-brand-light shadow-inner"
                        : "bg-black/[0.04] dark:bg-white/[0.06]"
                    }`}
                    style={
                      active
                        ? { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px -4px rgba(166,105,20,0.5)" }
                        : { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px -2px rgba(0,0,0,0.06)" }
                    }
                  >
                    {opt.icon}
                  </span>
                  <span className={`text-[10px] font-bold leading-none ${active ? "" : "text-dark/80"}`}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Arrival · Departure · Package — Apple-style varied widths in one row */}
        <div
          className="shrink-0 grid gap-2 mb-3"
          style={{ gridTemplateColumns: "1fr 1fr 1.4fr" }}
        >
          <div className="glass-liquid rounded-[14px] p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.arrival")}</div>
            <div className="text-sm font-semibold mt-0.5 text-dark truncate">{client.arrivalDate || "—"}</div>
          </div>
          <div className="glass-liquid rounded-[14px] p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.departure")}</div>
            <div className="text-sm font-semibold mt-0.5 text-dark truncate">{client.departureDate || "—"}</div>
          </div>
          <div className="glass-liquid rounded-[14px] p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.package")}</div>
            <div className="text-sm font-semibold mt-0.5 text-dark truncate">{client.packageCode || "—"}</div>
          </div>
        </div>

        {/* Client history + undo timeline */}
        <ClientHistory
          roomNumber={client.roomNumber}
          clientName={client.name}
          todayCheckIns={todayCheckIns}
          onUndo={() => {
            // Refresh data after undo
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
          }}
        />

        <div className="flex-1" />

        {/* Check-in action area */}
        {allDone ? (
          <div className="shrink-0 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 dark:bg-green-500/15 flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-xl font-bold text-green-600 dark:text-green-400 mb-1">{t("checkin.allDone")}</div>
            <p className="text-muted text-sm">{t("checkin.allDoneDesc", { count: total })}</p>
          </div>
        ) : (
          <div className="shrink-0">
            <div className="text-center text-sm text-muted mb-2 font-medium">
              {remaining} {t("checkin.of")} {total} {t("checkin.remaining")}
            </div>
            <div className="mb-4">
              <PeopleCounter value={count} min={1} max={remaining} onChange={setCount} />
            </div>
            <button
              onClick={handleCheckIn}
              disabled={checkInSuccess}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-4 rounded-[52px] text-2xl font-bold active:scale-[0.97] transition-all shadow-lg shadow-green-600/25 disabled:opacity-60 dark:glow-green"
            >
              {t("checkin.button")}
            </button>
          </div>
        )}
      </div>

      {/* Past-stays history modal */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-[fadeIn_0.18s_ease-out]"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-[#FBF8F3] dark:bg-[#14141A] rounded-t-[24px] sm:rounded-[24px] p-5 pb-7 shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4 sm:hidden" />
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-black text-dark">Historique du client</h3>
                <p
                  className="text-[20px] text-dark mt-1 leading-none"
                  style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}
                >
                  {client.name}
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {pastStays.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-dark">Premier séjour chez nous.</p>
                  <p className="text-xs text-muted mt-1">
                    Aucun séjour précédent enregistré pour ce client.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {pastStays.map((v, i) => (
                    <li
                      key={`${v.date}-${i}`}
                      className="flex items-center justify-between gap-2 py-2 px-3 rounded-[12px] bg-black/[0.03] dark:bg-white/[0.04]"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-dark tabular-nums">
                          {new Date(v.date + "T12:00:00").toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-[10px] text-muted">
                          ch {v.roomNumber} · {v.pax} pax
                          {v.vipLevel && ` · ${v.vipLevel}`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="text-[10px] text-muted text-center mt-3">
              {pastStays.length} séjour(s) précédent(s)
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
