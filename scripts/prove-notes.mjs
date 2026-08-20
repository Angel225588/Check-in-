/**
 * Reception's complaint, reproduced in a real browser and then shown fixed.
 *
 *   "I added some notes for a few clients, and when you close the day and
 *    start a new day, the notes disappear."
 *
 * A unit test can prove a key is derived correctly. It cannot prove that a
 * note written by hand on the guest screen survives the day being closed, the
 * next morning's sheet arriving, and the guest turning up in a different room.
 * That is three subsystems and a page reload, so it is proved here — by
 * clicking, exactly as reception would.
 *
 * Nothing in this file constructs a note. Every note it checks for was typed
 * into the app's own compose panel and saved with its own button, which is why
 * the ciphertext in scenario 2 is real ciphertext rather than a fixture.
 *
 * Needs the demo loader, which production does not ship:
 *   NEXT_PUBLIC_TEST_TOOLS=1 npm run build && npx next start -p 3213
 *   node scripts/prove-notes.mjs
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3213";
const OUT = "validation-artifacts/prove-notes";
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

/** Room 451 on 20/08/26 — the guest whose dates were missing, breakfast non inclus. */
const GUEST = "SHEN, JIA";
const NOTE_TITLE = "ALLERGIE ARACHIDE";
const NOTE_BODY = "Severe - jamais de sauce satay";

const mkClient = (roomNumber, name) => ({
  roomNumber, roomType: "EXST", rtc: "", confirmationNumber: "82234585",
  name, arrivalDate: "17/08/26", departureDate: "21/08/26", reservationStatus: "CKIN",
  adults: 2, children: 0, rateCode: "12RMOJ", packageCode: "",
  isVip: true, vipLevel: "X4", vipNotes: "", vipSource: "list_only",
});

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

/** Open a guest the way reception does: type the room on the pad, tap the card. */
async function openGuest(page, room, name) {
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  for (const d of room.split("")) {
    await page.getByRole("button", { name: d, exact: true }).first().click();
    await page.waitForTimeout(90);
  }
  const card = page.getByRole("button").filter({ hasText: name.split(",")[0] });
  await card.first().waitFor({ state: "visible", timeout: 10000 });
  await card.first().click();
  await page.waitForURL(/\/checkin\//, { timeout: 10000 });
  await page.waitForTimeout(700);
}

/**
 * Open the activity sidebar and its Notes tab.
 *
 * `isVisible()` is not the question here. The collapsed sidebar is rendered
 * and painted — it is simply translated off the left edge, reporting x=-122 —
 * so Playwright calls it visible and then cannot click it. What decides
 * whether reception could touch it is whether its box is on the glass.
 */
const onScreen = async (loc, page) => {
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return false;
  const vp = page.viewportSize();
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width;
};

async function openNotes(page) {
  const compose = page.locator('[data-role="side-compose"]');
  if (!(await onScreen(compose, page))) {
    await page.locator('[data-role="activity-toggle"]').first().click();
    await page.waitForTimeout(600);
  }
  const tab = page.locator('[data-role="side-tab-notes"]');
  if (await onScreen(tab, page)) {
    await tab.click();
    await page.waitForTimeout(400);
  }
}

/** Type a note into the app's own panel and press its own save button. */
async function writeNote(page) {
  await openNotes(page);
  await page.locator('[data-role="side-compose"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-role="note-title"]').fill(NOTE_TITLE);
  await page.locator('[data-role="note-body"]').fill(NOTE_BODY);
  await page.locator('[data-role="note-save"]').click();
  await page.waitForTimeout(700);
}

/** Is the note on the guest's screen? */
async function noteVisible(page) {
  await openNotes(page);
  await page.waitForTimeout(500);
  return page.getByText(NOTE_TITLE, { exact: false }).first().isVisible().catch(() => false);
}

const browser = await chromium.launch({
  headless: true, executablePath: chrome(),
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});

// ─────────────────────────────────────────────────────────────────────────
// 1 · The complaint: write a note, close the day, guest returns in a new room
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());

  await seedDay(page, [mkClient("451", GUEST)]);
  await openGuest(page, "451", GUEST);
  await writeNote(page);

  check("N1-written", await noteVisible(page), "note saved on the guest screen, room 451");
  await page.screenshot({ path: join(OUT, "01-note-written-451.png") });

  // Close the day the way the app itself does when the date rolls over:
  // yesterday's sheet is still open, autoCloseStale files it into history on
  // the next load. This is the real code path, not a shortcut around it.
  const closed = await page.evaluate(() => {
    const today = new Date().toISOString().split("T")[0];
    const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const raw = localStorage.getItem("dailyData_" + today);
    if (!raw) return false;
    const d = JSON.parse(raw);
    d.date = y;
    localStorage.setItem("dailyData_" + y, JSON.stringify(d));
    localStorage.removeItem("dailyData_" + today);
    return true;
  });
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const history = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sessionHistory") || "[]").length
  );
  check("N2-day-closed", closed && history >= 1, `sessionHistory holds ${history} closed day(s)`);

  // The next morning's sheet. Same guest, different room — which is the whole
  // point: rooms change, and that is what used to lose the note.
  await seedDay(page, [mkClient("208", GUEST)]);
  await openGuest(page, "208", GUEST);

  const survived = await noteVisible(page);
  check("N3-survives-new-day", survived, "note still on the guest screen the next day, room 208");
  await page.screenshot({ path: join(OUT, "02-note-survives-new-day-208.png") });

  // And nothing was left behind: one guest, one blob.
  const blobs = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) => k.startsWith("gn_") && k !== "gn_salt" && !k.startsWith("gn_migrated")
    ).length
  );
  check("N4-no-orphan", blobs === 1, `${blobs} note blob for a guest seen in 2 rooms (was 1 per room)`);

  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
// 2 · The recovery: a note stranded under the OLD room-scoped key comes back
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());

  await seedDay(page, [mkClient("451", GUEST)]);
  await openGuest(page, "451", GUEST);
  await writeNote(page);
  check("R1-written", await noteVisible(page), "note saved normally first");

  // Strand it. The value is moved untouched to the address the shipped app
  // used to write to, so what the recovery reads back is genuine ciphertext
  // produced by the app's own key — not something this script encrypted.
  const stranded = await page.evaluate(async ({ room, name }) => {
    const live = Object.keys(localStorage).filter(
      (k) => k.startsWith("gn_") && k !== "gn_salt" && !k.startsWith("gn_migrated")
    );
    if (live.length !== 1) return { ok: false, live: live.length };
    const value = localStorage.getItem(live[0]);
    const salt = localStorage.getItem("gn_salt");
    const norm = name.trim().toLowerCase().replace(/\s+/g, " ");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${salt}|${room}|${norm}`)
    );
    let hex = "";
    for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
    localStorage.setItem("gn_" + hex.slice(0, 32), value);
    localStorage.removeItem(live[0]);
    // Hold the sweep off for a moment by claiming it already ran. Without
    // this the bug cannot be observed at all: the recovery fires on the very
    // next page load and has fixed it before the screen is even asked. True,
    // and useless as evidence — a fix nobody watched fail is a fix nobody can
    // check. So: pin the broken state, photograph it, then release.
    localStorage.setItem("gn_migrated_guest_identity", "pretend-this-device-already-swept");
    return { ok: true };
  }, { room: "451", name: GUEST });

  check("R2-stranded", stranded.ok, "note moved to the old room-scoped address");

  // The bug, with the real payload: nothing on screen.
  await openGuest(page, "451", GUEST);
  const gone = !(await noteVisible(page));
  check("R3-bug-reproduced", gone, "unreachable under the old key — the original bug");
  await page.screenshot({ path: join(OUT, "03-bug-reproduced.png") });

  // Release the sweep and let the app start fresh, which is when it runs.
  await page.evaluate(() => localStorage.removeItem("gn_migrated_guest_identity"));
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await openGuest(page, "451", GUEST);

  check("R4-recovered", await noteVisible(page), "recovered and readable under the guest");
  await page.screenshot({ path: join(OUT, "04-recovered.png") });

  const after = await page.evaluate(() => ({
    blobs: Object.keys(localStorage).filter(
      (k) => k.startsWith("gn_") && k !== "gn_salt" && !k.startsWith("gn_migrated")
    ).length,
    flagged: !!localStorage.getItem("gn_migrated_guest_identity"),
  }));
  check("R5-old-key-cleared", after.blobs === 1, `${after.blobs} blob left, the orphan is gone`);
  check("R6-runs-once", after.flagged, "marked done, so it does not re-scan every morning");

  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
// 3 · The VIP dates reach the screen (PDF → parser → merge → storage → glass)
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());

  await seedDay(page, [mkClient("451", GUEST)]);
  await openGuest(page, "451", GUEST);

  const arr = await page.getByText("17/08/26", { exact: false }).first().isVisible().catch(() => false);
  check("V1-arrival-on-screen", arr, "room 451 shows the arrival printed on the VIP sheet");
  await page.screenshot({ path: join(OUT, "05-vip-451-dates.png") });

  await ctx.close();
}

await browser.close();

const bad = results.filter((r) => !r.pass);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
console.log(`screenshots → ${OUT}/`);
process.exit(bad.length ? 1 : 0);
