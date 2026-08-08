import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const HERE = dirname(fileURLToPath(import.meta.url));
const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const dir = readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse()
  .map(d=>join(root,d,"chrome-linux","chrome")).find(existsSync);
const b = await chromium.launch({headless:true, executablePath:dir, args:["--no-sandbox","--disable-dev-shm-usage"]});
const shots = [
  ["notes-v2-list", async p=>{}],
  ["notes-v2-compose", async p=>{ await p.getByText("+ Nouvelle note").click(); await p.waitForTimeout(200);
      await p.fill("#ttl","Allergie arachide"); await p.fill("#bdy","Choc anaphylactique. EpiPen dans le sac.");
      await p.locator('[data-t="alert"]').click(); }],
  ["notes-v2-keyboard", async p=>{ await p.getByText("+ Nouvelle note").click(); await p.waitForTimeout(150);
      await p.getByText("Simuler le clavier iPad").click(); }],
  ["notes-v2-detail", async p=>{ await p.getByText("Allergie arachide").first().click(); }],
  ["notes-v2-light", async p=>{ await p.getByText("Clair / Sombre").click(); }],
];
for (const [name, act] of shots) {
  const p = await b.newPage({viewport:{width:1230,height:900}, deviceScaleFactor:2});
  await p.goto("file://"+join(HERE,"notes-v2.html"), {waitUntil:"load"});
  await act(p); await p.waitForTimeout(320);
  await p.locator(".stage").screenshot({path: join(HERE, name+".png")});
  await p.close();
}
await b.close(); console.log("shots written");
