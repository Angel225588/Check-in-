"use client";
import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  AlertTriangle,
  Crown,
  Clock,
  Printer,
} from "lucide-react";
import {
  getTodayData,
  getSessionHistory,
  getDataForDate,
} from "@/lib/storage";
import {
  getReceptionWatchlist,
  countByStatus,
  ReceptionStatus,
  ReceptionWatchlistEntry,
} from "@/lib/reception-report";
import { formatTime, cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import type { TranslationKey } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Filter = "all" | "not_yet" | "came";

function statusKey(s: ReceptionStatus): TranslationKey {
  switch (s) {
    case "not_yet":
      return "reception.statusNotYet";
    case "came_points":
      return "reception.statusPoints";
    case "came_paid_onsite":
      return "reception.statusPaid";
    case "came_room_charge":
      return "reception.statusRoom";
    case "came_pass":
      return "reception.statusPass";
    case "came_compliment":
      return "reception.statusCompliment";
    default:
      return "reception.statusCame";
  }
}

function statusVariant(
  s: ReceptionStatus
): "default" | "success" | "warning" | "error" | "info" | "purple" | "muted" | "vip" {
  if (s === "not_yet") return "error";
  if (s === "came_compliment") return "success";
  if (s === "came_points") return "info";
  if (s === "came_paid_onsite") return "warning";
  if (s === "came_room_charge") return "purple";
  if (s === "came_pass") return "muted";
  return "default";
}

export default function ReceptionReportWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
          <div className="text-muted">Loading…</div>
        </div>
      }
    >
      <ReceptionReportPage />
    </Suspense>
  );
}

function ReceptionReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useApp();
  const [entries, setEntries] = useState<ReceptionWatchlistEntry[]>([]);
  const [date, setDate] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const dateParam = searchParams.get("date");
    let data = null;
    if (dateParam) {
      const sessions = getSessionHistory();
      const session = sessions.find((s) => s.date === dateParam);
      const unclosed = getDataForDate(dateParam);
      if (session) {
        data = {
          date: session.date,
          clients: session.clients,
          checkIns: session.checkIns,
        };
      } else if (unclosed) {
        data = unclosed;
      }
    } else {
      data = getTodayData();
    }
    if (!data || data.clients.length === 0) {
      setEntries([]);
      setDate(dateParam || new Date().toISOString().split("T")[0]);
      setLoaded(true);
      return;
    }
    setEntries(getReceptionWatchlist(data.clients, data.checkIns));
    setDate(data.date);
    setLoaded(true);
  }, [searchParams]);

  const counts = useMemo(() => countByStatus(entries), [entries]);
  const cameTotal = entries.length - counts.not_yet;
  const isLegacy = entries.length > 0 && entries[0].isLegacyData;

  const filtered = useMemo(() => {
    let list = entries;
    if (filter === "not_yet") list = list.filter((e) => e.status === "not_yet");
    else if (filter === "came")
      list = list.filter((e) => e.status !== "not_yet");
    return [...list].sort((a, b) => {
      if (a.status === "not_yet" && b.status !== "not_yet") return -1;
      if (b.status === "not_yet" && a.status !== "not_yet") return 1;
      const ta = a.checkInTimestamp || "";
      const tb = b.checkInTimestamp || "";
      return ta.localeCompare(tb);
    });
  }, [entries, filter]);

  const formatDate = (d: string) => {
    try {
      const dt = new Date(d + "T12:00:00");
      return dt.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="min-h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        {/* HEADER */}
        <div className="sticky top-0 z-30 bg-[#FBF8F3]/90 dark:bg-[#0A0A0F]/90 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <Button
                variant="glass"
                size="sm"
                onClick={() => router.push("/report")}
                className="no-print"
              >
                <ChevronLeft className="size-4 text-brand" />
                <span className="text-brand">{t("report.back")}</span>
              </Button>
              <div className="flex flex-col items-end">
                <span
                  className="text-sm font-bold tracking-[0.08em] text-brand leading-tight"
                  style={{ fontFamily: "'Nunito', sans-serif" }}
                >
                  COURTYARD
                </span>
                <span className="text-[10px] text-muted leading-tight">
                  by{" "}
                  <span className="font-bold tracking-[0.05em] text-slate">
                    MARRIOTT
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-32 space-y-4 pt-2">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-lg font-black text-dark capitalize">
              {formatDate(date)}
            </h1>
            <p className="text-xs text-muted">{t("reception.title")}</p>
            <p className="text-[10px] text-muted/80 mt-0.5">
              {t("reception.subtitle")}
            </p>
          </div>

          {/* Legacy banner */}
          {isLegacy && (
            <Card className="border-amber-500/30 bg-amber-500/5 py-3">
              <CardContent className="flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  {t("reception.legacyBanner")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* KPI strip */}
          {entries.length > 0 && (
            <Card>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-black text-dark tabular-nums">
                      {entries.length}
                    </div>
                    <div className="text-[8px] text-muted uppercase tracking-wide">
                      Total
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-error tabular-nums">
                      {counts.not_yet}
                    </div>
                    <div className="text-[8px] text-muted uppercase tracking-wide">
                      {t("reception.statusNotYet")}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-green-600 dark:text-green-400 tabular-nums">
                      {cameTotal}
                    </div>
                    <div className="text-[8px] text-muted uppercase tracking-wide">
                      {t("reception.statusCame")}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-brand tabular-nums">
                      {counts.came_points +
                        counts.came_paid_onsite +
                        counts.came_room_charge}
                    </div>
                    <div className="text-[8px] text-muted uppercase tracking-wide">
                      Pts/Pay/Ch
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/8 grid grid-cols-3 gap-2 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">
                      {t("reception.statusPoints")}
                    </span>
                    <Badge variant="info" className="tabular-nums">
                      {counts.came_points}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">
                      {t("reception.statusPaid")}
                    </span>
                    <Badge variant="warning" className="tabular-nums">
                      {counts.came_paid_onsite}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">
                      {t("reception.statusCompliment")}
                    </span>
                    <Badge variant="success" className="tabular-nums">
                      {counts.came_compliment}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filter tabs (shadcn) */}
          {entries.length > 0 && (
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as Filter)}
              className="no-print"
            >
              <TabsList>
                <TabsTrigger value="all">
                  {t("reception.filterAll")}{" "}
                  <span className="opacity-60 ml-1">{entries.length}</span>
                </TabsTrigger>
                <TabsTrigger value="not_yet">
                  {t("reception.filterNotYet")}{" "}
                  <span className="opacity-60 ml-1">{counts.not_yet}</span>
                </TabsTrigger>
                <TabsTrigger value="came">
                  {t("reception.filterCame")}{" "}
                  <span className="opacity-60 ml-1">{cameTotal}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Table */}
          {entries.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted">{t("reception.empty")}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="py-0 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[44px_1fr_64px_56px_88px] px-4 py-2.5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/5 dark:border-white/8">
                <span className="text-[7px] text-muted uppercase font-bold tracking-wider">
                  {t("reception.colRoom")}
                </span>
                <span className="text-[7px] text-muted uppercase font-bold tracking-wider">
                  {t("reception.colName")}
                </span>
                <span className="text-[7px] text-muted uppercase font-bold tracking-wider text-center">
                  {t("reception.colLevel")}
                </span>
                <span className="text-[7px] text-muted uppercase font-bold tracking-wider text-center">
                  {t("reception.colTime")}
                </span>
                <span className="text-[7px] text-muted uppercase font-bold tracking-wider text-right">
                  {t("reception.colMode")}
                </span>
              </div>

              {filtered.map((e, i) => (
                <div
                  key={`${e.roomNumber}-${e.name}-${i}`}
                  className={cn(
                    "grid grid-cols-[44px_1fr_64px_56px_88px] px-4 py-3 items-center border-b border-black/[0.03] dark:border-white/5 last:border-0 transition-colors",
                    e.status === "not_yet" && "bg-error/[0.04]",
                    e.status === "came_compliment" && "bg-green-500/[0.05]"
                  )}
                >
                  {/* Room */}
                  <span className="text-xs font-bold font-mono text-dark">
                    {e.roomNumber}
                  </span>

                  {/* Name + source */}
                  <div className="min-w-0 pr-1">
                    <span className="text-[12px] text-dark truncate block font-medium">
                      {e.name}
                    </span>
                    <span className="text-[8px] text-muted/80 uppercase tracking-wide">
                      {e.vipSource === "walk_in"
                        ? t("reception.sourceWalkIn")
                        : t("reception.sourceListOnly")}
                    </span>
                  </div>

                  {/* VIP level */}
                  <div className="text-center">
                    <Badge variant="vip" className="gap-0.5 px-1.5 py-1">
                      <Crown className="size-2.5" />
                      <span className="text-[9px]">{e.vipLevel || "VIP"}</span>
                    </Badge>
                  </div>

                  {/* Time */}
                  <div className="text-center">
                    {e.checkInTimestamp ? (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-muted">
                        <Clock className="size-2.5" />
                        {formatTime(e.checkInTimestamp)}
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted/40">—</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="text-right">
                    <Badge variant={statusVariant(e.status)}>
                      {t(statusKey(e.status))}
                    </Badge>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* FAB */}
        <div className="no-print fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#FBF8F3] dark:from-[#0A0A0F] via-[#FBF8F3] dark:via-[#0A0A0F] to-transparent pt-6">
          <div className="max-w-2xl mx-auto px-4 pb-4">
            <Button
              variant="glass"
              size="xl"
              onClick={() => window.print()}
              className="w-full"
            >
              <Printer className="size-5" />
              {t("reception.print")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
