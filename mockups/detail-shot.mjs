import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir="/home/user/Check-in-/mockups";
const url="file://"+dir+"/notes-detail.html";
const b=await chromium.launch({headless:true,executablePath:exe});
const ctx=await b.newContext({viewport:{width:1194,height:834},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(url,{waitUntil:"load"});
await p.waitForTimeout(400);
await p.screenshot({path:dir+"/detail-0-chips.png"});
// Variant A — lateral detail
await p.click('.hchip');
await p.waitForTimeout(400);
await p.screenshot({path:dir+"/detail-A-lateral.png"});
await p.click('.back');
// Variant B — center box
await p.click('#mB');
await p.waitForTimeout(200);
await p.click('.hchip');
await p.waitForTimeout(500);
await p.screenshot({path:dir+"/detail-B-center.png"});
await b.close();
console.log("done");
