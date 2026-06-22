import { chromium } from "playwright";
import { pathToFileURL } from "url";
import { resolve } from "path";

const FILE = pathToFileURL(resolve("docs/reception-prototype-final.html")).href;
const OUT = "docs/img";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 900, height: 1180 }, deviceScaleFactor: 2 }).then((c) => c.newPage());
  await page.goto(FILE, { waitUntil: "networkidle" });
  await sleep(700);
  const shoot = async (n) => { await sleep(450); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("saved", n); };

  await shoot("rc-access-join");
  await page.evaluate(() => acMode("new")); await shoot("rc-access-new");
  await page.evaluate(() => { acMode("join"); go("picker"); openRole("restaurant"); }); await shoot("rc-restaurant-summary");
  await page.evaluate(() => { go("picker"); openRole("reception"); go("upload"); }); await shoot("rc-upload-glow");

  await browser.close();
  console.log("done");
};
run().catch((e) => { console.error(e); process.exit(1); });
