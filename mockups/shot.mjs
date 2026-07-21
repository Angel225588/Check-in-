import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir=process.cwd()+"/mockups";
const b=await chromium.launch({headless:true,executablePath:exe});
const p=await b.newPage({viewport:{width:1194,height:834},deviceScaleFactor:2});
for(const f of ["a-split-cockpit","b-action-bar","c-focus-rails"]){
  await p.goto("file://"+dir+"/"+f+".html",{waitUntil:"networkidle"});
  await p.screenshot({path:dir+"/shot-"+f+".png"});
  console.log("shot",f);
}
await b.close();
