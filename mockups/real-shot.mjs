import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const BASE="http://localhost:3200"; const dir="/home/user/Check-in-/mockups";
const today=new Date().toISOString().split("T")[0];
const client={roomNumber:"524",roomType:"DLXK",rtc:"",confirmationNumber:"9524",name:"SEDALO, TETE",arrivalDate:"19/07/26",departureDate:"22/07/26",reservationStatus:"CKIN",adults:2,children:2,rateCode:"",packageCode:"",isVip:true,vipLevel:"VIP"};
const hist=[{date:"2026-05-22",closedAt:"x",totalRooms:1,totalGuests:2,totalEntered:0,totalRemaining:2,totalVip:1,clients:[{...client,roomNumber:"210"}],checkIns:[],rawUploadText:""}];
async function seed(page,withHist){await page.evaluate(({today,client,hist,withHist})=>{localStorage.setItem("dailyData_"+today,JSON.stringify({date:today,clients:[client],checkIns:[],rawUploadText:""}));if(withHist)localStorage.setItem("sessionHistory",JSON.stringify(hist));else localStorage.removeItem("sessionHistory");},{today,client,hist,withHist});}
const b=await chromium.launch({headless:true,executablePath:exe});
async function shot(w,h,withHist,name){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});const p=await ctx.newPage();await p.goto(BASE+"/upload",{waitUntil:"load"});await seed(p,withHist);await p.goto(BASE+"/checkin/524",{waitUntil:"networkidle"});await p.waitForSelector("text=524",{timeout:8000}).catch(()=>{});await p.waitForTimeout(500);await p.screenshot({path:dir+"/"+name+".png"});await ctx.close();console.log("shot",name);}
await shot(1194,834,true,"real-tablet-habitue");
await shot(1194,834,false,"real-tablet-first");
await shot(390,844,true,"real-phone");
await b.close();console.log("done");
