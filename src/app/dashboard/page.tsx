"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DailyData } from "@/lib/types";
import { getRemainingForRoom, isComp, formatTime, getRoomStatusCounts } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import AnimatedNumber from "@/components/AnimatedNumber";
import RushHourChart from "@/components/RushHourChart";
import { generateDayReport } from "@/lib/report";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Crown, Footprints, TrendingUp } from "lucide-react";
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
type MetricFilter = "all" | "show" | "noshow" | "comp" | null;

/* ── Donut Ring ── */
function DonutRing({ percent, size = 100, stroke = 8 }: { percent: number; size?: number; stroke?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = mounted ? circ - (Math.min(percent, 100) / 100) * circ : circ;
  const color = percent >= 70 ? "stroke-green-500 dark:stroke-green-400" : percent >= 40 ? "stroke-brand" : "stroke-red-500 dark:stroke-red-400";
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-black/[0.04] dark:stroke-white/[0.06]" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        className={color} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.25,.46,.45,.94)" }} />
    </svg>
  );
}

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
  const [clientSearch, setClientSearch] = useState("");
  const [showAllClients, setShowAllClients] = useState(false);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(null);

  const loadData = () => {
    const settings = getSettings();
    setCostPerCover(settings.costPerCover);
    let today = getTodayData();
    if (!today) {
      const todayStr = new Date().toISOString().split("T")[0];
      const cs = getSessionHistory().find((s) => s.date === todayStr);
      if (cs) today = { date: cs.date, clients: cs.clients, checkIns: cs.checkIns, rawUploadText: cs.rawUploadText };
    }
    setTodayData(today);
    setHistoricalData(getHistoricalData(30));
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = () => { loadData(); setRefreshed(true); setTimeout(() => setRefreshed(false), 2000); };
  const handleCostSave = () => { saveSettings({ costPerCover }); setEditingCost(false); };
  const handleCustomRange = () => { if (customStart && customEnd) { setHistoricalData(getDataForRange(customStart, customEnd)); setViewMode("custom"); } };
  const handleMetricTap = (f: MetricFilter) => { setMetricFilter(metricFilter === f ? null : f); setShowAllClients(false); setClientSearch(""); };

  const snapshot = useMemo(() => (todayData ? getDailySnapshot(todayData, costPerCover) : null), [todayData, costPerCover]);
  const todayReport = useMemo(
    () => (todayData ? generateDayReport(todayData.clients, todayData.checkIns) : null),
    [todayData]
  );
  const rushSlots = useMemo(() => (todayData ? getRushHourSlots(todayData) : []), [todayData]);
  const trendData = useMemo(() => getTrendData(historicalData), [historicalData]);
  const periodStats = useMemo(() => getPeriodStats(historicalData, costPerCover), [historicalData, costPerCover]);
  const maxRush = useMemo(() => Math.max(...rushSlots.map((s) => s.count), 1), [rushSlots]);

  const roomStatus = useMemo(() => {
    if (!todayData) return { allIn: 0, partial: 0, noShow: 0, totalRooms: 0 };
    return getRoomStatusCounts(todayData.clients, todayData.checkIns);
  }, [todayData]);

  const periodRoomStatus = useMemo(() => {
    if (historicalData.length === 0) return { allIn: 0, partial: 0, noShow: 0, totalRooms: 0 };
    let allIn = 0, partial = 0, noShow = 0, totalRooms = 0;
    for (const d of historicalData) { const s = getRoomStatusCounts(d.clients, d.checkIns); allIn += s.allIn; partial += s.partial; noShow += s.noShow; totalRooms += s.totalRooms; }
    return { allIn, partial, noShow, totalRooms };
  }, [historicalData]);

  // Aggregate rush slots for period view
  const periodRushSlots = useMemo(() => {
    if (historicalData.length === 0) return [];
    const agg: Record<string, { count: number; label: string }> = {};
    for (const d of historicalData) {
      const slots = getRushHourSlots(d);
      for (const s of slots) {
        if (!agg[s.time]) agg[s.time] = { count: 0, label: s.label };
        agg[s.time].count += s.count;
      }
    }
    // Average per day
    const averaged = Object.values(agg).map((v) => ({ ...v, count: Math.round(v.count / historicalData.length) }));
    const maxCount = Math.max(...averaged.map((v) => v.count), 0);
    return averaged.map((v) => ({ ...v, isPeak: v.count === maxCount && maxCount > 0 }));
  }, [historicalData]);

  const filteredClients = useMemo(() => {
    if (!todayData) return [];
    let list = todayData.clients;
    if (metricFilter === "show") {
      // Filter by client name + room to avoid shared-room false positives
      list = list.filter((c) => {
        const normName = c.name.trim().toLowerCase().replace(/\s+/g, " ");
        return todayData.checkIns.filter((ci) =>
          ci.roomNumber === c.roomNumber &&
          ci.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
        ).reduce((s, ci) => s + ci.peopleEntered, 0) > 0;
      });
    } else if (metricFilter === "noshow") {
      list = list.filter((c) => getRemainingForRoom(c, todayData.checkIns) === c.adults + c.children);
    } else if (metricFilter === "comp") {
      list = list.filter((c) => isComp(c));
    } else if (metricFilter === "all") {
      /* all */
    } else if (!clientSearch.trim()) {
      return [];
    }
    const q = clientSearch.toUpperCase();
    if (q) list = list.filter((c) => c.name.toUpperCase().includes(q) || c.roomNumber.includes(q));
    return list;
  }, [todayData, metricFilter, clientSearch]);

  const displayedClients = showAllClients ? filteredClients : filteredClients.slice(0, 15);

  // Unified data for both views
  const rs = viewMode === "today" ? roomStatus : periodRoomStatus;
  const totalPeople = viewMode === "today" ? (snapshot?.totalExpected || 0) : periodStats.totalExpected;
  const enteredPeople = viewMode === "today" ? (snapshot?.totalShowedUp || 0) : periodStats.totalShowedUp;
  const remainingPeople = totalPeople - enteredPeople;
  const utilPercent = totalPeople > 0 ? Math.round((enteredPeople / totalPeople) * 100) : 0;
  const compCost = viewMode === "today" ? (snapshot?.compCost || 0) : periodStats.totalCompCost;
  const compCount = viewMode === "today" ? (snapshot?.compCount || 0) : periodStats.totalCompGuests;
  const hasData = viewMode === "today" ? !!snapshot : periodStats.totalDays > 0;
  const activeRushSlots = viewMode === "today" ? rushSlots : periodRushSlots;
  const activeMaxRush = Math.max(...activeRushSlots.map((s) => s.count), 1);

  return (
    <div className="min-h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      {/* ═══ STICKY HEADER — minimal, just nav + tabs ═══ */}
      <div className="sticky top-0 z-30 bg-[#FBF8F3]/80 dark:bg-[#0A0A0F]/80 backdrop-blur-2xl">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2.5">
            <button onClick={() => router.push("/search")}
              className="flex items-center gap-1 active:scale-[0.96] transition-all">
              <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-[15px] font-black text-dark tracking-tight">{t("dash.title")}</h1>
            <button onClick={handleRefresh}
              aria-label="Refresh data"
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-[0.9] ${refreshed ? "bg-green-500 text-white" : "text-muted"}`}>
              {refreshed ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              )}
            </button>
          </div>
          {/* Segmented control */}
          <div className="glass-liquid rounded-[10px] p-0.5 flex">
            {(["today", "7days", "custom"] as ViewMode[]).map((mode) => (
              <button key={mode}
                onClick={() => {
                  setViewMode(mode); setMetricFilter(null);
                  if (mode === "today") {
                    let td = getTodayData();
                    if (!td) { const ts = new Date().toISOString().split("T")[0]; const cs = getSessionHistory().find((s) => s.date === ts); if (cs) td = { date: cs.date, clients: cs.clients, checkIns: cs.checkIns, rawUploadText: cs.rawUploadText }; }
                    setTodayData(td);
                  }
                  if (mode === "7days") setHistoricalData(getHistoricalData(30));
                }}
                className={`flex-1 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all active:scale-[0.97] ${
                  viewMode === mode ? "bg-white dark:bg-white/15 text-dark shadow-sm" : "text-muted"
                }`}>
                {mode === "today" ? t("dash.today") : mode === "7days" ? t("dash.last7") : t("dash.custom")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="max-w-lg mx-auto px-4 pb-8 pt-3 space-y-5">

        {/* Cost editor */}
        {editingCost && (
          <div className="glass-liquid rounded-[14px] p-3 flex items-center gap-3">
            <label className="text-sm text-muted">{t("dash.costPerCover")}:</label>
            <input type="number" value={costPerCover} onChange={(e) => setCostPerCover(Number(e.target.value))}
              min="0" max="500" className="border border-border rounded-xl px-2 py-1 w-20 text-center bg-white/50 text-dark focus:outline-none focus:ring-2 focus:ring-brand/30" />
            <span className="text-sm text-muted">€</span>
            <button onClick={handleCostSave} className="bg-brand text-white px-4 py-1.5 rounded-full text-sm font-medium active:scale-95">{t("dash.save")}</button>
          </div>
        )}

        {/* Custom range */}
        {viewMode === "custom" && (
          <div className="glass-liquid rounded-[14px] p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase">{t("dash.from")}</label>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-sm bg-white/50 text-dark focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase">{t("dash.to")}</label>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-sm bg-white/50 text-dark focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
              <button onClick={handleCustomRange} disabled={!customStart || !customEnd} className="bg-brand text-white px-4 py-1.5 rounded-full text-sm font-medium disabled:opacity-40 active:scale-95">{t("dash.apply")}</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasData && (
          <div className="glass-liquid rounded-[14px] p-10 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand/8 flex items-center justify-center">
              <svg className="w-8 h-8 text-brand/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h4v8H3V13zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" /></svg>
            </div>
            <p className="text-muted text-sm">{viewMode === "today" ? t("dash.noData") : t("dash.noHistory")}</p>
            {viewMode === "today" && <button onClick={() => router.push("/upload")} className="mt-3 text-brand font-semibold text-sm active:opacity-70">{t("search.uploadReport")}</button>}
          </div>
        )}

        {/* ═══ 1. HERO CARD — Ring + Room Status + People ═══ */}
        {hasData && (
          <div className="glass-liquid rounded-[20px] p-5 animate-sectionIn">
            <div className="flex items-center gap-5">
              {/* Ring */}
              <div className="relative shrink-0">
                <DonutRing percent={utilPercent} size={96} stroke={7} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-[28px] font-black leading-none ${utilPercent >= 70 ? "text-green-600 dark:text-green-400" : utilPercent >= 40 ? "text-brand" : "text-red-500"}`}>
                    <AnimatedNumber value={utilPercent} duration={900} /><span className="text-[14px]">%</span>
                  </span>
                  <span className="text-[8px] text-muted uppercase tracking-widest mt-0.5">service</span>
                </div>
              </div>

              {/* Room status */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-[13px] text-dark">{t("dash.allIn")}</span></div>
                  <AnimatedNumber value={rs.allIn} className="text-[15px] font-black text-green-600 dark:text-green-400 tabular-nums" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand" /><span className="text-[13px] text-dark">{t("dash.partial")}</span></div>
                  <AnimatedNumber value={rs.partial} className="text-[15px] font-black text-brand tabular-nums" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[13px] text-dark">{t("dash.absent")}</span></div>
                  <AnimatedNumber value={rs.noShow} className="text-[15px] font-black text-red-500 dark:text-red-400 tabular-nums" />
                </div>
                {/* Bar */}
                {rs.totalRooms > 0 && (
                  <div className="flex h-1.5 rounded-full overflow-hidden mt-1">
                    {rs.allIn > 0 && <div className="bg-green-500" style={{ width: `${(rs.allIn / rs.totalRooms) * 100}%` }} />}
                    {rs.partial > 0 && <div className="bg-brand" style={{ width: `${(rs.partial / rs.totalRooms) * 100}%` }} />}
                    {rs.noShow > 0 && <div className="bg-red-500" style={{ width: `${(rs.noShow / rs.totalRooms) * 100}%` }} />}
                  </div>
                )}
              </div>
            </div>

            {/* People row */}
            <div className="grid grid-cols-3 mt-4 pt-3 border-t border-black/[0.04] dark:border-white/[0.06]">
              <div className="text-center">
                <AnimatedNumber value={totalPeople} className="text-[22px] font-black text-dark tabular-nums" duration={700} />
                <div className="text-[9px] text-muted uppercase tracking-wider">{t("dash.totalPeople")}</div>
              </div>
              <div className="text-center border-x border-black/[0.04] dark:border-white/[0.06]">
                <AnimatedNumber value={enteredPeople} className="text-[22px] font-black text-green-600 dark:text-green-400 tabular-nums" duration={700} />
                <div className="text-[9px] text-green-700/70 dark:text-green-400/70 uppercase tracking-wider">{t("dash.peopleIn")}</div>
              </div>
              <div className="text-center">
                <AnimatedNumber value={remainingPeople} className="text-[22px] font-black text-red-500 dark:text-red-400 tabular-nums" duration={700} />
                <div className="text-[9px] text-red-500/70 dark:text-red-400/70 uppercase tracking-wider">{t("dash.peopleLeft")}</div>
              </div>
            </div>

            {/* Compliment + cost — tiny inline */}
            {compCount > 0 && (
              <div className="flex items-center justify-center gap-2 mt-3 pt-2.5 border-t border-black/[0.04] dark:border-white/[0.06]">
                <Badge variant="success" className="uppercase tracking-wide">{t("metrics.comp")}</Badge>
                <span className="text-sm font-black text-dark tabular-nums">{compCount} {t("dash.guests")}</span>
                <button onClick={() => setEditingCost(!editingCost)} className="text-sm font-black text-brand tabular-nums active:opacity-70">{compCost}€</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ 1.5 SOURCE BREAKDOWN — Liste vs VIP-only vs Walk-in ═══ */}
        {hasData && viewMode === "today" && todayReport && (todayReport.sourceBreakdown.vipListOnlyRooms > 0 || todayReport.sourceBreakdown.walkInRooms > 0) && (
          <Card className="animate-sectionIn" style={{ animationDelay: "80ms" }}>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-brand" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted">
                    {t("report.sourceBreakdownTitle")}
                  </span>
                </div>
                <span className="text-[8px] text-muted/80">
                  {t("report.sourceBreakdownDesc")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[10px] bg-black/[0.03] dark:bg-white/[0.04] p-2.5">
                  <div className="flex items-center gap-1 text-[8px] text-muted uppercase font-semibold">
                    <Users className="size-3" />
                    {t("report.sourceList")}
                  </div>
                  <div className="text-xl font-black text-dark tabular-nums mt-0.5">
                    {todayReport.sourceBreakdown.listEntered}
                  </div>
                  <div className="text-[8px] text-muted">
                    {todayReport.sourceBreakdown.listRooms} {t("upload.rooms")}
                  </div>
                </div>
                <div className="rounded-[10px] bg-brand/[0.06] p-2.5">
                  <div className="flex items-center gap-1 text-[8px] text-brand uppercase font-semibold">
                    <Crown className="size-3" />
                    {t("report.sourceVipOnly")}
                  </div>
                  <div className="text-xl font-black text-brand tabular-nums mt-0.5">
                    {todayReport.sourceBreakdown.vipListOnlyEntered}
                  </div>
                  <div className="text-[8px] text-brand/70">
                    {todayReport.sourceBreakdown.vipListOnlyRooms} {t("upload.rooms")}
                  </div>
                </div>
                <div className="rounded-[10px] bg-amber-500/[0.08] p-2.5">
                  <div className="flex items-center gap-1 text-[8px] text-amber-700 dark:text-amber-400 uppercase font-semibold">
                    <Footprints className="size-3" />
                    {t("report.sourceWalkIn")}
                  </div>
                  <div className="text-xl font-black text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                    {todayReport.sourceBreakdown.walkInEntered}
                  </div>
                  <div className="text-[8px] text-amber-700/70 dark:text-amber-400/70">
                    {todayReport.sourceBreakdown.walkInRooms} {t("upload.rooms")}
                  </div>
                </div>
              </div>

              {(todayReport.sourceBreakdown.byPayment.points + todayReport.sourceBreakdown.byPayment.paid_onsite + todayReport.sourceBreakdown.byPayment.room_charge + todayReport.sourceBreakdown.byPayment.compliment + todayReport.sourceBreakdown.byPayment.pass) > 0 && (
                <div className="pt-2 border-t border-black/5 dark:border-white/8">
                  <div className="text-[8px] text-muted uppercase font-semibold mb-1.5">
                    {t("report.paymentMixOffList")}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    <div>
                      <div className="text-sm font-black text-blue-600 dark:text-blue-400 tabular-nums">{todayReport.sourceBreakdown.byPayment.points}</div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusPoints")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums">{todayReport.sourceBreakdown.byPayment.paid_onsite}</div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusPaid")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-purple-600 dark:text-purple-400 tabular-nums">{todayReport.sourceBreakdown.byPayment.room_charge}</div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusRoom")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-green-600 dark:text-green-400 tabular-nums">{todayReport.sourceBreakdown.byPayment.compliment}</div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusCompliment")}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-muted tabular-nums">{todayReport.sourceBreakdown.byPayment.pass}</div>
                      <div className="text-[7px] text-muted uppercase">{t("reception.statusPass")}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ 2. ARRIVAL TIME — Vertical bar chart 6:00–11:00 ═══ */}
        {hasData && !metricFilter && !clientSearch && (() => {
          const hasAnyCheckins = activeRushSlots.some((s) => s.count > 0);
          if (!hasAnyCheckins) return (
            <section className="animate-sectionIn" style={{ animationDelay: "100ms" }}>
              <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] mb-2 px-1">{t("dash.rushHours")}</h2>
              <div className="glass-liquid rounded-[16px] p-6 text-center">
                <div className="text-[22px] mb-1">⏳</div>
                <p className="text-xs text-muted">{t("dash.noRushData")}</p>
              </div>
            </section>
          );
          return null;
        })()}
        {/* Today: zoomable chart (5/10/30/60). Period: legacy bar chart */}
        {hasData && viewMode === "today" && todayData && rushSlots.some((s) => s.count > 0) && !metricFilter && !clientSearch && (
          <section className="animate-sectionIn" style={{ animationDelay: "100ms" }}>
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] mb-2 px-1">{t("dash.rushHours")}</h2>
            <RushHourChart data={todayData} />
          </section>
        )}
        {hasData && viewMode !== "today" && periodRushSlots.some((s) => s.count > 0) && !metricFilter && !clientSearch && (
          <section className="animate-sectionIn" style={{ animationDelay: "100ms" }}>
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] mb-2 px-1">{t("dash.rushHours")}</h2>
            <div className="glass-liquid rounded-[16px] p-4">
              <div className="flex items-end gap-[3px] h-28">
                {periodRushSlots.map((slot, i) => {
                  const max = Math.max(...periodRushSlots.map((s) => s.count), 1);
                  const pct = max > 0 ? (slot.count / max) * 100 : 0;
                  return (
                    <div key={slot.label} className="flex-1 flex flex-col items-center h-full justify-end">
                      {slot.count > 0 && (
                        <span className="text-[8px] font-bold text-dark tabular-nums mb-0.5">{slot.count}</span>
                      )}
                      <div
                        className={`w-full rounded-t-[3px] animate-barGrow ${
                          slot.isPeak && slot.count > 0 ? "bg-brand" : slot.count > 0 ? "bg-brand/40 dark:bg-brand-light/40" : "bg-black/[0.03] dark:bg-white/[0.04]"
                        }`}
                        style={{ height: `${Math.max(pct, slot.count > 0 ? 8 : 3)}%`, animationDelay: `${200 + i * 40}ms` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex mt-1.5">
                {periodRushSlots.map((slot, i) => (
                  <div key={slot.label} className="flex-1 text-center">
                    {i % 2 === 0 && (
                      <span className="text-[8px] text-muted tabular-nums">{slot.label.replace(":00", "h")}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ 3. TAPPABLE FILTER CARDS (today view) — always visible ═══ */}
        {viewMode === "today" && snapshot && (
          <div className="grid grid-cols-4 gap-2 animate-sectionIn" style={{ animationDelay: "200ms" }}>
            {([
              { key: "all" as MetricFilter, label: t("dash.expected"), value: String(snapshot.totalExpected), sub: `${todayData?.clients.length} ${t("dash.rooms")}`, color: "text-dark" },
              { key: "show" as MetricFilter, label: t("dash.showedUp"), value: String(snapshot.totalShowedUp), sub: `${roomStatus.allIn + roomStatus.partial} ${t("dash.rooms")}`, color: "text-green-600 dark:text-green-400" },
              { key: "noshow" as MetricFilter, label: t("dash.noShows"), value: String(snapshot.noShows), sub: `${roomStatus.noShow} ${t("dash.rooms")}`, color: "text-red-500 dark:text-red-400" },
              { key: "comp" as MetricFilter, label: t("metrics.comp"), value: String(snapshot.compCount), sub: `${snapshot.compCost}€`, color: "text-green-700 dark:text-green-400" },
            ]).map(({ key, label, value, sub, color }) => (
              <button key={key} onClick={() => handleMetricTap(key)}
                className={`rounded-[14px] p-3 text-center transition-all active:scale-[0.95] ${
                  metricFilter === key ? "glass-liquid-active ring-1 ring-brand/20" : "glass-liquid"
                }`}>
                <div className="text-[8px] text-muted uppercase tracking-wider font-semibold">{label}</div>
                <AnimatedNumber value={parseInt(value) || 0} className={`text-[22px] font-black tabular-nums leading-tight ${color}`} duration={600} />
                <div className="text-[9px] text-muted mt-0.5">{sub}</div>
              </button>
            ))}
          </div>
        )}

        {/* ═══ 3a. SEARCH BAR (today view) — always below metrics ═══ */}
        {viewMode === "today" && todayData && (
          <div>
            <input type="text" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
              placeholder={t("dash.searchClients")}
              aria-label={t("dash.searchClients")}
              className="w-full px-3 py-2 rounded-xl glass-liquid text-sm text-dark placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </div>
        )}

        {/* ═══ 3b. FILTERED TABLE (after metric tap or search) ═══ */}
        {viewMode === "today" && (metricFilter || clientSearch) && todayData && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] px-1">
                {filteredClients.length} {t("upload.rooms")}
              </h2>
              {metricFilter && (
                <button onClick={() => setMetricFilter(null)} className="text-xs text-brand font-semibold active:opacity-70">{t("upload.clear")}</button>
              )}
            </div>

            <div className="glass-liquid rounded-[14px] overflow-hidden">
              <div className="grid grid-cols-[55px_1fr_44px_44px] px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.06]">
                <span className="text-[8px] text-muted uppercase font-bold tracking-wider">{t("checkin.room")}</span>
                <span className="text-[8px] text-muted uppercase font-bold tracking-wider">{t("checkin.guestName")}</span>
                <span className="text-[8px] text-muted uppercase font-bold tracking-wider text-center">N</span>
                <span className="text-[8px] text-muted uppercase font-bold tracking-wider text-right"></span>
              </div>
              {displayedClients.map((client, i) => {
                const ci = todayData.clients.indexOf(client);
                const remaining = getRemainingForRoom(client, todayData.checkIns);
                const total = client.adults + client.children;
                const checkedIn = remaining === 0 && total > 0;
                const comp = isComp(client);
                return (
                  <button key={`${client.roomNumber}-${i}`}
                    onClick={() => router.push(`/checkin/${client.roomNumber}${ci >= 0 ? `?ci=${ci}` : ""}`)}
                    className={`grid grid-cols-[55px_1fr_44px_44px] px-3 py-2 items-center border-b border-black/[0.03] dark:border-white/[0.04] last:border-0 w-full text-left active:bg-black/[0.03] dark:active:bg-white/[0.03] transition-colors ${
                      comp ? "bg-green-500/[0.04]" : ""
                    }`}>
                    <div className="flex items-center gap-1">
                      <span className="text-[13px] font-bold font-mono text-dark">{client.roomNumber}</span>
                      {client.isVip && <span className="text-[6px] bg-gradient-to-r from-brand to-brand-light text-white px-1 py-px rounded-full font-black">V</span>}
                    </div>
                    <div className="min-w-0">
                      <span className={`text-[12px] text-dark truncate block ${comp ? "underline decoration-green-500 decoration-2 underline-offset-2" : ""}`}>{client.name}</span>
                    </div>
                    <div className="text-center">
                      <span className={`text-[13px] font-bold tabular-nums ${checkedIn ? "text-green-600 dark:text-green-400" : "text-dark"}`}>{total - remaining}/{total}</span>
                    </div>
                    <div className="text-right">
                      {comp && <span className="text-[7px] bg-green-500/15 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold">COMP</span>}
                      {!comp && checkedIn && <span className="text-[7px] bg-green-500/15 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold">IN</span>}
                      {!comp && !checkedIn && <span className="text-[7px] bg-black/[0.04] dark:bg-white/[0.06] text-muted px-1.5 py-0.5 rounded-full font-bold">—</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            {filteredClients.length > 15 && (
              <button onClick={() => setShowAllClients(!showAllClients)}
                className="mt-2 w-full text-center text-[11px] font-semibold text-brand active:opacity-70 py-1">
                {showAllClients ? t("dash.showLess") : `${t("dash.showAll")} (${filteredClients.length})`}
              </button>
            )}
          </section>
        )}

        {/* ═══ 4. RECENT CHECK-INS (today, compact) ═══ */}
        {viewMode === "today" && todayData && todayData.checkIns.length > 0 && !metricFilter && !clientSearch && (
          <section>
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] mb-2 px-1">{t("dash.recentCheckins")}</h2>
            <div className="glass-liquid rounded-[14px] divide-y divide-black/[0.04] dark:divide-white/[0.05] overflow-hidden">
              {[...todayData.checkIns].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6).map((ci) => (
                <div key={ci.id} className="px-3 py-2 flex items-center gap-3">
                  <span className="text-[11px] text-muted font-mono w-11 shrink-0">{formatTime(ci.timestamp)}</span>
                  <span className="text-[13px] font-bold font-mono text-dark w-10 shrink-0">{ci.roomNumber}</span>
                  <span className="text-[11px] text-muted truncate flex-1">{ci.clientName}</span>
                  <span className="text-[11px] font-bold text-brand tabular-nums">{ci.peopleEntered}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ 5. WEEKLY TREND (always visible when data exists) ═══ */}
        {trendData.length > 0 && !metricFilter && !clientSearch && (
          <section className="animate-sectionIn" style={{ animationDelay: "300ms" }}>
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] mb-2 px-1">
              {viewMode === "today" ? t("dash.last7") : t("dash.trend")}
            </h2>
            <div className="glass-liquid rounded-[16px] p-4">
              <div className="flex items-end gap-1.5 h-24">
                {trendData.map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center h-full justify-end">
                    <span className="text-[9px] font-bold text-dark tabular-nums mb-0.5">
                      {day.utilization > 0 ? `${day.utilization}%` : ""}
                    </span>
                    <div className="w-full bg-black/[0.03] dark:bg-white/[0.04] rounded-[3px] relative flex-1 flex items-end">
                      <div className={`w-full rounded-[3px] transition-all duration-500 ${
                        day.utilization >= 80 ? "bg-green-500" : day.utilization >= 50 ? "bg-brand/60" : day.utilization > 0 ? "bg-red-400/60" : ""
                      }`} style={{ height: `${day.utilization}%` }} />
                    </div>
                    <span className="text-[9px] text-muted mt-1">{day.dayLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ 6. QUICK NAV ═══ */}
        <section>
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] mb-2 px-1">{t("dash.quickNav")}</h2>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => router.push("/clients")} className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all">
              <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-dark">{t("upload.clients")}</span>
            </button>
            <button onClick={() => router.push("/reports")} className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all">
              <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-dark">{t("upload.reports")}</span>
            </button>
            {todayData ? (
              <button onClick={() => router.push("/upload?mode=add")} className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all">
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-dark">{t("search.upload")}</span>
              </button>
            ) : (
              <button onClick={() => router.push("/reports")} className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all">
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-dark">{t("dash.download")}</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
