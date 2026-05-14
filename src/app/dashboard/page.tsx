"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  Clock,
  Gift,
  Users,
  Footprints,
  WarningCircle,
  CheckCircle,
  TrendUp,
  CaretLeft,
  Copy,
  Check,
  Calendar,
  Star,
  Pencil,
  ChatCircleDots,
} from "@phosphor-icons/react/dist/ssr";
import {
  getHistoricalData,
  getTodayData,
  getSessionHistory,
  getDataForDate,
  getSettings,
  saveSettings,
} from "@/lib/storage";
import { seedDemoMonths } from "@/lib/mock-seeder";
import {
  computeMonthlyStats,
  formatMonthlyStatsMarkdown,
} from "@/lib/monthly-stats";
import { generateDayReport } from "@/lib/report";
import {
  getMorningBrief,
  type GSSScore,
  type ClientComment,
} from "@/lib/morning-brief";
import type { DailyData } from "@/lib/types";
import { cn } from "@/lib/utils";

type Range = "1J" | "7J" | "30J" | "3M" | "6M";

interface DayPoint {
  date: string;
  pax: number;
  isToday: boolean;
  dow: number;
  label: string;
  mavg: number;
}

function applyMovingAverage(pts: DayPoint[], window: number) {
  for (let i = 0; i < pts.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(pts.length, i + Math.ceil(window / 2));
    let sum = 0;
    for (let k = start; k < end; k++) sum += pts[k].pax;
    pts[i].mavg = sum / (end - start);
  }
}

function buildSeries(history: DailyData[], days: number): DayPoint[] {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const map = new Map<string, DailyData>();
  for (const d of history) map.set(d.date, d);

  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const data = map.get(dateStr);
    const pax = data
      ? data.checkIns.reduce((s, ci) => s + ci.peopleEntered, 0)
      : 0;
    out.push({
      date: dateStr,
      pax,
      isToday: dateStr === todayStr,
      dow: d.getDay(),
      label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      mavg: 0,
    });
  }
  applyMovingAverage(out, 7);
  return out;
}

function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

function buildWeeklySeries(history: DailyData[]): DayPoint[] {
  // 13 weeks ending today (~3 months) → ~13 chunky bars
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const map = new Map<string, DailyData>();
  for (const d of history) map.set(d.date, d);

  const out: DayPoint[] = [];
  for (let w = 12; w >= 0; w--) {
    let weekPax = 0;
    let containsToday = false;
    let weekStart: Date | null = null;
    for (let dd = 6; dd >= 0; dd--) {
      const offset = w * 7 + dd;
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      const dateStr = d.toISOString().split("T")[0];
      weekStart = d;
      const data = map.get(dateStr);
      if (data) weekPax += data.checkIns.reduce((s, ci) => s + ci.peopleEntered, 0);
      if (dateStr === todayStr) containsToday = true;
    }
    const ws = weekStart!;
    out.push({
      date: ws.toISOString().split("T")[0],
      pax: weekPax,
      isToday: containsToday,
      dow: 0,
      label: `S${isoWeekNumber(ws)}`,
      mavg: 0,
    });
  }
  applyMovingAverage(out, 3);
  return out;
}

function buildMonthlySeries(history: DailyData[]): DayPoint[] {
  // Last 6 months → 6 bars
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const map = new Map<string, DailyData>();
  for (const d of history) map.set(d.date, d);

  const out: DayPoint[] = [];
  for (let m = 5; m >= 0; m--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    let monthPax = 0;
    let containsToday = false;
    for (let dd = 1; dd <= monthEnd.getDate(); dd++) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, dd);
      const dateStr = d.toISOString().split("T")[0];
      if (dateStr === todayStr) containsToday = true;
      const data = map.get(dateStr);
      if (data) monthPax += data.checkIns.reduce((s, ci) => s + ci.peopleEntered, 0);
    }
    out.push({
      date: monthStart.toISOString().split("T")[0],
      pax: monthPax,
      isToday: containsToday,
      dow: 0,
      label: monthStart.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
      mavg: 0,
    });
  }
  applyMovingAverage(out, 3);
  return out;
}

function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  const segs: string[] = [`M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.2;
    const cp1x = p1[0] + (p2[0] - p0[0]) * t;
    const cp1y = p1[1] + (p2[1] - p0[1]) * t;
    const cp2x = p2[0] - (p3[0] - p1[0]) * t;
    const cp2y = p2[1] - (p3[1] - p1[1]) * t;
    segs.push(
      `C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
    );
  }
  return segs.join(" ");
}

function Delta({ pct }: { pct: number }) {
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-muted bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 rounded-md">
        —
      </span>
    );
  }
  const positive = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md",
        positive
          ? "text-green-700 dark:text-green-400 bg-green-500/15"
          : "text-error bg-error/15"
      )}
    >
      {positive ? <ArrowUp size={10} weight="bold" /> : <ArrowDown size={10} weight="bold" />}
      {positive ? "+" : ""}
      {pct}%
    </span>
  );
}

function TimeToggle({
  value,
  onChange,
}: {
  value: Range;
  onChange: (v: Range) => void;
}) {
  const opts: Range[] = ["1J", "7J", "30J", "3M", "6M"];
  return (
    <div className="inline-flex p-0.5 glass-liquid rounded-full gap-0.5">
      {opts.map((o) => (
        <button
          key={o}
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "appearance-none border-0 text-[11px] font-mono font-bold px-2.5 py-1.5 rounded-full transition-all",
            value === o
              ? "bg-dark text-white dark:bg-white dark:text-black"
              : "bg-transparent text-muted hover:text-dark"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function TradingChart({ series }: { series: DayPoint[] }) {
  if (series.length === 0) return null;
  const w = 1000;
  const h = 260;
  const padL = 32;
  const padR = 16;
  const padT = 24;
  const padB = 32;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...series.map((d) => d.pax), 1) * 1.15;
  const total = series.reduce((s, d) => s + d.pax, 0);
  const avg = total / series.length;
  const bw = innerW / series.length;
  const xy = (i: number, v: number): [number, number] => [
    padL + i * bw + bw / 2,
    padT + innerH - (v / max) * innerH,
  ];

  const maxBarW = 90;
  const minBarW = 6;
  const mavgPath = smoothPath(series.map((d, i) => xy(i, d.mavg)));

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", maxHeight: 320 }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = padT + innerH - p * innerH;
          return (
            <line
              key={i}
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.06"
              strokeWidth="0.5"
              className="text-dark"
            />
          );
        })}

        {series.map((d, i) => {
          const yTop = padT + innerH - (d.pax / max) * innerH;
          const barW = Math.min(maxBarW, Math.max(minBarW, bw - 6));
          const above = d.pax >= avg;
          const [cx] = xy(i, 0);
          return (
            <g key={i}>
              <rect
                x={cx - barW / 2}
                y={yTop}
                width={barW}
                height={Math.max(0, padT + innerH - yTop)}
                rx={6}
                ry={6}
                fill={d.isToday ? "#A66914" : above ? "currentColor" : "#A89E8C"}
                opacity={d.isToday ? 1 : above ? 0.92 : 0.7}
                className="text-dark"
              >
                <title>{`${d.label}: ${d.pax} pax`}</title>
              </rect>
              {d.pax > 0 && (
                <text
                  x={cx}
                  y={yTop - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={d.isToday ? "#A66914" : "currentColor"}
                  className="text-dark"
                >
                  {d.pax}
                </text>
              )}
            </g>
          );
        })}

        <path
          d={mavgPath}
          fill="none"
          stroke="#A66914"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <line
          x1={padL}
          x2={w - padR}
          y1={padT + innerH - (avg / max) * innerH}
          y2={padT + innerH - (avg / max) * innerH}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="0.5"
          strokeDasharray="2 4"
          className="text-muted"
        />

        {series.map((d, i) => {
          const [x] = xy(i, 0);
          return (
            <text
              key={i}
              x={x}
              y={h - 8}
              textAnchor="middle"
              fontSize="10"
              fontFamily="ui-monospace,monospace"
              fill={d.isToday ? "#A66914" : "currentColor"}
              opacity={d.isToday ? 1 : 0.55}
              className="text-dark"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface StaffingAlert {
  date: string;
  dateLabel: string;
  occupancyPercent: number;
  severity: "warn" | "danger";
  message: string;
}

function buildStaffingAlerts(): StaffingAlert[] {
  const brief = getMorningBrief();
  if (!brief || brief.forecast.length === 0) return [];
  const out: StaffingAlert[] = [];
  for (const f of brief.forecast) {
    if (f.occupancyPercent >= 95) {
      out.push({
        date: f.date,
        dateLabel: f.date,
        occupancyPercent: f.occupancyPercent,
        severity: "danger",
        message: "Renforcer équipe (+2 pers) — appeler aujourd'hui",
      });
    } else if (f.occupancyPercent >= 80) {
      out.push({
        date: f.date,
        dateLabel: f.date,
        occupancyPercent: f.occupancyPercent,
        severity: "warn",
        message: "Prévoir +1 personne 08h-09h",
      });
    }
  }
  return out;
}

const EYEBROW =
  "text-[10px] text-muted uppercase tracking-wider font-bold";

export default function DashboardPage() {
  const router = useRouter();
  const [range, setRange] = useState<Range>("7J");
  const [history, setHistory] = useState<DailyData[]>([]);
  const [todayData, setTodayData] = useState<DailyData | null>(null);
  const [costPerCover, setCostPerCover] = useState(26);
  const [copied, setCopied] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState("26");

  useEffect(() => {
    setMounted(true);
    setCostPerCover(getSettings().costPerCover);
    setHistory(getHistoricalData(180));
    setTodayData(getTodayData());
  }, []);

  const monthData = useMemo(() => {
    if (!mounted) return [];
    const byDate = new Map<string, DailyData>();
    for (const d of history) byDate.set(d.date, d);
    for (const s of getSessionHistory()) {
      if (!byDate.has(s.date)) {
        byDate.set(s.date, {
          date: s.date,
          clients: s.clients,
          checkIns: s.checkIns,
          rawUploadText: s.rawUploadText,
        });
      }
    }
    if (todayData && !byDate.has(todayData.date)) byDate.set(todayData.date, todayData);
    return Array.from(byDate.values());
  }, [mounted, history, todayData]);

  const stats = useMemo(
    () => computeMonthlyStats(monthData, costPerCover),
    [monthData, costPerCover]
  );

  const todayReport = useMemo(
    () => (todayData ? generateDayReport(todayData.clients, todayData.checkIns) : null),
    [todayData]
  );

  const yesterdayPercent = useMemo(() => {
    if (!mounted) return null;
    const today = new Date();
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const dateStr = yest.toISOString().split("T")[0];
    const sessions = getSessionHistory();
    const sess = sessions.find((s) => s.date === dateStr);
    const data = sess ? { clients: sess.clients, checkIns: sess.checkIns } : getDataForDate(dateStr);
    if (!data) return null;
    const expected = data.clients.reduce((s, c) => s + c.adults + c.children, 0);
    if (expected === 0) return null;
    const entered = data.checkIns.reduce((s, c) => s + c.peopleEntered, 0);
    return Math.min(100, Math.round((entered / expected) * 100));
  }, [mounted]);

  const todayPercent = todayReport && todayReport.totalGuests > 0
    ? Math.min(100, Math.round((todayReport.totalEntered / todayReport.totalGuests) * 100))
    : 0;
  const deltaService = yesterdayPercent !== null ? todayPercent - yesterdayPercent : 0;

  const walkInPax = todayReport?.sourceBreakdown
    ? todayReport.sourceBreakdown.walkInEntered + todayReport.sourceBreakdown.vipListOnlyEntered
    : 0;
  const walkInRevenue = todayReport?.sourceBreakdown
    ? (todayReport.sourceBreakdown.byPayment.cash +
        todayReport.sourceBreakdown.byPayment.card +
        todayReport.sourceBreakdown.byPayment.room) * costPerCover
    : 0;

  const health: { label: string; cls: string } = useMemo(() => {
    if (todayPercent >= 70) return { label: "SAIN", cls: "text-green-700 dark:text-green-400 bg-green-500/12" };
    if (todayPercent >= 40) return { label: "ATTENTION", cls: "text-amber-700 dark:text-amber-400 bg-amber-500/12" };
    if (todayReport === null || todayReport.totalGuests === 0)
      return { label: "EN ATTENTE", cls: "text-muted bg-black/[0.04] dark:bg-white/[0.06]" };
    return { label: "FAIBLE", cls: "text-error bg-error/12" };
  }, [todayPercent, todayReport]);

  // 1J view = intra-day bars (30-min buckets, 6h-12h). Other ranges = daily bars.
  const series = useMemo(() => {
    if (range === "1J") {
      // Find today's data first; if none, use most recent day with check-ins
      const today = new Date().toISOString().split("T")[0];
      const all = monthData.slice().sort((a, b) => b.date.localeCompare(a.date));
      const day =
        all.find((d) => d.date === today && d.checkIns.length > 0) ??
        all.find((d) => d.checkIns.length > 0) ??
        null;
      if (!day) return [];

      // Auto-extend window if check-ins fall outside default 6h-12h
      let startHour = 6;
      let endHour = 11;
      for (const ci of day.checkIns) {
        const h = new Date(ci.timestamp).getHours();
        if (h < startHour) startHour = h;
        if (h > endHour) endHour = h;
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      const buckets: Record<string, number> = {};
      const labels: string[] = [];
      for (let h = startHour; h <= endHour; h++) {
        for (const m of [0, 30]) {
          const key = `${pad(h)}:${pad(m)}`;
          buckets[key] = 0;
          labels.push(key);
        }
      }
      for (const ci of day.checkIns) {
        const d = new Date(ci.timestamp);
        const k = `${pad(d.getHours())}:${pad(d.getMinutes() < 30 ? 0 : 30)}`;
        if (k in buckets) buckets[k] += ci.peopleEntered;
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const isShowingToday = day.date === todayStr;
      const pts: DayPoint[] = labels.map((key) => ({
        date: `${day.date} ${key}`,
        pax: buckets[key],
        isToday: isShowingToday,
        dow: new Date(day.date + "T12:00:00").getDay(),
        label: key,
        mavg: 0,
      }));
      // moving average window 3 (smoother on intra-day)
      const w = 3;
      for (let i = 0; i < pts.length; i++) {
        const start = Math.max(0, i - Math.floor(w / 2));
        const end = Math.min(pts.length, i + Math.ceil(w / 2));
        let s = 0;
        for (let k = start; k < end; k++) s += pts[k].pax;
        pts[i].mavg = s / (end - start);
      }
      return pts;
    }

    if (range === "3M") return buildWeeklySeries(monthData);
    if (range === "6M") return buildMonthlySeries(monthData);
    return buildSeries(monthData, range === "7J" ? 7 : 30);
  }, [monthData, range]);
  const totalPax = series.reduce((s, d) => s + d.pax, 0);
  const avgPax = series.length > 0 ? Math.round(totalPax / series.length) : 0;
  const peakDay = useMemo(() => {
    let best: DayPoint | null = null;
    for (const d of series) if (!best || d.pax > best.pax) best = d;
    return best;
  }, [series]);

  const dowAvg = useMemo(() => {
    const buckets: number[][] = [[], [], [], [], [], [], []];
    for (const d of monthData) {
      const dt = new Date(d.date + "T12:00:00");
      const dow = dt.getDay();
      const pax = d.checkIns.reduce((s, ci) => s + ci.peopleEntered, 0);
      if (pax > 0) buckets[dow].push(pax);
    }
    return buckets.map((arr) =>
      arr.length === 0 ? 0 : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
    );
  }, [monthData]);
  const dowMax = Math.max(...dowAvg, 1);
  const dowLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const todayDow = new Date().getDay();

  const forecast = useMemo(() => {
    if (!mounted) return [];
    const b = getMorningBrief();
    return b?.forecast ?? [];
  }, [mounted]);
  const staffingAlerts = useMemo(() => (mounted ? buildStaffingAlerts() : []), [mounted]);

  const gss = useMemo<GSSScore[]>(() => {
    if (!mounted) return [];
    const b = getMorningBrief();
    if (!b) return [];
    const order = [
      "Intent to Recommend property",
      "Staff Overall Service",
      "Elite Appreciation",
      "F&B Overall",
      "F&B Service",
    ];
    return order
      .map((name) => b.gss.find((g) => g.metric === name))
      .filter((g): g is GSSScore => Boolean(g));
  }, [mounted]);

  const comments = useMemo<ClientComment[]>(() => {
    if (!mounted) return [];
    const b = getMorningBrief();
    return b?.comments.slice(0, 3) ?? [];
  }, [mounted]);

  const handleSavePrice = () => {
    const next = Math.max(1, Math.min(200, Math.round(Number(tempPrice) || 26)));
    setCostPerCover(next);
    saveSettings({ ...getSettings(), costPerCover: next });
    setEditingPrice(false);
  };

  const extractRating = (text: string): number | null => {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*\/\s*10/);
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    return isFinite(n) ? n : null;
  };

  const gssShort: Record<string, string> = {
    "Intent to Recommend property": "Intent to Recommend",
    "Staff Overall Service": "Service global",
    "Elite Appreciation": "Elite",
    "F&B Overall": "F&B Global",
    "F&B Service": "F&B Service",
  };

  const hasNoData = monthData.length === 0;

  const showDemoBanner =
    process.env.NODE_ENV !== "production" &&
    (range === "3M" || range === "6M") &&
    monthData.length < 30;

  const handleSeedDemo = () => {
    if (
      !confirm(
        "Cela remplacera les données existantes par 6 mois de données de démonstration (180 jours, variation saisonnière). Continuer ?"
      )
    )
      return;
    setSeedBusy(true);
    setTimeout(() => {
      const result = seedDemoMonths(180);
      if (result.error) {
        setSeedBusy(false);
        alert(`Erreur génération démo: ${result.error}`);
        return;
      }
      window.location.reload();
    }, 50);
  };

  const handleCopy = async () => {
    const md = formatMonthlyStatsMarkdown(stats);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = md;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  return (
    <div className="min-h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      <div className="max-w-6xl mx-auto px-4 py-5 pb-20">
        {/* BACK BUTTON — top-left, matches other screens */}
        <div className="mb-3">
          <button
            onClick={() => router.push("/upload")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 glass-liquid text-brand text-xs font-bold rounded-full active:scale-[0.97] transition-all"
          >
            <CaretLeft size={12} weight="bold" />
            Accueil
          </button>
        </div>

        {/* HEADER */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] text-brand uppercase tracking-wider font-bold">
              <ShieldCheck size={11} weight="duotone" />
              Direction · F&B · Opérations
            </div>
            <h1 className="text-3xl font-black text-dark leading-tight mt-1">
              Bonjour Direction.
            </h1>
            <div className="text-xs text-muted mt-0.5">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TimeToggle value={range} onChange={setRange} />
          </div>
        </div>

        {hasNoData && (
          <div className="glass-liquid rounded-[14px] p-5 mb-5 text-center">
            <p className="text-sm text-dark font-bold">Aucune donnée disponible</p>
            <p className="text-xs text-muted mt-1">
              Ouvre <code className="font-mono bg-black/5 dark:bg-white/10 px-1 rounded">/debug</code> →
              clique <b>🌱 Seed Mock Data</b> ou <b>Clear All</b> puis re-seed pour générer des données fraîches.
            </p>
          </div>
        )}

        {/* ZONE 1 — KPI STRIP */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-5">
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={EYEBROW}>Service</span>
              <Delta pct={deltaService} />
            </div>
            <div className={cn(
              "text-3xl font-black tabular-nums leading-none",
              todayPercent >= 70 ? "text-green-600 dark:text-green-400"
              : todayPercent >= 40 ? "text-brand"
              : "text-error"
            )}>
              {todayPercent}%
            </div>
            <div className="text-[10px] text-muted mt-1.5 tabular-nums">
              {todayReport?.totalEntered ?? 0}/{todayReport?.totalGuests ?? 0} pax
            </div>
          </div>

          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={EYEBROW}>Pic</span>
              <Clock size={12} weight="duotone" className="text-brand" />
            </div>
            <div className="text-2xl font-black text-dark tabular-nums leading-none">
              {stats.peakHourMostCommon || "—"}
            </div>
            <div className="text-[10px] text-muted mt-1.5">
              affluence récurrente
            </div>
          </div>

          <div className="glass-liquid rounded-[14px] p-4 bg-gradient-to-br from-brand/8 to-transparent">
            <div className="flex items-center justify-between mb-2">
              <span className={cn(EYEBROW, "text-brand")}>Compliments</span>
              <Gift size={12} weight="duotone" className="text-brand" />
            </div>
            <div className="text-2xl font-black text-brand tabular-nums leading-none">
              {stats.compCost.toLocaleString("fr-FR")}
              <span className="text-base opacity-70 ml-0.5">€</span>
            </div>
            <div className="text-[10px] text-muted mt-1.5 tabular-nums flex items-center gap-1.5 flex-wrap">
              <span>{stats.compPersons} cv ·</span>
              {editingPrice ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    value={tempPrice}
                    onChange={(e) => setTempPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSavePrice();
                      if (e.key === "Escape") setEditingPrice(false);
                    }}
                    autoFocus
                    className="w-12 px-1 py-0.5 rounded-md bg-white dark:bg-white/10 border border-brand/40 text-dark text-[11px] font-bold text-right tabular-nums"
                  />
                  <button
                    onClick={handleSavePrice}
                    aria-label="Confirmer prix"
                    className="text-brand font-bold text-[11px]"
                  >
                    OK
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setTempPrice(String(costPerCover));
                    setEditingPrice(true);
                  }}
                  className="inline-flex items-center gap-1 text-muted hover:text-brand transition-colors"
                  aria-label="Modifier prix par couvert"
                >
                  <span className="tabular-nums">{costPerCover}€/cv</span>
                  <Pencil size={9} weight="bold" />
                </button>
              )}
            </div>
          </div>

          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={EYEBROW}>Walk-ins (J)</span>
              <Footprints size={12} weight="duotone" className="text-muted" />
            </div>
            <div className="text-2xl font-black text-dark tabular-nums leading-none">
              {walkInPax}
            </div>
            <div className="text-[10px] text-muted mt-1.5 tabular-nums">
              {walkInRevenue > 0 ? `${walkInRevenue.toLocaleString("fr-FR")}€ revenu` : "aucun revenu"}
            </div>
          </div>

          <div className={cn("rounded-[14px] p-4 glass-liquid", health.cls.includes("bg-") ? health.cls : "")}>
            <div className="flex items-center justify-between mb-2">
              <span className={cn(EYEBROW, health.cls.split(" ")[0])}>Statut</span>
              {todayPercent >= 70 ? (
                <CheckCircle size={12} weight="duotone" className={health.cls.split(" ")[0]} />
              ) : (
                <WarningCircle size={12} weight="duotone" className={health.cls.split(" ")[0]} />
              )}
            </div>
            <div className={cn("text-xl font-black tabular-nums leading-none tracking-wide", health.cls.split(" ")[0])}>
              {health.label}
            </div>
            <div className="text-[10px] text-muted mt-1.5">
              {deltaService > 0 ? `↑ ${deltaService}% vs hier` : deltaService < 0 ? `↓ ${Math.abs(deltaService)}% vs hier` : "stable vs hier"}
            </div>
          </div>
        </div>

        {/* ZONE 2 — TRADING CHART */}
        <div className="glass-liquid rounded-[14px] p-5 mb-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <TrendUp weight="duotone" size={20} className="text-brand" />
              <div>
                <div className={EYEBROW}>
                  {range === "1J" ? "Heure de pointe · journée"
                    : range === "3M" ? "Performance · 3M · 13 semaines"
                    : range === "6M" ? "Performance · 6M · 6 mois"
                    : `Performance · ${range}`}
                </div>
                <div className="flex items-baseline gap-3 mt-1">
                  <div className="text-3xl font-black text-dark tabular-nums leading-none">
                    {totalPax.toLocaleString("fr-FR")}
                  </div>
                  <span className="text-xs text-muted">
                    {range === "1J" ? "pax entrés" : "pax cumulés"}
                  </span>
                </div>
              </div>
              {range !== "1J" && (
                <>
                  <div className="w-px h-10 bg-black/10 dark:bg-white/10" />
                  <div>
                    <div className="text-[10px] text-muted uppercase">Moyenne</div>
                    <div className="text-xl font-black text-dark tabular-nums mt-0.5">
                      {avgPax}
                      <span className="text-[10px] text-muted font-medium ml-1">
                        {range === "3M" ? "/sem" : range === "6M" ? "/mois" : "/j"}
                      </span>
                    </div>
                  </div>
                </>
              )}
              {peakDay && peakDay.pax > 0 && (
                <>
                  <div className="w-px h-10 bg-black/10 dark:bg-white/10" />
                  <div>
                    <div className="text-[10px] text-muted uppercase">
                      {range === "1J" ? "Pic horaire"
                        : range === "3M" ? "Pic semaine"
                        : range === "6M" ? "Pic mois"
                        : "Pic"}
                    </div>
                    <div className="text-xl font-black text-brand tabular-nums mt-0.5">
                      {peakDay.pax}
                      <span className="text-[10px] text-muted font-medium ml-1">{peakDay.label}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            <span className="text-[10px] text-muted inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-[2px] rounded-full bg-brand" />
              moyenne mobile {range === "1J" ? "1h30"
                : range === "3M" ? "3 sem"
                : range === "6M" ? "3 mois"
                : "7j"}
            </span>
          </div>
          {showDemoBanner && (
            <div className="mb-3 flex items-center gap-3 px-3 py-2.5 rounded-[12px] bg-brand/10 border border-brand/20">
              <span className="text-xs text-dark flex-1">
                Données insuffisantes pour la vue <b>{range}</b>. Générer 6 mois
                de données de démonstration (variation hebdo + saisonnière) ?
              </span>
              <button
                onClick={handleSeedDemo}
                disabled={seedBusy}
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-brand text-white active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {seedBusy ? "Génération…" : "🌱 Générer 6 mois"}
              </button>
            </div>
          )}
          <TradingChart series={series} />
        </div>

        {/* ZONE 3 — FORECAST + PATTERN */}
        <div className="grid md:grid-cols-[1.3fr_1fr] gap-4 mb-5">
          {/* Forecast */}
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar weight="duotone" size={14} className="text-brand" />
              <span className={EYEBROW}>Prévision 7 jours · Morning Doc</span>
            </div>

            {forecast.length === 0 ? (
              <div className="text-xs text-muted text-center py-5">
                Aucune prévision chargée.
                <br />
                <span className="text-[10px]">Importer le briefing du matin pour voir le forecast d'occupation.</span>
              </div>
            ) : (
              <>
                <div
                  className="grid gap-2 items-end mb-1"
                  style={{ gridTemplateColumns: `repeat(${forecast.length}, 1fr)`, height: 110 }}
                >
                  {forecast.map((d, i) => {
                    const danger = d.occupancyPercent >= 95;
                    const warn = d.occupancyPercent >= 80;
                    const heightPx = Math.max(4, (d.occupancyPercent / 100) * 88);
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 justify-end h-full">
                        <span
                          className={cn(
                            "text-[10px] font-bold tabular-nums leading-none",
                            danger ? "text-error" : warn ? "text-amber-600 dark:text-amber-400" : "text-dark"
                          )}
                        >
                          {Math.round(d.occupancyPercent)}%
                        </span>
                        <div
                          className={cn(
                            "w-full rounded-t-[6px]",
                            danger ? "bg-error" : warn ? "bg-amber-500" : "bg-dark dark:bg-white/80"
                          )}
                          style={{
                            height: `${heightPx}px`,
                            opacity: danger ? 1 : warn ? 0.95 : 0.85,
                          }}
                        />
                        <div className="text-[9px] text-muted font-mono text-center leading-tight">
                          {d.date.split(" ")[0]?.slice(0, 3) || d.date.slice(0, 5)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {staffingAlerts.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/8">
                    <div className={cn(EYEBROW, "text-amber-600 dark:text-amber-400 mb-2")}>
                      ⚠ Alertes staffing
                    </div>
                    <div className="space-y-1.5">
                      {staffingAlerts.map((a, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-start gap-2 text-[11px]",
                            a.severity === "danger" ? "text-error" : "text-amber-700 dark:text-amber-400"
                          )}
                        >
                          <span className="font-bold min-w-[110px] truncate">{a.dateLabel}</span>
                          <span className="flex-1 text-dark">{a.message}</span>
                          <span className="font-mono opacity-70 tabular-nums">
                            {Math.round(a.occupancyPercent)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pattern + Top packages */}
          <div className="glass-liquid rounded-[14px] p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendUp weight="duotone" size={14} className="text-brand" />
              <span className={EYEBROW}>Rythme de la semaine</span>
            </div>
            <div className="text-[11px] text-muted mb-3 leading-relaxed">
              Sur les 6 derniers mois, combien de personnes viennent en
              moyenne chaque jour. <span className="text-brand font-bold">Barre en or</span> = aujourd&apos;hui ({["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"][todayDow]}).
            </div>
            <div
              className="grid gap-2 items-end mb-3"
              style={{ gridTemplateColumns: "repeat(7, 1fr)", height: 100 }}
            >
              {dowAvg.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-1 justify-end h-full">
                  {v > 0 && (
                    <span
                      className={cn(
                        "text-[10px] font-bold tabular-nums leading-none",
                        i === todayDow ? "text-brand" : "text-dark"
                      )}
                    >
                      {v}
                    </span>
                  )}
                  <div
                    className={cn(
                      "w-full rounded-t-[6px]",
                      i === todayDow ? "bg-brand" : "bg-dark dark:bg-white/80"
                    )}
                    style={{
                      height: `${(v / dowMax) * 70}px`,
                      minHeight: v > 0 ? "4px" : "0",
                      opacity: i === todayDow ? 1 : v > 0 ? 0.85 : 0.15,
                    }}
                  />
                  <div
                    className={cn(
                      "text-[9px] font-mono",
                      i === todayDow ? "text-brand font-bold" : "text-muted"
                    )}
                  >
                    {dowLabels[i]}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* GSS — Satisfaction client (from Morning Brief) */}
        {gss.length > 0 && (
          <div className="glass-liquid rounded-[14px] p-5 mb-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Star weight="duotone" size={16} className="text-brand" />
                <div>
                  <div className={EYEBROW}>Satisfaction client · GSS</div>
                  <div className="text-xs text-muted mt-0.5">
                    Source · Morning Brief · MTD vs objectif
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
              {gss.map((g) => {
                const mtd = g.mtd ?? 0;
                const goal = g.goal;
                const ytd = g.ytd;
                const aboveGoal = goal !== undefined && mtd >= goal;
                const nearGoal =
                  goal !== undefined && mtd >= goal * 0.95 && mtd < goal;
                const delta =
                  goal !== undefined
                    ? Math.round((mtd - goal) * 10) / 10
                    : null;
                const mtdCls = aboveGoal
                  ? "text-green-700 dark:text-green-400"
                  : nearGoal
                  ? "text-amber-700 dark:text-amber-400"
                  : goal !== undefined
                  ? "text-error"
                  : "text-dark";
                const strokeCls = aboveGoal
                  ? "border-l-green-500/70"
                  : nearGoal
                  ? "border-l-amber-500/70"
                  : goal !== undefined
                  ? "border-l-error/70"
                  : "border-l-transparent";
                return (
                  <div
                    key={g.metric}
                    className={cn(
                      "glass-liquid rounded-[12px] p-3 border-l-[3px]",
                      strokeCls
                    )}
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className={cn(EYEBROW, "truncate")}>
                        {gssShort[g.metric] ?? g.metric}
                      </span>
                      {delta !== null && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md shrink-0",
                            delta >= 0
                              ? "text-green-700 dark:text-green-400 bg-green-500/15"
                              : "text-error bg-error/15"
                          )}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta}
                        </span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-2xl font-black tabular-nums leading-none",
                        mtdCls
                      )}
                    >
                      {mtd.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted mt-1.5 tabular-nums">
                      YTD {ytd !== undefined ? ytd.toFixed(1) : "—"}
                      {goal !== undefined && (
                        <span className="opacity-70"> · obj {goal}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* COMMENTS */}
        {comments.length > 0 && (
          <div className="mb-5">
            <div className="glass-liquid rounded-[14px] p-4">
              <div className="flex items-center gap-2 mb-3">
                <ChatCircleDots
                  weight="duotone"
                  size={14}
                  className="text-brand"
                />
                <span className={EYEBROW}>Commentaires · Morning Brief</span>
              </div>
              {comments.length === 0 ? (
                <div className="text-xs text-muted py-3">
                  Aucun commentaire chargé.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {comments.map((c, i) => {
                    const rating = extractRating(c.text);
                    const ratingCls =
                      rating === null
                        ? "text-muted bg-black/[0.04] dark:bg-white/[0.06]"
                        : rating >= 9
                        ? "text-green-700 dark:text-green-400 bg-green-500/15"
                        : rating >= 7
                        ? "text-amber-700 dark:text-amber-400 bg-amber-500/15"
                        : "text-error bg-error/15";
                    return (
                      <div
                        key={i}
                        className="rounded-[10px] p-2.5 bg-black/[0.02] dark:bg-white/[0.03]"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11px] font-bold text-dark truncate">
                              {c.guestName}
                            </span>
                            <span className="text-[9px] text-muted font-mono uppercase tracking-wider">
                              {c.source}
                            </span>
                          </div>
                          {rating !== null && (
                            <span
                              className={cn(
                                "shrink-0 inline-flex items-center text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md",
                                ratingCls
                              )}
                            >
                              {rating}/10
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted leading-relaxed line-clamp-3">
                          {c.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MONTHLY SUMMARY */}
        <div className="glass-liquid rounded-[14px] p-5 bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className={EYEBROW}>Synthèse mensuelle</div>
              <div className="text-lg font-black text-dark mt-0.5 capitalize">
                {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} · à date
              </div>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-dark text-white dark:bg-white dark:text-black active:scale-[0.97] transition-all"
            >
              {copied ? <><Check size={13} weight="bold" />Copié</> : <><Copy size={13} weight="duotone" />Copier la synthèse</>}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="glass-liquid rounded-[12px] p-3">
              <div className="inline-flex items-center gap-1 text-[9px] text-muted uppercase tracking-wider font-bold">
                <Users size={10} weight="duotone" />
                Couverts
              </div>
              <div className="text-2xl font-black text-dark tabular-nums mt-1 leading-none">
                {stats.totalServed.toLocaleString("fr-FR")}
              </div>
              <div className="text-[10px] text-muted tabular-nums mt-1">
                / {stats.totalExpected.toLocaleString("fr-FR")} attendus
              </div>
            </div>

            <div className="rounded-[12px] p-3 bg-gradient-to-br from-brand/10 to-transparent border border-brand/15">
              <div className="inline-flex items-center gap-1 text-[9px] text-brand uppercase tracking-wider font-bold">
                <Gift size={10} weight="duotone" />
                Compliments
              </div>
              <div className="text-2xl font-black text-brand tabular-nums mt-1 leading-none">
                {stats.compCost.toLocaleString("fr-FR")}
                <span className="text-sm opacity-70 ml-0.5">€</span>
              </div>
              <div className="text-[10px] text-muted tabular-nums mt-1">
                {stats.compPersons} couverts
              </div>
            </div>

            <div className="glass-liquid rounded-[12px] p-3">
              <div className="inline-flex items-center gap-1 text-[9px] text-muted uppercase tracking-wider font-bold">
                <Footprints size={10} weight="duotone" />
                Walk-ins
              </div>
              <div className="text-2xl font-black text-dark tabular-nums mt-1 leading-none">
                {stats.walkInTotal}
              </div>
              <div className="text-[10px] text-muted mt-1">
                couverts hors-liste
              </div>
            </div>

            <div className="glass-liquid rounded-[12px] p-3">
              <div className="inline-flex items-center gap-1 text-[9px] text-muted uppercase tracking-wider font-bold">
                <ShieldCheck size={10} weight="duotone" />
                VIPs servis
              </div>
              <div className="text-2xl font-black text-dark tabular-nums mt-1 leading-none">
                {stats.vipsServed}
                <span className="text-sm text-muted ml-1">/{stats.vipsTotal}</span>
              </div>
              <div className="text-[10px] text-muted mt-1">
                {stats.vipsMissed} non-vus
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-muted font-mono tabular-nums">
            {stats.daysActive} jours actifs · taux d'assistance{" "}
            <span className="text-dark font-bold">{stats.attendanceRate}%</span>{" "}
            (min {stats.attendanceRateMin}% · max {stats.attendanceRateMax}%)
          </div>
        </div>
      </div>
    </div>
  );
}
