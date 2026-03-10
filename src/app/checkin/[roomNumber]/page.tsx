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
    };
    addCheckIn(record);
    setCheckInSuccess(true);
    setTimeout(() => router.push("/search"), 450);
  };

  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#F2F2F7]">
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
              <div className="text-5xl font-black font-mono text-dark leading-none tracking-tight">{client.roomNumber}</div>
            </div>
            <div className="flex gap-1.5 flex-wrap justify-end pb-1">
              <button
                onClick={handleToggleVip}
                className={`inline-flex items-center rounded-full font-black active:scale-[0.94] transition-all ${
                  client.isVip
                    ? "bg-gradient-to-r from-brand to-brand-light text-white px-4 py-1.5 text-sm shadow-lg shadow-brand/30 dark:glow-brand"
                    : "glass-liquid text-muted border border-dashed border-current text-xs px-3 py-1"
                }`}
              >
                {client.isVip ? (
                  <>
                    <span className="drop-shadow-sm">VIP</span>
                    {client.vipLevel ? <span className="ml-1 text-white/80 font-semibold text-xs">{client.vipLevel}</span> : ""}
                  </>
                ) : (
                  <>+ VIP</>
                )}
              </button>
              {comp && (
                <span className="inline-flex items-center text-xs bg-purple-100/70 dark:bg-purple-900/30 backdrop-blur-sm text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full font-bold">
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

        {/* Stats grid */}
        <div className="shrink-0 grid grid-cols-3 gap-2 mb-3">
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
        </div>

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
