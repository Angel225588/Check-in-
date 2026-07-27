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
];
for (const [name, classes] of shots) {
  const p = await b.newPage({ viewport: { width: 1230, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: "load" });
  if (classes.length) await p.evaluate((c) => document.body.classList.add(...c), classes);
  if (name.endsWith("typed")) {
    await p.keyboard.press("Digit2");
    await p.keyboard.press("Digit2");
    await p.keyboard.press("Digit4");
  }
  await p.waitForTimeout(220);
  await p.locator(".frame").screenshot({ path: join(HERE, `${name}.png`) });
  await p.close();
}
await b.close();
console.log("shots written");
