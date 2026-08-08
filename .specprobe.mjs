import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3211";
function resolveChromium() {
  const root = "/opt/pw-browsers";
  for (const d of readdirSync(root).filter((x) => x.startsWith("chromium-")).sort().reverse()) {
    const p = join(root, d, "chrome-linux", "chrome");
    if (existsSync(p)) return p;
  }
}
const mk = (roomNumber, name, adults, children, packageCode, extra = {}) => ({
  roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: `9${roomNumber}`,
  name, arrivalDate: "19/07/26", departureDate: "22/07/26", reservationStatus: "CKIN",
  adults, children, rateCode: "", packageCode, ...extra,
});
const C = {
  vipNoPdj: mk("524", "SEDALO, TETE", 2, 2, "", { isVip: true, vipLevel: "VIP" }),
  included: mk("619", "DAVID, JULIE", 1, 0, "BKF INC"),
  comp: mk("701", "MARCHAND, LUC", 2, 0, "BKF COMP"),
  walkIn: mk("905", "GARCIA, MARIA", 2, 0, "BKF INC", { vipSource: "walk_in" }),
};
const PAST = (c) => [{
  date: "2026-05-22", closedAt: "x", totalRooms: 1, totalGuests: 2, totalEntered: 0,
  totalRemaining: 2, totalVip: 1, clients: [{ ...c, roomNumber: "210" }], checkIns: [], rawUploadText: "",
}];

const browser = await chromium.launch({ headless: true, executablePath: resolveChromium(), args: ["--disable-dev-shm-usage", "--no-sandbox"] });

async function open(client, { dark = false, history = null, checkIns = [], w = 1194, h = 834, lang = "fr" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/upload`, { waitUntil: "load" });
  await page.evaluate(({ client, history, dark, checkIns, lang }) => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("dailyData_" + today, JSON.stringify({ date: today, clients: [client], checkIns, rawUploadText: "" }));
    if (history) localStorage.setItem("sessionHistory", JSON.stringify(history)); else localStorage.removeItem("sessionHistory");
    localStorage.setItem("app-dark", dark ? "true" : "false");
    localStorage.setItem("app-lang", lang);
  }, { client, history, dark, checkIns, lang });
  await page.goto(`${BASE}/checkin/${client.roomNumber}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  return { ctx, page };
}

const SMALL = `() => [...document.querySelectorAll('button,a,[role="button"],input,select,textarea,summary')]
  .map((el) => { const r = el.getBoundingClientRect();
    return { t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\\s+/g,' ').slice(0, 32), w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter((e) => (e.w > 0 || e.h > 0) && (e.w < 44 || e.h < 44))`;

const REDS = `() => {
  const isRed = (s) => { const n = (s.match(/[\\d.]+/g)||[]).map(Number); if (n.length<3 || (n[3]!==undefined && n[3]<0.15)) return false;
    const [r,g,b]=n; return r>110 && r>g*1.5 && r>b*1.5; };
  const out=[];
  for (const el of document.querySelectorAll('*')) {
    const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    if (r.width<3||r.height<3) continue;
    if (cs.visibility==='hidden'||cs.opacity==='0') continue;
    const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if (isRed(cs.backgroundColor)) out.push({kind:'bg', c:cs.backgroundColor, t:el.textContent.trim().slice(0,40), tag:el.tagName});
    if (isRed(cs.color) && (hasText || el.tagName.toLowerCase()==='svg')) out.push({kind:'fg', c:cs.color, t:el.textContent.trim().slice(0,40)||'<svg>', tag:el.tagName});
    if (isRed(cs.borderTopColor) && parseFloat(cs.borderTopWidth)>0) out.push({kind:'border', c:cs.borderTopColor, t:el.textContent.trim().slice(0,30), tag:el.tagName});
  }
  return out;
}`;

const log = (...a) => console.log(...a);

{
  const { ctx, page } = await open(C.vipNoPdj);
  const cta = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('button')];
    const b = bs.find(x => /Enregistrer|Check In/.test(x.textContent.trim()));
    if (!b) return { found: false, all: bs.map(x=>x.textContent.trim().slice(0,20)) };
    const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
    return { found: true, text: b.textContent.trim(), bg: cs.backgroundColor, bgImg: cs.backgroundImage, rect: {t:Math.round(r.top),b:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)}, ih: innerHeight,
      testid: b.getAttribute('data-testid'), type: b.type, radius: cs.borderRadius };
  });
  log("[1] CTA:", JSON.stringify(cta));
  log("[1] small:", JSON.stringify(await page.evaluate(SMALL)));
  log("[1] reds:", JSON.stringify(await page.evaluate(REDS)));
  log("[1] pressed:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map(b=>({t:b.textContent.trim(), p:b.getAttribute('aria-pressed'), bg:getComputedStyle(b).backgroundColor, sh:getComputedStyle(b).boxShadow.slice(0,70)})))));
  log("[1] aside:", JSON.stringify(await page.evaluate(() => { const a=document.querySelector('aside'); const r=a.getBoundingClientRect(); return {x:Math.round(r.x), w:Math.round(r.width), inView:r.right>0&&r.left<innerWidth, text:a.innerText.replace(/\n/g,' | ').slice(0,150)}; })));
  await ctx.close();
}

{
  const { ctx, page } = await open(C.included);
  await page.evaluate(() => { const btns=[...document.querySelectorAll('main button')]; btns[1].click(); });
  await page.waitForTimeout(400);
  log("[2] first-visit aside:", JSON.stringify(await page.evaluate(() => { const a=document.querySelector('aside'); const r=a.getBoundingClientRect(); return {x:Math.round(r.x), inView:r.right>0&&r.left<innerWidth, text:a.innerText.replace(/\n/g,' | ')}; })));
  log("[2] small(drawer):", JSON.stringify(await page.evaluate(SMALL)));
  await ctx.close();
}

{
  const ci = [{ id: "x1", roomNumber: "524", clientName: "SEDALO, TETE", peopleEntered: 1, timestamp: new Date().toISOString(), paymentAction: "room" }];
  const { ctx, page } = await open(C.vipNoPdj, { history: PAST(C.vipNoPdj), checkIns: ci });
  log("[3] aside:", JSON.stringify(await page.evaluate(() => { const a=document.querySelector('aside'); const r=a.getBoundingClientRect(); return {x:Math.round(r.x), inView:r.right>0&&r.left<innerWidth, text:a.innerText.replace(/\n/g,' | ').slice(0,220)}; })));
  log("[3] small:", JSON.stringify(await page.evaluate(SMALL)));
  log("[3] reds:", JSON.stringify(await page.evaluate(REDS)));
  await ctx.close();
}

{
  const { ctx, page } = await open(C.vipNoPdj);
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='524'); b && b.click(); });
  await page.waitForTimeout(300);
  log("[4a] editingRoom small:", JSON.stringify(await page.evaluate(SMALL)));
  await ctx.close();
}
{
  const { ctx, page } = await open(C.vipNoPdj);
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/Adultes/.test(x.textContent)); b && b.click(); });
  await page.waitForTimeout(300);
  log("[4b] editingPeople small:", JSON.stringify(await page.evaluate(SMALL)));
  await ctx.close();
}

{
  const { ctx, page } = await open(C.comp);
  const txt = await page.evaluate(() => document.body.innerText);
  log("[5] COMP text:", JSON.stringify(txt.replace(/\n/g,' | ').slice(0,300)));
  log("[5] euro:", /€/.test(txt), "price:", /\d+[.,]\d{2}/.test(txt), "payBtns:", await page.evaluate(() => document.querySelectorAll('button[aria-pressed]').length));
  await ctx.close();
}

{
  const { ctx, page } = await open(C.walkIn);
  log("[6] walkIn pay:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map(b=>b.textContent.trim()))));
  log("[6] walkIn NON INCLUS:", await page.evaluate(() => /NON INCLUS/i.test(document.body.innerText)));
  await ctx.close();
}

{
  const ci = [{ id: "y1", roomNumber: "619", clientName: "DAVID, JULIE", peopleEntered: 1, timestamp: new Date().toISOString() }];
  const { ctx, page } = await open(C.included, { checkIns: ci });
  log("[7] allDone body:", JSON.stringify((await page.evaluate(()=>document.body.innerText)).replace(/\n/g,' | ').slice(0,220)));
  log("[7] CTA present:", await page.evaluate(() => [...document.querySelectorAll('button')].some(b=>/Enregistrer/.test(b.textContent))));
  await ctx.close();
}

{
  const { ctx, page } = await open(C.vipNoPdj, { dark: true, history: PAST(C.vipNoPdj) });
  log("[8] html class:", await page.evaluate(()=>document.documentElement.className));
  log("[8] dark reds:", JSON.stringify(await page.evaluate(REDS)));
  log("[8] dark small:", JSON.stringify(await page.evaluate(SMALL)));
  log("[8] dark pressed bg:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed="true"]')].map(b=>({bg:getComputedStyle(b).backgroundColor, sh:getComputedStyle(b).boxShadow.slice(0,80), col:getComputedStyle(b).color})))));
  await ctx.close();
}

{
  const { ctx, page } = await open(C.vipNoPdj, { lang: "en" });
  log("[9] en buttons:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button')].map(b=>b.textContent.trim().slice(0,20)).filter(Boolean))));
  await ctx.close();
}

for (const [w,h] of [[1194,520],[390,844],[744,1133],[390,600]]) {
  const { ctx, page } = await open(C.vipNoPdj, { w, h });
  const r = await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/Enregistrer/.test(x.textContent)); if(!b) return null; const q=b.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(q.x+q.width/2), Math.round(q.y+q.height/2));
    return {t:Math.round(q.top),b:Math.round(q.bottom),h:Math.round(q.height),w:Math.round(q.width),ih:innerHeight, hitIsCta: hit===b || b.contains(hit)}; });
  log(`[10] ${w}x${h} CTA:`, JSON.stringify(r));
  await ctx.close();
}

await browser.close();
