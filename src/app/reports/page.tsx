"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { getTodayData, getSessionHistory, getDataForDate, getAllStoredDates } from "@/lib/storage";
import { SessionRecord } from "@/lib/types";
import { getTotalGuests, getCheckedInCount } from "@/lib/utils";

const APP_VERSION = "2.1.0";
import AnimatedNumber from "@/components/AnimatedNumber";

export default function ReportsListPage() {
  const router = useRouter();
  const { t } = useApp();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [unclosedDates, setUnclosedDates] = useState<string[]>([]);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const today = getTodayData();
    setHasActiveSession(!!today && today.clients.length > 0);

    const history = getSessionHistory();
    setSessions(history);

    // Find unclosed dailyData from past days (not in session history)
    const historyDates = new Set(history.map((s) => s.date));
    const storedDates = getAllStoredDates();
    const unclosed = storedDates.filter(
      (d) => d !== todayStr && !historyDates.has(d)
    );
    setUnclosedDates(unclosed);

    setLoading(false);
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateShort = (dateStr: string) => {
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

  const totalReports = sessions.length + unclosedDates.length + (hasActiveSession ? 1 : 0);

  if (loading) {
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto bg-[#FBF8F3] dark:bg-[#0A0A0F] p-4">
        <div className="skeleton h-8 w-32 mb-4" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 w-full" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
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

        <h1 className="text-xl font-bold text-dark mb-1">{t("reports.title")}</h1>
        <p className="text-xs text-muted mb-3">
          <AnimatedNumber value={totalReports} className="font-bold" /> {t("reports.title").toLowerCase()}
        </p>
      </div>

      {/* Report list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-6 space-y-2">
        {/* Active session card */}
        {hasActiveSession && (
          <button
            onClick={() => router.push("/report")}
            className="w-full glass-liquid rounded-[16px] p-4 text-left active:scale-[0.98] transition-all animate-fadeUp ring-1 ring-green-500/20"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">
                  {t("reports.activeSession")}
                </span>
              </div>
              <span className="text-[10px] text-muted">{t("dash.today")}</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-lg font-black text-dark">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {(() => {
                    const data = getTodayData();
                    if (!data) return "";
                    const total = getTotalGuests(data.clients);
                    const entered = getCheckedInCount(data.checkIns);
                    return `${data.clients.length} ${t("reports.rooms")} · ${entered}/${total} ${t("reports.guests")}`;
                  })()}
                </div>
              </div>
              <svg className="w-5 h-5 text-brand shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        )}

        {/* Unclosed sessions from past days (data still in localStorage) */}
        {unclosedDates.map((date, i) => {
          const data = getDataForDate(date);
          if (!data || data.clients.length === 0) return null;
          const total = getTotalGuests(data.clients);
          const entered = getCheckedInCount(data.checkIns);
          const utilPct = total > 0 ? Math.round((entered / total) * 100) : 0;

          return (
            <button
              key={`unclosed-${date}`}
              onClick={() => router.push(`/report?date=${date}`)}
              className="w-full glass-liquid rounded-[16px] p-4 text-left active:scale-[0.98] transition-all animate-fadeUp ring-1 ring-amber-500/20"
              style={{ animationDelay: `${(i + 1) * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    NON CLÔTURÉE
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  utilPct >= 70 ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                  utilPct >= 40 ? "bg-brand/10 text-brand" :
                  "bg-red-500/10 text-red-500"
                }`}>
                  {utilPct}%
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-base font-bold text-dark">{formatDate(date)}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {data.clients.length} {t("reports.rooms")} · {entered}/{total} {t("reports.guests")}
                  </div>
                </div>
                <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          );
        })}

        {/* Past session cards */}
        {sessions.map((session, i) => {
          const totalGuests = getTotalGuests(session.clients);
          const entered = getCheckedInCount(session.checkIns);
          const utilPct = totalGuests > 0 ? Math.round((entered / totalGuests) * 100) : 0;

          return (
            <button
              key={`${session.date}-${i}`}
              onClick={() => router.push(`/report?date=${session.date}`)}
              className="w-full glass-liquid rounded-[16px] p-4 text-left active:scale-[0.98] transition-all animate-fadeUp"
              style={{ animationDelay: `${(i + 1) * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wide">
                  {t("reports.closedSession")}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  utilPct >= 70 ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                  utilPct >= 40 ? "bg-brand/10 text-brand" :
                  "bg-red-500/10 text-red-500"
                }`}>
                  {utilPct}%
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-base font-bold text-dark">{formatDate(session.date)}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {session.clients.length} {t("reports.rooms")} · {entered}/{totalGuests} {t("reports.guests")}
                  </div>
                </div>
                <svg className="w-5 h-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          );
        })}

        {/* Version tag */}
        <p className="text-center text-[9px] text-muted/40 pt-4">v{APP_VERSION}</p>

        {/* Empty state */}
        {totalReports === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full glass-liquid flex items-center justify-center">
              <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-muted text-sm">{t("reports.noReports")}</p>
            <button
              onClick={() => router.push("/upload")}
              className="text-brand font-semibold text-sm active:opacity-70"
            >
              {t("search.upload")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
