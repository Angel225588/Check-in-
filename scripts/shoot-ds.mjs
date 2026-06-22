import { chromium } from "playwright";
import { pathToFileURL } from "url";
import { resolve } from "path";

const FILE = pathToFileURL(resolve("docs/design-system.html")).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2 }).then((c) => c.newPage());
  await page.goto(FILE, { waitUntil: "networkidle" });
  await sleep(1200);
  await page.screenshot({ path: "docs/img/design-system.png", fullPage: true });
  console.log("saved design-system.png");
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
