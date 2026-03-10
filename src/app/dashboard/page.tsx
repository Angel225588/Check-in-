"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DailyData } from "@/lib/types";
import {
  getHistoricalData,
  getDataForRange,
  getSettings,
  saveSettings,
  getTodayData,
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
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [costPerCover, setCostPerCover] = useState(26);
  const [editingCost, setEditingCost] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [historicalData, setHistoricalData] = useState<DailyData[]>([]);
  const [todayData, setTodayData] = useState<DailyData | null>(null);

  useEffect(() => {
    const settings = getSettings();
    setCostPerCover(settings.costPerCover);
    setTodayData(getTodayData());
    setHistoricalData(getHistoricalData(7));
  }, []);

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

  // Compute analytics
  const snapshot = useMemo(
    () =>
      todayData
        ? getDailySnapshot(todayData, costPerCover)
        : null,
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

  const maxTrend = useMemo(
    () => Math.max(...trendData.map((d) => d.totalExpected), 1),
    [trendData]
  );

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-3 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push("/search")}
            className="text-blue-600 flex items-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Check-in
          </button>
          <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
          <button
            onClick={() => setEditingCost(!editingCost)}
            className="text-xs text-gray-500 underline"
          >
            {costPerCover}€/cover
          </button>
        </div>

        {/* Cost editor */}
        {editingCost && (
          <div className="bg-white rounded-xl p-3 mb-4 shadow-sm border flex items-center gap-3">
            <label className="text-sm text-gray-600">Cost per cover:</label>
            <input
              type="number"
              value={costPerCover}
              onChange={(e) => setCostPerCover(Number(e.target.value))}
              className="border rounded px-2 py-1 w-20 text-center"
            />
            <span className="text-sm">€</span>
            <button
              onClick={handleCostSave}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
            >
              Save
            </button>
          </div>
        )}

        {/* View mode tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => {
              setViewMode("today");
              setTodayData(getTodayData());
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "today"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => {
              setHistoricalData(getHistoricalData(7));
              setViewMode("7days");
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "7days"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border"
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setViewMode("custom")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "custom"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom date range picker */}
        {viewMode === "custom" && (
          <div className="bg-white rounded-xl p-3 mb-4 shadow-sm border">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={handleCustomRange}
                disabled={!customStart || !customEnd}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* === SECTION 1: DAILY SNAPSHOT === */}
        {viewMode === "today" && snapshot && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">
              Today&apos;s Snapshot
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Expected</div>
                <div className="text-3xl md:text-4xl font-bold">{snapshot.totalExpected}</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Showed Up</div>
                <div className="text-3xl md:text-4xl font-bold text-green-600">
                  {snapshot.totalShowedUp}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">No-Shows</div>
                <div className="text-3xl md:text-4xl font-bold text-red-500">
                  {snapshot.noShows}
                </div>
                <div className="text-xs text-red-400">{snapshot.noShowPercent}%</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Comp Cost</div>
                <div className="text-3xl md:text-4xl font-bold text-purple-600">
                  {snapshot.compCost}€
                </div>
                <div className="text-xs text-purple-400">
                  {snapshot.compShowedUp}/{snapshot.compCount} guests
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Period stats for 7-day or custom view */}
        {viewMode !== "today" && periodStats.totalDays > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">
              Period Summary ({periodStats.totalDays} days)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Avg Daily</div>
                <div className="text-3xl md:text-4xl font-bold">
                  {periodStats.avgDailyGuests}
                </div>
                <div className="text-xs text-gray-400">guests/day</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Utilization</div>
                <div className="text-3xl md:text-4xl font-bold text-green-600">
                  {periodStats.avgUtilization}%
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">No-Shows</div>
                <div className="text-3xl md:text-4xl font-bold text-red-500">
                  {periodStats.totalNoShows}
                </div>
                <div className="text-xs text-red-400">{periodStats.avgNoShowPercent}% avg</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Comp Cost</div>
                <div className="text-3xl md:text-4xl font-bold text-purple-600">
                  {periodStats.totalCompCost}€
                </div>
                <div className="text-xs text-purple-400">
                  {periodStats.totalCompGuests} guests
                </div>
              </div>
            </div>
          </section>
        )}

        {/* No data state */}
        {viewMode === "today" && !snapshot && (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border mb-6">
            <p className="text-gray-500">No data for today yet.</p>
            <button
              onClick={() => router.push("/upload")}
              className="mt-3 text-blue-600 underline text-sm"
            >
              Upload report
            </button>
          </div>
        )}

        {/* iPad: side by side layout for rush + trend */}
        <div className="md:grid md:grid-cols-2 md:gap-6">
          {/* === SECTION 2: RUSH HOURS === */}
          {(viewMode === "today" && todayData) && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                Rush Hours
              </h2>
              <div className="bg-white rounded-xl p-4 shadow-sm border">
                <div className="space-y-2">
                  {rushSlots.map((slot) => (
                    <div key={slot.time} className="flex items-center gap-2">
                      <div className="w-12 text-xs text-gray-500 font-mono text-right shrink-0">
                        {slot.label}
                      </div>
                      <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            slot.isPeak ? "bg-orange-500" : "bg-blue-400"
                          }`}
                          style={{
                            width: `${maxRush > 0 ? (slot.count / maxRush) * 100 : 0}%`,
                            minWidth: slot.count > 0 ? "8px" : "0px",
                          }}
                        />
                        {slot.count > 0 && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-700">
                            {slot.count}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {rushSlots.some((s) => s.isPeak && s.count > 0) && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-3 h-3 bg-orange-500 rounded-full" />
                    Peak time
                  </div>
                )}
              </div>
            </section>
          )}

          {/* === SECTION 3: 7-DAY TREND === */}
          {trendData.length > 0 && (viewMode === "7days" || viewMode === "custom" || viewMode === "today") && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                {viewMode === "today" ? "Last 7 Days" : "Trend"}
              </h2>
              <div className="bg-white rounded-xl p-4 shadow-sm border">
                {/* Utilization line (simplified as bars for clarity) */}
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2">Utilization %</div>
                  <div className="flex items-end gap-1 h-24 md:h-32">
                    {trendData.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center">
                        <div className="text-[10px] font-bold text-gray-700 mb-1">
                          {day.utilization > 0 ? `${day.utilization}%` : ""}
                        </div>
                        <div className="w-full bg-gray-100 rounded-t relative flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t transition-all duration-500 ${
                              day.utilization >= 80
                                ? "bg-green-500"
                                : day.utilization >= 50
                                  ? "bg-yellow-400"
                                  : "bg-red-400"
                            }`}
                            style={{ height: `${day.utilization}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1">{day.dayLabel}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* No-shows bar */}
                <div>
                  <div className="text-xs text-gray-500 mb-2">No-Shows</div>
                  <div className="flex items-end gap-1 h-16 md:h-20">
                    {trendData.map((day) => {
                      const maxNoShows = Math.max(...trendData.map((d) => d.noShows), 1);
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center">
                          {day.noShows > 0 && (
                            <div className="text-[10px] font-bold text-red-500 mb-0.5">
                              {day.noShows}
                            </div>
                          )}
                          <div className="w-full bg-gray-100 rounded-t relative flex-1 flex items-end">
                            <div
                              className="w-full bg-red-300 rounded-t transition-all duration-500"
                              style={{
                                height: `${maxNoShows > 0 ? (day.noShows / maxNoShows) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {day.date.slice(5)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded" /> 80%+
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-400 rounded" /> 50-79%
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-400 rounded" /> &lt;50%
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {viewMode !== "today" && trendData.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border mb-6">
            <p className="text-gray-500">
              No historical data yet. Data accumulates automatically each day you use the app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
