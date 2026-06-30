// Area = which "door" the user came through. The breakfast use case needs two
// PII areas that share the roster (Réception uploads, Restaurant serves → same
// encryption key → same service code) plus a non-PII Direction door (dashboard
// on clear operational counts). The door decides the screen; the code authenticates.

export type Area = "reception" | "restaurant" | "direction";

const AREA_KEY = "imk_area";

export const AREA_HOME: Record<Area, string> = {
  reception: "/upload",
  restaurant: "/restaurant",
  direction: "/dashboard",
};

export const AREA_LABEL: Record<Area, string> = {
  reception: "Réception",
  restaurant: "Restaurant",
  direction: "Direction",
};

export function storeArea(area: Area): void {
  if (typeof window !== "undefined") localStorage.setItem(AREA_KEY, area);
}

export function storedArea(): Area | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(AREA_KEY);
  return v === "reception" || v === "restaurant" || v === "direction" ? v : null;
}

export function clearArea(): void {
  if (typeof window !== "undefined") localStorage.removeItem(AREA_KEY);
}
