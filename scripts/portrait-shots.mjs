/**
 * Portrait screenshots, at real phone and tablet sizes.
 *
 * Not a gate — the gate is design-rules.mjs. This exists so the screens can be
 * looked at on the device they are for before anyone is asked to test them.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.PORT || 3211);
const BASE = `http://localhost:${PORT}`;
const OUT = "validation-artifacts/portrait";
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

/** Adopt a server already on the port, otherwise start one. Two `next start`
 *  on the same port means the second dies on EADDRINUSE and the run screenshots
 *  whatever the first one happens to be serving. */
async function answering() {
  try {
    // /upload, not /search: with no day loaded, /search server-renders a
    // skeleton and redirects, so its HTML proves nothing about readiness.
    const r = await fetch(`${BASE}/upload`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}
let server = null;
const stop = () => { if (server) { try { server.kill("SIGTERM"); } catch {} } };
process.on("exit", stop);

/** A socket that accepts is not a server that renders. Wait for the real page,
 *  or the first screenshot is a 4KB picture of nothing. */
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/upload`);
      if (r.ok) return;
    } catch {}
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`server never came up on ${BASE}`);
}

const DAY = [
  ["224", "POLANCO/ANGEL", 2, 1, "BKF INC", true],
  ["310", "VANDENBERGHE-MONTGOMERY/ALEXANDRINE", 2, 2, "BKF INC", false],
  ["385", "DUPONT/MARIA", 2, 0, "", false],
  ["402", "WEI/CHEN", 2, 2, "BKF COMP", false],
  ["437", "BENALI/OMAR", 2, 0, "BKF INC", false],
  ["501", "FABRE/JULIEN", 2, 0, "BKF INC", true],
  ["619", "DAVID/JULIE", 1, 0, "BKF INC", false],
  ["718", "LEFÈVRE/CLAIRE", 2, 2, "BKF INC", false],
  ["930", "KOVACS/ISTVAN", 2, 2, "BKF INC", false],
];

const DEVICES = [
  ["se", 320, 568],
  ["iphone", 390, 844],
  ["ipad", 834, 1194],
];

if (!(await answering())) {
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "inherit", shell: true });
  await waitForServer();
}
const browser = await chromium.launch({
  headless: true, executablePath: resolveChromium(),
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});

for (const [name, w, h] of DEVICES) {
  for (const dark of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: 2,
      colorScheme: dark ? "dark" : "light", hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/upload`, { waitUntil: "load" });
    await page.evaluate(({ day, dark }) => {
      const now = new Date();
      const d = now.toISOString().split("T")[0];
      const pad = (n) => String(n).padStart(2, "0");
      const dmy = (off) => {
        const x = new Date(now); x.setDate(x.getDate() + off);
        return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)}`;
      };
      const clients = day.map(([roomNumber, nm, adults, children, packageCode, isVip]) => ({
        roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: "9" + roomNumber,
        name: nm, arrivalDate: dmy(-2), departureDate: dmy(2), reservationStatus: "CKIN",
        adults, children, rateCode: "", packageCode, ...(isVip ? { isVip: true, vipLevel: "VIP" } : {}),
      }));
      const iso = (hh, mm) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm).toISOString();
      const arrivals = [["402", 4, 6, 55], ["437", 2, 7, 10], ["224", 3, 7, 40], ["501", 2, 7, 50], ["718", 2, 8, 0]];
      localStorage.setItem("dailyData_" + d, JSON.stringify({
        date: d, clients, rawUploadText: "",
        checkIns: arrivals.map(([room, pax, hh, mm], i) => ({
          id: "ci" + i, roomNumber: room,
          clientName: clients.find((c) => c.roomNumber === room).name,
          peopleEntered: pax, timestamp: iso(hh, mm),
        })),
      }));
      localStorage.setItem("app-dark", dark ? "true" : "false");
    }, { day: DAY, dark });

    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const theme = dark ? "dark" : "light";
    const shot = (tag) => page.screenshot({ path: `${OUT}/${name}-${theme}-${tag}.png` });

    await shot("1-idle");

    await page.locator('[data-role="portrait-menu"]').click();
    await page.waitForTimeout(500);
    await shot("2-drawer");
    await page.locator('[aria-label="Fermer le menu"]').click();
    await page.waitForTimeout(400);

    const tap = async (d) => {
      await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
      await page.waitForTimeout(220);
    };
    await tap(3); await tap(1);
    await shot("3-list");
    await tap(0);
    await page.waitForTimeout(600);
    await shot("4-card");

    await page.locator('[data-role="pad-abc"]').click();
    await page.waitForTimeout(500);
    await shot("5-letters");

    await ctx.close();
  }
}

await browser.close();
stop();
console.log(`portrait screenshots → ${OUT}`);
process.exit(0);
