/**
 * Room event mapper.
 *
 * Aggregates all events that touch a given room from the morning brief
 * (special events, ambassadors, top VIPs, complaints) so any UI showing
 * a client can surface the relevant icons and reasons in one place.
 *
 * Source of truth: the room number. Each PDF (breakfast list, VIP list,
 * morning brief) contributes its layer; the consumer picks them up here.
 */

import { MorningBrief, getMorningBrief } from "./morning-brief";

export type RoomEventType =
  | "anniversaire"
  | "honeymoon"
  | "anniversary-stay"
  | "ambassador"
  | "top-vip"
  | "complaint"
  | "other";

export interface RoomEvent {
  type: RoomEventType;
  reason?: string;
  status?: "in_house" | "arriving";
  /** Phosphor icon name in lucide / phosphor convention. */
  iconName: string;
  /** Tailwind colour class for the icon. */
  colorClass: string;
  /** Tailwind background class for the badge wrapper. */
  bgClass: string;
}

const TYPE_ICON: Record<RoomEventType, { iconName: string; colorClass: string; bgClass: string }> = {
  anniversaire: {
    iconName: "Cake",
    colorClass: "text-amber-500 dark:text-amber-400",
    bgClass: "bg-amber-500/10",
  },
  honeymoon: {
    iconName: "Heart",
    colorClass: "text-pink-500 dark:text-pink-400",
    bgClass: "bg-pink-500/10",
  },
  "anniversary-stay": {
    iconName: "Sparkle",
    colorClass: "text-purple-500 dark:text-purple-400",
    bgClass: "bg-purple-500/10",
  },
  ambassador: {
    iconName: "Star",
    colorClass: "text-brand",
    bgClass: "bg-brand/10",
  },
  "top-vip": {
    iconName: "Crown",
    colorClass: "text-brand",
    bgClass: "bg-gradient-to-r from-brand/15 to-brand-light/15",
  },
  complaint: {
    iconName: "WarningCircle",
    colorClass: "text-error",
    bgClass: "bg-error/10",
  },
  other: {
    iconName: "Info",
    colorClass: "text-muted",
    bgClass: "bg-black/[0.04] dark:bg-white/[0.06]",
  },
};

function styleFor(type: RoomEventType): { iconName: string; colorClass: string; bgClass: string } {
  return TYPE_ICON[type] ?? TYPE_ICON.other;
}

/**
 * Normalize a room number for comparison.
 * Handles OCR variants like "#707", " 707", "707 " all matching "707".
 */
function normRoom(s: string): string {
  return (s || "").trim().replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/**
 * Returns every event that touches the given room number, sorted by
 * priority (complaint first, then top-vip, then anniversaire, etc.).
 */
export function getRoomEvents(
  roomNumber: string,
  brief?: MorningBrief | null
): RoomEvent[] {
  const b = brief ?? getMorningBrief();
  if (!b) return [];

  const target = normRoom(roomNumber);
  const events: RoomEvent[] = [];

  for (const e of b.specialEvents) {
    if (normRoom(e.roomNumber) !== target) continue;
    const style = styleFor(e.type);
    events.push({
      type: e.type,
      reason: e.reason,
      status: e.status,
      ...style,
    });
  }

  for (const a of b.ambassadors) {
    if (normRoom(a.roomNumber) !== target) continue;
    events.push({
      type: "ambassador",
      reason: a.notes ?? "Ambassador",
      status: a.status,
      ...styleFor("ambassador"),
    });
  }

  for (const v of b.topVips) {
    if (normRoom(v.roomNumber) !== target) continue;
    events.push({
      type: "top-vip",
      reason: v.notes ?? `Top VIP · ${v.vipLevel}`,
      ...styleFor("top-vip"),
    });
  }

  for (const c of b.complaints) {
    if (!c.roomNumber || normRoom(c.roomNumber) !== target) continue;
    events.push({
      type: "complaint",
      reason: c.text,
      ...styleFor("complaint"),
    });
  }

  // Sort: complaint > top-vip > anniversaire > honeymoon > others
  const order: RoomEventType[] = [
    "complaint",
    "top-vip",
    "anniversaire",
    "honeymoon",
    "anniversary-stay",
    "ambassador",
    "other",
  ];
  return events.sort(
    (a, b) => order.indexOf(a.type) - order.indexOf(b.type)
  );
}

/** True if any room in the list has at least one event. */
export function anyRoomHasEvent(
  roomNumbers: string[],
  brief?: MorningBrief | null
): boolean {
  const b = brief ?? getMorningBrief();
  if (!b) return false;
  const set = new Set(roomNumbers.map(normRoom));
  if (b.specialEvents.some((e) => set.has(normRoom(e.roomNumber)))) return true;
  if (b.ambassadors.some((e) => set.has(normRoom(e.roomNumber)))) return true;
  if (b.topVips.some((e) => set.has(normRoom(e.roomNumber)))) return true;
  if (b.complaints.some((e) => e.roomNumber && set.has(normRoom(e.roomNumber))))
    return true;
  return false;
}
