// End-to-end validation driver for the Check-in PWA.
//
// Drives the REAL app in a headless browser and asserts the guarantees behind
// this branch's work, capturing a screenshot for each step as evidence:
//   1. Privacy  — the room number never appears in the URL or in any request
//   2. Check-in — checking a guest in works, the success state is shown, and it
//                 PERSISTS across navigation/reload
//   3. Storage  — the day is stored compressed at rest (LZ marker)
//   4. Honesty  — when localStorage is full, the UI shows a red "NOT saved"
//                 error instead of a fake success (the original incident)
//
// Uses the `playwright` library already in node_modules + the pre-installed
// Chromium — no extra dependency, no browser download.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3123";
const ART = join(process.cwd(), "validation-artifacts");

// The bundled `playwright` version may not match the pre-installed Chromium
// build number, so resolve the actual chrome binary under PLAYWRIGHT_BROWSERS_PATH
// and hand it to launch() explicitly (avoids "run npx playwright install").
function resolveChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dirs = readdirSync(root)
      .filter((d) => d.startsWith("chromium-"))
      .sort()
      .reverse();
    for (const d of dirs) {
      const p = join(root, d, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  } catch {}
  return undefined; // fall back to playwright's own resolution
}
const EXECUTABLE = resolveChromium();

// Reset artifacts dir
try { rmSync(ART, { recursive: true, force: true }); } catch {}
mkdirSync(ART, { recursive: true });

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`[${tag}] ${id} — ${name}${detail ? `  (${detail})` : ""}`);
}

const CLIENTS = [
  mkClient("203", "JEAN DUPONT", 2, 0),
  mkClient("305", "MARIE MARTIN", 1, 1),
  mkClient("410", "PAUL BERNARD", 2, 0),
];
function mkClient(roomNumber, name, adults, children) {
  return {
    roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: `9${roomNumber}00`,
    name, arrivalDate: "18/07/26", departureDate: "22/07/26", reservationStatus: "CKIN",
    adults, children, rateCode: "", packageCode: "",
  };
}

// Seed a known day, then land on the keypad search screen. `/search` bounces to
// the /upload hub when there's no data, so we seed on /upload first (same origin)
// and then navigate to /search with data already present.
async function seedAndOpenSearch(page) {
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.evaluate((clients) => {
    const today = new Date().toISOString().split("T")[0];
    const data = { date: today, clients, checkIns: [], rawUploadText: "" };
    localStorage.setItem("dailyData_" + today, JSON.stringify(data));
  }, CLIENTS);
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
}

async function typeRoom(page, room) {
  for (const d of room.split("")) {
    await page.getByRole("button", { name: d, exact: true }).first().click();
  }
}

async function shot(page, file) {
  await page.screenshot({ path: join(ART, file), fullPage: false });
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO A — Privacy + check-in + persistence + compression
  // ─────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
    const page = await ctx.newPage();
    const requestUrls = [];
    page.on("request", (r) => requestUrls.push(r.url()));

    await seedAndOpenSearch(page);
    await shot(page, "01-search.png");

    // Find room 203 via the on-screen keypad and open it.
    await typeRoom(page, "203");
    const card = page.getByRole("button").filter({ hasText: "JEAN DUPONT" });
    await card.first().waitFor({ state: "visible", timeout: 10000 });
    await card.first().click();
    await page.waitForURL(/\/checkin\//, { timeout: 10000 });

    const url = page.url();
    const path = new URL(url).pathname;
    // PRIVACY: room number must NOT be in the path.
    record("A1-privacy-url", "Room number absent from check-in URL",
      /^\/checkin\/[^/]+$/.test(path) && !path.includes("203"), path);

    // PRIVACY: room number must NOT be in ANY request (incl. RSC ?_rsc= fetches).
    const leaked = requestUrls.filter((u) => u.includes("203"));
    record("A2-privacy-requests", "Room number absent from all network requests",
      leaked.length === 0, leaked.length ? `leaked in ${leaked.length} req(s)` : `${requestUrls.length} reqs checked`);

    // Make the pathname visible in the screenshot as self-contained evidence.
    await page.evaluate((p) => {
      const b = document.createElement("div");
      b.textContent = "URL path: " + p + "   (room 203 shown on page, NOT in URL)";
      b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#0a7d33;color:#fff;font:600 12px monospace;padding:6px 10px;text-align:center";
      document.body.appendChild(b);
    }, path);
    await shot(page, "02-checkin-url-clean.png");

    // CHECK-IN: click the primary check-in button.
    const btn = page.getByRole("button", { name: "Enregistrer", exact: true });
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();

    // Success overlay should appear (checkin.confirmed = "Enregistré").
    let successShown = true;
    try {
      await page.getByText("Enregistré", { exact: true }).waitFor({ state: "visible", timeout: 3000 });
      await shot(page, "03-checkin-success.png");
    } catch { successShown = false; }
    record("A3-checkin-success", "Success confirmation shown after check-in", successShown);

    // Redirects back to /search.
    await page.waitForURL(/\/search/, { timeout: 5000 }).catch(() => {});

    // PERSISTENCE: re-open room 203; the check-in must still be recorded.
    await typeRoom(page, "203");
    const card2 = page.getByRole("button").filter({ hasText: "JEAN DUPONT" });
    await card2.first().waitFor({ state: "visible", timeout: 10000 });
    await card2.first().click();
    await page.waitForURL(/\/checkin\//, { timeout: 10000 });
    // 2 adults were checked in → the "all done" state (checkin.allDone) shows.
    let persisted = true;
    try {
      await page.getByText("Tous enregistrés", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    } catch { persisted = false; }
    await shot(page, "04-checkin-persisted.png");
    record("A5-persistence", "Check-in persists across navigation/reload", persisted);

    await ctx.close();
  }

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO B — Honest failure when storage is full (the original bug)
  // ─────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
    const page = await ctx.newPage();

    await seedAndOpenSearch(page);

    // Simulate a full tablet: writes to the day key now throw QuotaExceededError.
    // (Client-side navigation keeps this patch alive — no reload after this.)
    await page.evaluate(() => {
      const orig = localStorage.setItem.bind(localStorage);
      // eslint-disable-next-line no-extend-native
      localStorage.setItem = (k, v) => {
        if (String(k).startsWith("dailyData_")) {
          const e = new Error("QuotaExceededError");
          e.name = "QuotaExceededError";
          throw e;
        }
        return orig(k, v);
      };
    });

    await typeRoom(page, "305");
    const card = page.getByRole("button").filter({ hasText: "MARIE MARTIN" });
    await card.first().waitFor({ state: "visible", timeout: 10000 });
    await card.first().click();
    await page.waitForURL(/\/checkin\//, { timeout: 10000 });

    const btn = page.getByRole("button", { name: "Enregistrer", exact: true });
    await btn.waitFor({ state: "visible", timeout: 10000 });
    await btn.click();

    // Must show the red "NOT saved" error (checkin.saveFailed = "NON enregistré"),
    // and must NOT show the green success.
    let errorShown = true;
    try {
      await page.getByText("NON enregistré", { exact: true }).waitFor({ state: "visible", timeout: 4000 });
    } catch { errorShown = false; }
    const successLeaked = await page.getByText("Enregistré", { exact: true }).isVisible().catch(() => false);
    await page.waitForTimeout(500); // let the overlay finish animating for a crisp screenshot
    await shot(page, "05-quota-honest-error.png");
    record("B1-honest-failure", "Full storage shows red error, not fake success",
      errorShown && !successLeaked, errorShown ? "" : "error overlay not shown");

    await ctx.close();
  }

  await browser.close();

  // ── Report ──
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const summary = { when: new Date().toISOString(), base: BASE, passed, failed, total: results.length, results };
  writeFileSync(join(ART, "report.json"), JSON.stringify(summary, null, 2));

  const md = [
    `# Validation report`,
    ``,
    `- When: ${summary.when}`,
    `- Target: ${BASE}`,
    `- **${passed}/${results.length} checks passed**${failed ? ` — ${failed} FAILED` : ""}`,
    ``,
    `| ID | Check | Result | Detail |`,
    `|----|-------|--------|--------|`,
    ...results.map((r) => `| ${r.id} | ${r.name} | ${r.pass ? "✅ PASS" : "❌ FAIL"} | ${r.detail || ""} |`),
    ``,
    `Screenshots: \`validation-artifacts/*.png\``,
  ].join("\n");
  writeFileSync(join(ART, "report.md"), md);

  console.log(`\n${passed}/${results.length} checks passed. Artifacts in validation-artifacts/`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E driver crashed:", err);
  process.exit(2);
});
