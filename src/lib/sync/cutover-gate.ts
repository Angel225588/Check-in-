// Cutover gate: decide when sync is trustworthy enough to flip the source of
// truth. Pure function over a ring buffer of divergence snapshots. NEVER cuts
// over automatically — it only returns GO/HOLD; the actual flip is Angel's call.
export interface DivergenceSnapshot {
  ts: number; // ms
  count: number; // divergence count at that time
  outboxLen: number; // pending mutations at that time
}

export interface GateDecision {
  decision: "GO" | "HOLD";
  reason: string;
  worstCount: number;
  drainedAtLeastOnce: boolean;
}

const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;

/**
 * GO only if ALL hold:
 *  (a) we have ≥48h of history (a snapshot older than now-window),
 *  (b) every in-window snapshot has count === 0,
 *  (c) at least one in-window snapshot had outboxLen === 0 (queue truly drained,
 *      so we never bless a window that was only "0 divergence" because nothing synced).
 */
export function evaluateCutoverGate(
  snapshots: DivergenceSnapshot[],
  now: number,
  windowMs: number = FORTY_EIGHT_H
): GateDecision {
  const inWindow = snapshots.filter((s) => s.ts >= now - windowMs);
  const hasHistory = snapshots.some((s) => s.ts <= now - windowMs);
  const worstCount = inWindow.reduce((m, s) => Math.max(m, s.count), 0);
  const drainedAtLeastOnce = inWindow.some((s) => s.outboxLen === 0);

  if (!hasHistory) {
    return { decision: "HOLD", reason: "less than 48h of divergence history", worstCount, drainedAtLeastOnce };
  }
  if (inWindow.length === 0) {
    return { decision: "HOLD", reason: "no snapshots in the window", worstCount, drainedAtLeastOnce };
  }
  if (worstCount > 0) {
    return { decision: "HOLD", reason: `divergence seen in window (worst=${worstCount})`, worstCount, drainedAtLeastOnce };
  }
  if (!drainedAtLeastOnce) {
    return { decision: "HOLD", reason: "outbox never observed drained in window", worstCount, drainedAtLeastOnce };
  }
  return { decision: "GO", reason: "48h all-zero divergence with a drained outbox", worstCount, drainedAtLeastOnce };
}
