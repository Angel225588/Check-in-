import { Client } from "./types";

/**
 * Parse Mistral OCR markdown output (one or more markdown tables) into Client[].
 * Mistral OCR returns clean pipe tables; we map columns by HEADER NAME (robust to
 * the two real report layouts — "Daily Arrival" and "R118 Package Forecast" — which
 * use different header text but the same column order). Non-table lines (titles,
 * totals, page footers) are ignored. Headers may repeat per page; rows accumulate.
 */
/**
 * "discard" is a real column that is deliberately not stored.
 *
 * Confirmation number, RTC, room type and reservation status were removed for
 * data minimisation (docs/GDPR-AUDIT.md section 1.2), but their HEADERS still
 * have to be recognised. A "Room Type" column left unclassified falls through
 * to the /room/ test and is read as the room number, replacing the real room
 * with a room-type code. Recognising the column and dropping its value is what
 * keeps the rest of the row aligned.
 */
type Field =
  | keyof Pick<
      Client,
      | "roomNumber" | "name" | "arrivalDate" | "departureDate"
      | "adults" | "children" | "rateCode" | "packageCode"
    >
  | "discard";

function classifyHeader(raw: string): Field | null {
  const s = raw.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (/pack/.test(s)) return "packageCode";
  if (/rate/.test(s)) return "rateCode";
  if (/conf/.test(s)) return "discard";           // confirmation number — not stored
  if (/\brtc\b/.test(s)) return "discard";        // RTC — not stored
  if (/type/.test(s)) return "discard";           // "type" / "room type" (before "room")
  if (/room/.test(s)) return "roomNumber";        // "room" / "room no"
  if (/name/.test(s)) return "name";
  if (/arriv/.test(s)) return "arrivalDate";
  if (/depart|\bdep\b/.test(s)) return "departureDate";
  if (/status|resv/.test(s)) return "discard";     // reservation status — not stored
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

/** Room numbers are 2-5 digits, optionally suffixed by a letter (e.g. "104A"). */
function isRoomNumber(v: string): boolean {
  return /^\d{2,5}[A-Za-z]?$/.test(v.trim());
}

function emptyClient(): Client {
  return {
    roomNumber: "", name: "",
    arrivalDate: "", departureDate: "",
    adults: 0, children: 0, rateCode: "", packageCode: "",
  };
}

/** The doc types reception sends: the breakfast roster, the VIP list, the morning
 *  brief (special events), and the no-post (room-charge-not-allowed) list. */
export type DocType = "clients" | "vip" | "brief" | "nopost";

/**
 * Classify a Mistral OCR document from its markdown. The four report layouts are
 * distinct, so keyword/column detection is reliable. Order matters: VIP and brief
 * are checked before the no-post keywords (a VIP note can mention "points exchange").
 * Anything unrecognised falls back to the breakfast/arrival roster ("clients").
 */

/**
 * True when some markdown table header row carries BOTH a VIP column and a
 * room column. Header-only (never row data), so a roster that merely mentions
 * "VIP" inside a guest note is not misclassified.
 */
function hasVipTableHeader(md: string): boolean {
  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;
    const hasVip = cells.some((c) => /\bvip\b/i.test(c));
    const hasRoom = cells.some((c) => /\broom\b|chambre/i.test(c));
    const hasName = cells.some((c) => /\bname\b|guest|nom/i.test(c));
    if (hasVip && hasRoom && hasName) return true;
  }
  return false;
}

export function detectDocType(md: string): DocType {
  const s = md.toLowerCase();
  if (/vip\s*level/.test(s) || /vip guest list|guest in\s?house vip/.test(s)) return "vip";
  // Structural fallback: a table whose header row has a VIP column alongside a
  // room column IS a VIP list, whatever the report is titled. Matching the
  // printed title alone was too brittle — real Marriott exports vary the
  // wording ("Guest In House VIP", "VIP In House"), and a missed
  // classification silently parses VIPs as ordinary guests (0 VIPs tagged).
  if (hasVipTableHeader(md)) return "vip";
  if (/briefing du matin|[ée]v[ée]nements? sp[ée]ciaux|anniversaire|honeymoon|ambassad/.test(s))
    return "brief";
  if (/no.?post|not allowed.*post|room.?post|ne pas facturer|cannot.*charge.*room/.test(s))
    return "nopost";
  return "clients";
}

type VipField =
  | "roomNumber" | "name" | "vipLevel" | "vipNotes"
  | "arrivalDate" | "departureDate";

/**
 * Order matters, and two of these lines are load-bearing:
 *
 *  - the date columns are tested BEFORE `name`/`room`, because the real export
 *    heads them "Arr. Date" and "Dep. Date" and a header cell can carry more
 *    than one word;
 *  - `type` is tested before `room`, or "Room Type" classifies as the room
 *    number and EXST arrives where 451 should be.
 *
 * The dots are stripped first so "Arr." and "Dep." reduce to bare words —
 * matching on /arriv/ (as the roster's `classifyHeader` does) would miss the
 * VIP export entirely, since it abbreviates.
 */
function classifyVipHeader(raw: string): VipField | null {
  const s = raw.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (/vip|level/.test(s)) return "vipLevel";
  if (/note|special|instruct|prefer/.test(s)) return "vipNotes";
  if (/\barr\b|arriv/.test(s)) return "arrivalDate";
  if (/\bdep\b|depart/.test(s)) return "departureDate";
  if (/type/.test(s)) return null;    // room type — recognised, not stored
  if (/guest|name/.test(s)) return "name";
  if (/room/.test(s)) return "roomNumber";
  return null;
}

/**
 * A printed date on these reports: dd/mm/yy, occasionally dd/mm/yyyy.
 *
 * The year is deliberately not `\d{2,4}`. Written that way it is greedy, and
 * on a fused pair — "17/08/2621/08/26" — it reads the year as "2621" and eats
 * the next date's day, yielding one wrong date instead of two right ones.
 * The optional third and fourth year digits are therefore taken only when a
 * "/" does NOT follow, which is exactly when they are a real four-digit year
 * rather than the start of the next date.
 */
const DATE_RE = /\d{2}\/\d{2}\/\d{2}(?:\d{2}(?!\/))?/g;

/**
 * In the PDF's text layer the arrival, departure and room-type columns touch:
 * room 451 prints as one token, "17/08/2621/08/26EXST". Mistral reads the
 * rendered page and usually separates them — but a parser that depends on the
 * OCR being tidy is one bad page away from blank dates on the tablet again.
 *
 * Returns the dates found in the cell, plus whatever text is left once they
 * are removed (the room type, in the fused case).
 */
function unfuse(cell: string): { dates: string[]; rest: string } {
  const text = (cell ?? "").trim();
  const dates = text.match(DATE_RE) ?? [];
  const rest = text.replace(DATE_RE, " ").replace(/\s+/g, " ").trim();
  return { dates, rest };
}

/**
 * Parse a Mistral "VIP GUEST LIST" markdown table into VIP-shaped Client rows
 * (roomNumber, name, vipLevel, vipNotes). Tagged `list_only` so an unmatched VIP
 * lands in Hors-liste; mergeVipIntoClients maps matched ones onto their room.
 */
export function parseMistralVip(md: string): Client[] {
  const out: Client[] = [];
  let map: (VipField | null)[] | null = null;
  let roomCol = -1;
  let nameCol = -1;
  let levelCol = -1;

  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;

    // Header. The real Marriott "Guest InHouse VIP" export splits its header
    // over TWO rows — "Room No. | Name | Company | …" then "| VIP | Block Code
    // | Source | …" — so requiring VIP and Name in the SAME row matched
    // nothing and every guest was skipped (the "0 VIP" bug). A room + name
    // header is enough; the VIP column is picked up from either row.
    const hasName = cells.some((c) => /\bname\b|guest|nom/i.test(c));
    const hasRoom = cells.some((c) => /\broom\b|chambre/i.test(c));
    if (hasName && hasRoom) {
      map = cells.map(classifyVipHeader);
      roomCol = cells.findIndex((c) => /\broom\b|chambre/i.test(c));
      nameCol = cells.findIndex((c) => /\bname\b|guest|nom/i.test(c));
      levelCol = cells.findIndex((c) => /vip|level/i.test(c));
      continue;
    }
    // Continuation header row ("| VIP | Block Code | Source |"): no room
    // number, but it tells us which column carries the VIP code.
    if (map && !cells[roomCol]?.trim() && cells.some((c) => /\bvip\b/i.test(c))) {
      const idx = cells.findIndex((c) => /\bvip\b/i.test(c));
      if (idx >= 0 && levelCol < 0) levelCol = idx;
      continue;
    }
    if (!map) continue;

    const first = (cells[0] ?? "").trim();
    let roomRaw = (cells[roomCol] ?? "").trim();

    // "Specials:" / "Preferences:" rows belong to the guest above them — they
    // carry the dietary and room notes reception acts on at breakfast. The
    // text sits in the FIRST column (where a room number would be), so match
    // on the label rather than on the column being empty.
    if (/^(specials?|preferences?|préférences?)\s*:/i.test(first)) {
      const prev = out[out.length - 1];
      if (prev) prev.vipNotes = [prev.vipNotes, first].filter(Boolean).join(" · ");
      continue;
    }
    if (!isRoomNumber(roomRaw)) {
      // Not a room number — e.g. the column resolved to "Room Type" (JSHF), or
      // this is a spill-over line. Recover by taking the first cell that does
      // look like one, else skip the row rather than inventing a room.
      const alt = cells.findIndex((c) => isRoomNumber(c));
      if (alt < 0) continue;
      roomRaw = cells[alt].trim();
    }

    let name = (cells[nameCol] ?? "").trim();
    let vipLevel = levelCol >= 0 ? (cells[levelCol] ?? "").trim() : "";

    // In the real export the level is glued onto the name ("CARTER,JOHN,Mr P6"),
    // because the printed layout puts it on a second line inside the cell.
    // Pull it off so the name stays exactly as printed and the level is usable.
    const glued = name.match(/^(.*?)[\s,]+([A-Z]\d)$/);
    if (glued) {
      name = glued[1].trim();
      if (!vipLevel || !/^[A-Z]\d$/.test(vipLevel)) vipLevel = glued[2];
    }
    if (vipLevel && !/^[A-Z]\d$/i.test(vipLevel)) vipLevel = "";

    // The printed VIP code moves around: glued to the name on some rows, in a
    // trailing column on others (the OCR column alignment follows the page).
    // As a last resort take the one cell that IS exactly a VIP code — letter +
    // digit is unambiguous here (rate codes are longer, room types are alpha).
    if (!vipLevel) {
      const code = cells.find((c, i) => i !== roomCol && i !== nameCol && /^[A-Z]\d$/.test(c.trim()));
      if (code) vipLevel = code.trim();
    }

    if (!name) continue;

    const e = emptyClient();
    e.isVip = true;
    e.vipSource = "list_only";
    e.roomNumber = roomRaw;
    e.name = name;
    e.vipLevel = vipLevel;

    // Dates are collected rather than copied cell-to-field: one cell can carry
    // both of them glued together, and a straight copy would lose the second.
    const dates: string[] = [];

    map.forEach((field, i) => {
      if (!field || i === roomCol || i === nameCol || i === levelCol) return;
      // Never let a later column re-assign an identity field we already
      // resolved: "Room Type" classifies as roomNumber and would replace the
      // real room with a room-type code.
      if (field === "roomNumber" || field === "name" || field === "vipLevel") return;
      const v = (cells[i] ?? "").trim();
      if (!v) return;
      if (field === "arrivalDate" || field === "departureDate") {
        const { dates: found } = unfuse(v);
        dates.push(...found);
        // The trailing room-type code in "17/08/2621/08/26EXST" is discarded
        // with the rest of the room-type field.
        return;
      }
      e[field] = v;
    });

    // Fallback for a page where the header named no date column, or named one
    // and the OCR put both dates inside it: take every printed date left in
    // the row, in the order the report printed them. No de-duplication — a
    // same-day arrival and departure are two facts, not one repeated.
    if (dates.length < 2) {
      const scanned: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        if (i === roomCol || i === nameCol || i === levelCol) continue;
        const { dates: found } = unfuse(cells[i] ?? "");
        scanned.push(...found);
      }
      if (scanned.length > dates.length) dates.splice(0, dates.length, ...scanned);
    }

    if (dates[0]) e.arrivalDate = dates[0];
    if (dates[1]) e.departureDate = dates[1];

    out.push(e);
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
      if (field === "discard") return;
      if (field === "adults" || field === "children") c[field] = parseInt(v, 10) || 0;
      else c[field] = v;
    });
    // A room number must LOOK like one. Real reports end with a summary table
    // ("Date | BKF INC", "Totals | 34") whose rows would otherwise be counted
    // as guests — four phantom rooms on the Courtyard R118 export, which
    // silently inflates the covers count reception plans against.
    if (isRoomNumber(c.roomNumber) && c.name) out.push(c);
  }
  return out;
}

/** A room+package row with no guest name (e.g. "Package Forecast" reports). */
export interface MistralPackageRow {
  roomNumber: string;
  packageCode: string;
}

/**
 * Rows that carry a room number and a package code but NO guest name.
 *
 * These are not guests — they are the package-forecast overlay that fills in a
 * missing packageCode for a room. parseMistralMarkdown deliberately drops them
 * (it requires a name), so they are collected separately here and merged
 * downstream by overlayPackageForecast.
 */
export function parseMistralPackageRows(md: string): MistralPackageRow[] {
  const out: MistralPackageRow[] = [];
  let map: (Field | null)[] | null = null;

  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;

    const isHeader =
      cells.some((c) => /\bname\b/i.test(c)) && cells.some((c) => /room/i.test(c));
    if (isHeader) { map = cells.map(classifyHeader); continue; }
    if (!map) continue;

    let roomNumber = "", packageCode = "", name = "";
    map.forEach((field, i) => {
      const v = (cells[i] ?? "").trim();
      if (field === "roomNumber") roomNumber = v;
      else if (field === "packageCode") packageCode = v;
      else if (field === "name") name = v;
    });

    if (roomNumber && packageCode && !name) out.push({ roomNumber, packageCode });
  }
  return out;
}

/**
 * The authoritative per-day breakfast totals printed on the LAST page of the
 * R118 Package Forecast ("Totals per Day per Package Code").
 *
 * This is the hotel's own number, produced by its PMS — not something we
 * derive. It is the truth reception is judged against, so it is parsed as
 * first-class data rather than discarded with the rest of the summary block.
 */
export interface PackageTotalsDay {
  /** As printed, e.g. "08/08/26". */
  date: string;
  /** Day label if present, e.g. "Sat". */
  day: string;
  /** Package code → covers, e.g. { "BKF COMP": 20, "BKF GRP": 61 }. */
  counts: Record<string, number>;
  /** The row's own Total column. */
  total: number;
}

const TOTALS_CODE = /^(BKF|UPS)[A-Z0-9 ]*$/i;

/**
 * Parse the "Totals per Day per Package Code" table. Returns one entry per
 * printed day; the grand "Totals" row is excluded (it spans the whole report
 * period, not a service).
 */
export function parseMistralPackageTotals(md: string): PackageTotalsDay[] {
  const out: PackageTotalsDay[] = [];
  let codeCols: { index: number; code: string }[] | null = null;
  let dateCol = -1;
  let totalCol = -1;

  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;

    const codes = cells
      .map((c, i) => ({ index: i, code: c.trim().toUpperCase() }))
      .filter((c) => TOTALS_CODE.test(c.code));
    const hasDate = cells.some((c) => /^date$/i.test(c.trim()));

    if (hasDate && codes.length > 0) {
      codeCols = codes;
      dateCol = cells.findIndex((c) => /^date$/i.test(c.trim()));
      totalCol = cells.findIndex((c) => /^total$/i.test(c.trim()));
      continue;
    }
    if (!codeCols) continue;

    const date = (cells[dateCol] ?? "").trim();
    // Only real service days; the grand "Totals" row covers the whole period.
    if (!/^\d{2}\/\d{2}\/\d{2,4}$/.test(date)) continue;

    const counts: Record<string, number> = {};
    for (const { index, code } of codeCols) {
      const n = Number.parseInt((cells[index] ?? "").trim(), 10);
      if (Number.isFinite(n)) counts[code] = n;
    }
    const total = Number.parseInt((cells[totalCol] ?? "").trim(), 10);
    // The day label sits between the date and the first code column.
    const day = dateCol + 1 < (codeCols[0]?.index ?? 0) ? (cells[dateCol + 1] ?? "").trim() : "";

    out.push({ date, day, counts, total: Number.isFinite(total) ? total : 0 });
  }
  return out;
}
