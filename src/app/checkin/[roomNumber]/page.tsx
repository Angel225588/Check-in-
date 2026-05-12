"use client";
import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Client, CheckInRecord } from "@/lib/types";
import { getTodayData, addCheckIn, updateClient, getSettings, addClient } from "@/lib/storage";
import { getRemainingForRoom, isComp, needsPaymentChoice } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import PeopleCounter from "@/components/PeopleCounter";
import QuickAddGuest from "@/components/QuickAddGuest";
import ClientHistory from "@/components/ClientHistory";
import RoomEventBadges from "@/components/RoomEventBadges";
import { getRoomEvents, RoomEvent } from "@/lib/room-events";

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
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [todayCheckIns, setTodayCheckIns] = useState<CheckInRecord[]>([]);
  const [roomEvents, setRoomEvents] = useState<RoomEvent[]>([]);
  const [quickAddPopup, setQuickAddPopup] = useState<{ kind: "adult" | "child" } | null>(null);

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

  const handleToggleVip = () => {
    if (clientIndex === null) return;
    const newVip = !client.isVip;
    updateClient(clientIndex, { isVip: newVip, vipLevel: newVip ? "" : undefined });
    setClient({ ...client, isVip: newVip, vipLevel: newVip ? "" : undefined });
  };

  // Payment carousel: walk-ins (no package) and extra guests only
  // VIPs with a breakfast package are covered — no carousel needed
  const notOnList = !client.packageCode || client.packageCode === "";
  const showPaymentTabs = notOnList;

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

  const getVipBadgeClasses = (level?: string): string => {
    const normalized = (level || "").toLowerCase();
    if (normalized.includes("platinum") || normalized.includes("titanium") || normalized.includes("ambassador")) {
      // Platinum/Titanium/Ambassador — dark premium with subtle shine
      return "bg-gradient-to-r from-gray-800 via-gray-700 to-gray-900 text-white px-5 py-2 text-base shadow-lg shadow-gray-900/40 ring-1 ring-white/10";
    }
    if (normalized.includes("gold")) {
      // Gold Elite — warm gold gradient
      return "bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-500 text-white px-5 py-2 text-base shadow-lg shadow-amber-500/30";
    }
    if (normalized.includes("silver")) {
      // Silver Elite — cool metallic
      return "bg-gradient-to-r from-slate-400 via-slate-300 to-slate-400 text-gray-800 px-5 py-2 text-base shadow-lg shadow-slate-400/30";
    }
    // Generic VIP — brand gradient
    return "bg-gradient-to-r from-brand to-brand-light text-white px-5 py-2 text-base shadow-lg shadow-brand/30 dark:glow-brand";
  };

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

          {/* Room + badges row */}
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">{t("checkin.room")}</div>
              {editingRoom ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    className="w-28 text-4xl font-black font-mono text-dark bg-white/50 rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    autoFocus
                    maxLength={10}
                  />
                  <button onClick={handleSaveRoom} className="text-brand font-bold text-sm">{t("checkin.save")}</button>
                  <button onClick={() => setEditingRoom(false)} className="text-muted text-sm">{t("checkin.cancel")}</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditRoom(client.roomNumber); setEditingRoom(true); }}
                  className="text-5xl font-black font-mono text-dark leading-none tracking-tight active:opacity-70 transition-opacity"
                >
                  {client.roomNumber}
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap justify-end pb-1">
              <button
                onClick={handleToggleVip}
                className={`inline-flex items-center rounded-full font-black active:scale-[0.94] transition-all ${
                  client.isVip
                    ? getVipBadgeClasses(client.vipLevel)
                    : "glass-liquid text-muted border border-dashed border-current text-sm px-4 py-1.5"
                }`}
              >
                {client.isVip ? (
                  <>
                    <span className="drop-shadow-sm tracking-wide">{client.vipLevel || "VIP"}</span>
                  </>
                ) : (
                  <>+ VIP</>
                )}
              </button>
              {comp && (
                <span className="inline-flex items-center text-base bg-purple-600 text-white px-5 py-2 rounded-full font-black shadow-sm shadow-purple-500/20 tracking-wide">
                  COMP
                </span>
              )}
            </div>
          </div>

          {/* Guest name */}
          <h2 className="text-[28px] font-black text-dark leading-tight tracking-tight">{client.name}</h2>

          {/* COMP cost badge */}
          {comp && (
            <div className="mt-2 inline-flex items-center gap-2 bg-purple-500/10 dark:bg-purple-500/15 rounded-full px-3 py-1">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wide">COMP</span>
              <span className="text-sm font-black text-purple-700 dark:text-purple-300 tabular-nums">{total * costPerCover}€</span>
            </div>
          )}

          {/* Morning brief events for this room — anniversaire, honeymoon,
              ambassador, top VIP, complaint. Communicates immediately to
              the team what context this guest carries. */}
          {roomEvents.length > 0 && (
            <div className="mt-3">
              <RoomEventBadges events={roomEvents} variant="stack" showReason />
            </div>
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

        <div className="shrink-0 grid grid-cols-2 gap-2 mb-3">
          <div className="glass-liquid rounded-[14px] p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.arrival")}</div>
            <div className="text-sm font-semibold mt-0.5 text-dark">{client.arrivalDate}</div>
          </div>
          <div className="glass-liquid rounded-[14px] p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.departure")}</div>
            <div className="text-sm font-semibold mt-0.5 text-dark">{client.departureDate}</div>
          </div>
        </div>

        <div className="shrink-0 glass-liquid rounded-[14px] p-3 mb-3">
          <div className="text-[10px] text-muted uppercase tracking-wide">{t("checkin.package")}</div>
          <div className="text-sm font-semibold mt-0.5 text-dark">{client.packageCode || "N/A"}</div>
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

        {/* Quick add — incrémente le client EN PLACE (jamais de nouvelle chambre).
            Ouvre un popup paiement quand nécessaire (sinon ajoute direct). */}
        <div className="shrink-0 mb-3 grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              // Si paiement nécessaire (off-list ou pas de package BKF) → popup
              if (needsPaymentChoice(client)) {
                setQuickAddPopup({ kind: "adult" });
              } else {
                // VIP avec PDJ inclus → ajout direct, gratuit
                if (clientIndex !== null) {
                  updateClient(clientIndex, { adults: client.adults + 1 });
                  const data = getTodayData();
                  if (data && data.clients[clientIndex]) {
                    setClient({ ...data.clients[clientIndex] });
                    setRemaining(getRemainingForRoom(data.clients[clientIndex], data.checkIns));
                  }
                }
              }
            }}
            className="flex items-center justify-center gap-1 py-2.5 glass-liquid rounded-[14px] text-brand font-semibold text-xs active:scale-[0.96] transition-all"
            aria-label="Ajouter un adulte"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t("checkin.quickAdult")}
          </button>
          <button
            onClick={() => {
              if (needsPaymentChoice(client)) {
                setQuickAddPopup({ kind: "child" });
              } else {
                if (clientIndex !== null) {
                  updateClient(clientIndex, { children: client.children + 1 });
                  const data = getTodayData();
                  if (data && data.clients[clientIndex]) {
                    setClient({ ...data.clients[clientIndex] });
                    setRemaining(getRemainingForRoom(data.clients[clientIndex], data.checkIns));
                  }
                }
              }
            }}
            className="flex items-center justify-center gap-1 py-2.5 glass-liquid rounded-[14px] text-brand font-semibold text-xs active:scale-[0.96] transition-all"
            aria-label="Ajouter un enfant"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t("checkin.quickChild")}
          </button>
          <button
            onClick={() => setQuickAddOpen(true)}
            className="flex items-center justify-center gap-1 py-2.5 glass-liquid rounded-[14px] text-brand font-semibold text-xs active:scale-[0.97] transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t("checkin.addClient")}
          </button>
        </div>

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

      <QuickAddGuest
        roomNumber={client.roomNumber}
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdded={(newClient) => {
          const data = getTodayData();
          if (data) {
            const newIndex = data.clients.length - 1;
            router.push(`/checkin/${newClient.roomNumber}?ci=${newIndex}`);
          }
        }}
      />

      {/* Quick-add payment popup — incrémente le client courant + paiement */}
      {quickAddPopup && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-[fadeIn_0.18s_ease-out]"
          onClick={() => setQuickAddPopup(null)}
        >
          <div
            className="w-full sm:max-w-md bg-[#FBF8F3] dark:bg-[#14141A] rounded-t-[24px] sm:rounded-[24px] p-5 pb-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4 sm:hidden" />
            <div className="text-center mb-4">
              <h3 className="text-base font-black text-dark">
                +1 {quickAddPopup.kind === "adult" ? t("checkin.quickAdult").replace("+1 ", "") : t("checkin.quickChild").replace("+1 ", "")}
              </h3>
              <p className="text-xs text-muted mt-1">{t("checkin.paymentQuestion")}</p>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { key: "room",       label: "Chambre",    icon: "🏨" },
                { key: "points",     label: "Points",     icon: "⭐" },
                { key: "cash",       label: "Cash",       icon: "💵" },
                { key: "card",       label: "Carte B",    icon: "💳" },
                { key: "supervisor", label: "Supervisor", icon: "👤" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    if (clientIndex === null) return;
                    if (quickAddPopup.kind === "adult") {
                      updateClient(clientIndex, {
                        adults: client.adults + 1,
                        pendingPaymentAction: opt.key,
                      });
                    } else {
                      updateClient(clientIndex, {
                        children: client.children + 1,
                        pendingPaymentAction: opt.key,
                      });
                    }
                    const data = getTodayData();
                    if (data && data.clients[clientIndex]) {
                      setClient({ ...data.clients[clientIndex] });
                      setRemaining(getRemainingForRoom(data.clients[clientIndex], data.checkIns));
                      setPaymentAction(opt.key);
                    }
                    setQuickAddPopup(null);
                  }}
                  className="flex flex-col items-center justify-center gap-1 py-3 rounded-[14px] glass-liquid active:scale-[0.94] transition-all"
                >
                  <span
                    className="w-9 h-9 rounded-[12px] grid place-items-center text-lg bg-black/[0.04] dark:bg-white/[0.06]"
                    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px -2px rgba(0,0,0,0.06)" }}
                  >
                    {opt.icon}
                  </span>
                  <span className="text-[10px] font-bold leading-none text-dark/80">{opt.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setQuickAddPopup(null)}
              className="w-full mt-4 py-2.5 rounded-full text-sm font-medium text-muted glass-liquid"
            >
              {t("checkin.cancel")}
            </button>
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
