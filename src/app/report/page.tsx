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
import { tilePeople, peopleExpected } from "@/lib/tile-people";
import type { PaxDiscrepancy } from "@/lib/types";
import AffluenceChart from "@/components/report/AffluenceChart";
import PresenceRing from "@/components/report/PresenceRing";
import OutcomeTreemap from "@/components/report/OutcomeTreemap";
import ReportTiles, { ReportTile } from "@/components/report/ReportTiles";
import ArrivalList from "@/components/report/ArrivalList";
import DayGroups from "@/components/report/DayGroups";
import ReportDatePicker from "@/components/report/ReportDatePicker";
import { reportDays } from "@/lib/report-days";
import AlphaKeypad from "@/components/AlphaKeypad";
import NumericKeypad from "@/components/NumericKeypad";
import { checkinHref } from "@/lib/checkin-nav";
import { rememberOrigin } from "@/lib/back-nav";
import { groupBlocks, getChildrenCount } from "@/lib/groups";
import { pickGroups } from "@/lib/group-pick";
import GroupPicker from "@/components/GroupPicker";
import { ArrowsOutSimple, X as XIcon } from "@phosphor-icons/react/dist/ssr";
import type { Client } from "@/lib/types";

export default function ReportPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh w-full bg-background dark:bg-ink p-3 pt-3 flex flex-col gap-3 screen-safe">
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
  /** Which services exist to look at. Newest first, today only when there is
   *  one open. */
  const [days, setDays] = useState<string[]>([]);
  /** The list, full screen. Same rows, same search, same filters — the panel it
   *  lives in is a third of a tablet, and "who came at 08:57" is a question
   *  asked of the whole day rather than of the six rows that happen to fit. */
  const [expanded, setExpanded] = useState(false);

  const dateParam = searchParams.get("date");
  const todayIso = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const open = getTodayData();
    setDays(reportDays(
      getSessionHistory().map((s) => s.date),
      todayIso,
      !!open && open.clients.length > 0
    ));
  }, [todayIso]);

  useEffect(() => {
    if (dateParam) {
      const session = getSessionHistory().find((s) => s.date === dateParam);
      const unclosed = getDataForDate(dateParam);
      if (session) {
        setReport(generateDayReport(session.clients, session.checkIns, session.date));
        setDiscrepancies(session.discrepancies ?? []);
        setClients(session.clients);
      } else if (unclosed && unclosed.clients.length > 0) {
        setReport(generateDayReport(unclosed.clients, unclosed.checkIns, unclosed.date || dateParam));
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
  /* Which coach. Two tours on one morning are two mornings — one is gone by
     7:15, the other drifts in until half past nine — so "Groupes" as a single
     on/off answers a question nobody asks. Empty means all of them, which is
     what the tile alone has always meant. */
  const [pickedGroups, setPickedGroups] = useState<string[]>([]);
  /* Two sets, deliberately. The tile counts every group room in the house —
     it is the door into the filter, and a door that renames itself once you
     walk through it is not a door. The list narrows to the coach you ticked. */
  const allGroupRooms = useMemo(() => new Set(blocks.flatMap((b) => b.roomNumbers)), [blocks]);
  const groupRooms = useMemo(
    () => new Set(pickGroups(clients, blocks, pickedGroups).map((c) => c.roomNumber)),
    [clients, blocks, pickedGroups]
  );
  const children = useMemo(() => getChildrenCount(clients), [clients]);
  const visible = useMemo(
    () => filterRows(rows, filter, query, ecartRooms, groupRooms),
    [rows, filter, query, ecartRooms, groupRooms]
  );

  if (!report) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background dark:bg-ink screen-safe">
        <div className="text-muted">Chargement…</div>
      </div>
    );
  }

  const percent = presencePercent(report);
  const offList = rows.filter((r) => r.offList).length;
  const compRooms = rows.filter((r) => r.isComp).length;
  const vipRooms = rows.filter((r) => r.isVip).length;

  /* Rooms and people, on the same tile. "Entrés 30" here against "Entrés 60"
     on the search screen was one word carrying two units — both true, neither
     saying which. See src/lib/tile-people.ts. */
  const pax = tilePeople(rows);
  /* Group and off-list rooms are counted whether or not anyone came down, so
     their people are the reservation's, not the morning's — otherwise the tile
     reads "9 ch. / 0 pers." before service and contradicts itself. */
  const groupPeople = peopleExpected(rows.filter((r) => allGroupRooms.has(r.roomNumber)));

  const tiles: ReportTile[] = [
    /* The same set as the répartition's green block and the same figure as the
       search screen's "Entrés": everyone who got breakfast, including the rooms
       that only partly came. Counting fully-arrived rooms only would put a
       different number under the same word the moment one room half turned up.
       Partiel keeps its own tile below — that question is about rooms. */
    { key: "servis", label: "Entrés", value: split.allIn + split.partial, people: pax.served },
    /* The same figure the répartition block shows. A tile reading 27 above a
       block reading 25 is the 84.6-against-86 problem one row further down. */
    { key: "no", label: "Absents", value: split.noShow, people: pax.missing },
    { key: "partial", label: "Partiel", value: split.partial, people: pax.partial.people },
    { key: "vip", label: "VIP", value: vipRooms, people: pax.vip.people },
    /* COMP counts adults, like the hotel's R118 totals page — children in a
       COMP room eat free and the paper does not count them. Saying so on the
       tile stops the afternoon team reconciling a number that was never
       missing. */
    {
      key: "comp",
      label: "COMP",
      value: compRooms,
      people: pax.comp.people,
      sub: pax.compChildren > 0
        ? `+${pax.compChildren} enfant${pax.compChildren > 1 ? "s" : ""} gratuit${pax.compChildren > 1 ? "s" : ""}`
        : undefined,
    },
    /* Rooms, like every tile beside it — the value used to be the CHILD count,
       so a row of tiles all reading "3" meant three rooms, three rooms, three
       children. The children are on the second line where the people go. */
    ...(children > 0 ? [{ key: "enfants" as const, label: "Enfants", value: pax.children.rooms, people: pax.children.people }] : []),
    ...(blocks.length > 0
      ? [{ key: "groupe" as const, label: "Groupes", value: allGroupRooms.size, people: groupPeople, sub: `${blocks.length} bloc${blocks.length > 1 ? "s" : ""}` }]
      : []),
    ...(offList > 0 ? [{ key: "offlist" as const, label: "Hors liste", value: offList, people: peopleExpected(rows.filter((r) => r.offList)) }] : []),
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
    "min-h-[46px] px-4 rounded-full text-sm font-black flex items-center gap-2 glass-liquid active:scale-[0.97] transition-transform";

  /* One pad, rendered into whichever column is on screen.

     A bounded box, not a stack of keys: the pad used to be as tall as its keys
     wanted to be, so making the keys bigger pushed its last row off the bottom
     of an iPad — and on a desktop browser, where there is no home indicator, it
     still just fitted. Height is a share of the viewport now.

     It belongs to the layout, never floating over it. Stacked above the sheet it
     was a grid of keys with the guest list showing through the gaps, and every
     row it covered was a row you could neither read nor tap. */
  const padBox = pad && (
    <div className="shrink-0 px-3 pb-3 pb-safe" data-role="report-pad">
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setPad(null)}
          data-role="report-pad-close"
          className="min-h-[40px] px-4 rounded-full text-sm font-black glass-liquid active:scale-[0.96] transition-transform"
          style={{ color: "var(--brand-ink)" }}
        >
          Fermer le clavier
        </button>
      </div>
      <div className="h-[clamp(180px,30vh,290px)]">
        {pad === "abc" ? (
          <AlphaKeypad
            onKeyPress={(k) => setQuery((q) => q + k)}
            onBackspace={() => setQuery((q) => q.slice(0, -1))}
            onToggleMode={() => setPad("num")}
          />
        ) : (
          <div className="max-w-[420px] h-full">
            <NumericKeypad
              onKeyPress={(k) => setQuery((q) => q + k)}
              onBackspace={() => setQuery((q) => q.slice(0, -1))}
              onToggleMode={() => setPad("abc")}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-background dark:bg-ink screen-safe">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-3 pt-3 pb-2 flex-wrap" data-role="report-header">
        <button
          onClick={() => router.push(isHistorical ? "/reports" : "/search")}
          className="min-h-[46px] px-4 rounded-full flex items-center gap-1.5 glass-liquid active:scale-[0.96] transition-transform"
          data-role="report-back"
        >
          <CaretLeft size={16} weight="bold" style={{ color: "var(--brand-ink)" }} />
          <span className="text-sm font-black" style={{ color: "var(--brand-ink)" }}>
            {isHistorical ? "Historique" : "Service"}
          </span>
        </button>

        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-2xl font-black tracking-[-0.02em]" style={{ color: "var(--brand-ink)" }}>
            Rapport
          </h1>
          <ReportDatePicker
            days={days.length ? days : [report.date]}
            current={report.date}
            todayIso={todayIso}
            onPick={(d) => router.push(d === todayIso ? "/report" : `/report?date=${d}`)}
          />
        </div>

        <div className="flex-1" />

        <div className="flex flex-col items-end leading-tight mr-1">
          <span className="text-sm font-bold tracking-[0.08em]" style={{ fontFamily: "'Nunito', sans-serif", color: "var(--brand-ink)" }}>
            COURTYARD
          </span>
          <span className="text-micro text-muted">
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
          {/* The chart stands down while the pad is up.
              Its height is fixed and the list's is `flex-1`, so when the pad
              claimed its share of a landscape iPad the chart kept all of its
              own and the list collapsed to its tiles and its search field: the
              header read "3 chambres" and not one of them was on screen.
              Affluence is read at a glance between guests; a search is read
              while typing, and only one of the two can be the thing you are
              looking at. */}
          {!pad && <AffluenceChart checkIns={report.checkIns} />}

          <div className="surface-card rounded-lg px-4 pt-3 pb-3 flex flex-col md:flex-1 md:min-h-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-black uppercase tracking-[0.14em]" style={{ color: "var(--tab-idle)" }}>
                Par ordre d&apos;arrivée
              </span>
              <div className="flex items-center gap-2">
                <b className="text-xs font-bold tabular-nums" style={{ color: "var(--aur-ink-2)" }}>
                  {visible.length} chambre{visible.length > 1 ? "s" : ""}
                </b>
                {/* The panel is a corner of a dashboard; the list is the thing
                    you actually read when someone asks "who came at 8?". Same
                    rows, same search, same filters — the whole screen. */}
                <button
                  onClick={() => setExpanded(true)}
                  data-role="report-list-expand"
                  aria-label="Ouvrir la liste en plein écran"
                  className="surface-raised w-[40px] h-[36px] rounded-md grid place-items-center active:scale-[0.94] transition-[transform,box-shadow] duration-100"
                >
                  <ArrowsOutSimple size={16} weight="bold" style={{ color: "var(--brand-ink)" }} />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <ReportTiles tiles={tiles} filter={filter} onFilter={setFilter} rooms={rows.length} />
            </div>
            {filter === "groupe" && (
              <div className="mt-2">
                <GroupPicker blocks={blocks} picked={pickedGroups} onPick={setPickedGroups} />
              </div>
            )}

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
            picked={pickedGroups}
            onPick={setPickedGroups}
          />

          <div className="surface-card rounded-lg px-4 pt-3 pb-4 flex flex-col gap-3 md:flex-1 md:min-h-0 min-h-[240px] [@media(max-height:720px)]:flex-none [@media(max-height:720px)]:shrink-0">
            <div className="flex items-baseline justify-between">
              <span className="text-micro font-black uppercase tracking-[0.14em]" style={{ color: "var(--tab-idle)" }}>
                Répartition
              </span>
              <b className="text-xs font-bold tabular-nums" style={{ color: "var(--aur-ink-2)" }}>
                {split.total} chambres
              </b>
            </div>
            <OutcomeTreemap
              /* One population, split once. `served` is the ring's numerator and
                 `missing` is the rest of the house, so the panel and the ring
                 cannot print two different percentages for one morning. */
              people={{ served: pax.served, missing: pax.missing, total: pax.expected }}
              rooms={{ served: split.allIn + split.partial, missing: split.noShow }}
              vip={vipRooms}
              comp={compRooms}
              filter={filter}
              onFilter={setFilter}
            />
          </div>
        </div>
      </div>

      {/* The same list with the whole screen. It shares query, filter and pad
          with the panel, so closing it leaves you exactly where you were —
          two views of one state, not two lists. */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background dark:bg-ink screen-safe" data-role="report-list-sheet">
          <div className="shrink-0 flex items-center gap-3 px-3 pt-3 pb-2">
            <span className="text-base font-black" style={{ color: "var(--brand-ink)" }}>
              Par ordre d&apos;arrivée
            </span>
            <b className="text-xs font-bold tabular-nums" style={{ color: "var(--tab-idle)" }}>
              {visible.length} chambre{visible.length > 1 ? "s" : ""}
            </b>
            <span className="flex-1" />
            <button
              onClick={() => { setExpanded(false); setPad(null); }}
              data-role="report-list-collapse"
              aria-label="Fermer"
              className="surface-raised w-[52px] min-h-[52px] rounded-lg grid place-items-center active:scale-[0.94] transition-[transform,box-shadow] duration-100"
            >
              <XIcon size={18} weight="bold" style={{ color: "var(--brand-ink)" }} />
            </button>
          </div>
          <div className="shrink-0 px-3">
            <ReportTiles tiles={tiles} filter={filter} onFilter={setFilter} rooms={rows.length} />
          </div>
          {filter === "groupe" && (
            <div className="shrink-0 px-3 pt-2">
              <GroupPicker blocks={blocks} picked={pickedGroups} onPick={setPickedGroups} />
            </div>
          )}
          <div className="flex-1 min-h-0 flex flex-col px-3 pb-2">
            <ArrivalList
              rows={visible}
              query={query}
              onQuery={setQuery}
              ecartRooms={ecartRooms}
              onFocusField={() => setPad(/[a-zA-Z]/.test(query) ? "abc" : "num")}
              onOpen={isHistorical ? undefined : (r) => {
                const i = clients.findIndex(
                  (c) => c.roomNumber === r.roomNumber && c.name === r.name
                );
                rememberOrigin("report");
                router.push(checkinHref(r.roomNumber, i >= 0 ? i : undefined));
              }}
            />
          </div>
          {padBox}
        </div>
      )}

      {!expanded && padBox}
    </div>
  );
}
