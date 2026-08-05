/**
 * How long does a digit take to appear?
 *
 * "The pad is not very reactive" is a claim about milliseconds, so it gets
 * measured rather than argued about. This seeds a realistic day — a full house
 * and 30 days of history behind it — and times the gap between the finger
 * landing on a key and the field showing the digit.
 *
 * Run it before and after a change. A fix that does not move this number is
 * not a fix.
 */
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 3212);
const BASE = `http://localhost:${PORT}`;

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

const browser = await chromium.launch({
  headless: true, executablePath: resolveChromium(),
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true });
const page = await ctx.newPage();

await page.goto(`${BASE}/upload`, { waitUntil: "load" });
await page.evaluate(() => {
  const now = new Date();
  const iso = (d) => d.toISOString().split("T")[0];
  const pad = (n) => String(n).padStart(2, "0");
  const dmy = (off) => {
    const x = new Date(now); x.setDate(x.getDate() + off);
    return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)}`;
  };
  // A full house: 210 rooms, the size the hotel actually runs.
  const mk = (i) => ({
    roomNumber: String(100 + i), roomType: "DLXK", rtc: "", confirmationNumber: "9" + i,
    name: `NOM${i}/PRENOM${i}`, arrivalDate: dmy(-2), departureDate: dmy(2),
    reservationStatus: "CKIN", adults: 2, children: i % 3 === 0 ? 1 : 0,
    rateCode: "", packageCode: "BKF INC",
  });
  const clients = Array.from({ length: 210 }, (_, i) => mk(i));
  localStorage.setItem("dailyData_" + iso(now), JSON.stringify({
    date: iso(now), clients, rawUploadText: "",
    checkIns: clients.slice(0, 120).map((c, i) => ({
      id: "ci" + i, roomNumber: c.roomNumber, clientName: c.name, peopleEntered: 2,
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, i % 60).toISOString(),
    })),
  }));
  // 30 days behind it — the ring buffer at full stretch, which is what the
  // tablet looks like on day 40 and never on day 1.
  const history = Array.from({ length: 30 }, (_, d) => {
    const day = new Date(now); day.setDate(day.getDate() - (d + 1));
    return {
      date: iso(day), closedAt: day.toISOString(), totalRooms: 210, totalGuests: 420,
      totalEntered: 240, totalRemaining: 180, totalVip: 4,
      clients, checkIns: clients.slice(0, 120).map((c, i) => ({
        id: `h${d}-${i}`, roomNumber: c.roomNumber, clientName: c.name,
        peopleEntered: 2, timestamp: day.toISOString(),
      })),
      rawUploadText: "",
    };
  });
  localStorage.setItem("sessionHistory", JSON.stringify(history));
});

await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const field = page.locator('[data-role="search-field"] input');
const key = (d) => page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first();

/** Time from the press to the digit being visible in the field. */
async function press(d, expect) {
  const t0 = Date.now();
  await key(d).click();
  await page.waitForFunction(
    (v) => document.querySelector('[data-role="search-field"] input')?.value === v,
    expect, { timeout: 5000 }
  );
  return Date.now() - t0;
}

// Per position, because "the pad is slow" and "the list is slow" look
// identical from the finger and need different fixes.
const byStep = { "1 (wide list)": [], "10 (narrower)": [], "105 (resolved)": [], "1052 (no match)": [] };
for (let round = 0; round < 8; round++) {
  byStep["1 (wide list)"].push(await press(1, "1"));
  byStep["10 (narrower)"].push(await press(0, "10"));
  byStep["105 (resolved)"].push(await press(5, "105"));
  byStep["1052 (no match)"].push(await press(2, "1052"));
  await page.locator('[data-role="search-field"] button').last().click();
  await page.waitForTimeout(250);
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const out = {};
for (const [k, v] of Object.entries(byStep)) out[k] = { median_ms: med(v), worst_ms: Math.max(...v) };
console.log(JSON.stringify(out, null, 1));

await ctx.close();
await browser.close();
process.exit(0);
