import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const HERE = dirname(fileURLToPath(import.meta.url));
const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const exe = readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse()
  .map(d=>join(root,d,"chrome-linux","chrome")).find(existsSync);
const BASE = process.env.BASE_URL || "http://localhost:4030";
const mk = (r,n,a,c,pk="BKF INC",x={}) => ({roomNumber:r,roomType:"DLXK",rtc:"",confirmationNumber:"9"+r,
  name:n,arrivalDate:"27/07/26",departureDate:"29/07/26",reservationStatus:"CKIN",adults:a,children:c,
  rateCode:"",packageCode:pk,...x});
const CLIENTS=[mk("224","POLANCO/ANGEL",2,1,"BKF INC",{isVip:true,vipLevel:"VIP"}),
  mk("385","DUPONT/MARIA",2,0),mk("402","WEI/CHEN",2,2,"BKF COMP"),mk("418","MARCHAND/SOFIA",1,0,""),
  mk("501","FABRE/JULIEN",2,0,"BKF INC",{isVip:true,vipLevel:"VIP"}),mk("524","SEDALO/TETE",2,2,""),
  mk("608","HADDAD/AMIRA",2,0),mk("619","DAVID/JULIE",1,0),mk("822","LEFEVRE/CLAIRE",1,0)];
const b = await chromium.launch({headless:true,executablePath:exe,args:["--no-sandbox","--disable-dev-shm-usage"]});
for (const [name,w,h,act] of [
  ["live-search",1194,834, async p=>{}],
  ["live-search-typed",1194,834, async p=>{ await p.locator('[data-role="search-field"] input').fill("385"); }],
  ["live-notes",1194,834, async p=>{
     await p.goto(BASE+"/checkin/224",{waitUntil:"networkidle"}); await p.waitForTimeout(500);
     const tog=p.locator('[data-role="activity-toggle"]');
     if(await tog.isVisible().catch(()=>false)){ await tog.click(); await p.waitForTimeout(250); }
     await p.locator('[data-role="side-tab-notes"]').click(); await p.waitForTimeout(400);
     await p.getByRole("button",{name:"Nouvelle note"}).click(); await p.waitForTimeout(300); }],
]) {
  const p = await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,colorScheme:"dark"});
  await p.goto(BASE+"/upload",{waitUntil:"load"});
  await p.evaluate((cl)=>{const d=new Date().toISOString().split("T")[0];
    localStorage.setItem("dailyData_"+d,JSON.stringify({date:d,clients:cl,checkIns:[],rawUploadText:"",discrepancies:[]}));
    localStorage.setItem("app-dark","true");},CLIENTS);
  await p.goto(BASE+"/search",{waitUntil:"networkidle"});
  await p.waitForTimeout(600);
  await act(p); await p.waitForTimeout(400);
  await p.screenshot({path:join(HERE,name+".png")});
  await p.close();
}
await b.close(); console.log("live shots written");
