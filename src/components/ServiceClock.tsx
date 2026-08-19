"use client";
import { useState, useEffect, useMemo } from "react";
import { useTapGuard } from "@/hooks/useTapGuard";
import { CheckInRecord } from "@/lib/types";
import { buildAffluence, hhmm } from "@/lib/report-v2";

export interface ExpectedGuest {
  roomNumber: string;
  surname: string;
  at: string;
}

/** Breakfast service window, in minutes since midnight. */
const OPEN = 6 * 60 + 30;
const CLOSE = 10 * 60 + 30;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The clock face of the idle carousel: the time, and how much service is left.
 *
 * Rotation belongs to the carousel around it, and only while idle — the moment
 * a room resolves, nothing in this column is allowed to move on its own.
 */
export default function ServiceClock({ checkIns = [], onOpen }: { checkIns?: CheckInRecord[]; onOpen?: () => void }) {
  /* Same arithmetic as the report's chart, so the peak reception reads at the
     desk and the peak the manager reads at 15:00 can never disagree. Fifteen
     minutes is the grain the report opens on. */
  const pulse = useMemo(() => buildAffluence(checkIns, 15), [checkIns]);
  const tap = useTapGuard(() => onOpen?.());
  const [now, setNow] = useState<Date | null>(null);
  const [prev, setPrev] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // Rendered only after mount, so the server and client never disagree on time.
  if (!now) return <div className="flex-1 min-h-[158px]" />;

  const mins = now.getHours() * 60 + now.getMinutes();
  const digits = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const left = Math.max(0, CLOSE - mins);
  const pct = Math.max(0, Math.min(1, (mins - OPEN) / (CLOSE - OPEN)));
  const rush = mins >= 7 * 60 + 30 && mins <= 9 * 60;
  if (prev !== digits) setTimeout(() => setPrev(digits), 0);

  return (
    <div
      /* Portrait spreads the three parts over the height instead of stacking
         them at the top: the hour, the shape of the morning, then the window.
         pb-9 keeps the last line clear of the carousel's dots, which sit on
         the card rather than under it. */
      className="relative flex-1 min-h-[158px] rounded-xl px-5 py-4 portrait:pb-9 flex flex-col justify-center portrait:justify-between overflow-hidden glass-liquid"
      data-role="service-clock"
    >
      {/* The whole face opens the report. The chart here is a glance; the
          report is where you change the grain and read the day. An overlay
          rather than a wrapping button, so the card keeps its layout and the
          carousel's dots (a higher layer) still take their own taps. */}
      {onOpen && (
        <button
          type="button"
          {...tap}
          data-role="clock-open-report"
          aria-label="Ouvrir le rapport"
          className="absolute inset-0 z-[5] rounded-xl active:bg-black/[0.04] dark:active:bg-white/[0.05]"
        />
      )}
      <div className="flex items-baseline gap-3">
        <div className="flex text-[clamp(56px,7vw,104px)] font-light leading-[0.92] tracking-[-0.045em] tabular-nums">
          {digits.split("").map((d, i) => (
            <span key={i}>
              <span
                className={prev && prev[i] !== d ? "inline-block animate-[tickIn_.34s_cubic-bezier(.2,.9,.25,1)]" : "inline-block"}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {d}
              </span>
              {/* Drawn, because the ':' glyph is square-dotted in several
                  fallback faces and renders as two blocks. */}
              {i === 1 && (
                <span className="inline-flex flex-col justify-center gap-[2px] px-[2px] align-middle">
                  <i className="block w-[0.085em] h-[0.085em] rounded-full bg-current opacity-40 animate-[blink_2s_ease-in-out_infinite]" />
                  <i className="block w-[0.085em] h-[0.085em] rounded-full bg-current opacity-40 animate-[blink_2s_ease-in-out_infinite]" />
                </span>
              )}
            </span>
          ))}
        </div>
        {rush && (
          <span className="text-xs font-black uppercase tracking-[0.07em] px-2 py-1 rounded-full"
            style={{ background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)" }}>
            Pointe
          </span>
        )}
      </div>

      {/* Portrait has the height for the shape of the morning, and the morning
          is what the clock is actually about: 20:36 on its own says nothing you
          could not read off the wall. The bars are the same buckets the report
          draws, so the peak at the desk and the peak in the 15:00 briefing are
          one number. Landscape's box is 240px and has no room for it. */}
      <div className="hidden portrait:flex flex-1 min-h-0 flex-col justify-center gap-1.5 py-2" data-role="service-pulse">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.1em]"
          style={{ color: "var(--tab-idle)" }}>
          <span>Affluence</span>
          {pulse.peakIndex >= 0 && (
            <span style={{ color: "var(--brand-ink)" }}>
              Pointe {hhmm(pulse.buckets[pulse.peakIndex].start)} · {pulse.peakCount} pers.
            </span>
          )}
        </div>
        <div className="flex items-end gap-[3px] h-[clamp(38px,9vh,84px)]">
          {pulse.buckets.map((b, i) => {
            const peak = i === pulse.peakIndex;
            const h = pulse.peakCount > 0 ? Math.max(b.count > 0 ? 0.08 : 0.02, b.count / pulse.peakCount) : 0.02;
            return (
              <i
                key={b.start}
                className="flex-1 min-w-0 rounded-t-sm transition-[height] duration-300"
                style={{
                  height: `${(h * 100).toFixed(1)}%`,
                  background: peak
                    ? "linear-gradient(180deg,var(--aur-gold-3),var(--aur-gold))"
                    : b.count > 0 ? "var(--aur-gold-soft-2)" : "var(--aur-hairline)",
                }}
              />
            );
          })}
        </div>
        {/* A ruler, not two lonely end labels: "when was the rush" is a
            question about a point on a line, and a line with no marks on it
            cannot be read to the nearest half hour. Ticks on the hour, the
            peak called out in gold underneath its own bar. */}
        <div className="relative h-[26px] shrink-0" data-role="pulse-ruler">
          <div className="absolute left-0 right-0 top-0 h-px" style={{ background: "var(--aur-hairline)" }} />
          {(() => {
            const span = Math.max(1, pulse.close - pulse.open);
            const first = Math.ceil(pulse.open / 60) * 60;
            const marks = [];
            for (let m = first; m <= pulse.close; m += 60) marks.push(m);
            return marks.map((m) => {
              const pos = ((m - pulse.open) / span) * 100;
              return (
                <span key={m} className="absolute top-0 flex flex-col items-center -translate-x-1/2" style={{ left: `${pos}%` }}>
                  <i className="block w-px h-[5px]" style={{ background: "var(--aur-hairline)" }} />
                  <em className="not-italic text-micro font-bold tabular-nums leading-none mt-0.5"
                    style={{ color: "var(--tab-idle)" }}>{hhmm(m)}</em>
                </span>
              );
            });
          })()}
          {pulse.peakIndex >= 0 && (() => {
            const span = Math.max(1, pulse.close - pulse.open);
            const b = pulse.buckets[pulse.peakIndex];
            const pos = ((b.start + pulse.grain / 2 - pulse.open) / span) * 100;
            return (
              <span
                className="absolute top-[13px] -translate-x-1/2 text-micro font-black tabular-nums whitespace-nowrap"
                style={{ left: `${Math.min(92, Math.max(8, pos))}%`, color: "var(--brand-ink)" }}
                data-role="pulse-peak-mark"
              >
                ▲ {hhmm(b.start)}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Before 06:30 the "time left" figure is arithmetically true and
          practically nonsense — reception is often on the floor at 06:00 and
          would read 8h50 as time left of a service that has not started. Say
          which state the morning is actually in. */}
      <div className="mt-3 portrait:mt-0 flex justify-between text-sm font-semibold" style={{ color: "var(--tab-idle)" }}>
        <span>Service <b style={{ color: "var(--brand-ink)" }}>06:30 – 10:30</b></span>
        {mins < OPEN ? (
          <span>ouvre dans <b style={{ color: "var(--brand-ink)" }}>{Math.floor((OPEN - mins) / 60)}h{pad((OPEN - mins) % 60)}</b></span>
        ) : mins >= CLOSE ? (
          <span><b style={{ color: "var(--brand-ink)" }}>Service terminé</b></span>
        ) : (
          <span><b style={{ color: "var(--brand-ink)" }}>{Math.floor(left / 60)}h{pad(left % 60)}</b> restantes</span>
        )}
      </div>

      <div className="absolute left-0 right-0 bottom-0 h-[7px] bg-black/[0.06] dark:bg-white/[0.06]">
        <div className="h-full rounded-r-full" style={{
          width: `${(pct * 100).toFixed(1)}%`,
          background: "linear-gradient(90deg,var(--aur-gold),var(--aur-gold-3))",
          boxShadow: "0 0 16px -2px rgba(221,156,40,.8)",
        }} />
      </div>

      <style jsx>{`
        @keyframes tickIn {
          0% { opacity: .15; transform: translateY(-.14em) scale(.93) }
          60% { opacity: 1; transform: translateY(.012em) scale(1.015) }
          100% { transform: none }
        }
        @keyframes blink { 0%,100% { opacity: .42 } 50% { opacity: .16 } }
      `}</style>
    </div>
  );
}
