"use client";
import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Client, CheckInRecord } from "@/lib/types";
import { getTodayData, addCheckIn, updateClient } from "@/lib/storage";
import { getRemainingForRoom, isComp } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import PeopleCounter from "@/components/PeopleCounter";

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
  const [paymentAction, setPaymentAction] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState(false);
  const [editRoom, setEditRoom] = useState("");
  const [editingPeople, setEditingPeople] = useState(false);
  const [editAdults, setEditAdults] = useState("");
  const [editChildren, setEditChildren] = useState("");

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
  }, [roomNumber, router, searchParams]);

  if (!client) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const handleToggleVip = () => {
    if (clientIndex === null) return;
    const newVip = !client.isVip;
    updateClient(clientIndex, { isVip: newVip, vipLevel: newVip ? "" : undefined });
    setClient({ ...client, isVip: newVip, vipLevel: newVip ? "" : undefined });
  };

  const notOnList = !client.packageCode || client.packageCode === "";
  const showPaymentTabs = notOnList || paymentAction !== null;

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
    setTimeout(() => router.push("/search"), 450);
  };

  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      {/* Success overlay */}
      {checkInSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/50 animate-[fadeIn_0.1s_ease-out]">
          <div className="flex flex-col items-center animate-[popIn_0.2s_cubic-bezier(0.175,0.885,0.32,1.4)]">
            <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30 dark:shadow-green-500/50">
              <svg className="w-8 h-8 text-white animate-[drawCheck_0.25s_ease-out_forwards]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeDasharray="24" strokeDashoffset="24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Header area with brand gradient */}
      <div className="shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/8 to-brand-light/5 dark:from-brand/5 dark:to-brand-light/3" />
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
                    ? "bg-gradient-to-r from-brand to-brand-light text-white px-5 py-2 text-base shadow-lg shadow-brand/30 dark:glow-brand"
                    : "glass-liquid text-muted border border-dashed border-current text-sm px-4 py-1.5"
                }`}
              >
                {client.isVip ? (
                  <>
                    <span className="drop-shadow-sm tracking-wide">VIP</span>
                    {client.vipLevel ? <span className="ml-1.5 text-white/80 font-bold text-sm">{client.vipLevel}</span> : ""}
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
          <h2 className="text-[22px] font-bold text-dark leading-tight">{client.name}</h2>
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
              className="h-full rounded-full transition-all duration-500 ease-out"
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

        {/* Payment tabs — for clients not on breakfast list */}
        {showPaymentTabs && (
          <div className="shrink-0 mb-3">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5 font-medium">{t("checkin.paymentMethod")}</div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ touchAction: "pan-x" }}>
              {[
                { key: "pdj", label: "PDJ", icon: "🥐" },
                { key: "card", label: t("checkin.payCard"), icon: "💳" },
                { key: "room", label: t("checkin.payRoom"), icon: "🏨" },
                { key: "points", label: t("checkin.payPoints"), icon: "⭐" },
                { key: "cash", label: "Cash", icon: "💵" },
                { key: "pass", label: t("checkin.payPass"), icon: "→" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPaymentAction(paymentAction === opt.key ? null : opt.key)}
                  className={`shrink-0 py-2.5 px-4 rounded-xl text-center transition-all active:scale-[0.95] ${
                    paymentAction === opt.key
                      ? "bg-brand text-white shadow-md shadow-brand/20 font-bold"
                      : "glass-liquid text-dark font-medium"
                  }`}
                >
                  <div className="text-lg leading-none mb-0.5">{opt.icon}</div>
                  <div className="text-[10px] leading-tight whitespace-nowrap">{opt.label}</div>
                </button>
              ))}
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
