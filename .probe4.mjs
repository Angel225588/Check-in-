import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const EXEC = execSync("ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1").toString().trim();
const BASE='http://localhost:3611';
const OUT='/tmp/claude-0/-home-user-Check-in-/159d0f90-f426-5dcb-a28d-47aabc380874/scratchpad';
const today=new Date().toISOString().split('T')[0];

const mk=o=>({roomNumber:'412',roomType:'KING',rtc:'',confirmationNumber:'88123456',
 name:'MARTIN DUBOIS',arrivalDate:'25JUL',departureDate:'29JUL',reservationStatus:'IN',
 adults:2,children:1,rateCode:'RACK',packageCode:'',...o});
const SCEN={ pay:[mk({})], inc:[mk({roomNumber:'413',packageCode:'BKF INC'})],
             vip:[mk({roomNumber:'414',isVip:true,vipLevel:'PLATINUM'})] };

const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const L=([r,g,b])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const CR=(a,b)=>{const x=L(a),y=L(b),hi=Math.max(x,y),lo=Math.min(x,y);return (hi+0.05)/(lo+0.05);};
const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
const r2=x=>Math.round(x*100)/100;
const HIDE=`*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}
svg{visibility:hidden!important}`;

const all=[];

async function shootPlate(page,name){
  const p=`${OUT}/p4-${name}.png`;
  await page.addStyleTag({content:HIDE});
  await page.waitForTimeout(250);
  await page.screenshot({path:p});
  return fs.readFileSync(p).toString('base64');
}

async function run(dark){
  const b=await chromium.launch({executablePath:EXEC});
  const ctx=await b.newContext({viewport:{width:1280,height:900},colorScheme:dark?'dark':'light',deviceScaleFactor:1});

  for(const [name,clients] of Object.entries(SCEN)){
    for(const openSidebar of [false,true]){
      const page=await ctx.newPage();
      await page.goto(BASE+'/upload',{waitUntil:'domcontentloaded'});
      await page.evaluate(([t,c,d])=>{localStorage.setItem('dailyData_'+t,JSON.stringify({date:t,clients:c,checkIns:[],rawUploadText:''}));localStorage.setItem('app-dark',d?'true':'false');},[today,clients,dark]);
      await page.goto(BASE+'/checkin/'+clients[0].roomNumber,{waitUntil:'networkidle'});
      await page.waitForTimeout(600);
      if(openSidebar){ try{await page.locator('main button').nth(1).click({timeout:1500});await page.waitForTimeout(450);}catch{} }

      const targets=await page.evaluate((openSidebar)=>{
        const scope = openSidebar ? 'aside' : 'main';
        const root = document.querySelector(scope);
        if(!root) return [];
        const leaf=t=>[...root.querySelectorAll('*')].filter(e=>{
          const own=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('');
          return own.includes(t);
        })[0];
        const items=[];
        const add=(label,el,kind)=>{ if(!el)return; const r=el.getBoundingClientRect();
          if(r.width<2||r.height<2)return; const cs=getComputedStyle(el);
          items.push({label,kind,rect:[r.x,r.y,r.width,r.height],fg:cs.color,
            bgCss:cs.backgroundColor,bgImg:cs.backgroundImage.slice(0,70),
            fontSize:parseFloat(cs.fontSize),fontWeight:cs.fontWeight,shadow:cs.boxShadow.slice(0,140)}); };
        if(!openSidebar){
          add('CTA "Enregistrer"',[...root.querySelectorAll('button')].pop(),'text');
          add('NON-INCLUS pill',leaf('NON INCLUS'),'text');
          const pays=[...root.querySelectorAll('button[aria-pressed]')];
          pays.forEach((p,i)=>{const st=p.getAttribute('aria-pressed')==='true'?'ACTIVE':'idle';
            add('pay-'+st+' BOX '+i,p,'box'); add('pay-'+st+' label '+i,p.querySelector('span'),'text');});
          add('inclus heading',leaf('Petit-déjeuner inclus')||leaf('Petit-déjeuner offert'),'text');
          add('inclus sub',leaf('Rien à encaisser'),'text');
          add('inclus icon halo',root.querySelector('span[style*="aur-good-soft"]'),'box');
          add('amber title',leaf('NON inclus'),'text');
          add('amber sub',leaf('Demandez au client'),'text');
          add('amber box',root.querySelector('div[style*="linear-gradient(90deg"]'),'box');
          add('roomNumber',root.querySelector('button[class*="64px"]'),'text');
          add('guestName',root.querySelector('h2'),'text');
          add('vipChip PLATINUM',leaf('PLATINUM'),'text');
          add('arrivalChip 25JUL',leaf('25JUL'),'text');
          add('tile label Adultes',leaf('Adultes'),'text');
          add('backBtn label',leaf('Recherche'),'text');
          add('remaining counter',leaf('restant')||leaf(' sur '),'text');
        } else {
          add('sidebar Activité',leaf('Activité'),'text');
          add('premiere visite chip',leaf('Première visite'),'text');
          add('sidebar empty msg',leaf('Aucune activité'),'text');
          add('sidebar close X',root.querySelector('button[aria-label]'),'box');
        }
        return items;
      }, openSidebar);
      if(!targets.length){ await page.close(); continue; }

      const png=await shootPlate(page,name+'-'+(dark?'d':'l')+'-'+(openSidebar?'side':'main'));
      const sampled=await page.evaluate(async([png,targets])=>{
        const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
        const cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
        const g=cv.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
        const P=(x,y)=>{const d=g.getImageData(Math.max(0,Math.min(img.width-1,Math.round(x))),Math.max(0,Math.min(img.height-1,Math.round(y))),1,1).data;return [d[0],d[1],d[2]];};
        return targets.map(t=>{const[x,y,w,h]=t.rect;const cy=y+h/2;
          const sweep=[0.25,0.4,0.5,0.6,0.75].map(f=>P(x+w*f,cy));
          return {...t,bgMid:P(x+w/2,cy),sweep};});
      },[png,targets]);
      all.push({scen:name,dark,zone:openSidebar?'sidebar':'main',rows:sampled});
      await page.close();
    }
  }
  await b.close();
}
await run(false); await run(true);

for(const s of all){
  console.log('\n##### '+s.scen+' / '+(s.dark?'DARK':'LIGHT')+' / '+s.zone);
  for(const d of s.rows){
    const fg=(d.fg.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const large=d.fontSize>=24||(d.fontSize>=18.66&&parseInt(d.fontWeight)>=700);
    const need=d.kind==='box'?3:(large?3:4.5);
    let worst=Infinity,wb=null;
    for(const p of d.sweep){const c=CR(fg,p);if(c<worst){worst=c;wb=p;}}
    const flag=d.kind==='box'?'    ':(worst>=need?' ok ':'FAIL');
    console.log(flag+' '+String(r2(worst)).padStart(6)+':1 (need '+String(need).padEnd(4)+') '+d.label.padEnd(24)+
      ' fg='+hex(fg)+' bgWorst='+hex(wb)+' bgMid='+hex(d.bgMid)+'  '+d.fontSize+'px/'+d.fontWeight+
      (d.kind==='box'?' [BOX bg]':''));
  }
}
fs.writeFileSync(OUT+'/probe4.json',JSON.stringify(all,null,1));
