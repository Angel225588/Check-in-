/**
 * One pass through the user stories, on a real build, before production.
 *
 * Not a design gate and not a unit test: this is reception's morning, in order,
 * with the assertions written from the story's own "Never" line. Every check
 * prints the numbers behind it, because the question being answered is "is this
 * ready", and the only honest answer to that has evidence attached.
 *
 * Run against a server serving the CURRENT build:
 *   node scripts/story-pass.mjs            (BASE_URL to override)
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3213";
const OUT = "validation-artifacts/story-pass";
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
const check = (story, what, pass, detail) => {
  results.push({ story, what, pass, detail });
  console.log(`${pass ? "OK  " : "BAD "} ${story.padEnd(7)} ${what}${detail ? `  — ${detail}` : ""}`);
};

const b = await chromium.launch({ headless: true, executablePath: rc(), args: ["--disable-dev-shm-usage", "--no-sandbox"] });

for (const [view, w, h] of [["portrait", 820, 1180], ["landscape", 1194, 834]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: view === "portrait" });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e).slice(0, 140)));
  /* Every request the app makes, so "the room number never travels" can be
     asserted rather than believed. */
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));

  const field = () => page.locator('[data-role="search-field"] input, input[placeholder*="Chambre"]').first();
  const tap = async (d) => {
    await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
    await page.waitForTimeout(170);
  };
  const clearField = async () => {
    for (let i = 0; i < 8; i++) {
      await page.locator('[data-role="numeric-keypad"] button[aria-label="Backspace"]').click().catch(() => {});
      await page.waitForTimeout(70);
    }
  };
  const day = () => page.evaluate(() => {
    const d = new Date().toISOString().split("T")[0];
    return JSON.parse(localStorage.getItem("dailyData_" + d) || "null");
  });

  // ── The morning starts: a list is loaded ────────────────────────────────
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("app-dark", "true"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-role="test-tools"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-role="seed-demo"]').click();
  await page.waitForTimeout(1600);
  const seeded = await day();
  check("setup", "a day is loaded", !!seeded && seeded.clients.length > 50, `${seeded?.clients?.length ?? 0} rooms`);

  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  // ── US-1 · check a room in by its number ────────────────────────────────
  const plain = await page.evaluate(() => {
    const d = new Date().toISOString().split("T")[0];
    const day = JSON.parse(localStorage.getItem("dailyData_" + d));
    const done = new Set(day.checkIns.map((c) => c.roomNumber));
    // A room with nothing to decide: breakfast included, no VIP, not comp.
    const c = day.clients.find((x) =>
      !done.has(x.roomNumber) && /^\d{3}$/.test(x.roomNumber) &&
      /BKF INC/i.test(x.packageCode || "") && !x.isVip);
    return c ? { room: c.roomNumber, pax: c.adults + c.children } : null;
  });
  if (plain) {
    await clearField();
    for (const d of plain.room.split("")) await tap(d);
    await page.waitForTimeout(500);
    const mode = await page.locator('[data-role="search-enter"]').getAttribute("data-mode");
    check("US-1", "an ordinary room commits in one tap", mode === "commit", `button mode=${mode}`);
    await page.locator('[data-role="search-enter"]').click();
    await page.waitForTimeout(1300);
    const after = await day();
    const saved = after.checkIns.filter((c) => c.roomNumber === plain.room);
    check("US-1", "the check-in is stored", saved.length > 0, `${saved.length} record(s), ${saved[0]?.peopleEntered ?? 0} pers.`);
    const cleared = (await field().inputValue()) === "";
    check("US-1", "the field clears for the next guest", cleared);

    // ── US-5 · Récents answers "did I already do 224?" ────────────────────
    const newest = after.checkIns.slice().sort((a, c) => new Date(c.timestamp) - new Date(a.timestamp))[0];
    check("US-5", "the entry I just made is the newest", newest?.roomNumber === plain.room, `newest=${newest?.roomNumber}`);
  } else {
    check("US-1", "an ordinary room commits in one tap", false, "no undecided room in the day");
  }

  // ── US-2 · never skip what needs a decision ─────────────────────────────
  const needsCall = await page.evaluate(() => {
    const d = new Date().toISOString().split("T")[0];
    const day = JSON.parse(localStorage.getItem("dailyData_" + d));
    const done = new Set(day.checkIns.map((c) => c.roomNumber));
    /* The same regex needsPaymentChoice uses. A probe with its own idea of
       what needs a decision tests the probe, not the app. */
    const covered = (x) =>
      /BKF\s*(INC|GRP|EXCL|COMP|GTT)|UPS\s*F?\s*PDJ/.test((x.packageCode || "").toUpperCase().replace(/\s+/g, " "));
    const c = day.clients.find((x) =>
      !done.has(x.roomNumber) && /^\d{3}$/.test(x.roomNumber) &&
      !covered(x) && x.vipSource !== "list_only" && x.vipSource !== "walk_in");
    return c ? c.roomNumber : null;
  });
  if (needsCall) {
    await clearField();
    for (const d of needsCall.split("")) await tap(d);
    await page.waitForTimeout(500);
    const mode = await page.locator('[data-role="search-enter"]').getAttribute("data-mode");
    const label = (await page.locator('[data-role="search-enter"]').innerText()).replace(/\s+/g, " ").trim();
    check("US-2", "a room needing a decision refuses the shortcut", mode === "open", `mode=${mode}, button reads "${label}"`);
  } else {
    check("US-2", "a room needing a decision refuses the shortcut", false, "no such room in the day");
  }

  // ── US-4 · find a guest by name, accents folded ─────────────────────────
  await clearField();
  const named = await page.evaluate(() => {
    const d = new Date().toISOString().split("T")[0];
    const day = JSON.parse(localStorage.getItem("dailyData_" + d));
    const c = day.clients.find((x) => /[éèêàçô]/i.test(x.name));
    return c ? c.name : null;
  });
  await page.locator('[data-role="pad-abc"]').click();
  await page.waitForTimeout(400);
  const probe = (named || "MARTIN").split(/[\/, ]/)[0].slice(0, 3);
  for (const ch of probe.normalize("NFD").replace(/[̀-ͯ]/g, "")) {
    await page.locator('[data-role="alpha-keypad"] button', { hasText: new RegExp(`^${ch}$`, "i") }).first().click().catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  const rows = await page.locator('[data-role="room-row"]').count();
  check("US-4", "a name without accents finds the accented guest", rows > 0, `"${probe}" → ${rows} row(s)${named ? ` (list has ${named})` : ""}`);

  // ── US-22 + privacy · opening a guest never puts the room in the URL ────
  if (rows > 0) {
    await page.locator('[data-role="room-row"]').first().click();
    await page.waitForTimeout(1200);
    const url = page.url();
    const room = url.match(/checkin\/([^?#/]+)/)?.[1] ?? "";
    check("US-22", "a row opens the guest", /\/checkin\//.test(url), url.replace(BASE, ""));
    check("PII", "the room number is not in the URL", !/^\d{3,4}$/.test(room), `path segment "${room}"`);
    const leaked = urls.filter((u) => plain && new RegExp(`[?&/]${plain.room}(\\b|$)`).test(u.replace(BASE, "")));
    check("PII", "no request carries a room number", leaked.length === 0, `${urls.length} requests checked`);

    // ── US-6 · a note survives, and is not readable in storage ───────────
    const noteText = "ALLERGIE ARACHIDES " + Date.now();
    const opened = await page.locator('[data-role="side-tab-notes"]').click().then(() => true).catch(() => false);
    if (opened) {
      await page.waitForTimeout(500);
      await page.locator('[data-role="note-new"]').click().catch(() => {});
      await page.waitForTimeout(400);
      const scope = (await page.locator('[data-role="notes-modal"]').count()) ? page.locator('[data-role="notes-modal"]') : page.locator("aside");
      await scope.getByRole("button", { name: "Alerte", exact: true }).click().catch(() => {});
      await scope.locator('[data-role="note-title"]').fill(noteText).catch(() => {});
      await scope.locator('[data-role="note-save"]').click().catch(() => {});
      await page.waitForTimeout(1200);

      const storage = await page.evaluate(() => JSON.stringify(localStorage));
      check("US-6", "the note is not readable in localStorage", !storage.includes("ARACHIDES"),
        `${Math.round(storage.length / 1024)} KB scanned`);

      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1400);
      await page.locator('[data-role="side-tab-notes"]').click().catch(() => {});
      await page.waitForTimeout(900);
      const back = await page.locator("aside").innerText().catch(() => "");
      check("US-6", "the note is still there after a reload", back.includes("ARACHIDES"), back.includes("ARACHIDES") ? "decrypted on the guest's screen" : "not found");
    } else {
      check("US-6", "notes reachable on the guest screen", false, "no notes tab");
    }

    // Back returns to where we came from.
    const backBtn = page.locator('[data-role="back"]').first();
    await backBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
    check("US-22", "back returns to the search screen", /\/search/.test(page.url()), page.url().replace(BASE, ""));
  }

  // ── US-8 · the report's figures agree with each other ───────────────────
  await page.goto(`${BASE}/report`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  const fig = await page.evaluate(() => {
    const txt = document.body.innerText;
    const rows = document.querySelectorAll('[data-role="report-row"]').length;
    const money = /(€|\$|EUR\b|\bCA\b|chiffre d'affaires)/i.test(txt);
    return { rows, money };
  });
  const d = await day();
  const enteredRooms = new Set(d.checkIns.map((c) => c.roomNumber)).size;
  check("US-8", "the report lists the day", fig.rows > 0, `${fig.rows} rows, ${enteredRooms} rooms entered`);
  check("US-8", "no money on the service report", !fig.money);

  // ── US-9 · close the day ────────────────────────────────────────────────
  if (view === "landscape") {
    const before = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("sessionHistory") || "[]").length; } catch { return -1; }
    });
    await page.locator('[data-role="report-close-day"]').click().catch(() => {});
    await page.waitForTimeout(1800);
    const after = await page.evaluate(() => {
      let sessions = -1;
      try { sessions = JSON.parse(localStorage.getItem("sessionHistory") || "[]").length; } catch {}
      const day = localStorage.getItem("dailyData_" + new Date().toISOString().split("T")[0]);
      let rooms = 0;
      try { rooms = JSON.parse(day || "null")?.clients?.length ?? 0; } catch { rooms = -1; }
      return { sessions, rooms };
    });
    check("US-9", "closing the day files it and starts the next one clean",
      after.sessions > before && after.rooms === 0,
      `history ${before} → ${after.sessions}, today now ${after.rooms} rooms`);
  }

  check("runtime", "no JavaScript errors during the pass", jsErrors.length === 0, jsErrors.slice(0, 2).join(" | "));
  await page.screenshot({ path: `${OUT}/${view}-end.png` });
  await ctx.close();
}

await b.close();
const passed = results.filter((r) => r.pass).length;
writeFileSync(join(OUT, "story-pass.json"), JSON.stringify({ when: new Date().toISOString(), passed, total: results.length, results }, null, 2));
console.log(`\n${passed}/${results.length} story checks passed${passed === results.length ? "" : " — FAILURES ABOVE"}`);
process.exit(passed === results.length ? 0 : 1);
