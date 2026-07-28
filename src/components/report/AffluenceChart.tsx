"use client";
import { useMemo, useState } from "react";
import { CheckInRecord } from "@/lib/types";
import { buildAffluence, hhmm, GRAINS } from "@/lib/report-v2";

/**
 * When people actually came, at the resolution you ask for.
 *
 * The granularity matters: at 30 minutes the morning looks like a gentle hill,
 * at 5 it shows the two hard spikes that decide how many covers you lay. Below
 * roughly 8px a bar is a hairline and its label would collide with the next
 * one, so fine grains keep the shape and drop the annotation.
 */
export default function AffluenceChart({ checkIns }: { checkIns: CheckInRecord[] }) {
  const [grain, setGrain] = useState(15);
  const [custom, setCustom] = useState("");
  const a = useMemo(() => buildAffluence(checkIns, grain), [checkIns, grain]);

  const wide = a.buckets.length <= 26;
  const gap = a.buckets.length > 30 ? 2 : a.buckets.length > 18 ? 3 : 5;
  const axis = [0, 0.25, 0.5, 0.75, 1].map((f) => hhmm(a.open + (a.close - a.open) * f));

  return (
    <div className="glass-liquid rounded-[20px] px-4 pt-3 pb-3" data-role="report-affluence">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className="text-[10.5px] font-black uppercase tracking-[0.14em]"
          style={{ color: "var(--tab-idle)" }}
        >
          Affluence — heure d&apos;arrivée
        </span>
        <div className="flex items-center gap-3">
          <b className="text-[12.5px] font-bold tabular-nums" style={{ color: "var(--brand-ink)" }}>
            {a.peakIndex < 0
              ? "Aucune arrivée"
              : `Pointe ${hhmm(a.buckets[a.peakIndex].start)} · ${a.peakCount} pers.`}
          </b>
          <div
            className="flex items-center gap-1 p-[3px] rounded-full"
            style={{ background: "var(--aur-hairline)" }}
            data-role="affluence-grain"
          >
            {GRAINS.map((g) => (
              <button
                key={g}
                onClick={() => { setGrain(g); setCustom(""); }}
                aria-pressed={a.grain === g}
                className="min-h-[44px] px-3 rounded-full text-[12px] font-black tabular-nums transition-colors"
                style={
                  a.grain === g
                    ? { background: "var(--aur-surface)", color: "var(--brand-ink)", boxShadow: "0 2px 8px -4px rgba(0,0,0,.45)" }
                    : { color: "var(--tab-idle)" }
                }
              >
                {g} min
              </button>
            ))}
            <input
              value={custom}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                setCustom(v);
                if (v) setGrain(Number(v));
              }}
              inputMode="numeric"
              placeholder="perso"
              aria-label="Intervalle personnalisé en minutes"
              className="w-[62px] min-h-[44px] rounded-full bg-transparent outline-none text-center text-[12px] font-black tabular-nums"
              style={{ color: "var(--brand-ink)" }}
            />
          </div>
        </div>
      </div>

      <div className="h-[128px] flex items-end mt-3.5" style={{ gap: `${gap}px` }}>
        {a.buckets.map((b, i) => {
          const h = a.peakCount ? (b.count / a.peakCount) * 100 : 0;
          const peak = i === a.peakIndex;
          return (
            <div
              key={b.start}
              data-role="affluence-bar"
              title={`${hhmm(b.start)} · ${b.count}`}
              className="flex-1 relative rounded-t-[5px] rounded-b-[2px] transition-[height] duration-300"
              style={{
                height: `${Math.max(b.count ? 3 : 0.8, h)}%`,
                background: b.count
                  ? "linear-gradient(180deg,var(--aur-gold-3),var(--aur-gold))"
                  : "var(--aur-hairline)",
                boxShadow: peak ? "0 0 0 1.5px var(--brand-ink), 0 0 20px -2px rgba(221,156,40,.55)" : undefined,
              }}
            >
              {peak && wide && b.count > 0 && (
                <span
                  className="absolute -top-[21px] left-1/2 -translate-x-1/2 text-[11.5px] font-black px-1.5 py-[1px] rounded-full whitespace-nowrap"
                  style={{ background: "var(--aur-surface)", color: "var(--brand-ink)", boxShadow: "0 0 0 1px var(--aur-hairline)" }}
                >
                  {b.count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-2 text-[11px] font-bold tabular-nums" style={{ color: "var(--tab-idle)" }}>
        {axis.map((label, i) => <span key={i}>{label}</span>)}
      </div>
    </div>
  );
}
