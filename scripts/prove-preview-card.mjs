/**
 * The preview card must not move.
 *
 *   "By adding multiple notes to a person the pills go below the other and it
 *    now hides the arrival, departure and the important details we need."
 *
 * Two separate faults produced that screenshot. The note chips were stacked in
 * a column, so every extra note pushed the row beneath it further down; and to
 * absorb the overflow the row beneath was given `[@media(max-height:720px)]:hidden`
 * whenever the guest had a note at all. On a short screen the card therefore
 * dropped pax, the visit count, arrival, departure, À ENCAISSER, COMP and the
 * VIP level — on precisely the guests carrying an allergy.
 *
 * A screenshot of one guest cannot catch that: the card looks fine until the
 * guest happens to have two notes on a 700px-tall screen. What catches it is an
 * INVARIANT measured across guests — the stay row sits at the same y whether
 * the guest has no notes or four, in every orientation and both themes.
 *
 * Nothing here constructs a note. Every note was typed into the app's own
 * compose panel and saved with its own button.
 *
 * Needs the demo loader, which production does not ship:
 *   NEXT_PUBLIC_TEST_TOOLS=1 npm run build && npx next start -p 3213
 *   node scripts/prove-preview-card.mjs
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3213";
const OUT = "validation-artifacts/prove-preview-card";
mkdirSync(OUT, { recursive: true });

function chrome() {
  const r = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    for (const d of readdirSync(r).filter((x) => x.startsWith("chromium-")).sort().reverse()) {
      const p = join(r, d, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  } catch {}
  return undefined;
}

const results = [];
const check = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "OK  " : "BAD "} ${id}${detail ? `  (${detail})` : ""}`);
};

/**
 * Four guests, differing ONLY in how many notes they carry. Everything the card
 * draws below the notes is identical, so any movement between these four cards
 * is the notes moving it — which is the whole question.
 */
const GUESTS = [
  { room: "201", name: "DUPONT, JEAN", notes: [] },
  { room: "202", name: "MARTIN, SOPHIE", notes: [["ALLERGIE ARACHIDE", "alert"]] },
  // Reception's own screenshot: two pinned preferences on one guest, and a
  // name long enough to truncate.
  { room: "203", name: "GREZ HANIEWICZ, MATIAS ANDRES",
    notes: [["Éfraye", "pin"], ["Omelet jambon fromage", "pin"]] },
  { room: "204", name: "MÜLLER, HANS-JÜRGEN",
    notes: [["ALLERGIE GLUTEN", "alert"], ["Table près fenêtre", "pin"],
            ["Départ 06h45 — box petit-déjeuner à emporter", "pin"], ["Anniversaire samedi", "pin"]] },
];

const mkClient = (roomNumber, name, extra = {}) => ({
  roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: "182980227",
  name, arrivalDate: "17/08/26", departureDate: "21/08/26", reservationStatus: "CKIN",
  adults: 2, children: 1, rateCode: "ESPC", packageCode: "BKF INC",
  isVip: false, vipLevel: "", vipNotes: "", vipSource: undefined, ...extra,
});

/** The full cast, including the states that change what the info row carries. */
const ALL = [
  ...GUESTS.map((g) => mkClient(g.room, g.name)),
  mkClient("205", "SHEN, JIA", { isVip: true, vipLevel: "X4", vipSource: "list_only", packageCode: "" }),
  mkClient("206", "YAO, SHIH-CHIANG", { packageCode: "BKF COMP" }),
  mkClient("207", "LI, YINGYING", { packageCode: "", arrivalDate: "", departureDate: "" }),
];

async function seedDay(page, clients) {
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.evaluate((cs) => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(
      "dailyData_" + today,
      JSON.stringify({ date: today, clients: cs, checkIns: [], rawUploadText: "", discrepancies: [] })
    );
  }, clients);
}

const onScreen = async (loc, page) => {
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return false;
  const vp = page.viewportSize();
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width;
};

async function typeRoom(page, room) {
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(450);
  for (const d of room.split("")) {
    await page.getByRole("button", { name: d, exact: true }).first().click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(650);
}

async function openGuest(page, room, name) {
  await typeRoom(page, room);
  const card = page.getByRole("button").filter({ hasText: name.split(",")[0] });
  await card.first().waitFor({ state: "visible", timeout: 10000 });
  await card.first().click();
  await page.waitForURL(/\/checkin\//, { timeout: 10000 });
  await page.waitForTimeout(600);
}

async function openNotes(page) {
  const compose = page.locator('[data-role="side-compose"]');
  if (!(await onScreen(compose, page))) {
    await page.locator('[data-role="activity-toggle"]').first().click();
    await page.waitForTimeout(550);
  }
  const tab = page.locator('[data-role="side-tab-notes"]');
  if (await onScreen(tab, page)) {
    await tab.click();
    await page.waitForTimeout(350);
  }
}

/**
 * Type a note into the app's own panel and press its own save button.
 *
 * `kind` matters more than it looks. The composer opens on tone "info",
 * unpinned — and the card only ever draws a chip for a note that is an alert
 * or is pinned. A first version of this file typed plain info notes, measured
 * a card with no chips on it, and passed against the BROKEN component. The
 * lane it was proving was empty. Every note here is therefore flagged the way
 * reception flags one: an allergy on the alert tone, a preference pinned by
 * hand — which is exactly what was on screen in the report.
 */
async function writeNote(page, title, kind) {
  await openNotes(page);
  await page.locator('[data-role="side-compose"]').click();
  await page.waitForTimeout(350);
  if (kind === "alert") {
    // TONES order is alert, preference, loyalty, event, info — alert auto-pins.
    await page.locator('[data-role="note-tone"]').nth(0).click();
    await page.waitForTimeout(150);
  }
  await page.locator('[data-role="note-title"]').fill(title);
  await page.locator('[data-role="note-body"]').fill(`${title} — détail saisi par la réception`);
  if (kind === "pin") {
    await page.getByRole("button", { name: /Épingl/ }).first().click();
    await page.waitForTimeout(150);
  }
  await page.locator('[data-role="note-save"]').click();
  await page.waitForTimeout(600);
}

/** Everything the card must keep in the same place, measured off the real render. */
async function measure(page) {
  const card = await page.locator('[data-role="guest-preview"]').first().boundingBox().catch(() => null);
  if (!card) return null;
  const box = async (sel) =>
    page.locator(`[data-role="${sel}"]`).first().boundingBox().catch(() => null);
  const info = await box("preview-info");
  const stay = await box("preview-stay");
  const lane = await box("preview-notes");
  const chipLoc = page.locator('[data-role="preview-note"]');
  const chips = await chipLoc.count();
  let chipBottom = null;
  for (let i = 0; i < chips; i++) {
    const b = await chipLoc.nth(i).boundingBox().catch(() => null);
    if (b) chipBottom = Math.max(chipBottom ?? 0, b.y + b.height);
  }
  const overflow = (await page.locator('[data-role="preview-note-overflow"]').count()) > 0;
  return {
    card,
    info,
    stay,
    lane,
    chips,
    chipBottom,
    overflow,
    /** y of the info row measured from the card's own top, so a card that sits
     *  in a different slot per orientation still compares like with like. */
    infoFromCardTop: info ? Math.round(info.y - card.y) : null,
    laneH: lane ? Math.round(lane.height) : null,
    /** How far the stay row's bottom falls PAST the card's own bottom edge.
     *  Positive means the card is slicing it. `info-visible` below only ever
     *  asked whether the row had height — a row cut in half still does, which
     *  is how reception hit a clipped card on a green suite. */
    infoOverflow: info ? Math.round((info.y + info.height) - (card.y + card.height)) : null,
  };
}

const browser = await chromium.launch({
  headless: true, executablePath: chrome(),
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});

// ── 1 · Write the notes once, through the app's own compose panel ──────────
//
// One context for the whole run, and the viewport is resized rather than a new
// context opened per case. That is not a tidiness choice. The note key is a
// NON-EXTRACTABLE AES key in IndexedDB, so a fresh context cannot decrypt these
// notes however faithfully localStorage is copied across — an earlier version of
// this file did exactly that, silently measured cards with zero chips, and
// reported the layout "fixed" while proving nothing at all.
const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on("dialog", (d) => d.accept());
await seedDay(page, ALL);

let written = 0;
for (const g of GUESTS) {
  if (!g.notes.length) continue;
  await openGuest(page, g.room, g.name);
  for (const [t, kind] of g.notes) {
    try { await writeNote(page, t, kind); written++; }
    catch (e) { console.log(`    FAILED ${g.room} "${t}" — ${String(e).split("\n")[0]}`); }
  }
}
check("P1-notes-authored", written === 7, `${written} flagged notes typed into the app's own panel`);

// ── 2 · The invariant, across orientation and theme ────────────────────────
const VIEWS = [
  { id: "ipad-landscape", width: 1194, height: 834 },
  { id: "short-landscape", width: 1024, height: 700 },   // the ≤720px case that broke
  { id: "ipad-portrait",  width: 820,  height: 1180 },
  /* The squeezed cases. The three above all give the card ~520px, so nothing
     is under pressure and a containment check there can never fail. Reception
     met a clipped card on a real device; these are the sizes where the column
     actually has to give something up — a phone, and an iPad in Split View. */
  { id: "short-portrait",  width: 820, height: 620 },
  { id: "phone-portrait",  width: 390, height: 667 },
];

for (const v of VIEWS) {
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.evaluate((dark) => localStorage.setItem("app-dark", dark), theme === "dark" ? "true" : "false");

    const seen = [];
    for (const g of GUESTS) {
      await typeRoom(page, g.room);
      const m = await measure(page);
      if (!m) { check(`P2-${v.id}-${theme}-${g.room}-card`, false, "no preview card rendered"); continue; }
      seen.push({ room: g.room, want: g.notes.length, ...m });

      await page.locator('[data-role="guest-preview"]').first()
        .screenshot({ path: join(OUT, `${v.id}-${theme}-${g.room}-${g.notes.length}notes.png`) })
        .catch(() => {});

      const drawn = !!m.info && m.info.height > 0 &&
        m.info.y >= m.card.y && m.info.y + m.info.height <= m.card.y + m.card.height + 1;
      check(`P2-${v.id}-${theme}-r${g.room}-info-visible`, drawn,
        `${g.notes.length} note(s) · info row ${m.info ? `${Math.round(m.info.height)}px` : "ABSENT"}`);

      check(`P2b-${v.id}-${theme}-r${g.room}-info-inside-card`,
        m.infoOverflow !== null && m.infoOverflow <= 1,
        `stay row overflows the card by ${m.infoOverflow}px`);

      check(`P3-${v.id}-${theme}-r${g.room}-stay-visible`, !!m.stay && m.stay.height > 0,
        m.stay ? `arrivée/départ at y+${Math.round(m.stay.y - m.card.y)}` : "ARRIVAL/DEPARTURE MISSING");
    }

    if (seen.length === GUESTS.length) {
      /**
       * A spread of zero across four MISSING measurements is zero. The first
       * version of these three checks compared arrays of nulls and passed —
       * green on a card that was not drawing the row at all. An absent
       * measurement is a failure, never a match.
       */
      const ok = (xs) => xs.every((x) => typeof x === "number" && Number.isFinite(x));
      const fixed = (xs) => ok(xs) && Math.max(...xs) - Math.min(...xs) <= 1;

      const ys = seen.map((s) => s.infoFromCardTop);
      check(`P4-${v.id}-${theme}-info-fixed`, fixed(ys),
        `info row y across 0/1/2/4 notes: [${ys.join(", ")}]${ok(ys) ? ` spread ${Math.max(...ys) - Math.min(...ys)}px` : " — MEASUREMENT MISSING"}`);

      const hs = seen.map((s) => s.laneH);
      check(`P5-${v.id}-${theme}-lane-fixed`, fixed(hs),
        `note lane height: [${hs.join(", ")}]${ok(hs) ? ` spread ${Math.max(...hs) - Math.min(...hs)}px` : " — MEASUREMENT MISSING"}`);

      const cardH = seen.map((s) => (s.card ? Math.round(s.card.height) : null));
      check(`P6-${v.id}-${theme}-card-fixed`, fixed(cardH), `card height: [${cardH.join(", ")}]`);

      // Chips must actually be ON the card, or every check above measured an
      // empty lane and proves nothing.
      const one = seen.find((s) => s.want === 1);
      const two = seen.find((s) => s.want === 2);
      const four = seen.find((s) => s.want === 4);
      check(`P7-${v.id}-${theme}-chips-drawn`,
        one?.chips === 1 && two?.chips === 2 && four?.chips === 2,
        `chips for 1/2/4 notes: ${one?.chips}/${two?.chips}/${four?.chips} (4 notes → 2 chips + counter)`);
      check(`P8-${v.id}-${theme}-overflow-counter`, !!four?.overflow,
        four?.overflow ? '"+2" shown for the two that do not fit' : "no overflow counter");
      const spill = seen.filter((s) => s.chipBottom !== null && s.lane && s.chipBottom > s.lane.y + s.lane.height + 1);
      check(`P9-${v.id}-${theme}-chips-inside-lane`, spill.length === 0,
        spill.length ? `${spill.length} card(s) paint a chip past the lane` : "every chip within its lane");
    }
  }
}
await ctx.close();
await browser.close();

const bad = results.filter((r) => !r.pass);
console.log(`\n${results.length - bad.length}/${results.length} preview-card checks passed`);
if (bad.length) { console.log("FAILED:"); for (const b of bad) console.log(`  ${b.id} — ${b.detail}`); }
console.log(`screenshots → ${OUT}`);
process.exit(bad.length ? 1 : 0);
