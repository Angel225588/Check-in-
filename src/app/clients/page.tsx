"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { getTodayData, getSessionHistory } from "@/lib/storage";
import { Client, CheckInRecord, SessionRecord } from "@/lib/types";
import { isComp, getRemainingForRoom, getEnteredForClient, getTotalGuests, getCheckedInCount } from "@/lib/utils";

function VipBadge({ level }: { level?: string }) {
  const tier = (level || "").toLowerCase();
  let classes = "bg-gradient-to-r from-brand to-brand-light text-white";
  let label = "VIP";

  if (tier.includes("silver")) {
    classes = "bg-gradient-to-r from-slate-300 to-slate-400 text-white";
    label = "Silver";
  } else if (tier.includes("gold")) {
    classes = "bg-gradient-to-r from-amber-500 to-yellow-400 text-white";
    label = "Gold";
  } else if (tier.includes("plat")) {
    classes = "bg-gradient-to-r from-gray-700 to-gray-900 text-white";
    label = "Platinum";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${classes}`}>
      {label}
    </span>
  );
}

function CompBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-emerald-500 to-teal-400 text-white">
      COMP
    </span>
  );
}

function ClientRow({
  client,
  checkIns,
  index,
  onClick,
}: {
  client: Client;
  checkIns: CheckInRecord[];
  index: number;
  onClick: () => void;
}) {
  const { t } = useApp();
  const entered = getEnteredForClient(client, checkIns);
  const total = client.adults + client.children;
  const isFullyEntered = entered >= total && total > 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 glass-liquid rounded-[14px] active:scale-[0.98] transition-all text-left"
    >
      {/* Room number */}
      <div className="shrink-0 w-14 text-center">
        <span className="font-mono font-bold text-base text-dark">{client.roomNumber}</span>
      </div>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-dark truncate max-w-[140px]">
            {client.name || "---"}
          </span>
          {client.isVip && <VipBadge level={client.vipLevel} />}
          {isComp(client) && <CompBadge />}
        </div>
        <div className="text-[11px] text-muted mt-0.5">
          {total} {t("clients.guests")}
        </div>
      </div>

      {/* Status indicator */}
      <div className="shrink-0 flex items-center gap-1.5">
        {isFullyEntered ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10">
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-[11px] font-semibold text-green-600 dark:text-green-400">{entered}/{total}</span>
          </div>
        ) : entered > 0 ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10">
            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{entered}/{total}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10">
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
            </svg>
            <span className="text-[11px] font-semibold text-red-400">0/{total}</span>
          </div>
        )}
      </div>
    </button>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const { t } = useApp();
  const [search, setSearch] = useState("");
  const [todayClients, setTodayClients] = useState<Client[]>([]);
  const [todayCheckIns, setTodayCheckIns] = useState<CheckInRecord[]>([]);
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    const data = getTodayData();
    const sessions = getSessionHistory();
    if (data) {
      setTodayClients(data.clients);
      setTodayCheckIns(data.checkIns);
      setHasActiveSession(data.clients.length > 0);
    }
    setHistory(sessions);
    setLoading(false);
  }, []);

  // Stats for today
  const stats = useMemo(() => {
    const total = todayClients.length;
    const vips = todayClients.filter((c) => c.isVip).length;
    const comps = todayClients.filter((c) => isComp(c)).length;
    const totalGuests = getTotalGuests(todayClients);
    const entered = getCheckedInCount(todayCheckIns);
    const remaining = Math.max(0, totalGuests - entered);
    return { total, vips, comps, entered, remaining, totalGuests };
  }, [todayClients, todayCheckIns]);

  // Filter today's clients by search
  const filteredToday = useMemo(() => {
    if (!search.trim()) return todayClients;
    const q = search.trim().toLowerCase();
    return todayClients.filter(
      (c) =>
        c.roomNumber.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    );
  }, [todayClients, search]);

  // Filter past session clients by search
  const filterSessionClients = (clients: Client[]) => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.roomNumber.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      {/* Header */}
      <div className="shrink-0 p-3 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => router.push(hasActiveSession ? "/search" : "/upload")}
            className="flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
          >
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium text-brand">
              {hasActiveSession ? t("checkin.search") : t("search.upload")}
            </span>
          </button>

          <div className="flex flex-col items-end">
            <span
              className="text-sm font-bold tracking-[0.08em] text-brand leading-tight"
              style={{ fontFamily: "'Nunito', sans-serif" }}
            >
              COURTYARD
            </span>
            <span className="text-[10px] text-muted leading-tight">
              by <span className="font-bold tracking-[0.05em] text-slate">MARRIOTT</span>
            </span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-dark mb-3">{t("clients.title")}</h1>

        {/* Stats summary */}
        {hasActiveSession && (
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            <div className="glass-liquid rounded-[12px] px-2 py-2 text-center">
              <div className="text-lg font-bold text-dark">{stats.total}</div>
              <div className="text-[9px] text-muted uppercase tracking-wide font-medium">Total</div>
            </div>
            <div className="glass-liquid rounded-[12px] px-2 py-2 text-center">
              <div className="text-lg font-bold text-brand">{stats.vips}</div>
              <div className="text-[9px] text-muted uppercase tracking-wide font-medium">VIP</div>
            </div>
            <div className="glass-liquid rounded-[12px] px-2 py-2 text-center">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.comps}</div>
              <div className="text-[9px] text-muted uppercase tracking-wide font-medium">Comp</div>
            </div>
            <div className="glass-liquid rounded-[12px] px-2 py-2 text-center">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{stats.entered}</div>
              <div className="text-[9px] text-muted uppercase tracking-wide font-medium">{t("clients.entered")}</div>
            </div>
            <div className="glass-liquid rounded-[12px] px-2 py-2 text-center">
              <div className="text-lg font-bold text-red-400">{stats.remaining}</div>
              <div className="text-[9px] text-muted uppercase tracking-wide font-medium">{t("clients.noShow")}</div>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="relative mb-2">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("clients.searchPlaceholder")}
            className="w-full pl-10 pr-10 py-2.5 glass-liquid rounded-[14px] text-sm text-dark placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/15 active:scale-90 transition-all"
            >
              <svg className="w-3 h-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Client list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-6">
        {/* Today's Guests */}
        {hasActiveSession && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-1 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <h2 className="text-xs font-semibold text-muted uppercase tracking-widest">
                {t("clients.todayGuests")}
              </h2>
              <span className="text-xs text-muted">({filteredToday.length})</span>
            </div>
            <div className="space-y-1.5">
              {filteredToday.map((client, i) => {
                const globalIndex = todayClients.indexOf(client);
                return (
                  <ClientRow
                    key={`today-${client.roomNumber}-${i}`}
                    client={client}
                    checkIns={todayCheckIns}
                    index={globalIndex}
                    onClick={() => router.push(`/checkin/${client.roomNumber}?ci=${globalIndex}`)}
                  />
                );
              })}
              {filteredToday.length === 0 && search && (
                <div className="text-center text-muted text-sm py-6">{t("clients.noResults")}</div>
              )}
            </div>
          </div>
        )}

        {/* No active session and no history */}
        {!hasActiveSession && history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full glass-liquid flex items-center justify-center">
              <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-muted text-sm">{t("clients.noResults")}</p>
          </div>
        )}

        {/* Past Guests */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-1 py-2 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <h2 className="text-xs font-semibold text-muted uppercase tracking-widest">
                {t("clients.pastGuests")}
              </h2>
            </div>

            {/* Date chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {history.map((session) => {
                const isExpanded = expandedDate === session.date;
                const matchCount = filterSessionClients(session.clients).length;
                return (
                  <button
                    key={session.date}
                    onClick={() => setExpandedDate(isExpanded ? null : session.date)}
                    className={`
                      px-3 py-1.5 rounded-[52px] text-xs font-semibold transition-all active:scale-[0.96]
                      ${isExpanded
                        ? "bg-gradient-to-r from-brand to-brand-light text-white shadow-md shadow-brand/20"
                        : "glass-liquid text-muted hover:text-dark"
                      }
                    `}
                  >
                    {formatDate(session.date)}
                    {search && <span className="ml-1 opacity-70">({matchCount})</span>}
                  </button>
                );
              })}
            </div>

            {/* Expanded date clients */}
            {expandedDate && (
              <div className="space-y-1.5">
                {(() => {
                  const session = history.find((s) => s.date === expandedDate);
                  if (!session) return null;
                  const filtered = filterSessionClients(session.clients);
                  if (filtered.length === 0) {
                    return <div className="text-center text-muted text-sm py-4">{t("clients.noResults")}</div>;
                  }
                  return filtered.map((client, i) => {
                    const entered = getEnteredForClient(client, session.checkIns);
                    const total = client.adults + client.children;
                    const isFullyEntered = entered >= total && total > 0;
                    return (
                      <div
                        key={`past-${session.date}-${client.roomNumber}-${i}`}
                        className="w-full flex items-center gap-3 px-3 py-2.5 glass-liquid rounded-[14px] opacity-80"
                      >
                        <div className="shrink-0 w-14 text-center">
                          <span className="font-mono font-bold text-base text-dark">{client.roomNumber}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-dark truncate max-w-[140px]">
                              {client.name || "---"}
                            </span>
                            {client.isVip && <VipBadge level={client.vipLevel} />}
                            {isComp(client) && <CompBadge />}
                          </div>
                          <div className="text-[11px] text-muted mt-0.5">
                            {total} {t("clients.guests")}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isFullyEntered ? (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10">
                              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-[11px] font-semibold text-green-600 dark:text-green-400">{entered}/{total}</span>
                            </div>
                          ) : entered > 0 ? (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10">
                              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{entered}/{total}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10">
                              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                              </svg>
                              <span className="text-[11px] font-semibold text-red-400">0/{total}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
