import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const dir=process.cwd()+"/mockups";
const b=await chromium.launch({headless:true,executablePath:exe});
// deliberately SHORT height to simulate zoom / cropped screen
const p=await b.newPage({viewport:{width:1100,height:560},deviceScaleFactor:2});
await p.goto("file://"+dir+"/checkin-preview.html",{waitUntil:"load"});
await p.evaluate(()=>window.set("vipnobkf"));
// assert the button is inside the viewport
const ok=await p.evaluate(()=>{const r=document.querySelector('.enter').getBoundingClientRect();return r.bottom<=window.innerHeight+1 && r.top>=0;});
console.log("button fully visible on 560px-tall screen:", ok);
await p.screenshot({path:dir+"/shot-crop-vipnobkf.png",animations:"disabled"});
await b.close();
