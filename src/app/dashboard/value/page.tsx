"use client";

/**
 * The monthly value report.
 *
 * One page, one month, one hotel. It exists because the product saves money
 * invisibly, and invisible value gets priced at zero.
 *
 * Two rules shape every line on it:
 *
 * 1. Nothing is estimated. Every figure is either counted from what reception
 *    recorded or multiplied by an assumption printed on the same page. Where an
 *    assumption is missing the figure is withheld, not guessed.
 * 2. The assumptions are editable here, on the report, next to the number they
 *    move. A number you can argue with is a number you can believe.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarBlank,
  ClockCounterClockwise,
  Crown,
  Info,
  PencilSimple,
  TrendUp,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { getHistoricalData, getSessionHistory, getTodayData } from "@/lib/storage";
import { RETENTION_DAYS } from "@/lib/storage";
import { computeValueReport, daysInMonth } from "@/lib/value-report";
import { readAssumptions, writeAssumptions } from "@/lib/value-settings";
import { markMonthSeen, monthsWithData, previousMonth } from "@/lib/value-notice";
import type { ValueAssumptions } from "@/lib/value-report";
import type { DailyData } from "@/lib/types";
import { cn } from "@/lib/utils";

const EYEBROW =
  "text-micro text-muted uppercase tracking-wider font-bold";

function euro(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * An assumption, shown as the sentence it is and editable in place.
 *
 * Deliberately not tucked into a settings screen. The argument a director has
 * with this report is about these three numbers, and it should happen with the
 * number in front of them, not two taps away.
 */
function Assumption({
  label,
  value,
  suffix,
  onSave,
  placeholder,
}: {
  label: string;
  value: number | null;
  suffix: string;
  onSave: (v: number | null) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const begin = () => {
    setDraft(value === null ? "" : String(value));
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    onSave(trimmed === "" ? null : Number(trimmed.replace(",", ".")));
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      {editing ? (
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-24 px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-brand/40 text-dark dark:text-white text-xs font-bold text-right tabular-nums"
        />
      ) : (
        <button
          onPointerDown={begin}
          className="inline-flex items-center gap-1.5 text-xs font-bold tabular-nums text-dark dark:text-white hover:text-brand transition-colors"
        >
          {value === null ? (
            <span className="text-brand-ink dark:text-brand-light">à définir</span>
          ) : (
            <span>
              {value.toLocaleString("fr-FR")} {suffix}
            </span>
          )}
          <PencilSimple size={11} weight="bold" className="opacity-50" />
        </button>
      )}
    </div>
  );
}

export default function ValueReportPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [days, setDays] = useState<DailyData[]>([]);
  const [assumptions, setAssumptions] = useState<ValueAssumptions | null>(null);
  const [month, setMonth] = useState<string>("");

  useEffect(() => {
    // 400 days rather than 30: retention is what limits this, not the query,
    // and a hotel that lengthens its window should see the extra months.
    const history = getHistoricalData(400);
    const byDate = new Map<string, DailyData>();
    for (const d of history) byDate.set(d.date, d);
    for (const s of getSessionHistory()) {
      if (!byDate.has(s.date)) {
        byDate.set(s.date, { date: s.date, clients: s.clients, checkIns: s.checkIns });
      }
    }
    const today = getTodayData();
    if (today && !byDate.has(today.date)) byDate.set(today.date, today);

    const all = Array.from(byDate.values());
    setDays(all);
    setAssumptions(readAssumptions());

    // Land on last month — the one that is actually finished — falling back to
    // the newest month that has anything in it.
    const todayIso = new Date().toISOString().split("T")[0];
    const available = monthsWithData(all);
    const last = previousMonth(todayIso);
    setMonth(available.includes(last) ? last : available[0] ?? last);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (month) markMonthSeen(month);
  }, [month]);

  const available = useMemo(() => monthsWithData(days), [days]);

  const report = useMemo(() => {
    if (!assumptions || !month) return null;
    return computeValueReport(days, month, assumptions, { retentionDays: RETENTION_DAYS });
  }, [days, month, assumptions]);

  const patch = (p: Partial<ValueAssumptions>) => {
    writeAssumptions(p);
    setAssumptions(readAssumptions());
  };

  if (!mounted || !report || !assumptions) {
    return <div className="min-h-dvh screen-safe bg-background dark:bg-ink" />;
  }

  const { first, last } = daysInMonth(month);

  return (
    <div className="min-h-dvh screen-safe bg-background dark:bg-ink p-4 pb-16">
      <div className="max-w-3xl mx-auto">
        <button
          onPointerDown={() => router.push("/dashboard")}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-brand transition-colors mb-4"
        >
          <ArrowLeft size={14} weight="bold" />
          Tableau de bord
        </button>

        {/* HEADER */}
        <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
          <div>
            <div className={cn(EYEBROW, "text-brand")}>Rapport de valeur</div>
            <h1 className="text-3xl font-black text-dark dark:text-white leading-tight mt-1 capitalize">
              {monthLabel(month)}
            </h1>
            <div className="text-xs text-muted mt-0.5 tabular-nums">
              {report.daysActive} service{report.daysActive > 1 ? "s" : ""} enregistré
              {report.daysActive > 1 ? "s" : ""}
              {report.hasData && ` · ${report.firstDay} → ${report.lastDay}`}
            </div>
          </div>

          {available.length > 1 && (
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="surface-field rounded-md px-3 py-2 text-xs font-bold text-dark dark:text-white capitalize"
              aria-label="Choisir le mois"
            >
              {available.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}
        </div>

        {!report.hasData ? (
          <div className="glass-liquid rounded-card p-6 text-center">
            <p className="text-sm font-bold text-dark dark:text-white">
              Aucun service enregistré en {monthLabel(month)}
            </p>
            <p className="text-xs text-muted mt-1">
              Rien à rapporter — et rien d&apos;inventé pour combler le vide.
            </p>
          </div>
        ) : (
          <>
            {/* THE KEY NUMBER */}
            <div className="glass-liquid rounded-card p-6 mb-4 border-2 border-brand/30">
              <div className={cn(EYEBROW, "text-brand")}>
                Couverts servis hors liste
              </div>
              <div className="text-6xl font-black text-brand tabular-nums leading-none mt-2">
                {report.offListCovers.toLocaleString("fr-FR")}
              </div>
              <div className="text-3xl font-black text-dark dark:text-white tabular-nums leading-none mt-2">
                {euro(report.offListValue)}
              </div>
              <p className="text-xs text-muted mt-3 max-w-md">
                Des petits-déjeuners servis à des clients qu&apos;aucune réservation
                n&apos;autorisait. Avant, personne ne les comptait.
                <span className="block mt-1 opacity-70">
                  {report.offListCovers} × {assumptions.breakfastPrice.toLocaleString("fr-FR")} €
                </span>
              </p>

              {report.offListBreakdown.length > 0 && (
                <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                  {report.offListBreakdown.map((line) => (
                    <div key={line.key} className="flex items-baseline justify-between gap-2">
                      <span className="text-micro text-muted truncate">{line.label}</span>
                      <span className="text-xs font-bold text-dark dark:text-white tabular-nums">
                        {line.covers}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* VOLUME + TIME */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="glass-liquid rounded-card p-4">
                <div className="flex items-center gap-1.5">
                  <Users size={12} weight="duotone" className="text-brand" />
                  <span className={EYEBROW}>Couverts</span>
                </div>
                <div className="text-3xl font-black text-dark dark:text-white tabular-nums leading-none mt-2">
                  {report.covers.toLocaleString("fr-FR")}
                </div>
                <div className="text-micro text-muted mt-1.5">
                  sur {report.daysActive} service{report.daysActive > 1 ? "s" : ""}
                </div>
              </div>

              <div className="glass-liquid rounded-card p-4">
                <div className="flex items-center gap-1.5">
                  <ClockCounterClockwise size={12} weight="duotone" className="text-brand" />
                  <span className={EYEBROW}>Temps épargné</span>
                </div>
                <div className="text-3xl font-black text-dark dark:text-white tabular-nums leading-none mt-2">
                  {report.hoursSaved.toLocaleString("fr-FR")} h
                </div>
                <div className="text-micro text-muted mt-1.5">
                  {report.staffValue === null ? (
                    <span className="text-brand-ink dark:text-brand-light font-bold">
                      définir le taux horaire ↓
                    </span>
                  ) : (
                    euro(report.staffValue)
                  )}
                </div>
              </div>
            </div>

            {/* OPERATIONS — what F&B staffs against */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              <div className="glass-liquid rounded-card p-4">
                <div className="flex items-center gap-1.5">
                  <TrendUp size={12} weight="duotone" className="text-brand" />
                  <span className={EYEBROW}>Service le plus chargé</span>
                </div>
                {report.busiestService ? (
                  <>
                    <div className="text-2xl font-black text-dark dark:text-white tabular-nums leading-none mt-2">
                      {report.busiestService.covers}
                    </div>
                    <div className="text-micro text-muted mt-1.5 capitalize">
                      {dayLabel(report.busiestService.date)}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted mt-2">—</div>
                )}
              </div>

              <div className="glass-liquid rounded-card p-4">
                <div className="flex items-center gap-1.5">
                  <CalendarBlank size={12} weight="duotone" className="text-brand" />
                  <span className={EYEBROW}>Pic — 15 min</span>
                </div>
                {report.peakQuarter ? (
                  <>
                    <div className="text-2xl font-black text-dark dark:text-white tabular-nums leading-none mt-2">
                      {report.peakQuarter.covers}
                    </div>
                    <div className="text-micro text-muted mt-1.5 tabular-nums">
                      à {report.peakQuarter.time} · {report.peakQuarter.date}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted mt-2">—</div>
                )}
              </div>

              <div className="glass-liquid rounded-card p-4">
                <div className="flex items-center gap-1.5">
                  <Crown size={12} weight="duotone" className="text-brand" />
                  <span className={EYEBROW}>VIP descendus</span>
                </div>
                <div className="text-2xl font-black text-dark dark:text-white tabular-nums leading-none mt-2">
                  {report.vipsServed}
                  <span className="text-base text-muted font-bold"> / {report.vipsTotal}</span>
                </div>
                <div className="text-micro text-muted mt-1.5 tabular-nums">
                  {report.vipsMissed} non vu{report.vipsMissed > 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* THE BOTTOM LINE */}
            <div className="glass-liquid rounded-card p-5 mb-4">
              <div className={EYEBROW}>Valeur estimée du mois</div>
              {report.totalValue === null ? (
                <p className="text-sm text-dark dark:text-white mt-2">
                  {euro(report.offListValue)} de couverts récupérés, plus{" "}
                  {report.hoursSaved.toLocaleString("fr-FR")} h de personnel — dont la
                  valeur en euros attend un taux horaire.
                </p>
              ) : (
                <div className="flex items-baseline gap-2 flex-wrap mt-2">
                  <span className="text-3xl font-black text-brand tabular-nums leading-none">
                    {euro(report.totalValue)}
                  </span>
                  {report.monthlyFee !== null && (
                    <span className="text-sm text-muted tabular-nums">
                      contre {euro(report.monthlyFee)} facturés
                      {report.monthlyFee > 0 && (
                        <b className="text-dark dark:text-white">
                          {" "}
                          · ×{(report.totalValue / report.monthlyFee).toFixed(1)}
                        </b>
                      )}
                    </span>
                  )}
                </div>
              )}
              {report.monthlyFee === null && (
                <p className="text-micro text-muted mt-2">
                  Renseigne l&apos;abonnement ci-dessous pour afficher la comparaison.
                </p>
              )}
            </div>

            {/* ASSUMPTIONS — printed, editable, arguable */}
            <div className="glass-liquid rounded-card p-5">
              <div className="flex items-center gap-1.5 mb-1">
                <Info size={12} weight="duotone" className="text-brand" />
                <span className={EYEBROW}>Hypothèses</span>
              </div>
              <p className="text-micro text-muted mb-2">
                Les seuls chiffres de cette page qui ne sont pas mesurés. Modifie-les
                — tout se recalcule.
              </p>
              <div className="divide-y divide-black/5 dark:divide-white/10">
                <Assumption
                  label="Temps de traitement par couvert"
                  value={assumptions.secondsPerCover}
                  suffix="s"
                  placeholder="20"
                  onSave={(v) => patch({ secondsPerCover: v ?? 20 })}
                />
                <Assumption
                  label="Coût horaire chargé du personnel"
                  value={assumptions.hourlyRate}
                  suffix="€/h"
                  placeholder="—"
                  onSave={(v) => patch({ hourlyRate: v })}
                />
                <Assumption
                  label="Prix moyen d'un petit-déjeuner"
                  value={assumptions.breakfastPrice}
                  suffix="€"
                  placeholder="26"
                  onSave={(v) => patch({ breakfastPrice: v ?? 26 })}
                />
                <Assumption
                  label="Abonnement mensuel facturé"
                  value={assumptions.monthlyFee}
                  suffix="€"
                  placeholder="—"
                  onSave={(v) => patch({ monthlyFee: v })}
                />
              </div>
            </div>

            {/* WHAT THIS PAGE CANNOT SAY */}
            {report.retentionLimited && (
              <div className="mt-4 flex items-start gap-2 rounded-card p-4 bg-brand-50 dark:bg-white/5">
                <Warning size={14} weight="duotone" className="text-brand-ink shrink-0 mt-0.5" />
                <p className="text-xs text-notice-ink dark:text-brand-light">
                  Les données sont conservées {RETENTION_DAYS} jours sur cet appareil.
                  Le mois commence le {first} mais nous ne remontons qu&apos;au{" "}
                  {report.retainedFrom} — <b>ces totaux sont un plancher, pas un total</b>.
                  {last > report.retainedFrom && " Les services antérieurs ont été purgés."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
