import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const EXEC=execSync("ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1").toString().trim();
const B='http://localhost:3611';
const OUT='/tmp/claude-0/-home-user-Check-in-/159d0f90-f426-5dcb-a28d-47aabc380874/scratchpad/';
const today=new Date().toISOString().split('T')[0];
const mk=o=>({roomNumber:'412',roomType:'K',rtc:'',confirmationNumber:'1',name:'MARTIN DUBOIS',
 arrivalDate:'25JUL',departureDate:'29JUL',reservationStatus:'IN',adults:2,children:1,rateCode:'R',packageCode:'',...o});
const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const L=a=>0.2126*lin(a[0])+0.7152*lin(a[1])+0.0722*lin(a[2]);
const CR=(a,b)=>{const x=L(a),y=L(b),h=Math.max(x,y),lo=Math.min(x,y);return (h+0.05)/(lo+0.05);};
const hex=a=>'#'+a.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
const r2=x=>Math.round(x*100)/100;
const HIDE=`*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important}svg{visibility:hidden!important}`;
let log='';
const br=await chromium.launch({executablePath:EXEC});
for(const cfg of [
  {n:'vip',dark:false,cl:[mk({roomNumber:'414',isVip:true,vipLevel:'PLATINUM'})]},
  {n:'inc',dark:true, cl:[mk({roomNumber:'413',packageCode:'BKF INC'})]},
  {n:'inc',dark:false,cl:[mk({roomNumber:'413',packageCode:'BKF INC'})]},
  {n:'pay',dark:true, cl:[mk({})]},
  {n:'pay',dark:false,cl:[mk({})]},
]){
  const ctx=await br.newContext({viewport:{width:1280,height:900},colorScheme:cfg.dark?'dark':'light',deviceScaleFactor:1});
  const p=await ctx.newPage();
  await p.goto(B+'/upload',{waitUntil:'domcontentloaded'});
  await p.evaluate(([t,c,d])=>{localStorage.setItem('dailyData_'+t,JSON.stringify({date:t,clients:c,checkIns:[],rawUploadText:''}));localStorage.setItem('app-dark',d?'true':'false');},[today,cfg.cl,cfg.dark]);
  await p.goto(B+'/checkin/'+cfg.cl[0].roomNumber,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1500);
  const tg=await p.evaluate(()=>{
    const m=document.querySelector('main');
    const leaf=t=>[...m.querySelectorAll('*')].filter(e=>[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').includes(t))[0];
    const it=[];const add=(l,e,k)=>{if(!e)return;const r=e.getBoundingClientRect();if(r.width<2)return;
      const cs=getComputedStyle(e);it.push({l,k,rect:[r.x,r.y,r.width,r.height],fg:cs.color,fs:parseFloat(cs.fontSize),fw:cs.fontWeight,bgc:cs.backgroundColor});};
    add('roomNumber',m.querySelector('button[class*="64px"]'),'t');
    add('guestName',m.querySelector('h2'),'t');
    add('VIP chip PLATINUM',leaf('PLATINUM'),'t');
    add('date chip 25JUL',leaf('25JUL'),'t');
    add('tile label ADULTES',leaf('Adultes'),'t');
    add('tile value',leaf('Adultes')?.parentElement?.children[1],'t');
    add('NON INCLUS pill',leaf('NON INCLUS'),'t');
    add('inclus heading',leaf('Petit-déjeuner inclus')||leaf('Petit-déjeuner offert'),'t');
    add('inclus sub',leaf('Rien à encaisser'),'t');
    add('inclus icon halo',m.querySelector('span[style*="aur-good-soft"]'),'b');
    add('CTA',[...m.querySelectorAll('button')].pop(),'t');
    add('remaining counter',leaf('restant')||leaf(' sur '),'t');
    add('back label',leaf('Recherche'),'t');
    const pays=[...m.querySelectorAll('button[aria-pressed]')];
    pays.forEach((x,i)=>{const s=x.getAttribute('aria-pressed')==='true'?'ACTIVE':'idle';
      add('pay '+s+' box'+i,x,'b'); add('pay '+s+' label'+i,x.querySelector('span'),'t');});
    add('amber title',leaf('NON inclus'),'t');
    add('amber sub',leaf('Demandez au client'),'t');
    return it;
  });
  await p.addStyleTag({content:HIDE});
  await p.waitForTimeout(300);
  const f=OUT+'plate5-'+cfg.n+(cfg.dark?'-d':'-l')+'.png';
  await p.screenshot({path:f});
  const png=fs.readFileSync(f).toString('base64');
  const sm=await p.evaluate(async([png,tg])=>{
    const im=new Image();im.src='data:image/png;base64,'+png;await im.decode();
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);
    const P=(x,y)=>{const d=g.getImageData(Math.max(0,Math.min(im.width-1,Math.round(x))),Math.max(0,Math.min(im.height-1,Math.round(y))),1,1).data;return[d[0],d[1],d[2]];};
    return tg.map(t=>{const[x,y,w,h]=t.rect;const cy=y+h/2;
      return {...t,sw:[0.2,0.35,0.5,0.65,0.8].map(f=>P(x+w*f,cy))};});
  },[png,tg]);
  log+='\n##### '+cfg.n+' '+(cfg.dark?'DARK':'LIGHT')+'\n';
  for(const d of sm){
    const fg=(d.fg.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
    const large=d.fs>=24||(d.fs>=18.66&&parseInt(d.fw)>=700);
    const need=d.k==='b'?3:(large?3:4.5);
    let w=Infinity,wb=null,best=0;
    for(const q of d.sw){const c=CR(fg,q);if(c<w){w=c;wb=q;}if(c>best)best=c;}
    log+=(d.k==='b'?'BOX ':(w>=need?' ok ':'FAIL'))+' worst='+String(r2(w)).padStart(6)+' best='+String(r2(best)).padStart(6)+
      ' need='+String(need).padEnd(4)+' '+d.l.padEnd(22)+' fg='+hex(fg)+' bg@worst='+hex(wb)+'  '+d.fs+'px/'+d.fw+'\n';
  }
  await ctx.close();
}
await br.close();
fs.writeFileSync(OUT+'report5.txt',log);
