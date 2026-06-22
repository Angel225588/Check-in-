// Screenshot the 3-role mockup's views for review.
import { chromium } from "playwright";
import { pathToFileURL } from "url";
import { resolve } from "path";

const FILE = pathToFileURL(resolve("docs/imarketin-roles-v2.html")).href;
const OUT = "docs/img";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1180, height: 840 }, deviceScaleFactor: 2 }).then((c) => c.newPage());
  await page.goto(FILE, { waitUntil: "networkidle" });
  await sleep(600);

  const shoot = async (name) => { await sleep(700); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("saved", name); };

  await shoot("mock-0-picker");
  await page.evaluate(() => openRole("reception")); await shoot("mock-1-reception");
  await page.evaluate(() => goHome());
  await page.evaluate(() => openRole("direction")); await shoot("mock-2-direction");
  await page.evaluate(() => goHome());
  await page.evaluate(() => openRole("restaurant")); await shoot("mock-3-restaurant");
  await page.evaluate(() => { try { startService(); } catch (e) {} }); await shoot("mock-4-checkin");

  await browser.close();
  console.log("done");
};
run().catch((e) => { console.error(e); process.exit(1); });
