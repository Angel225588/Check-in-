"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { Activity, Clock, Users } from "lucide-react";
import type { DailyData } from "@/lib/types";
import { getRushHourSlots, BucketMinutes } from "@/lib/analytics";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "rushChartBucket";

function getInitialBucket(): BucketMinutes {
  if (typeof window === "undefined") return 30;
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = Number(raw);
  return n === 5 || n === 10 || n === 30 || n === 60 ? (n as BucketMinutes) : 30;
}

function getStaffKey(date: string): string {
  return `morningStaffCount_${date}`;
}

// Min width per bar (px) — ensures readable size and triggers horizontal scroll
// when too many buckets to fit the container.
const MIN_BAR_WIDTH: Record<BucketMinutes, number> = {
  5: 22,
  10: 26,
  30: 40,
  60: 56,
};

// Moving average window size (in buckets) — how many buckets to average.
const MA_WINDOW = 3;

interface Props {
  data: DailyData;
  className?: string;
  variant?: "default" | "compact";
}

export default function RushHourChart({
  data,
  className,
  variant = "default",
}: Props) {
  const { t } = useApp();
  const [bucket, setBucket] = useState<BucketMinutes>(30);
  const [staffCount, setStaffCount] = useState<string>("");
  const [staffEditing, setStaffEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBucket(getInitialBucket());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(getStaffKey(data.date));
    setStaffCount(raw ?? "");
  }, [data.date]);

  const handleBucketChange = (val: string) => {
    const n = Number(val) as BucketMinutes;
    setBucket(n);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(n));
    }
  };

  const handleStaffSave = (val: string) => {
    const sanitized = val.replace(/[^0-9]/g, "").slice(0, 3);
    setStaffCount(sanitized);
    if (typeof window !== "undefined") {
      if (sanitized) {
        localStorage.setItem(getStaffKey(data.date), sanitized);
      } else {
        localStorage.removeItem(getStaffKey(data.date));
      }
    }
  };

  const slots = useMemo(() => getRushHourSlots(data, bucket), [data, bucket]);
  const maxCount = useMemo(
    () => Math.max(...slots.map((s) => s.count), 1),
    [slots]
  );
  const peak = useMemo(
    () => slots.find((s) => s.isPeak && s.count > 0),
    [slots]
  );
  const totalEntered = useMemo(
    () => slots.reduce((sum, s) => sum + s.count, 0),
    [slots]
  );

  // Centered moving average (window = MA_WINDOW). Smoothes the curve so the
  // chart reads like a trading chart with bars + trend line.
  const movingAvg = useMemo(() => {
    if (slots.length === 0) return [] as number[];
    const half = Math.floor(MA_WINDOW / 2);
    return slots.map((_, i) => {
      const start = Math.max(0, i - half);
      const end = Math.min(slots.length, i + half + 1);
      let sum = 0;
      for (let k = start; k < end; k++) sum += slots[k].count;
      return sum / (end - start);
    });
  }, [slots]);

  const hasData = slots.some((s) => s.count > 0);
  const labelEvery = bucket === 5 ? 4 : bucket === 10 ? 2 : 1;
  const minBarWidth = MIN_BAR_WIDTH[bucket];
  const totalGridWidth = slots.length * (minBarWidth + 3);
  const chartHeightClass = variant === "compact" ? "h-28" : "h-44";
  const chartHeightPx = variant === "compact" ? 112 : 176;

  // Build SVG polyline points for the moving average overlay
  const polylinePoints = useMemo(() => {
    if (movingAvg.length === 0) return "";
    return movingAvg
      .map((v, i) => {
        const x = (i + 0.5) * (minBarWidth + 3);
        const y = chartHeightPx - (maxCount > 0 ? (v / maxCount) * chartHeightPx : 0);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [movingAvg, minBarWidth, maxCount, chartHeightPx]);

  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardContent className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-brand" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted">
                {t("report.rushHour")}
              </span>
            </div>
            {/* Staff in room — manual input */}
            <button
              onClick={() => setStaffEditing(true)}
              className="no-print flex items-center gap-1 px-2 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.10] transition-colors"
              aria-label={t("chart.staffInRoom")}
            >
              <Users className="size-3 text-muted" />
              {staffEditing ? (
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={staffCount}
                  onChange={(e) => handleStaffSave(e.target.value)}
                  onBlur={() => setStaffEditing(false)}
                  onKeyDown={(e) => e.key === "Enter" && setStaffEditing(false)}
                  className="w-8 bg-transparent text-[10px] font-bold tabular-nums text-dark text-center focus:outline-none"
                  placeholder="—"
                />
              ) : (
                <span className="text-[10px] font-bold tabular-nums text-dark">
                  {staffCount || "—"}
                </span>
              )}
              <span className="text-[9px] text-muted">{t("chart.staffShort")}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {peak && (
              <Badge variant="default" className="gap-1 text-[9px] px-2 py-1">
                <Clock className="size-3" />
                {t("report.peakTime")}: {peak.label}
              </Badge>
            )}
            <Tabs
              value={String(bucket)}
              onValueChange={handleBucketChange}
              className="shrink-0 no-print"
            >
              <TabsList className="h-7 p-0.5">
                <TabsTrigger value="5" className="h-6 px-2 text-[10px]">5m</TabsTrigger>
                <TabsTrigger value="10" className="h-6 px-2 text-[10px]">10m</TabsTrigger>
                <TabsTrigger value="30" className="h-6 px-2 text-[10px]">30m</TabsTrigger>
                <TabsTrigger value="60" className="h-6 px-2 text-[10px]">1h</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Chart */}
        {!hasData ? (
          <div className="text-center py-6 text-xs text-muted">
            {t("dash.noRushData")}
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="overflow-x-auto -mx-1 px-1 scrollbar-thin"
            >
              <div
                className="relative"
                style={{ width: `${totalGridWidth}px`, minWidth: "100%" }}
              >
                {/* Bars */}
                <div
                  className={cn(
                    "flex items-end gap-[3px] relative z-0",
                    chartHeightClass
                  )}
                >
                  {slots.map((slot) => (
                    <div
                      key={slot.time}
                      className="flex flex-col items-center gap-1 shrink-0"
                      style={{ width: `${minBarWidth}px` }}
                    >
                      <span
                        className={cn(
                          "text-[10px] font-bold tabular-nums leading-none",
                          slot.isPeak ? "text-brand" : "text-muted/70"
                        )}
                      >
                        {slot.count > 0 ? slot.count : ""}
                      </span>
                      <div className="w-full relative flex-1">
                        <div
                          className={cn(
                            "absolute bottom-0 w-full rounded-t-[4px] transition-all duration-700",
                            slot.isPeak
                              ? "bg-gradient-to-t from-brand to-brand-light shadow-[0_0_12px_-2px] shadow-brand/40"
                              : slot.count > 0
                              ? "bg-brand/45 dark:bg-brand/55"
                              : "bg-black/[0.04] dark:bg-white/[0.04]"
                          )}
                          style={{
                            height: `${maxCount > 0 ? (slot.count / maxCount) * 100 : 0}%`,
                            minHeight: slot.count > 0 ? "5px" : "0",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Moving average line — SVG overlay */}
                <svg
                  className="absolute left-0 pointer-events-none"
                  style={{
                    top: "14px", // accounts for the count labels above the bars
                    width: `${totalGridWidth}px`,
                    height: `${chartHeightPx}px`,
                  }}
                  viewBox={`0 0 ${totalGridWidth} ${chartHeightPx}`}
                  preserveAspectRatio="none"
                >
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke="#A66914"
                    strokeWidth="2"
                    strokeOpacity="0.85"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 3"
                  />
                </svg>

                {/* X-axis labels — same min-width grid */}
                <div className="flex items-start gap-[3px] mt-1.5">
                  {slots.map((slot, i) => (
                    <div
                      key={slot.time}
                      className="flex justify-center shrink-0"
                      style={{ width: `${minBarWidth}px` }}
                    >
                      {i % labelEvery === 0 && (
                        <span
                          className={cn(
                            "text-[8px] tabular-nums leading-none",
                            slot.isPeak ? "text-brand font-bold" : "text-muted/70"
                          )}
                        >
                          {slot.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer summary */}
            <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/8 text-[10px] flex-wrap gap-2">
              <span className="text-muted">
                <span className="font-bold tabular-nums text-dark">{totalEntered}</span>{" "}
                {t("report.persons").toLowerCase()}
              </span>
              <span className="inline-flex items-center gap-1 text-muted">
                <span
                  className="inline-block w-3 h-[2px] bg-brand rounded-full"
                  style={{ borderTop: "2px dashed #A66914" }}
                />
                {t("chart.movingAvg")}
              </span>
              {peak && (
                <span className="text-muted">
                  Pic:{" "}
                  <span className="font-bold tabular-nums text-brand">
                    {peak.count}
                  </span>{" "}
                  @ {peak.label}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
