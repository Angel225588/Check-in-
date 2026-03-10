"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DailyData } from "@/lib/types";
import { useApp } from "@/contexts/AppContext";
import {
  getHistoricalData,
  getDataForRange,
  getSettings,
  saveSettings,
  getTodayData,
  getSessionHistory,
} from "@/lib/storage";
import {
  getDailySnapshot,
  getRushHourSlots,
  getTrendData,
  getPeriodStats,
} from "@/lib/analytics";

type ViewMode = "today" | "7days" | "custom";

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "today";
    return getTodayData() ? "today" : "7days";
  });
  const [costPerCover, setCostPerCover] = useState(26);
  const [editingCost, setEditingCost] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [historicalData, setHistoricalData] = useState<DailyData[]>([]);
  const [todayData, setTodayData] = useState<DailyData | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  const loadData = () => {
    const settings = getSettings();
    setCostPerCover(settings.costPerCover);

    let today = getTodayData();

    // If no active today data, check sessionHistory for today's closed session
    if (!today) {
      const todayStr = new Date().toISOString().split("T")[0];
      const closedSession = getSessionHistory().find((s) => s.date === todayStr);
      if (closedSession) {
        today = {
          date: closedSession.date,
          clients: closedSession.clients,
          checkIns: closedSession.checkIns,
          rawUploadText: closedSession.rawUploadText,
        };
      }
    }

    setTodayData(today);
    setHistoricalData(getHistoricalData(30));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    loadData();
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 2000);
  };

  const handleCostSave = () => {
    saveSettings({ costPerCover });
    setEditingCost(false);
  };

  const handleCustomRange = () => {
    if (customStart && customEnd) {
      const data = getDataForRange(customStart, customEnd);
      setHistoricalData(data);
      setViewMode("custom");
    }
  };

  const snapshot = useMemo(
    () => (todayData ? getDailySnapshot(todayData, costPerCover) : null),
    [todayData, costPerCover]
  );

  const rushSlots = useMemo(
    () => (todayData ? getRushHourSlots(todayData) : []),
    [todayData]
  );

  const trendData = useMemo(
    () => getTrendData(historicalData),
    [historicalData]
  );

  const periodStats = useMemo(
    () => getPeriodStats(historicalData, costPerCover),
    [historicalData, costPerCover]
  );

  const maxRush = useMemo(
    () => Math.max(...rushSlots.map((s) => s.count), 1),
    [rushSlots]
  );

  return (
    <div className="min-h-dvh bg-[#F2F2F7] dark:bg-[#0A0A0F]">
      <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-3 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push("/search")}
            className="flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
          >
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium text-brand">{t("checkin.search")}</span>
          </button>
          <h1 className="text-xl md:text-2xl font-black text-dark">{t("dash.title")}</h1>
          <button
            onClick={() => setEditingCost(!editingCost)}
            className="text-xs text-muted font-medium px-2 py-1 glass-liquid rounded-full active:scale-95 transition-transform"
          >
            {costPerCover}€
          </button>
        </div>

        {/* Cost editor */}
        {editingCost && (
          <div className="glass-liquid rounded-[14px] p-3 mb-4 flex items-center gap-3">
            <label className="text-sm text-muted">{t("dash.costPerCover")}:</label>
            <input
              type="number"
              value={costPerCover}
              onChange={(e) => setCostPerCover(Number(e.target.value))}
              min="0"
              max="500"
              className="border border-border rounded-xl px-2 py-1 w-20 text-center bg-white/50 dark:bg-white/5 text-dark focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <span className="text-sm text-muted">€</span>
            <button
              onClick={handleCostSave}
              className="bg-brand text-white px-4 py-1.5 rounded-full text-sm font-medium active:scale-95 transition-transform"
            >
              {t("dash.save")}
            </button>
          </div>
        )}

        {/* View mode tabs — segmented control */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="glass-liquid rounded-[12px] p-1 flex">
            {(["today", "7days", "custom"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setViewMode(mode);
                  if (mode === "today") {
                    let today = getTodayData();
                    if (!today) {
                      const todayStr = new Date().toISOString().split("T")[0];
                      const closedSession = getSessionHistory().find((s) => s.date === todayStr);
                      if (closedSession) {
                        today = {
                          date: closedSession.date,
                          clients: closedSession.clients,
                          checkIns: closedSession.checkIns,
                          rawUploadText: closedSession.rawUploadText,
                        };
                      }
                    }
                    setTodayData(today);
                  }
                  if (mode === "7days") setHistoricalData(getHistoricalData(30));
                }}
                className={`px-4 py-1.5 rounded-[9px] text-xs font-semibold transition-all active:scale-[0.97] ${
                  viewMode === mode
                    ? "bg-white dark:bg-white/15 text-dark shadow-sm"
                    : "text-muted hover:text-dark"
                }`}
              >
                {mode === "today" ? t("dash.today") : mode === "7days" ? t("dash.last7") : t("dash.custom")}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            className={`w-8 h-8 flex items-center justify-center rounded-[10px] transition-all active:scale-[0.92] ${
              refreshed
                ? "bg-green-500 text-white"
                : "glass-liquid text-muted"
            }`}
            title={t("dash.refresh")}
          >
            {refreshed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
        </div>

        {/* Custom date range */}
        {viewMode === "custom" && (
          <div className="glass-liquid rounded-[14px] p-3 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted block mb-1">{t("dash.from")}</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-border rounded-xl px-2 py-1.5 text-sm bg-white/50 dark:bg-white/5 text-dark focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">{t("dash.to")}</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-border rounded-xl px-2 py-1.5 text-sm bg-white/50 dark:bg-white/5 text-dark focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <button
                onClick={handleCustomRange}
                disabled={!customStart || !customEnd}
                className="bg-brand text-white px-4 py-1.5 rounded-full text-sm font-medium disabled:opacity-40 active:scale-95 transition-transform"
              >
                {t("dash.apply")}
              </button>
            </div>
          </div>
        )}

        {/* === TODAY'S SNAPSHOT === */}
        {viewMode === "today" && snapshot && (
          <section className="mb-5">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              {t("dash.snapshot")}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.expected")}</div>
                <div className="text-3xl md:text-4xl font-black text-dark">{snapshot.totalExpected}</div>
              </div>
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.showedUp")}</div>
                <div className="text-3xl md:text-4xl font-black text-green-600 dark:text-green-400">
                  {snapshot.totalShowedUp}
                </div>
              </div>
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.noShows")}</div>
                <div className="text-3xl md:text-4xl font-black text-error">
                  {snapshot.noShows}
                </div>
                <div className="text-xs text-error/70">{snapshot.noShowPercent}%</div>
              </div>
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.compCost")}</div>
                <div className="text-3xl md:text-4xl font-black text-purple-600 dark:text-purple-400">
                  {snapshot.compCost}€
                </div>
                <div className="text-xs text-purple-500/70">
                  {snapshot.compShowedUp}/{snapshot.compCount} {t("dash.guests")}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* === PERIOD STATS === */}
        {viewMode !== "today" && periodStats.totalDays > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              {t("dash.periodSummary")} ({periodStats.totalDays} {t("dash.days")})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.avgDaily")}</div>
                <div className="text-3xl md:text-4xl font-black text-dark">{periodStats.avgDailyGuests}</div>
                <div className="text-xs text-muted">{t("dash.guestsDay")}</div>
              </div>
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.utilization")}</div>
                <div className="text-3xl md:text-4xl font-black text-green-600 dark:text-green-400">
                  {periodStats.avgUtilization}%
                </div>
              </div>
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.noShows")}</div>
                <div className="text-3xl md:text-4xl font-black text-error">{periodStats.totalNoShows}</div>
                <div className="text-xs text-error/70">{periodStats.avgNoShowPercent}% avg</div>
              </div>
              <div className="glass-liquid rounded-[14px] p-4 text-center">
                <div className="text-[10px] text-muted uppercase mb-1">{t("dash.compCost")}</div>
                <div className="text-3xl md:text-4xl font-black text-purple-600 dark:text-purple-400">
                  {periodStats.totalCompCost}€
                </div>
                <div className="text-xs text-purple-500/70">{periodStats.totalCompGuests} {t("dash.guests")}</div>
              </div>
            </div>
          </section>
        )}

        {/* No data */}
        {viewMode === "today" && !snapshot && (
          <div className="glass-liquid rounded-[14px] p-8 text-center mb-5">
            <p className="text-muted">{t("dash.noData")}</p>
            <button
              onClick={() => router.push("/upload")}
              className="mt-3 text-brand font-medium text-sm active:opacity-70"
            >
              {t("search.uploadReport")}
            </button>
          </div>
        )}

        {/* iPad: side by side */}
        <div className="md:grid md:grid-cols-2 md:gap-4">
          {/* === RUSH HOURS === */}
          {viewMode === "today" && todayData && (
            <section className="mb-5">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                {t("dash.rushHours")}
              </h2>
              <div className="glass-liquid rounded-[14px] p-4">
                <div className="space-y-2">
                  {rushSlots.map((slot) => (
                    <div key={slot.time} className="flex items-center gap-2">
                      <div className="w-12 text-xs text-muted font-mono text-right shrink-0">
                        {slot.label}
                      </div>
                      <div className="flex-1 h-7 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            slot.isPeak ? "bg-gradient-to-r from-brand to-brand-light" : "bg-brand/40"
                          }`}
                          style={{
                            width: `${maxRush > 0 ? (slot.count / maxRush) * 100 : 0}%`,
                            minWidth: slot.count > 0 ? "8px" : "0px",
                          }}
                        />
                        {slot.count > 0 && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-dark">
                            {slot.count}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {rushSlots.some((s) => s.isPeak && s.count > 0) && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <div className="w-3 h-3 bg-gradient-to-r from-brand to-brand-light rounded-full" />
                    {t("dash.peak")}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* === TREND === */}
          {trendData.length > 0 && (
            <section className="mb-5">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                {viewMode === "today" ? t("dash.last7") : t("dash.trend")}
              </h2>
              <div className="glass-liquid rounded-[14px] p-4">
                {/* Utilization bars */}
                <div className="mb-4">
                  <div className="text-xs text-muted mb-2">{t("dash.utilization")}</div>
                  <div className="flex items-end gap-1 h-24 md:h-32">
                    {trendData.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center">
                        <div className="text-[10px] font-bold text-dark mb-1">
                          {day.utilization > 0 ? `${day.utilization}%` : ""}
                        </div>
                        <div className="w-full bg-black/5 dark:bg-white/5 rounded-t relative flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t transition-all duration-500 ${
                              day.utilization >= 80
                                ? "bg-green-500"
                                : day.utilization >= 50
                                  ? "bg-brand-light"
                                  : "bg-error"
                            }`}
                            style={{ height: `${day.utilization}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted mt-1">{day.dayLabel}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* No-shows bars */}
                <div>
                  <div className="text-xs text-muted mb-2">{t("dash.noShows")}</div>
                  <div className="flex items-end gap-1 h-16 md:h-20">
                    {trendData.map((day) => {
                      const maxNoShows = Math.max(...trendData.map((d) => d.noShows), 1);
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center">
                          {day.noShows > 0 && (
                            <div className="text-[10px] font-bold text-error mb-0.5">
                              {day.noShows}
                            </div>
                          )}
                          <div className="w-full bg-black/5 dark:bg-white/5 rounded-t relative flex-1 flex items-end">
                            <div
                              className="w-full bg-error/50 rounded-t transition-all duration-500"
                              style={{
                                height: `${maxNoShows > 0 ? (day.noShows / maxNoShows) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <div className="text-[10px] text-muted mt-1">{day.date.slice(5)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded" /> 80%+
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-brand-light rounded" /> 50-79%
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-error rounded" /> &lt;50%
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {viewMode !== "today" && trendData.length === 0 && (
          <div className="glass-liquid rounded-[14px] p-8 text-center mb-5">
            <p className="text-muted">{t("dash.noHistory")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
