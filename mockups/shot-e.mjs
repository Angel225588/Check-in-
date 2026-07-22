import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir=process.cwd()+"/mockups";
const b=await chromium.launch({headless:true,executablePath:exe});
const p=await b.newPage({viewport:{width:1194,height:834},deviceScaleFactor:2});
await p.goto("file://"+dir+"/e-states.html",{waitUntil:"networkidle"});
for(const s of ["incl","vip","vipnobkf"]){
  await p.evaluate((st)=>window.set?window.set(st):document.querySelector(`.switch button[data-s="${st}"]`).click(), s);
  await p.waitForTimeout(350);
  await p.screenshot({path:dir+"/shot-e-"+s+".png"});
  console.log("shot",s);
}
await b.close();
