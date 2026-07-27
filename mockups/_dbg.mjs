import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs"; import { join } from "path";
const root="/opt/pw-browsers";
const exe=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse()
  .map(d=>join(root,d,"chrome-linux","chrome")).find(existsSync);
const b=await chromium.launch({headless:true,executablePath:exe,args:["--no-sandbox"]});
const p=await b.newPage({viewport:{width:1194,height:834}});
p.on("console",m=>{ if(m.type()==="error") console.log("CONSOLE:",m.text().slice(0,200)); });
p.on("pageerror",e=>console.log("PAGEERROR:",String(e).slice(0,300)));
await p.goto("http://localhost:4060/upload",{waitUntil:"load"});
await p.evaluate(()=>{const d=new Date().toISOString().split("T")[0];
  localStorage.setItem("dailyData_"+d,JSON.stringify({date:d,clients:[{roomNumber:"385",roomType:"",rtc:"",confirmationNumber:"",name:"DUPONT/MARIA",arrivalDate:"",departureDate:"",reservationStatus:"",adults:2,children:0,rateCode:"",packageCode:"BKF INC"}],checkIns:[],rawUploadText:"",discrepancies:[]}));});
await p.goto("http://localhost:4060/search",{waitUntil:"networkidle"});
await p.waitForTimeout(1200);
console.log("URL:",p.url());
console.log("field count:",await p.locator('[data-role="search-field"]').count());
console.log("body:",(await p.evaluate(()=>document.body.innerText)).slice(0,180).replace(/\n/g," | "));
await b.close();
