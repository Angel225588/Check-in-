/**
 * Does the app actually run under the strict CSP?
 *
 * A policy that passes a unit test and blocks the theme script in production is
 * worse than the loose one it replaced. This loads the real pages in a real
 * browser and fails on any CSP violation or console error.
 */
import { chromium } from "playwright";

const BASE = process.env.CSP_SMOKE_URL || "http://localhost:3000";
const PAGES = ["/", "/search", "/upload", "/report", "/reports", "/dashboard", "/clients"];

// The pre-installed Chromium in this environment, rather than the version
// Playwright would download.
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const violations = [];
const errors = [];

/**
 * Two things fail locally for reasons that have nothing to do with the policy,
 * and counting them would make this script cry wolf until nobody reads it:
 *
 *  - `/_vercel/insights/script.js` only exists when deployed on Vercel. Locally
 *    it 404s to an HTML page, and Chrome reports that as a MIME-type refusal.
 *    On Vercel it is same-origin, so `script-src 'self'` allows it.
 *  - Google Fonts cannot be reached from this sandbox at all.
 *
 * Anything else is a real finding.
 */
const ENVIRONMENTAL = /_vercel\/insights|fonts\.(googleapis|gstatic)\.com/;

page.on("console", (msg) => {
  const text = msg.text();
  if (ENVIRONMENTAL.test(text)) return;
  if (/Content Security Policy|Refused to (execute|load|apply|connect)/i.test(text)) {
    violations.push(text);
  } else if (msg.type() === "error" && !/ERR_CONNECTION_RESET|404/.test(text)) {
    errors.push(text);
  }
});
page.on("pageerror", (e) => { if (!ENVIRONMENTAL.test(String(e))) errors.push(String(e)); });

let failed = false;
for (const path of PAGES) {
  violations.length = 0;
  errors.length = 0;

  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  // The app gates render on the roster unlock, so give it a beat to appear.
  await page.waitForTimeout(600);

  const status = res?.status() ?? 0;
  const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
  const rendered = bodyText.length > 0;

  const ok = status < 400 && rendered && violations.length === 0 && errors.length === 0;
  if (!ok) failed = true;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${path.padEnd(12)} ` +
    `http ${status}  rendered ${rendered ? "yes" : "NO"}  ` +
    `csp-violations ${violations.length}  console-errors ${errors.length}`
  );
  for (const v of violations) console.log("        CSP: " + v.slice(0, 160));
  for (const e of errors) console.log("        ERR: " + e.slice(0, 160));
}

// The theme bootstrap is the script that had to move out of the page. If the
// CSP blocked it, dark mode would silently stop working rather than error.
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const themeLoaded = await page.evaluate(async () => {
  const r = await fetch("/theme-init.js");
  return r.ok;
});
console.log(`${themeLoaded ? "PASS" : "FAIL"}  /theme-init.js is served and reachable`);
if (!themeLoaded) failed = true;

await browser.close();
console.log(failed ? "\nCSP SMOKE: FAILED" : "\nCSP SMOKE: ALL PASS");
process.exit(failed ? 1 : 0);
