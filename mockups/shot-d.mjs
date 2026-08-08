import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir=process.cwd()+"/mockups";
const b=await chromium.launch({headless:true,executablePath:exe});
const p=await b.newPage({viewport:{width:1194,height:834},deviceScaleFactor:2});
await p.goto("file://"+dir+"/d-vip-gold.html",{waitUntil:"networkidle"});
await p.screenshot({path:dir+"/shot-d-vip.png"});
// open history drawer
await p.evaluate(()=>document.getElementById('root').classList.add('open'));
await p.waitForTimeout(500);
await p.screenshot({path:dir+"/shot-d-drawer.png"});
// non-VIP (plain) state
await p.evaluate(()=>document.getElementById('root').classList.remove('open'));
await p.evaluate(()=>document.querySelector('.demo').click());
await p.waitForTimeout(400);
await p.screenshot({path:dir+"/shot-d-plain.png"});
await b.close();
console.log("done");
