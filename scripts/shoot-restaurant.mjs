import { chromium } from "playwright";
import { pathToFileURL } from "url";
import { resolve } from "path";

const FILE = pathToFileURL(resolve("docs/restaurant-prototype.html")).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser
    .newContext({ viewport: { width: 920, height: 1180 }, deviceScaleFactor: 2 })
    .then((c) => c.newPage());
  await page.goto(FILE, { waitUntil: "networkidle" });
  await sleep(900);

  // 1 — summary
  await page.screenshot({ path: "docs/img/rest-1-summary.png" });

  // 2 — pointage (enter app)
  await page.evaluate(() => window.enterApp());
  await sleep(700);
  await page.screenshot({ path: "docs/img/rest-2-pointage.png" });

  // 3 — check-in sheet (must-pay row = index 3 Sarah Lemoine)
  await page.evaluate(() => window.openSheet(3));
  await sleep(700);
  await page.screenshot({ path: "docs/img/rest-3-sheet.png" });
  await page.evaluate(() => window.closeSheet());
  await sleep(400);

  // 4 — contacts
  await page.evaluate(() => window.showTab("contacts"));
  await sleep(600);
  await page.screenshot({ path: "docs/img/rest-4-contacts.png" });

  // 5 — contact detail
  await page.evaluate(() => window.openContact(0));
  await sleep(600);
  await page.screenshot({ path: "docs/img/rest-5-contact.png" });

  // 6 — journées
  await page.evaluate(() => window.showTabScreen("journees"));
  await sleep(600);
  await page.screenshot({ path: "docs/img/rest-6-journees.png" });

  // 7 — journée detail (report + docs)
  await page.evaluate(() => window.openJournee("today"));
  await sleep(600);
  await page.screenshot({ path: "docs/img/rest-7-journee-detail.png" });

  console.log("saved 7 restaurant screenshots");
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
