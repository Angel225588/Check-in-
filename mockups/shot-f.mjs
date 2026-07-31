import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir=process.cwd()+"/mockups";
const b=await chromium.launch({headless:true,executablePath:exe});
const p=await b.newPage({viewport:{width:1194,height:834},deviceScaleFactor:2});
await p.goto("file://"+dir+"/f-sidebar.html",{waitUntil:"load"});
for(const s of ["incl","vip","vipnobkf"]){
  await p.evaluate((st)=>window.set(st), s);
  await p.screenshot({path:dir+"/shot-f-"+s+".png",animations:"disabled"});
}
await p.evaluate(()=>{window.set("vip");document.getElementById('stage').classList.add('collapsed');});
await p.screenshot({path:dir+"/shot-f-collapsed.png",animations:"disabled"});
await b.close();
console.log("done");
