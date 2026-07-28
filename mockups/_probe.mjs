import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs"; import { join } from "path";
const root="/opt/pw-browsers";
const exe=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().map(d=>join(root,d,"chrome-linux","chrome")).find(existsSync);
const b=await chromium.launch({headless:true,executablePath:exe,args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage({viewport:{width:1194,height:834},colorScheme:"dark"});
await p.goto("http://localhost:4120/upload",{waitUntil:"load"});
await p.evaluate(()=>{const d=new Date().toISOString().split("T")[0];
 localStorage.setItem("dailyData_"+d,JSON.stringify({date:d,clients:[{roomNumber:"224",roomType:"D",rtc:"",confirmationNumber:"9",name:"POLANCO/ANGEL",arrivalDate:"27/07/26",departureDate:"29/07/26",reservationStatus:"CKIN",adults:2,children:1,rateCode:"",packageCode:"BKF INC",isVip:true,vipLevel:"VIP"}],checkIns:[],rawUploadText:"",discrepancies:[]}));
 localStorage.setItem("app-dark","true");});
await p.goto("http://localhost:4120/checkin/224",{waitUntil:"networkidle"});
await p.waitForTimeout(700);
const tog=p.locator('[data-role="activity-toggle"]');
if(await tog.isVisible().catch(()=>false)){await tog.click();await p.waitForTimeout(300);}
await p.locator('[data-role="side-tab-notes"]').click();
await p.waitForTimeout(500);
const boxes = await p.evaluate(()=>{
  const out=[];
  for (const sel of ['aside','[data-role="side-tab-notes"]','[data-role="notes-expand"]','[data-role="note-new"]']) {
    const el=document.querySelector(sel); if(!el){out.push([sel,null]);continue;}
    const r=el.getBoundingClientRect(); out.push([sel,{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}]);
  }
  const aside=document.querySelector('aside');
  return {out, overflow: aside ? aside.scrollHeight>aside.clientHeight+1 : null};
});
console.log(JSON.stringify(boxes,null,1));
await b.close();
