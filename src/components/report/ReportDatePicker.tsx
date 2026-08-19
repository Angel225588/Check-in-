"use client";
import { useState } from "react";
import { CaretLeft, CaretRight, CalendarBlank, Check } from "@phosphor-icons/react/dist/ssr";
import { stepDay } from "@/lib/report-days";

/**
 * The report's date, as a control rather than a caption.
 *
 * "How did we do yesterday" is asked as often as "how did we do today", and
 * answering it meant leaving for a history screen and coming back. The heading
 * was already the right place to look; it just did not do anything.
 *
 * Arrows step one service at a time and stop at the ends — wrapping from the
 * oldest day round to today reads as a jump backwards in time. The label opens
 * the full list for anything further away than a tap or two.
 */
export default function ReportDatePicker({
  days,
  current,
  onPick,
  todayIso,
}: {
  /** Newest first. */
  days: string[];
  current: string;
  onPick: (date: string) => void;
  todayIso: string;
}) {
  const [open, setOpen] = useState(false);
  const older = stepDay(days, current, -1);
  const newer = stepDay(days, current, +1);

  const label = (d: string) => {
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long",
      });
    } catch { return d; }
  };

  const arrow =
    "w-11 h-11 rounded-full grid place-items-center shrink-0 transition-transform active:scale-[0.92] disabled:opacity-25";

  return (
    <>
      <div className="flex items-center gap-1 min-w-0" data-role="report-date">
        <button
          onClick={() => older && onPick(older)}
          disabled={!older}
          aria-label="Service précédent"
          data-role="report-date-prev"
          className={arrow}
          style={{ background: "var(--aur-surface)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
        >
          <CaretLeft size={15} weight="bold" style={{ color: "var(--brand-ink)" }} />
        </button>

        <button
          onClick={() => setOpen(true)}
          data-role="report-date-open"
          className="min-w-0 min-h-[44px] px-3 rounded-full inline-flex items-center gap-2"
        >
          <CalendarBlank size={15} weight="duotone" style={{ color: "var(--tab-idle)" }} className="shrink-0" />
          {/* first-letter, not capitalize: French writes "lundi 27 juillet". */}
          <span className="text-sm font-bold first-letter:uppercase truncate" style={{ color: "var(--tab-idle)" }}>
            {label(current)}
          </span>
          {current === todayIso && (
            <span className="shrink-0 text-micro font-black uppercase tracking-[0.1em] px-2 py-1 rounded-full"
              style={{ background: "var(--aur-good-soft)", color: "var(--aur-good-ink)" }}>
              Aujourd&apos;hui
            </span>
          )}
        </button>

        <button
          onClick={() => newer && onPick(newer)}
          disabled={!newer}
          aria-label="Service suivant"
          data-role="report-date-next"
          className={arrow}
          style={{ background: "var(--aur-surface)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
        >
          <CaretRight size={15} weight="bold" style={{ color: "var(--brand-ink)" }} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 screen-safe" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/35 dark:bg-black/60" />
          <div
            onClick={(e) => e.stopPropagation()}
            data-role="report-date-sheet"
            className="relative w-full max-w-[420px] max-h-[70dvh] overflow-y-auto rounded-xl p-4 flex flex-col gap-2 animate-[cardIn_.2s_cubic-bezier(.2,.9,.25,1)]"
            style={{ background: "var(--aur-bg-elev)", boxShadow: "0 24px 60px -24px rgba(20,12,0,.55), inset 0 0 0 1px var(--aur-hairline)" }}
          >
            <b className="text-base text-dark mb-1">Quel service ?</b>
            {days.map((d) => {
              const on = d === current;
              return (
                <button
                  key={d}
                  data-role="report-date-option"
                  onClick={() => { onPick(d); setOpen(false); }}
                  className="min-h-[52px] px-4 rounded-card flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
                  style={{
                    background: on ? "var(--aur-gold-soft)" : "rgba(128,128,128,.08)",
                    boxShadow: on ? "inset 0 0 0 1.5px var(--aur-gold)" : "inset 0 0 0 1px rgba(128,128,128,.12)",
                  }}
                >
                  <span className="w-5 shrink-0">
                    {on && <Check size={16} weight="bold" style={{ color: "var(--brand-ink)" }} />}
                  </span>
                  <span className="flex-1 text-sm font-bold text-dark first-letter:uppercase">{label(d)}</span>
                  {d === todayIso && (
                    <span className="text-micro font-black uppercase tracking-[0.1em]" style={{ color: "var(--aur-good-ink)" }}>
                      Aujourd&apos;hui
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
