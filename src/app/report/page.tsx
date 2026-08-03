"use client";
import { Suspense, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CaretLeft, DownloadSimple, Check } from "@phosphor-icons/react/dist/ssr";
import { getTodayData, getSessionHistory, getDataForDate, closeDay, summarizeDiscrepancies } from "@/lib/storage";
import { generateDayReport, exportReportCSV, DayReport } from "@/lib/report";
import {
  buildArrivalRows,
  filterRows,
  outcomeSplit,
  presencePercent,
  ReportFilter,
} from "@/lib/report-v2";
import type { PaxDiscrepancy } from "@/lib/types";
import AffluenceChart from "@/components/report/AffluenceChart";
import PresenceRing from "@/components/report/PresenceRing";
import OutcomeTreemap from "@/components/report/OutcomeTreemap";
import ReportTiles, { ReportTile } from "@/components/report/ReportTiles";
import ArrivalList from "@/components/report/ArrivalList";
import DayGroups from "@/components/report/DayGroups";
import AlphaKeypad from "@/components/AlphaKeypad";
import NumericKeypad from "@/components/NumericKeypad";
import { checkinHref } from "@/lib/checkin-nav";
import { rememberOrigin } from "@/lib/back-nav";
import { groupBlocks, getChildrenCount } from "@/lib/groups";
import type { Client } from "@/lib/types";

export default function ReportPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh w-full bg-[#FBF8F3] dark:bg-[#12100E] p-3 flex flex-col gap-3">
          <div className="skeleton h-10 w-56" />
          <div className="flex-1 flex gap-3 min-h-0">
            <div className="flex-1 flex flex-col gap-3">
              <div className="skeleton h-[200px]" />
              <div className="skeleton flex-1" />
            </div>
            <div className="w-[300px] hidden md:flex flex-col gap-3">
              <div className="skeleton h-[210px]" />
              <div className="skeleton flex-1" />
            </div>
          </div>
        </div>
      }
    >
      <ReportV2 />
    </Suspense>
  );
}

function ReportV2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<DayReport | null>(null);
  const [discrepancies, setDiscrepancies] = useState<PaxDiscrepancy[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isHistorical, setIsHistorical] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [query, setQuery] = useState("");
  /** The app's keyboard, on the report too. Rooms are digits and names are
   *  letters, so it opens on the pad that matches what is already typed. */
  const [pad, setPad] = useState<null | "num" | "abc">(null);

  const dateParam = searchParams.get("date");

  useEffect(() => {
    if (dateParam) {
      const session = getSessionHistory().find((s) => s.date === dateParam);
      const unclosed = getDataForDate(dateParam);
      if (session) {
        setReport(generateDayReport(session.clients, session.checkIns));
        setDiscrepancies(session.discrepancies ?? []);
        setClients(session.clients);
      } else if (unclosed && unclosed.clients.length > 0) {
        setReport(generateDayReport(unclosed.clients, unclosed.checkIns));
        setDiscrepancies(unclosed.discrepancies ?? []);
        setClients(unclosed.clients);
      } else {
        router.push("/reports");
        return;
      }
      setIsHistorical(true);
      return;
    }
    const data = getTodayData();
    if (!data || data.clients.length === 0) {
      router.push("/reports");
      return;
    }
    setReport(generateDayReport(data.clients, data.checkIns));
    setDiscrepancies(data.discrepancies ?? []);
    setClients(data.clients);
    setIsHistorical(false);
  }, [router, dateParam]);

  const rows = useMemo(() => (report ? buildArrivalRows(report) : []), [report]);
  const split = useMemo(() => outcomeSplit(rows), [rows]);
  const ecartRooms = useMemo(
    () => new Set(discrepancies.map((d) => d.roomNumber)),
    [discrepancies]
  );
  const ecart = useMemo(() => summarizeDiscrepancies(discrepancies), [discrepancies]);
  const blocks = useMemo(() => groupBlocks(clients), [clients]);
  const groupRooms = useMemo(
    () => new Set(blocks.flatMap((b) => b.roomNumbers)),
    [blocks]
  );
  const children = useMemo(() => getChildrenCount(clients), [clients]);
  const visible = useMemo(
    () => filterRows(rows, filter, query, ecartRooms, groupRooms),
    [rows, filter, query, ecartRooms, groupRooms]
  );

  if (!report) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#12100E]">
        <div className="text-muted">Chargement…</div>
      </div>
    );
  }

  const percent = presencePercent(report);
  const offList = rows.filter((r) => r.offList).length;
  const compRooms = rows.filter((r) => r.isComp).length;
  const vipRooms = rows.filter((r) => r.isVip).length;

  const tiles: ReportTile[] = [
    { key: "in", label: "Entrés", value: split.allIn },
    { key: "no", label: "Absents", value: split.noShow },
    { key: "partial", label: "Partiel", value: split.partial },
    { key: "vip", label: "VIP", value: vipRooms },
    { key: "comp", label: "COMP", value: compRooms },
    ...(children > 0 ? [{ key: "enfants" as const, label: "Enfants", value: children }] : []),
    ...(blocks.length > 0
      ? [{ key: "groupe" as const, label: "Groupes", value: groupRooms.size, sub: `${blocks.length} bloc${blocks.length > 1 ? "s" : ""}` }]
      : []),
    ...(offList > 0 ? [{ key: "offlist" as const, label: "Hors liste", value: offList }] : []),
    {
      key: "ecart",
      label: "Écarts",
      value: ecart.rooms,
      sub: ecart.net !== 0 ? `${ecart.net > 0 ? "+" : ""}${ecart.net} pers.` : undefined,
      warn: true,
    },
  ];

  /** dd/mm/yy, the shape the reservation dates arrive in, for spotting a block
   *  that leaves this morning. */
  const todayShort = (() => {
    try {
      const d = new Date(report.date + "T12:00:00");
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
    } catch {
      return "";
    }
  })();

  const dateLabel = (() => {
    try {
      return new Date(report.date + "T12:00:00").toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return report.date;
    }
  })();

  const exportCSV = () => {
    const blob = new Blob([exportReportCSV(report)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkin-report-${report.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn =
    "min-h-[46px] px-4 rounded-full text-[13.5px] font-black flex items-center gap-2 glass-liquid active:scale-[0.97] transition-transform";

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-[#FBF8F3] dark:bg-[#12100E]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-3 pt-3 pb-2 flex-wrap">
        <button
          onClick={() => router.push(isHistorical ? "/reports" : "/search")}
          className="min-h-[46px] px-4 rounded-full flex items-center gap-1.5 glass-liquid active:scale-[0.96] transition-transform"
          data-role="report-back"
        >
          <CaretLeft size={16} weight="bold" style={{ color: "var(--brand-ink)" }} />
          <span className="text-[13.5px] font-black" style={{ color: "var(--brand-ink)" }}>
            {isHistorical ? "Historique" : "Service"}
          </span>
        </button>

        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-[23px] font-black tracking-[-0.02em]" style={{ color: "var(--brand-ink)" }}>
            Rapport
          </h1>
          {/* first-letter, not capitalize: French writes "lundi 27 juillet". */}
          <span className="text-[14px] font-bold first-letter:uppercase truncate" style={{ color: "var(--tab-idle)" }}>
            {dateLabel}
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex flex-col items-end leading-tight mr-1">
          <span className="text-[13px] font-bold tracking-[0.08em]" style={{ fontFamily: "'Nunito', sans-serif", color: "var(--brand-ink)" }}>
            COURTYARD
          </span>
          <span className="text-[9.5px] text-muted">
            by <span className="font-bold tracking-[0.05em] text-slate">MARRIOTT</span>
          </span>
        </div>

        <button onClick={exportCSV} className={btn} data-role="report-export">
          <DownloadSimple size={17} weight="duotone" style={{ opacity: 0.75 }} />
          <span style={{ color: "var(--tab-idle)" }}>Exporter</span>
        </button>
        {!isHistorical && (
          <button
            onClick={() => {
              if (confirm("Clôturer la journée ?")) {
                closeDay();
                router.push("/upload");
              }
            }}
            className={btn}
            data-role="report-close-day"
          >
            <Check size={17} weight="bold" style={{ color: "var(--aur-bad-ink)" }} />
            <span style={{ color: "var(--aur-bad-ink)" }}>Clôture</span>
          </button>
        )}
      </div>

      {/* ── Body: chart + list on the left, presence + treemap on the right ── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 px-3 pb-3 overflow-y-auto md:overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col gap-3 md:min-h-0">
          <AffluenceChart checkIns={report.checkIns} />

          <div className="surface-card rounded-[20px] px-4 pt-3 pb-3 flex flex-col md:flex-1 md:min-h-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--tab-idle)" }}>
                Par ordre d&apos;arrivée
              </span>
              <b className="text-[12px] font-bold tabular-nums" style={{ color: "var(--aur-ink-2)" }}>
                {visible.length} chambre{visible.length > 1 ? "s" : ""}
              </b>
            </div>

            <div className="mt-3">
              <ReportTiles tiles={tiles} filter={filter} onFilter={setFilter} rooms={rows.length} />
            </div>

            <ArrivalList
              rows={visible}
              query={query}
              onQuery={setQuery}
              ecartRooms={ecartRooms}
              onFocusField={() => setPad(/[a-zA-Z]/.test(query) ? "abc" : "num")}
              /* Historical days are read-only: their guests are long gone and
                 the check-in screen would act on today's session. */
              onOpen={isHistorical ? undefined : (r) => {
                const i = clients.findIndex(
                  (c) => c.roomNumber === r.roomNumber && c.name === r.name
                );
                rememberOrigin("report");
                router.push(checkinHref(r.roomNumber, i >= 0 ? i : undefined));
              }}
            />
          </div>
        </div>

        <div className="w-full md:w-[300px] lg:w-[320px] shrink-0 flex flex-col gap-3 md:min-h-0 [@media(max-height:720px)]:overflow-y-auto no-scrollbar">
          <PresenceRing percent={percent} entered={report.totalEntered} expected={report.totalGuests} />

          <DayGroups
            blocks={blocks}
            today={todayShort}
            active={filter === "groupe"}
            onFilter={() => setFilter(filter === "groupe" ? "all" : "groupe")}
          />

          <div className="surface-card rounded-[20px] px-4 pt-3 pb-4 flex flex-col gap-3 md:flex-1 md:min-h-0 min-h-[240px] [@media(max-height:720px)]:flex-none [@media(max-height:720px)]:shrink-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--tab-idle)" }}>
                Répartition
              </span>
              <b className="text-[12px] font-bold tabular-nums" style={{ color: "var(--aur-ink-2)" }}>
                {split.total} chambres
              </b>
            </div>
            <OutcomeTreemap
              split={split}
              vip={vipRooms}
              comp={compRooms}
              filter={filter}
              onFilter={setFilter}
            />
          </div>
        </div>
      </div>

      {pad && (
        <div className="shrink-0 px-3 pb-3" data-role="report-pad">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setPad(null)}
              data-role="report-pad-close"
              className="min-h-[40px] px-4 rounded-full text-[13px] font-black glass-liquid active:scale-[0.96] transition-transform"
              style={{ color: "var(--brand-ink)" }}
            >
              Fermer le clavier
            </button>
          </div>
          {pad === "abc" ? (
            <AlphaKeypad
              onKeyPress={(k) => setQuery((q) => q + k)}
              onBackspace={() => setQuery((q) => q.slice(0, -1))}
              onToggleMode={() => setPad("num")}
            />
          ) : (
            <div className="max-w-[420px]">
              <NumericKeypad
                onKeyPress={(k) => setQuery((q) => q + k)}
                onBackspace={() => setQuery((q) => q.slice(0, -1))}
                onToggleMode={() => setPad("abc")}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
