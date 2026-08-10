/**
 * Screenshots of what changed, on the app's own demo day.
 *
 *   node scripts/shots.mjs        (expects a server on BASE_URL)
 *
 * Not a screenshot tour. Each shot is framed on a thing reception reported, and
 * the pair 2/3 exists because a still frame cannot show a list that only drifts
 * WHILE you scroll — the second shot is the first one after a scroll, so the
 * edges can be compared.
 *
 * It drives the app's own demo loader rather than building its own fixture, for
 * the reason `preflight.mjs` exists: a harness that builds its own data can
 * never photograph a bug in the seeder. Needs NEXT_PUBLIC_TEST_TOOLS=1.
 *
 * Output lands in validation-artifacts/, which is gitignored — these are for
 * sending to whoever asked, not for keeping.
 */
import { chromium } from "playwright";
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "validation-artifacts", "shots");
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

const browser = await chromium.launch({ executablePath: resolveChromium() });

async function seeded(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("app-dark", "true"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-role="test-tools"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-role="seed-demo"]').click();
  await page.waitForTimeout(1800);
  return { ctx, page };
}

/** Turn the Groupes filter on, wherever it currently lives. */
async function pickGroups(page) {
  if ((await page.locator('[data-metric="groups"]').count()) === 0) {
    await page.locator('[data-role="metric-more"], [data-role="portrait-filter-more"]').first().click();
    await page.waitForTimeout(450);
    await page.locator('[data-role="metric-choice-option"][data-metric="groups"]').click();
    await page.waitForTimeout(450);
    await page.mouse.click(5, 5);
    await page.waitForTimeout(450);
  }
  await page.locator('[data-metric="groups"]').first().click();
  await page.waitForTimeout(700);
}

// 1 — the report, landscape: people lead, one percentage.
{
  const { ctx, page } = await seeded(1194, 834);
  await page.goto(`${BASE}/report`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(OUT, "1-report-people-first.png") });
  await ctx.close();
}

// 2 — the search screen with Groupes on, landscape: a fixed frame.
{
  const { ctx, page } = await seeded(1194, 834);
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await pickGroups(page);
  await page.screenshot({ path: join(OUT, "2-groupes-landscape.png") });

  // Scrolled, to show the frame does not travel sideways.
  const row = page.locator('[data-role="room-row"], [data-role="suggestion-card"]').first();
  const box = await row.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: join(OUT, "3-groupes-landscape-scrolled.png") });
  await ctx.close();
}

// 3 — the same, portrait.
{
  const { ctx, page } = await seeded(834, 1194);
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await pickGroups(page);
  await page.screenshot({ path: join(OUT, "4-groupes-portrait.png") });
  await ctx.close();
}

// 4 — Récents in landscape: the same drawer portrait uses.
{
  const { ctx, page } = await seeded(1194, 834);
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.locator("button", { hasText: /Récents/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, "5-recents-drawer-landscape.png") });
  await ctx.close();
}

console.log("shots in", OUT);
for (const f of readdirSync(OUT).sort()) console.log(" ", f);
await browser.close();
