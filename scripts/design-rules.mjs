// Design-rule gate for the check-in screen.
//
// The redesign earned a set of invariants the hard way — each one below is a
// bug we actually shipped or nearly shipped. They are asserted against the
// REAL rendered app in a headless browser, because most of them (contrast,
// reachability, tap size) simply cannot be checked from source.
//
//   R1  the primary CTA is reachable without scrolling, at every viewport
//   R2  a first-visit guest shows no invented history
//   R3  a COMP guest never shows a price
//   R4  payment methods appear only when a payment choice is required
//   R5  the CTA colour is constant (it used to change on first visit)
//   R6  the only red element is the "breakfast not included" indicator
//   R7  no emoji is used as product iconography
//   R8  every interactive element is at least 44x44 CSS px
//   R9  every text/background pair clears WCAG AA (4.5:1, or 3:1 when large)
//   R10-R12  notes are reachable, capped, and destructive actions are guarded
//   R13  the activity control sits on the side the panel opens from
//   R14-R15  writing outranks classifying; the panel is readable and back is fixed
//   R16  search: empty until typed, preview in the clock box, bounded stepper
//   R17  report: figures agree with each other, tiles filter, écarts survive
//   R18  contrast on the search and report screens, both themes
//   R19  nothing clips at any viewport the app is opened on
//   R20  every gap, padding and corner is on the spacing/radius scale
//   R21  the pad and the letters belong to the app, not to iOS
//
// Usage: node scripts/design-rules.mjs            (expects a server on BASE)
//        BASE_URL=http://localhost:3200 node scripts/design-rules.mjs
//        NEW_ONLY=1 …                             (skip the check-in pass)

import { chromium } from "playwright";
import { readdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.BASE_URL || "http://localhost:3200";
const ROOT = process.cwd();
const OUT = join(ROOT, "validation-artifacts");

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

const results = [];
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id} — ${name}${detail ? `  (${detail})` : ""}`);
};

// ── colour helpers ────────────────────────────────────────────────────────
const relLum = ([r, g, b]) => {
  const s = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const contrast = (a, b) => {
  const [hi, lo] = relLum(a) > relLum(b) ? [relLum(a), relLum(b)] : [relLum(b), relLum(a)];
  return (hi + 0.05) / (lo + 0.05);
};

const CLIENTS = {
  // VIP with no breakfast package → payment choice required
  vipNoPdj: mk("524", "SEDALO, TETE", 2, 2, "", { isVip: true, vipLevel: "VIP" }),
  // breakfast included → no payment section
  included: mk("619", "DAVID, JULIE", 1, 0, "BKF INC"),
  // comp → must never show a price
  comp: mk("701", "MARCHAND, LUC", 2, 0, "BKF COMP"),
  // pathological name length
  longName: mk("802", "VANDENBERGHE-MONTGOMERY, ALEXANDRINE", 2, 2, "BKF INC"),
};
function mk(roomNumber, name, adults, children, packageCode, extra = {}) {
  return {
    roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: `9${roomNumber}`,
    name, arrivalDate: "19/07/26", departureDate: "22/07/26", reservationStatus: "CKIN",
    adults, children, rateCode: "", packageCode, ...extra,
  };
}
const PAST_STAY = (c) => [{
  date: "2026-05-22", closedAt: "x", totalRooms: 1, totalGuests: 2, totalEntered: 0,
  totalRemaining: 2, totalVip: 1, clients: [{ ...c, roomNumber: "210" }], checkIns: [], rawUploadText: "",
}];

// The sandbox runs out of shared memory long before this suite runs out of
// checks, so the browser is recycled every few contexts instead of being held
// open for all 22 — a crashed browser midway looks exactly like a failing rule.
const LAUNCH = { headless: true, executablePath: resolveChromium(), args: ["--disable-dev-shm-usage", "--no-sandbox"] };
let _browser = null, _uses = 0;
async function browserFor() {
  if (_browser && _uses < 6) { _uses++; return _browser; }
  if (_browser) { try { await _browser.close(); } catch {} }
  _browser = await chromium.launch(LAUNCH);
  _uses = 1;
  return _browser;
}
async function closeBrowser() { if (_browser) { try { await _browser.close(); } catch {} _browser = null; } }

async function open(_ignored, client, { dark = false, history = null, w = 1194, h = 834 } = {}) {
  const browser = await browserFor();
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1,
    colorScheme: dark ? "dark" : "light",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/upload`, { waitUntil: "load" });
  await page.evaluate(({ client, history, dark }) => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("dailyData_" + today, JSON.stringify({
      date: today, clients: [client], checkIns: [], rawUploadText: "",
    }));
    if (history) localStorage.setItem("sessionHistory", JSON.stringify(history));
    else localStorage.removeItem("sessionHistory");
    localStorage.setItem("app-dark", dark ? "true" : "false");
  }, { client, history, dark });
  await page.goto(`${BASE}/checkin/${client.roomNumber}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(450);
  // Guard against a broken harness masquerading as a design failure. If the
  // server serves a stale chunk manifest (e.g. .next was rebuilt underneath a
  // running `next start`), assets 500 and the page never hydrates — every rule
  // would then "fail" for the wrong reason. Blow up instead.
  const hydrated = await page.evaluate(() => document.body.innerText.trim().length > 0);
  if (!hydrated) {
    throw new Error(
      `Page did not hydrate at ${BASE}/checkin/${client.roomNumber} — the app served an empty body. ` +
      `This is an environment fault, not a design-rule failure: rebuild, then restart the server.`
    );
  }
  // HTML alone is not enough: if the stylesheet did not apply, every element
  // measures at its unstyled size (a 1128x64 CTA reports as 81x21) and the
  // suite blames the layout for a missing asset. Wait for a brand token to
  // resolve, which only happens once the real stylesheet is in.
  try {
    await page.waitForFunction(
      () => getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim().length > 0,
      { timeout: 8000 }
    );
  } catch {
    throw new Error(
      `Stylesheet never applied at ${BASE}/checkin/${client.roomNumber} — measurements would be of ` +
      `unstyled elements. Environment fault, not a design-rule failure.`
    );
  }
  return { ctx, page };
}

// Composite a stack of possibly-translucent backgrounds down to solid RGB.
// Returns EVERY plausible backdrop for the text, not just one: a gradient has
// many colours behind the same glyph, and checking only the average would hide
// the worst spot. Callers assert against the minimum contrast across the set.
const COMPOSITE = `(el) => {
  const parse = (s) => {
    const n = (s.match(/[\\d.]+/g) || []).map(Number);
    return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
  };
  const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  // Pull the colour stops out of a gradient; each is a real backdrop.
  const stopsOf = (img) => {
    if (!img || img === "none") return [];
    const out = [];
    const re = /rgba?\\(([^)]+)\\)/g;
    let m;
    while ((m = re.exec(img))) {
      const n = m[1].split(",").map((x) => parseFloat(x));
      out.push({ rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 });
    }
    return out;
  };
  // Walk to the root collecting layers, innermost first.
  const layers = [];
  let node = el;
  while (node && node.nodeType === 1) {
    const cs = getComputedStyle(node);
    const grad = stopsOf(cs.backgroundImage);
    if (grad.length) layers.push({ kind: "grad", stops: grad });
    const bg = cs.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") layers.push({ kind: "solid", c: parse(bg) });
    node = node.parentElement;
  }
  // Paint outermost -> innermost. A gradient forks the set of candidate backdrops.
  let candidates = [[255, 255, 255]];
  for (const l of layers.reverse()) {
    if (l.kind === "solid") {
      candidates = candidates.map((b) => over(l.c, b));
    } else {
      const next = [];
      for (const b of candidates) for (const s of l.stops) next.push(over(s, b));
      candidates = next;
    }
  }
  const cs = getComputedStyle(el);
  return { color: parse(cs.color).rgb, bgs: candidates, size: parseFloat(cs.fontSize), weight: cs.weight || cs.fontWeight };
}`;

// Wait for the server rather than assuming a fixed sleep was long enough.
async function ping(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/upload`, { redirect: "manual" });
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

// Own the server unless one is already up. A gate that depends on the caller
// remembering to start (and not to rebuild underneath) a server is a gate that
// reports infrastructure noise as design regressions.
let _server = null;

/**
 * Is the server on BASE serving the build we just made?
 *
 * Adopting whatever answers the port is how a leftover `next start` from an
 * earlier run ends up serving code from two commits ago while the suite
 * reports its failures as design regressions. It cost two runs before the
 * hydration guard caught it, and by then the log said "empty body" rather
 * than "wrong build". Next stamps every asset path with the build id, so the
 * served HTML either mentions the id in .next/BUILD_ID or it is not ours.
 */
async function servingCurrentBuild() {
  let id = "";
  try { id = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim(); } catch { return true; }
  if (!id) return true;
  try {
    const html = await fetch(`${BASE}/search`).then((r) => r.text());
    return html.includes(id);
  } catch {
    return false;
  }
}

async function startServer() {
  if (await ping(2000)) {
    if (await servingCurrentBuild()) return; // caller supplied a current one
    throw new Error(
      `A server is already answering on ${BASE}, but it is serving a DIFFERENT build ` +
      `than the one in .next. Kill it and re-run (fuser -k ${new URL(BASE).port}/tcp) — ` +
      `testing a stale bundle reports old code as new failures.`
    );
  }
  const port = new URL(BASE).port || "3000";
  // `shell: true` so this resolves npx the same way an interactive shell would;
  // a bare spawn silently fails to launch in some sandboxes and then the whole
  // suite reports as a design failure.
  _server = spawn(`npx next start -p ${port}`, {
    cwd: ROOT, stdio: "ignore", detached: true, shell: true,
  });
  _server.unref();
  if (!(await ping(120000))) {
    throw new Error(
      `Could not start a server on ${BASE}. Start one yourself (npx next start -p ${port}) ` +
      `and re-run — the suite will use it instead of spawning its own.`
    );
  }
}
function stopServer() {
  if (_server) { try { process.kill(-_server.pid, "SIGKILL"); } catch {} _server = null; }
}

async function main() {
  try { mkdirSync(OUT, { recursive: true }); } catch {}
  await startServer();
  const browser = null; // contexts come from browserFor(); see above

  // The check-in rules take ~15 minutes to drive. NEW_ONLY=1 skips them while
  // iterating on the search/report rules below; CI always runs the whole set.
  if (!process.env.NEW_ONLY) {
  // ── R1 · CTA reachable without scrolling, at every viewport ────────────
  const VIEWPORTS = [
    ["phone", 390, 844], ["ipad-mini-portrait", 744, 1133],
    ["ipad-landscape", 1194, 834], ["desktop", 1366, 1024], ["split-view", 1194, 520],
  ];
  for (const [label, w, h] of VIEWPORTS) {
    for (const [ck, client] of [["vip", CLIENTS.vipNoPdj], ["incl", CLIENTS.included]]) {
      const { ctx, page } = await open(browser, client, { w, h });
      const vis = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Enregistrer");
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, ih: window.innerHeight, w: r.width, h: r.height };
      });
      const ok = !!vis && vis.bottom <= vis.ih + 1 && vis.top >= -1 && vis.w > 200 && vis.h >= 44;
      record(`R1-${label}-${ck}`, "CTA reachable without scrolling", ok,
        vis ? `${Math.round(vis.w)}x${Math.round(vis.h)} bottom=${Math.round(vis.bottom)}/${vis.ih}` : "button not found");
      await ctx.close();
    }
  }

  // ── R1b · no horizontal overflow, no clipped long name ────────────────
  {
    const { ctx, page } = await open(browser, CLIENTS.longName, { w: 1194, h: 834 });
    const m = await page.evaluate(() => ({
      overflow: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth + 1,
      sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth,
    }));
    record("R1b-overflow", "No horizontal overflow with a very long guest name", !m.overflow, `${m.sw}/${m.cw}`);
    await ctx.close();
  }

  // ── R2 · first visit shows no invented history ────────────────────────
  {
    const { ctx, page } = await open(browser, CLIENTS.included, { history: null });
    const txt = await page.evaluate(() => document.body.innerText);
    const invented = /Client fidèle|séjour|Séjours précédents/i.test(txt);
    record("R2-first-visit-empty", "First-visit guest shows no invented loyalty history", !invented,
      invented ? "found history wording" : "clean");
    await ctx.close();
  }

  // ── R3 · COMP shows no price ──────────────────────────────────────────
  {
    const { ctx, page } = await open(browser, CLIENTS.comp);
    const txt = await page.evaluate(() => document.body.innerText);
    const hasPrice = /\d+[.,]\d{2}\s*€|€\s*\d/.test(txt);
    record("R3-comp-no-price", "COMP guest never shows a price", !hasPrice, hasPrice ? "price found" : "no price");
    await ctx.close();
  }

  // ── R4 · payment methods only when a choice is required ───────────────
  for (const [ck, client, expect] of [["vip-no-pdj", CLIENTS.vipNoPdj, true], ["included", CLIENTS.included, false]]) {
    const { ctx, page } = await open(browser, client);
    const n = await page.evaluate(() =>
      [...document.querySelectorAll("button")].filter((b) => /^(Chambre|Carte|Cash|Supervisor)$/.test(b.textContent.trim())).length);
    record(`R4-${ck}`, `Payment methods ${expect ? "shown" : "hidden"}`, expect ? n === 4 : n === 0, `${n} buttons`);
    await ctx.close();
  }

  // ── R5 · CTA colour is constant across first-visit and returning ──────
  {
    const read = async (history) => {
      const { ctx, page } = await open(browser, CLIENTS.vipNoPdj, { history });
      const c = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Enregistrer");
        return b ? getComputedStyle(b).backgroundColor + "|" + getComputedStyle(b).backgroundImage : null;
      });
      await ctx.close();
      return c;
    };
    const first = await read(null);
    const returning = await read(PAST_STAY(CLIENTS.vipNoPdj));
    record("R5-cta-constant", "CTA colour does not change on first visit", first === returning, `${first} vs ${returning}`);
  }

  // ── R6 · the only red element is the breakfast-not-included indicator ─
  {
    const { ctx, page } = await open(browser, CLIENTS.vipNoPdj);
    const reds = await page.evaluate(() => {
      const isRed = (s) => {
        const n = (s.match(/[\d.]+/g) || []).map(Number);
        if (n.length < 3 || (n[3] !== undefined && n[3] === 0)) return false;
        const [r, g, b] = n;
        return r > 120 && r > g * 1.6 && r > b * 1.6;
      };
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (isRed(cs.backgroundColor) && el.getBoundingClientRect().width > 8) out.push(el.textContent.trim().slice(0, 40));
      }
      return out;
    });
    const stray = reds.filter((t) => !/NON INCLUS/i.test(t));
    record("R6-red-reserved", "Red is reserved for the breakfast-not-included indicator",
      stray.length === 0, stray.length ? `stray: ${stray.slice(0, 3).join(" | ")}` : `${reds.length} red element(s), all NON INCLUS`);
    await ctx.close();
  }

  // ── R7 · no emoji used as product iconography (source check) ──────────
  {
    const src = readFileSync(join(ROOT, "src/app/checkin/[roomNumber]/page.tsx"), "utf8");
    // Pictographic emoji, excluding plain text punctuation/symbols.
    const found = src.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || [];
    record("R7-no-emoji", "No emoji used as product iconography", found.length === 0,
      found.length ? `found ${[...new Set(found)].join(" ")}` : "clean");
  }

  // ── R8 · tap targets >= 44x44 ─────────────────────────────────────────
  for (const [label, w, h] of [["tablet", 1194, 834], ["phone", 390, 844]]) {
    const { ctx, page } = await open(browser, CLIENTS.vipNoPdj, { history: PAST_STAY(CLIENTS.vipNoPdj), w, h });
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button,a,[role="button"],input')]
        .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter((e) => e.w > 0 && e.h > 0 && (e.w < 44 || e.h < 44)));
    record(`R8-${label}-tap-targets`, "All interactive elements >= 44x44", small.length === 0,
      small.length ? small.map((s) => `${s.t}(${s.w}x${s.h})`).join(", ") : "all >= 44");
    await ctx.close();
  }

  // ── R9 · WCAG AA contrast on real rendered text ───────────────────────
  for (const dark of [false, true]) {
    const { ctx, page } = await open(browser, CLIENTS.vipNoPdj, { dark, history: PAST_STAY(CLIENTS.vipNoPdj) });
    const samples = await page.evaluate((fn) => {
      const measure = eval(`(${fn})`);
      const out = [];
      for (const el of document.querySelectorAll("button, h1, h2, span, div, p, b")) {
        const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
        if (!direct) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        out.push({ text: el.textContent.trim().slice(0, 28), ...measure(el) });
      }
      return out;
    }, COMPOSITE);

    const fails = [];
    for (const s of samples) {
      const large = s.size >= 24 || (s.size >= 18.66 && Number(s.weight) >= 700);
      const need = large ? 3 : 4.5;
      // Worst backdrop wins: a gradient must be legible at every stop.
      const got = Math.min(...s.bgs.map((bg) => contrast(s.color, bg)));
      if (got < need) fails.push(`"${s.text}" ${got.toFixed(2)}:1 (needs ${need})`);
    }
    record(`R9-contrast-${dark ? "dark" : "light"}`, "Text meets WCAG AA contrast", fails.length === 0,
      fails.length ? fails.slice(0, 6).join(" | ") : `${samples.length} text nodes checked`);
    await ctx.close();
  }

  // ── R10-R12 · Notes ───────────────────────────────────────────────────
  // These drive the real composer rather than seeding storage: notes are
  // encrypted under a non-extractable key, so there is no way to plant one
  // from the outside — and going through the UI is the stronger test anyway.

  // The activity column is a drawer on this viewport; leaving it open hides the
  // very card R10b is about.
  const closeDrawer = async (page) => {
    const hide = page.locator('[aria-label="Masquer l\'activité"]');
    if (await hide.isVisible().catch(() => false)) {
      await hide.click();
      await page.waitForTimeout(320);
    }
  };

  const openNotesTab = async (page) => {
    const toggle = page.locator('[data-role="activity-toggle"]');
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(260);
    }
    await page.locator('[data-role="side-tab-notes"]').click();
    await page.waitForTimeout(420);   // notes list, in the activity column
  };

  // Notes are written in the activity column by default; ⤢ promotes the same
  // work to the centred panel. Both surfaces carry the same data-roles, so the
  // helper scopes to whichever is on screen.
  const addNote = async (page, toneLabel, title, body) => {
    await page.locator('[data-role="note-new"]').click();
    await page.waitForTimeout(300);
    const dialog = page.locator('[data-role="notes-modal"]');
    const scope = (await dialog.count()) ? dialog : page.locator("aside");
    await scope.getByRole("button", { name: toneLabel, exact: true }).click();
    await scope.locator('[data-role="note-title"]').fill(title);
    if (body) await scope.locator('[data-role="note-body"]').fill(body);
    await scope.locator('[data-role="note-save"]').click();
    await page.waitForTimeout(380);
  };

  // R10 — the regression that started this build. A first-visit guest (no
  // history at all) must still have a route to their notes, and an allergy
  // recorded there must be readable from the card without opening anything.
  {
    const { ctx, page } = await open(browser, CLIENTS.included, { history: null });
    const tabExists = await page.locator('[data-role="side-tab-notes"]').count()
      .catch(() => 0)
      .then(async (n) => {
        if (n > 0) return true;
        // The tab may live inside the collapsed drawer on this viewport.
        const toggle = page.locator('[data-role="activity-toggle"]');
        if (await toggle.isVisible().catch(() => false)) {
          await toggle.click();
          await page.waitForTimeout(260);
          return (await page.locator('[data-role="side-tab-notes"]').count()) > 0;
        }
        return false;
      });
    record("R10a-first-visit-notes-reachable", "A first-visit guest can reach their notes", tabExists,
      tabExists ? "notes tab present" : "NO PATH TO NOTES — an allergy would be unreachable");

    if (tabExists) {
      await openNotesTab(page);
      await addNote(page, "Alerte", "Allergie arachide");
      // Close the drawer so we are looking at the check-in card itself.
      await closeDrawer(page);
      await page.waitForTimeout(380);
      const chip = page.locator('[data-role="pinned-chip"][data-note-tone="alert"]').first();
      const visible = await chip.isVisible().catch(() => false);
      const box = visible ? await chip.boundingBox() : null;
      const onScreen = !!box && box.y >= 0 && box.y + box.height <= page.viewportSize().height;
      record("R10b-alert-on-card", "An alert note surfaces on the check-in card unopened", visible && onScreen,
        visible ? `chip at y=${Math.round(box.y)}` : "alert not surfaced on the card");
    }
    await ctx.close();
  }

  // R11 — the pinned strip.
  //
  // This used to assert a cap of three plus a "+N" badge. The cap is gone: the
  // row scrolls sideways and carries every pinned note, because a counter needs
  // the receptionist to notice it and decide to open a panel, while a scroller
  // only needs a thumb.
  //
  // What the cap was protecting is what this now checks, and it is the part
  // that was never about layout: the first chip — the one on screen before
  // anyone scrolls — must be the alert.
  {
    const { ctx, page } = await open(browser, CLIENTS.included, { history: null });
    await openNotesTab(page);
    for (let i = 0; i < 4; i++) await addNote(page, "Événement", `Événement numéro ${i + 1}`);
    await addNote(page, "Alerte", "Allergie", "Arachides — cuisine prévenue");
    await closeDrawer(page);
    await page.waitForTimeout(380);

    const chips = page.locator('[data-role="pinned-chip"]');
    const n = await chips.count();
    const firstTone = n > 0 ? await chips.nth(0).getAttribute("data-note-tone") : "(none)";
    // Overflow has to be reachable, not merely off-screen: the strip is only
    // honest if it actually scrolls.
    const strip = await page.locator('[data-role="pinned-strip"]').evaluate((el) => ({
      scrollable: el.scrollWidth > el.clientWidth + 1,
      overflowX: getComputedStyle(el).overflowX,
    }));
    record("R11-strip-carries-all", "Every pinned note is on the strip, alert first, overflow reachable",
      n === 5 && firstTone === "alert" && (!strip.scrollable || strip.overflowX === "auto" || strip.overflowX === "scroll"),
      `${n} chips, first=${firstTone}, overflow-x=${strip.overflowX}, scrolls=${strip.scrollable}`);

    // And a chip has to say what the note says, not just that one exists.
    const body = await chips.nth(0).innerText();
    record("R11b-chip-shows-body", "A chip carries the note's text, not only its title",
      /arachides/i.test(body) && /allergie/i.test(body), JSON.stringify(body.replace(/\n/g, " · ").slice(0, 60)));
    await ctx.close();
  }

  // R12 — delete was the easiest control to hit by accident, on a screen where
  // the accident erases an allergy. It must sit away from the thumb AND ask.
  {
    const { ctx, page } = await open(browser, CLIENTS.included, { history: null });
    await openNotesTab(page);
    await addNote(page, "Alerte", "Allergie arachide");
    // The list row, not the pinned chip on the card — both carry the tone.
    await page.locator('[data-role="note-row"][data-note-tone="alert"]').first().click();
    await page.waitForTimeout(280);

    const del = await page.locator('[data-role="note-delete"]').boundingBox();
    const edit = await page.locator('[data-role="note-edit"]').boundingBox();
    // The property is separation, not vertical order. The lateral panel stacked
    // these controls, so "delete sits above the primary action" was the same
    // statement; the centred modal lays them in a row, where the honest measure
    // is how far a mis-tap has to travel. 150px is roughly three fingers.
    const gap = del && edit
      ? Math.hypot((del.x + del.width / 2) - (edit.x + edit.width / 2),
                   (del.y + del.height / 2) - (edit.y + edit.height / 2))
      : 0;
    record("R12a-delete-away-from-primary", "Delete is not adjacent to the primary action", gap >= 150,
      del && edit ? `${Math.round(gap)}px between centres` : "controls not found");

    await page.locator('[data-role="note-delete"]').click();
    await page.waitForTimeout(220);
    const stillThere = await page.locator('[data-role="note-delete-confirm"]').count();
    record("R12b-delete-confirms", "Delete asks before destroying a note", stillThere === 1,
      stillThere === 1 ? "confirmation shown" : "note deleted on a single tap");
    await ctx.close();
  }

  // ── R13 · Handedness ──────────────────────────────────────────────────
  // The control that summons the activity panel has to be on the edge the
  // panel arrives from; reaching across the screen to open something that
  // then appears under the other hand is what prompted this.
  {
    const { ctx, page } = await open(browser, CLIENTS.included, { history: null });
    const sideOf = async () => page.evaluate(() => {
      const btn = document.querySelector('[data-role="activity-toggle"]');
      const aside = document.querySelector("aside");
      if (!btn || !aside) return null;
      const b = btn.getBoundingClientRect();
      const mid = window.innerWidth / 2;
      const asideLeft = getComputedStyle(aside).right === "0px" ? false : true;
      return { btnLeft: b.x + b.width / 2 < mid, asideLeft };
    });

    const before = await sideOf();
    const okBefore = before && before.btnLeft === before.asideLeft;
    await page.locator('[data-role="hand-toggle"]').click();
    await page.waitForTimeout(340);
    const after = await sideOf();
    const okAfter = after && after.btnLeft === after.asideLeft;
    const flipped = before && after && before.btnLeft !== after.btnLeft;

    record("R13-hand-side-matches", "The activity control sits on the side the panel opens from",
      !!(okBefore && okAfter), `before ${before ? (before.btnLeft ? "left" : "right") : "?"}, after ${after ? (after.btnLeft ? "left" : "right") : "?"}`);
    record("R13b-hand-toggle-works", "The side toggle actually moves the controls", !!flipped,
      flipped ? "sides swapped" : "toggle did not move anything");
    await ctx.close();
  }

  // ── R14-R15 · Notes composer + panel width ────────────────────────────
  {
    const { ctx, page } = await open(browser, CLIENTS.included, { history: null });

    // R15 — the panel is wide enough to read a note in, without being asked.
    //
    // It used to have a ⟨⟩ width toggle and this rule proved the toggle worked.
    // The toggle is gone: two controls (narrow/wide, plus open/collapse) were
    // doing one job, and the default was the narrow one — so the common case
    // was a column too tight for the thing it exists to show. The panel is now
    // wide by default and this checks the default, which is what a receptionist
    // actually gets.
    const toggle = page.locator('[data-role="activity-toggle"]');
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(280);
    }
    const w0 = (await page.locator("aside").boundingBox())?.width ?? 0;
    record("R15-panel-readable-width", "The activity panel is readable without being resized",
      w0 >= 296, `${Math.round(w0)}px wide by default`);

    // R15b — back does not move when the activity panel opens. It used to sit
    // inside the main column, so opening the rail pushed it 300px sideways.
    const backOpen = (await page.locator('[data-role="back"]').boundingBox())?.x ?? -1;
    await page.locator('[data-role="side-tab-notes"]').click();
    await page.waitForTimeout(420);
    const backNotes = (await page.locator('[data-role="back"]').boundingBox())?.x ?? -2;
    record("R15b-back-is-fixed", "The back control stays put when the panel opens",
      backOpen >= 0 && Math.abs(backOpen - backNotes) < 2, `x=${Math.round(backOpen)} then ${Math.round(backNotes)}`);

    // R14 — in the composer, writing outranks classifying. Addressed by role,
    // not by label: the wording has changed twice and a renamed button is not
    // a design regression.
    await page.locator('[data-role="note-new"]').click();
    await page.waitForTimeout(280);
    const title = await page.locator('[data-role="note-title"]').boundingBox();
    const body = await page.locator('[data-role="note-body"]').boundingBox();
    const tones = await page.locator('[data-role="note-tone"]').all();
    const toneBoxes = [];
    for (const t of tones) toneBoxes.push(await t.boundingBox());
    const firstTone = toneBoxes.filter(Boolean).sort((a, b) => a.y - b.y)[0];

    // R14a (fields must sit above the tones) is deliberately gone: a slim tab
    // strip on top is a better shape, and the rule encoded one solution rather
    // than the property. R14b and R14c carry the actual invariant.

    const writingArea = (title?.height ?? 0) + (body?.height ?? 0);
    const toneArea = toneBoxes.filter(Boolean).reduce((a, b) => a + b.height, 0);
    record("R14b-fields-dominate", "The writing surface is taller than the tone chooser",
      writingArea > toneArea, `fields ${Math.round(writingArea)}px vs tones ${Math.round(toneArea)}px`);

    // R14c — the tone chooser must not sprawl into a tall stack.
    const rows = new Set(toneBoxes.filter(Boolean).map((b) => Math.round(b.y)));
    record("R14c-tone-rows", "The tone chooser stays within two rows", rows.size <= 2,
      `${rows.size} row(s)`);

    // R14d — Terminé stays on screen (the tablet keyboard is the real risk).
    const save = await page.locator('[data-role="note-save"]').boundingBox();
    const vh = page.viewportSize().height;
    record("R14d-save-reachable", "The composer's save button is within the viewport",
      !!save && save.y >= 0 && save.y + save.height <= vh,
      save ? `bottom=${Math.round(save.y + save.height)}/${vh}` : "not found");
    await ctx.close();
  }

  }
  // ── R16-R18 · Search and report, the two screens the service runs on ──
  // These need a whole seeded morning rather than a single guest, so they get
  // their own opener.

  const shortDay = (off) => {
    const d = new Date();
    d.setDate(d.getDate() + off);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  };
  const DAY_TODAY = shortDay(0), DAY_MINUS1 = shortDay(-1), DAY_MINUS3 = shortDay(-3), DAY_PLUS2 = shortDay(2);

  const DAY_CLIENTS = [
    mk("224", "POLANCO/ANGEL", 2, 1, "BKF INC", { isVip: true, vipLevel: "VIP" }),
    mk("310", "VANDENBERGHE-MONTGOMERY/ALEXANDRINE", 2, 2, "BKF INC"),
    mk("385", "DUPONT/MARIA", 2, 0, ""),
    mk("402", "WEI/CHEN", 2, 2, "BKF COMP"),
    mk("437", "BENALI/OMAR", 2, 0, "BKF INC"),
    mk("501", "FABRE/JULIEN", 2, 0, "BKF INC", { isVip: true, vipLevel: "VIP" }),
    mk("517", "ROSSI/ELENA", 2, 0, "", { isVip: true, vipLevel: "X4", vipSource: "walk_in" }),
    mk("619", "DAVID/JULIE", 1, 0, "BKF INC"),
    mk("718", "LEFÈVRE/CLAIRE", 2, 2, "BKF INC"),
    mk("930", "KOVACS/ISTVAN", 2, 2, "BKF INC"),
    // Two coaches, so the groups panel has something true to show. The fixture
    // has to be able to reproduce the product — the demo seeder could not, and
    // three working features looked broken on the tablet because of it.
    ...["201", "202", "203"].map((r, i) =>
      mk(r, `MEUNIER/GROUPE${i + 1}`, 2, 0, "BKF GRP", { rateCode: "TOMEU", arrivalDate: DAY_MINUS3, departureDate: DAY_TODAY })),
    /* Three rooms, because a block is three or more now (US-39): two rooms on
       one rate is a couple, and counting those as tours is what put ten
       "groups" on a morning with none. */
    ...["301", "302", "303"].map((r, i) =>
      mk(r, `ALPINE/TOUR${i + 1}`, 2, 1, "BKF GRP", { rateCode: "TOALP", arrivalDate: DAY_MINUS1, departureDate: DAY_PLUS2 })),
  ];
  // room, people, hour, minute
  const DAY_ARRIVALS = [
    ["402", 4, 6, 55], ["437", 2, 7, 10], ["224", 3, 7, 40], ["501", 2, 7, 50],
    ["718", 2, 8, 0], ["310", 4, 8, 10], ["517", 2, 8, 40], ["930", 2, 9, 20],
  ];
  // room, before adults/children, after adults/children, delta
  const DAY_ECARTS = [
    ["310", 2, 0, 2, 2, 2],
    ["930", 2, 0, 2, 2, 2],
  ];

  /* `arrivals`/`ecarts` override the standard fixture. A rule about the state
     of the day BEFORE anyone comes down cannot be written against a day that
     already has arrivals in it. */
  async function openDay(path, { dark = false, w = 1194, h = 834, arrivals, ecarts } = {}) {
    const browser = await browserFor();
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: 1,
      colorScheme: dark ? "dark" : "light",
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/upload`, { waitUntil: "load" });
    await page.evaluate(({ clients, arrivals, ecarts, dark }) => {
      const now = new Date();
      const d = now.toISOString().split("T")[0];
      const iso = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
      const byRoom = Object.fromEntries(clients.map((c) => [c.roomNumber, c]));
      localStorage.setItem("dailyData_" + d, JSON.stringify({
        date: d, clients, rawUploadText: "",
        checkIns: arrivals.map(([room, pax, h, m], i) => ({
          id: "ci" + i, roomNumber: room, clientName: byRoom[room].name,
          peopleEntered: pax, timestamp: iso(h, m),
        })),
        discrepancies: ecarts.map(([room, ba, bc, aa, ac, delta], i) => ({
          id: "dx" + i, roomNumber: room, clientName: byRoom[room].name,
          beforeAdults: ba, beforeChildren: bc, afterAdults: aa, afterChildren: ac,
          delta, at: iso(8, 10 + i),
        })),
      }));
      localStorage.setItem("app-dark", dark ? "true" : "false");
    }, {
      clients: DAY_CLIENTS,
      arrivals: arrivals ?? DAY_ARRIVALS,
      ecarts: ecarts ?? DAY_ECARTS,
      dark,
    });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const hydrated = await page.evaluate(() => document.body.innerText.trim().length > 20);
    if (!hydrated) {
      throw new Error(
        `Page did not hydrate at ${BASE}${path} — empty body. Environment fault, not a design-rule ` +
        `failure: rebuild, restart the server, re-run.`
      );
    }
    return { ctx, page };
  }

  // R16 — the search screen. Every rule here is something the user corrected
  // in review, so a regression is a re-litigation, not a nitpick.
  {
    const { ctx, page } = await openDay("/search");
    const rows = () => page.locator('[data-role="room-row"], [data-role="suggestion-card"]').count();

    // R16a — nothing until you type. A list of every room on arrival is noise
    // at 07:00 and it is what the screen used to open with.
    const idle = await rows();
    record("R16a-empty-until-typed", "The results list is empty until you type or filter", idle === 0,
      `${idle} row(s) on an untouched screen`);

    // R16b — a resolved room takes over the clock box, so confirming who is in
    // front of you costs no navigation.
    await page.locator('[data-role="search-field"] input').fill("224");
    await page.waitForTimeout(420);
    const preview = await page.locator('[data-role="guest-preview"]').count();
    const clock = await page.locator('[data-role="service-clock"]').count();
    // The room number is drawn one digit per inline-block, so innerText comes
    // back as "2\n2\n4"; compare on the digits alone.
    const previewText = preview
      ? (await page.locator('[data-role="guest-preview"]').innerText()).replace(/\s+/g, "")
      : "";
    record("R16b-preview-in-clock-box", "A resolved room shows a preview in the clock's place",
      preview === 1 && clock === 0 && previewText.includes("224"),
      preview ? `preview shown, clock ${clock}, text "${previewText.slice(0, 40)}"` : "no preview card");

    // R16c — the CTA is a stepper, and it cannot commit more people than the
    // room still has outstanding. 385 is two adults with nobody checked in yet,
    // so the ceiling is 2 — and the + must refuse a third.
    await page.locator('[data-role="search-field"] input').fill("385");
    await page.waitForTimeout(420);
    const stepper = page.locator('[data-role="search-cta"]');
    const enter = page.locator('[data-role="search-enter"]');
    const before = (await enter.innerText()).match(/\d+/)?.[0];
    const plus = stepper.locator("button").last();
    for (let i = 0; i < 6; i++) {
      if (await plus.isEnabled().catch(() => false)) await plus.click();
    }
    await page.waitForTimeout(220);
    const after = (await enter.innerText()).match(/\d+/)?.[0];
    record("R16c-stepper-bounded", "The stepper cannot commit more people than the room expects",
      Number(after) === 2, `started at ${before}, six taps of + left it at ${after}`);

    // R16e — a room with nobody left outstanding must not offer to enter one
    // more. 224 is fully checked in on this seed.
    await page.locator('[data-role="search-field"] input').fill("224");
    await page.waitForTimeout(420);
    const fullLabel = (await enter.innerText()).trim();
    record("R16e-no-phantom-guest", "A fully-entered room does not offer to enter anyone",
      !/^Entrer/i.test(fullLabel), `CTA reads "${fullLabel}"`);

    // R16d — a real input, or the tablet keyboard never opens and half the
    // French guest list becomes untypeable.
    const field = await page.evaluate(() => {
      const el = document.querySelector('[data-role="search-field"] input');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, readOnly: el.readOnly, h: Math.round(r.height) };
    });
    record("R16d-real-input", "The search field is a real, editable input",
      !!field && field.tag === "INPUT" && !field.readOnly && field.h >= 44,
      field ? `${field.tag} readOnly=${field.readOnly} h=${field.h}` : "not found");
    await ctx.close();
  }

  // R17 — the report. Its whole job is to be believed, so the rules are about
  // figures agreeing with each other rather than about looks.
  {
    const { ctx, page } = await openDay("/report");

    // R17a — the headline percentage is derived, not typed. An earlier build
    // printed 74% beside tiles that implied 75.6%.
    const ring = await page.locator('[data-role="report-ring"]').innerText();
    const shown = Number(ring.match(/(\d+)\s*%/)?.[1]);
    const [entered, expected] = (ring.match(/(\d+)\s*\/\s*(\d+)/) || []).slice(1).map(Number);
    const derived = expected ? Math.min(100, Math.round((entered / expected) * 100)) : 0;
    record("R17a-presence-derived", "The presence figure matches its own arithmetic",
      shown === derived, `shows ${shown}%, ${entered}/${expected} = ${derived}%`);

    // R17b — a metric is a filter. Reading a number and acting on it should be
    // the same gesture.
    const listCount = () => page.locator('[data-role="report-row"]').count();
    const all = await listCount();
    const tile = page.locator('[data-role="report-tile"][data-tile="no"]');
    // The room count, read as a number the tile publishes rather than scraped
    // off its face. The old regex took the LAST digits in the box, which meant
    // "rooms" only until the tile started printing people underneath them.
    const tileValue = Number(await tile.getAttribute("data-rooms"));
    await tile.click();
    await page.waitForTimeout(340);
    const filtered = await listCount();
    record("R17b-tiles-filter", "A metric tile filters the list to exactly its own count",
      filtered === tileValue && filtered < all, `all ${all}, tile says ${tileValue}, list shows ${filtered}`);
    await tile.click();
    await page.waitForTimeout(280);

    // R17c — outcome is never carried by hue alone: red/green is the one pair
    // a colour-blind reader loses.
    const blocks = await page.locator('[data-role="treemap-block"]').all();
    const shapes = [];
    for (const b of blocks) {
      shapes.push({
        svg: await b.locator("svg").count(),
        pct: /%/.test(await b.innerText()),
      });
    }
    record("R17c-not-colour-alone", "Every outcome block carries a glyph and a percentage",
      shapes.length === 3 && shapes.every((s) => s.svg > 0 && s.pct),
      shapes.map((s, i) => `#${i}:${s.svg}svg/${s.pct ? "%" : "no%"}`).join(" "));

    // R17d — the granularity control actually re-buckets the morning.
    const bars = () => page.locator('[data-role="affluence-bar"]').count();
    const at15 = await bars();
    await page.locator('[data-role="affluence-grain"] button', { hasText: "5 min" }).first().click();
    await page.waitForTimeout(360);
    const at5 = await bars();
    record("R17d-grain-rebuckets", "Changing the interval re-buckets the affluence chart",
      at5 > at15 * 2, `15 min → ${at15} bars, 5 min → ${at5} bars`);

    // R17e — the reception error count is the figure the user asked for, and it
    // has to survive the round trip from the check-in screen to this tile.
    //
    // The row is ordered by what the day contains now, so a quiet écart count
    // can sit in the funnel instead of the visible five. That is the design —
    // membership never changes, only order — so the rule looks in the funnel
    // rather than assuming a fixed position. It still fails if the metric is
    // unreachable, which is the property that matters.
    let ecartTile = page.locator('[data-role="report-tile"][data-tile="ecart"]');
    if ((await ecartTile.count()) === 0) {
      await page.locator('[data-role="report-filter-more"]').click();
      await page.waitForTimeout(300);
      ecartTile = page.locator('[data-role="report-filter-option"][data-tile="ecart"]');
    }
    const ecartText = await ecartTile.innerText();
    const ecartRooms = Number(ecartText.match(/(\d+)/)?.[1] ?? NaN);
    await ecartTile.click();
    await page.waitForTimeout(340);
    const ecartRowsShown = await listCount();
    record("R17e-ecarts-tracked", "Reception count errors are counted and filterable",
      ecartRooms === DAY_ECARTS.length && ecartRowsShown === DAY_ECARTS.length,
      `tile ${ecartRooms}, list ${ecartRowsShown}, seeded ${DAY_ECARTS.length}`);
    // Clear the filter from the row: picking it out of the funnel closes the
    // sheet, so that locator is gone, and the active filter is always promoted
    // into the visible row anyway.
    await page.locator('[data-role="report-tile"][data-tile="ecart"]').click();
    await page.waitForTimeout(240);

    // R17f — the page must not scroll sideways on the tablet it lives on.
    const overflow = await page.evaluate(() => ({
      sw: document.scrollingElement.scrollWidth,
      cw: document.scrollingElement.clientWidth,
    }));
    record("R17f-no-overflow", "The report does not scroll horizontally at 1194x834",
      overflow.sw <= overflow.cw + 1, `${overflow.sw}/${overflow.cw}`);
    await ctx.close();
  }

  // R19 — nothing clips, at any screen the app is actually opened on. A
  // laptop at 100% zoom cut the room number out of the preview card, and the
  // report's right column ran off the edge; "that can't happen" only holds if
  // something checks it on every run.
  for (const [label, w, h] of [
    ["laptop", 1280, 720],
    ["macbook", 1440, 810],
    ["ipad-landscape", 1194, 834],
    ["ipad-safari-chrome", 1194, 640],   // browser UI eating the top
    // Browser zoom is just a smaller viewport in CSS pixels. 125% and 150% on
    // a landscape iPad land here, and pinch-zooming to read is the first thing
    // anyone does on a screen full of small numbers.
    ["zoom-125", 955, 667],
    ["zoom-150", 796, 556],
  ]) {
    for (const path of ["/search", "/report"]) {
      const { ctx, page } = await openDay(path, { w, h });
      if (path === "/search") {
        await page.locator('[data-role="search-field"] input').fill("224");
        await page.waitForTimeout(420);
      }
      const m = await page.evaluate(() => {
        const se = document.scrollingElement;
        const out = {
          hOverflow: se.scrollWidth > se.clientWidth + 1,
          sw: se.scrollWidth, cw: se.clientWidth,
          clipped: [],
        };
        // Anything whose own content overflows its box, among the elements we
        // care about being readable.
        const roles = ["guest-preview", "report-treemap", "report-ring", "search-cta", "preview-carousel"];
        for (const role of roles) {
          for (const el of document.querySelectorAll(`[data-role="${role}"]`)) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            // Below the fold inside a scroller is reachable, not clipped. The
            // rule is that nothing becomes UNREACHABLE — a panel you scroll to
            // is a different thing from a panel sliced by the window edge, and
            // conflating them forces the layout to crush a chart rather than
            // let the column scroll. Reachability of the primary CTA is a
            // separate and stricter promise; that is R1.
            const inScroller = (() => {
              for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                const oy = getComputedStyle(p).overflowY;
                if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 2) return true;
              }
              return false;
            })();
            const offBottom = r.bottom > window.innerHeight + 1 && !inScroller;
            const offRight = r.right > window.innerWidth + 1;
            const selfClipped = el.scrollHeight > el.clientHeight + 2;
            if (offBottom || offRight || selfClipped) {
              out.clipped.push(`${role}${offBottom ? " below-fold" : ""}${offRight ? " off-right" : ""}${selfClipped ? " content-cut" : ""}`);
            }
          }
        }
        return out;
      });
      record(`R19-${label}-${path.slice(1)}`, "Nothing clips at this viewport",
        !m.hOverflow && m.clipped.length === 0,
        m.hOverflow ? `h-overflow ${m.sw}/${m.cw}` : m.clipped.length ? m.clipped.join(" | ") : "clean");
      await ctx.close();
    }
  }

  // R18 — contrast on the two new screens, in both themes. Three separate
  // regressions on this project were dark-on-dark text that every other check
  // was blind to.
  for (const path of ["/search", "/report"]) {
    for (const dark of [false, true]) {
      const { ctx, page } = await openDay(path, { dark });
      const samples = await page.evaluate((fn) => {
        const measure = eval(`(${fn})`);
        const out = [];
        for (const el of document.querySelectorAll("button, h1, h2, span, div, p, b, em, input")) {
          const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
          if (!direct) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.opacity === "0") continue;
          out.push({ text: el.textContent.trim().slice(0, 28), ...measure(el) });
        }
        return out;
      }, COMPOSITE);

      const fails = [];
      for (const s of samples) {
        const large = s.size >= 24 || (s.size >= 18.66 && Number(s.weight) >= 700);
        const need = large ? 3 : 4.5;
        const got = Math.min(...s.bgs.map((bg) => contrast(s.color, bg)));
        if (got < need) fails.push(`"${s.text}" ${got.toFixed(2)}:1 (needs ${need})`);
      }
      record(`R18-contrast-${path.slice(1)}-${dark ? "dark" : "light"}`,
        "Text meets WCAG AA contrast", fails.length === 0,
        fails.length ? fails.slice(0, 6).join(" | ") : `${samples.length} text nodes checked`);
      await ctx.close();
    }
  }

  // R20 — the spacing and radius scale is a rule, not a suggestion.
  //
  // Tokens written in a stylesheet that nothing enforces are a suggestion, and a
  // suggestion loses every time someone is in a hurry. This reads the RENDERED
  // page and fails on any padding, gap or corner that is off the scale — which
  // is the only version of a design system that survives contact with a
  // deadline.
  //
  // The scale: 4pt above 8px, with 2 and 6 allowed below it for optical
  // alignment inside a component (an icon next to a label). What this outlaws is
  // the drift that actually shows — the 10px that should be 8 or 12, the 14px
  // that should be 12 or 16, the 13px corner sitting next to a 14px one.
  const SPACING_OK = [0, 2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80];
  const RADIUS_OK = [0, 8, 12, 14, 16, 18, 20, 24];
  for (const path of ["/search", "/report"]) {
    const { ctx, page } = await openDay(path);
    const off = await page.evaluate(({ SPACING_OK, RADIUS_OK }) => {
      const sp = new Set(SPACING_OK), rd = new Set(RADIUS_OK);
      const px = (v) => Math.round(parseFloat(v) || 0);
      const bad = new Map();
      const name = (el) =>
        el.dataset.role ||
        `${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`;
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest("svg")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        const hits = [];
        for (const p of ["rowGap", "columnGap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
          const v = px(cs[p]);
          if (cs[p] !== "normal" && !sp.has(v)) hits.push(`${p}:${v}`);
        }
        for (const p of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"]) {
          const v = px(cs[p]);
          // A pill is a shape, not a size — anything from 40px up is one.
          if (v < 40 && !rd.has(v)) hits.push(`radius:${v}`);
        }
        if (hits.length) {
          const k = `${name(el)} ${[...new Set(hits)].join(",")}`;
          bad.set(k, (bad.get(k) || 0) + 1);
        }
      }
      return [...bad.entries()].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
    }, { SPACING_OK, RADIUS_OK });
    record(`R20-scale-${path.slice(1)}`, "Every gap, padding and corner is on the scale",
      off.length === 0, off.length ? off.slice(0, 8).join(" | ") : "on scale");
    await ctx.close();
  }

  // R21 — the input surfaces belong to the app.
  //
  // All three of these were reported from a real iPad in the same breath: the
  // pad felt unresponsive, ABC raised the system keyboard over half the screen,
  // and the swipe did nothing. Each one is now a check.
  {
    const { ctx, page } = await openDay("/search");
    const field = page.locator('[data-role="search-field"] input');

    // a — a press on the pad enters a digit. The pad fires on pointerdown to
    // skip iOS's click delay, which is exactly the kind of change that silently
    // stops working.
    await page.locator('[data-role="numeric-keypad"] button', { hasText: /^2$/ }).first().click();
    await page.locator('[data-role="numeric-keypad"] button', { hasText: /^2$/ }).first().click();
    await page.locator('[data-role="numeric-keypad"] button', { hasText: /^4$/ }).first().click();
    const typed = await field.inputValue();
    record("R21a-pad-enters-digits", "Pressing the pad enters digits", typed === "224", `field reads "${typed}"`);

    // b — ABC swaps in the app's own letters instead of asking iOS for a
    // keyboard. inputMode=none is what keeps the system one down.
    await page.locator('[data-role="pad-abc"]').click();
    await page.waitForTimeout(200);
    const alpha = await page.locator('[data-role="alpha-keypad"]').isVisible();
    const im = await field.getAttribute("inputmode");
    record("R21b-letters-in-app", "ABC opens the app's letter pad, not the system keyboard",
      alpha && im === "none", `alpha pad ${alpha ? "shown" : "MISSING"}, inputmode=${im}`);

    // c — and those letters reach the field.
    await page.locator('[data-role="alpha-keypad"] button', { hasText: /^L$/ }).first().click();
    await page.locator('[data-role="alpha-keypad"] button', { hasText: /^E$/ }).first().click();
    const letters = await field.inputValue();
    record("R21c-letters-type", "The letter pad types into the field", letters === "le", `field reads "${letters}"`);
    await ctx.close();
  }

  // d — the letter pad has to fit the same slot as the digits, including on the
  // short iPad viewport where Safari's own chrome eats the bottom.
  for (const [label, w, h] of [["ipad-landscape", 1194, 834], ["ipad-safari-chrome", 1194, 640]]) {
    const { ctx, page } = await openDay("/search", { w, h });
    await page.locator('[data-role="pad-abc"]').click();
    await page.waitForTimeout(250);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[data-role="alpha-keypad"], [data-role="alpha-keypad"] button, [data-role="search-cta"] button')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > window.innerHeight + 1) out.push(`${el.textContent?.trim().slice(0, 8) || el.dataset.role} below fold`);
        if (r.height > 0 && r.height < 34) out.push(`${el.textContent?.trim().slice(0, 8)} only ${Math.round(r.height)}px tall`);
      }
      return [...new Set(out)];
    });
    record(`R21d-${label}-letters-fit`, "The letter pad fits, with usable targets",
      bad.length === 0, bad.length ? bad.slice(0, 4).join(" | ") : "fits");
    await ctx.close();
  }

  // R22 — the preview card never eats its own contents.
  //
  // Flex children shrink by default. In a fixed-height card that meant the
  // guest's name was squeezed below its own line box, its glyphs spilled out of
  // a container crushed to nothing, and the allergy chip underneath was drawn
  // straight through them: "Lambert Théo" cut in half by "Nuts allergy".
  //
  // Two things are asserted, at the tall viewport and the short one. The name
  // occupies at least its own line box, and the alert chip sits fully inside
  // the card. An allergy clipped in half is the exact failure this card exists
  // to prevent, so it is checked rather than trusted.
  for (const [label, w, h] of [["ipad-landscape", 1194, 834], ["ipad-safari-chrome", 1194, 640]]) {
    const { ctx, page } = await openDay("/checkin/224", { w, h });
    const tog = page.locator('[data-role="activity-toggle"]');
    if (await tog.isVisible().catch(() => false)) { await tog.click(); await page.waitForTimeout(300); }
    await page.locator('[data-role="side-tab-notes"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-role="note-new"]').click();
    await page.waitForTimeout(300);
    const dlg = page.locator('[data-role="notes-modal"]');
    const scope = (await dlg.count()) ? dlg : page.locator("aside");
    await scope.getByRole("button", { name: "Alerte", exact: true }).click();
    await scope.locator('[data-role="note-title"]').fill("Allergie arachides");
    await scope.locator('[data-role="note-save"]').click();
    await page.waitForTimeout(500);

    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    for (const k of ["2", "2", "4"]) {
      await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${k}$`) }).first().click();
    }
    await page.waitForTimeout(900);

    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-role="guest-preview"]');
      const name = document.querySelector('[data-role="preview-name"]');
      const note = document.querySelector('[data-role="preview-note"]');
      if (!card || !name) return { fail: "card or name missing" };
      if (!note) return { fail: "the alert never reached the card" };
      const cb = card.getBoundingClientRect();
      const nb = note.getBoundingClientRect();
      const squeezed = name.scrollHeight > name.clientHeight + 1;
      const spill = Math.round(nb.bottom - cb.bottom);
      return { squeezed, spill, fail: null };
    });

    record(`R22-${label}-card-holds-its-content`,
      "The name is not squeezed and the alert is not clipped",
      !m.fail && !m.squeezed && m.spill <= 0,
      m.fail ? m.fail : `name squeezed=${m.squeezed}, alert spill=${m.spill}px`);
    await ctx.close();
  }

  // R23 — the four checklist items nothing was asserting.
  //
  // Written after a tablet session where three working features read as broken
  // because the fixture could not show them. These are the remaining lines of
  // the acceptance list that a browser can settle, so they stop costing a
  // human pass.
  {
    // a — the idle carousel actually rotates, and a swipe moves it.
    const { ctx, page } = await openDay("/search");
    const first = await page.locator('[data-role="preview-carousel"]').getAttribute("data-pane");
    await page.locator('[data-role="preview-dots"] button').nth(1).click();
    await page.waitForTimeout(350);
    const second = await page.locator('[data-role="preview-carousel"]').getAttribute("data-pane");
    record("R23a-carousel-turns", "The preview slot changes face when asked",
      !!first && !!second && first !== second, `${first} → ${second}`);

    // b — the groups panel says something true about the day.
    await page.goto(`${BASE}/report`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const groups = await page.evaluate(() => {
      const p = document.querySelector('[data-role="report-groups"]');
      if (!p) return { blocks: 0, depart: false };
      return {
        blocks: p.querySelectorAll('[data-role="report-group-row"]').length,
        depart: /DÉPART/i.test(p.textContent || ""),
      };
    });
    record("R23b-groups-panel", "The report shows real blocks and flags a departure",
      groups.blocks >= 2 && groups.depart, `${groups.blocks} blocks, départ badge=${groups.depart}`);
    await ctx.close();
  }

  // c — the VIP points swap exists where it should, and takes over from the
  // payment grid when it is on.
  {
    const { ctx, page } = await openDay("/checkin/517");
    const swap = page.locator('[data-role="points-swap"]');
    const shown = await swap.isVisible().catch(() => false);
    let hidPay = false;
    if (shown) {
      await swap.click();
      await page.waitForTimeout(350);
      hidPay = (await page.getByRole("button", { name: "Carte", exact: true }).count()) === 0;
    }
    record("R23c-points-swap", "A VIP without breakfast can swap points, and the grid steps aside",
      shown && hidPay, `switch=${shown}, payment grid hidden=${hidPay}`);
    await ctx.close();
  }

  // d — "Tout" means everything. This is the gap US-7 named: nothing asserted
  // that the tab which reads as the whole picture contains the notes, which is
  // exactly how it came to omit them.
  {
    const { ctx, page } = await openDay("/checkin/224");
    const tog = page.locator('[data-role="activity-toggle"]');
    if (await tog.isVisible().catch(() => false)) { await tog.click(); await page.waitForTimeout(300); }
    await page.locator('[data-role="side-tab-notes"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-role="note-new"]').click();
    await page.waitForTimeout(300);
    const dlg = page.locator('[data-role="notes-modal"]');
    const scope = (await dlg.count()) ? dlg : page.locator("aside");
    await scope.getByRole("button", { name: "Alerte", exact: true }).click();
    await scope.locator('[data-role="note-title"]').fill("Allergie arachides");
    await scope.locator('[data-role="note-save"]').click();
    await page.waitForTimeout(600);
    await page.locator('[data-role="side-tab-all"]').click();
    await page.waitForTimeout(500);
    const digest = await page.locator('[data-role="digest-note"]').count();
    record("R23d-tout-has-notes", "The Tout tab carries the notes, not only the visits",
      digest > 0, `${digest} note(s) in Tout`);
    await ctx.close();
  }

  // R24 — every card has an edge, in both themes.
  //
  // The preview card shipped with no light-theme fill at all: a 7% white
  // gradient on a cream page, invisible for weeks. Contrast rules check text
  // against its background; nothing checked whether a surface could be told
  // from the page it sits on.
  for (const dark of [false, true]) {
    const { ctx, page } = await openDay("/search", { dark });
    await page.locator('[data-role="numeric-keypad"] button', { hasText: /^2$/ }).first().click();
    await page.locator('[data-role="numeric-keypad"] button', { hasText: /^2$/ }).first().click();
    await page.locator('[data-role="numeric-keypad"] button', { hasText: /^4$/ }).first().click();
    await page.waitForTimeout(700);
    const flat = await page.evaluate((COMPOSITE) => {
      const measure = eval(`(${COMPOSITE})`);
      const out = [];
      // The KEY, not the pad's wrapper. When the keys were flat tiles inside a
      // glass box, the box was the card and the rule watched it. The keys are
      // the cards now — cut and raised, twelve of them — and the wrapper is
      // padding. Watching a wrapper proves nothing about what you touch.
      //
      // This is a rule being re-aimed, not relaxed: it went from one surface to
      // a real one, and it would still catch a pad whose keys vanished into the
      // page, which is the failure it was written for.
      for (const sel of ['[data-role="guest-preview"]', '[data-role="search-field"]', '[data-role="numeric-keypad"] button']) {
        const el = document.querySelector(sel);
        if (!el) { out.push(`${sel} MISSING`); continue; }
        const cs = getComputedStyle(el);
        const own = measure(el).bgs?.[0];
        const parentBg = measure(el.parentElement).bgs?.[0];
        const hasRing = cs.boxShadow !== "none" || cs.borderTopWidth !== "0px";
        // Either it paints differently from what is behind it, or it draws a
        // ring. A card that does neither is not a card.
        const differs = own && parentBg && own.some((c, i) => Math.abs(c - parentBg[i]) > 3);
        if (!differs && !hasRing) out.push(sel);
      }
      return out;
    }, COMPOSITE);
    record(`R24-card-edges-${dark ? "dark" : "light"}`, "Every card can be told from the page behind it",
      flat.length === 0, flat.length ? flat.join(" | ") : "all surfaces distinct");
    await ctx.close();
  }

  // ── R25 · portrait ──────────────────────────────────────────────────────
  //
  // Portrait is a different shell over the same state, so it needs its own
  // rules rather than inheriting landscape's. Three things are load-bearing:
  // the dock never moves, the card and the list take turns, and the drawer
  // leaves the screen behind visible.
  const PORTRAITS = [["se", 320, 568], ["phone", 390, 844], ["ipad", 834, 1194]];

  // R25a — the pad and the commit button are on screen, and scrolling the
  // results does not take them away. Fixed, not hide-on-scroll: the moment you
  // scroll the list is the moment you are deciding.
  for (const [label, w, h] of PORTRAITS) {
    const { ctx, page } = await openDay("/search", { w, h });
    const shell = await page.locator('[data-role="portrait-shell"]').count();
    const before = await page.locator('[data-role="portrait-dock"]').boundingBox();
    // Fill the slot with a list long enough to scroll, then scroll it.
    await page.locator('[data-role="numeric-keypad"] button', { hasText: /^2$/ }).first().click();
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const after = await page.locator('[data-role="portrait-dock"]').boundingBox();
    const enter = await page.locator('[data-role="search-enter"]').boundingBox();
    const onScreen = !!after && after.y >= 0 && after.y + after.height <= h + 1;
    const held = !!before && !!after && Math.abs(before.y - after.y) < 1;
    record(`R25a-${label}-dock-fixed`, "The pad and the commit button never leave the screen",
      shell === 1 && onScreen && held && !!enter,
      shell !== 1 ? "portrait shell did not render" :
      !onScreen ? `dock at y=${after?.y} h=${after?.height} in ${h}px` :
      !held ? `dock moved ${Math.abs(before.y - after.y).toFixed(1)}px on scroll` : "fixed");
    await ctx.close();
  }

  // R25f — the slot's content stays inside the slot.
  //
  // R25a passed on a 320x568 screen where the guest card overflowed its slot by
  // 36px and painted straight over the commit button: measuring the dock's own
  // box proves the dock is where it should be, and nothing at all about what is
  // on top of it. A rule that can be satisfied by a broken screen is not a rule.
  for (const [label, w, h] of PORTRAITS) {
    const { ctx, page } = await openDay("/search", { w, h });
    for (const d of [3, 1, 0]) {
      await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(500);
    const card = await page.locator('[data-role="guest-preview"]').boundingBox();
    const dock = await page.locator('[data-role="portrait-dock"]').boundingBox();
    const clear = !!card && !!dock && card.y + card.height <= dock.y + 1;
    record(`R25f-${label}-no-overlap`, "The guest card never paints over the commit button",
      clear,
      clear ? "clear" : `card ends ${card ? (card.y + card.height).toFixed(0) : "?"}, dock starts ${dock?.y.toFixed(0)}`);
    await ctx.close();
  }

  // R25h — the card is the guest, and a swipe is not a tap.
  //
  // Two halves of one thing. The resolved card looked exactly like something
  // you touch and did nothing, so every finger tried it and nothing happened.
  // And the moment it did answer, the browser's habit of firing `click` after
  // any touch meant a swipe across the frame opened a guest screen nobody
  // asked for — mid-service, with a queue.
  {
    const { ctx, page } = await openDay("/search", { w: 834, h: 1194 });
    const type = async (...digits) => {
      for (const d of digits) {
        await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
        await page.waitForTimeout(220);
      }
    };
    await type(3, 1, 0);
    await page.waitForTimeout(500);

    // A drag across the card must NOT navigate.
    const box = await page.locator('[data-role="preview-open"]').boundingBox();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const afterSwipe = new URL(page.url()).pathname;

    /* Back to the first face before tapping. The rule used to tap straight
       after the swipe, which worked only while the card had one face: the
       moment it gained Notes (US-17), the swipe did its job and landed on a
       face with nothing to open, and the rule timed out looking for a target
       the app was right not to be showing. The assumption expired; the two
       things being asserted did not. */
    await page.locator('[data-role="preview-dots"] button').first().click();
    await page.waitForTimeout(400);

    // A tap must.
    await page.locator('[data-role="preview-open"]').click();
    await page.waitForTimeout(800);
    const afterTap = new URL(page.url()).pathname;

    record("R25h-card-opens-guest", "Tapping the guest card opens them; swiping across it does not",
      afterSwipe === "/search" && afterTap.startsWith("/checkin/"),
      `swipe→${afterSwipe} tap→${afterTap}`);
    await ctx.close();
  }

  // R25g — nothing floats over the dock.
  //
  // The install banner was pinned to the bottom of the viewport and landed
  // squarely on the keypad: on an iPad in portrait it covered the entire last
  // row, so the one screen that tells you to install the app is the screen
  // where the app stops working. The dock's band belongs to the dock.
  {
    const { ctx, page } = await openDay("/search", { w: 834, h: 1194 });
    const intruders = await page.evaluate(() => {
      const dock = document.querySelector('[data-role="portrait-dock"]');
      if (!dock) return ["NO DOCK"];
      const d = dock.getBoundingClientRect();
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (getComputedStyle(el).position !== "fixed") continue;
        if (dock.contains(el) || el.contains(dock)) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.bottom > d.top + 2 && r.top < d.bottom - 2 && r.right > d.left && r.left < d.right) {
          out.push(el.getAttribute("data-role") || el.tagName.toLowerCase());
        }
      }
      return out;
    });
    record("R25g-dock-unobstructed", "Nothing floats over the pad or the commit button",
      intruders.length === 0, intruders.length ? intruders.join(", ") : "clear");
    await ctx.close();
  }

  // R25b — Option B. The card and the list take turns and are never both on
  // screen: on 320px, keeping both is what shrinks the card until the allergy
  // chip has nowhere to go.
  {
    const { ctx, page } = await openDay("/search", { w: 390, h: 844 });
    const slot = () => page.locator('[data-role="portrait-slot"]').getAttribute("data-slot");
    const tap = async (d) => {
      await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
      await page.waitForTimeout(250);
    };
    /* The resting frame ships OFF (US-35) — at rest reception is looking at
       the pad. Turn it on before asserting it takes the slot: what this rule
       protects is the card and the list never SHARING the slot, and that is
       hardest to hold when the frame is present. */
    await page.locator('[data-role="portrait-menu"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-role="drawer-preview"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-role="nav-drawer"] [aria-label="Fermer le menu"]').click();
    await page.waitForTimeout(400);
    const idle = await slot();
    const idleCarousel = await page.locator('[data-role="preview-carousel"]').count();

    await tap(3); await tap(8);
    const listing = await slot();
    const listHasCarousel = await page.locator('[data-role="preview-carousel"]').count();

    await tap(5);
    await page.waitForTimeout(450);
    const carded = await slot();
    const cardHasRows = await page.locator('[data-role="suggestion-card"], [data-role="room-row"]').count();
    const preview = await page.locator('[data-role="guest-preview"]').count();

    record("R25b-slot-takes-turns", "The card and the results list never share the slot",
      idle === "idle" && idleCarousel === 1 &&
      listing === "list" && listHasCarousel === 0 &&
      carded === "card" && cardHasRows === 0 && preview === 1,
      `idle=${idle}/${idleCarousel} typing=${listing}/${listHasCarousel} resolved=${carded}/${cardHasRows}/${preview}`);
    await ctx.close();
  }

  // R25c — the drawer is a drawer. It carries the four landscape controls with
  // the same words, and it leaves the screen behind visible, which is the
  // whole reason it is not a page.
  {
    const { ctx, page } = await openDay("/search", { w: 390, h: 844 });
    await page.locator('[data-role="portrait-menu"]').click();
    await page.waitForTimeout(400);
    const panel = page.locator('[data-role="nav-drawer-panel"]');
    const box = await panel.boundingBox();
    const blurred = await panel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return (cs.backdropFilter || cs.webkitBackdropFilter || "none") !== "none";
    });
    const controls = [];
    for (const role of ["drawer-recents", "drawer-report", "drawer-hand", "drawer-close-day"]) {
      if ((await page.locator(`[data-role="${role}"]`).count()) !== 1) controls.push(role);
    }
    const leavesRoom = !!box && box.width < 390 * 0.92;
    record("R25c-drawer", "The burger opens a drawer that keeps the screen behind it",
      controls.length === 0 && leavesRoom && blurred,
      controls.length ? `missing ${controls.join(",")}` :
      !leavesRoom ? `panel ${box?.width}px of 390` : blurred ? "ok" : "no backdrop-filter");
    await ctx.close();
  }

  // R25d — the dots are the guarantee, with or without the gesture.
  //
  // This used to turn Balayage off in the drawer first. Reception asked for that
  // switch to go — "we don't need it" — and US-23's promise survives without it,
  // because it never rested on the toggle: every face of the carousel is also on
  // a dot, so the swipe has always been a shortcut rather than the only way
  // through. The rule asserts the thing that matters and no longer asserts the
  // control that carried it.
  {
    const { ctx, page } = await openDay("/search", { w: 390, h: 844 });
    await page.locator('[data-role="portrait-menu"]').click();
    await page.waitForTimeout(350);
    // The frame is off by default now (US-35); this rule is about its dots.
    await page.locator('[data-role="drawer-preview"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-role="nav-drawer"] [aria-label="Fermer le menu"]').click();
    await page.waitForTimeout(400);
    const carousel = page.locator('[data-role="preview-carousel"]');
    const flag = await carousel.getAttribute("data-swipe");
    const first = await carousel.getAttribute("data-pane");
    const dots = page.locator('[data-role="preview-dots"] button');
    const n = await dots.count();
    await dots.nth(n - 1).click();
    await page.waitForTimeout(350);
    const moved = await carousel.getAttribute("data-pane");
    record("R25d-dots-reach-every-face", "Every face of the carousel is reachable without the gesture",
      n > 1 && moved !== first && moved !== null,
      `dots=${n} ${first}→${moved} (carousel swipe=${flag})`);
    await ctx.close();
  }

  // R25e — nothing spills sideways, and switching alphabet does not move the
  // button underneath the thumb.
  for (const [label, w, h] of PORTRAITS) {
    const { ctx, page } = await openDay("/search", { w, h });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const numY = (await page.locator('[data-role="search-enter"]').boundingBox())?.y;
    await page.locator('[data-role="pad-abc"]').click();
    await page.waitForTimeout(450);
    const abc = await page.locator('[data-role="alpha-keypad"]').count();
    const abcY = (await page.locator('[data-role="search-enter"]').boundingBox())?.y;
    const stayed = numY !== undefined && abcY !== undefined && Math.abs(numY - abcY) < 1;
    record(`R25e-${label}-no-spill`, "The page never scrolls sideways and the pads share one box",
      wide <= 1 && abc === 1 && stayed,
      wide > 1 ? `${wide}px of horizontal overflow` :
      abc !== 1 ? "letter pad missing" :
      stayed ? "steady" : `commit moved ${Math.abs(numY - abcY).toFixed(1)}px`);
    await ctx.close();
  }

  // ── R26 · the report's list, and the pad under it ───────────────────────
  //
  // Three rules for three things Angel found on the tablet and no unit test
  // could see: a pad walking off the bottom of the screen, a list you could
  // not open, and a group filter that could only mean "all the coaches".

  // R26a — the pad is inside the screen, keys and all.
  //
  // Not a rule about the pad's own box: the box can be where it belongs while
  // the last row of keys hangs below the fold, which is exactly what a taller
  // key inside a shorter container does. The last key is what gets measured.
  for (const [label, w, h] of [...PORTRAITS, ["landscape", 1194, 834]]) {
    const { ctx, page } = await openDay("/report", { w, h });
    await page.locator('[data-role="report-search"]').first().click();
    await page.waitForTimeout(500);
    const pad = await page.locator('[data-role="report-pad"]').boundingBox();
    const key = await page.locator('[data-role="numeric-keypad"] button, [data-role="alpha-keypad"] button').last().boundingBox();
    const inside = !!pad && !!key && pad.y + pad.height <= h + 1 && key.y + key.height <= h + 1;
    record(`R26a-${label}-report-pad-fits`, "The report's pad and its last key stay on the screen",
      inside,
      inside ? "inside" : `pad ends ${pad ? (pad.y + pad.height).toFixed(0) : "?"}, last key ends ${key ? (key.y + key.height).toFixed(0) : "?"} of ${h}`);
    await ctx.close();
  }

  // R26b — the list opens full screen, and the pad does not stand on it.
  //
  // The panel is a corner of a dashboard; "who came at 8?" is read off the
  // list. Expanded it keeps the search field and the filters — and the pad
  // joins the sheet's own column, because floating it over the top left the
  // guest rows showing through the gaps between the keys, unreadable and
  // untappable in one move.
  for (const [label, w, h] of [["phone", 390, 844], ["ipad", 834, 1194]]) {
    const { ctx, page } = await openDay("/report", { w, h });
    await page.locator('[data-role="report-search"]').first().click();
    await page.waitForTimeout(400);
    await page.locator('[data-role="report-list-expand"]').click();
    await page.waitForTimeout(450);
    const sheet = page.locator('[data-role="report-list-sheet"]');
    const rows = await sheet.locator('[data-role="report-row"]').count();
    const field = await sheet.locator('[data-role="report-search"]').count();
    const list = await sheet.locator('[data-role="report-list"]').boundingBox();
    const pad = await sheet.locator('[data-role="report-pad"]').boundingBox();
    const clear = !!list && !!pad && list.y + list.height <= pad.y + 1 && pad.y + pad.height <= h + 1;
    record(`R26b-${label}-report-list-expands`, "The arrival list opens full screen with its search, and the pad never covers it",
      rows > 0 && field === 1 && clear,
      rows === 0 ? "no rows in the sheet" :
      field !== 1 ? "no search field in the sheet" :
      clear ? `${rows} rows` : `list ends ${list ? (list.y + list.height).toFixed(0) : "?"}, pad starts ${pad?.y.toFixed(0)}`);
    await ctx.close();
  }

  // R32 — the way out never moves.
  //
  // Handedness reverses the top row so the burger falls under the thumb that is
  // free. It took the back button with it, and a control whose whole job is
  // "get me out of here" is the one that cannot change corner: you do not hunt
  // for an exit. Same x, same size, same glyph, whichever hand is set.
  {
    const { ctx, page } = await openDay("/search", { w: 834, h: 1194 });
    const box = async () => {
      const b = await page.locator('[data-role="portrait-back"]').boundingBox();
      return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
    };
    const left = await box();
    await page.locator('[data-role="portrait-menu"]').click();
    await page.waitForTimeout(350);
    await page.locator('[data-role="drawer-hand"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-role="nav-drawer"] [aria-label="Fermer le menu"]').click().catch(() => {});
    await page.waitForTimeout(500);
    const right = await box();
    const same = !!left && !!right &&
      left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h;
    record("R32-back-never-moves", "The back button is in the same place for either hand",
      same,
      !left || !right ? "back button missing in one of the two states"
        : same ? `x=${left.x} y=${left.y} ${left.w}x${left.h} in both`
        : `left-hand ${JSON.stringify(left)} vs right-hand ${JSON.stringify(right)}`);
    await ctx.close();
  }

  // R35 — Récents is one panel, not one per shell.
  //
  // Portrait has always had the activity list in the drawer, beside the day and
  // one tap from the guest. Landscape had a button that opened something else —
  // first a separate list built off the raw check-ins, then a full-screen sheet.
  // Reception asked for "the same activité list" on the tablet lying down.
  //
  // Same component, so the rows cannot drift; without the four service tiles,
  // which landscape already carries in its top row.
  {
    const { ctx, page } = await openDay("/search");
    await page.locator('[data-role="hand-toggle"]').waitFor({ timeout: 5000 }).catch(() => {});
    await page.locator("button", { hasText: /Récents/i }).first().click().catch(() => {});
    await page.waitForTimeout(600);

    const drawer = await page.locator('[data-role="nav-drawer"]').count();
    const rows = await page.locator('[data-role="drawer-recents"] > *').count();
    const tiles = await page.locator('[data-role="drawer-tiles"]').count();
    record("R35-landscape-activity-drawer",
      "Récents opens the same activity drawer the portrait shell uses",
      drawer === 1 && rows > 0 && tiles === 0,
      `drawer=${drawer}, rows=${rows}, duplicate tiles=${tiles}`);

    // Expanding must not leave two full-screen lists mounted: the sheet lives in
    // the shared overlays, and a per-shell copy would render it twice.
    await page.locator('[data-role="drawer-expand-activity"]').click().catch(() => {});
    await page.waitForTimeout(600);
    const sheets = await page.locator('[data-role="activity-sheet"]').count();
    record("R35b-one-full-screen-list",
      "Expanding the activity list mounts exactly one full-screen list",
      sheets === 1, `${sheets} mounted`);
    await ctx.close();
  }

  // R34 — an outcome that did not happen draws nothing.
  //
  // Before anyone comes down, Entrés is zero and Absents is 100 %. The green
  // block was rendered unguarded: its share was 0, but a flex item with no
  // basis still paints its content, so a green sliver carrying the VIP and COMP
  // chips sat on top of a répartition that read "Absents 100.0 %". Partiel and
  // Absents had always been guarded; Entrés never was.
  //
  // Also checks the other half of the same complaint: a block says how many
  // PEOPLE it is, not only how many doors.
  {
    const { ctx, page } = await openDay("/report", { arrivals: [], ecarts: [] });
    await page.waitForTimeout(600);
    const blocks = await page.locator('[data-role="treemap-block"]').evaluateAll((els) =>
      els.map((e) => ({ label: (e.getAttribute("aria-label") || "").split(" ")[0], text: e.innerText })));
    const green = blocks.filter((b) => /Entr/i.test(b.label));
    record("R34-no-block-for-a-zero-outcome",
      "With nobody down, the répartition draws no Entrés block at all",
      green.length === 0 && blocks.length > 0,
      `blocks: ${blocks.map((b) => b.label).join(", ") || "none"}`);

    const absent = blocks.find((b) => /Absent/i.test(b.label));
    record("R34b-block-counts-people",
      "A répartition block says how many people it is, not only how many rooms",
      !!absent && /\d+\s*pers\./.test(absent.text),
      absent ? absent.text.replace(/\s+/g, " ").trim() : "no Absents block");
    await ctx.close();
  }

  // R33 — one hand, both orientations.
  //
  // Reported from the desk: "on horizontal it is left, when I switch to vertical
  // the sidebar goes to the right." A setting that means one thing in landscape
  // and the opposite in portrait is worse than no setting — reception rotates
  // the tablet mid-service and the panel lands where their hand is not.
  //
  // Measured rather than reasoned about: set the hand, open the guest's Activité
  // panel and the nav drawer in BOTH shapes, and check which half of the screen
  // each one occupies.
  for (const hand of ["left", "right"]) {
    const { ctx, page } = await openDay("/search", { w: 1194, h: 834 });
    await page.evaluate((h) => {
      const s = JSON.parse(localStorage.getItem("app_settings") || "{}");
      s.handSide = h;
      localStorage.setItem("app_settings", JSON.stringify(s));
    }, hand);

    /** Which half of the viewport a box sits in, by its centre. */
    const sideOf = async (locator, width) => {
      const b = await locator.boundingBox().catch(() => null);
      if (!b) return null;
      return b.x + b.width / 2 < width / 2 ? "left" : "right";
    };

    // The guest's Activité panel, landscape then portrait — same guest, so the
    // only thing changing is the shape of the screen.
    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    // Type a room first. With an empty field there are no rows, the click hits
    // nothing, and the rule measures the search screen while reporting on the
    // guest's panel — a rule that fails on a working screen is as useless as
    // one that passes on a broken one.
    for (const d of "224".split("")) {
      await page.locator(`[data-role="numeric-keypad"] button:has-text("${d}")`).first().click().catch(() => {});
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);
    await page.locator('[data-role="room-row"]').first().click().catch(() => {});
    await page.waitForTimeout(1100);
    const landscapeAside = await sideOf(page.locator("aside").first(), 1194);

    /* ROTATE, do not re-navigate. The room number is never in the URL — it is
       handed over in sessionStorage — so re-opening the guest's address in a
       fresh navigation bounces to /search and the rule would measure the wrong
       screen. Resizing keeps the page mounted, which is also what actually
       happens when reception turns the tablet over. */
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.waitForTimeout(700);
    const portraitAside = await sideOf(page.locator("aside").first(), 834);

    record(`R33-${hand}-panel-follows-hand`,
      "The guest's activity panel is on the set hand in both orientations",
      landscapeAside === hand && portraitAside === hand,
      `hand=${hand}: landscape ${landscapeAside ?? "missing"}, portrait ${portraitAside ?? "missing"}`);

    // And the nav drawer, which is where those top-row icons live in portrait.
    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.locator('[data-role="portrait-menu"]').click().catch(() => {});
    await page.waitForTimeout(500);
    const drawerSide = await page.locator("[data-side]").first().getAttribute("data-side").catch(() => null);
    /* The PANEL, not the full-screen overlay it sits in. Measuring the overlay
       measures the viewport: its centre is exactly the middle, so the test
       "which half" answered "right" for both hands and passed by luck once. */
    const drawerBox = await sideOf(page.locator("[data-side] aside").first(), 834);
    record(`R33-${hand}-drawer-follows-hand`,
      "The nav drawer opens on the set hand",
      drawerSide === hand && drawerBox === hand,
      `hand=${hand}: data-side=${drawerSide ?? "missing"}, drawn ${drawerBox ?? "missing"}`);

    await ctx.close();
  }

  // R31 — the pad always types. In every state the search screen has.
  //
  // The app owns the keyboard, so the pad is the ONLY way to put a character on
  // this screen: a swallowed keystroke is not a glitch, it is a dead tablet
  // with a queue in front of it. It happened — a note draft outlived the card
  // it was written on and ate every digit meant for the next room, invisibly,
  // until someone reloaded.
  //
  // So this walks the states rather than testing the happy one: at rest, with
  // a filter running, after a note was started and abandoned, after the drawer
  // and the activity sheet have been opened and closed, and in letters as well
  // as digits.
  {
    const { ctx, page } = await openDay("/search", { w: 834, h: 1194 });
    const field = () => page.locator('[data-role="search-field"] input, input[placeholder*="Chambre"]').first();
    /* Whichever pad is on screen. Starting a note switches the app to letters
       (US-17), so a rule that assumes digits are always there waits thirty
       seconds for a key the app was right not to be showing — which is how the
       first version of this rule crashed the gate. */
    const toDigits = async () => {
      if (await page.locator('[data-role="alpha-keypad"]').count()) {
        await page.locator('[data-role="pad-123"]').click();
        await page.waitForTimeout(350);
      }
    };
    const type = async (d) => {
      await toDigits();
      await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
      await page.waitForTimeout(200);
    };
    const clearField = async () => {
      for (let i = 0; i < 6; i++) {
        await page.locator('[data-role="numeric-keypad"] button[aria-label="Backspace"], [data-role="alpha-keypad"] button[aria-label="Backspace"]')
          .first().click().catch(() => {});
        await page.waitForTimeout(90);
      }
    };
    const typesHere = async (label) => {
      await clearField();
      await type(2); await type(2); await type(4);
      const v = await field().inputValue().catch(() => "");
      return { label, ok: v === "224", v };
    };

    const states = [];
    states.push(await typesHere("at rest"));

    // With a metric filter running — the state Angel photographed.
    await page.locator('[data-role="portrait-metric"]').nth(1).click();
    await page.waitForTimeout(400);
    states.push(await typesHere("filter on"));
    await page.locator('[data-role="portrait-metric"][aria-pressed="true"]').first().click().catch(() => {});
    await page.waitForTimeout(300);

    /* A note STARTED and then walked away from — Angel's actual path.
       While the editor is on screen the keys belong to the note, and that is
       correct: this rule's first version asserted the opposite and failed the
       app for obeying US-17. What must never happen is the draft outliving the
       card, so the guest is dismissed with the field's own clear button before
       the keys are counted. */
    await clearField();
    await type(3); await type(1); await type(0);
    await page.waitForTimeout(500);
    const dots = page.locator('[data-role="preview-dots"] button');
    if (await dots.count() > 1) {
      await dots.nth(1).click();
      await page.waitForTimeout(400);
      await page.locator('[data-role="note-new"]').click().catch(() => {});
      await page.waitForTimeout(400);
      await page.locator('[data-role="alpha-keypad"] button, [data-role="numeric-keypad"] button')
        .first().click().catch(() => {});
      await page.waitForTimeout(250);
    }
    // Dismiss the guest: the card goes, and the draft must go with it.
    await page.locator('[data-role="search-field"] button[aria-label="Effacer"]').click().catch(() => {});
    await page.waitForTimeout(500);
    states.push(await typesHere("after an abandoned note"));

    // After the drawer and the activity sheet have been through.
    await page.locator('[data-role="portrait-menu"]').click();
    await page.waitForTimeout(350);
    await page.locator('[data-role="drawer-expand-activity"]').click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('[data-role="activity-close"]').click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('[data-role="nav-drawer"] [aria-label="Fermer le menu"]').click().catch(() => {});
    await page.waitForTimeout(400);
    states.push(await typesHere("after the drawer and the sheet"));

    // And the letters, which are the other half of the keyboard.
    await clearField();
    await page.locator('[data-role="pad-abc"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-role="alpha-keypad"] button', { hasText: /^L$/ }).first().click();
    await page.waitForTimeout(250);
    const letters = await field().inputValue().catch(() => "");
    states.push({ label: "letters", ok: letters.toUpperCase() === "L", v: letters });

    const dead = states.filter((s) => !s.ok);
    record("R31-pad-always-types", "The pad puts a character on screen in every state",
      dead.length === 0,
      dead.length ? dead.map((d) => `${d.label}→"${d.v}"`).join(" | ") : `${states.length} states`);
    await ctx.close();
  }

  // R30 — every screen, and every full-screen overlay, keeps out of the top
  // strip. Not two screens: all of them.
  //
  // R28 checked the two Angel photographed. He then said it plainly — "in none
  // of these screens are we using the margin" — and he was right: I had fixed
  // what I could see. A rule that names two routes is a rule that watches the
  // two places the bug already got caught.
  //
  // So this walks the app. Anything that carries words or takes a tap must
  // start below the status bar; decoration and backdrops may span the screen,
  // which is what full-bleed means.
  const TOP_BAND = 44;
  const topOffenders = `(band) => {
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const tag = el.tagName.toLowerCase();
      const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      const tappable = tag === "button" || tag === "input" || tag === "a" || tag === "textarea";
      if (!words && !tappable) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      if (r.top < band && r.bottom > 0) {
        bad.push((el.getAttribute("data-role") || tag) + " @" + Math.round(r.top) + " \\"" + el.textContent.trim().slice(0, 18) + "\\"");
      }
    }
    return bad;
  }`;

  for (const path of ["/search", "/report", "/reports", "/clients", "/upload", "/dashboard", "/checkin/224", "/morning-brief"]) {
    const { ctx, page } = await openDay(path, { w: 834, h: 1194 });
    await page.addStyleTag({ content: `:root{--safe-top:${TOP_BAND}px;--safe-bottom:34px}` });
    await page.waitForTimeout(350);
    const bad = await page.evaluate(`(${topOffenders})(${TOP_BAND})`);
    record(`R30-${path.slice(1).replace(/\//g, "-")}-top-margin`,
      "Nothing on this screen is drawn under the iPad's clock",
      bad.length === 0, bad.length ? bad.slice(0, 4).join(" | ") : "clear");
    await ctx.close();
  }

  // R30b — the overlays, which are drawn on top of a screen that is already
  // correct and so get no help from it.
  {
    const { ctx, page } = await openDay("/search", { w: 834, h: 1194 });
    await page.addStyleTag({ content: `:root{--safe-top:${TOP_BAND}px;--safe-bottom:34px}` });
    for (const [name, open] of [
      ["drawer", async () => { await page.locator('[data-role="portrait-menu"]').click(); }],
      ["activity", async () => { await page.locator('[data-role="drawer-recents"]').click(); }],
    ]) {
      await open();
      await page.waitForTimeout(450);
      const bad = await page.evaluate(`(${topOffenders})(${TOP_BAND})`);
      record(`R30b-${name}-top-margin`, "This overlay keeps out of the status bar too",
        bad.length === 0, bad.length ? bad.slice(0, 4).join(" | ") : "clear");
    }
    await ctx.close();
  }

  // R29 — no orphan band under the GUEST card.
  //
  // Written first about the resting frame: a fixed 28vh left ~180px of nothing
  // between it and the commit button. Then the tablet said the opposite about
  // THAT frame — "too big, hide it by default" — so the resting frame is now a
  // deliberately small, opt-in card and a gap under it is the point.
  //
  // Re-aimed rather than deleted, because the failure it describes is real and
  // simply belongs to the other face: when a guest is on screen, the card is
  // the screen, and dead space between them and the button they are waiting on
  // is the thing worth forbidding. Saying so plainly — a rule that changes
  // shape to keep passing has to justify the new shape.
  for (const [label, w, h] of [["phone", 390, 844], ["ipad", 834, 1194]]) {
    const { ctx, page } = await openDay("/search", { w, h });
    for (const d of [3, 1, 0]) {
      await page.locator('[data-role="numeric-keypad"] button', { hasText: new RegExp(`^${d}$`) }).first().click();
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(450);
    const card = await page.locator('[data-role="guest-preview"]').boundingBox();
    const dock = await page.locator('[data-role="portrait-dock"]').boundingBox();
    const gap = card && dock ? dock.y - (card.y + card.height) : null;
    record(`R29-${label}-no-orphan-band`, "The guest card leaves no band of dead screen above the pad",
      gap !== null && gap >= 0 && gap < 120,
      gap === null ? "card or dock missing" : `${gap.toFixed(0)}px between card and dock`);
    await ctx.close();
  }

  // R28 — the app's furniture keeps out of the status bar and the home
  // indicator, at BOTH ends.
  //
  // `viewport-fit: cover` hands the app the whole screen — which is what we
  // want for the dock, and a bargain: iOS is still drawing a clock in the top
  // strip and an indicator in the bottom one. We shipped the bottom half of
  // that deal and the burger went under the clock on a real iPad.
  //
  // A desktop browser reports 0 on every inset, so a rule written against
  // `env()` alone passes on the one machine where the bug cannot happen. The
  // utilities read `--safe-top` / `--safe-bottom` first, so the harness can be
  // an iPad: 44px of status bar, 34px of home indicator.
  /* The bottom is measured on the LAST KEY, not on the dock.

     The dock is SUPPOSED to reach the bottom edge — that is what cover buys us,
     a pad flush to the glass instead of a letterbox. What must clear the home
     indicator is what is drawn inside it. Measuring the container failed the
     app for doing the right thing, which is the same mistake R26a exists to
     prevent, made in my own rule one screen later. */
  for (const [path, top, lastKey] of [
    ["/search", '[data-role="portrait-menu"]', '[data-role="portrait-dock"] button'],
    ["/report", '[data-role="report-header"] button', null],
  ]) {
    for (const [label, w, h] of [["phone", 390, 844], ["ipad", 834, 1194]]) {
      const { ctx, page } = await openDay(path, { w, h });
      await page.addStyleTag({ content: ":root{--safe-top:44px;--safe-bottom:34px}" });
      await page.waitForTimeout(300);
      const topBox = await page.locator(top).first().boundingBox().catch(() => null);
      const keyBox = lastKey ? await page.locator(lastKey).last().boundingBox().catch(() => null) : null;
      const clearsTop = !!topBox && topBox.y >= 44;
      const clearsBottom = !keyBox || keyBox.y + keyBox.height <= h - 34 + 1;
      record(`R28-${label}-${path.slice(1)}-safe-area`,
        "The app's own furniture stays out of the status bar and the home indicator",
        clearsTop && clearsBottom,
        !clearsTop ? `top chrome starts at y=${topBox?.y?.toFixed(0) ?? "?"}, status bar is 44px` :
        !clearsBottom ? `last key ends ${(keyBox.y + keyBox.height).toFixed(0)} of ${h - 34}` : "clear");
      await ctx.close();
    }
  }

  // R27 — contrast on the guest screen, panel open, in both themes.
  //
  // R18 sweeps /search and /report. The guest screen's side panel was never
  // swept, and that is where "Tout" shipped selected and invisible: #1C1C1C on
  // a near-black panel, ringed in black on black. Every other chip was fine —
  // they take their colour from a tone token that flips with the theme, and
  // "Tout" had been handed a literal.
  //
  // A literal is a colour that has only ever been checked against one
  // background. The rule is the check the literal never got.
  for (const dark of [false, true]) {
    const { ctx, page } = await openDay("/checkin/224", { dark });
    const tog = page.locator('[data-role="activity-toggle"]');
    if (await tog.isVisible().catch(() => false)) { await tog.click(); await page.waitForTimeout(300); }
    await page.locator('[data-role="side-tab-notes"]').click();
    await page.waitForTimeout(500);
    const samples = await page.evaluate((fn) => {
      const measure = eval(`(${fn})`);
      const out = [];
      const panel = document.querySelector("aside") || document.body;
      for (const el of panel.querySelectorAll("button, span, div, p, b, h1, h2")) {
        const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
        if (!direct) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        out.push({ text: el.textContent.trim().slice(0, 28), ...measure(el) });
      }
      return out;
    }, COMPOSITE);
    const fails = [];
    for (const s of samples) {
      const large = s.size >= 24 || (s.size >= 18.66 && Number(s.weight) >= 700);
      const need = large ? 3 : 4.5;
      const got = Math.min(...s.bgs.map((bg) => contrast(s.color, bg)));
      if (got < need) fails.push(`"${s.text}" ${got.toFixed(2)}:1 (needs ${need})`);
    }
    record(`R27-contrast-guest-notes-${dark ? "dark" : "light"}`,
      "Every word in the guest's activity panel is readable in this theme",
      fails.length === 0,
      fails.length ? fails.slice(0, 6).join(" | ") : `${samples.length} text nodes checked`);
    await ctx.close();
  }

  // R26c — Groupes names which coach.
  //
  // One on/off for every tour in the house answers a question reception rarely
  // asks: the seven o'clock coach and the nine o'clock coach are two different
  // mornings. Nothing ticked still means all of them, so the pill alone keeps
  // working exactly as it did.
  {
    const { ctx, page } = await openDay("/search", { w: 834, h: 1194 });
    /* Groupes is not on the portrait bar by default any more: four metrics are
       pinned and portrait has four slots, so the extras live behind the funnel.
       Tick it the way reception would, then use it. */
    if (await page.locator('[data-metric="groups"]').count() === 0) {
      // This shell is portrait, so it is the portrait funnel — `metric-more`
      // belongs to the landscape bar and waiting for it here just times out.
      await page.locator('[data-role="portrait-filter-more"]').first().click();
      await page.waitForTimeout(450);
      await page.locator('[data-role="metric-choice-option"][data-metric="groups"]').click();
      await page.waitForTimeout(450);
      // The sheet closes on a tap outside it.
      await page.mouse.click(10, 10);
      await page.waitForTimeout(450);
    }
    await page.locator('[data-metric="groups"]').first().click();
    await page.waitForTimeout(450);
    const rows = () => page.locator('[data-role="room-row"]').count();
    const all = await rows();
    const options = page.locator('[data-role="group-pick-option"]');
    const n = await options.count();
    await options.first().click();
    await page.waitForTimeout(350);
    const picked = await rows();
    const checked = await options.first().getAttribute("aria-checked");
    await options.first().click();
    await page.waitForTimeout(350);
    const back = await rows();
    record("R26c-group-checklist", "Groupes narrows to the coach you tick, and unticking means all of them again",
      n >= 2 && all > 0 && picked > 0 && picked < all && checked === "true" && back === all,
      `options=${n} all=${all} picked=${picked} back=${back}`);
    await ctx.close();
  }

  await closeBrowser();
  stopServer();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  writeFileSync(join(OUT, "design-rules.json"), JSON.stringify({ when: new Date().toISOString(), base: BASE, passed, failed, results }, null, 2));
  console.log(`\n${passed}/${results.length} design rules passed${failed ? ` — ${failed} FAILED` : ""}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("design-rules driver crashed:", e); stopServer(); process.exit(2); });
