/**
 * Pre-production pass: both orientations, the app's own demo data, the flows
 * reception actually runs tomorrow morning.
 *
 * Different from design-rules on purpose. That harness seeds localStorage
 * itself, which means it never exercises the seeder — and the seeder is what
 * put UTC timestamps into Récents. This one clicks "Charger un service de
 * démo" like a person, then checks a guest in and asks the screen whether it
 * noticed.
 *
 * Every check prints OK or BAD with the numbers behind it, because "it looked
 * fine" is not a result.
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3213";
const OUT = "validation-artifacts/preflight";
mkdirSync(OUT, { recursive: true });

function rc() {
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

const VIEWS = [
  ["portrait", 820, 1180],
  ["landscape", 1194, 834],
];

const b = await chromium.launch({
  headless: true, executablePath: rc(),
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});

for (const [view, w, h] of VIEWS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: view === "portrait" });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

  // ── Load the demo the way reception would ────────────────────────────────
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("app-dark", "true"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-role="test-tools"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-role="seed-demo"]').click();
  await page.waitForTimeout(1200);

  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: ":root{--safe-top:44px;--safe-bottom:34px}" });

  // ── 1 · Seeded arrivals are on the desk's clock, and never in the future ──
  const clock = await page.evaluate(() => {
    const d = new Date().toISOString().split("T")[0];
    const raw = localStorage.getItem("dailyData_" + d);
    if (!raw) return { error: "no day" };
    let day;
    try { day = JSON.parse(raw); } catch { return { error: "compressed" }; }
    const now = Date.now();
    const times = (day.checkIns || []).map((c) => new Date(c.timestamp).getTime());
    return {
      count: times.length,
      future: times.filter((t) => t > now + 60000).length,
      latest: times.length ? new Date(Math.max(...times)).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null,
    };
  });
  check(`${view}/seed-clock`, !clock.error && clock.future === 0,
    clock.error ? clock.error : `${clock.count} arrivals, ${clock.future} in the future, latest ${clock.latest}`);

  // ── 2 · A check-in lands at the TOP of Récents ───────────────────────────
  // Find a room that still owes people, type it, commit.
  const room = await page.evaluate(() => {
    const d = new Date().toISOString().split("T")[0];
    const day = JSON.parse(localStorage.getItem("dailyData_" + d));
    const done = new Set(day.checkIns.map((c) => c.roomNumber));
    const c = day.clients.find((x) => !done.has(x.roomNumber) && /^\d{3}$/.test(x.roomNumber));
    return c ? c.roomNumber : null;
  });
  if (room) {
    for (const d of room.split("")) {
      await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(500);
    const cta = page.locator('[data-role="search-enter"]');
    const mode = await cta.getAttribute("data-mode");
    if (mode === "commit") {
      await cta.click();
      await page.waitForTimeout(1400);
    } else if (mode === "open") {
      // Needs a decision — take the room's own screen and commit there.
      await cta.click();
      await page.waitForTimeout(1200);
      await page.locator('[data-role="checkin-commit"], button:has-text("Enregistrer")').first().click().catch(() => {});
      await page.waitForTimeout(1200);
      await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.addStyleTag({ content: ":root{--safe-top:44px;--safe-bottom:34px}" });
    }

    // Now open Récents and read the first row.
    const stored = await page.evaluate((r) => {
      const d = new Date().toISOString().split("T")[0];
      const day = JSON.parse(localStorage.getItem("dailyData_" + d));
      const mine = day.checkIns.filter((c) => c.roomNumber === r);
      const newest = day.checkIns
        .slice()
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      return { saved: mine.length > 0, newestRoom: newest?.roomNumber };
    }, room);
    check(`${view}/checkin-saved`, stored.saved, `room ${room}`);
    check(`${view}/checkin-is-newest`, stored.newestRoom === room,
      `newest in Récents is ${stored.newestRoom}, I entered ${room}`);

    /* The Récents CARD in the carousel — the thing Angel was reading when the
       room he had just entered was not in it. Turn the resting frame on (it
       ships off now), then read the top row. */
    if (view === "portrait") {
      await page.locator('[data-role="portrait-menu"]').click();
      await page.waitForTimeout(400);
      const prefOn = await page.locator('[data-role="drawer-preview"]').getAttribute("aria-checked");
      if (prefOn !== "true") await page.locator('[data-role="drawer-preview"]').click();
      await page.waitForTimeout(250);
      const drawerRow = await page.locator('[data-role="drawer-recent-row"]').first().innerText().catch(() => "");
      check(`${view}/drawer-recents-shows-it`, drawerRow.includes(room),
        `first drawer row: ${drawerRow.replace(/\s+/g, " ").slice(0, 40)}`);
      await page.locator('[data-role="nav-drawer"] [aria-label="Fermer le menu"]').click().catch(() => {});
      await page.waitForTimeout(600);
      const paneRow = await page.locator('[data-role="pane-recents"] [data-role="pane-row"]').first().innerText().catch(() => "");
      check(`${view}/recents-card-shows-it`, paneRow.includes(room),
        `top of the Récents card: ${paneRow.replace(/\s+/g, " ").slice(0, 40)}`);
    }
  } else {
    check(`${view}/checkin-saved`, false, "no room left to check in");
  }

  // ── 3 · The metrics bar is readable, not eight pills ─────────────────────
  await page.addStyleTag({ content: ":root{--safe-top:44px;--safe-bottom:34px}" });
  const pills = await page.locator('[data-role="metric"], [data-role="portrait-metric"]').all();
  const widths = [];
  for (const p of pills) { const bb = await p.boundingBox(); if (bb) widths.push(Math.round(bb.width)); }
  const narrowest = widths.length ? Math.min(...widths) : 0;
  check(`${view}/metrics-count`, pills.length >= 3 && pills.length <= 6, `${pills.length} pills`);
  check(`${view}/metrics-width`, narrowest >= 96, `narrowest ${narrowest}px`);
  const funnel = await page.locator('[data-role="metric-more"], [data-role="portrait-filter-more"]').count();
  check(`${view}/metrics-funnel`, funnel === 1, `${funnel} funnel`);

  // The funnel opens the same checklist in both orientations.
  if (funnel === 1) {
    await page.locator('[data-role="metric-more"], [data-role="portrait-filter-more"]').first().click();
    await page.waitForTimeout(500);
    const options = await page.locator('[data-role="metric-choice-option"]').count();
    check(`${view}/checklist-opens`, options >= 6, `${options} options`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator('[data-role="portrait-filter-sheet"] [aria-label="Fermer"]').click().catch(() => {});
    await page.waitForTimeout(400);
  }

  // ── 4 · Nothing under the iPad's clock ──────────────────────────────────
  const bad = await page.evaluate((band) => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const tag = el.tagName.toLowerCase();
      const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!words && !["button", "input", "a"].includes(tag)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.top < band && r.bottom > 0) out.push(`${el.getAttribute("data-role") || tag}@${Math.round(r.top)}`);
    }
    return out;
  }, 44);
  check(`${view}/top-margin`, bad.length === 0, bad.slice(0, 3).join(" | "));

  await page.screenshot({ path: `${OUT}/${view}-search.png` });

  // ── 5 · The report opens, and its own list expands ───────────────────────
  await page.goto(`${BASE}/report`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.addStyleTag({ content: ":root{--safe-top:44px;--safe-bottom:34px}" });
  const rows = await page.locator('[data-role="report-row"]').count();
  check(`${view}/report-rows`, rows > 0, `${rows} rows`);
  await page.locator('[data-role="report-list-expand"]').click().catch(() => {});
  await page.waitForTimeout(600);
  const sheetRows = await page.locator('[data-role="report-list-sheet"] [data-role="report-row"]').count();
  check(`${view}/report-expands`, sheetRows > 0, `${sheetRows} rows in the sheet`);
  await page.screenshot({ path: `${OUT}/${view}-report.png` });

  check(`${view}/no-js-errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

await b.close();
const passed = results.filter((r) => r.pass).length;
writeFileSync(join(OUT, "preflight.json"), JSON.stringify({ when: new Date().toISOString(), passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} preflight checks passed${passed === results.length ? "" : " — FAILURES ABOVE"}`);
process.exit(passed === results.length ? 0 : 1);
