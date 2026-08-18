/**
 * Generates mock Courtyard reports for load-testing the OCR pipeline.
 *
 * The layouts deliberately mirror the hotel's real exports — the same column
 * headers, the same two-row VIP header, the VIP code glued to the name on some
 * rows and in a trailing column on others, the Specials/Preferences
 * continuation lines, and the trailing summary table. Those quirks are what
 * broke the parser; a mock that is "clean" would test nothing.
 *
 * Guest names are invented. No real guest data is used or stored.
 *
 *   node scripts/generate-mock-reports.mjs [outDir]
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const OUT = process.argv[2] || "mock-reports";

// ── name pool: same spread of origins as the real Paris property ──
const SURNAMES = [
  "ALVAREZ", "BENOIT", "CARTER", "Dupont", "Esposito", "FONTAINE", "GARCIA", "HOFFMANN",
  "Ip", "JANSSEN", "KOWALSKI", "LEROY", "MARCHETTI", "NGUYEN", "OKONKWO", "PETIT",
  "QUINTANA", "ROSSI", "SCHNEIDER", "TANAKA", "URBANO", "VOGEL", "WEBER", "XU",
  "YAMAMOTO", "ZHANG", "Chen", "Heung", "Tam", "Sun", "Kim", "Park", "Silva", "Moreau",
  "Lefebvre", "Bernard", "Muller", "Costa", "Ferreira", "Andersson", "Novak", "Haddad",
  "Rahman", "Singh", "Kumar", "Osei", "Mensah", "Bakker", "Larsen", "Virtanen",
];
const GIVEN = [
  "MARIA", "CLAIRE", "JOHN", "Luc", "Mia", "ANNE", "CARLOS", "HANS", "Suk Yee", "PIETER",
  "ANNA", "ANTOINE", "GIULIA", "MINH", "CHIDI", "MARIE-CLAIRE", "SOFIA", "MARCO", "LUKAS",
  "YUKI", "PAOLO", "GRETA", "KLAUS", "WEI LING", "HARUKA", "ZHECHEN", "Yijun", "Kwok Wai",
  "Chun Ping", "Hui", "SEON-JU", "MIN JUN", "ANA BEATRIZ", "CAMILLE", "JULIEN", "NICOLAS",
  "ELENA", "TIAGO", "INES", "ERIK", "PETRA", "OMAR", "FATIMA", "RAVI", "PRIYA", "KWAME",
  "AKOSUA", "SANNE", "METTE", "AINO",
];
const ROOM_TYPES = ["JSST", "JSHF", "STKG", "DLXK", "EXST", "EXEF", "PRMK", "PRTW", "STHT", "STKD"];
const RATE_CODES = ["19LTSA", "25MRYA", "PV2G", "PV2A", "12SWAZ", "28MARH", "24MS1E", "17TEQ6", "ESPC", "25MRYC"];
const PACKAGES = [
  "BKF INC", "BKF GRP", "BKF COMP", "CITY TAX,BKF INC", "CITY TAX,GARAGE,BKF COMP",
  "CITY TAX,BKF GRP", "CITY TAX", "BKF INC,GARAGE",
];
const STATUS = ["CKIN", "DKIN", "DUOT", "RESV"];
const VIP_CODES = ["X4", "X5", "P3", "P4", "P5", "P6"];
const SPECIALS = [
  "Res Qual For Free WiFi (W7),Mobile Check-In (X2)",
  "Do Not Display Rm & Tax (D7),Do Not Display Folio (D9),Non-Commissionable Rate (N4)",
  "Foam Pillows (F2),Extra Towels (E6),Late Check-Out (L3),Member Rate (M5)",
  "Res Qual For Free WiFi (W7),Rooms Side by Side (A1)",
];
const PREFERENCES = [
  "High Floor Room (H1),Non Smoking Room (N3)",
  "High Floor Room (H1),Connecting Door (C1)",
  "Non Smoking Room (N3)",
];

// Deterministic PRNG so regenerating gives the same files (diffable, re-runnable).
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pad2 = (n) => String(n).padStart(2, "0");

function makeGuests(count) {
  const rows = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    // Rooms spread over floors 1-7 like the real property.
    let room;
    do {
      room = String(Math.floor(rnd() * 7 + 1) * 100 + Math.floor(rnd() * 70));
    } while (used.has(room) && used.size < 480);
    // ~4% shared rooms (same room, second guest) — the app keeps these separate.
    if (rnd() > 0.96 && used.size) room = [...used][Math.floor(rnd() * used.size)];
    else used.add(room);

    const adults = rnd() > 0.75 ? 2 : rnd() > 0.95 ? 3 : 1;
    rows.push({
      room,
      type: pick(ROOM_TYPES),
      rtc: rnd() > 0.6 ? pick(ROOM_TYPES) : "",
      conf: String(185000000 + Math.floor(rnd() * 900000)),
      name: `${pick(SURNAMES)}, ${pick(GIVEN)}`,
      arr: `${pad2(Math.floor(rnd() * 28) + 1)}/08/26`,
      dep: `${pad2(Math.floor(rnd() * 28) + 1)}/08/26`,
      status: pick(STATUS),
      adl: adults,
      chl: rnd() > 0.85 ? Math.floor(rnd() * 2) + 1 : 0,
      rate: pick(RATE_CODES),
      pkg: pick(PACKAGES),
    });
  }
  return rows;
}

/** R118 Package Forecast — Detailed. Mirrors the real column set. */
async function buildRoster(guests, title) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595; // A4 landscape
  const COLS = [
    ["Room No.", 30, 46], ["Room Type", 78, 52], ["RTC", 132, 34], ["Conf. No.", 168, 62],
    ["Name", 234, 168], ["Arrival Date", 404, 62], ["Departure Date", 468, 72],
    ["Resv. Status", 542, 56], ["Adl.", 600, 26], ["Chl.", 628, 26],
    ["Rate Code", 656, 56], ["Package Codes", 714, 110],
  ];
  const ROWS_PER_PAGE = 22;
  const pageCount = Math.ceil(guests.length / ROWS_PER_PAGE);

  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage([W, H]);
    let y = H - 34;
    page.drawText("COURTYARD BY MARRIOTT PARIS PORTE DE VERSAILLES", { x: 30, y, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
    page.drawText(`${title}`, { x: 30, y, size: 9, font: bold });
    page.drawText(`Page ${p + 1}/${pageCount}`, { x: W - 90, y, size: 8, font });
    y -= 12;
    page.drawText(`Date: 08/08/26    Property: CYPAR    Total Rooms: ${guests.length}`, { x: 30, y, size: 8, font });
    y -= 18;

    for (const [label, x, w] of COLS) page.drawText(label, { x, y, size: 7.5, font: bold });
    y -= 4;
    page.drawLine({ start: { x: 28, y }, end: { x: W - 28, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    y -= 12;

    for (const g of guests.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE)) {
      const cells = [g.room, g.type, g.rtc, g.conf, g.name, g.arr, g.dep, g.status, String(g.adl), String(g.chl), g.rate, g.pkg];
      cells.forEach((c, i) => page.drawText(String(c).slice(0, 34), { x: COLS[i][1], y, size: 7.5, font }));
      y -= 13;
    }
  }

  // Trailing summary table — the one that used to be counted as guests.
  const last = doc.getPage(doc.getPageCount() - 1);
  last.drawText("Summary by date", { x: 30, y: 60, size: 8, font: bold });
  last.drawText("Date            BKF INC", { x: 30, y: 48, size: 7.5, font });
  last.drawText("07/08/26        15", { x: 30, y: 38, size: 7.5, font });
  last.drawText("08/08/26        19", { x: 30, y: 28, size: 7.5, font });
  last.drawText("Totals          34", { x: 30, y: 18, size: 7.5, font: bold });
  return doc.save();
}

/** Guest InHouse VIP — reproduces the two-row header and continuation lines. */
async function buildVip(count) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595;
  const guests = makeGuests(count);
  const PER_PAGE = 8;
  const pageCount = Math.ceil(count / PER_PAGE);

  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage([W, H]);
    let y = H - 34;
    page.drawText("Courtyard by Marriott Paris Porte de Versailles", { x: 300, y, size: 9, font });
    page.drawText("08/08/26", { x: W - 90, y, size: 8, font });
    y -= 16;
    page.drawText("Guest InHouse VIP", { x: 350, y, size: 11, font: bold });
    y -= 22;

    // Header spread over two printed lines, exactly like the real export.
    page.drawText("Room", { x: 30, y, size: 7.5, font: bold });
    page.drawText("Name", { x: 90, y, size: 7.5, font: bold });
    page.drawText("Company", { x: 260, y, size: 7.5, font: bold });
    page.drawText("CRS No.", { x: 380, y, size: 7.5, font: bold });
    page.drawText("Arr.", { x: 450, y, size: 7.5, font: bold });
    page.drawText("Dep.", { x: 500, y, size: 7.5, font: bold });
    page.drawText("Room", { x: 552, y, size: 7.5, font: bold });
    page.drawText("Adl. Chl. Pay", { x: 600, y, size: 7.5, font: bold });
    page.drawText("Rate", { x: 690, y, size: 7.5, font: bold });
    y -= 10;
    page.drawText("No.", { x: 30, y, size: 7.5, font: bold });
    page.drawText("Travel Agent", { x: 260, y, size: 7.5, font: bold });
    page.drawText("Date", { x: 450, y, size: 7.5, font: bold });
    page.drawText("Date", { x: 500, y, size: 7.5, font: bold });
    page.drawText("Type", { x: 552, y, size: 7.5, font: bold });
    page.drawText("Mth.", { x: 640, y, size: 7.5, font: bold });
    page.drawText("Code", { x: 690, y, size: 7.5, font: bold });
    y -= 10;
    page.drawText("VIP", { x: 90, y, size: 7.5, font: bold });
    page.drawText("Block Code Source", { x: 260, y, size: 7.5, font: bold });
    page.drawText("EDT", { x: 500, y, size: 7.5, font: bold });
    y -= 6;
    page.drawLine({ start: { x: 28, y }, end: { x: W - 28, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;

    for (const g of guests.slice(p * PER_PAGE, (p + 1) * PER_PAGE)) {
      const code = pick(VIP_CODES);
      page.drawText(g.room, { x: 30, y, size: 7.5, font });
      page.drawText(g.name.replace(", ", ","), { x: 90, y, size: 7.5, font });
      if (rnd() > 0.5) page.drawText("T- PAID SEARCH NA", { x: 260, y, size: 7.5, font });
      page.drawText(g.conf, { x: 380, y, size: 7.5, font });
      page.drawText(g.arr, { x: 450, y, size: 7.5, font });
      page.drawText(g.dep, { x: 500, y, size: 7.5, font });
      page.drawText(g.type, { x: 552, y, size: 7.5, font });
      page.drawText(`${g.adl}  ${g.chl} MC`, { x: 600, y, size: 7.5, font });
      page.drawText(g.rate, { x: 690, y, size: 7.5, font });
      y -= 10;
      // The VIP code prints on its own line beneath the name.
      page.drawText(code, { x: 100, y, size: 7.5, font });
      y -= 10;
      page.drawText(`Specials: ${pick(SPECIALS)}`, { x: 100, y, size: 7, font });
      y -= 10;
      if (rnd() > 0.5) {
        page.drawText(`Preferences: ${pick(PREFERENCES)}`, { x: 100, y, size: 7, font });
        y -= 10;
      }
      y -= 4;
    }
    page.drawText("Filter Room Class All  Room Type All  Payment Method ALL", { x: 30, y: 20, size: 7, font });
  }
  return { bytes: await doc.save(), count };
}

/** Briefing du Matin — includes the sections the extractor must IGNORE. */
async function buildBrief() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595;

  const p1 = doc.addPage([W, H]);
  let y = H - 40;
  p1.drawText("BRIEFING DU MATIN — SAMEDI 08 AOUT 2026", { x: 30, y, size: 13, font: bold });
  y -= 26;
  p1.drawText("FORECAST", { x: 30, y, size: 10, font: bold });
  y -= 16;
  const days = ["Samedi 08/08", "Dimanche 09/08", "Lundi 10/08", "Mardi 11/08", "Mercredi 12/08", "Jeudi 13/08", "Vendredi 14/08"];
  const fc = [
    [339, 156, 150, 46.02, 72, 92], [339, 136, 130, 40.12, 40, 60], [339, 149, 141, 43.95, 48, 35],
    [339, 135, 128, 39.82, 25, 39], [339, 121, 118, 35.69, 41, 62], [339, 153, 149, 45.13, 62, 46],
    [339, 168, 160, 49.56, 46, 33],
  ];
  p1.drawText("", { x: 30, y, size: 8, font });
  days.forEach((d, i) => p1.drawText(d, { x: 150 + i * 96, y, size: 7.5, font: bold }));
  y -= 12;
  ["# Sell limit", "# Occupied", "# Occupied minus COMP", "TO %", "# Arrivals", "# Departure"].forEach((label, r) => {
    p1.drawText(label, { x: 30, y, size: 7.5, font });
    fc.forEach((col, i) => p1.drawText(String(col[r]), { x: 150 + i * 96, y, size: 7.5, font }));
    y -= 12;
  });

  y -= 16;
  p1.drawText("EVENEMENTS SPECIAUX", { x: 30, y, size: 10, font: bold });
  y -= 14;
  p1.drawText("IN HOUSE", { x: 30, y, size: 8, font: bold });
  y -= 12;
  [
    ["Mr. Michael ZORADI", "#707", "Anniversaire", "Du 19 au 03/05"],
    ["Mr. Shingo HAGIWARA", "#708", "Honeymoon", "Du 29 au 30/04"],
    ["Mr. Aly SABET", "#655", "Anniversaire", "Du 28 au 01/05"],
  ].forEach((e) => { p1.drawText(`${e[1]}  ${e[0]} — ${e[2]} (${e[3]})`, { x: 40, y, size: 7.5, font }); y -= 11; });
  y -= 6;
  p1.drawText("EN ARRIVÉE", { x: 30, y, size: 8, font: bold });
  y -= 12;
  p1.drawText("#526  Mr. Anton HAVERKORT — Anniversaire de sa fille (Du 30 au 01/05)", { x: 40, y, size: 7.5, font });

  y -= 26;
  p1.drawText("CLIENT AMBASSADORS", { x: 30, y, size: 10, font: bold });
  y -= 14;
  p1.drawText("IN HOUSE", { x: 30, y, size: 8, font: bold });
  y -= 12;
  [["Mr. Paul HEYSCHELABORDE", "#551"], ["Mr. Alexandre THERIAULT", "#422"]]
    .forEach((a) => { p1.drawText(`${a[1]}  ${a[0]}`, { x: 40, y, size: 7.5, font }); y -= 11; });
  y -= 6;
  p1.drawText("EN ARRIVÉE", { x: 30, y, size: 8, font: bold });
  y -= 12;
  [["Mrs. Fernandes RIBEIRO", "#508"], ["Mr. Ibrahim KARL", "#415"], ["Mr. Wu PENGCHUN", "#608"]]
    .forEach((a) => { p1.drawText(`${a[1]}  ${a[0]}`, { x: 40, y, size: 7.5, font }); y -= 11; });

  // Page 2 — noise the extractor must skip entirely.
  const p2 = doc.addPage([W, H]);
  y = H - 40;
  p2.drawText("GSS — SATISFACTION", { x: 30, y, size: 10, font: bold }); y -= 14;
  [["Intent to Recommend", 73.0, 68.7], ["Staff Overall Service", 78.1, 74.5], ["Room Cleanliness", 76.9, 76.8],
   ["F&B Overall", 60.3, 59.5], ["Brand Promise Delivery", 72.1, 66.6]]
    .forEach((g) => { p2.drawText(`${g[0]}   MTD ${g[1]}   YTD ${g[2]}`, { x: 40, y, size: 7.5, font }); y -= 11; });
  y -= 16;
  p2.drawText("COMMENTAIRES CLIENTS", { x: 30, y, size: 10, font: bold }); y -= 14;
  p2.drawText("Mr. Wan-Ting HO (GSS) — shampoo was not refilled upon arrival.", { x: 40, y, size: 7.5, font }); y -= 11;
  p2.drawText("Mr. Stefan (HOTELS.COM) — Clean room, friendly staff, quiet location.", { x: 40, y, size: 7.5, font });
  y -= 26;
  p2.drawText("DUTY", { x: 30, y, size: 10, font: bold }); y -= 14;
  [["Vendredi 08/08", "David", "6440"], ["Samedi 09/08", "Isabelle", "6423"], ["Dimanche 10/08", "Clemence", "6481"]]
    .forEach((d) => { p2.drawText(`${d[0]}   ${d[1]}   ${d[2]}`, { x: 40, y, size: 7.5, font }); y -= 11; });
  y -= 16;
  p2.drawText("GROUPES", { x: 30, y, size: 10, font: bold }); y -= 14;
  p2.drawText("TRACOIN DELP/2SD26a — 22 chambres — contact Camille", { x: 40, y, size: 7.5, font });
  y -= 26;
  p2.drawText("THEME DU JOUR", { x: 30, y, size: 10, font: bold }); y -= 14;
  p2.drawText("Ou trouver: barbier, salon de manucure, centre commercial, epicerie, banque?", { x: 40, y, size: 7.5, font });
  return doc.save();
}

// ── build ──
mkdirSync(OUT, { recursive: true });
const manifest = [];

for (const n of [100, 200, 400]) {
  seed = 42; // same seed per size → stable, comparable files
  const guests = makeGuests(n);
  const bytes = await buildRoster(guests, "R118 Package Forecast - Detailed");
  const name = `roster-${n}-clients.pdf`;
  writeFileSync(join(OUT, name), bytes);
  const pages = Math.ceil(n / 22);
  manifest.push({ file: name, kind: "roster", guests: n, pages, kb: Math.round(bytes.length / 1024) });
}

seed = 7;
const vip = await buildVip(40);
writeFileSync(join(OUT, "vip-40-guests.pdf"), vip.bytes);
manifest.push({ file: "vip-40-guests.pdf", kind: "vip", guests: 40, pages: 5, kb: Math.round(vip.bytes.length / 1024) });

const brief = await buildBrief();
writeFileSync(join(OUT, "briefing-du-matin.pdf"), brief);
manifest.push({ file: "briefing-du-matin.pdf", kind: "brief", guests: 0, pages: 2, kb: Math.round(brief.length / 1024) });

console.log(`\nGenerated in ${OUT}/\n`);
for (const m of manifest) {
  console.log(`  ${m.file.padEnd(26)} ${String(m.guests).padStart(4)} guests  ~${String(m.pages).padStart(2)} pages  ${String(m.kb).padStart(4)} KB`);
}
