import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs"; import { join, dirname } from "path";
import { fileURLToPath } from "url";
const HERE = dirname(fileURLToPath(import.meta.url));
const root="/opt/pw-browsers";
const exe=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse()
  .map(d=>join(root,d,"chrome-linux","chrome")).find(existsSync);
const BASE=process.env.BASE_URL||"http://localhost:4110";
const mk=(r,n,a,c,pk="BKF INC",x={})=>({roomNumber:r,roomType:"DLXK",rtc:"",confirmationNumber:"9"+r,
  name:n,arrivalDate:"27/07/26",departureDate:"29/07/26",reservationStatus:"CKIN",adults:a,children:c,
  rateCode:"",packageCode:pk,...x});
const CLIENTS=[mk("224","POLANCO/ANGEL",2,1,"BKF INC",{isVip:true,vipLevel:"VIP"}),
  mk("385","DUPONT/MARIA",2,0),mk("402","WEI/CHEN",2,2,"BKF COMP"),mk("418","MARCHAND/SOFIA",1,0,""),
  mk("501","FABRE/JULIEN",2,0,"BKF INC",{isVip:true,vipLevel:"VIP"}),mk("524","SEDALO/TETE",2,2,"")];
const b=await chromium.launch({headless:true,executablePath:exe,args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage({viewport:{width:1194,height:834},deviceScaleFactor:2,colorScheme:"dark"});
await p.goto(BASE+"/upload",{waitUntil:"load"});
await p.evaluate((cl)=>{const d=new Date().toISOString().split("T")[0];
  localStorage.setItem("dailyData_"+d,JSON.stringify({date:d,clients:cl,checkIns:[],rawUploadText:"",discrepancies:[]}));
  localStorage.setItem("app-dark","true");},CLIENTS);
await p.goto(BASE+"/search",{waitUntil:"networkidle"}); await p.waitForTimeout(700);
await p.screenshot({path:join(HERE,"live-idle.png")});
await p.locator('[data-role="search-field"] input').fill("224"); await p.waitForTimeout(700);
await p.screenshot({path:join(HERE,"live-preview.png")});
await b.close(); console.log("ok");
