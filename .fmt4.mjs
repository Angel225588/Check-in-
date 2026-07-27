import fs from 'node:fs';
const P='/tmp/claude-0/-home-user-Check-in-/159d0f90-f426-5dcb-a28d-47aabc380874/scratchpad/';
const all=JSON.parse(fs.readFileSync(P+'probe4.json','utf8'));
const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const L=a=>0.2126*lin(a[0])+0.7152*lin(a[1])+0.0722*lin(a[2]);
const CR=(a,b)=>{const x=L(a),y=L(b),hi=Math.max(x,y),lo=Math.min(x,y);return (hi+0.05)/(lo+0.05);};
const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
const r2=x=>Math.round(x*100)/100;
let o='';
for(const s of all){
 o+='\n##### '+s.scen+' / '+(s.dark?'DARK':'LIGHT')+' / '+s.zone+'\n';
 for(const d of s.rows){
  const fg=(d.fg.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
  const large=d.fontSize>=24||(d.fontSize>=18.66&&parseInt(d.fontWeight)>=700);
  const need=d.kind==='box'?3:(large?3:4.5);
  let worst=Infinity,wb=null;
  for(const p of d.sweep){const c=CR(fg,p);if(c<worst){worst=c;wb=p;}}
  const flag=d.kind==='box'?'    ':(worst>=need?' ok ':'FAIL');
  o+=flag+' '+String(r2(worst)).padStart(6)+':1 (need '+String(need).padEnd(4)+') '+d.label.padEnd(22)+' fg='+hex(fg)+' bgWorst='+hex(wb)+' bgMid='+hex(d.bgMid)+'  '+d.fontSize+'px/'+d.fontWeight+(d.kind==='box'?' [BOX]':'')+'\n';
 }
}
fs.writeFileSync(P+'report4.txt', o);
