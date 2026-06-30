import { Client } from "./types";

/**
 * Parse Mistral OCR markdown output (one or more markdown tables) into Client[].
 * Mistral OCR returns clean pipe tables; we map columns by HEADER NAME (robust to
 * the two real report layouts — "Daily Arrival" and "R118 Package Forecast" — which
 * use different header text but the same column order). Non-table lines (titles,
 * totals, page footers) are ignored. Headers may repeat per page; rows accumulate.
 */
type Field = keyof Pick<
  Client,
  | "roomNumber" | "roomType" | "rtc" | "confirmationNumber" | "name"
  | "arrivalDate" | "departureDate" | "reservationStatus"
  | "adults" | "children" | "rateCode" | "packageCode"
>;

function classifyHeader(raw: string): Field | null {
  const s = raw.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (/pack/.test(s)) return "packageCode";
  if (/rate/.test(s)) return "rateCode";
  if (/conf/.test(s)) return "confirmationNumber";
  if (/\brtc\b/.test(s)) return "rtc";
  if (/type/.test(s)) return "roomType";          // "type" / "room type" (before "room")
  if (/room/.test(s)) return "roomNumber";        // "room" / "room no"
  if (/name/.test(s)) return "name";
  if (/arriv/.test(s)) return "arrivalDate";
  if (/depart|\bdep\b/.test(s)) return "departureDate";
  if (/status|resv/.test(s)) return "reservationStatus";
  if (/^adl|^ad\b|adult/.test(s)) return "adults";
  if (/^chl|^ch\b|child/.test(s)) return "children";
  return null;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isSeparator = (cells: string[]) =>
  cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));

function emptyClient(): Client {
  return {
    roomNumber: "", roomType: "", rtc: "", confirmationNumber: "", name: "",
    arrivalDate: "", departureDate: "", reservationStatus: "",
    adults: 0, children: 0, rateCode: "", packageCode: "",
  };
}

/**
 * Classify a Mistral OCR document from its markdown: a "VIP GUEST LIST" (has a
 * "VIP Level" column) vs the breakfast/arrival list (does not). Reliable because the
 * two report layouts are distinct — only the VIP report carries VIP-level columns.
 */
export function detectDocType(md: string): "clients" | "vip" {
  return /vip\s*level/i.test(md) || /vip guest list|guest inhouse vip/i.test(md)
    ? "vip"
    : "clients";
}

type VipField = "roomNumber" | "name" | "vipLevel" | "vipNotes";

function classifyVipHeader(raw: string): VipField | null {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (/vip|level/.test(s)) return "vipLevel";
  if (/note|special|instruct|prefer/.test(s)) return "vipNotes";
  if (/guest|name/.test(s)) return "name";
  if (/room/.test(s)) return "roomNumber";
  return null;
}

/**
 * Parse a Mistral "VIP GUEST LIST" markdown table into VIP-shaped Client rows
 * (roomNumber, name, vipLevel, vipNotes). Tagged `list_only` so an unmatched VIP
 * lands in Hors-liste; mergeVipIntoClients maps matched ones onto their room.
 */
export function parseMistralVip(md: string): Client[] {
  const out: Client[] = [];
  let map: (VipField | null)[] | null = null;

  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;

    const isHeader =
      cells.some((c) => /vip|level/i.test(c)) && cells.some((c) => /name|guest/i.test(c));
    if (isHeader) { map = cells.map(classifyVipHeader); continue; }
    if (!map) continue;

    const e = emptyClient();
    e.isVip = true;
    e.vipSource = "list_only";
    map.forEach((field, i) => {
      if (field) e[field] = (cells[i] ?? "").trim();
    });
    if (e.roomNumber && e.name) out.push(e);
  }
  return out;
}

export function parseMistralMarkdown(md: string): Client[] {
  const out: Client[] = [];
  let map: (Field | null)[] | null = null;

  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) continue; // skip titles, totals, footers
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;

    const isHeader =
      cells.some((c) => /\bname\b/i.test(c)) && cells.some((c) => /room/i.test(c));
    if (isHeader) { map = cells.map(classifyHeader); continue; }
    if (!map) continue; // data before any recognizable header

    const c = emptyClient();
    map.forEach((field, i) => {
      if (!field) return;
      const v = cells[i] ?? "";
      if (field === "adults" || field === "children") c[field] = parseInt(v, 10) || 0;
      else c[field] = v;
    });
    if (c.roomNumber && c.name) out.push(c);
  }
  return out;
}
