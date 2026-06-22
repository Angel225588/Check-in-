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
  const shoot = async (n) => { await sleep(400); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("saved", n); };

  await page.evaluate(() => openRole("reception"));
  await shoot("rc-home2");                       // accent hero in the middle
  await page.evaluate(() => go("upload"));
  await page.evaluate(() => startUpload());
  await sleep(4600);
  await shoot("rc-success2");                    // auto-transmit success
  await sleep(3200);                             // auto-return home
  await page.evaluate(() => { go("files"); openDay("d1"); });
  await shoot("rc-files-processing");            // today's docs "en traitement"

  await browser.close();
  console.log("done");
};
run().catch((e) => { console.error(e); process.exit(1); });
