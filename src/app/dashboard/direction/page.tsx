"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  ArrowUp,
  ArrowDown,
  Clock,
  Gift,
  Coffee,
  Users,
  Footprints,
  WarningCircle,
  CheckCircle,
  Crown,
  CaretLeft,
  Copy,
  Check,
  Bell,
} from "@phosphor-icons/react/dist/ssr";
import {
  getHistoricalData,
  getTodayData,
  getSessionHistory,
  getDataForDate,
  getSettings,
} from "@/lib/storage";
import {
  getDailySnapshot,
  getTopPackages,
} from "@/lib/analytics";
import {
  computeMonthlyStats,
  formatMonthlyStatsMarkdown,
} from "@/lib/monthly-stats";
import { generateDayReport } from "@/lib/report";
import type { DailyData } from "@/lib/types";

const MGR_CODE = "4625";
const MGR_KEY = "mgr-code-ok";

type Range = "7J" | "1M" | "3M" | "6M" | "Custom";

interface DayPoint {
  date: string;
  pax: number;
  isToday: boolean;
  dow: number;
  label: string;
  mavg: number;
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
      mavg: 0, // filled below
    });
  }
  // moving average window 7
  const w = 7;
  for (let i = 0; i < out.length; i++) {
    const start = Math.max(0, i - Math.floor(w / 2));
    const end = Math.min(out.length, i + Math.ceil(w / 2));
    let sum = 0;
    for (let k = start; k < end; k++) sum += out[k].pax;
    out[i].mavg = sum / (end - start);
  }
  return out;
}

function CodeGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const press = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === MGR_CODE) {
          localStorage.setItem(MGR_KEY, "1");
          onSuccess();
        } else {
          setError(true);
          setTimeout(() => {
            setPin("");
            setError(false);
          }, 600);
        }
      }, 180);
    }
  };

  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="aur-gate">
      <div className="aur-gate-card">
        <div className="flex justify-center">
          <span
            className="grid place-items-center rounded-full"
            style={{
              width: 52,
              height: 52,
              background: "var(--aur-gold-soft)",
              color: "var(--aur-gold)",
              border: "1px solid var(--aur-gold-soft-2)",
            }}
          >
            <Lock weight="duotone" size={22} />
          </span>
        </div>
        <h1
          className="aur-serif"
          style={{ fontSize: 24, margin: "12px 0 4px", color: "var(--aur-ink)" }}
        >
          Espace Direction
        </h1>
        <p style={{ color: "var(--aur-muted)", fontSize: 12, marginBottom: 22 }}>
          Saisissez votre code à 4 chiffres
        </p>
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`aur-gate-dot ${i < pin.length ? "filled" : ""} ${
                error ? "error" : ""
              }`}
            />
          ))}
        </div>
        <div className="aur-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} onClick={() => press(String(n))}>
              {n}
            </button>
          ))}
          <button
            onClick={() => setPin("")}
            style={{
              fontFamily: "var(--sans)",
              fontSize: 11,
              color: "var(--aur-muted)",
            }}
          >
            Effacer
          </button>
          <button onClick={() => press("0")}>0</button>
          <button
            onClick={back}
            style={{
              fontFamily: "var(--sans)",
              fontSize: 11,
              color: "var(--aur-muted)",
            }}
          >
            ←
          </button>
        </div>
      </div>
    </div>
  );
}

function Donut({
  value,
  max,
  size = 140,
  stroke = 10,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  children: React.ReactNode;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const cx = size / 2;
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--aur-hairline)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="var(--aur-gold)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 600ms var(--aur-ease)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {children}
      </div>
    </div>
  );
}

function Delta({ pct }: { pct: number }) {
  if (pct === 0) {
    return <span className="aur-delta aur-delta-flat">—</span>;
  }
  const positive = pct > 0;
  return (
    <span className={`aur-delta ${positive ? "aur-delta-up" : "aur-delta-down"}`}>
      {positive ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
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
  const opts: Range[] = ["7J", "1M", "3M", "6M", "Custom"];
  return (
    <div className="aur-time-toggle">
      {opts.map((o) => (
        <button key={o} aria-pressed={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function TradingChart({ series }: { series: DayPoint[] }) {
  if (series.length === 0) return null;
  const w = 880;
  const h = 220;
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...series.map((d) => d.pax), 1) * 1.15;
  const total = series.reduce((s, d) => s + d.pax, 0);
  const avg = total / series.length;
  const bw = innerW / series.length;
  const xy = (i: number, v: number) => [padL + i * bw + bw / 2, padT + innerH - (v / max) * innerH];

  return (
    <div style={{ overflowX: "auto", scrollbarWidth: "thin" }}>
      <svg width={Math.max(w, series.length * 24 + 60)} height={h}>
        {[0, 0.5, 1].map((p, i) => {
          const y = padT + innerH - p * innerH;
          return (
            <line
              key={i}
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="var(--aur-hairline)"
            />
          );
        })}

        {series.map((d, i) => {
          const yTop = padT + innerH - (d.pax / max) * innerH;
          const barW = Math.max(6, bw - 4);
          const above = d.pax >= avg;
          return (
            <rect
              key={i}
              x={padL + i * bw + bw / 2 - barW / 2}
              y={yTop}
              width={barW}
              height={Math.max(0, padT + innerH - yTop)}
              rx={6}
              ry={6}
              fill={d.isToday ? "var(--aur-gold)" : above ? "var(--aur-ink)" : "var(--aur-bad)"}
              opacity={d.isToday ? 1 : above ? 0.92 : 0.5}
            >
              <title>
                {d.label}: {d.pax} pax
              </title>
            </rect>
          );
        })}

        <polyline
          points={series.map((d, i) => xy(i, d.mavg).join(",")).join(" ")}
          fill="none"
          stroke="var(--aur-gold)"
          strokeWidth="1.4"
          strokeDasharray="3 3"
        />

        <line
          x1={padL}
          x2={w - padR}
          y1={padT + innerH - (avg / max) * innerH}
          y2={padT + innerH - (avg / max) * innerH}
          stroke="var(--aur-muted-2)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />

        {series.map((d, i) => {
          const stride = Math.max(1, Math.floor(series.length / 8));
          if (i % stride !== 0 && !d.isToday) return null;
          const [x] = xy(i, 0);
          return (
            <text
              key={i}
              x={x}
              y={h - 4}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-aur-mono)"
              fill={d.isToday ? "var(--aur-gold)" : "var(--aur-muted)"}
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface Anomaly {
  kind: "warn" | "ok" | "bad";
  title: string;
  body: string;
}

export default function DirectionDashboardPage() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [range, setRange] = useState<Range>("7J");
  const [history, setHistory] = useState<DailyData[]>([]);
  const [todayData, setTodayData] = useState<DailyData | null>(null);
  const [costPerCover, setCostPerCover] = useState(26);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ok = localStorage.getItem(MGR_KEY) === "1";
    setUnlocked(ok);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    setCostPerCover(getSettings().costPerCover);
    setHistory(getHistoricalData(180));
    setTodayData(getTodayData());
  }, [unlocked]);

  const monthData = useMemo(() => {
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
  }, [history, todayData]);

  const stats = useMemo(
    () => computeMonthlyStats(monthData, costPerCover),
    [monthData, costPerCover]
  );

  const todaySnapshot = useMemo(
    () => (todayData ? getDailySnapshot(todayData, costPerCover) : null),
    [todayData, costPerCover]
  );

  const todayReport = useMemo(
    () => (todayData ? generateDayReport(todayData.clients, todayData.checkIns) : null),
    [todayData]
  );

  // Yesterday data for delta
  const yesterdayPercent = useMemo(() => {
    const today = new Date();
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const dateStr = yest.toISOString().split("T")[0];
    const sessions = getSessionHistory();
    const sess = sessions.find((s) => s.date === dateStr);
    const data = sess
      ? { clients: sess.clients, checkIns: sess.checkIns }
      : getDataForDate(dateStr);
    if (!data) return null;
    const expected = data.clients.reduce((s, c) => s + c.adults + c.children, 0);
    if (expected === 0) return null;
    const entered = data.checkIns.reduce((s, c) => s + c.peopleEntered, 0);
    return Math.min(100, Math.round((entered / expected) * 100));
  }, []);

  const todayPercent = todaySnapshot
    ? Math.round((todaySnapshot.totalShowedUp / Math.max(1, todaySnapshot.totalExpected)) * 100)
    : 0;
  const deltaService =
    yesterdayPercent !== null ? todayPercent - yesterdayPercent : 0;

  const series = useMemo(() => {
    const days =
      range === "7J" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : range === "6M" ? 180 : 14;
    return buildSeries(monthData, days);
  }, [monthData, range]);

  // Anomalies — derived from real data
  const anomalies: Anomaly[] = useMemo(() => {
    const out: Anomaly[] = [];
    if (todayReport) {
      const noShows = todayReport.totalRemaining;
      const expected = todayReport.totalGuests;
      const noShowRate = expected > 0 ? Math.round((noShows / expected) * 100) : 0;
      if (noShowRate > 25) {
        out.push({
          kind: "warn",
          title: `${noShowRate}% no-show aujourd'hui`,
          body: `${noShows} personnes attendues mais absentes. Vérifier l'équipe d'accueil.`,
        });
      }
      if (todayReport.sourceBreakdown.walkInRooms > 0) {
        const paid =
          todayReport.sourceBreakdown.byPayment.points +
          todayReport.sourceBreakdown.byPayment.cash +
          todayReport.sourceBreakdown.byPayment.room;
        const free = todayReport.sourceBreakdown.byPayment.compliment;
        if (free > paid && paid + free > 0) {
          out.push({
            kind: "bad",
            title: "Compliments majoritaires hors-liste",
            body: `${free} couverts offerts vs ${paid} payés. Contrôle compta recommandé.`,
          });
        }
      }
      const vipsTotal = todayReport.totalVip;
      const vipsServed = todayReport.rooms.filter(
        (r) => r.isVip && r.entered > 0
      ).length;
      const vipsMissed = vipsTotal - vipsServed;
      if (vipsMissed > 0 && vipsTotal > 0) {
        out.push({
          kind: "bad",
          title: `${vipsMissed} VIP non-vu${vipsMissed > 1 ? "s" : ""}`,
          body: `Sur ${vipsTotal} VIPs attendus. Risque de plainte — relancer la réception.`,
        });
      }
    }
    if (out.length === 0) {
      out.push({
        kind: "ok",
        title: "Tout est vert",
        body: "Aucune anomalie détectée. Service nominal.",
      });
    }
    return out.slice(0, 3);
  }, [todayReport]);

  // Day-of-week pattern
  const dowAvg = useMemo(() => {
    const buckets: number[][] = [[], [], [], [], [], [], []];
    for (const d of monthData) {
      const dt = new Date(d.date + "T12:00:00");
      const dow = dt.getDay();
      const pax = d.checkIns.reduce((s, ci) => s + ci.peopleEntered, 0);
      if (pax > 0) buckets[dow].push(pax);
    }
    return buckets.map((arr) =>
      arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length
    );
  }, [monthData]);

  const dowMax = Math.max(...dowAvg, 1);
  const dowLabels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const todayDow = new Date().getDay();

  const topPackages = useMemo(
    () => (monthData.length > 0 ? getTopPackages(monthData, 4) : []),
    [monthData]
  );

  const total = series.reduce((s, d) => s + d.pax, 0);
  const avg = series.length > 0 ? Math.round(total / series.length) : 0;
  const yest = series.length >= 2 ? series[series.length - 2].pax : 1;
  const today = series.length >= 1 ? series[series.length - 1].pax : 0;
  const deltaTotal = yest > 0 ? Math.round(((today - yest) / yest) * 100) : 0;

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

  const handleLock = () => {
    localStorage.removeItem(MGR_KEY);
    router.push("/dashboard");
  };

  if (!unlocked) {
    return <CodeGate onSuccess={() => setUnlocked(true)} />;
  }

  return (
    <div className="aur-shell">
      <div
        style={{
          maxWidth: 1024,
          margin: "0 auto",
          padding: "20px 22px 80px",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <div
              className="aur-eyebrow flex items-center gap-1.5"
              style={{ color: "var(--aur-gold)" }}
            >
              <ShieldCheck size={11} weight="duotone" />
              Direction · F&B · Opérations
            </div>
            <h1
              className="aur-serif"
              style={{
                fontSize: 34,
                margin: "6px 0 0",
                fontWeight: 400,
                color: "var(--aur-ink)",
              }}
            >
              Bonjour Direction.
            </h1>
            <div
              style={{
                fontSize: 12,
                marginTop: 4,
                color: "var(--aur-muted)",
              }}
            >
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · service en cours
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TimeToggle value={range} onChange={setRange} />
            <button
              onClick={handleLock}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: "transparent",
                color: "var(--aur-ink-2)",
                border: "1px solid var(--aur-border)",
              }}
            >
              <Lock size={12} weight="duotone" />
              Verrouiller
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: "transparent",
                color: "var(--aur-muted)",
              }}
            >
              <CaretLeft size={12} weight="bold" />
              Vue équipe
            </button>
          </div>
        </div>

        {/* 5s glance */}
        <div className="aur-eyebrow mb-2">Coup d'œil · 5s</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr",
            gap: 12,
            marginBottom: 22,
          }}
        >
          {/* Service donut */}
          <div className="aur-card aur-card-pad-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="aur-eyebrow">Service du jour</span>
              <Delta pct={deltaService} />
            </div>
            <div className="flex items-center gap-5">
              <Donut
                value={todaySnapshot?.totalShowedUp ?? 0}
                max={todaySnapshot?.totalExpected ?? 1}
                size={140}
                stroke={10}
              >
                <span className="aur-serif" style={{ fontSize: 36 }}>
                  {todayPercent}%
                </span>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--aur-muted)",
                    marginTop: 4,
                  }}
                >
                  Présence
                </span>
              </Donut>
              <div style={{ flex: 1, fontSize: 12, color: "var(--aur-muted)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span>
                    {todayReport?.totalEntered ?? 0}/
                    {todayReport?.totalGuests ?? 0}
                  </span>
                  <span className="aur-mono">pax</span>
                </div>
                <div className="aur-progress" style={{ marginBottom: 10 }}>
                  <i
                    style={{
                      width: `${
                        todayReport && todayReport.totalGuests > 0
                          ? Math.min(
                              100,
                              (todayReport.totalEntered / todayReport.totalGuests) * 100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <span>
                    {todayReport
                      ? todayReport.rooms.filter((r) => r.entered > 0).length
                      : 0}
                    /{todayReport?.totalRooms ?? 0}
                  </span>
                  <span className="aur-mono">chambres</span>
                </div>
                <div className="aur-progress">
                  <i
                    style={{
                      width: `${
                        todayReport && todayReport.totalRooms > 0
                          ? Math.min(
                              100,
                              (todayReport.rooms.filter((r) => r.entered > 0).length /
                                todayReport.totalRooms) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Peak hour */}
          <div className="aur-card aur-card-pad-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="aur-eyebrow">Pic d'affluence</span>
              <Clock size={13} weight="duotone" style={{ color: "var(--aur-gold)" }} />
            </div>
            <div className="aur-serif" style={{ fontSize: 56 }}>
              {stats.peakHourMostCommon || "—"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--aur-muted)",
                marginTop: 8,
              }}
            >
              moyenne récurrente
            </div>
          </div>

          {/* Compliments */}
          <div
            className="aur-card aur-card-pad-lg"
            style={{
              background:
                "linear-gradient(160deg, var(--aur-gold-soft), var(--aur-surface) 80%)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="aur-eyebrow" style={{ color: "var(--aur-gold)" }}>
                Compliments
              </span>
              <Gift size={13} weight="duotone" style={{ color: "var(--aur-gold)" }} />
            </div>
            <div
              className="aur-serif"
              style={{ fontSize: 56, color: "var(--aur-gold)" }}
            >
              {stats.compCost.toLocaleString("fr-FR")}
              <span style={{ fontSize: 24, opacity: 0.7, marginLeft: 4 }}>€</span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--aur-muted)",
                marginTop: 8,
              }}
            >
              {stats.compPersons} couverts offerts cumulés
            </div>
          </div>
        </div>

        {/* 15s anomalies */}
        <div className="aur-eyebrow mb-2">Anomalies · 15s</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(3, anomalies.length)}, 1fr)`,
            gap: 10,
            marginBottom: 22,
          }}
        >
          {anomalies.map((a, i) => {
            const Icon =
              a.kind === "ok" ? CheckCircle : a.kind === "bad" ? WarningCircle : Bell;
            return (
              <div key={i} className={`aur-anomaly ${a.kind}`}>
                <span className="ico">
                  <Icon size={16} weight="duotone" />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>{a.title}</div>
                  <div
                    style={{
                      color: "var(--aur-muted)",
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    {a.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 30s trading chart */}
        <div className="aur-eyebrow mb-2">Performance · 30s</div>
        <div className="aur-card aur-card-pad-lg" style={{ marginBottom: 22 }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div>
                <div className="aur-serif" style={{ fontSize: 36 }}>
                  {total.toLocaleString("fr-FR")}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--aur-muted)",
                    marginTop: 4,
                  }}
                >
                  pax · {range}
                </div>
              </div>
              <div
                style={{
                  width: 1,
                  height: 40,
                  background: "var(--aur-hairline)",
                }}
              />
              <div>
                <Delta pct={deltaTotal} />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--aur-muted)",
                    marginTop: 6,
                  }}
                >
                  Moyenne <span className="aur-mono">{avg}</span> pax/j
                </div>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "var(--aur-muted)" }}>
              ··· moyenne mobile 7j
            </span>
          </div>
          <TradingChart series={series} />
        </div>

        {/* Top packages + DoW pattern */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 12,
            marginBottom: 22,
          }}
        >
          <div className="aur-card aur-card-pad">
            <div className="aur-eyebrow mb-3">Top packages — période</div>
            <div className="flex flex-col gap-3">
              {topPackages.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--aur-muted)" }}>
                  Aucun package détecté.
                </div>
              ) : (
                topPackages.map((p, i) => {
                  const maxRooms = topPackages[0].rooms || 1;
                  return (
                    <div key={p.code}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={{ fontWeight: 500, fontSize: 13 }}>
                          {i + 1}. {p.code}
                        </span>
                        <span className="aur-mono" style={{ color: "var(--aur-muted)", fontSize: 12 }}>
                          {p.rooms} ch
                        </span>
                      </div>
                      <div className="aur-progress">
                        <i style={{ width: `${(p.rooms / maxRooms) * 100}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="aur-card aur-card-pad">
            <div className="aur-eyebrow mb-3">Pattern jour de la semaine</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
                alignItems: "end",
                height: 110,
              }}
            >
              {dowAvg.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div
                    style={{
                      width: "100%",
                      height: `${(v / dowMax) * 80}px`,
                      background:
                        i === todayDow ? "var(--aur-gold)" : "var(--aur-ink)",
                      borderRadius: "6px 6px 2px 2px",
                      opacity: i === todayDow ? 1 : v > 0 ? 0.85 : 0.2,
                      transition: "all 200ms",
                    }}
                  />
                  <div
                    className="aur-mono"
                    style={{
                      fontSize: 9.5,
                      color: i === todayDow ? "var(--aur-gold)" : "var(--aur-muted)",
                    }}
                  >
                    {dowLabels[i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly summary + copy */}
        <div
          className="aur-card aur-card-pad-lg"
          style={{ background: "var(--aur-surface-2)" }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="aur-eyebrow">Synthèse mensuelle</div>
              <div className="aur-serif" style={{ fontSize: 22, marginTop: 4 }}>
                {new Date().toLocaleDateString("fr-FR", {
                  month: "long",
                  year: "numeric",
                })}{" "}
                · à date
              </div>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold"
              style={{
                background: "var(--aur-ink)",
                color: "var(--aur-bg-elev)",
              }}
            >
              {copied ? (
                <>
                  <Check size={13} weight="bold" />
                  Copié
                </>
              ) : (
                <>
                  <Copy size={13} weight="duotone" />
                  Copier la synthèse
                </>
              )}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
            }}
          >
            <div className="aur-tile">
              <div className="flex items-center gap-1.5">
                <Users size={11} weight="duotone" style={{ color: "var(--aur-muted)" }} />
                <span className="aur-tile-lbl">Couverts</span>
              </div>
              <div className="aur-tile-num">{stats.totalServed.toLocaleString("fr-FR")}</div>
              <span style={{ fontSize: 10.5, color: "var(--aur-muted-2)" }}>
                sur {stats.totalExpected.toLocaleString("fr-FR")} attendus
              </span>
            </div>
            <div
              className="aur-tile"
              style={{
                background:
                  "linear-gradient(160deg, var(--aur-gold-soft), var(--aur-surface) 70%)",
                borderColor: "var(--aur-gold-soft-2)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <Gift size={11} weight="duotone" style={{ color: "var(--aur-gold)" }} />
                <span className="aur-tile-lbl" style={{ color: "var(--aur-gold)" }}>
                  Compliments
                </span>
              </div>
              <div className="aur-tile-num" style={{ color: "var(--aur-gold)" }}>
                {stats.compCost.toLocaleString("fr-FR")}
                <span style={{ fontSize: 14, opacity: 0.7, marginLeft: 2 }}>€</span>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--aur-muted)" }}>
                {stats.compPersons} couverts
              </span>
            </div>
            <div className="aur-tile">
              <div className="flex items-center gap-1.5">
                <Footprints size={11} weight="duotone" style={{ color: "var(--aur-muted)" }} />
                <span className="aur-tile-lbl">Walk-ins</span>
              </div>
              <div className="aur-tile-num">{stats.walkInTotal}</div>
              <span style={{ fontSize: 10.5, color: "var(--aur-muted-2)" }}>
                couverts hors-liste
              </span>
            </div>
            <div className="aur-tile">
              <div className="flex items-center gap-1.5">
                <Crown size={11} weight="duotone" style={{ color: "var(--aur-muted)" }} />
                <span className="aur-tile-lbl">VIPs servis</span>
              </div>
              <div className="aur-tile-num">
                {stats.vipsServed}
                <span style={{ fontSize: 14, color: "var(--aur-muted)", marginLeft: 4 }}>
                  /{stats.vipsTotal}
                </span>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--aur-muted-2)" }}>
                {stats.vipsMissed} non-vus
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 10.5,
              color: "var(--aur-muted-2)",
              fontFamily: "var(--font-aur-mono)",
            }}
          >
            {stats.daysActive} jours actifs · taux d'assistance{" "}
            <span style={{ color: "var(--aur-ink)", fontWeight: 600 }}>
              {stats.attendanceRate}%
            </span>{" "}
            (min {stats.attendanceRateMin}% · max {stats.attendanceRateMax}%)
          </div>
        </div>
      </div>
    </div>
  );
}
