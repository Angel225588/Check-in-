/**
 * One picture per fix, from a fixture built to make the fix visible.
 *
 * Not a screenshot tour: each shot is framed on the thing that was wrong, with
 * a fixture chosen so a broken build would produce a visibly different picture.
 * A shot that looks the same before and after proves nothing.
 *
 *   node scripts/proof-shots.mjs        (expects a server on BASE_URL)
 */
import { chromium } from "playwright";
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "validation-artifacts", "proof");
mkdirSync(OUT, { recursive: true });

function resolveChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    for (const d of readdirSync(root).filter((x) => x.startsWith("chromium-")).sort().reverse()) {
      const p = join(root, d, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  } catch {}
  return undefined;
}

const NAMES = [
  "MARTIN/Claire", "DUBOIS/Paul", "BERNARD/Léa", "PETIT/Hugo", "MOREAU/Anne",
  "LAURENT/Marc", "SIMON/Julie", "MICHEL/Yann", "GARCIA/Rosa", "ROUX/Elsa",
  "FONTAINE/Ivan", "CHEVALIER/Nina", "ROBIN/Omar", "GAUTIER/Sara", "PEREZ/Luc",
];

/** A day where rooms and people are obviously different numbers. */
function fixture() {
  const clients = NAMES.map((name, i) => ({
    roomNumber: String(201 + i),
    name,
    adults: 2,
    children: i % 5 === 0 ? 1 : 0,
    rateCode: "",
    packageCode: i % 4 === 3 ? "" : "BKF INC",
    arrivalDate: "05/08/26",
    departureDate: "12/08/26",
    isVip: i % 6 === 0,
    vipLevel: i % 6 === 0 ? "Gold" : "",
    vipSource: "breakfast_list",
  }));
  // Room 216: a FIRST-TIME guest, checked in this morning. The case that used
  // to open an empty panel saying "Aucune visite précédente".
  clients.push({
    roomNumber: "216", name: "NOVAK/Petr", adults: 2, children: 0,
    rateCode: "", packageCode: "BKF INC", arrivalDate: "09/08/26",
    departureDate: "11/08/26", isVip: false, vipLevel: "", vipSource: "breakfast_list",
  });
  return clients;
}

const browser = await chromium.launch({ executablePath: resolveChromium() });

async function open({ w, h }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: "dark" });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/upload`, { waitUntil: "load" });
  await page.evaluate((clients) => {
    localStorage.setItem("app-dark", "true");
    const now = new Date();
    const d = now.toISOString().split("T")[0];
    const at = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();

    // Ten rooms fully in at two people each, one partial, the rest absent —
    // so "rooms" and "people" cannot be mistaken for the same figure.
    const checkIns = [];
    clients.slice(0, 10).forEach((c, i) => {
      checkIns.push({ id: "ci" + i, roomNumber: c.roomNumber, clientName: c.name,
        peopleEntered: 2, timestamp: at(7, 10 + i * 4) });
    });
    checkIns.push({ id: "cip", roomNumber: clients[10].roomNumber, clientName: clients[10].name,
      peopleEntered: 1, timestamp: at(8, 5) });
    // The first-time guest, already served.
    checkIns.push({ id: "cinew", roomNumber: "216", clientName: "NOVAK/Petr",
      peopleEntered: 2, timestamp: at(8, 40) });

    localStorage.setItem("dailyData_" + d, JSON.stringify({
      date: d, clients, rawUploadText: "", checkIns, discrepancies: [],
    }));

    // Three previous mornings for room 201, at a steady hour just ahead of the
    // clock, so "Attendus bientôt" has something true to say right now.
    const soon = new Date(now.getTime() + 20 * 60000);
    const hist = [1, 2, 3].map((back) => {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      const iso = day.toISOString().split("T")[0];
      return {
        date: iso,
        clients: clients.slice(0, 3),
        checkIns: [{
          id: "h" + back, roomNumber: "201", clientName: clients[0].name, peopleEntered: 2,
          timestamp: new Date(day.getFullYear(), day.getMonth(), day.getDate(),
            soon.getHours(), soon.getMinutes() + (back - 2) * 2).toISOString(),
        }],
        discrepancies: [],
      };
    });
    localStorage.setItem("sessionHistory", JSON.stringify(hist));
  }, fixture());
  return { ctx, page };
}

const shots = [];
async function shot(page, name, title, locator) {
  const file = join(OUT, `${name}.png`);
  const target = locator ? page.locator(locator).first() : page;
  await target.screenshot({ path: file }).catch(async () => { await page.screenshot({ path: file }); });
  shots.push({ name, title, file });
  console.log(`shot  ${name}  ${title}`);
}

/* ── 1 · the report tile carries rooms AND people ─────────────────────── */
{
  const { ctx, page } = await open({ w: 1194, h: 834 });
  await page.goto(`${BASE}/report`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "1-report-rooms-and-people",
    "Report tiles: 10 ch. / 20 pers. — the two numbers that used to be one word",
    '[data-role="report-tiles"]');
  await ctx.close();
}

/* ── 2 · Attendus bientôt shows a measured hour ───────────────────────── */
{
  const { ctx, page } = await open({ w: 1194, h: 834 });
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  // Walk the carousel to the Attendus face if it is not the one showing.
  for (let i = 0; i < 3; i++) {
    if (await page.locator('[data-role="pane-expected"]').count()) break;
    await page.locator('[data-role="carousel-dot"], [data-role="pane-dot"]').nth(1).click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await shot(page, "2-attendus-real-time",
    "Attendus bientôt: the guest's own median from three recorded mornings",
    '[data-role="pane-expected"]');
  await ctx.close();
}

/* ── 3 · the metrics checklist, four pinned ───────────────────────────── */
{
  const { ctx, page } = await open({ w: 1194, h: 834 });
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator('[data-role="metric-more"]').click();
  await page.waitForTimeout(600);
  await shot(page, "3-metrics-pinned",
    "Sur la barre: Total, Entrés, Restants, COMP locked as 'toujours'; the rest are the choice",
    '[data-role="portrait-filter-sheet"]');
  await ctx.close();
}

/* ── 4 · the panel follows the hand in both orientations ──────────────── */
{
  for (const hand of ["left", "right"]) {
    const { ctx, page } = await open({ w: 1194, h: 834 });
    await page.evaluate((h) => {
      const s = JSON.parse(localStorage.getItem("app_settings") || "{}");
      s.handSide = h; localStorage.setItem("app_settings", JSON.stringify(s));
    }, hand);
    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    // Type a room first — with an empty field there are no rows to click, and
    // the shot silently photographs the search screen instead of the guest.
    for (const d of "205".split("")) {
      await page.locator(`[data-role="numeric-keypad"] button:has-text("${d}")`).first().click();
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(600);
    await page.locator('[data-role="room-row"]').first().click().catch(() => {});
    await page.waitForTimeout(1300);
    await shot(page, `4-hand-${hand}-landscape`, `Activité panel, Gaucher/Droitier = ${hand}, landscape`);
    // Rotate, don't re-navigate: the room number is not in the URL, so a fresh
    // goto bounces to /search and photographs the wrong screen.
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.waitForTimeout(900);
    await shot(page, `4-hand-${hand}-portrait`, `Same guest, same setting, portrait`);
    await ctx.close();
  }
}

/* ── 5 · one Récents, opened from the landscape nav ───────────────────── */
{
  const { ctx, page } = await open({ w: 1194, h: 834 });
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator('[data-role="hand-toggle"]').waitFor({ timeout: 4000 }).catch(() => {});
  await page.locator('button:has-text("Récents")').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "5-recents-one-sheet",
    "Landscape Récents now opens the same sheet portrait uses");
  await ctx.close();
}

/* ── 6 · a first-time guest who has already come down ─────────────────── */
{
  const { ctx, page } = await open({ w: 1194, h: 834 });
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  for (const d of "216".split("")) {
    await page.locator(`[data-role="numeric-keypad"] button:has-text("${d}")`).first().click();
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(600);
  await page.locator('[data-role="room-row"]').first().click().catch(() => {});
  await page.waitForTimeout(1300);
  await shot(page, "6-first-visit-shows-today",
    "First visit, already served: the panel is open and today's entry is there with its undo");
  await ctx.close();
}

await browser.close();
console.log(`\n${shots.length} shots in ${OUT}`);
