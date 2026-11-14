/* ptable.js: the periodic table tool of the student app (Tools > Periodic table).
   v3.js fetches ptable-data.js, ptable-notes.js and this file the first time the tool is opened, then calls
   window.__ptView(api). Everything is drawn inside v3's Shadow DOM with v3's helpers (api.push, api.redraw …).
   No library: the 3D models (atom, orbitals, trend skyline) are drawn on a plain 2D canvas. */
(function(){
'use strict';
const D=window.__PTD,N=window.__PTN;if(!D||!N)return;
const SYM=D.SYM,NAME=D.NAME;
let api,$,$$,RM=false;
const SUPD='⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup=s=>String(s).replace(/[0-9]/g,c=>SUPD[c]);
const sg=v=>v>0?'+'+v:v<0?'−'+Math.abs(v):'0';

/* ---------- position, block, family ---------- */
const POS=[],AT={};
(function(){const st=[1,3,11,19,37,55,87];
  for(let z=1;z<=118;z++){let p=7;while(st[p-1]>z)p--;const i=z-st[p-1];let r=p,c;
    if(p===1)c=z===1?1:18;else if(p<4)c=i<2?i+1:i+11;else if(p<6)c=i+1;
    else if(i<3)c=i+1;else if(i<17){r=p+3;c=i+1}else c=i-13;
    const b=r>7?'f':z===2?'s':c<=2?'s':c<=12?'d':'p';
    POS[z]={p,r,c,g:r>7?3:c,b};AT[r+','+c]=z}
})();
const S=s=>SYM.indexOf(s)+1;
const METALLOID=['B','Si','Ge','As','Sb','Te'].map(S),NONMETAL=['H','C','N','O','P','S','Se'].map(S);
const CAT={alk:'Alkali metal',aem:'Alkaline earth metal',tm:'Transition metal',pm:'Other metal',md:'Metalloid',nm:'Non-metal',hal:'Halogen',ng:'Noble gas',lan:'Lanthanoid',act:'Actinoid'};
function cat(z){const q=POS[z];if(q.b==='f')return q.p===6?'lan':'act';if(NONMETAL.includes(z))return 'nm';if(METALLOID.includes(z))return 'md';
  if(q.g===1)return 'alk';if(q.g===2)return 'aem';if(q.g===18)return 'ng';if(q.g===17)return 'hal';if(q.g>=3&&q.g<=12)return 'tm';return 'pm'}
const GAS=['H','He','N','O','F','Ne','Cl','Ar','Kr','Xe','Rn'].map(S),LIQ=['Br','Hg'].map(S);
const STATE={g:'Gas',l:'Liquid',s:'Solid',u:'Not known'};
const state=z=>z>=104?'u':GAS.includes(z)?'g':LIQ.includes(z)?'l':'s';
const BLK={s:'s-block',p:'p-block',d:'d-block',f:'f-block'};
const GNAME={1:'Alkali metals',2:'Alkaline earth metals',13:'Boron family',14:'Carbon family',15:'Nitrogen family (pnictogens)',16:'Oxygen family (chalcogens)',17:'Halogens',18:'Noble gases'};

/* ---------- electronic configuration ---------- */
const ORD=['1s','2s','2p','3s','3p','4s','3d','4p','5s','4d','5p','6s','4f','5d','6p','7s','5f','6d','7p'];
const CAP={s:2,p:6,d:10,f:14},LV='spdf';
const EXC={24:{'3d':5,'4s':1},29:{'3d':10,'4s':1},41:{'4d':4,'5s':1},42:{'4d':5,'5s':1},44:{'4d':7,'5s':1},45:{'4d':8,'5s':1},46:{'4d':10,'5s':0},47:{'4d':10,'5s':1},
  57:{'4f':0,'5d':1},58:{'4f':1,'5d':1},64:{'4f':7,'5d':1},78:{'5d':9,'6s':1},79:{'5d':10,'6s':1},
  89:{'5f':0,'6d':1},90:{'5f':0,'6d':2},91:{'5f':2,'6d':1},92:{'5f':3,'6d':1},93:{'5f':4,'6d':1},96:{'5f':7,'6d':1}};
const EXN={24:'Exception: one 4s electron moves to 3d, giving a half-filled 3d⁵ subshell, which is extra stable.',
  29:'Exception: one 4s electron moves to 3d, giving a completely filled 3d¹⁰ subshell, which is extra stable.',
  42:'Exception: 4d⁵ 5s¹ (half-filled 4d), like chromium.',47:'Exception: 4d¹⁰ 5s¹ (completely filled 4d), like copper.',79:'Exception: 5d¹⁰ 6s¹ (completely filled 5d), like copper.',
  46:'Exception: 4d¹⁰ with an empty 5s orbital. The only element whose outermost shell (n = 5) holds no electron in the ground state.',
  41:'Exception to the Aufbau order: 4d⁴ 5s¹.',44:'Exception to the Aufbau order: 4d⁷ 5s¹.',45:'Exception to the Aufbau order: 4d⁸ 5s¹.',78:'Exception to the Aufbau order: 5d⁹ 6s¹.',
  43:'The measured ground state is 4d⁵ 5s². Some textbook tables print 4d⁶ 5s¹.',
  57:'The electron enters 5d, not 4f: lanthanum is a d-block element.',58:'Exception: 4f¹ 5d¹ 6s².',64:'Exception: the electron enters 5d so that 4f stays half-filled (4f⁷).',
  89:'The electron enters 6d, not 5f: actinium is a d-block element.',90:'Exception: 6d² 7s², no 5f electron.',91:'Exception: 5f² 6d¹ 7s².',92:'Exception: 5f³ 6d¹ 7s².',93:'Exception: 5f⁴ 6d¹ 7s².',96:'Exception: the electron enters 6d so that 5f stays half-filled (5f⁷).',
  103:'NCERT writes 5f¹⁴ 6d¹ 7s². Recent measurements point to 5f¹⁴ 7s² 7p¹.'};
const byNL=(a,b)=>a[0]-b[0]||LV.indexOf(a[1])-LV.indexOf(b[1]);
function cfg(z){const o={};let e=z;for(const k of ORD){const n=Math.min(e,CAP[k[1]]);if(n>0)o[k]=n;e-=n;if(!e)break}
  const x=EXC[z];if(x)for(const k in x){if(x[k])o[k]=x[k];else delete o[k]}return o}
const NOBLE=[2,10,18,36,54,86];
const coreOf=z=>{let c=0;for(const n of NOBLE)if(n<z)c=n;return c};
const cstr=(o,keys)=>keys.map(k=>k+sup(o[k])).join(' ');
function cfgFull(z){const o=cfg(z);return cstr(o,Object.keys(o).sort(byNL))}
function outerKeys(z,o){const c=coreOf(z),ck=c?Object.keys(cfg(c)):[];return Object.keys(o).filter(k=>!ck.includes(k)).sort(byNL)}
function cfgShort(z){const o=cfg(z),c=coreOf(z);return (c?'['+SYM[c-1]+'] ':'')+cstr(o,outerKeys(z,o))}
function shells(z){const o=cfg(z),a=[];for(const k in o)a[k[0]-1]=(a[k[0]-1]||0)+o[k];return a}
const unp1=(k,n)=>{const h=CAP[k[1]]/2;return n<=h?n:2*h-n};
const unpaired=o=>Object.keys(o).reduce((s,k)=>s+unp1(k,o[k]),0);
const mu=n=>Math.sqrt(n*(n+2)).toFixed(2);
/* a positive ion: electrons leave the shell with the highest n first (ns before (n−1)d, then (n−2)f) */
function ion(z,q){const o=cfg(z);const ks=outerKeys(z,o).sort((a,b)=>b[0]-a[0]||LV.indexOf(b[1])-LV.indexOf(a[1]));let e=q;
  for(const k of ks){const n=Math.min(e,o[k]);o[k]-=n;e-=n;if(!o[k])delete o[k];if(!e)break}return o}
function ionShort(z,q){const o=ion(z,q),c=coreOf(z),ck=c?Object.keys(cfg(c)):[];const rest=Object.keys(o).filter(k=>!ck.includes(k)).sort(byNL);
  const cf=ck.every(k=>o[k]===cfg(c)[k]);if(!cf)return cstr(o,Object.keys(o).sort(byNL));return (c?'['+SYM[c-1]+']':'')+(rest.length?' '+cstr(o,rest):'')}
function valence(z){const q=POS[z],o=cfg(z);if(q.b==='f')return null;const n=q.p;let v=(o[n+'s']||0)+(o[n+'p']||0);if(q.b==='d')v=(o[n+'s']||0)+(o[(n-1)+'d']||0);return v}

/* ---------- state ---------- */
const PT={tab:'table',mode:'block',q:'',orb:'2pz',sky:'IE',cz:6,qz:{mode:'mix',cur:null,pick:-1,ok:0,n:0,left:[]}};
const TABS=[['table','Table'],['trends','Trends'],['groups','Groups and blocks'],['chapter','Chapter'],['lab','3D lab'],['quiz','Practice']];
const MODES=[['block','Blocks'],['cat','Families'],['state','State at 25 °C'],['RAD','Atomic radius'],['IE','Ionisation enthalpy'],['EN','Electronegativity'],['EA','Electron gain enthalpy'],['DEN','Density'],['MP','Melting point']];
const HEAT={RAD:['pm','Decreases left to right in a period, increases top to bottom in a group.'],
  IE:['kJ/mol','Increases left to right in a period, decreases top to bottom in a group.'],
  EN:['Pauling scale','Increases left to right in a period, decreases top to bottom in a group.'],
  EA:['kJ/mol','Darker means more energy released. Becomes more negative left to right, less negative top to bottom.'],
  DEN:['g/cm³','Highest in the middle of the 5d series (Os, Ir).'],
  MP:['K','Highest near the middle of each transition series and at carbon.']};
const hv=(k,z)=>{const v=D[k][z-1];return v==null?null:k==='EA'?-v:v};
const RANK={};
function rank(k){if(RANK[k])return RANK[k];const a=[];for(let z=1;z<=118;z++){const v=hv(k,z);v!=null&&a.push(v)}a.sort((x,y)=>x-y);const m={};
  for(let z=1;z<=118;z++){const v=hv(k,z);if(v==null)continue;let lo=a.indexOf(v),hi=a.lastIndexOf(v);m[z]=(lo+hi)/2/(a.length-1)}return RANK[k]=m}
const fmtV=(k,z)=>{const v=D[k][z-1];if(v==null)return '';if(k==='EA')return sg(v);if(k==='DEN')return v<0.01?(v*1000).toFixed(2):v<10?String(+v.toFixed(2)):String(+v.toFixed(1));return String(v)};

/* ---------- styles (inside v3's shadow root) ---------- */
const CSS=`
.pt-tabs{position:sticky;top:0;z-index:3;margin:-4px -16px 0;padding:6px 16px 10px;background:var(--bg)}
.pt-tabs .chips{margin:0 -16px;padding:0 16px}
.pt-wrap{overflow-x:auto;margin-inline:-16px;padding:2px 16px 10px;scrollbar-width:thin}
.pt-grid{display:grid;grid-template-columns:18px repeat(18,42px);grid-template-rows:16px repeat(7,48px) 10px repeat(2,48px);gap:3px;width:max-content}
.pt-gh,.pt-ph{display:grid;place-items:center;font-size:10px;color:var(--faint);font-variant-numeric:tabular-nums}
.pt-fl{display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:10.5px;color:var(--faint);text-align:right;line-height:1.15}
.pt-el{--h:var(--mut);position:relative;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;line-height:1;background:color-mix(in srgb,var(--h) 20%,var(--surface));border:1px solid color-mix(in srgb,var(--h) 30%,var(--line));transition:transform .25s var(--spring),opacity .2s}
.pt-el small{font-size:8.5px;color:var(--mut);font-weight:500}
.pt-el b{font-size:14px;font-weight:650;letter-spacing:-.02em}
.pt-el i{font-style:normal;font-size:8px;color:var(--mut);font-variant-numeric:tabular-nums;min-height:8px}
.pt-el:active{transform:scale(.9)}
.pt-el.hit{outline:2px solid var(--tx);outline-offset:1px}
.pt-el.dim{opacity:.22}
.pt-el.na{background:var(--surface);border-style:dashed}
.pt-k-s,.pt-k-alk{--h:#3f72b8}.pt-k-p{--h:#1f9a72}.pt-k-d,.pt-k-tm{--h:#c4692e}.pt-k-f{--h:#9a5fc0}
.pt-k-aem{--h:#2a9db0}.pt-k-pm{--h:#7b8794}.pt-k-md{--h:#a8a02c}.pt-k-nm{--h:#1f9a72}.pt-k-hal{--h:#d0a020}.pt-k-ng{--h:#c44f8c}.pt-k-lan{--h:#9a5fc0}.pt-k-act{--h:#c2544e}
.pt-k-g{--h:#3f72b8}.pt-k-l{--h:#c2544e}.pt-k-sd{--h:#7b8794}.pt-k-u{--h:var(--faint)}
.pt-lg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mut)}
.pt-lg span{display:inline-flex;align-items:center;gap:6px}
.pt-lg i{width:12px;height:12px;border-radius:4px;background:color-mix(in srgb,var(--h,var(--mut)) 55%,var(--surface))}
.pt-grad{height:10px;border-radius:99px;background:linear-gradient(90deg,color-mix(in srgb,var(--c2) 6%,var(--surface)),color-mix(in srgb,var(--c2) 78%,var(--surface)));border:1px solid var(--line)}
.pt-gl{display:flex;justify-content:space-between;font-size:11.5px;color:var(--faint)}
.pt-arrows{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pt-arrows div{padding:12px 14px;border-radius:16px;background:var(--surface2);display:flex;flex-direction:column;gap:2px;min-width:0}
.pt-arrows small{font-size:11.5px;color:var(--mut)}
.pt-arrows b{font-size:14px;font-weight:600;line-height:1.3}
.pt-hero{padding:0;display:grid}
.pt-hero canvas{grid-area:1/1;width:100%;height:260px;display:block;touch-action:pan-y;cursor:grab}
.pt-hero .pt-id{grid-area:1/1;align-self:start;padding:18px 20px;pointer-events:none;display:flex;flex-direction:column;gap:2px}
.pt-id .z{font-size:13px;color:var(--heroMut)}
.pt-id .sy{font-size:44px;font-weight:650;letter-spacing:-.04em;line-height:1}
.pt-id .nm{font-size:16px;font-weight:500}
.pt-id .ms{font-size:12.5px;color:var(--heroMut)}
.pt-hero .pt-sh{grid-area:1/1;align-self:end;padding:0 20px 14px;font-size:12px;color:var(--heroMut);pointer-events:none}
.pt-nav{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pt-nav button{height:44px;border-radius:14px;background:var(--surface);border:1px solid var(--line);font-size:13.5px;font-weight:500;text-align:center;padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-nav button:disabled{opacity:.35}
.pt-c{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.pt-c h3{font-size:15px;font-weight:600;letter-spacing:-.01em}
.pt-c h4{margin:4px 0 0;font-size:13px;font-weight:600;color:var(--mut)}
.pt-rows{display:flex;flex-direction:column}
.pt-rows>div{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}
.pt-rows>div:last-child{border-bottom:0;padding-bottom:0}.pt-rows>div:first-child{padding-top:0}
.pt-rows span{color:var(--mut);flex:none}
.pt-rows b{font-weight:550;text-align:right;min-width:0;overflow-wrap:anywhere}
.pt-cfg{font-size:17px;font-weight:600;letter-spacing:.01em;overflow-wrap:anywhere;line-height:1.5}
.pt-cfg2{font-size:13px;color:var(--mut);overflow-wrap:anywhere;line-height:1.6}
.pt-box{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:flex-end}
.pt-box>div{display:flex;flex-direction:column;gap:4px;align-items:center}
.pt-box small{font-size:11px;color:var(--mut)}
.pt-box span{display:flex;gap:2px}
.pt-box i{font-style:normal;width:24px;height:30px;border:1.5px solid var(--mut);border-radius:5px;display:grid;place-items:center;font-size:13px;letter-spacing:-2px;line-height:1}
.pt-ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.pt-ul li{position:relative;padding-left:16px;font-size:14px;line-height:1.55;overflow-wrap:anywhere}
.pt-ul li::before{content:"";position:absolute;left:2px;top:.62em;width:5px;height:5px;border-radius:50%;background:var(--acc2)}
.pt-ord{display:flex;flex-direction:column;gap:7px}
.pt-ord div{padding:9px 12px;border-radius:12px;background:var(--surface2);font-size:13.5px;font-weight:500;line-height:1.45;overflow-wrap:anywhere}
.pt-note{padding:10px 12px;border-radius:12px;background:var(--accSoft);color:var(--tx);font-size:13px;line-height:1.5}
.pt-list{display:flex;flex-direction:column;gap:10px}
.pt-it{display:flex;align-items:center;gap:12px;padding:14px 16px;width:100%}
.pt-it>span:first-child{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.pt-it b{font-size:15px;font-weight:600}
.pt-it small{font-size:12.5px;color:var(--mut);line-height:1.4}
.pt-it em{font-style:normal;color:var(--faint);font-size:20px;flex:none}
.pt-nb{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.pt-nb th{font-weight:500;color:var(--mut);text-align:right;padding:0 0 8px 6px;font-size:12px}
.pt-nb th:first-child,.pt-nb td:first-child{text-align:left;padding-left:0}
.pt-nb td{padding:8px 0 8px 6px;border-top:1px solid var(--line);text-align:right}
.pt-nb tr.me td{font-weight:650}
.pt-nb button{font-weight:600;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--line)}
.pt-ch{display:flex;flex-direction:column;gap:6px}
.pt-ch svg{width:100%;height:auto;display:block;overflow:visible}
.pt-ch text{font-family:var(--f);fill:var(--mut);font-size:10px}
.pt-ch text.v{fill:var(--tx);font-size:9.5px;font-weight:600}
.pt-ch small{font-size:12.5px;color:var(--mut)}
.pt-cv{width:100%;display:block;border-radius:18px;background:var(--surface2);touch-action:pan-y;cursor:grab}
.pt-q{font-size:16px;font-weight:600;line-height:1.45}
.pt-opts{display:flex;flex-direction:column;gap:8px}
.pt-opts button{padding:13px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surface);font-size:14.5px;line-height:1.4;overflow-wrap:anywhere}
.pt-opts button.ok{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,var(--surface));font-weight:600}
.pt-opts button.no{border-color:var(--err);background:color-mix(in srgb,var(--err) 12%,var(--surface))}
.pt-mn{display:flex;flex-direction:column;gap:2px;padding:10px 0;border-bottom:1px solid var(--line)}
.pt-mn:last-child{border-bottom:0}
.pt-mn small{font-size:12px;color:var(--mut)}.pt-mn b{font-size:14.5px;font-weight:600}.pt-mn span{font-size:13.5px;color:var(--mut)}
.pt-in{display:flex;gap:8px;align-items:center}
.pt-in input{flex:1;min-width:0;height:46px;border-radius:14px;border:1px solid var(--line);background:var(--surface2);padding:0 14px;font-size:16px;outline:none}
.pt-out{font-size:14.5px;line-height:1.6}
.pt-out b{font-weight:650}
@media (min-width:900px){.pt-grid{grid-template-columns:18px repeat(18,minmax(42px,1fr));width:100%}.pt-hero canvas{height:320px}}
`;
function ensureCss(){const r=api.root;if(!r||r.getElementById('ptcss'))return;const s=document.createElement('style');s.id='ptcss';s.textContent=CSS;r.appendChild(s)}
const tok=k=>{try{return getComputedStyle(api.root.host).getPropertyValue(k).trim()}catch(e){return ''}};

/* ---------- small builders ---------- */
const ul=a=>`<ul class="pt-ul">${a.map(x=>`<li>${x}</li>`).join('')}</ul>`;
const card=(h,b)=>`<div class="card pt-c">${h?`<h3>${h}</h3>`:''}${b}</div>`;
const rows=a=>`<div class="pt-rows">${a.filter(Boolean).map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
const tabsBar=()=>`<div class="pt-tabs"><div class="chips">${TABS.map(([k,l])=>`<button class="${k===PT.tab?'on':''}" data-a="ptTab" data-k="${k}">${l}</button>`).join('')}</div></div>`;
const elBtn=(z,t)=>`<button data-a="ptEl" data-z="${z}">${t||SYM[z-1]}</button>`;

/* ---------- table ---------- */
function cellStyle(z){const m=PT.mode,q=POS[z];if(m==='block')return ['pt-k-'+q.b,''];if(m==='cat')return ['pt-k-'+cat(z),''];
  if(m==='state'){const s=state(z);return ['pt-k-'+(s==='s'?'sd':s),'']}
  const t=rank(m)[z];if(t==null)return ['na',''];return ['',`background:color-mix(in srgb,var(--c2) ${Math.round(6+t*72)}%,var(--surface));border-color:color-mix(in srgb,var(--c2) ${Math.round(20+t*60)}%,var(--line))`]}
function gridHTML(){let h='';const heat=!!HEAT[PT.mode];
  for(let g=1;g<=18;g++)h+=`<span class="pt-gh" style="grid-row:1;grid-column:${g+1}">${g}</span>`;
  for(let p=1;p<=7;p++)h+=`<span class="pt-ph" style="grid-row:${p+1};grid-column:1">${p}</span>`;
  h+=`<span class="pt-fl" style="grid-row:10;grid-column:1/5">Lanthanoids<br>4f</span><span class="pt-fl" style="grid-row:11;grid-column:1/5">Actinoids<br>5f</span>`;
  for(let z=1;z<=118;z++){const q=POS[z],[c,s]=cellStyle(z);
    h+=`<button class="pt-el ${c}" style="grid-row:${q.r>7?q.r+1:q.r+1};grid-column:${q.c+1};${s}" data-a="ptEl" data-z="${z}" aria-label="${NAME[z-1]}, atomic number ${z}"><small>${z}</small><b>${SYM[z-1]}</b><i>${heat?fmtV(PT.mode,z):''}</i></button>`}
  return h}
function legendHTML(){const m=PT.mode;
  if(m==='block')return `<div class="pt-lg">${['s','p','d','f'].map(b=>`<span><i class="pt-k-${b}"></i>${BLK[b]}</span>`).join('')}</div><p class="hint">Helium is 1s² (an s-block configuration) but sits in group 18 with the noble gases. La and Ac are d-block; the 14 elements after each form the f-block (NCERT).</p>`;
  if(m==='cat')return `<div class="pt-lg">${Object.keys(CAT).map(k=>`<span><i class="pt-k-${k}"></i>${CAT[k]}</span>`).join('')}</div>`;
  if(m==='state')return `<div class="pt-lg"><span><i class="pt-k-sd"></i>Solid</span><span><i class="pt-k-l"></i>Liquid (Br, Hg)</span><span><i class="pt-k-g"></i>Gas (11 elements)</span><span><i class="pt-k-u"></i>Not known</span></div>`;
  const [u,note]=HEAT[m];return `<div class="pt-grad"></div><div class="pt-gl"><span>${m==='EA'?'less energy released':'low'}</span><span>${u}</span><span>${m==='EA'?'more energy released':'high'}</span></div><p class="hint">${note} Cells with a dashed border have no reliable value.</p>`}
function tableTab(){return `<label class="sbox">${api.ic('search',18)}<input id="ptq" type="search" placeholder="Search by name, symbol or atomic number" value="${api.esc3(PT.q)}" aria-label="Search elements" autocomplete="off"></label>
  <div class="chips" role="group" aria-label="Colour the table by">${MODES.map(([k,l])=>`<button class="${k===PT.mode?'on':''}" data-a="ptMode" data-k="${k}">${l}</button>`).join('')}</div>
  <div class="pt-wrap"><div class="pt-grid" id="ptgrid">${gridHTML()}</div></div>
  <div class="stack" style="gap:10px" id="ptleg">${legendHTML()}</div>
  <div class="pt-arrows"><div><small>Left to right in a period</small><b>Size and metallic character fall. Ionisation enthalpy, electronegativity and non-metallic character rise.</b></div><div><small>Top to bottom in a group</small><b>Size and metallic character rise. Ionisation enthalpy and electronegativity fall.</b></div></div>
  <p class="hint">Tap an element for its configuration, properties, 3D atom model and exam notes. Swipe the table sideways to see all 18 groups.</p>`}
function tableAfter(){const i=$('#ptq');if(!i)return;
  const f=()=>{PT.q=i.value.trim().toLowerCase();const q=PT.q;let first=null;
    $$('#ptgrid .pt-el').forEach(b=>{const z=+b.dataset.z,m=!q||String(z)===q||SYM[z-1].toLowerCase()===q||(q.length>1&&NAME[z-1].toLowerCase().includes(q));b.classList.toggle('dim',!m);b.classList.toggle('hit',!!q&&m);if(q&&m&&!first)first=b});
    first&&first.scrollIntoView({block:'nearest',inline:'center',behavior:RM?'auto':'smooth'});return first};
  i.oninput=f;i.onkeydown=e=>{if(e.key==='Enter'){const b=f();if(b){e.preventDefault();openEl(+b.dataset.z)}}};if(PT.q)f()}

/* ---------- one element ---------- */
function boxHTML(z){const o=cfg(z),ks=outerKeys(z,o);if(!ks.length)ks.push('1s');
  return `<div class="pt-box">${ks.map(k=>{const n=CAP[k[1]]/2,c=o[k]||0;let b='';for(let j=0;j<n;j++){const up=c>j,dn=c>n+j;b+=`<i>${up?'↑':''}${dn?'↓':''}</i>`}return `<div><span>${b}</span><small>${k}</small></div>`}).join('')}</div>`}
function ionsHTML(z){const q=POS[z];if(!(q.b==='d'||q.b==='f'&&q.p===6||z===57))return '';
  const st=D.OX[z-1].split(',').filter(x=>x[0]==='+').map(x=>+x.slice(1)).filter((x,i,a)=>a.indexOf(x)===i).sort((a,b)=>a-b);if(!st.length||z>=104)return '';
  const r=st.map(n=>{const o=ion(z,n),u=unpaired(o);return `<tr><td>${SYM[z-1]}${sup(n===1?'':n)}⁺</td><td>${ionShort(z,n)}</td><td>${u}</td>${q.b==='d'?`<td>${u?mu(u):'0'}</td>`:''}</tr>`}).join('');
  return card('Its ions',`<table class="pt-nb"><thead><tr><th>Ion</th><th>Configuration</th><th>Unpaired e⁻</th>${q.b==='d'?'<th>μ (BM)</th>':''}</tr></thead><tbody>${r}</tbody></table>
   <p class="hint">${q.b==='d'?'The ns electrons are lost before the (n−1)d electrons. μ is the spin-only magnetic moment √[n(n + 2)]. An ion with no unpaired electron is diamagnetic and (for d⁰ or d¹⁰) colourless.':'6s and 5d electrons are lost before 4f. An ion with f⁰ or f¹⁴ is diamagnetic and colourless.'}</p>`)}
function neighHTML(z){const q=POS[z];const ns=[['Left',AT[q.r+','+(q.c-1)]],['Right',AT[q.r+','+(q.c+1)]],['Above',q.r<=7?AT[(q.r-1)+','+q.c]:0],['Below',q.r<7?AT[(q.r+1)+','+q.c]:0]].filter(x=>x[1]);
  if(!ns.length)return '';const v=(k,y)=>fmtV(k,y)||'–';
  const row=(l,y,me)=>`<tr class="${me?'me':''}"><td>${me?SYM[y-1]:elBtn(y)} <span style="color:var(--faint);font-weight:400">${l}</span></td><td>${v('RAD',y)}</td><td>${v('IE',y)}</td><td>${v('EN',y)}</td></tr>`;
  return card('Compared with its neighbours',`<table class="pt-nb"><thead><tr><th>Element</th><th>Radius (pm)</th><th>IE₁ (kJ/mol)</th><th>EN</th></tr></thead><tbody>${row('this element',z,1)}${ns.map(([l,y])=>row(l.toLowerCase(),y)).join('')}</tbody></table>
   <p class="hint">Tap a neighbour to open it. Use the table to see a trend and its exceptions with real numbers.</p>`)}
function grKey(z){const q=POS[z];if(q.b==='f')return 'f';if(q.b==='d')return 'd';if(z===1)return null;return 'g'+q.g}
function elView(z){const i=z-1,q=POS[z];
  return {t:NAME[i],s:`${SYM[i]} · Z = ${z} · ${CAT[cat(z)]}`,html:()=>{
    const o=cfg(z),sh=shells(z),u=unpaired(o),val=valence(z),st=state(z),k=grKey(z),gr=k&&N.GR.find(g=>g.k===k);
    const mp=D.MP[i],bp=D.BP[i],den=D.DEN[i],ea=D.EA[i],yr=D.YR[i],notes=N.EL[SYM[i]];
    const tK=v=>`${v} K (${v-273} °C)`;
    const last=q.b==='f'?(q.p-2)+'f':q.b==='d'?(q.p-1)+'d':z===2?'1s':q.p+q.b;
    return `<div class="hero pt-hero"><canvas id="ptAtom" aria-label="3D shell model of ${NAME[i]}"></canvas>
      <div class="pt-id"><span class="z">${z}</span><span class="sy">${SYM[i]}</span><span class="nm">${NAME[i]}</span><span class="ms">${D.MASS[i]} u</span></div>
      <div class="pt-sh">Shells ${'KLMNOPQ'.split('').slice(0,sh.length).map((l,j)=>l+' '+(sh[j]||0)).join(' · ')}${RM?'':' · drag to turn'}</div></div>
     <div class="pt-nav"><button data-a="ptEl" data-z="${z-1}" data-r="1" ${z===1?'disabled':''}>‹ ${z>1?(z-1)+' '+NAME[i-1]:''}</button><button data-a="ptEl" data-z="${z+1}" data-r="1" ${z===118?'disabled':''}>${z<118?(z+1)+' '+NAME[i+1]:''} ›</button></div>
     ${card('Position in the table',rows([['Period',q.p],['Group',q.b==='f'?'3 (f-block row)':q.g+(GNAME[q.g]&&z!==1?' · '+GNAME[q.g]:'')],['Block',BLK[q.b]+(z===2?' (placed in group 18)':'')],['Family',CAT[cat(z)]],
        ['State at 25 °C',STATE[st]],val!=null?['Valence electrons',val]:null])+(q.g===12?'<p class="pt-note">Group 12 (Zn, Cd, Hg) is in the d-block but is not regarded as transition metals: the d subshell is full in the atom and in the common ion.</p>':'')+(z===1?'<p class="pt-note">Hydrogen is placed in group 1 because of its 1s¹ configuration, but it is a non-metal and is not an alkali metal.</p>':''))}
     ${card('Electronic configuration',`<div class="pt-cfg">${cfgShort(z)}</div><div class="pt-cfg2">${cfgFull(z)}</div>${boxHTML(z)}
        ${rows([['Electrons per shell',sh.map(x=>x||0).join(', ')],['Unpaired electrons',u],['Subshell being filled',last],['Magnetic nature of the atom',u?'Paramagnetic':'Diamagnetic']])}
        ${EXN[z]?`<p class="pt-note">${EXN[z]}</p>`:''}${z>=104?'<p class="hint">Predicted configuration: only a few atoms of this element have ever been made.</p>':''}`)}
     ${card('Properties',rows([['Atomic mass',D.MASS[i]+' u'],D.RAD[i]!=null?['Atomic radius',D.RAD[i]+' pm']:null,D.IE[i]!=null?['First ionisation enthalpy',D.IE[i]+' kJ/mol']:null,
        ea!=null?['Electron gain enthalpy',sg(ea)+' kJ/mol']:null,D.EN[i]!=null?['Electronegativity (Pauling)',D.EN[i]]:null,D.OX[i]?['Common oxidation states',D.OX[i].split(',').join(', ')]:null,
        mp!=null?['Melting point',tK(mp)]:null,bp!=null?['Boiling point',tK(bp)]:null,den!=null?['Density',den<0.01?(+(den*1000).toFixed(3))+' g/L (gas, 0 °C)':den+' g/cm³']:null,
        ['Discovered',yr?yr:'Known since ancient times']])+
        `<p class="hint">Radius: metallic for metals, covalent for non-metals, van der Waals for noble gases. NCERT rounds electronegativity (C 2.5, N 3.0, O 3.5, F 4.0); the Trends tab uses the NCERT values.${D.OX[i]?' The first oxidation state listed is the most common.':''}${D.MASS[i][0]==='['?' The mass in brackets is the mass number of the most stable isotope.':''}</p>`)}
     ${notes?card('Exam notes',ul(notes)):''}
     ${ionsHTML(z)}
     ${neighHTML(z)}
     ${gr?`<button class="card pt-it" data-a="ptGr" data-k="${k}"><span><b>${gr.t}</b><small>Family notes: trends, reactions and compounds</small></span><em>›</em></button>`:''}`},
   after:()=>atomStart(z)}}
function openEl(z,rep){if(z<1||z>118)return;const v=elView(z);if(rep){api.replaceTop(v)}else api.push(v)}

/* ---------- charts (plain SVG bars) ---------- */
function bars(title,zs,k){const vals=zs.map(z=>D[k][z-1]),mx=Math.max(...vals.map(v=>Math.abs(v||0)))||1,W=320,H=118,bw=Math.min(34,(W-10)/zs.length-6),step=(W-10)/zs.length;
  let g='';zs.forEach((z,i)=>{const v=vals[i],x=5+i*step+(step-bw)/2;if(v==null){g+=`<text x="${x+bw/2}" y="${H-22}" text-anchor="middle">–</text>`}else{const h=Math.max(3,Math.abs(v)/mx*70),pos=k==='EA'&&v>0;
    g+=`<rect x="${x.toFixed(1)}" y="${(H-18-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${pos?'var(--c1)':'var(--c2)'}" fill-opacity="${pos?.45:.85}"/><text class="v" x="${(x+bw/2).toFixed(1)}" y="${(H-22-h).toFixed(1)}" text-anchor="middle">${k==='EA'?sg(v):v}</text>`}
    g+=`<text x="${(x+bw/2).toFixed(1)}" y="${H-5}" text-anchor="middle">${SYM[z-1]}</text>`});
  return `<div class="pt-ch"><small>${title}</small><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}: ${zs.map((z,i)=>SYM[z-1]+' '+(vals[i]==null?'no value':vals[i])).join(', ')}">${g}</svg></div>`}
const NC_EN={Li:1.0,Be:1.5,B:2.0,C:2.5,N:3.0,O:3.5,F:4.0,Na:0.9,Mg:1.2,Al:1.5,Si:1.8,P:2.1,S:2.5,Cl:3.0,K:0.8,Rb:0.8,Cs:0.7,Br:2.8,I:2.5};
function chartsHTML(t){const k=t.ch;if(!k)return '';const seq=(a,b)=>{const r=[];for(let z=a;z<=b;z++)r.push(z);return r};
  const g=n=>{const r=[];for(let z=1;z<=86;z++)POS[z].g===n&&POS[z].b!=='f'&&z!==1&&r.push(z);return r};
  let sets=[['Period 2',seq(3,k==='EN'?9:10)],['Period 3',seq(11,k==='EN'?17:18)],['Group 1',g(1)],['Group 17',g(17).slice(0,4)]];
  if(k==='EA')sets=[['Period 2',seq(3,10)],['Group 17',g(17).slice(0,4)],['Group 16',g(16)],['Group 18',g(18)]];
  if(k==='EN'){const o=D.EN;D.EN=o.map((v,i)=>NC_EN[SYM[i]]!=null?NC_EN[SYM[i]]:v);const h=sets.map(([l,zs])=>bars(l,zs,k)).join('');D.EN=o;return card('Numbers ('+t.unit+', NCERT values)',h)}
  return card('Numbers ('+t.unit+')',sets.map(([l,zs])=>bars(l,zs,k)).join('')+(k==='EA'?'<p class="hint">Orange bars: energy released (negative value). Blue bars: energy absorbed (positive value). A dash means the value is close to zero or positive and not listed by NCERT.</p>':''))}

/* ---------- trends, groups, chapter ---------- */
function trendsTab(){return `<div class="pt-arrows"><div><small>Left to right →</small><b>Nuclear charge rises, same shell: atoms shrink and hold electrons tighter.</b></div><div><small>Top to bottom ↓</small><b>A new shell each time: atoms grow and hold electrons more loosely.</b></div></div>
  <div class="pt-list">${N.TR.map((t,i)=>`<button class="card pt-it" data-a="ptTr" data-i="${i}"><span><b>${t.t}</b><small>${[t.lr&&'Across: '+t.lr,t.tb&&'Down: '+t.tb].filter(Boolean).join(' · ')||'Why it happens and what to remember'}</small></span><em>›</em></button>`).join('')}</div>`}
function trView(i){const t=N.TR[i];return {t:t.t,s:'Periodic trend',html:()=>`
  ${t.lr||t.tb?`<div class="pt-arrows">${t.lr?`<div><small>Left to right in a period</small><b>${t.lr}</b></div>`:''}${t.tb?`<div><small>Top to bottom in a group</small><b>${t.tb}</b></div>`:''}</div>`:''}
  ${card('What it is',`<p style="font-size:14px;line-height:1.6">${t.def}</p>`)}
  ${card('Why',ul(t.why))}
  ${t.exc.length?card('Exceptions and special cases',ul(t.exc)):''}
  ${chartsHTML(t)}
  ${t.ord.length?card('Orders and facts to remember',`<div class="pt-ord">${t.ord.map(x=>`<div>${x}</div>`).join('')}</div>`):''}
  ${t.jee?card('For JEE',ul(t.jee)):''}
  ${t.ch?`<button class="card pt-it" data-a="ptSee" data-k="${t.ch}"><span><b>See it on the table</b><small>Colour all 118 elements by this property</small></span><em>›</em></button>`:''}
  <div class="pt-nav"><button data-a="ptTr" data-i="${i-1}" data-r="1" ${i?'':'disabled'}>‹ Previous</button><button data-a="ptTr" data-i="${i+1}" data-r="1" ${i<N.TR.length-1?'':'disabled'}>Next ›</button></div>`}}
function groupsTab(){return `<div class="pt-list">${N.GR.map(g=>`<button class="card pt-it" data-a="ptGr" data-k="${g.k}"><span><b>${g.t}</b><small>${g.mem}</small></span><em>›</em></button>`).join('')}</div>
  ${card('Lines to remember the groups',N.MN.map(m=>`<div class="pt-mn"><small>${m[0]}</small><b>${m[1]}</b><span>${m[2]}</span></div>`).join(''))}`}
function grView(k){const g=N.GR.find(x=>x.k===k);const zs=[];if(g.g)for(let z=1;z<=118;z++)POS[z].g===g.g&&POS[z].b!=='f'&&z!==1&&zs.push(z);
  const tb=zs.length?card('Members',`<div class="pt-wrap" style="padding-bottom:2px"><table class="pt-nb" style="min-width:430px"><thead><tr><th>Element</th><th>Configuration</th><th>Radius</th><th>IE₁</th><th>EN</th><th>M.p. (K)</th></tr></thead><tbody>${zs.map(z=>`<tr><td>${elBtn(z,z+' '+SYM[z-1])}</td><td>${cfgShort(z)}</td><td>${fmtV('RAD',z)||'–'}</td><td>${fmtV('IE',z)||'–'}</td><td>${fmtV('EN',z)||'–'}</td><td>${fmtV('MP',z)||'–'}</td></tr>`).join('')}</tbody></table></div><p class="hint">Radius in pm, first ionisation enthalpy in kJ/mol. Tap an element to open it.</p>`):'';
  return {t:g.t,s:g.mem,html:()=>`${card('',rows([['General configuration',g.cfg],['Oxidation states',g.ox]]))}${tb}${g.secs.map(([h,a])=>card(h,ul(a))).join('')}`}}
function chapterTab(){return `<div class="pt-list">${N.CH.map((c,i)=>`<button class="card pt-it" data-a="ptCh" data-i="${i}"><span><b>${c.t}</b><small>${c.secs.map(s=>s[0]).join(' · ')}</small></span><em>›</em></button>`).join('')}</div>
  <p class="hint">Follows NCERT Class 11 "Classification of Elements and Periodicity in Properties". Read the six parts in order, then use Trends and Practice.</p>`}
function iupac(n){const R=['nil','un','bi','tri','quad','pent','hex','sept','oct','enn'],d=String(n).split('').map(Number);let s='';
  d.forEach((x,i)=>{s+=x===9&&d[i+1]===0?'en':R[x]});s+=/i$/.test(s)?'um':'ium';return [s[0].toUpperCase()+s.slice(1),d.map((x,i)=>i?R[x][0]:R[x][0].toUpperCase()).join('')]}
function posOut(z){if(!(z>=1&&z<=118))return 'Enter an atomic number from 1 to 118.';const q=POS[z];
  const how=q.b==='s'?(z===2?'helium is placed with the noble gases':'group = number of ns electrons'):q.b==='p'?'group = 10 + ns and np electrons':q.b==='d'?'group = (n−1)d + ns electrons':'f-block elements belong to group 3';
  return `<b>${NAME[z-1]} (${SYM[z-1]})</b>: ${cfgShort(z)}<br>Period <b>${q.p}</b>, group <b>${q.g}</b>, <b>${BLK[q.b]}</b> (${how}).`}
function chView(i){const c=N.CH[i],w=/Position/.test(c.t)?'pos':/Naming/.test(c.t)?'iup':'';
  return {t:c.t,s:'Chapter',html:()=>`${c.secs.map(([h,a])=>card(h,ul(a))).join('')}
   ${w==='pos'?card('Try it',`<div class="pt-in"><input id="ptPosIn" type="number" inputmode="numeric" min="1" max="118" value="${PT.cz}" aria-label="Atomic number"><button class="btn sm" data-a="ptPosOpen">Open element</button></div><div class="pt-out" id="ptPosOut">${posOut(PT.cz)}</div>`):''}
   ${w==='iup'?card('Name any atomic number',`<div class="pt-in"><input id="ptIupIn" type="number" inputmode="numeric" min="100" max="999" value="119" aria-label="Atomic number from 100 to 999"></div><div class="pt-out" id="ptIupOut"></div>`)+card('Elements 101 to 118',`<div class="pt-wrap" style="padding-bottom:2px"><table class="pt-nb" style="min-width:380px"><thead><tr><th>Z</th><th>Systematic name</th><th>Symbol</th><th>Official name</th></tr></thead><tbody>${Array.from({length:18},(_,j)=>101+j).map(z=>{const [n,s]=iupac(z);return `<tr><td>${z}</td><td>${n}</td><td>${s}</td><td>${elBtn(z,NAME[z-1]+' ('+SYM[z-1]+')')}</td></tr>`}).join('')}</tbody></table></div>`):''}
   <div class="pt-nav"><button data-a="ptCh" data-i="${i-1}" data-r="1" ${i?'':'disabled'}>‹ Previous</button><button data-a="ptCh" data-i="${i+1}" data-r="1" ${i<N.CH.length-1?'':'disabled'}>Next ›</button></div>`,
   after:()=>{const p=$('#ptPosIn');if(p)p.oninput=()=>{PT.cz=+p.value;$('#ptPosOut').innerHTML=posOut(PT.cz)};
     const u=$('#ptIupIn');if(u){const f=()=>{const n=Math.floor(+u.value);if(!(n>=100&&n<=999)){$('#ptIupOut').textContent='Enter a number from 100 to 999.';return}const [nm,sy]=iupac(n);
       $('#ptIupOut').innerHTML=`<b>${nm}</b>, symbol <b>${sy}</b>${n<=118?`<br>Official name: ${NAME[n-1]} (${SYM[n-1]})`:n>118?'<br>Not discovered yet.':''}`};u.oninput=f;f()}}}}

/* ---------- 3D: shared helpers ---------- */
function setup(id,h){const c=$('#'+id);if(!c)return null;const w=c.clientWidth||320;h=h||c.clientHeight||260;const d=Math.min(2,window.devicePixelRatio||1);c.width=Math.round(w*d);c.height=Math.round(h*d);const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);return {c,x,w,h}}
function rot(x,y,z,ya,pi){const c=Math.cos(ya),s=Math.sin(ya),X=x*c-y*s,Y=x*s+y*c,c2=Math.cos(pi),s2=Math.sin(pi);return [X,Y*c2-z*s2,Y*s2+z*c2]}
function drag(c,st){let px=null,py=0;c.onpointerdown=e=>{px=e.clientX;py=e.clientY;st.hold=1;try{c.setPointerCapture(e.pointerId)}catch(_){}c.style.cursor='grabbing'};
  c.onpointermove=e=>{if(px===null)return;st.ya+=(e.clientX-px)*.011;st.pi=Math.max(st.lo,Math.min(st.hi,st.pi+(e.clientY-py)*.007));px=e.clientX;py=e.clientY;st.dirty=1};
  c.onpointerup=c.onpointercancel=c.onpointerleave=()=>{px=null;st.hold=0;c.style.cursor='grab'}}
/* one loop per canvas; it ends by itself when the canvas leaves the page. With "reduce motion" it only redraws after a drag. */
function loop(c,st,draw,spin){let last=0,first=1;const f=t=>{if(!c.isConnected)return;const dt=last?Math.min(50,t-last):16;last=t;
    if(spin&&!RM){if(!st.hold)st.ya+=dt*spin;st.t=(st.t||0)+dt;draw()}else if(first||st.dirty){draw()}first=0;st.dirty=0;requestAnimationFrame(f)};requestAnimationFrame(f)}

/* ---------- 3D atom (shell model) ---------- */
function atomStart(z){const s=setup('ptAtom');if(!s)return;const {c,x,w,h}=s,sh=shells(z).map(v=>v||0),n=sh.length,st={ya:.5,pi:.35,lo:-.9,hi:1.2,t:0};
  const gold=tok('--acc1')||'#e6cf9a',cx=w*.62,cy=h*.5,R=Math.min(w*.36,h*.44),r0=Math.max(9,R*.13),dr=(R-r0-4)/n;
  const tilt=sh.map((_,i)=>[1.15+i*.47,i*1.05]);
  const pt=(i,a)=>{const r=r0+dr*(i+1),[tx,tz]=tilt[i];let px=r*Math.cos(a),py=r*Math.sin(a)*Math.cos(tx),pz=r*Math.sin(a)*Math.sin(tx);
    const c1=Math.cos(tz),s1=Math.sin(tz);return rot(px*c1-py*s1,px*s1+py*c1,pz,st.ya,st.pi)};
  const draw=()=>{x.clearRect(0,0,w,h);const SEG=56,far=[],near=[];
    for(let i=0;i<n;i++){let p=pt(i,0);for(let j=1;j<=SEG;j++){const q=pt(i,j/SEG*6.2832);((p[1]+q[1])/2>0?far:near).push([p,q]);p=q}}
    const els=[];for(let i=0;i<n;i++){const sp=(st.t||0)*.0011/(1+i*.55);for(let j=0;j<sh[i];j++)els.push(pt(i,sp+j/sh[i]*6.2832+i))}
    const line=(a,al)=>{x.strokeStyle='rgba(255,255,255,'+al+')';x.lineWidth=1;x.beginPath();for(const [p,q] of a){x.moveTo(cx+p[0],cy-p[2]);x.lineTo(cx+q[0],cy-q[2])}x.stroke()};
    const dots=f=>{for(const e of els){if(e[1]>0!==f)continue;const k=1-e[1]/(R*2.4),r=Math.max(1.6,(n>5?2.5:3.3)*k);x.globalAlpha=f?.55:1;x.fillStyle=gold;x.beginPath();x.arc(cx+e[0],cy-e[2],r,0,6.2832);x.fill()}x.globalAlpha=1};
    line(far,.13);dots(true);
    const g=x.createRadialGradient(cx-r0*.3,cy-r0*.3,r0*.1,cx,cy,r0);g.addColorStop(0,'#fff');g.addColorStop(.35,gold);g.addColorStop(1,'rgba(150,110,40,.9)');
    x.fillStyle=g;x.beginPath();x.arc(cx,cy,r0,0,6.2832);x.fill();
    x.fillStyle='rgba(0,0,0,.62)';x.font='600 '+Math.max(8,r0*.72)+'px system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(z+'+',cx,cy+.5);
    line(near,.3);dots(false)};
  drag(c,st);loop(c,st,draw,.00028)}

/* ---------- 3D orbitals (dot-density model) ---------- */
const E=Math.exp;
const ORB=[
 ['1s','1s',1,0,(x,y,z,r)=>E(-r),5,'A sphere. No node. Electron density is highest at the nucleus and falls away smoothly.'],
 ['2s','2s',2,0,(x,y,z,r)=>(2-r)*E(-r/2),13,'A sphere with one spherical (radial) node. The two colours are regions where the wave function has opposite sign.'],
 ['3s','3s',3,0,(x,y,z,r)=>(27-18*r+2*r*r)*E(-r/3),26,'A sphere with two spherical (radial) nodes.'],
 ['2px','2p_x',2,1,(x,y,z,r)=>x*E(-r/2),13,'A dumb-bell along the x axis. One nodal plane, the yz plane, passes through the nucleus.'],
 ['2py','2p_y',2,1,(x,y,z,r)=>y*E(-r/2),13,'A dumb-bell along the y axis. One nodal plane, the xz plane.'],
 ['2pz','2p_z',2,1,(x,y,z,r)=>z*E(-r/2),13,'A dumb-bell along the z axis. One nodal plane, the xy plane. The three 2p orbitals have the same energy (degenerate).'],
 ['3pz','3p_z',3,1,(x,y,z,r)=>z*(6-r)*E(-r/3),24,'A dumb-bell along z with one extra spherical node, so each lobe has a small inner part of opposite sign.'],
 ['3dxy','3d_xy',3,2,(x,y,z,r)=>x*y*E(-r/3),24,'Four lobes lying between the x and y axes. Two nodal planes: xz and yz.'],
 ['3dyz','3d_yz',3,2,(x,y,z,r)=>y*z*E(-r/3),24,'Four lobes lying between the y and z axes. Two nodal planes: xy and xz.'],
 ['3dxz','3d_xz',3,2,(x,y,z,r)=>x*z*E(-r/3),24,'Four lobes lying between the x and z axes. Two nodal planes: xy and yz.'],
 ['3dx2','3d_x²−y²',3,2,(x,y,z,r)=>(x*x-y*y)*E(-r/3),24,'Four lobes along the x and y axes. Two nodal planes at 45° to those axes.'],
 ['3dz2','3d_z²',3,2,(x,y,z,r)=>(3*z*z-r*r)*E(-r/3),24,'Two lobes along the z axis and a ring (doughnut) in the xy plane. It has no nodal plane; its two angular nodes are cones.']];
const CLOUD={};
const olab=s=>s.replace(/_(.+)$/,'<sub>$1</sub>'),otxt=s=>s.replace('_','');
function cloud(o){if(CLOUD[o[0]])return CLOUD[o[0]];const f=o[4],R=o[5],P=[];let mx=0;const rnd=()=>(Math.random()*2-1)*R;
  for(let i=0;i<6000;i++){const x=rnd(),y=rnd(),z=rnd(),v=f(x,y,z,Math.hypot(x,y,z));if(v*v>mx)mx=v*v}
  let tries=0;while(P.length<2600&&tries++<900000){const x=rnd(),y=rnd(),z=rnd(),r=Math.hypot(x,y,z);if(r>R)continue;const v=f(x,y,z,r);if(Math.random()*mx<v*v)P.push([x/R,y/R,z/R,v>0])}
  return CLOUD[o[0]]=P}
function orbStart(){const s=setup('ptOrb',300);if(!s)return;const {c,x,w,h}=s,o=ORB.find(q=>q[0]===PT.orb)||ORB[0],P=cloud(o),st={ya:.6,pi:.3,lo:-1.2,hi:1.4};
  const cA=tok('--c1')||'#3f72b8',cB=tok('--c2')||'#c4692e',cm=tok('--mut')||'#666',cx=w/2,cy=h/2,k=Math.min(w,h)*.44;
  const draw=()=>{x.clearRect(0,0,w,h);
    [['x',1,0,0],['y',0,1,0],['z',0,0,1]].forEach(a=>{const p=rot(a[1]*1.08,a[2]*1.08,a[3]*1.08,st.ya,st.pi),q=rot(-a[1]*1.08,-a[2]*1.08,-a[3]*1.08,st.ya,st.pi);x.strokeStyle=cm;x.globalAlpha=.35;x.lineWidth=1;x.beginPath();x.moveTo(cx+q[0]*k,cy-q[2]*k);x.lineTo(cx+p[0]*k,cy-p[2]*k);x.stroke();
      x.globalAlpha=.9;x.fillStyle=cm;x.font='500 11px system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(a[0],cx+p[0]*k*1.06,cy-p[2]*k*1.06)});
    for(const p of P){const q=rot(p[0],p[1],p[2],st.ya,st.pi),d=1-q[1]*.35;x.globalAlpha=Math.max(.18,Math.min(.9,.55*d));x.fillStyle=p[3]?cA:cB;const r=1.5*d;x.fillRect(cx+q[0]*k-r/2,cy-q[2]*k-r/2,r,r)}
    x.globalAlpha=1};
  drag(c,st);loop(c,st,draw,.00035)}

/* ---------- 3D trend skyline ---------- */
const SKY=[['IE','Ionisation enthalpy'],['RAD','Atomic radius'],['EN','Electronegativity'],['EA','Electron gain enthalpy'],['DEN','Density'],['MP','Melting point']];
function skyStart(){const s=setup('ptSky',320);if(!s)return;const {c,x,w,h}=s,k=PT.sky,st={ya:-.5,pi:.72,lo:.25,hi:1.25,dirty:1};
  const col={s:tok('--c1')||'#3f72b8',p:tok('--c3')||'#1f9a72',d:tok('--c2')||'#c4692e',f:'#9a5fc0'},tx=tok('--tx')||'#111';
  let mx=0;for(let z=1;z<=118;z++){const v=hv(k,z);if(v!=null&&v>mx)mx=v}
  const B=[];for(let z=1;z<=118;z++){const q=POS[z],v=hv(k,z);B.push({z,x:q.c-9.5,y:(q.r>7?q.r+.6:q.r)-5.3,h:v==null||v<=0?.04:Math.max(.06,v/mx*3.6),b:q.b,na:v==null})}
  let sc=w/23,cx=w/2,cy=h*.6;const H=.39;
  const pr=(X,Y,Zz)=>{const p=rot(X,-Y,Zz,st.ya,st.pi);return [cx+p[0]*sc,cy-p[2]*sc*.9,p[1]]};
  /* fit the whole skyline inside the canvas for the current angle */
  const fit=()=>{let a=1e9,b=-1e9,c=1e9,d=-1e9;for(const o of B)for(const X of [o.x-H,o.x+H])for(const Y of [o.y-H,o.y+H])for(const Zz of [0,o.h]){const p=rot(X,-Y,Zz,st.ya,st.pi);a=Math.min(a,p[0]);b=Math.max(b,p[0]);c=Math.min(c,p[2]*.9);d=Math.max(d,p[2]*.9)}
    sc=Math.min((w-20)/(b-a),(h-44)/(d-c));cx=w/2-(a+b)/2*sc;cy=30+(h-36)/2+(c+d)/2*sc};
  const draw=()=>{fit();x.clearRect(0,0,w,h);const L=B.map(b=>({b,d:rot(b.x,-b.y,0,st.ya,st.pi)[1]})).sort((a,b)=>b.d-a.d);
    for(const {b} of L){const X=[b.x-H,b.x+H],Y=[b.y-H,b.y+H],base=col[b.b];
      const quad=(pts,sh)=>{x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();x.globalAlpha=b.na?.3:1;x.fillStyle=base;x.fill();if(sh){x.globalAlpha=b.na?.1:sh;x.fillStyle='#000';x.fill()}x.globalAlpha=1};
      [[[X[0],Y[0]],[X[0],Y[1]],[-1,0],.34],[[X[1],Y[0]],[X[1],Y[1]],[1,0],.34],[[X[0],Y[0]],[X[1],Y[0]],[0,-1],.2],[[X[0],Y[1]],[X[1],Y[1]],[0,1],.2]].forEach(([a,c2,nrm,sh])=>{
        if(rot(nrm[0],-nrm[1],0,st.ya,st.pi)[1]>=0)return;quad([pr(a[0],a[1],0),pr(c2[0],c2[1],0),pr(c2[0],c2[1],b.h),pr(a[0],a[1],b.h)],sh)});
      const top=[pr(X[0],Y[0],b.h),pr(X[1],Y[0],b.h),pr(X[1],Y[1],b.h),pr(X[0],Y[1],b.h)];quad(top,0);
      if(sc>19){const m=pr(b.x,b.y,b.h);x.fillStyle='#fff';x.globalAlpha=.95;x.font='600 '+Math.min(11,sc*.42)+'px system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(SYM[b.z-1],m[0],m[1]);x.globalAlpha=1}}
    x.fillStyle=tx;x.globalAlpha=.6;x.font='500 11px system-ui,sans-serif';x.textAlign='left';x.textBaseline='top';x.fillText('Height = '+SKY.find(q=>q[0]===k)[1].toLowerCase()+(k==='EA'?' (energy released)':''),10,10);x.globalAlpha=1};
  drag(c,st);loop(c,st,draw,0)}
function labTab(){const o=ORB.find(q=>q[0]===PT.orb)||ORB[0];
  return `${card('Shapes of orbitals',`<canvas class="pt-cv" id="ptOrb" style="height:300px" aria-label="3D dot-density picture of the ${otxt(o[1])} orbital"></canvas>
    <div class="chips wrap">${ORB.map(q=>`<button class="${q[0]===o[0]?'on':''}" data-a="ptOrb" data-k="${q[0]}">${olab(q[1])}</button>`).join('')}</div>
    <p style="font-size:14px;line-height:1.55">${o[6]}</p>
    ${rows([['n, l',o[2]+', '+o[3]],['Radial nodes (n − l − 1)',o[2]-o[3]-1],['Angular nodes (l)',o[3]],['Total nodes (n − 1)',o[2]-1]])}
    <p class="hint">Each dot is a place where the electron is likely to be found: more dots, higher probability. Blue and orange are the two signs of the wave function. ${RM?'Drag':'It turns slowly; drag'} sideways to turn it yourself.</p>`)}
   ${card('The table as a 3D skyline',`<canvas class="pt-cv" id="ptSky" style="height:320px" aria-label="3D bar chart of the periodic table"></canvas>
    <div class="chips wrap">${SKY.map(q=>`<button class="${q[0]===PT.sky?'on':''}" data-a="ptSky" data-k="${q[0]}">${q[1]}</button>`).join('')}</div>
    <div class="pt-lg">${['s','p','d','f'].map(b=>`<span><i class="pt-k-${b}"></i>${BLK[b]}</span>`).join('')}</div>
    <p class="hint">Each bar is one element, placed as in the table (group 1 on the left, the f-block in front). Drag to turn the table and look along a period or down a group. Faded flat tiles have no reliable value.</p>`)}
   ${card('3D atom model',`<p style="font-size:14px;line-height:1.55">Every element page opens with a turning shell model that shows how many electrons sit in the K, L, M, N … shells.</p><div class="chips wrap">${[1,6,11,17,26,29,79,92].map(z=>`<button data-a="ptEl" data-z="${z}">${NAME[z-1]}</button>`).join('')}</div><p class="hint">The shell model is a Bohr-type picture for counting electrons. Real electrons occupy orbitals like the ones above, not fixed circular paths.</p>`)}`}

/* ---------- practice ---------- */
const QM=[['mix','Mixed'],['con','Concepts'],['cfg','Configuration'],['pos','Position']];
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pick=a=>a[Math.floor(Math.random()*a.length)];
function mk(q,right,wrong,ex){const opts=shuffle([right,...wrong]);return {q,opts,a:opts.indexOf(right),ex}}
function near(z,ok){const r=[];for(const d of shuffle([-3,-2,-1,1,2,3,-8,8,-18,18])){const y=z+d;if(y>=1&&y<=86&&ok(y)&&!r.includes(y))r.push(y);if(r.length===3)break}return r}
function newQ(){const Z=PT.qz;let m=Z.mode;if(m==='mix')m=pick(['con','con','cfg','pos']);
  if(m==='cfg'){const z=pick([...Array(56).keys()].map(i=>i+1).concat([72,73,74,78,79,80,81,82,83]));const w=near(z,()=>true);
    return mk(`Which element has the ground state configuration ${cfgShort(z)}?`,NAME[z-1],w.map(y=>NAME[y-1]),`${NAME[z-1]} (Z = ${z}). ${EXN[z]||''}`)}
  if(m==='pos'){const pool=[];for(let z=3;z<=86;z++)POS[z].b!=='f'&&pool.push(z);const z=pick(pool),q=POS[z];
    if(Math.random()<.5){const w=near(z,y=>POS[y].b!=='f');return mk(`Which element is in period ${q.p} and group ${q.g}?`,NAME[z-1],w.map(y=>NAME[y-1]),`${NAME[z-1]}: ${cfgShort(z)}. Period ${q.p}, group ${q.g}, ${BLK[q.b]}.`)}
    const right=`Period ${q.p}, group ${q.g}`,ws=[];for(const [dp,dg] of shuffle([[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[0,2],[0,-2]])){const p=q.p+dp,g=q.g+dg;if(p<1||p>7||g<1||g>18)continue;ws.push(`Period ${p}, group ${g}`);if(ws.length===3)break}
    return mk(`${NAME[z-1]} (Z = ${z}) belongs to:`,right,ws,`${cfgShort(z)}. Highest n is ${q.p}; it is a ${BLK[q.b]} element of group ${q.g}.`)}
  if(!Z.left.length)Z.left=shuffle(N.Q.map((_,i)=>i));const c=N.Q[Z.left.pop()],right=c[1][c[2]];return mk(c[0],right,c[1].filter((_,i)=>i!==c[2]),c[3])}
function quizTab(){const Z=PT.qz;if(!Z.cur){Z.cur=newQ();Z.pick=-1}const c=Z.cur,done=Z.pick>=0;
  return `<div class="chips">${QM.map(([k,l])=>`<button class="${k===Z.mode?'on':''}" data-a="ptQm" data-k="${k}">${l}</button>`).join('')}</div>
  ${card('',`<span class="tag">Question ${Z.n+(done?0:1)}${Z.n?` · ${Z.ok} right out of ${Z.n}`:''}</span><p class="pt-q">${c.q}</p>
    <div class="pt-opts">${c.opts.map((o,i)=>`<button class="${done?(i===c.a?'ok':i===Z.pick?'no':''):''}" data-a="ptQa" data-i="${i}" ${done?'disabled':''}>${o}</button>`).join('')}</div>
    ${done?`<p class="pt-note"><b>${Z.pick===c.a?'Correct.':'Not quite.'}</b> ${c.ex}</p><button class="btn" data-a="ptQn">Next question</button>`:''}`)}
  <p class="hint">Concept questions follow the NEET and JEE pattern for this chapter. Configuration and position questions are made fresh from the table each time.</p>`}

/* ---------- the tool's main page ---------- */
function mainView(){return {t:'Periodic table',s:'Chapter, trends and 3D models for NEET and JEE',
  html:()=>tabsBar()+({table:tableTab,trends:trendsTab,groups:groupsTab,chapter:chapterTab,lab:labTab,quiz:quizTab}[PT.tab]||tableTab)(),
  after:()=>{ensureCss();if(PT.tab==='table')tableAfter();if(PT.tab==='lab'){orbStart();skyStart()}const on=$('.pt-tabs .on');on&&on.scrollIntoView({block:'nearest',inline:'center'})}}}
const toTop=()=>{const b=$('#scrB');b&&(b.scrollTop=0)};
function actions(A){
  A.ptTab=el=>{PT.tab=el.dataset.k;api.redraw();toTop()};
  A.ptMode=el=>{PT.mode=el.dataset.k;$$('[data-a="ptMode"]').forEach(b=>b.classList.toggle('on',b===el));$('#ptgrid').innerHTML=gridHTML();$('#ptleg').innerHTML=legendHTML();tableAfter()};
  A.ptEl=el=>openEl(+el.dataset.z,!!el.dataset.r);
  A.ptTr=el=>{const i=+el.dataset.i;if(!N.TR[i])return;el.dataset.r?api.replaceTop(trView(i)):api.push(trView(i))};
  A.ptGr=el=>api.push(grView(el.dataset.k));
  A.ptCh=el=>{const i=+el.dataset.i;if(!N.CH[i])return;el.dataset.r?api.replaceTop(chView(i)):api.push(chView(i))};
  A.ptSee=el=>{PT.mode=el.dataset.k;PT.tab='table';api.back()};
  A.ptOrb=el=>{PT.orb=el.dataset.k;api.redraw()};
  A.ptSky=el=>{PT.sky=el.dataset.k;api.redraw()};
  A.ptPosOpen=()=>openEl(Math.floor(PT.cz));
  A.ptQm=el=>{const Z=PT.qz;Z.mode=el.dataset.k;Z.cur=null;api.redraw()};
  A.ptQa=el=>{const Z=PT.qz;if(Z.pick>=0)return;Z.pick=+el.dataset.i;Z.n++;if(Z.pick===Z.cur.a)Z.ok++;api.redraw()};
  A.ptQn=()=>{PT.qz.cur=null;api.redraw();toTop()};
}
window.__ptView=function(a){if(!api){api=a;$=a.$;$$=a.$$;RM=!!a.RM;actions(a.A)}ensureCss();return mainView()};
/* for the checks in tests: the pure helpers */
window.__ptLib={cfg,cfgShort,cfgFull,POS,cat,shells,unpaired,ion,ionShort,iupac,valence,state};
})();
