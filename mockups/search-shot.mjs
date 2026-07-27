import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
function chrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  for (const d of readdirSync(root).filter((x) => x.startsWith("chromium-")).sort().reverse()) {
    const p = join(root, d, "chrome-linux", "chrome");
    if (existsSync(p)) return p;
  }
}
const url = "file://" + join(HERE, "search-v2.html");
const b = await chromium.launch({ headless: true, executablePath: chrome(), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const shots = [
  ["search-v2-dark", []],
  ["search-v2-light", ["light"]],
  ["search-v2-typed", []],
  ["search-v2-rainbow", ["rainbow"]],
  ["search-v2-alert", []],
  ["search-v2-first", []],
  ["search-v2-swipe", []],
  ["search-v2-expected", []],
];
for (const [name, classes] of shots) {
  const p = await b.newPage({ viewport: { width: 1230, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: "load" });
  if (classes.length) await p.evaluate((c) => document.body.classList.add(...c), classes);
  const TYPE = { "search-v2-typed": "501", "search-v2-alert": "224", "search-v2-first": "385" };
  for (const d of (TYPE[name] || "").split("")) await p.keyboard.press("Digit" + d);
  if (name.endsWith("expected")) { await p.getByText("Alterner service ⇄ attendus").click(); }
  if (name.endsWith("swipe")) {
    // drag the 3rd row left past the threshold twice -> 2/4 entrés
    const row = p.locator('.swipe[data-r="402"] .row');
    for (let i = 0; i < 2; i++) {
      const b = await row.boundingBox();
      await p.mouse.move(b.x + b.width - 340, b.y + b.height / 2);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width - 340 - 120, b.y + b.height / 2, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(360);
    }
  }
  await p.waitForTimeout(220);
  await p.locator(".frame").screenshot({ path: join(HERE, `${name}.png`) });
  await p.close();
}
await b.close();
console.log("shots written");
