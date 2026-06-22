import { chromium } from "playwright";
import { pathToFileURL } from "url";
import { resolve } from "path";

const FILE = pathToFileURL(resolve("docs/reception-prototype-final.html")).href;
const OUT = "docs/img";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1000, height: 1080 }, deviceScaleFactor: 2 }).then((c) => c.newPage());
  await page.goto(FILE, { waitUntil: "networkidle" });
  await sleep(700);
  const shoot = async (n) => { await sleep(500); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("saved", n); };

  await shoot("rc-0-picker");
  await page.evaluate(() => openRole("reception")); await shoot("rc-1-home");
  await page.evaluate(() => go("upload")); await shoot("rc-2-upload");
  await page.evaluate(() => startUpload()); await sleep(3600); await shoot("rc-3-uploaded-glow");
  await page.evaluate(() => transmit()); await sleep(900); await shoot("rc-4-success");

  await browser.close();
  console.log("done");
};
run().catch((e) => { console.error(e); process.exit(1); });
