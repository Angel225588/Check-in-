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
    // open the activity sidebar so its nodes are on-screen
    try { await page.locator('main button').nth(1).click({ timeout: 1500 }); await page.waitForTimeout(450); } catch {}

    const shotPath = `${OUT}/v2-${name}-${dark?'dark':'light'}.png`;
    await page.screenshot({ path: shotPath });
    const png = fs.readFileSync(shotPath).toString('base64');

    const rows = await page.evaluate(async ([png]) => {
      const img = new Image(); img.src = 'data:image/png;base64,'+png; await img.decode();
      const cv = document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
      const g = cv.getContext('2d', { willReadFrequently:true }); g.drawImage(img,0,0);

      // modal background colour of an element's interior: sample a grid, take the
      // most frequent colour (glyphs are a minority of pixels).
      function bgOf(el) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
        const w = Math.min(Math.round(r.width), img.width-x0), h = Math.min(Math.round(r.height), img.height-y0);
        if (w<3||h<3) return null;
        // inset 25% to dodge rounded corners / borders
        const ix = Math.round(w*0.25), iy = Math.round(h*0.25);
        const sx = x0+ix, sy = y0+iy, sw = Math.max(1,w-2*ix), sh = Math.max(1,h-2*iy);
        const d = g.getImageData(sx, sy, sw, sh).data;
        const cnt = new Map();
        for (let i=0;i<d.length;i+=4) {
          const k = d[i]+','+d[i+1]+','+d[i+2];
          cnt.set(k,(cnt.get(k)||0)+1);
        }
        let best=null,bn=0; for (const [k,n] of cnt) if (n>bn){bn=n;best=k;}
        return best.split(',').map(Number);
      }
      function darkestOf(el) { // darkest pixel = glyph core (for light-on-dark check we take lightest)
        return null;
      }
      const parse = s => (s.match(/-?[\d.]+/g)||[]).map(Number);

      const out = [];
      const add = (label, el, threshold) => {
        if (!el) { out.push({label, missing:true}); return; }
        el.scrollIntoView({block:'center'});
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out.push({
          label, threshold,
          fgCss: cs.color, bgCss: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0,90),
          fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight,
          bgPixel: bgOf(el), rect:[r.x,r.y,r.width,r.height],
          text: (el.textContent||'').trim().slice(0,40),
          shadow: cs.boxShadow.slice(0,120),
          borderColor: cs.borderTopColor, borderWidth: cs.borderTopWidth,
        });
      };
      const leaf = (txt) => [...document.querySelectorAll('main *, aside *')]
        .filter(e => (e.textContent||'').trim().includes(txt))
        .sort((a,b)=>a.textContent.length-b.textContent.length)[0];

      add('CTA', [...document.querySelectorAll('main button')].pop(), 3);
      add('NONINCLUS-pill', leaf('NON INCLUS'), 4.5);
      const pays = [...document.querySelectorAll('button[aria-pressed]')];
      pays.forEach((p,i)=>add('pay'+i+'-'+(p.getAttribute('aria-pressed')==='true'?'ACTIVE':'idle'), p, 3));
      pays.forEach((p,i)=>add('payLabel'+i+'-'+(p.getAttribute('aria-pressed')==='true'?'ACTIVE':'idle'), p.querySelector('span'), 4.5));
      add('inclus-head', leaf('Petit-déjeuner inclus') || leaf('Petit-déjeuner offert'), 4.5);
      add('inclus-sub', leaf('Rien à encaisser'), 4.5);
      add('inclus-iconwrap', document.querySelector('main span[style*="aur-good-soft"]'), 3);
      add('amber-title', leaf('à encaisser —') || leaf('NON inclus'), 4.5);
      add('amber-sub', leaf('Demandez au client'), 4.5);
      add('amber-banner', document.querySelector('main div[style*="FFF4E0"]'), 3);
      add('roomNumber', document.querySelector('main button[class*="64px"]'), 3);
      add('guestName', document.querySelector('main h2'), 3);
      add('vipChip', leaf('PLATINUM'), 4.5);
      add('arrivalChip', leaf('25JUL'), 4.5);
      add('tileLabel', leaf('Adultes'), 4.5);
      add('tileValue', leaf('Adultes')?.parentElement?.children[1], 3);
      add('backLabel', leaf('Recherche'), 4.5);
      add('remainingCounter', leaf(' de ') || leaf('restant'), 4.5);
      add('sidebar-title', leaf('Activité'), 4.5);
      add('premiereVisite', leaf('Première visite'), 4.5);
      add('sidebar-empty', leaf('Aucune activité'), 4.5);
      return out;
    }, [png]);

    all.push({ scen:name, dark, rows });
  }
  await b.close();
}

await run(false);
await run(true);

for (const s of all) {
  console.log('\n##### ' + s.scen + ' / ' + (s.dark?'DARK':'LIGHT'));
  for (const d of s.rows) {
    if (d.missing) { console.log('  -- ' + d.label + ': not present'); continue; }
    const fg = (d.fgCss.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const bp = d.bgPixel;
    let cr = bp ? r2(CR(fg, bp)) : null;
    const large = d.fontSize >= 24 || (d.fontSize >= 18.66 && parseInt(d.fontWeight) >= 700);
    const need = d.threshold === 3 ? 3 : (large ? 3 : 4.5);
    const verdict = cr == null ? '  ??  ' : (cr >= need ? ' pass ' : ' FAIL ');
    console.log(verdict + String(cr).padStart(6)+':1 need '+String(need).padEnd(4)+' '+d.label.padEnd(22)+
      ' fg='+hex(fg)+' bgPX='+(bp?hex(bp):'--')+' bgCSS='+String(d.bgCss).slice(0,26).padEnd(26)+
      ' '+d.fontSize+'px/'+d.fontWeight+' "'+d.text+'"');
  }
}
fs.writeFileSync(OUT+'/probe2.json', JSON.stringify(all,null,1));
