import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const root="/opt/pw-browsers";
const d=readdirSync(root).filter(x=>x.startsWith("chromium-")).sort().reverse().find(x=>existsSync(join(root,x,"chrome-linux","chrome")));
const exe=join(root,d,"chrome-linux","chrome");
const BASE="http://localhost:3200"; const dir="/home/user/Check-in-/mockups";
const today=new Date().toISOString().split("T")[0];
const client={roomNumber:"524",roomType:"DLXK",rtc:"",confirmationNumber:"9524",name:"SEDALO, TETE",arrivalDate:"19/07/26",departureDate:"22/07/26",reservationStatus:"CKIN",adults:2,children:2,rateCode:"",packageCode:"",isVip:true,vipLevel:"VIP"};
// Breakfast-INCLUDED normal guest (no VIP, no payment section) — the "empty middle" case.
const incl={roomNumber:"619",roomType:"DLXK",rtc:"",confirmationNumber:"9619",name:"DAVID, JULIE",arrivalDate:"20/07/26",departureDate:"23/07/26",reservationStatus:"CKIN",adults:1,children:0,rateCode:"",packageCode:"BKF INC"};
const hist=[{date:"2026-05-22",closedAt:"x",totalRooms:1,totalGuests:2,totalEntered:0,totalRemaining:2,totalVip:1,clients:[{...client,roomNumber:"210"}],checkIns:[],rawUploadText:""}];
async function seed(page,c,withHist,dark){await page.evaluate(({today,c,hist,withHist,dark})=>{localStorage.setItem("dailyData_"+today,JSON.stringify({date:today,clients:[c],checkIns:[],rawUploadText:""}));if(withHist)localStorage.setItem("sessionHistory",JSON.stringify(hist));else localStorage.removeItem("sessionHistory");localStorage.setItem("app-dark",dark?"true":"false");},{today,c,hist,withHist,dark});}
const b=await chromium.launch({headless:true,executablePath:exe});
async function shot(w,h,c,withHist,dark,name){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,colorScheme:dark?"dark":"light"});const p=await ctx.newPage();await p.goto(BASE+"/upload",{waitUntil:"load"});await seed(p,c,withHist,dark);await p.goto(BASE+"/checkin/"+c.roomNumber,{waitUntil:"networkidle"});await p.waitForSelector("text="+c.roomNumber,{timeout:8000}).catch(()=>{});await p.waitForTimeout(500);await p.screenshot({path:dir+"/"+name+".png"});await ctx.close();console.log("shot",name);}
await shot(1194,834,client,true,false,"real-tablet-habitue");
await shot(1194,834,client,false,false,"real-tablet-first");
await shot(1194,834,incl,false,true,"real-tablet-incl-dark");
await shot(390,844,incl,false,true,"real-phone-incl-dark");
await shot(390,844,client,true,false,"real-phone");
await b.close();console.log("done");
