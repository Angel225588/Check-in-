"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity, Clock } from "lucide-react";
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

  useEffect(() => {
    setBucket(getInitialBucket());
  }, []);

  const handleBucketChange = (val: string) => {
    const n = Number(val) as BucketMinutes;
    setBucket(n);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(n));
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

  const hasData = slots.some((s) => s.count > 0);

  // Show every Nth label to avoid overlap when granularity is high
  const labelEvery = bucket === 5 ? 4 : bucket === 10 ? 2 : 1;

  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardContent className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-brand" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted">
              {t("report.rushHour")}
            </span>
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
              className="shrink-0"
            >
              <TabsList className="h-7 p-0.5">
                <TabsTrigger value="5" className="h-6 px-2 text-[10px]">
                  5m
                </TabsTrigger>
                <TabsTrigger value="10" className="h-6 px-2 text-[10px]">
                  10m
                </TabsTrigger>
                <TabsTrigger value="30" className="h-6 px-2 text-[10px]">
                  30m
                </TabsTrigger>
                <TabsTrigger value="60" className="h-6 px-2 text-[10px]">
                  1h
                </TabsTrigger>
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
              className={cn(
                "flex items-end gap-[2px]",
                variant === "compact" ? "h-16" : "h-24"
              )}
            >
              {slots.map((slot) => (
                <div
                  key={slot.time}
                  className="flex-1 flex flex-col items-center gap-0.5 min-w-0"
                >
                  <span
                    className={cn(
                      "text-[8px] font-bold tabular-nums leading-none",
                      slot.isPeak ? "text-brand" : "text-muted/60"
                    )}
                  >
                    {slot.count > 0 ? slot.count : ""}
                  </span>
                  <div className="w-full relative flex-1">
                    <div
                      className={cn(
                        "absolute bottom-0 w-full rounded-t-[3px] transition-all duration-700",
                        slot.isPeak
                          ? "bg-gradient-to-t from-brand to-brand-light"
                          : slot.count > 0
                          ? "bg-brand/40 dark:bg-brand/50"
                          : "bg-black/[0.04] dark:bg-white/[0.04]"
                      )}
                      style={{
                        height: `${maxCount > 0 ? (slot.count / maxCount) * 100 : 0}%`,
                        minHeight: slot.count > 0 ? "3px" : "0",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* X-axis labels */}
            <div className="flex items-start gap-[2px]">
              {slots.map((slot, i) => (
                <div
                  key={slot.time}
                  className="flex-1 flex justify-center min-w-0"
                >
                  {i % labelEvery === 0 && (
                    <span
                      className={cn(
                        "text-[7px] tabular-nums leading-none",
                        slot.isPeak ? "text-brand font-bold" : "text-muted/70"
                      )}
                    >
                      {slot.label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Footer summary */}
            <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/8 text-[10px]">
              <span className="text-muted">
                <span className="font-bold tabular-nums text-dark">
                  {totalEntered}
                </span>{" "}
                {t("report.persons").toLowerCase()}
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
