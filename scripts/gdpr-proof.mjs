/**
 * Evidence that the GDPR work is real, gathered from a running app.
 *
 * Seeds a demo day through the app's own loader, screenshots the working
 * screens, then dumps what is actually on disk — because a passing test says
 * the code does what I wrote, and a storage dump says what a stolen tablet
 * would hand over.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.PROOF_URL || "http://localhost:3777";
const OUT = process.env.PROOF_DIR || "./proof";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
// An iPad in portrait, which is what reception actually holds.
const ctx = await browser.newContext({
  viewport: { width: 820, height: 1180 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const violations = [];
page.on("console", (m) => {
  const t = m.text();
  if (/_vercel\/insights|fonts\.(googleapis|gstatic)/.test(t)) return;
  if (/Content Security Policy|Refused to (execute|load)/i.test(t)) violations.push(t);
});

const shot = async (name, path) => {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  screenshot: ${name}.png  (${path})`);
};

console.log("\n1. SEEDING A DEMO DAY through the app's own loader");
await page.goto(BASE + "/debug", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const seedBtn = page.getByRole("button", { name: /seed|mock|démo|demo/i }).first();
if (await seedBtn.count()) {
  await seedBtn.click();
  await page.waitForTimeout(2500);
  console.log("   seeded.");
} else {
  console.log("   NO SEED BUTTON FOUND — screenshots will show an empty app.");
}

console.log("\n2. SCREENSHOTS of the running app (strict CSP + encrypted roster)");
await shot("01-search", "/search");
await shot("02-report", "/report");
await shot("03-dashboard", "/dashboard");
await shot("04-debug-storage", "/debug");

console.log("\n3. WHAT IS ACTUALLY ON DISK");
await page.goto(BASE + "/search", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const dump = await page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
});

const SECRETS = /DUPONT|MARTIN|CHEN|POLANCO|MARIE|JEAN|allerg|arachide/i;
const rosterKeys = Object.keys(dump).filter((k) =>
  /^dailyData_|^sessionHistory$|^guest_profiles$|^morningBrief_/.test(k)
);

console.log(`   ${Object.keys(dump).length} keys in storage, ${rosterKeys.length} holding roster data\n`);
let leaked = 0;
for (const k of rosterKeys) {
  const v = dump[k];
  const readable = SECRETS.test(v);
  if (readable) leaked++;
  console.log(
    `   ${readable ? "LEAK" : "OK  "}  ${k.padEnd(24)} ${String(v.length).padStart(7)} bytes  ` +
    `starts: ${JSON.stringify(v.slice(0, 40))}`
  );
}

// The names ARE visible in the running app — that is the point. Encrypted at
// rest, readable in memory, exactly as designed.
const onScreen = await page.evaluate(() => document.body.innerText.slice(0, 400));

writeFileSync(`${OUT}/storage-dump.json`, JSON.stringify(dump, null, 2));
console.log(`\n   full dump written to ${OUT}/storage-dump.json`);

console.log("\n4. UNLOCK TIME measured on this device");
const unlock = await page.evaluate(() => {
  const el = document.querySelector('[data-role="unlock-stamp"]');
  return el ? el.textContent.trim() : null;
});
console.log(`   ${unlock ?? "(nav drawer closed — see NavDrawer data-role=unlock-stamp)"}`);

console.log("\n5. CSP VIOLATIONS while driving the app");
console.log(`   ${violations.length}`);
for (const v of violations) console.log("     " + v.slice(0, 140));

await browser.close();

console.log("\n" + "=".repeat(56));
console.log(`roster keys on disk        : ${rosterKeys.length}`);
console.log(`readable guest data on disk: ${leaked}   ${leaked === 0 ? "<- none" : "<- FAILURE"}`);
console.log(`csp violations             : ${violations.length}`);
console.log(`app rendered content       : ${onScreen.length > 40 ? "yes" : "NO"}`);
console.log("=".repeat(56));
process.exit(leaked === 0 && violations.length === 0 ? 0 : 1);
