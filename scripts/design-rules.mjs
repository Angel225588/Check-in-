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
//   R14-R15  writing outranks classifying; the panel can be widened
//   R16  search: empty until typed, preview in the clock box, bounded stepper
//   R17  report: figures agree with each other, tiles filter, écarts survive
//   R18  contrast on the search and report screens, both themes
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
async function startServer() {
  if (await ping(2000)) return; // caller supplied one
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

    // R15 — the panel can be widened for reading long notes. Measured with the
    // drawer open but no modal over it: notes now open as a centred dialog, and
    // clicking a control underneath it is a harness bug, not a design finding.
    const toggle = page.locator('[data-role="activity-toggle"]');
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(280);
    }
    const widthOf = async () => (await page.locator("aside").boundingBox())?.width ?? 0;
    const w0 = await widthOf();
    await page.locator('[data-role="side-width"]').click();
    await page.waitForTimeout(320);
    const w1 = await widthOf();
    record("R15-panel-resize", "The activity panel can be widened and narrowed", w1 > w0 + 80,
      `${Math.round(w0)}px -> ${Math.round(w1)}px`);
    await page.locator('[data-role="side-width"]').click();
    await page.waitForTimeout(320);

    await page.locator('[data-role="side-tab-notes"]').click();
    await page.waitForTimeout(420);

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

  async function openDay(path, { dark = false, w = 1194, h = 834 } = {}) {
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
    }, { clients: DAY_CLIENTS, arrivals: DAY_ARRIVALS, ecarts: DAY_ECARTS, dark });
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
    const tileValue = Number((await tile.innerText()).match(/(\d+)\s*$/m)?.[1] ?? NaN);
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
    const ecartTile = page.locator('[data-role="report-tile"][data-tile="ecart"]');
    const ecartText = await ecartTile.innerText();
    const ecartRooms = Number(ecartText.match(/(\d+)/)?.[1] ?? NaN);
    await ecartTile.click();
    await page.waitForTimeout(340);
    const ecartRowsShown = await listCount();
    record("R17e-ecarts-tracked", "Reception count errors are counted and filterable",
      ecartRooms === DAY_ECARTS.length && ecartRowsShown === DAY_ECARTS.length,
      `tile ${ecartRooms}, list ${ecartRowsShown}, seeded ${DAY_ECARTS.length}`);
    await ecartTile.click();
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
            const offBottom = r.bottom > window.innerHeight + 1;
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

  await closeBrowser();
  stopServer();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  writeFileSync(join(OUT, "design-rules.json"), JSON.stringify({ when: new Date().toISOString(), base: BASE, passed, failed, results }, null, 2));
  console.log(`\n${passed}/${results.length} design rules passed${failed ? ` — ${failed} FAILED` : ""}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("design-rules driver crashed:", e); stopServer(); process.exit(2); });
