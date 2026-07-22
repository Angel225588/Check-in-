import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir=process.cwd()+"/mockups";
const b=await chromium.launch({headless:true,executablePath:exe});
const p=await b.newPage({viewport:{width:1194,height:834},deviceScaleFactor:2});
await p.goto("file://"+dir+"/g-final-sidebar.html",{waitUntil:"load"});
// returning guest, all tab, VIP
await p.evaluate(()=>{window.set("vip");window.setg("habitue");window.setTab("all");});
await p.screenshot({path:dir+"/shot-g-habitue.png",animations:"disabled"});
// first-time gold bar, included
await p.evaluate(()=>{window.set("incl");window.setg("first");});
await p.screenshot({path:dir+"/shot-g-firsttime.png",animations:"disabled"});
// vip no breakfast + notes tab
await p.evaluate(()=>{window.set("vipnobkf");window.setg("habitue");window.setTab("notes");});
await p.screenshot({path:dir+"/shot-g-notes.png",animations:"disabled"});
await b.close();console.log("done");
