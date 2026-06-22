import { chromium } from "playwright";
const BASE = "https://check-in-pdj.vercel.app";
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const HIDE = "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}";
const b = await chromium.launch();
const p = await b.newContext({viewport:{width:430,height:932},deviceScaleFactor:2}).then(c=>c.newPage());
await p.goto(`${BASE}/debug`,{waitUntil:"networkidle"}); await sleep(1500);
await p.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(b=>/seed mock data/i.test(b.textContent)); if(x)x.click();});
await sleep(2500);
const room = await p.evaluate(()=>{
  const today=new Date().toISOString().split("T")[0];
  const raw=localStorage.getItem("dailyData_"+today); if(!raw) return null;
  const d=JSON.parse(raw);
  const re=/BKF\s*(INC|GRP|EXCL|COMP|GTT)|UPS\s*F?\s*PDJ/;
  const c=(d.clients||[]).find(c=> c.vipSource==="list_only"||c.vipSource==="walk_in" || !re.test((c.packageCode||"").toUpperCase().replace(/\s+/g," ")));
  return c? c.roomNumber : null;
});
console.log("room needing payment:", room);
if(room){
  await p.goto(`${BASE}/checkin/${room}`,{waitUntil:"networkidle"}); await sleep(1800);
  await p.addStyleTag({content:HIDE}).catch(()=>{}); await sleep(400);
  await p.screenshot({path:"docs/img/prod-breakfast-banner.png"});
  console.log("saved");
} else console.log("no room found");
await b.close();
