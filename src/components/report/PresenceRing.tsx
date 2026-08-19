"use client";
import { useEffect, useState } from "react";

/**
 * The one number the manager asks for: how much of the expected breakfast
 * actually turned up, counted in people rather than rooms.
 *
 * The figure and the arc are drawn from the same value — an earlier version had
 * a hand-typed 74% sitting next to tiles that implied 75.6%.
 */
export default function PresenceRing({
  percent,
  entered,
  expected,
}: {
  percent: number;
  entered: number;
  expected: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(id);
  }, []);

  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const offset = mounted ? CIRC * (1 - Math.min(100, Math.max(0, percent)) / 100) : CIRC;
  // -ink, not the fill token: the arc is a thin stroke read against the page,
  // and the fill greens are near-invisible on the dark theme's background.
  const tone = percent >= 70 ? "var(--aur-good-ink)" : percent >= 40 ? "var(--aur-gold)" : "var(--aur-bad-ink)";

  return (
    <div className="glass-liquid rounded-lg py-4 flex flex-col items-center" data-role="report-ring">
      <div className="relative w-[150px] h-[150px] grid place-items-center">
        <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90 w-full h-full">
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="11" style={{ stroke: "var(--aur-hairline)" }} />
          <circle
            cx="60" cy="60" r={R} fill="none" strokeWidth="11" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            style={{ stroke: tone, transition: "stroke-dashoffset .9s cubic-bezier(.25,.46,.45,.94)" }}
          />
        </svg>
        <div className="text-center">
          <div className="text-5xl font-light leading-none tracking-[-0.04em] tabular-nums" style={{ color: "var(--brand-ink)" }}>
            {percent}
            <span className="text-2xl">%</span>
          </div>
          <div className="text-xs font-black uppercase tracking-[0.1em] mt-0.5" style={{ color: "var(--tab-idle)" }}>
            présents
          </div>
        </div>
      </div>
      <div className="text-sm font-bold tabular-nums mt-1" style={{ color: "var(--tab-idle)" }}>
        {entered} / {expected} personnes
      </div>
    </div>
  );
}
