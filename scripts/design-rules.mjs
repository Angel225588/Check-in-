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
//
// Usage: node scripts/design-rules.mjs            (expects a server on BASE)
//        BASE_URL=http://localhost:3200 node scripts/design-rules.mjs

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

  await closeBrowser();
  stopServer();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  writeFileSync(join(OUT, "design-rules.json"), JSON.stringify({ when: new Date().toISOString(), base: BASE, passed, failed, results }, null, 2));
  console.log(`\n${passed}/${results.length} design rules passed${failed ? ` — ${failed} FAILED` : ""}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("design-rules driver crashed:", e); stopServer(); process.exit(2); });
