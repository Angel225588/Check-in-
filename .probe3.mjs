import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const EXEC = execSync("ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1").toString().trim();
const BASE = 'http://localhost:3517';
const OUT = '/tmp/claude-0/-home-user-Check-in-/159d0f90-f426-5dcb-a28d-47aabc380874/scratchpad';
const today = new Date().toISOString().split('T')[0];

const mk = o => ({ roomNumber:'412', roomType:'KING', rtc:'', confirmationNumber:'88123456',
  name:'MARTIN DUBOIS', arrivalDate:'25JUL', departureDate:'29JUL', reservationStatus:'IN',
  adults:2, children:1, rateCode:'RACK', packageCode:'', ...o });

const SCEN = {
  pay: [mk({})],
  inc: [mk({ roomNumber:'413', packageCode:'BKF INC' })],
  vip: [mk({ roomNumber:'414', isVip:true, vipLevel:'PLATINUM' })],
};

const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const CR = (a,b) => { const x=L(a),y=L(b),hi=Math.max(x,y),lo=Math.min(x,y); return (hi+0.05)/(lo+0.05); };
const hex = c => '#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
const r2 = x => Math.round(x*100)/100;

const HIDE_TEXT = `*, *::before, *::after {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
}
svg { visibility: hidden !important; }`;

const all = [];

async function run(dark) {
  const b = await chromium.launch({ executablePath: EXEC });
  const ctx = await b.newContext({ viewport:{width:1280,height:900}, colorScheme: dark?'dark':'light', deviceScaleFactor:1 });
  const page = await ctx.newPage();

  for (const [name, clients] of Object.entries(SCEN)) {
    await page.goto(BASE+'/upload', { waitUntil:'domcontentloaded' });
    await page.evaluate(([t,c,d]) => {
      localStorage.setItem('dailyData_'+t, JSON.stringify({date:t, clients:c, checkIns:[], rawUploadText:''}));
      localStorage.setItem('app-dark', d?'true':'false');
    }, [today, clients, dark]);
    await page.goto(BASE+'/checkin/'+clients[0].roomNumber, { waitUntil:'networkidle' });
    await page.waitForTimeout(700);
    try { await page.locator('main button').nth(1).click({ timeout:1500 }); await page.waitForTimeout(400); } catch {}

    // 1. collect targets (rects + computed colours) WITH text visible
    const targets = await page.evaluate(() => {
      const leaf = t => [...document.querySelectorAll('main *, aside *')]
        .filter(e => (e.textContent||'').trim().includes(t) && e.children.length <= 1)
        .sort((a,b)=>a.textContent.length-b.textContent.length)[0];
      const items = [];
      const add = (label, el, kind) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width<2||r.height<2) return;
        const cs = getComputedStyle(el);
        items.push({ label, kind, rect:[r.x,r.y,r.width,r.height],
          fg: cs.color, bgCss: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0,80),
          fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight,
          shadow: cs.boxShadow.slice(0,130) });
      };
      add('CTA label', [...document.querySelectorAll('main button')].pop(), 'text');
      add('NON-INCLUS pill', leaf('NON INCLUS'), 'text');
      const pays=[...document.querySelectorAll('button[aria-pressed]')];
      pays.forEach((p,i)=>{
        const st = p.getAttribute('aria-pressed')==='true'?'ACTIVE':'idle';
        add('pay-'+st+'-box'+i, p, 'box');
        add('pay-'+st+'-label'+i, p.querySelector('span'), 'text');
      });
      add('inclus-head', leaf('Petit-déjeuner inclus')||leaf('Petit-déjeuner offert'), 'text');
      add('inclus-sub', leaf('Rien à encaisser'), 'text');
      add('inclus-icon-halo', document.querySelector('main span[style*="aur-good-soft"]'), 'box');
      add('amber-title', leaf('à encaisser'), 'text');
      add('amber-sub', leaf('Demandez au client'), 'text');
      add('amber-box', document.querySelector('main div[style*="linear-gradient(90deg"]'), 'box');
      add('roomNumber', document.querySelector('main button[class*="64px"]'), 'text');
      add('guestName', document.querySelector('main h2'), 'text');
      add('vipChip PLATINUM', leaf('PLATINUM'), 'text');
      add('arrivalChip 25JUL', leaf('25JUL'), 'text');
      add('tile label Adultes', leaf('Adultes'), 'text');
      add('backBtn label', leaf('Recherche'), 'text');
      add('remaining counter', leaf('restant')||leaf(' sur '), 'text');
      add('sidebar Activité', leaf('Activité'), 'text');
      add('premiere visite', leaf('Première visite'), 'text');
      add('sidebar empty', leaf('Aucune activité'), 'text');
      return items;
    });

    // 2. screenshot WITHOUT text -> pure background plate
    await page.addStyleTag({ content: HIDE_TEXT });
    await page.waitForTimeout(250);
    const plate = `${OUT}/plate-${name}-${dark?'dark':'light'}.png`;
    await page.screenshot({ path: plate });
    const png = fs.readFileSync(plate).toString('base64');

    const sampled = await page.evaluate(async ([png, targets]) => {
      const img=new Image(); img.src='data:image/png;base64,'+png; await img.decode();
      const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
      const g=cv.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
      return targets.map(t => {
        const [x,y,w,h]=t.rect;
        const cx=Math.max(0,Math.min(img.width-1, Math.round(x+w/2)));
        const cy=Math.max(0,Math.min(img.height-1, Math.round(y+h/2)));
        const d=g.getImageData(cx,cy,1,1).data;
        // also a min/max luminance sweep across the element for gradients
        const xs=[0.1,0.3,0.5,0.7,0.9], px=[];
        for (const f of xs) {
          const sx=Math.max(0,Math.min(img.width-1,Math.round(x+w*f)));
          const dd=g.getImageData(sx,cy,1,1).data; px.push([dd[0],dd[1],dd[2]]);
        }
        return { ...t, bgPx:[d[0],d[1],d[2]], sweep:px };
      });
    }, [png, targets]);

    all.push({ scen:name, dark, rows:sampled });
  }
  await b.close();
}

await run(false);
await run(true);

for (const s of all) {
  console.log('\n##### ' + s.scen + ' / ' + (s.dark?'DARK':'LIGHT'));
  for (const d of s.rows) {
    const fg=(d.fg.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const large = d.fontSize>=24 || (d.fontSize>=18.66 && parseInt(d.fontWeight)>=700);
    const need = d.kind==='box' ? 3 : (large?3:4.5);
    // worst case across the gradient sweep
    let worst=Infinity, worstBg=null;
    for (const p of d.sweep) { const c=CR(fg,p); if (c<worst){worst=c;worstBg=p;} }
    const mid = CR(fg,d.bgPx);
    const ok = d.kind==='box' ? true : worst>=need;
    console.log((ok?' ok  ':'FAIL ')+String(r2(worst)).padStart(6)+':1 (mid '+String(r2(mid)).padStart(5)+') need '+String(need).padEnd(4)+
      d.label.padEnd(24)+' fg='+hex(fg)+' bgWorst='+hex(worstBg)+' bgMid='+hex(d.bgPx)+
      '  '+d.fontSize+'px/'+d.fontWeight+(d.kind==='box'?'  [BOX]':''));
  }
}
fs.writeFileSync(OUT+'/probe3.json', JSON.stringify(all,null,1));
