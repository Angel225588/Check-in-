/**
 * Guest profile system — tracks returning guests across sessions.
 * Stored in localStorage, will migrate to Supabase later.
 */

export interface GuestProfile {
  id: string; // normalized name key
  name: string; // display name (last seen)
  visitCount: number;
  firstVisit: string; // ISO date
  lastVisit: string; // ISO date
  birthday?: string; // MM-DD format
  notes?: string;
  roomHistory: string[]; // last 5 rooms
}

const GUESTS_KEY = "guest_profiles";

function normalizeGuestKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

export function getGuestProfiles(): Map<string, GuestProfile> {
  if (typeof window === "undefined") return new Map();
  const raw = localStorage.getItem(GUESTS_KEY);
  if (!raw) return new Map();
  try {
    const arr = JSON.parse(raw) as GuestProfile[];
    const map = new Map<string, GuestProfile>();
    for (const g of arr) map.set(g.id, g);
    return map;
  } catch {
    return new Map();
  }
}

function saveGuestProfiles(profiles: Map<string, GuestProfile>): void {
  try {
    localStorage.setItem(GUESTS_KEY, JSON.stringify(Array.from(profiles.values())));
  } catch {
    // QuotaExceededError
  }
}

/**
 * Record a guest visit. Creates profile if new, increments if returning.
 */
export function recordGuestVisit(name: string, roomNumber: string): GuestProfile {
  const profiles = getGuestProfiles();
  const key = normalizeGuestKey(name);
  const today = new Date().toISOString().split("T")[0];

  const existing = profiles.get(key);
  if (existing) {
    // Don't double-count same day
    if (existing.lastVisit !== today) {
      existing.visitCount++;
      existing.lastVisit = today;
    }
    existing.name = name; // update display name
    if (!existing.roomHistory.includes(roomNumber)) {
      existing.roomHistory = [roomNumber, ...existing.roomHistory].slice(0, 5);
    }
    profiles.set(key, existing);
    saveGuestProfiles(profiles);
    return existing;
  }

  const profile: GuestProfile = {
    id: key,
    name,
    visitCount: 1,
    firstVisit: today,
    lastVisit: today,
    roomHistory: [roomNumber],
  };
  profiles.set(key, profile);
  saveGuestProfiles(profiles);
  return profile;
}

/**
 * Look up a guest by name.
 */
export function findGuest(name: string): GuestProfile | null {
  const profiles = getGuestProfiles();
  return profiles.get(normalizeGuestKey(name)) || null;
}

/**
 * Search guests by partial name match.
 */
export function searchGuests(query: string): GuestProfile[] {
  if (!query || query.length < 2) return [];
  const profiles = getGuestProfiles();
  const q = query.toUpperCase();
  return Array.from(profiles.values())
    .filter((g) => g.name.toUpperCase().includes(q))
    .sort((a, b) => b.visitCount - a.visitCount);
}

/**
 * Update guest birthday or notes.
 */
export function updateGuestProfile(
  name: string,
  updates: { birthday?: string; notes?: string }
): void {
  const profiles = getGuestProfiles();
  const key = normalizeGuestKey(name);
  const existing = profiles.get(key);
  if (!existing) return;
  if (updates.birthday !== undefined) existing.birthday = updates.birthday;
  if (updates.notes !== undefined) existing.notes = updates.notes;
  profiles.set(key, existing);
  saveGuestProfiles(profiles);
}

/**
 * Get badge type based on visit count.
 */
export type GuestBadge = "new" | "returning" | "frequent" | "loyal";

export function getGuestBadge(visitCount: number): GuestBadge {
  if (visitCount <= 1) return "new";
  if (visitCount <= 3) return "returning";
  if (visitCount <= 10) return "frequent";
  return "loyal";
}

export const BADGE_CONFIG: Record<GuestBadge, { label: string; labelFr: string; color: string; bg: string }> = {
  new: { label: "New", labelFr: "Nouveau", color: "text-blue-700", bg: "bg-blue-500/10" },
  returning: { label: "Returning", labelFr: "Retour", color: "text-teal", bg: "bg-teal/10" },
  frequent: { label: "Frequent", labelFr: "Fréquent", color: "text-brand", bg: "bg-brand/10" },
  loyal: { label: "Loyal", labelFr: "Fidèle", color: "text-purple-700", bg: "bg-purple-500/10" },
};

/**
 * Record all guests from a session (call when session starts).
 */
export function recordSessionGuests(clients: { name: string; roomNumber: string }[]): void {
  for (const c of clients) {
    if (c.name && c.name !== "Unknown") {
      recordGuestVisit(c.name, c.roomNumber);
    }
  }
}
