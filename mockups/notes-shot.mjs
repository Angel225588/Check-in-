import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir="/home/user/Check-in-/mockups";
const url="file://"+dir+"/notes-flow.html";
const b=await chromium.launch({headless:true,executablePath:exe});
const ctx=await b.newContext({viewport:{width:1194,height:834},deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(url,{waitUntil:"load"});
await p.click('.chip[data-f="alerte"]');   // show a gold/colored selected filter
await p.waitForTimeout(300);
await p.screenshot({path:dir+"/notes-1-list.png"});
// tap the pinned Alerte note -> edit mode (delete visible)
await p.click('#filters .chip[data-f="all"]');
await p.click('#list .note.alerte');
await p.waitForTimeout(500);
await p.screenshot({path:dir+"/notes-3-edit.png"});
await b.close();
console.log("done");
