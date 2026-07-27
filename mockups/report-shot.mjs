import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const HERE = dirname(fileURLToPath(import.meta.url));
const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const exe = readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse()
  .map(d=>join(root,d,"chrome-linux","chrome")).find(existsSync);
const b = await chromium.launch({headless:true, executablePath:exe, args:["--no-sandbox","--disable-dev-shm-usage"]});
for (const [name, act] of [
  ["report-v2-dark", async p=>{}],
  ["report-v2-light", async p=>{ await p.getByText("Clair / Sombre").click(); }],
  ["report-v2-gray", async p=>{ await p.getByText("Test daltonisme (niveaux de gris)").click(); }],
]) {
  const p = await b.newPage({viewport:{width:1230,height:900}, deviceScaleFactor:2});
  await p.goto("file://"+join(HERE,"report-v2.html"), {waitUntil:"load"});
  await act(p); await p.waitForTimeout(280);
  await p.locator(".frame").screenshot({path: join(HERE, name+".png")});
  await p.close();
}
await b.close(); console.log("shots written");
