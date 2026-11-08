/* v3.js: the new student design (beta), side by side with the classic design.
   Off by default. A student turns it on from the menu ("Try the new design") and back off from the new menu
   ("Switch to the classic design"); the choice is saved on the phone (localStorage cbt_v3).
   It only draws screens: every action uses the classic app's own functions and data (cbt_catalog, openTest,
   openReview, the store page, the exam screen). Nothing new is stored on the server and no data is changed.
   It lives inside a Shadow DOM so its styles (v3.css) and the classic styles can never affect each other. */
(function(){
'use strict';
if(window.__v3)return;window.__v3=1;
const V3VER=10;
const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const v3On=()=>lsGet('cbt_v3',false)===true;

/* ---------- classic-menu entries (always added, so the beta can be found) ---------- */
function addEntry(){
  const l=document.querySelector('#layer .drl');
  if(l&&!l.querySelector('.v3try')){l.insertAdjacentHTML('afterbegin',`<button class="dri v3try" onclick="closeModal();v3Enable()" style="font-weight:600">${ic('spark',22)}<span>Try the new design <small style="opacity:.6;font-weight:500">(beta)</small></span></button><div class="sbd"></div>`)}
}
if(typeof openMenu==='function'){const _om=openMenu;openMenu=function(){const r=_om.apply(this,arguments);try{addEntry()}catch(e){}return r}}
if(typeof openSettings==='function'){const _os=openSettings;openSettings=function(){const r=_os.apply(this,arguments);try{const b=document.querySelector('#layer .bsheet');if(b&&!b.querySelector('.v3set')&&typeof stRow==='function'){const first=b.querySelector('.shl');first&&first.insertAdjacentHTML('afterend',`<div class="v3set">${stRow('palette','New design (beta)',v3On()?'On, tap to go back to the classic design':'Try the new look of the app',v3On()?'closeModal();v3Disable()':'closeModal();v3Enable()')}</div>`)}}catch(e){}return r}}

/* ---------- host + shadow root ---------- */
let host=null,root=null,booted=false;
const gStyle=document.createElement('style');gStyle.id='v3g';
gStyle.textContent=`body.v3on:not(.v3old):not(.intest) .hdr,body.v3on:not(.v3old):not(.intest) #app,body.v3on:not(.v3old):not(.intest) #bnav,body.v3on:not(.v3old):not(.intest) .instbar{display:none!important}
body.v3on:not(.v3old):not(.intest){padding:0!important;background:var(--v3bg,#f5f5f3)!important}
body.intest #v3host,body:not(.v3on) #v3host{display:none!important}`;
function ensureHost(){
  if(host)return;
  document.head.appendChild(gStyle);
  if(!document.getElementById('v3font')){const f=document.createElement('link');f.id='v3font';f.rel='stylesheet';f.href='https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap';document.head.appendChild(f)}
  host=document.createElement('div');host.id='v3host';host.style.visibility='hidden';
  document.body.appendChild(host);
  root=host.attachShadow({mode:'open'});
  root.innerHTML=`<link rel="stylesheet" href="v3.css?v=${V3VER}"><div class="app" id="app3">${SKEL}</div>`;
  root.querySelector('link').addEventListener('load',()=>{host.style.visibility=''});
  setTimeout(()=>{host.style.visibility=''},2500);
}

/* ---------- helpers (scoped to the shadow root) ---------- */
const $=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
const esc3=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAY=864e5;
const nowMs=()=>typeof srvNow==='function'?srvNow():Date.now();
const fD=(d,o)=>new Date(d).toLocaleDateString('en-IN',o);
const fT=d=>new Date(d).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}).replace(/\s?(am|pm)$/i,(x,a)=>' '+a.toUpperCase());
const dS=d=>fD(d,{day:'numeric',month:'short',year:'numeric'});
const dur=m=>m>=60?`${Math.floor(m/60)} h${m%60?` ${m%60} min`:''}`:`${m} min`;
const fmtN=n=>Number(n||0).toLocaleString('en-IN');
const day0=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime()};
const dayWord=t=>{const k=Math.round((day0(t)-day0(nowMs()))/DAY);return k===0?'Today':k===1?'Tomorrow':k===-1?'Yesterday':fD(t,{weekday:'short',day:'numeric',month:'short'})};
const P={star:'<path d="M11.5 2.3a.6.6 0 0 1 1 0l2.6 5.4 5.9.9a.6.6 0 0 1 .3 1l-4.3 4.2 1 5.9a.6.6 0 0 1-.8.6L12 17.6l-5.3 2.8a.6.6 0 0 1-.8-.6l1-5.9-4.3-4.2a.6.6 0 0 1 .3-1l5.9-.9z"/>',
 home:'<path class="f" d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2h-4v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H5a2 2 0 0 1-2-2z"/>',
 tests:'<path class="f" d="M7 3h6.5L19 8.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v4a1.5 1.5 0 0 0 1.5 1.5H19"/><path d="m8.6 14.6 2.2 2.2 4.6-4.6"/>',
 tools:'<rect class="f" x="3.5" y="3.5" width="7" height="7" rx="2"/><rect class="f" x="13.5" y="3.5" width="7" height="7" rx="2"/><rect class="f" x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 13.8v6.4"/><path d="M13.8 17h6.4"/>',
 lib:'<rect class="f" x="3.5" y="4" width="4.6" height="16.5" rx="1.3"/><rect class="f" x="9.7" y="4" width="4.6" height="16.5" rx="1.3"/><rect class="f" x="16.2" y="4.6" width="4.6" height="16" rx="1.3" transform="rotate(-12 18.5 12.6)"/><path d="M5.8 8h0"/><path d="M12 8h0"/>',
 stats:'<rect class="f" x="3.5" y="12" width="4.6" height="8.5" rx="1.3"/><rect class="f" x="9.7" y="7" width="4.6" height="13.5" rx="1.3"/><rect class="f" x="15.9" y="3.5" width="4.6" height="17" rx="1.3"/>',
 menu:'<path d="M4 8.5h16"/><path d="M4 15.5h10"/>',
 bell:'<path d="M10.3 21a2 2 0 0 0 3.4 0"/><path d="M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3"/>',
 back:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',down:'<path d="m6 9 6 6 6-6"/>',x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
 check:'<path d="M20 6 9 17l-5-5"/>',checks:'<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
 swap:'<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
 crown:'<path d="M11.6 3.3a.5.5 0 0 1 .8 0l2.9 4.4a1 1 0 0 0 1.5.2l3.6-3a.5.5 0 0 1 .8.5L19.1 18a1 1 0 0 1-1 .8H5.9a1 1 0 0 1-1-.8L2.8 5.4a.5.5 0 0 1 .8-.5l3.6 3a1 1 0 0 0 1.5-.2z"/><path d="M5 21h14"/>',
 cal:'<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
 clock:'<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
 timer:'<path d="M10 2h4"/><path d="M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
 layers:'<path d="M12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8z"/><path d="m22 17.6-9.2 4.2a2 2 0 0 1-1.6 0L2 17.6"/><path d="m22 12.6-9.2 4.2a2 2 0 0 1-1.6 0L2 12.6"/>',
 book:'<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
 dl:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
 hist:'<path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
 doubt:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
 qb:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
 pyq:'<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M4.3 21a2 2 0 0 0 1.7 1h12a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="m9 18-1.5-1.5"/><circle cx="5" cy="14" r="3"/>',
 file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
 live:'<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.5"/><path d="M7.8 16.2a6 6 0 0 1 0-8.5"/><path d="M19.1 4.9a10 10 0 0 1 0 14.1"/><path d="M4.9 19.1a10 10 0 0 1 0-14.1"/>',
 trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0z"/>',
 mega:'<path d="m3 11 18-5v12L3 14z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
 search:'<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
 filter:'<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
 play:'<path d="M7 4.5v15l12.5-7.5z"/>',pause:'<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
 lock:'<rect x="4" y="11" width="16" height="10.5" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
 spark:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4"/><path d="M21 5h-4"/><path d="M5 17v4"/><path d="M7 19H3"/>',
 pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 mind:'<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="5.5" r="2"/><circle cx="19.5" cy="5.5" r="2"/><circle cx="4.5" cy="18.5" r="2"/><circle cx="19.5" cy="18.5" r="2"/><path d="m10.2 10.2-4.3-3.3"/><path d="m13.8 10.2 4.3-3.3"/><path d="m10.2 13.8-4.3 3.3"/><path d="m13.8 13.8 4.3 3.3"/>',
 cards:'<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12"/>',
 calc:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
 target:'<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5"/>',
 trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
 bookmark:'<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
 key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
 list:'<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
 gear:'<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
 mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
 user:'<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
 gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
 out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
 atom:'<circle cx="12" cy="12" r="1.5"/><path d="M20.2 20.2c2-2-.3-7.6-5.3-12.5S4.4 1.8 2.4 3.8s.3 7.6 5.3 12.5 10.5 5.9 12.5 3.9z"/><path d="M15.7 15.7c5-5 7.4-10.5 5.4-12.5s-7.6.4-12.6 5.4-7.4 10.6-5.4 12.6 7.6-.4 12.6-5.5z"/>',
 ruler:'<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
 sigma:'<path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"/>',
 chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
 medal:'<path d="M7.2 15 2.7 7.4A1 1 0 0 1 3 6.3l2-1.2a1 1 0 0 1 1.3.3L10 11"/><path d="m16.8 15 4.5-7.6a1 1 0 0 0-.3-1.1l-2-1.2a1 1 0 0 0-1.3.3L14 11"/><circle cx="12" cy="17" r="5"/>',
 percent:'<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
 share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>'
};

const ic=(n,w)=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true"${w?` style="width:${w}px;height:${w}px"`:''}>${P[n]||''}</svg>`;

/* ---------- theme engine: tokens live on the host element only, so the classic screens keep their own theme ---------- */
const TK={bg:'--bg',bg2:'--bg2',s:'--surface',s2:'--surface2',ln:'--line',tx:'--tx',mt:'--mut',ft:'--faint',ink:'--ink',on:'--onInk',acc:'--acc',a1:'--acc1',a2:'--acc2',onA:'--onAcc',as:'--accSoft',h1:'--hero1',h2:'--hero2',glow:'--glow',ok:'--ok',warn:'--warn',err:'--err',nav:'--nav',hdr:'--hdr',pill:'--pill',scrim:'--scrim',logo:'--logo',logoE:'--logoE',sh:'--sh'};
const TBASE={
 light:{bg:'#f5f5f3',bg2:'#ebebe8',s:'#ffffff',s2:'#f0f0ee',ln:'#e4e4e0',tx:'#17181b',mt:'#5e6066',ft:'#96989d',ink:'#1d1e22',on:'#ffffff',acc:'#85672c',a1:'#e6cf9a',a2:'#b08945',onA:'#1d1608',as:'#f4ecdc',h1:'#2b2d32',h2:'#111215',glow:'rgba(222,186,112,.32)',ok:'#2d7a58',warn:'#93661f',err:'#b3433d',nav:'rgba(255,255,255,.86)',hdr:'rgba(245,245,243,.84)',pill:'rgba(29,30,34,.07)',scrim:'rgba(12,12,14,.4)',logo:'#1d1e22',logoE:'#6b6d73',sh:'0 1px 2px rgba(20,20,24,.04),0 10px 30px -14px rgba(20,20,24,.14)'},
 dark:{bg:'#161719',bg2:'#0f1011',s:'#1e1f22',s2:'#27282c',ln:'#303135',tx:'#ededee',mt:'#a3a5aa',ft:'#707277',ink:'#ededee',on:'#161719',acc:'#d6b878',a1:'#ecd6a4',a2:'#b8924c',onA:'#1a1408',as:'#2c271d',h1:'#2c2d32',h2:'#18191c',glow:'rgba(214,180,110,.22)',ok:'#6cc39b',warn:'#d9a55a',err:'#e07a74',nav:'rgba(30,31,34,.86)',hdr:'rgba(22,23,25,.82)',pill:'rgba(237,237,238,.09)',scrim:'rgba(0,0,0,.6)',logo:'#f2f2f3',logoE:'#a3a5aa',sh:'none'},
 black:{bg:'#000000',bg2:'#000000',s:'#0c0c0d',s2:'#161617',ln:'#222224',tx:'#ffffff',mt:'#a0a0a5',ft:'#6c6c71',ink:'#ffffff',on:'#000000',acc:'#d6d6da',a1:'#f2f2f4',a2:'#a8a8ad',onA:'#000000',as:'#161618',h1:'#18181a',h2:'#050505',glow:'rgba(255,255,255,.08)',ok:'#5fbf93',warn:'#d6a352',err:'#e0716a',nav:'rgba(14,14,15,.9)',hdr:'rgba(0,0,0,.84)',pill:'rgba(255,255,255,.1)',scrim:'rgba(0,0,0,.72)',logo:'#ffffff',logoE:'#a0a0a5',sh:'none'}
};
const THEMES={
 light:{name:'Light',pals:{
  A:['Premium Gray',{},'Warm grays with champagne gold'],
  B:['Pure Black & White',{bg:'#ffffff',bg2:'#f4f4f4',s2:'#f2f2f2',ln:'#e6e6e6',tx:'#000000',mt:'#4f4f4f',ft:'#8c8c8c',ink:'#000000',acc:'#000000',a1:'#3a3a3a',a2:'#000000',onA:'#ffffff',as:'#f0f0f0',h1:'#1c1c1c',h2:'#000000',glow:'rgba(255,255,255,.12)',logo:'#000000',logoE:'#4f4f4f',pill:'rgba(0,0,0,.07)'},'Only black and white, no colour'],
  C:['Silver Mist',{bg:'#f3f4f6',bg2:'#e7e9ed',s:'#fcfcfd',s2:'#eceef1',ln:'#dfe2e6',tx:'#1f2228',mt:'#5d636d',ink:'#343941',acc:'#4f5866',a1:'#dde1e7',a2:'#97a0ad',onA:'#1f2228',as:'#e9ecf0',h1:'#3b4048',h2:'#1d2025',glow:'rgba(200,210,225,.35)',logo:'#343941',pill:'rgba(52,57,65,.08)'},'Cool silver, very calm'],
  D:['Blue Gray',{bg:'#f2f4f7',bg2:'#e6eaf0',s2:'#ebeff4',ln:'#dce2ea',tx:'#1a2230',mt:'#556072',ink:'#24324a',acc:'#3b5779',a1:'#bccde3',a2:'#6d8bb2',onA:'#121b29',as:'#e5ecf5',h1:'#2a3a55',h2:'#131b29',glow:'rgba(140,175,220,.35)',logo:'#24324a',pill:'rgba(36,50,74,.08)'},'Gray with a quiet slate blue'],
  E:['Soft Sage Gray',{bg:'#f3f5f2',bg2:'#e7ebe5',s2:'#ecf0ea',ln:'#dde3da',tx:'#1c231d',mt:'#59645b',ink:'#283429',acc:'#4a6650',a1:'#c6d8c5',a2:'#7f9a80',onA:'#152016',as:'#e5ede5',h1:'#2c3a2f',h2:'#141b15',glow:'rgba(170,205,165,.3)',logo:'#283429',pill:'rgba(40,52,41,.08)'},'Gray with soft green, easy on the eyes']}},
 dark:{name:'Dark',pals:{
  A:['Graphite Gray',{},'Graphite with muted gold'],
  B:['Black & White Dark',{bg:'#121212',bg2:'#0b0b0b',s:'#1a1a1a',s2:'#242424',ln:'#2e2e2e',tx:'#f5f5f5',mt:'#a8a8a8',ink:'#f5f5f5',on:'#121212',acc:'#f5f5f5',a1:'#ffffff',a2:'#bdbdbd',onA:'#111111',as:'#262626',h1:'#2a2a2a',h2:'#141414',glow:'rgba(255,255,255,.08)'},'Dark gray and white, no colour'],
  C:['Midnight Gray',{bg:'#13151b',bg2:'#0c0d11',s:'#1a1d25',s2:'#232732',ln:'#2c313e',tx:'#e8eaf0',mt:'#9ca2b0',ink:'#e8eaf0',on:'#13151b',acc:'#aab5d2',a1:'#d3dbef',a2:'#7e8bb0',onA:'#10131b',as:'#222738',h1:'#2a2f3e',h2:'#14171f',glow:'rgba(150,170,220,.2)',nav:'rgba(26,29,37,.86)',hdr:'rgba(19,21,27,.82)'},'Deep gray with night blue'],
  D:['Blue Gray Dark',{bg:'#151a21',bg2:'#0e1217',s:'#1c222b',s2:'#252d38',ln:'#2f3844',tx:'#e6ebf1',mt:'#9ca8b7',ink:'#e6ebf1',on:'#151a21',acc:'#93afd2',a1:'#c2d5ec',a2:'#6789b3',onA:'#0f141b',as:'#1f2a38',h1:'#2b3646',h2:'#151a22',glow:'rgba(120,160,215,.22)',nav:'rgba(28,34,43,.86)',hdr:'rgba(21,26,33,.82)'},'Slate gray with soft blue'],
  E:['Silver Dark',{bg:'#19191b',bg2:'#111113',s:'#222326',s2:'#2c2d31',ln:'#37383c',tx:'#f0f0f2',mt:'#b0b2b8',ink:'#e2e4e8',on:'#19191b',acc:'#c9cdd4',a1:'#eef0f3',a2:'#9ba1aa',onA:'#151618',as:'#2c2d31',h1:'#333438',h2:'#1b1c1e',glow:'rgba(220,225,235,.14)'},'Lighter graphite with silver']}},
 black:{name:'Black',pals:{
  A:['Pure AMOLED',{},'True black, saves battery on OLED'],
  B:['Black & Gold',{acc:'#d8b46e',a1:'#f0d9a4',a2:'#b88d43',onA:'#140f05',as:'#1f1a0f',ink:'#f1e3c2',h1:'#1d180c',h2:'#050403',glow:'rgba(216,180,110,.28)',logo:'#f3e6c8',pill:'rgba(216,180,110,.14)'},'Black with Aspiron gold'],
  C:['Black & Silver',{acc:'#c9cdd3',a1:'#f4f5f7',a2:'#9da3ab',h1:'#1a1b1d',h2:'#040404',glow:'rgba(220,225,232,.14)'},'Black with cool silver'],
  D:['Black & Emerald',{acc:'#6cc09c',a1:'#a8dcc4',a2:'#3f9373',onA:'#04140d',as:'#0f1d17',h1:'#11201a',h2:'#020403',glow:'rgba(95,190,150,.22)',pill:'rgba(108,192,156,.12)'},'Black with deep muted green'],
  E:['Black & Graphite',{s:'#121213',s2:'#1c1c1e',ln:'#2a2a2c',acc:'#a6a6aa',a1:'#d7d7da',a2:'#7c7c80',h1:'#222224',h2:'#0b0b0c',glow:'rgba(255,255,255,.07)'},'Black with graphite cards']}}
};
const CHL={light:['#3f72b8','#c4692e','#1f9a72'],dark:['#4f86cc','#c97042','#2a9a74']}; /* validated with the dataviz palette checker */

const MQ=matchMedia('(prefers-color-scheme: dark)');
const clone=o=>JSON.parse(JSON.stringify(o));
const oldMode=lsGet('cbt_theme',null);
const DEF_TH={mode:oldMode==='light'?'light':oldMode==='oled'?'black':oldMode==='dark'?'dark':'system',pal:{light:'A',dark:'A',black:'A'}};
let TH=clone(DEF_TH),THP=null;
{const v=lsGet('cbt_v3_theme',null);if(v&&(v.mode==='system'||THEMES[v.mode]))TH={mode:v.mode,pal:Object.assign({},DEF_TH.pal,v.pal)}}
const resolveMode=m=>m==='system'?(MQ.matches?'dark':'light'):m;
const tokens=(mode,pal)=>Object.assign({},TBASE[mode],(THEMES[mode].pals[pal]||THEMES[mode].pals.A)[1]);
function applyTheme(t){if(!host)return;const mode=resolveMode(t.mode),pal=THEMES[mode].pals[t.pal[mode]]?t.pal[mode]:'A',tk=tokens(mode,pal);
  for(const k in TK)host.style.setProperty(TK[k],tk[k]);
  CHL[mode==='light'?'light':'dark'].forEach((c,i)=>host.style.setProperty('--c'+(i+1),c));
  host.dataset.mode=mode;document.body.style.setProperty('--v3bg',tk.bg);
  if(!document.body.classList.contains('v3old')){const m=document.querySelector('meta[name="theme-color"]');m&&m.setAttribute('content',tk.bg)}}
const saveTheme=()=>lsSet('cbt_v3_theme',TH);
MQ.addEventListener&&MQ.addEventListener('change',()=>{if((THP||TH).mode==='system')applyTheme(THP||TH)});
const themeLabel=()=>{const m=resolveMode(TH.mode);return `${TH.mode==='system'?'System, ':''}${THEMES[m].name}, ${THEMES[m].pals[TH.pal[m]||'A'][0]}`};

/* ---------- toast, sheets, drawer ---------- */
let tT=null,tMsg='';
function toast3(m){const t=$('#toast');if(m===tMsg&&t.classList.contains('on')){clearTimeout(tT)}else{t.textContent=m;tMsg=m;t.classList.remove('on');void t.offsetWidth;t.classList.add('on')}tT=setTimeout(()=>{t.classList.remove('on');tMsg=''},2300)}
let layer=null,lastF=null,sheet,drawer,scrim;
function openLayer(el){if(layer&&layer!==el)layer.classList.remove('open');lastF=root.activeElement;layer=el;scrim.classList.add('open');el.classList.add('open');setTimeout(()=>{const f=el.querySelector('button,input');f&&f.focus({preventScroll:true})},80)}
function closeLayer(){if(!layer)return;layer.classList.remove('open');scrim.classList.remove('open');layer=null;sheet.onclick=null;lastF&&lastF.focus&&lastF.focus({preventScroll:true})}
function openSheet(h){sheet.onclick=null;sheet.innerHTML='<div class="grab"></div>'+h;sheet.scrollTop=0;openLayer(sheet)}

/* ---------- full-screen pages; the phone's back button closes them ---------- */
let STK=[],scr;
const top=()=>STK[STK.length-1],scrOpen=()=>STK.length>0;
function drawScr(dir){const v=top();if(!v)return;$('#scrT').textContent=v.t;$('#scrS').textContent=v.s||'';$('#scrR').innerHTML=v.right?v.right():'';
  $('#scrB').innerHTML=`<div class="scr-in${dir?' '+dir:''}">${v.html()}</div>`;v.after&&v.after()}
function push(v){const was=STK.length>0;STK.push(v);try{history.pushState({v3s:STK.length},'',location.href)}catch(e){}
  drawScr(was&&!RM?'fwd':'');try{pstSync()}catch(e){}$('#scrB').scrollTop=0;if(!scr.classList.contains('open')){scr.classList.add('open');scr.setAttribute('aria-hidden','false')}setTimeout(()=>$('#scrBack').focus({preventScroll:true}),60)}
function pop(){const v=STK.pop();v&&v.leave&&v.leave();if(STK.length){drawScr(RM?'':'bwd')}else{scr.classList.remove('open');scr.setAttribute('aria-hidden','true');$('#scrB').innerHTML='';try{pstSync()}catch(e){}}}
function back(){if(!STK.length)return;history.back()}
/* close every page first, wait for the browser history to settle, then run cb (so a hash change is never undone) */
let afterUnwind=null;
function unwind(cb){if(!STK.length){cb();return}const n=STK.length;while(STK.length)pop();afterUnwind=cb;try{history.go(-n)}catch(e){const f=afterUnwind;afterUnwind=null;f()}}
addEventListener('popstate',()=>{if(afterUnwind){const f=afterUnwind;afterUnwind=null;setTimeout(f,0);return}if(STK.length)pop()});
function redraw(){const b=$('#scrB'),y=b.scrollTop;drawScr('');b.scrollTop=y}

/* ---------- actions: one delegated handler ---------- */
const A={};
function onClick(e){const el=e.target.closest('[data-a]');if(!el||el.disabled)return;const f=A[el.dataset.a];if(f){e.preventDefault();f(el,e)}}
addEventListener('keydown',e=>{if(e.key!=='Escape'||!host||!document.body.classList.contains('v3on')||document.body.classList.contains('v3old'))return;if(document.querySelector('#layer .modal,#layer .drw'))return;if(layer)closeLayer();else if(scrOpen())back()});
A.close=()=>closeLayer();A.back=back;
A.toast=el=>toast3(el.dataset.m);
A.copy=el=>{const c=el.dataset.v;const done=()=>toast3('Copied: '+c);try{navigator.clipboard.writeText(c).then(done,()=>toast3(c))}catch(x){toast3(c)}};

/* ---------- the classic screens: open them, show a pill to come back ---------- */
let lockHash=null;
function toOld(){document.body.classList.add('v3old');host&&host.setAttribute('data-view','old')}
function toNew(){document.body.classList.remove('v3old');lockHash=null;host&&host.removeAttribute('data-view');const m=document.querySelector('meta[name="theme-color"]');m&&m.setAttribute('content',getComputedStyle(host).getPropertyValue('--bg').trim()||'#f5f5f3')}
/* go to a classic page by its address (#/qb, #/m, #/s/<id> …) */
function oldHash(h){closeLayer();unwind(()=>{toOld();if(location.hash===h)_route();else location.hash=h})}
/* run a classic function that draws straight into the page (openReview …) */
function oldRun(fn){closeLayer();unwind(()=>{toOld();lockHash=location.hash||'#/';try{fn()}catch(e){toNew();toast3('Could not open this. Please try again.')}})}
/* a classic pop-up (modal) over the new design: nothing to switch */
function oldModal(fn){closeLayer();try{fn()}catch(e){toast3('Could not open this. Please try again.')}}
A.backNew=()=>{const t=S.tab||'home',h=t==='home'?'#/':'#/x/'+t;toNew();if(location.hash!==h)location.hash=h;else render(true)};

/* ---------- state, dock, render ---------- */
const S={tab:'home'};
const NAV=[['home','Home','home'],['test','Tests','tests'],['tools','Tools','tools'],['lib','Library','lib'],['stats','Analytics','stats']];
const VIEW={},AFTER={};
let main,dock;
const tabOf=h=>{const m=/^#\/x\/(test|tools|lib|stats)$/.exec(h||'');return m?m[1]:'home'};
const isNewHash=h=>!h||h==='#'||h==='#/'||/^#\/x\/(test|tools|lib|stats)$/.test(h);
function syncDock(){dock.style.setProperty('--i',NAV.findIndex(n=>n[0]===S.tab));dock.querySelectorAll('button').forEach(b=>{const on=b.dataset.tab===S.tab;b.classList.toggle('on',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')})}
let timers=[];
const every=(fn,ms)=>{const t=setInterval(fn,ms);timers.push(t);return t};
function render(anim){timers.forEach(clearInterval);timers=[];try{main.innerHTML=VIEW[S.tab]()}catch(e){console.error(e);main.innerHTML=`<div class="card empty"><b>Something went wrong</b><p>Please switch to the classic design from the menu and tell us.</p></div>`}
  main.classList.remove('in');if(anim&&!RM){void main.offsetWidth;main.classList.add('in')}try{AFTER[S.tab]&&AFTER[S.tab]()}catch(e){console.error(e)}try{pstSync(true)}catch(e){}countUp(main);reveal(main)}
/* content below the first screen fades up into place as it scrolls into view (once; nothing hides if the browser cannot) */
let rvIO=null;
function reveal(r){if(RM||!r||!('IntersectionObserver' in window))return;
  if(!rvIO)rvIO=new window.IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('rvin');rvIO.unobserve(e.target)}}),{rootMargin:'0px 0px -4% 0px'});
  const H=window.innerHeight;r.querySelectorAll('.list>*,.sh,.chips,.rail,.qgrid,.off3,.obtn,.sec>.card,.sec>.dots').forEach(el=>{if(el.classList.contains('rv'))return;if(el.getBoundingClientRect().top>H){el.classList.add('rv');rvIO.observe(el)}})}
function go(tab,then){closeLayer();unwind(()=>{const h=tab==='home'?'#/':'#/x/'+tab;if(tab===S.tab&&location.hash===h){scrollTo({top:0,behavior:RM?'auto':'smooth'});then&&then();return}goThen=then||null;location.hash=h})}
let goThen=null;
A.tab=el=>go(el.dataset.tab);
function countUp(r){if(RM)return;r.querySelectorAll('[data-n]').forEach(el=>{const to=+el.dataset.n,dec=(el.dataset.n.split('.')[1]||'').length,t0=performance.now(),D=900;
  const step=t=>{const k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3),v=to*e;el.textContent=dec?v.toFixed(dec):fmtN(Math.round(v));if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)})}
const N=(v,dec)=>`<span data-n="${v}">${dec?(+v).toFixed(dec):fmtN(+v)}</span>`;
const SKEL=`<header class="hdr" id="hdr"><i class="hdr-tint" id="hdrTint" aria-hidden="true"></i><div class="hdr-in">
  <button class="ib" data-a="menu" aria-label="Menu" id="mnu"></button>
  <a class="brand" href="#/" data-a="tab" data-tab="home" aria-label="Aspiron Education, go to Home"><span class="bmk" aria-hidden="true"><i class="bmk-w" id="bmk"><i class="bmk-s"></i></i><span class="bmk-e"><span>EDUCATION</span></span></span></a>
  <button class="ib" data-a="bell" aria-label="Notifications" id="bell"></button></div></header>
 <main class="main" id="main"></main>
 <nav class="dock" id="dock" aria-label="Main"></nav>
 <section class="scr" id="scr" aria-hidden="true"><div class="scr-h"><button class="ib" data-a="back" aria-label="Back" id="scrBack"></button><div><h2 id="scrT"></h2><p id="scrS"></p></div><span id="scrR"></span></div><div class="scr-b" id="scrB"></div></section>
 <div class="scrim" id="scrim" data-a="close"></div><div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetT"></div><aside class="drawer" id="drawer" aria-label="Menu"></aside>
 <div class="toast" id="toast" role="status" aria-live="polite"></div>
 <button class="back3" data-a="backNew">${'<svg class="i" viewBox="0 0 24 24" aria-hidden="true" style="width:15px;height:15px"><path d="m15 18-6-6 6-6"/></svg>'}New design</button>`;

/* ================= DATA: everything comes from the classic app (cbt_catalog, notices, store) ================= */
const C=()=>(typeof CAT!=='undefined'&&CAT)||{series:[],tests:[],results:[],pending:[],folders:[]};
const sOk=s=>!!(s&&(s.is_free||s.unlocked));
const testsOf=id=>(C().tests||[]).filter(t=>t.series_id===id).sort((a,b)=>(a.sort||0)-(b.sort||0));
const resOf=tid=>(C().results||[]).filter(r=>r.test_id===tid).sort((a,b)=>(b.at||0)-(a.at||0));
const tOf=id=>(C().tests||[]).find(t=>t.id===id);
const sOf=id=>(C().series||[]).find(s=>s.id===id);
function stOf(t){try{return tStat2(t,liveIds())}catch(e){return t.attempts?'done':'new'}}
const STL={prog:['live','In progress'],live:['live','Live'],new:['ok','Available'],wait:['','Upcoming'],held:['gold','Attempted'],done:['ok','Completed'],closed:['','Closed'],lock:['','Locked']};
const stBadge=t=>{const s=STL[stOf(t)]||['','Available'];return `<span class="st ${s[0]}">${s[1]}</span>`};
const seriesStats=s=>{const L=testsOf(s.id);return {n:L.length,done:L.filter(t=>t.attempts>0).length,live:L.filter(t=>['live','prog'].includes(stOf(t))).length}};
const mine=()=>(C().series||[]).filter(sOk);
const curSeries=()=>{const L=mine();if(!L.length)return null;const id=lsGet('cbt_v3_series',null);return L.find(s=>s.id===id)||L.slice().sort((a,b)=>seriesStats(b).done-seriesStats(a).done)[0]};
const stuName=()=>{try{return (typeof pfName==='function'&&pfName())||(AUTH&&AUTH.name)||'Student'}catch(e){return 'Student'}};
const stuProf=()=>{try{return typeof pfGet==='function'?pfGet()||{}:{}}catch(e){return {}}};
const initial=()=>esc3((stuName().trim()[0]||'S').toUpperCase());
const avatar=(cls)=>{const o=stuProf();return o.photo&&/^data:image\//.test(o.photo)?`<span class="av ${cls||''}" style="overflow:hidden;padding:0"><img src="${esc3(o.photo)}" alt="" style="width:100%;height:100%;object-fit:cover"></span>`:`<span class="av ${cls||''}">${initial()}</span>`};
const stuMeta=()=>{const o=stuProf();return [o.exam,o.cls].filter(Boolean).join(', ')||('+91 '+(typeof maskMob==='function'&&AUTH?maskMob(AUTH.mobile):''))};
/* store items (public, the same call the store page makes) */
let STORE=null,storeBusy=null;
function loadStore(){if(STORE||storeBusy)return storeBusy;storeBusy=rpc('cbt_store',{},true).then(r=>{STORE=r&&r.ok?(r.items||[]):[];return STORE}).catch(()=>(STORE=[])).finally(()=>{storeBusy=null;if(S.tab==='test'||S.tab==='home')softRender()});return storeBusy}
const storeUrl=x=>'store.html#p='+encodeURIComponent(x.id);
const courseOf=x=>x.course==='jee'?'JEE':x.course==='neet'?'NEET':'';
let NOTES=null;
function loadNotes(){if(typeof annLoad!=='function')return Promise.resolve([]);return annLoad().then(a=>{NOTES=a||[];syncBell();return NOTES}).catch(()=>[])}
const seenAt=()=>{try{return LS.get('cbt_ann_seen',0)}catch(e){return lsGet('cbt_ann_seen',0)}};
const unread=()=>(NOTES||[]).filter(x=>x.at>seenAt()).length;
function softRender(){if(!document.body.classList.contains('v3on')||document.body.classList.contains('v3old'))return;const y=scrollY;render(false);scrollTo(0,y)}

/* ================= HOME ================= */
function seriesHero(){const s=curSeries();
  if(!s)return `<section class="band"><div class="band-in"><small>YOUR TEST SERIES</small><div class="band-row"><b class="band-t">Choose your first test series</b><button class="pillbtn" data-a="tab" data-tab="test">OPEN STORE</button></div></div></section>`;
  const k=seriesStats(s);
  return `<section class="band" id="serBox"><div class="band-in"><small>YOUR TEST SERIES</small>
   <div class="band-row"><button class="band-t" data-a="switchSeries" aria-label="Change test series"><span>${esc3(s.title)}</span>${ic('down',20)}</button>
    <button class="pillbtn" data-a="tab" data-tab="test">UPGRADE</button></div>
   <div class="band-meta"><span>${k.done} of ${k.n} tests attempted</span><button class="minibtn" data-a="openSD" data-id="${esc3(s.id)}">Open${ic('right',14)}</button></div></div></section>`}
const RC=2*Math.PI*24;
function cdCard3(){let c=null;try{c=cdGet()}catch(e){}
  if(!c)return `<section class="sec"><div class="card cdc"><div class="cd-top"><span class="ti g">${ic('target',22)}</span><div style="min-width:0"><h3>Exam countdown</h3><p>Set your exam date and see how much time is left.</p></div><button class="btn sm" data-a="cdEdit">Set date</button></div></div></section>`;
  const u=(id,l)=>`<div class="cu"><span class="dg" id="${id}"><span>00</span></span><small>${l}</small></div>`;
  return `<section class="sec"><div class="card cdc" id="cdBox" role="timer">
   <div class="cd-top"><div class="ring" aria-hidden="true"><svg viewBox="0 0 56 56"><circle class="tr" cx="28" cy="28" r="24"/><circle class="pg" id="cdPg" cx="28" cy="28" r="24" stroke-dasharray="${RC.toFixed(1)}" stroke-dashoffset="${RC.toFixed(1)}"/></svg><span id="cdPct">0%</span></div>
    <div style="min-width:0"><p>Exam countdown</p><h3>${esc3(c.name)}</h3><p>${fD(c.date,{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</p></div>
    <button class="btn sm ghost" data-a="cdEdit">Edit</button></div>
   <div class="cdu">${u('cdD','days')}<i>:</i>${u('cdH','hours')}<i>:</i>${u('cdM','min')}<i>:</i>${u('cdS','sec')}</div></div></section>`}
function setDg(id,v,first){const el=root.getElementById(id);if(!el)return;const cur=el.querySelector('span:not(.out)');if(cur&&cur.textContent===v)return;
  if(first||RM||!cur){el.innerHTML=`<span>${v}</span>`;return}cur.className='out';setTimeout(()=>cur.remove(),430);const n=document.createElement('span');n.className='in';n.textContent=v;el.appendChild(n)}
function tick(first){let c=null;try{c=cdGet()}catch(e){}if(!c||!$('#cdBox'))return;let d=Math.max(0,new Date(c.date).getTime()-Date.now());const D=Math.floor(d/DAY);d-=D*DAY;const H=Math.floor(d/36e5);d-=H*36e5;const M=Math.floor(d/6e4),s=Math.floor((d-M*6e4)/1e3),p=n=>String(n).padStart(2,'0');
  setDg('cdD',p(D),first);setDg('cdH',p(H),first);setDg('cdM',p(M),first);setDg('cdS',p(s),first);
  let pc=0;try{pc=cdCalc(c).pc}catch(e){}const pg=$('#cdPg');if(pg){pg.style.strokeDashoffset=(RC*(1-pc/100)).toFixed(1);$('#cdPct').textContent=pc+'%'}
  $('#cdBox').setAttribute('aria-label',`${D} days, ${H} hours, ${M} minutes until ${c.name}`)}
/* upcoming and live tests from the student's own series */
function upList(){const cs=curSeries(),ok=new Set(cs?[cs.id]:[]),t0=nowMs();return (C().tests||[]).filter(t=>ok.has(t.series_id)).map(t=>({t,st:stOf(t)}))
  .filter(x=>['live','prog'].includes(x.st)||(x.st==='wait'&&x.t.opens_at-t0<14*DAY)).sort((a,b)=>(['live','prog'].includes(b.st)-['live','prog'].includes(a.st))||((a.t.opens_at||0)-(b.t.opens_at||0)))}
function evRow(x){const t=x.t,live=['live','prog'].includes(x.st),when=t.opens_at||nowMs(),s=sOf(t.series_id);
  return `<button class="evr" data-a="${x.st==='wait'?'openSD':'test'}" data-id="${esc3(x.st==='wait'?t.series_id:t.id)}"><span class="when${live?' now':''}"><b>${new Date(when).getDate()}</b><small>${fD(when,{month:'short'})}</small></span>
   <span style="min-width:0"><b>${esc3(t.title)}</b><small>${live?(x.st==='prog'?'You started this test':'Open now'):dayWord(when)+', '+fT(when)}, ${dur(t.duration||0)}</small></span>${stBadge(t)}</button>`}
function upcoming(){const cs=curSeries(),all=upList(),L=all.slice(0,4),done=(C().tests||[]).some(t=>cs&&t.series_id===cs.id&&t.closes_at&&day0(t.closes_at)===day0(nowMs())&&t.closes_at<nowMs());
  return `<section class="sec"><div class="sh"><h2>Upcoming Events (${all.length})</h2></div>
  ${L.length?`<div class="card"><div class="ev">${L.map(evRow).join('')}</div></div>`:`<div class="evnone"><span class="ti">${ic('cal',20)}</span><span>${done?'Today’s live tests have ended':'No live or upcoming tests right now'}</span></div>`}
  ${cs?'<button class="obtn" data-a="week">View Weekly Schedule</button>':''}</section>`}
const ZONE=[['series','layers','My Test Series'],['qb','qb','Question Bank'],['pyq','pyq','PYQ Analyzer'],['gen','spark','Test Generator'],['dl','file','Notes & PDFs'],['mk','pen','Mistakes'],['bm','bookmark','Saved'],['hist','trophy','Results']];
function zone(){return `<section class="sec"><div class="sh"><h2>My study zone</h2></div><div class="qgrid">
  ${ZONE.map(z=>`<button class="qi" data-a="zone" data-k="${z[0]}"><span class="ti g">${ic(z[1],24)}</span><span>${z[2]}</span></button>`).join('')}</div></section>`}
function promoRail(id){let L=[];try{L=(typeof PROMO!=='undefined'&&PROMO)||[]}catch(e){}if(!L.length)return '';
  return `<section class="sec"><div class="rail" id="${id}">${L.slice(0,6).map(x=>{const u=/^https?:\/\/|^#\//i.test(x.link||'')?x.link:'',img=x.img&&/^data:image\/|^https:\/\//.test(x.img)?x.img:'';
   const body=img?`<img src="${esc3(img)}" alt="${esc3(x.title||'Offer')}">`:`<span class="bn-tx"><small class="gold">${esc3(x.label||'Aspiron')}</small><b>${esc3(x.title||'')}</b>${x.text?`<em>${esc3(x.text)}</em>`:''}</span>`;
   return `<a class="pbn${img?'':' hero'}" ${u?`href="${esc3(u)}"${/^https?:/i.test(u)?' target="_blank" rel="noopener noreferrer"':''}`:''}>${body}</a>`}).join('')}</div>
   ${L.length>1?`<div class="dots" id="${id}D" aria-hidden="true">${L.slice(0,6).map((_,i)=>`<i class="${i?'':'on'}"></i>`).join('')}</div>`:''}</section>`}
function storeCard(x,cls){const off=x.mrp&&x.mrp>x.price?Math.round((1-x.price/x.mrp)*100):0,soon=x.buy_on===false&&!x.prebook;
  return `<article class="card ${cls||'tc'}"><span class="tag">${[courseOf(x),esc3(x.section||'')].filter(Boolean).join(', ')||'Test series'}</span><h3>${esc3(x.title)}</h3>${x.subtitle?`<p class="mut" style="font-size:13px">${esc3(x.subtitle)}</p>`:''}
   <div class="ft"><span class="price">${x.price?`<b>₹${fmtN(x.price)}</b>${off?`<s>₹${fmtN(x.mrp)}</s><span class="badge off">${off}% off</span>`:''}`:'<span class="free">Free</span>'}</span><a class="btn sm ${soon?'':'gold'}" href="${storeUrl(x)}">${soon?ic('bell',15)+'Notify me':x.prebook&&x.buy_on===false?'Pre-book':'Buy now'}</a></div></article>`}
function trending(){if(!STORE){loadStore();return `<section class="sec"><div class="sh"><h2>Trending test series</h2></div><div class="card sk" style="height:190px"></div></section>`}loadExtras();return trendRail(true)}
VIEW.home=()=>seriesHero()+cdCard3()+upcoming()+zone()+trending();
AFTER.home=()=>{tick(true);every(()=>tick(false),1000);autoRail('#trRail','#trDots')};
function autoRail(rs,ds){const c=$(rs);if(!c||!c.children.length)return;const dots=[...root.querySelectorAll(ds+' i')];let i=0,touched=false;const st=()=>c.children[0].getBoundingClientRect().width+12;
  c.addEventListener('scroll',()=>{const k=Math.round(c.scrollLeft/st());if(k!==i){i=k;dots.forEach((d,j)=>d.classList.toggle('on',j===k))}},{passive:true});
  ['pointerdown','touchstart','wheel','focusin'].forEach(ev=>c.addEventListener(ev,()=>{touched=true},{passive:true}));
  if(!RM)every(()=>{if(touched||document.hidden)return;c.scrollTo({left:((i+1)%c.children.length)*st(),behavior:'smooth'})},5000)}
A.switchSeries=()=>openSheet(`<h2 id="sheetT">Switch test series</h2><p class="sub">Home, upcoming tests and the weekly schedule follow the series you pick.</p><div>${mine().map(s=>{const k=seriesStats(s);return `<button class="opt${s.id===(curSeries()||{}).id?' on':''}" data-a="pickSeries" data-id="${esc3(s.id)}"><div><b>${esc3(s.title)}</b><small>${s.is_free?'Free':'Premium'}, ${k.done} of ${k.n} tests attempted</small></div><span class="ck">${ic('check')}</span></button>`}).join('')}</div><button class="btn lg ghost" style="margin-top:12px" data-a="toStore">${ic('tests',16)}Get more test series</button>`);
A.pickSeries=el=>{lsSet('cbt_v3_series',el.dataset.id);closeLayer();const b=$('#serBox');if(b){b.style.transition='opacity .2s';b.style.opacity=0}setTimeout(()=>{softRender();toast3('Switched to '+(curSeries()||{}).title)},200)};
A.zone=el=>{const k=el.dataset.k;({study:()=>go('lib'),series:()=>A.mySeries(),dl:()=>openNotes(),hist:()=>A.hist(),mk:()=>openMistakes(),bm:()=>openSaved(),qb:()=>oldHash('#/qb'),pyq:()=>oldHash('#/pyq'),gen:()=>oldHash('#/gen')}[k]||(()=>{}))()};
A.test=el=>{const t=tOf(el.dataset.id);if(!t)return;if(t.locked){oldModal(()=>openTest(t.id));return}oldRun(()=>openTest(t.id))};
A.review=el=>oldRun(()=>openReview(el.dataset.r));

/* ---------- weekly schedule of the series chosen on Home: tests by the day they open; any week of any month ---------- */
const monOf=t=>{const d=new Date(t);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()};
const MON=()=>monOf(nowMs());
const TI=()=>(new Date(nowMs()).getDay()+6)%7;
const addDays=(t,n)=>{const d=new Date(t);d.setDate(d.getDate()+n);return d.getTime()};
let wkMon=0,wkSel=0;
const wkTests=()=>{const cs=curSeries();return cs?testsOf(cs.id).filter(t=>t.opens_at):[]};
function dayItems(a){const b=addDays(a,1);return wkTests().filter(t=>t.opens_at>=a&&t.opens_at<b).sort((x,y)=>x.opens_at-y.opens_at)}
const weekItems=i=>dayItems(addDays(MON(),i));
const mKey=t=>{const d=new Date(t);return d.getFullYear()*12+d.getMonth()};
function weekView(){const cs=curSeries();return {t:'Weekly schedule',s:cs?cs.title:'',key:'week',right:()=>`<button class="ib" data-a="wkMonth" aria-label="Choose a month">${ic('cal',19)}</button>`,
  html:()=>{const d=addDays(wkMon,wkSel),it=dayItems(d),today=day0(nowMs());
  return `<div class="wkbar"><button class="mbtn" data-a="wkMonth" aria-label="Choose a month">${fD(d,{month:'long',year:'numeric'})}${ic('down',18)}</button>
    <span><button class="ib sm" data-a="wkStep" data-v="-1" aria-label="Previous week">${ic('back',18)}</button><button class="ib sm" data-a="wkStep" data-v="1" aria-label="Next week">${ic('right',18)}</button></span></div>
  <div class="card wk" role="tablist">${[0,1,2,3,4,5,6].map(i=>{const dd=addDays(wkMon,i);return `<button class="wd${i===wkSel?' on':''}${dd===today?' today':''}" role="tab" aria-selected="${i===wkSel}" data-a="wkDay" data-i="${i}"><small>${fD(dd,{weekday:'narrow'})}</small><b>${new Date(dd).getDate()}</b><i style="${dayItems(dd).length?'':'opacity:0'}"></i></button>`}).join('')}</div>
  <div class="sh"><h2>${d===today?'Today':fD(d,{weekday:'long',day:'numeric',month:'long'})}</h2><span class="aside">${it.length} ${it.length===1?'test':'tests'}</span></div>
  ${it.length?`<div class="card rows">${it.map(t=>`<button class="it test" data-a="openSD" data-id="${esc3(t.series_id)}" style="width:100%;text-align:left"><time>${fT(t.opens_at)}</time><div><b>${esc3(t.title)}</b><small><em>Test</em>, ${dur(t.duration||0)}, ${t.questions||0} questions</small></div>${ic('right',16)}</button>`).join('')}</div>`
   :`<div class="card empty"><span class="ti">${ic('cal',22)}</span><b>No tests scheduled for this day</b><p>Pick another day or month to see what is coming in ${esc3(cs?cs.title:'your test series')}.</p></div>`}`}}}
function wkGo(t){wkMon=monOf(t);wkSel=Math.round((day0(t)-wkMon)/DAY);if(wkSel<0||wkSel>6)wkSel=0}
A.week=()=>{if(!curSeries())return;wkGo(nowMs());push(weekView())};
A.wkDay=el=>{wkSel=+el.dataset.i;redraw()};
A.wkStep=el=>{wkMon=addDays(wkMon,7*+el.dataset.v);wkSel=monOf(nowMs())===wkMon?TI():0;redraw()};
A.wkMonth=()=>{const T=wkTests(),now=mKey(nowMs()),ks=T.map(t=>mKey(t.opens_at)),lo=Math.min(now-2,...ks),hi=Math.max(now+6,...ks),cur=mKey(addDays(wkMon,wkSel)),L=[];
  for(let k=lo;k<=hi;k++)L.push(k);
  openSheet(`<h2 id="sheetT">Choose a month</h2><p class="sub">${esc3((curSeries()||{}).title||'')}</p><div class="mgrid">${L.map(k=>{const y=Math.floor(k/12),m=k%12,n=ks.filter(x=>x===k).length;
   return `<button class="${k===cur?'on':''}${k===now?' now':''}" data-a="wkPick" data-k="${k}"><b>${fD(new Date(y,m,1),{month:'short'})}</b><small>${y}</small><em>${n?n+(n===1?' test':' tests'):'No tests'}</em></button>`}).join('')}</div>`)};
A.wkPick=el=>{const k=+el.dataset.k,y=Math.floor(k/12),m=k%12,first=new Date(y,m,1).getTime(),next=new Date(y,m+1,1).getTime();closeLayer();
  if(k===mKey(nowMs()))wkGo(nowMs());else{const t=wkTests().filter(x=>x.opens_at>=first&&x.opens_at<next).sort((a,b)=>a.opens_at-b.opens_at)[0];wkGo(t?t.opens_at:first)}redraw()};
A.oldTracker=()=>oldHash('#/t');

/* ---------- notifications (the classic notices) ---------- */
function syncBell(){const b=$('#bell');if(!b)return;const u=unread();b.innerHTML=ic('bell',21)+`<span class="dot${u?'':' off'}"></span>`;b.setAttribute('aria-label',u?`Notifications, ${u} unread`:'Notifications')}
const grpOf=t=>{const k=Math.round((day0(nowMs())-day0(t))/DAY);return k<=0?'Today':k===1?'Yesterday':'Earlier'};
function notifView(){return {t:'Notifications',s:unread()?`${unread()} unread`:'All caught up',key:'notif',right:()=>`<button class="ib" data-a="readAll" aria-label="Mark all as read">${ic('checks',19)}</button>`,
  html:()=>{const L=(NOTES||[]).slice().sort((a,b)=>(b.at||0)-(a.at||0)),G=[...new Set(L.map(n=>grpOf(n.at)))],s=seenAt();
  return NOTES===null?`<div class="card rows"><div class="item sk" style="height:70px"></div><div class="item sk" style="height:70px;margin-top:8px"></div></div>`:L.length?G.map(g=>`<div class="stack" style="gap:10px"><p class="gh">${g}</p><div class="card rows">${L.filter(n=>grpOf(n.at)===g).map(n=>`<button class="nt${n.at>s?' un':''}" data-a="openNote" data-id="${esc3(n.id)}"><span class="ti">${ic(n.img?'file':n.link?'mega':'bell',19)}</span><span style="min-width:0"><span class="nh"><b>${esc3(n.title||'Announcement')}</b><time>${n.at?dayWord(n.at):''}</time></span><p>${esc3((n.text||'').slice(0,120))}</p></span></button>`).join('')}</div></div>`).join('')
   :`<div class="card empty"><span class="ti">${ic('bell',22)}</span><b>No notifications yet</b><p>Notices from Aspiron show up here.</p></div>`}}}
let bellBusy=false;
A.bell=()=>{if(bellBusy||(top()&&top().key==='notif'))return;bellBusy=true;closeLayer();const b=$('#bell');b.classList.remove('ringing');void b.offsetWidth;b.classList.add('ringing');setTimeout(()=>b.classList.remove('ringing'),700);
  setTimeout(()=>{push(notifView());bellBusy=false;loadNotes().then(()=>{if(top()&&top().key==='notif'){redraw();$('#scrS').textContent=unread()?`${unread()} unread`:'All caught up'}})},RM?0:180)};
function markSeen(at){try{LS.set('cbt_ann_seen',Math.max(seenAt(),at))}catch(e){lsSet('cbt_ann_seen',Math.max(seenAt(),at))}try{bellUpdate()}catch(e){}syncBell()}
A.readAll=()=>{if(!unread()){toast3('Nothing unread');return}markSeen(Math.max(...NOTES.map(n=>n.at||0)));redraw();$('#scrS').textContent='All caught up';toast3('All marked as read')};
A.openNote=el=>{const n=(NOTES||[]).find(x=>String(x.id)===el.dataset.id);if(!n)return;markSeen(n.at||0);redraw();$('#scrS').textContent=unread()?`${unread()} unread`:'All caught up';
  const u=/^https?:\/\//i.test(n.link||'')?n.link:'';
  openSheet(`<h2 id="sheetT">${esc3(n.title||'Announcement')}</h2><p class="sub">${n.at?dS(n.at):''}</p><p style="font-size:15px;line-height:1.65;white-space:pre-wrap">${typeof linkify==='function'?linkify(n.text||''):esc3(n.text||'')}</p>
   <div class="g2" style="margin-top:16px;grid-template-columns:1fr 1fr">${n.img?'<button class="btn ghost" data-a="oldNotices">See the picture</button>':'<span></span>'}${u?`<a class="btn gold" href="${esc3(u)}" target="_blank" rel="noopener noreferrer">${esc3(n.label||'Open link')}</a>`:''}</div>`)};
A.oldNotices=()=>oldHash('#/n');

/* ================= TESTS: store + my test series, the store's own data (photos, descriptions, reviews) ================= */
const TQ={q:'',f:{e:[],c:[],s:[]},mf:'paid',cat:'all',sf:'all',xt:'d',tile:'',tf:'all',ts:'all',plan:null};
let XD=null,RV={},SCHD={},LANGS=new Set(),SMAP={},extrasBusy=null;
function loadExtras(){if(extrasBusy||XD)return extrasBusy;const q=(fn,auth)=>rpc(fn,{},!auth).catch(()=>null);
  extrasBusy=Promise.all([q('cbt_store_explore'),q('cbt_store_reviews'),q('cbt_store_schedules'),q('cbt_store_langs'),q('cbt_store_map',true)]).then(([x,r,s,l,m])=>{
   XD={};(x&&x.ok?x.items||[]:[]).forEach(i=>XD[i.id]=i);RV={};(r&&r.ok?r.items||[]:[]).forEach(i=>RV[i.id]=i);SCHD={};(s&&s.ok?s.items||[]:[]).forEach(i=>SCHD[i.id]=i);
   LANGS=new Set((l&&l.ok?l.items||[]:[]).map(String));SMAP=(m&&m.ok&&m.map)||{};
   if(S.tab==='test'&&!scrOpen())drawT();if(scrOpen()&&top().store)redraw()}).finally(()=>{extrasBusy=null});return extrasBusy}
const okImg=u=>/^(data:image\/|https:\/\/)/.test(u||'');
const offPct=x=>x.mrp&&x.mrp>x.price?Math.round((1-x.price/x.mrp)*100):0;
const seriesOfItem=id=>Object.keys(SMAP).find(k=>SMAP[k]===id);
const itemOfSeries=sid=>(STORE||[]).find(x=>x.id===SMAP[sid]);
const owned=x=>{const sid=seriesOfItem(x.id);return sid&&mine().some(s=>s.id===sid)?sid:null};
const cats=()=>[...new Set((STORE||[]).map(x=>String(x.section||'').trim()).filter(Boolean))];
const rvOf=x=>RV[x.id]&&RV[x.id].count?RV[x.id]:null;
const starRow=r=>`<span class="stars" aria-label="${(+r.avg).toFixed(1)} out of 5">${ic('star',13).replace('class="i"','class="i fill"')}<b>${(+r.avg).toFixed(1)}</b> <span class="mut">(${fmtN(r.count)})</span></span>`;
function coverOf(x,label){return okImg(x&&x.image)?`<img src="${esc3(x.image)}" alt="${esc3(x.title)}" loading="lazy">`:`<span class="cvph"><small>${esc3(label||courseOf(x||{})||'Aspiron')}</small><b>${esc3((x&&x.title)||'')}</b></span>`}
const priceH=x=>x.price?`<span class="price"><b>₹${fmtN(x.price)}</b>${offPct(x)?`<s>₹${fmtN(x.mrp)}</s><span class="badge off">${offPct(x)}% off</span>`:''}</span>`:'<span class="price"><span class="free">Free</span></span>';
const buyHref=x=>'store.html#b='+encodeURIComponent(x.id);
function actH(x){const sid=owned(x),soon=x.buy_on===false;
  if(sid)return `<button class="btn sm" data-a="openSD" data-id="${esc3(sid)}">${ic('play',14)}Open</button>`;
  if(soon&&!x.prebook)return `<a class="btn sm" href="${storeUrl(x)}">${ic('bell',15)}Notify me</a>`;
  return `<a class="btn sm gold" href="${buyHref(x)}">${soon?'Pre-book':x.price?'Buy now':'Get it free'}</a>`}

/* ---------- the Tests page look (Admin → Tests page): poster, and the filter Exam / Class / Subject ---------- */
const LOOK0={poster:'',link:'',exams:['NEET','JEE'],classes:['Class 11','Class 12','Dropper'],subjects:['Physics','Chemistry','Biology','Maths'],tags:{}};
let LOOK=null,lookBusy=null;
function loadLook(){if(LOOK||lookBusy)return lookBusy;lookBusy=rpc('cbt_store_look',{},true).then(r=>{LOOK=r&&r.ok?Object.assign({},LOOK0,r,{tags:r.tags||{}}):LOOK0}).catch(()=>{LOOK=LOOK0})
  .finally(()=>{lookBusy=null;if(S.tab==='test'&&!scrOpen())softRender()});return lookBusy}
const LK=()=>LOOK||LOOK0;
/* which exams / classes / subjects a store series is for; not set in the admin yet = guessed from its course and name.
   An empty list means "all of them". */
function tagsOf(x){const t=LK().tags[x.id];if(t)return {e:t.e||[],c:t.c||[],s:t.s||[]};const n=String(x.title||'').toLowerCase();
  return {e:courseOf(x)?[courseOf(x)]:[],c:[],s:LK().subjects.filter(v=>{const w=v.toLowerCase().replace(/s$/,'');return w.length>2&&n.includes(w)})}}
const tfCount=()=>TQ.f.e.length+TQ.f.c.length+TQ.f.s.length;
function spass(x){const w=TQ.q.toLowerCase().split(/\s+/).filter(Boolean),h=[x.title,x.subtitle,x.section,courseOf(x),(x.features||[]).join(' '),(XD&&XD[x.id]||{}).description].join(' ').toLowerCase();if(!w.every(v=>h.includes(v)))return false;
  const g=tagsOf(x);return ['e','c','s'].every(k=>!TQ.f[k].length||!g[k].length||g[k].some(v=>TQ.f[k].includes(v)))}
const sorted=L=>L;
const mpass=s=>{const w=TQ.q.toLowerCase().split(/\s+/).filter(Boolean),h=[s.title,s.description,testsOf(s.id).map(t=>t.title).join(' ')].join(' ').toLowerCase();return w.every(v=>h.includes(v))};

/* ---------- top: the poster from Admin → Tests page, edge to edge, with the search on it and the two big buttons on its bottom ---------- */
function tabs2(){const c=myCount(),n=(STORE||[]).filter(x=>x.buy_on!==false).length;
  return `<div class="tt2">
   <button class="${TQ.tile==='store'?'on':''}" data-a="toList"><span class="ti">${ic('tests',22)}</span><b>Test Series Store</b><small>${STORE?n+' series':'Loading'}</small></button>
   <button class="${TQ.tile==='my'?'on':''}" data-a="mySeries"><span class="ti">${ic('layers',22)}</span><b>My Test Series</b><small>${c.all?c.all+' enrolled':'None yet'}</small></button></div>`}
function posterImg(){const p=LK().poster||'';return /^data:image\/(jpeg|png|webp);base64,/.test(p)?p:''}
function poster(){const L=LK(),img=posterImg(),u=/^(https:\/\/|#\/|store\.html#)[^\s"'<>\\]*$/.test(L.link||'')?L.link:'';
  const art=img?`<img src="${esc3(img)}" alt="">`:`<span class="pst-ph"><small>ASPIRON EDUCATION</small><b>Test series</b><em>NEET and JEE, exam-style tests with All India rank</em></span>`;
  return `<div class="pst-stick" id="pstStick"><div class="pst-bd" id="pstBd"></div>
   <div class="pst-top"><div class="search"><label class="sbox">${ic('search',19)}<input id="tq" type="search" autocomplete="off" placeholder="Search test series, test name or exam" value="${esc3(TQ.q)}" aria-label="Search test series, test name or exam"><button class="clr" data-a="tqClear" aria-label="Clear search"${TQ.q?'':' hidden'}>${ic('x',17)}</button></label>
   <button class="fb${tfCount()?' on':''}" data-a="tFilter" aria-label="Filter${tfCount()?`, ${tfCount()} on`:''}">${ic('filter',20)}${tfCount()?`<b>${tfCount()}</b>`:''}</button></div></div>
   <div class="pst-tabs" id="pstTabs">${tabs2()}</div></div>
   <section class="pst${img?'':' noimg'}" id="pst">${u?`<a class="pst-art" href="${esc3(u)}"${/^https:/.test(u)?' target="_blank" rel="noopener noreferrer"':''} aria-label="Offer">${art}</a>`:`<div class="pst-art">${art}</div>`}</section>`}

/* the poster's own colours, read from the picture on the phone: the top edge tints the header, a deep shade colours the
   offer boxes and the chosen button. Any poster the admin puts up gets matching colours by itself. */
let PCOL=null,pcKey='';
const lum=c=>(.2126*c[0]+.7152*c[1]+.0722*c[2])/255;
const rgb=(c,a)=>`rgba(${c.map(Math.round).join(',')},${a==null?1:a})`;
function readPC(src){return new Promise(res=>{const im=document.createElement('img');im.onload=()=>{try{const W=24,H=30,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(im,0,0,W,H);const d=x.getImageData(0,0,W,H).data;
   const avg=(y0,y1,f)=>{let r=0,g=0,b=0,n=0;for(let y=y0;y<y1;y++)for(let i=0;i<W;i++){const k=(y*W+i)*4,p=[d[k],d[k+1],d[k+2]];if(f&&!f(p))continue;r+=p[0];g+=p[1];b+=p[2];n++}return n?[r/n,g/n,b/n]:null};
   const sat=p=>{const mx=Math.max(...p),mn=Math.min(...p);return mx?(mx-mn)/mx:0};
   const top=avg(0,3),viv=avg(0,H,p=>sat(p)>.35&&lum(p)>.12&&lum(p)<.8)||avg(0,H),k=Math.min(1,.3/Math.max(.05,lum(viv))),deep=viv.map(v=>v*k);
   res({top,deep})}catch(e){res(null)}};im.onerror=()=>res(null);im.src=src})}
function hexRGB(h){h=String(h||'').trim();const m=/^#?([0-9a-f]{6})$/i.exec(h);return m?[0,2,4].map(i=>parseInt(m[1].substr(i,2),16)):[43,45,50]}
function setPC(pc){PCOL=pc;if(!host)return;if(!pc){['--pcTop','--pcDeep','--pcLogo','--pcLogoE'].forEach(v=>host.style.removeProperty(v));return}
  const light=lum(pc.top)<.55;host.style.setProperty('--pcTop',rgb(pc.top,.78));host.style.setProperty('--pcDeep',rgb(pc.deep));
  host.style.setProperty('--pcLogo',light?'#ffffff':'#1d1e22');host.style.setProperty('--pcLogoE',light?'rgba(255,255,255,.72)':'#55575d');host.dataset.pcMeta=rgb(pc.top)}
function loadPC(){const img=posterImg(),key=img?img.length+img.slice(-40):'none';if(key===pcKey)return;pcKey=key;
  if(!img){const t=hexRGB(getComputedStyle(host).getPropertyValue('--hero1'));setPC({top:t,deep:t});lastQ=-1;pstSync();return}
  readPC(img).then(pc=>{if(pcKey!==key)return;setPC(pc);lastQ=-1;pstSync()})}
/* scrolling the Tests page: the search bar stays at the top, the two big buttons ride up with the poster, stop under
   the search bar and shrink to slim buttons; the poster drifts up and fades, and the header's colour goes from the
   poster's colour back to normal. Only colours, positions and the buttons' height change (the header keeps its size). */
const parseCol=v=>{v=String(v||'').trim();let m=/^#?([0-9a-f]{6})$/i.exec(v);if(m)return [0,2,4].map(i=>parseInt(m[1].substr(i,2),16)).concat(1);
  m=/rgba?\(([^)]+)\)/.exec(v);if(!m)return [245,245,243,1];const n=m[1].split(',').map(x=>parseFloat(x));return [n[0],n[1],n[2],n.length>3?n[3]:1]};
const mixC=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const TABH=116,TABS=48;
let pstRaf=0,lastQ=-1,lastMeta='';
/* sizes are measured once (on draw, resize, picture load), never during the scroll, so every frame only moves things */
const PM={ok:0};
function pstMeasure(){const h=$('#hdr'),ps=$('#pst');if(!h||!ps)return;PM.hh=h.offsetHeight;PM.y0=ps.offsetHeight-PM.hh-96;PM.y1=68;PM.span=Math.max(1,PM.y0-PM.y1);
  PM.bdH=Math.max(220,PM.y0+TABH+14);PM.bg=parseCol(getComputedStyle(host).getPropertyValue('--bg')).slice(0,3);host.style.setProperty('--hh',PM.hh+'px');
  const bd=$('#pstBd');if(bd)bd.style.height=PM.bdH+'px';PM.ok=1;lastQ=-1}
function setMeta(c){const m=document.querySelector('meta[name="theme-color"]');if(m&&c!==lastMeta){m.setAttribute('content',c);lastMeta=c}}
function pstSync(re){if(!root)return;const h=$('#hdr');if(!h||!main)return;const st=$('#pstStick'),ps=$('#pst'),tint=$('#hdrTint'),old=document.body.classList.contains('v3old');
  const on=!!(S.tab==='test'&&!scrOpen()&&st&&ps&&!old);main.classList.toggle('pc',!!(on&&PCOL));
  if(!on){if(tint)tint.style.opacity=0;h.classList.remove('onpst');PM.ok=0;lastQ=-1;if(!old&&host)setMeta(getComputedStyle(host).getPropertyValue('--bg').trim()||'#f5f5f3');return}
  if(re||!PM.ok)pstMeasure();
  const sy=Math.max(0,scrollY),p=Math.min(1,sy/PM.span),q=p*p*(3-2*p);
  if(q===1&&lastQ===1)return;lastQ=q;
  st.style.setProperty('--p',q.toFixed(4));
  const th=TABH-(TABH-TABS)*q,ty=Math.max(PM.y1,PM.y0-sy);$('#pstTabs').style.transform=`translate3d(0,${ty.toFixed(2)}px,0)`;
  const bd=$('#pstBd');bd.style.transform=`translate3d(0,${(ty+th+14-PM.bdH).toFixed(2)}px,0)`;bd.style.opacity=Math.min(1,q*1.15).toFixed(3);
  const art=ps.firstElementChild;if(art){art.style.transform=`translate3d(0,${(Math.min(sy,PM.span+200)*.45).toFixed(2)}px,0)`;art.style.opacity=(1-.92*q).toFixed(3)}
  if(tint)tint.style.opacity=PCOL?(1-q).toFixed(3):0;h.classList.toggle('onpst',!!PCOL&&q<.5);
  if(PCOL){const c=mixC(PCOL.top,PM.bg,q).map(v=>Math.round(v/4)*4);setMeta(`rgb(${c.join(',')})`)}}
addEventListener('scroll',()=>{if(!root||!main||pstRaf)return;if(S.tab!=='test'&&!PM.ok)return;pstRaf=requestAnimationFrame(()=>{pstRaf=0;pstSync()})},{passive:true});
addEventListener('resize',()=>{if(root&&S.tab==='test')pstSync(true)},{passive:true});
/* a scroll that stops half way through the change settles to the nearer end, so the bar is never left half shrunk */
let snapT=0;
function pstSnap(){if(RM||!root||S.tab!=='test'||scrOpen()||!PM.ok||layer)return;const p=scrollY/PM.span;if(p>.03&&p<.97)scrollTo({top:p<.42?0:Math.ceil(PM.span),behavior:'smooth'})}
if('onscrollend' in window)addEventListener('scrollend',pstSnap);else addEventListener('scroll',()=>{clearTimeout(snapT);snapT=setTimeout(pstSnap,200)},{passive:true});

/* ---------- store view ---------- */
function offer3(){const L=(STORE||[]).filter(x=>x.buy_on!==false&&x.price).sort((a,b)=>offPct(b)-offPct(a)).slice(0,3);if(L.length<2)return '';
  return `<section class="sec"><div class="off3">${L.map(x=>`<button class="o3" data-a="xp" data-id="${esc3(x.id)}"><span class="o3i">${ic('spark',20)}</span><b>${esc3(x.title)}</b><em>${offPct(x)?`${offPct(x)}% off, now ₹${fmtN(x.price)}`:`Now @ ₹${fmtN(x.price)}`}</em></button>`).join('')}</div></section>`}
function iCard(x){const r=rvOf(x),soon=x.buy_on===false;
  return `<article class="card ic2"><button class="cv" data-a="xp" data-id="${esc3(x.id)}" aria-label="Explore ${esc3(x.title)}">${coverOf(x)}${offPct(x)?`<span class="badge off cvb">${offPct(x)}% off</span>`:''}${soon?'<span class="badge pro cvb">Coming soon</span>':x.badge?`<span class="badge pro cvb">${esc3(x.badge)}</span>`:''}</button>
  <div class="ic2b"><span class="tag">${[courseOf(x),esc3(x.section||'')].filter(Boolean).join(', ')||'Test series'}</span><h3>${esc3(x.title)}</h3>${x.subtitle?`<p class="mut">${esc3(x.subtitle)}</p>`:''}
   <div class="meta">${r?starRow(r):''}${LANGS.has(x.id)?`<span>${ic('book')}Hindi + English</span>`:''}${owned(x)?'<span class="st ok">Enrolled</span>':''}</div>
   <div class="ft">${priceH(x)}<div class="acts"><button class="btn sm ghost" data-a="xp" data-id="${esc3(x.id)}">Explore</button>${actH(x)}</div></div></div></article>`}
function trendRail(home){const L=(STORE||[]).filter(x=>x.buy_on!==false).slice().sort((a,b)=>((rvOf(b)||{count:0}).count-(rvOf(a)||{count:0}).count)||(!!b.badge-!!a.badge)).slice(0,6);if(!L.length||(!home&&L.length<2))return '';
  return `<section class="sec"><div class="sh"><h2>Trending test series</h2>${home?`<button class="lnk" data-a="toStore">View all${ic('right')}</button>`:''}</div><div class="rail">${L.map(x=>`<button class="card trc" data-a="xp" data-id="${esc3(x.id)}"><span class="cv">${coverOf(x)}</span><span class="trb"><b>${esc3(x.title)}</b>${priceH(x)}</span></button>`).join('')}</div></section>`}
function storeView(){
  if(STORE===null){loadStore();return `<div class="list"><div class="card sk" style="height:120px"></div><div class="card sk" style="height:320px"></div></div>`}
  if(TQ.q.trim()||tfCount()){const L=sorted(STORE.filter(spass)),M=TQ.q.trim()?mine().filter(mpass):[];
   return `<section class="sec"><div class="sh"><h2>${L.length+M.length} ${L.length+M.length===1?'result':'results'}</h2><button class="lnk" data-a="tClear">Clear all</button></div>
    ${M.length?`<p class="gh">In your test series</p><div class="card rows">${M.map(s=>`<button class="row" data-a="openSD" data-id="${esc3(s.id)}"><span class="ti k">${ic('layers',19)}</span><span><b>${esc3(s.title)}</b><small>${seriesStats(s).n} tests</small></span>${ic('right',18)}</button>`).join('')}</div>`:''}
    ${L.length?`${M.length?'<p class="gh">In the store</p>':''}<div class="list">${L.map(iCard).join('')}</div>`:M.length?'':`<div class="card empty"><span class="ti">${ic('search',22)}</span><b>No test series match</b><p>Try another word, or remove a filter.</p><button class="btn sm ghost" data-a="tClear">Clear search and filters</button></div>`}</section>`}
  const C2=cats(),all=STORE.filter(x=>x.buy_on!==false&&(TQ.cat==='all'||(TQ.cat==='NEET'||TQ.cat==='JEE'?courseOf(x)===TQ.cat:String(x.section||'').trim()===TQ.cat))),soon=STORE.filter(x=>x.buy_on===false);
  return offer3()+promoRail('tbRail')+`<section class="sec" id="allSec"><div class="sh"><h2>Test series</h2><span class="aside">${all.length} series</span></div>
   <div class="chips">${['all','NEET','JEE',...C2].map(q=>`<button class="${TQ.cat===q?'on':''}" aria-pressed="${TQ.cat===q}" data-a="cat" data-v="${esc3(q)}">${q==='all'?'All':esc3(q)}</button>`).join('')}</div>
   ${all.length?`<div class="list">${all.map(iCard).join('')}</div>`:`<div class="card empty"><span class="ti">${ic('layers',22)}</span><b>Nothing in this group yet</b><p>Pick another group above.</p></div>`}</section>`+
   trendRail()+(soon.length?`<section class="sec"><div class="sh"><h2>Coming soon</h2><span class="aside">${soon.length}</span></div><div class="list">${soon.map(iCard).join('')}</div></section>`:'')+
   `<a class="btn lg ghost" href="store.html">${ic('right',16)}Open the full store</a>`}

VIEW.test=()=>poster()+`<div id="tBody" class="stack" style="gap:var(--gap)">${storeView()}</div>`;
function drawT(){const b=$('#tBody');if(!b)return;b.innerHTML=storeView();const n=tfCount(),fb=$('[data-a="tFilter"]');if(fb){fb.className='fb'+(n?' on':'');fb.innerHTML=ic('filter',20)+(n?`<b>${n}</b>`:'')}const x=$('[data-a="tqClear"]');x&&(x.hidden=!TQ.q);const t=$('.tt2');t&&(t.outerHTML=tabs2());autoRail('#tbRail','#tbRailD');reveal(b);lastQ=-1;pstSync()}
AFTER.test=()=>{loadMeta();const q=$('#tq');q.addEventListener('input',()=>{TQ.q=q.value;drawT()});autoRail('#tbRail','#tbRailD');loadExtras();loadLook();loadPC();pstSync(true);const pi=$('#pst img');pi&&!pi.complete&&pi.addEventListener('load',()=>pstSync(true),{once:true});
  try{if(typeof promoLoad==='function'&&!(typeof PROMO!=='undefined'&&PROMO&&PROMO.length))promoLoad().then(()=>{if(S.tab==='test'&&!scrOpen())softRender()})}catch(e){}};
A.toList=()=>{TQ.tile='store';$$('.tt2 button').forEach(b=>b.classList.toggle('on',b.dataset.a==='toList'));const a=$('#allSec');a&&a.scrollIntoView({behavior:RM?'auto':'smooth',block:'start'})};
A.tqClear=()=>{TQ.q='';$('#tq').value='';drawT();$('#tq').focus()};
A.tClear=()=>{TQ.q='';TQ.f={e:[],c:[],s:[]};const q=$('#tq');if(q)q.value='';drawT()};
A.cat=el=>{TQ.cat=el.dataset.v;drawT()};
A.mf=el=>{TQ.mf=el.dataset.v;redraw()};
A.tFilter=()=>{loadLook();const G=[['e','Exam',LK().exams],['c','Class',LK().classes],['s','Subject',LK().subjects]].filter(g=>g[2].length);
  const draw=()=>{sheet.innerHTML=`<div class="grab"></div><h2 id="sheetT">Filter</h2><p class="sub">Pick your exam, class and subject.</p>
   ${G.map(([k,l,o])=>`<div class="fg"><h3>${l}</h3><div class="chips wrap">${o.map(v=>`<button class="${TQ.f[k].includes(v)?'on':''}" aria-pressed="${TQ.f[k].includes(v)}" data-fk="${k}" data-fv="${esc3(v)}">${esc3(v)}</button>`).join('')}</div></div>`).join('')}
   <div class="sheet-ft"><button class="btn ghost" data-fc>Clear</button><button class="btn" data-fa>Show ${(STORE||[]).filter(spass).length} test series</button></div>`};
  openSheet('');draw();sheet.onclick=e=>{const c=e.target.closest('[data-fk]');if(c){const a=TQ.f[c.dataset.fk],v=c.dataset.fv,i=a.indexOf(v);i>-1?a.splice(i,1):a.push(v);const y=sheet.scrollTop;draw();sheet.scrollTop=y;drawT();return}
   if(e.target.closest('[data-fc]')){TQ.f={e:[],c:[],s:[]};draw();drawT();return}if(e.target.closest('[data-fa]')){closeLayer();A.toList()}}};

/* ---------- one test series page: photo, Description | Resources | Reviews, buy bar ---------- */
const SF=[['all','All'],['open','Available'],['up','Upcoming'],['att','Attempted'],['done','Completed'],['closed','Closed'],['lock','Locked']];
const grp=st=>({prog:'open',live:'open',new:'open',wait:'up',held:'att',done:'done',closed:'closed',lock:'lock'}[st]||'open');
function tActs(t){const st=stOf(t),r=resOf(t.id)[0],id=esc3(t.id);let p;try{p=typeof pendOf==='function'&&pendOf(t.id)}catch(e){}
  if(st==='lock')return `<button class="btn sm gold" data-a="test" data-id="${id}">${ic('lock',14)}Unlock</button>`;
  if(st==='wait')return `<button class="btn sm ghost" disabled>${ic('clock',15)}Opens ${fD(t.opens_at,{day:'numeric',month:'short'})}, ${fT(t.opens_at)}</button>`;
  if(st==='held')return `<button class="btn sm ghost" disabled>${ic('lock',14)}Result after ${p&&p.result_at?fD(p.result_at,{day:'numeric',month:'short'})+', '+fT(p.result_at):'the test closes'}</button>`;
  if(st==='closed')return r&&!p?`<button class="btn sm ghost" data-a="review" data-r="${esc3(r.id)}">View result</button>`:`<button class="btn sm ghost" disabled>${ic('lock',14)}Closed</button>`;
  const start=`<button class="btn sm${st==='done'?' ghost':' gold'}" data-a="test" data-id="${id}">${ic('play',14)}${st==='prog'?'Resume test':st==='done'?'Re-attempt':'Start test'}</button>`;
  return (r&&!p?`<button class="btn sm" data-a="review" data-r="${esc3(r.id)}">Result and solutions</button>`:'')+start}
function tRow(t){const st=stOf(t),r=resOf(t.id)[0],fo=t.folder_id&&(C().folders||[]).find(f=>f.id===t.folder_id);
  return `<article class="card tr${['closed','lock'].includes(st)?' dim':''}"><div class="tr-h"><b>${esc3(t.title)}</b>${stBadge(t)}</div>
  <div class="meta">${t.opens_at?`<span>${ic('cal')}${fD(t.opens_at,{weekday:'short',day:'numeric',month:'short'})}</span><span>${ic('clock')}${fT(t.opens_at)}</span>`:''}<span>${dur(t.duration||0)}</span><span>${t.questions||0} questions</span>${fo?`<span>${ic('layers')}${esc3(fo.title)}</span>`:''}</div>
  ${r&&t.best!=null&&t.best_max?`<p class="tnote">Best score <b>${t.best} / ${t.best_max}</b>${t.attempts>1?`, ${t.attempts} attempts`:''}</p>`:st==='prog'?'<p class="tnote">You started this test. Your answers are saved.</p>':''}
  <div class="acts">${tActs(t)}</div></article>`}
function rvBlock(x){const r=x&&rvOf(x);if(!x)return `<div class="card empty"><span class="ti">${ic('star',22)}</span><b>No reviews yet</b><p>Reviews are written by students whose series is unlocked.</p></div>`;
  if(!XD)return '<div class="card sk" style="height:140px"></div>';
  if(!r)return `<div class="card empty"><span class="ti">${ic('star',22)}</span><b>No reviews yet</b><p>Reviews are written by students whose series is unlocked.</p></div>`;
  const st=r.stars||[];return `<div class="card p rvs"><div class="rv-big"><b>${(+r.avg).toFixed(1)}</b><span>${'★'.repeat(Math.round(r.avg))}${'☆'.repeat(5-Math.round(r.avg))}</span><small>${fmtN(r.count)} review${r.count===1?'':'s'}</small></div>
   <div class="rv-bars">${[5,4,3,2,1].map((n,i)=>`<div><span>${n}</span><i><em style="width:${r.count?Math.round((st[i]||0)*100/r.count):0}%"></em></i><span>${st[i]||0}</span></div>`).join('')}</div></div>
   <div class="card rows">${(r.list||[]).slice(0,30).map(v=>`<div class="item"><span class="ti g" style="font-weight:600">${esc3(((v.name||'S').trim()[0]||'S').toUpperCase())}</span><div class="bd"><div class="tt"><b>${esc3(v.name||'Student')}</b><span class="gold" style="font-size:13px">${'★'.repeat(Number(v.rating)||0)}</span></div>${v.body?`<small style="font-size:13.5px;color:var(--tx)">${esc3(v.body)}</small>`:`<small>Gave ${Number(v.rating)||0} stars</small>`}${v.reply?`<small><b style="font-size:12.5px">Reply from Aspiron:</b> ${esc3(v.reply)}</small>`:''}</div></div>`).join('')}</div>`}
function descBlock(x,s){const d=String((x&&XD&&XD[x.id]||{}).description||s&&s.description||'').trim(),F=(x&&x.features)||[];
  return `${x&&x.subtitle?`<p style="font-size:15px">${esc3(x.subtitle)}</p>`:''}
  ${x&&LANGS.has(x.id)?`<div class="card p" style="display:flex;gap:12px;align-items:center"><span class="ti g">${ic('book',19)}</span><span><b style="font-size:14.5px">Available in English and हिंदी</b><br><small class="mut">Choose your medium when you buy. Every test comes in that language.</small></span></div>`:''}
  ${d?`<div class="card p stack" style="gap:8px"><b style="font-size:15px">About this test series</b><p class="mut" style="white-space:pre-wrap;font-size:14.5px;line-height:1.65">${esc3(d)}</p></div>`:''}
  ${F.length?`<div class="card p stack" style="gap:10px"><b style="font-size:15px">What you get</b><div class="feat" style="margin:0">${F.map(f=>`<span>${ic('check')}${esc3(f)}</span>`).join('')}</div></div>`:''}
  ${!d&&!F.length&&!(x&&x.subtitle)?`<div class="card empty"><span class="ti">${ic('info',22)}</span><b>No description yet</b><p>Details about this series will appear here.</p></div>`:''}`}
function resBlock(x,sid){
  if(sid){const L=testsOf(sid),k=seriesStats(sOf(sid)),cnt=g=>L.filter(t=>grp(stOf(t))===g).length,shown=TQ.sf==='all'?L:L.filter(t=>grp(stOf(t))===TQ.sf),up=L.filter(t=>stOf(t)==='wait').sort((a,b)=>a.opens_at-b.opens_at).slice(0,4);
   return `<div class="nums"><div><b>${k.n}</b><small>Total</small></div><div><b>${k.done}</b><small>Attempted</small></div><div><b>${cnt('up')}</b><small>Upcoming</small></div></div>
   ${up.length?`<div class="stack" style="gap:10px"><p class="gh">Upcoming schedule</p><div class="card rows">${up.map(t=>`<div class="it test"><time>${fD(t.opens_at,{day:'numeric',month:'short'})}<br>${fT(t.opens_at)}</time><div><b>${esc3(t.title)}</b><small><em>Test</em>, ${dur(t.duration||0)}</small></div><span></span></div>`).join('')}</div></div>`:''}
   <div class="chips" role="tablist">${SF.filter(f=>f[0]==='all'||cnt(f[0])).map(f=>`<button class="${TQ.sf===f[0]?'on':''}" data-a="sf" data-v="${f[0]}">${f[1]}<small>${f[0]==='all'?L.length:cnt(f[0])}</small></button>`).join('')}</div>
   <div class="list">${shown.length?shown.map(tRow).join(''):`<div class="card empty"><span class="ti">${ic('tests',22)}</span><b>No tests here</b><p>Pick another group above.</p></div>`}</div>
   <button class="btn lg ghost" data-a="oldSeries" data-id="${esc3(sid)}">${ic('file',16)}Folders, notes and PDFs</button>`}
  const f=SCHD[x.id],D=((XD||{})[x.id]||{}).demos||[];
  const row=(ico,lab,t,ok)=>`<div class="row"><span class="ti${ok?' g':''}">${ic(ok?ico:'clock',19)}</span><span><b>${t}</b><small>${lab}</small></span>${ok?`<a class="btn sm ghost" href="${storeUrl(x).replace('#p=','#x=')}">Open</a>`:'<span class="badge n">Soon</span>'}</div>`;
  return `<div class="card rows">${row('cal','Schedule',f?esc3(f.name||'Test schedule'):'Schedule coming soon',!!f)}${[1,2].map(n=>{const d=D.find(z=>z.slot===n)||{};return row('file',`Demo test ${n}`,esc3(d.title||`Demo test ${n}`),d.size>0)}).join('')}</div>
   <p class="hint">The full tests, results and solutions open after you get this series.</p>`}
function seriesPage(o){const x=o.item,sid=o.sid,s=sid&&sOf(sid);return {t:(x||s||{}).title||'Test series',s:sid?(s&&s.is_free?'Free series':'Your test series'):'Explore',store:1,
  html:()=>`<div class="xcv">${coverOf(x||{title:s&&s.title},sid?'Your test series':'')}</div>
   <div class="stack" style="gap:8px"><span class="tag">${x?[courseOf(x),esc3(x.section||'')].filter(Boolean).join(', ')||'Test series':s&&s.is_free?'Free series':'Premium series'}</span><h2 style="font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.25">${esc3((x||s).title)}</h2>
    <div class="meta">${x&&rvOf(x)?starRow(rvOf(x)):''}${sid?`<span class="st ok">Enrolled</span>`:''}${x&&x.buy_on===false?'<span class="st gold">Coming soon</span>':''}</div></div>
   <div class="seg" role="tablist">${[['d','Description'],['r',sid?'Tests & resources':'Resources'],['v','Reviews']].map(t=>`<button role="tab" aria-selected="${TQ.xt===t[0]}" class="${TQ.xt===t[0]?'on':''}" data-a="xt" data-v="${t[0]}">${t[1]}</button>`).join('')}</div>
   <div class="stack" style="gap:14px;animation:rise .35s var(--out)">${TQ.xt==='d'?descBlock(x,s):TQ.xt==='r'?resBlock(x,sid):rvBlock(x)}</div>
   ${x&&!sid?`<div class="buybar"><span>${priceH(x)}</span>${actH(x)}</div>`:''}`}}
A.xp=el=>{const x=(STORE||[]).find(i=>i.id===el.dataset.id);if(!x)return;loadExtras();loadMeta();const sid=owned(x);TQ.xt='d';TQ.sf='all';TQ.tf='all';TQ.ts='all';TQ.plan=null;closeLayer();push(sid?ownedPage(sid):seriesPage({item:x,sid:null}))};
A.openSD=el=>{const sid=el.dataset.id;if(!sOf(sid))return;loadExtras();loadMeta();if(STORE===null)loadStore();TQ.xt=el.dataset.t||'r';TQ.tf='all';TQ.ts='all';TQ.plan=null;closeLayer();push(ownedPage(sid))};
A.xt=el=>{TQ.xt=el.dataset.v;redraw()};
A.sf=el=>{TQ.sf=el.dataset.v;redraw()};
A.oldSeries=el=>oldHash('#/s/'+el.dataset.id);
A.toStore=()=>{closeLayer();unwind(()=>{if(S.tab==='test'){scrollTo({top:0,behavior:RM?'auto':'smooth'});return}go('test')})};

/* ================= MY TEST SERIES + the series page (Description | Resources | Tests | Reviews) =================
   Validity, upgrade plans, test syllabus and the Tests-tab banner come from Admin → Series page (cbt_series_meta, v64).
   Without that SQL the page still works: no dates, no plans, no syllabus. */
let META=null,metaBusy=null;
function loadMeta(){if(META||metaBusy)return metaBusy;metaBusy=rpc('cbt_series_meta',{},true).then(r=>{META=r&&r.ok?r:{series:{},syl:{},promo:'',promo_link:''}}).catch(()=>{META={series:{},syl:{},promo:'',promo_link:''}})
  .finally(()=>{metaBusy=null;if(scrOpen()&&top()&&(top().key==='my'||top().key==='sp'))redraw();if(S.tab==='test'&&!scrOpen()){const t=$('.tt2');t&&(t.outerHTML=tabs2())}});return metaBusy}
const MT=sid=>((META||{}).series||{})[sid]||{};
const expired=s=>{const e=MT(s.id).e;return !!(e&&e<nowMs())};
const dLong=t=>fD(t,{day:'numeric',month:'short',year:'numeric'});
function validity(sid){const m=MT(sid);if(!m.s&&!m.e)return '';
  return `<p class="vd">${ic('cal',16)}${m.s?`<span>Starts on <b>${dLong(m.s)}</b></span>`:''}${m.s&&m.e?'<i></i>':''}${m.e?`<span>${m.e<nowMs()?'Ended on':'Ends on'} <b>${dLong(m.e)}</b></span>`:''}</p>`}
const upgradesOf=sid=>(MT(sid).u||[]).map(u=>{const it=(STORE||[]).find(x=>x.id===u.item);return it?{it,label:u.label||it.title}:null}).filter(Boolean);

/* ---------- My Test Series page ---------- */
function myCount(){const L=mine(),live=L.filter(s=>!expired(s));return {paid:live.filter(s=>!s.is_free).length,free:live.filter(s=>s.is_free).length,exp:L.length-live.length,all:L.length,live:L.some(s=>seriesStats(s).live)}}
function myCard(s){const k=seriesStats(s),it=itemOfSeries(s.id),up=upgradesOf(s.id).length,ex=expired(s);
  return `<article class="card bc${ex?' dim':''}"><div class="bc-h"><h3>${esc3(s.title)}</h3>${k.live?'<span class="st live">Live</span>':`<span class="tag">${s.is_free?'Free':'Premium'}</span>`}</div>
   <button class="bc-cv" data-a="openSD" data-id="${esc3(s.id)}" aria-label="Open ${esc3(s.title)}">${coverOf(it||{title:s.title},s.is_free?'Free series':'Premium series')}</button>
   ${validity(s.id)||`<p class="vd">${ic('tests',16)}<span><b>${k.done}</b> of <b>${k.n}</b> tests attempted</span></p>`}
   <div class="bc-ft"><button class="btn ghost" data-a="openSD" data-id="${esc3(s.id)}" data-t="d">${up&&!ex?ic('crown',16)+'Upgrade':'Details'}</button><button class="btn" data-a="openSD" data-id="${esc3(s.id)}">Open Test Series</button></div></article>`}
function myView(){const c=myCount(),L=mine().filter(s=>TQ.mf==='exp'?expired(s):!expired(s)&&(TQ.mf==='paid'?!s.is_free:s.is_free));
  return `<div class="seg" role="tablist">${[['paid','Paid',c.paid],['free','Free',c.free],['exp','Expired',c.exp]].map(t=>`<button role="tab" aria-selected="${t[0]===TQ.mf}" class="${t[0]===TQ.mf?'on':''}" data-a="mf" data-v="${t[0]}">${t[1]}<small>${t[2]}</small></button>`).join('')}</div>
  <div class="list">${L.length?L.map(myCard).join(''):`<div class="card empty"><span class="ti">${ic('layers',22)}</span><b>${TQ.mf==='exp'?'No expired test series':TQ.mf==='paid'?'No paid test series yet':'No free test series yet'}</b><p>${TQ.mf==='exp'?'Series whose time has ended show up here.':'Get one from the store and it shows up here.'}</p>${TQ.mf==='exp'?'':'<button class="btn sm" data-a="toStore">Open the store</button>'}</div>`}</div>`}
function myPage(){return {t:'My Test Series',s:`${mine().length} enrolled`,key:'my',html:myView}}
A.mySeries=()=>{TQ.tile='my';$$('.tt2 button').forEach(b=>b.classList.toggle('on',b.dataset.a==='mySeries'));const c=myCount();TQ.mf=c.paid||!c.free?'paid':'free';closeLayer();if(STORE===null)loadStore();loadExtras();loadMeta();if(top()&&top().key==='my')return;push(myPage())};

/* ---------- the series page of a series the student has ---------- */
const UT=[['d','Description'],['r','Resources'],['t','Tests'],['v','Reviews']];
function utabs(){return `<div class="utabs" role="tablist">${UT.map(t=>`<button role="tab" aria-selected="${TQ.xt===t[0]}" class="${TQ.xt===t[0]?'on':''}" data-a="xt" data-v="${t[0]}">${t[1]}</button>`).join('')}</div>`}
/* Description: photo, validity, plans (current + upgrades), what the series includes, about */
function spDesc(sid){const s=sOf(sid),it=itemOfSeries(sid),m=MT(sid),ups=upgradesOf(sid),F=(m.f&&m.f.length?m.f:(it&&it.features)||[]),d=String((it&&XD&&XD[it.id]||{}).description||s.description||'').trim();
  if(TQ.plan==null||TQ.plan>ups.length)TQ.plan=ups.length?1:0;const sel=TQ.plan?ups[TQ.plan-1]:null,inc=sel?(sel.it.features||[]):F;
  return `<div class="xcv">${coverOf(it||{title:s.title},'Your test series')}</div>
  ${validity(sid)?`<div class="card p">${validity(sid)}</div>`:''}
  ${ups.length&&!expired(s)?`<div class="stack" style="gap:12px"><div class="sh" style="margin:0"><h2>Choose a plan</h2></div>
   <div class="plans">${[{label:s.title,cur:1}].concat(ups).map((p,i)=>`<button class="plan${TQ.plan===i?' on':''}" data-a="plan" data-i="${i}" aria-pressed="${TQ.plan===i}"><b>${esc3(i?p.label:'Your plan')}</b><small>${i?`₹${fmtN(p.it.price)}`:'Current plan'}</small><i>${ic('check',14)}</i></button>`).join('')}</div>
   ${inc.length?`<div class="card pinc"><p class="pinc-h">${esc3(sel?sel.label:s.title)} includes</p><div class="pinc-g">${inc.map(f=>`<span>${ic('star',15).replace('class="i"','class="i fill"')}${esc3(f)}</span>`).join('')}</div></div>`:''}</div>`:''}
  ${F.length&&!(ups.length&&!sel)?`<div class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>This series includes</h2></div><div class="card rows">${F.map(f=>`<div class="row"><span class="ti g">${ic('star',17).replace('class="i"','class="i fill"')}</span><span><b style="font-weight:500">${esc3(f)}</b></span></div>`).join('')}</div></div>`:''}
  ${d?`<div class="card p stack" style="gap:8px"><b style="font-size:15px">About this test series</b><p class="mut" style="white-space:pre-wrap;font-size:14.5px;line-height:1.65">${esc3(d)}</p></div>`:''}
  ${sel?`<div class="buybar"><span class="price"><b>₹${fmtN(sel.it.price)}</b>${offPct(sel.it)?`<s>₹${fmtN(sel.it.mrp)}</s><span class="badge off">${offPct(sel.it)}% off</span>`:''}</span><a class="btn gold" href="${buyHref(sel.it)}">Upgrade now</a></div>`:''}`}
A.plan=el=>{TQ.plan=+el.dataset.i;redraw()};
/* Resources: the series' files (schedule, syllabus, notes) grouped, each group opens its own list */
const RESK=[['schedule','Schedule','cal'],['syllabus','Syllabus','list'],['notes','Notes and PDFs','file']];
function spRes(sid){const fl=(sOf(sid).files||[]),G=RESK.map(k=>[k,fl.filter(f=>(f.kind||'notes')===k[0])]).filter(g=>g[1].length);
  if(!G.length)return `<div class="card empty"><span class="ti">${ic('file',22)}</span><b>No study material yet</b><p>Schedules, syllabus and PDFs for this series will appear here.</p></div>`;
  return `<div class="list">${G.map(([k,L],i)=>`<button class="card rsc" data-a="resOpen" data-id="${esc3(sid)}" data-k="${k[0]}"><span class="rsc-n">RE - ${String(i+1).padStart(2,'0')}</span><b>${k[1]}</b><small>${L.length} ${L.length===1?'file':'files'}</small>${ic('right',18)}</button>`).join('')}</div>`}
A.resOpen=el=>{const sid=el.dataset.id,k=RESK.find(x=>x[0]===el.dataset.k);push({t:k[1],s:sOf(sid).title,key:'res',html:()=>`<div class="card rows">${(sOf(sid).files||[]).filter(f=>(f.kind||'notes')===k[0]).map(f=>`<button class="row" data-a="fileOpen" data-id="${esc3(f.id)}" data-t="${esc3(f.title||f.name)}"><span class="ti g">${ic(k[2],19)}</span><span><b>${esc3(f.title||f.name)}</b><small>${/\.pdf$/i.test(f.name||'')?'PDF':'Picture'}${f.size?`, ${f.size>1048576?(f.size/1048576).toFixed(1)+' MB':Math.max(1,Math.round(f.size/1024))+' KB'}`:''}</small></span>${ic('dl',18)}</button>`).join('')}</div>`})};
/* Tests: category chips (the series' folders), a status filter, the banner from the admin, then the tests in order */
const TSF=[['all','All'],['att','Attempted'],['non','Not attempted'],['res','Resume'],['up','Upcoming'],['miss','Missed']];
function tState(t){const st=stOf(t);return st==='prog'?'res':st==='live'?'live':st==='wait'?'up':st==='lock'?'lock':st==='held'?'held':(st==='done'||t.attempts>0)?'att':st==='closed'?'miss':'new'}
const TSL={live:['live','Live'],res:['live','Resume'],up:['','Upcoming'],new:['ok','Available'],held:['gold','Result soon'],att:['ok','Attempted'],miss:['err','Missed'],lock:['','Locked']};
function tCard(t){const s=tState(t),r=resOf(t.id)[0],syl=((META||{}).syl||{})[t.id],marks=(t.questions||0)*(t.correct||4),when=t.opens_at;let p;try{p=typeof pendOf==='function'&&pendOf(t.id)}catch(e){}
  const act=s==='lock'?['lock','Unlock','test']:s==='up'?['clock','Opens','']:s==='held'?['clock','Result','']:s==='miss'?(r&&!p?['chart','Result','review']:['lock','Closed','']):s==='res'?['play','Resume','test']:s==='att'?(r&&!p?['chart','Result','review']:['play','Again','test']):['play','Start','test'];
  const L=TSL[s];
  return `<article class="card tc3${s==='miss'||s==='lock'?' dim':''}"><div class="tc3-b">
   <div class="tc3-top"><span class="st ${L[0]}">${L[1]}</span>${when?`<span class="mut">${s==='up'?'Opens':'Held on'} ${fD(when,{day:'numeric',month:'short'})}, ${fT(when)}</span>`:''}</div>
   <h3>${esc3(t.title)}</h3>
   <p class="tc3-m">${ic('list',15)}<span>${t.questions||0} Question${t.questions===1?'':'s'}</span><i></i><span>${fmtN(marks)} Marks</span><i></i><span>${t.duration||0} Mins</span></p>
   <p class="tc3-m">${ic('hist',15)}<span>Attempts: ${t.attempts||0}${r&&t.best!=null&&t.best_max?`, best ${t.best}/${t.best_max}`:''}</span></p>
   ${s==='held'&&p&&p.result_at?`<p class="tc3-m">${ic('clock',15)}<span>Result after ${fD(p.result_at,{day:'numeric',month:'short'})}, ${fT(p.result_at)}</span></p>`:''}</div>
   <button class="tc3-go${act[2]?'':' off'}" ${act[2]==='test'?`data-a="test" data-id="${esc3(t.id)}"`:act[2]==='review'?`data-a="review" data-r="${esc3(r.id)}"`:'disabled'}><span>${ic(act[0],20)}</span><small>${act[1]}</small></button>
   ${syl||(r&&!p&&s==='att')?`<div class="tc3-f">${syl?`<button data-a="syl" data-id="${esc3(t.id)}">View syllabus</button>`:''}${r&&!p&&s==='att'?`<button data-a="review" data-r="${esc3(r.id)}">Result and solutions</button>`:''}</div>`:''}</article>`}
const TORD=[['live','Live now'],['res','Continue'],['up','Upcoming'],['new','Available'],['held','Waiting for result'],['att','Attempted'],['miss','Missed'],['lock','Locked']];
function spTests(sid){const all=testsOf(sid),F=(C().folders||[]).filter(f=>f.series_id===sid&&all.some(t=>t.folder_id===f.id)),loose=all.some(t=>!t.folder_id);
  if(TQ.tf!=='all'&&TQ.tf!=='none'&&!F.some(f=>f.id===TQ.tf))TQ.tf='all';
  const inF=all.filter(t=>TQ.tf==='all'||(TQ.tf==='none'?!t.folder_id:t.folder_id===TQ.tf));
  const pass=t=>{const s=tState(t);return TQ.ts==='all'||(TQ.ts==='att'?s==='att'||s==='held':TQ.ts==='non'?['new','live','up'].includes(s):TQ.ts==='res'?s==='res':TQ.ts==='up'?s==='up':TQ.ts==='miss'?s==='miss':true)};
  const L=inF.filter(pass),P=(META||{}).promo,PL=(META||{}).promo_link,pu=/^(https:\/\/|#\/|store\.html#)[^\s"'<>\\]*$/.test(PL||'')?PL:'';
  const by=k=>L.filter(t=>tState(t)===k).sort((a,b)=>k==='att'||k==='miss'?(b.opens_at||0)-(a.opens_at||0):(a.opens_at||0)-(b.opens_at||0)||(a.sort||0)-(b.sort||0));
  return `<div class="tbar"><div class="chips">${[['all','All']].concat(F.map(f=>[f.id,f.title])).concat(F.length&&loose?[['none','Other tests']]:[]).map(c=>`<button class="${TQ.tf===c[0]?'on':''}" aria-pressed="${TQ.tf===c[0]}" data-a="tf" data-v="${esc3(c[0])}">${esc3(c[1])}</button>`).join('')}</div>
   <button class="fb${TQ.ts!=='all'?' on':''}" data-a="tsF" aria-label="Filter tests">${ic('filter',19)}${TQ.ts!=='all'?'<b>1</b>':''}</button></div>
  ${P&&/^data:image\//.test(P)?`${pu?`<a class="promo" href="${esc3(pu)}"${/^https:/.test(pu)?' target="_blank" rel="noopener noreferrer"':''}>`:'<div class="promo">'}<img src="${esc3(P)}" alt="">${pu?'</a>':'</div>'}`:''}
  ${L.length?TORD.map(([k,h])=>{const g=by(k);return g.length?`<div class="stack" style="gap:12px"><p class="gh">${h} <span>${g.length}</span></p>${g.map(tCard).join('')}</div>`:''}).join('')
   :`<div class="card empty"><span class="ti">${ic('tests',22)}</span><b>No tests here</b><p>${all.length?'Try another group or filter.':'Tests of this series will appear here.'}</p>${TQ.ts!=='all'||TQ.tf!=='all'?'<button class="btn sm ghost" data-a="tfClear">Show all tests</button>':''}</div>`}`}
A.tf=el=>{TQ.tf=el.dataset.v;redraw()};A.tfClear=()=>{TQ.tf='all';TQ.ts='all';redraw()};
A.tsF=()=>openSheet(`<h2 id="sheetT">Show tests</h2><div>${TSF.map(f=>`<button class="opt${TQ.ts===f[0]?' on':''}" data-a="tsPick" data-v="${f[0]}"><div><b>${f[1]}${f[0]==='all'?' (default)':''}</b></div><span class="ck">${ic('check')}</span></button>`).join('')}</div>`);
A.tsPick=el=>{TQ.ts=el.dataset.v;closeLayer();redraw()};
A.syl=el=>{const t=tOf(el.dataset.id),x=((META||{}).syl||{})[el.dataset.id];if(!x)return;openSheet(`<h2 id="sheetT">Syllabus</h2><p class="sub">${esc3(t?t.title:'')}</p><p style="font-size:15px;line-height:1.7;white-space:pre-wrap">${esc3(x)}</p>`)};
/* Reviews: the series' reviews and the student's own */
function spRev(sid){const it=itemOfSeries(sid);return `<button class="btn lg ghost" data-a="rvWrite" data-id="${esc3(sid)}">${ic('star',17)}Write or edit your review</button>${rvBlock(it)}`}
A.rvWrite=el=>{const s=sOf(el.dataset.id);if(s)rvAsk(s.id,s.title,true)};

function ownedPage(sid){return {t:(sOf(sid)||{}).title||'Test series',s:'Your test series',store:1,key:'sp',
  html:()=>{const s=sOf(sid);if(!s)return `<div class="card empty"><b>This series is not available</b></div>`;
   return utabs()+`<div class="stack sp-pane" style="gap:16px">${TQ.xt==='d'?spDesc(sid):TQ.xt==='r'?spRes(sid):TQ.xt==='t'?spTests(sid):spRev(sid)}</div>`}}}

/* ================= TOOLS (run on the phone; nothing is sent) ================= */
const FC=2*Math.PI*100,FM=2*Math.PI*28;
const FTK=()=>new Date().toDateString(),FTS=lsGet('cbt_v3_focus',{});const FT={total:25*60,left:25*60,run:false,done:FTS.d===FTK()?FTS.n||0:0,min:FTS.d===FTK()?FTS.m||0:0,iv:null};const ftSave=()=>lsSet('cbt_v3_focus',{d:FTK(),n:FT.done,m:FT.min});
const cdDays=()=>{let c=null;try{c=cdGet()}catch(e){}return c?Math.max(0,Math.floor((new Date(c.date)-Date.now())/DAY)):'Set'};
const mmss=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
function ftPaint(){const f=FT.left/FT.total;
  $$('[data-ft="t"]').forEach(e=>e.textContent=mmss(FT.left));$$('[data-ft="s"]').forEach(e=>e.textContent=FT.run?'Focus time':FT.left<FT.total?'Paused':'Ready');
  const pg=$('#ftPg');pg&&(pg.style.strokeDashoffset=(FC*f).toFixed(1));const pm=$('#ftMini');pm&&(pm.style.strokeDashoffset=(FM*f).toFixed(1));
  $$('[data-ft="go"]').forEach(b=>b.innerHTML=FT.run?ic('pause',16)+'Pause':ic('play',15)+(FT.left<FT.total?'Resume':'Start'));
  $$('[data-ft="done"]').forEach(e=>e.textContent=FT.done);$$('[data-ft="min"]').forEach(e=>e.textContent=FT.min);
  $$('[data-ftp]').forEach(b=>{b.classList.toggle('on',+b.dataset.ftp*60===FT.total);b.disabled=FT.run})}
A.ftGo=()=>{if(FT.run){FT.run=false;clearInterval(FT.iv)}else{FT.run=true;FT.iv=setInterval(()=>{FT.left--;if(FT.left<=0){clearInterval(FT.iv);FT.run=false;FT.done++;FT.min+=FT.total/60;ftSave();FT.left=FT.total;toast3('Session done. Take a 5 minute break.')}ftPaint()},1000)}ftPaint()};
A.ftReset=()=>{clearInterval(FT.iv);FT.run=false;FT.left=FT.total;ftPaint()};
A.ftPre=el=>{if(FT.run)return;FT.total=FT.left=+el.dataset.ftp*60;ftPaint()};
function focusView(){return {t:'Focus timer',s:'Study without breaks, then rest',html:()=>`<div class="hero ftimer">
  <div class="big-ring"><svg viewBox="0 0 220 220"><circle class="tr" cx="110" cy="110" r="100"/><circle class="pg" id="ftPg" cx="110" cy="110" r="100" stroke-dasharray="${FC.toFixed(1)}"/></svg><div><b data-ft="t"></b><small class="mut" data-ft="s"></small></div></div>
  <div class="pre">${[25,50,90].map(m=>`<button data-a="ftPre" data-ftp="${m}">${m} min</button>`).join('')}</div>
  <div class="g2"><button class="btn onhero ghost" data-a="ftReset">${ic('hist',16)}Reset</button><button class="btn onhero" data-a="ftGo" data-ft="go"></button></div>
  <div class="kv" style="border-top:1px solid var(--heroLine);padding-top:14px"><div><small>Sessions today</small><b data-ft="done"></b></div><div><small>Minutes focused</small><b data-ft="min"></b></div><div><small>Day streak</small><b>${stats(allRes()).streak}</b></div></div></div>
  <div class="card p"><div class="stack" style="gap:8px"><b style="font-size:15px">How it works</b><p class="mut" style="font-size:13.5px">Pick a length and start. Keep the phone face down until the ring empties. Every finished session counts towards your study hours in Analytics.</p></div></div>`,after:ftPaint}}
const TOOLS={
 study:[['focus','timer','Focus timer','Timed study sessions'],['planner','cal','Study tracker','Your weekly plan and tasks'],['cd','target','Exam countdown','Days to your exam']],
 exam:[['marks','calc','Marks calculator','+4 / −1 scoring'],['rank','medal','NEET rank estimator','Marks to an expected rank'],['pct','percent','JEE percentile to rank','Estimate your JEE Main rank']],
 sci:[['ptable','atom','Periodic table','All 118 elements'],['sci','sigma','Scientific calculator','sin, log, powers'],['conv','ruler','Unit converter','SI and common units'],['const','list','Physical constants','Values for numericals']]};
function toolTile(t){const v={planner:`<b>${weekItems(TI()).length}</b>tests today`,cd:`<b>${cdDays()}</b>${typeof cdDays()==='number'?'days left':'your exam date'}`,marks:`<b>${MK.c*4-MK.w}</b>last score`,rank:'Sample curve',pct:'Simple formula',ptable:'Tap any element',sci:'Degrees or radians',conv:'6 categories',const:'16 constants'}[t[0]]||'';
  return `<button class="card tl" data-a="tool" data-k="${t[0]}"><span class="ti g">${ic(t[1],21)}</span><span><b>${t[2]}</b><small>${t[3]}</small></span><span class="v">${v}</span></button>`}
VIEW.tools=()=>`<div class="pt"><div><h1>Tools</h1><p>Helpers for study, exams and numericals</p></div></div>
  <button class="hero ftile tap" data-a="tool" data-k="focus"><span class="mini"><svg viewBox="0 0 62 62"><circle class="tr" cx="31" cy="31" r="28"/><circle class="pg" id="ftMini" cx="31" cy="31" r="28" stroke-dasharray="${FM.toFixed(1)}"/></svg><span data-ft="t"></span></span>
   <span><b>Focus timer</b><small class="mut">Today: <span data-ft="done"></span> done, <span data-ft="min"></span> min focused</small></span><span class="btn sm onhero">${ic('play',14)}Open</span></button>
  ${[['study','Study'],['exam','Exam'],['sci','Science']].map(([k,h])=>`<section class="sec"><div class="sh"><h2>${h}</h2><span class="aside">${TOOLS[k].length} tools</span></div><div class="tg">${TOOLS[k].filter(t=>t[0]!=='focus').map(toolTile).join('')}</div></section>`).join('')}`;
AFTER.tools=ftPaint;
A.tool=el=>{const k=el.dataset.k;({focus:()=>push(focusView()),planner:A.oldTracker,cd:A.cdEdit,marks:()=>push(marksView()),rank:()=>push(rankView()),pct:()=>push(pctView()),ptable:()=>push(ptView()),sci:()=>push(sciView()),conv:()=>push(convView()),const:()=>push(constView())}[k])()};

/* marks calculator */
const MKP={NEET:{n:180,r:4,w:1},'JEE Main':{n:75,r:4,w:1},Custom:{n:100,r:4,w:1}};
const MK=lsGet('cbt_v3_mk',null)||{ex:'NEET',c:132,w:24};
function marksView(){return {t:'Marks calculator',s:'Right +4, wrong −1',html:()=>{const p=MKP[MK.ex],c=Math.min(MK.c,p.n),w=Math.min(MK.w,p.n-c),sk=p.n-c-w,sc=c*p.r-w*p.w,acc=c+w?Math.round(c*100/(c+w)):0;
  return `<div class="hero p stack"><span class="tag gold">Your score</span><div class="big"><b>${sc}</b><span>/ ${p.n*p.r} marks</span></div><span class="bar"><i style="--p:${Math.max(0,sc/(p.n*p.r)).toFixed(3)}"></i></span>
   <div class="kv"><div><small>Not attempted</small><b>${sk}</b></div><div><small>Accuracy</small><b>${acc}%</b></div><div><small>Lost to minus</small><b>−${w*p.w}</b></div></div></div>
  <div class="card rows"><div class="bf"><h3>Exam</h3><div class="chips wrap">${Object.keys(MKP).map(k=>`<button class="${k===MK.ex?'on':''}" data-a="mkEx" data-v="${k}">${k}</button>`).join('')}</div></div>
   <div class="bf"><h3>Correct answers <span>out of ${p.n}</span></h3><div class="stp"><button data-a="mk" data-v="c,-1" aria-label="One less">−</button><output>${c}</output><button data-a="mk" data-v="c,1" aria-label="One more">+</button><button class="btn sm ghost" data-a="mk" data-v="c,10">+10</button></div></div>
   <div class="bf"><h3>Wrong answers</h3><div class="stp"><button data-a="mk" data-v="w,-1" aria-label="One less">−</button><output>${w}</output><button data-a="mk" data-v="w,1" aria-label="One more">+</button><button class="btn sm ghost" data-a="mk" data-v="w,5">+5</button></div></div></div>`}}}
A.mkEx=el=>{MK.ex=el.dataset.v;const p=MKP[MK.ex];MK.c=Math.min(MK.c,p.n);MK.w=Math.min(MK.w,p.n-MK.c);redraw()};
A.mk=el=>{const [k,d]=el.dataset.v.split(','),p=MKP[MK.ex],o=k==='c'?MK.w:MK.c;MK[k]=Math.max(0,Math.min(p.n-o,MK[k]+ +d));lsSet('cbt_v3_mk',MK);redraw()};

/* NEET rank estimator: sample curve, clearly labelled */
const CURVE=[[720,1],[700,150],[680,1500],[650,6000],[620,14000],[600,22000],[550,52000],[500,95000],[450,150000],[400,220000],[350,310000],[300,420000],[250,560000],[200,750000],[150,1000000],[100,1400000],[0,2200000]];
let RK=560;
function rankOf(m){for(let i=0;i<CURVE.length-1;i++){const [m1,r1]=CURVE[i],[m2,r2]=CURVE[i+1];if(m<=m1&&m>=m2){const t=(m1-m)/(m1-m2);return Math.round(Math.exp(Math.log(r1)+t*(Math.log(r2)-Math.log(r1))))}}return 2200000}
function rankView(){return {t:'NEET rank estimator',s:'Marks to an expected All India rank',html:()=>{const r=rankOf(RK),lo=Math.max(1,Math.round(r*.85)),hi=Math.round(r*1.18),pc=(100*(1-r/2200000)).toFixed(2);
  return `<div class="hero p stack"><span class="tag gold">Expected rank for ${RK} marks</span><div class="big"><b>${fmtN(lo)}</b><span>to ${fmtN(hi)}</span></div><div class="kv two"><div><small>Percentile</small><b>${pc}</b></div><div><small>Students ahead</small><b>${fmtN(Math.max(0,r-1))}</b></div></div></div>
  <div class="card p stack"><div class="bf" style="padding:0;border:0"><h3>Your marks <span>out of 720</span></h3><input class="rng" type="range" min="0" max="720" step="1" value="${RK}" id="rkIn" aria-label="Marks out of 720"><div class="stp"><button data-a="rk" data-v="-10" aria-label="10 less">−</button><output>${RK}</output><button data-a="rk" data-v="10" aria-label="10 more">+</button></div></div>
   <p class="hint">This preview uses a sample curve of about 22 lakh students. The real tool will use Aspiron's own data from past NEET results.</p></div>`},after:()=>{const r=$('#rkIn');r.oninput=()=>{RK=+r.value;const y=$('#scrB').scrollTop;redraw();$('#scrB').scrollTop=y;$('#rkIn').focus()}}}}
A.rk=el=>{RK=Math.max(0,Math.min(720,RK+ +el.dataset.v));redraw()};

/* JEE percentile to rank: rank = (100 - percentile) x candidates / 100 */
const PC={p:97.5,n:1250000};
function pctView(){return {t:'JEE percentile to rank',s:'Estimate your JEE Main rank',html:()=>{const r=Math.max(1,Math.round((100-PC.p)*PC.n/100));
  return `<div class="hero p stack"><span class="tag gold">Expected rank</span><div class="big"><b>${fmtN(r)}</b><span>at ${PC.p} percentile</span></div><p class="mut" style="font-size:13px">Rank ≈ (100 − percentile) × candidates ÷ 100</p></div>
  <div class="card form"><label for="pcP">Your percentile<input class="inp" id="pcP" type="number" inputmode="decimal" min="0" max="100" step="0.01" value="${PC.p}"></label><label for="pcN">Candidates who took the exam<input class="inp" id="pcN" type="number" inputmode="numeric" min="1000" step="1000" value="${PC.n}"></label>
  <p class="hint">Change the number of candidates when NTA publishes it. The default is a round sample figure.</p></div>`},
  after:()=>{const p=$('#pcP'),n=$('#pcN');const up=()=>{PC.p=Math.max(0,Math.min(100,+p.value||0));PC.n=Math.max(1000,+n.value||1000);const b=document.querySelector('#scrB .big');b.querySelector('b').textContent=fmtN(Math.max(1,Math.round((100-PC.p)*PC.n/100)));b.querySelector('span').textContent=`at ${PC.p} percentile`};p.oninput=up;n.oninput=up}}}

/* periodic table */
const PSYM='H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
const PNAME='Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine Neon Sodium Magnesium Aluminium Silicon Phosphorus Sulfur Chlorine Argon Potassium Calcium Scandium Titanium Vanadium Chromium Manganese Iron Cobalt Nickel Copper Zinc Gallium Germanium Arsenic Selenium Bromine Krypton Rubidium Strontium Yttrium Zirconium Niobium Molybdenum Technetium Ruthenium Rhodium Palladium Silver Cadmium Indium Tin Antimony Tellurium Iodine Xenon Caesium Barium Lanthanum Cerium Praseodymium Neodymium Promethium Samarium Europium Gadolinium Terbium Dysprosium Holmium Erbium Thulium Ytterbium Lutetium Hafnium Tantalum Tungsten Rhenium Osmium Iridium Platinum Gold Mercury Thallium Lead Bismuth Polonium Astatine Radon Francium Radium Actinium Thorium Protactinium Uranium Neptunium Plutonium Americium Curium Berkelium Californium Einsteinium Fermium Mendelevium Nobelium Lawrencium Rutherfordium Dubnium Seaborgium Bohrium Hassium Meitnerium Darmstadtium Roentgenium Copernicium Nihonium Flerovium Moscovium Livermorium Tennessine Oganesson'.split(' ');
const PMASS='1.008 4.0026 6.94 9.0122 10.81 12.011 14.007 15.999 18.998 20.180 22.990 24.305 26.982 28.085 30.974 32.06 35.45 39.95 39.098 40.078 44.956 47.867 50.942 51.996 54.938 55.845 58.933 58.693 63.546 65.38 69.723 72.630 74.922 78.971 79.904 83.798 85.468 87.62 88.906 91.224 92.906 95.95 [98] 101.07 102.91 106.42 107.87 112.41 114.82 118.71 121.76 127.60 126.90 131.29 132.91 137.33 138.91 140.12 140.91 144.24 [145] 150.36 151.96 157.25 158.93 162.50 164.93 167.26 168.93 173.05 174.97 178.49 180.95 183.84 186.21 190.23 192.22 195.08 196.97 200.59 204.38 207.2 208.98 [209] [210] [222] [223] [226] [227] 232.04 231.04 238.03 [237] [244] [243] [247] [247] [251] [252] [257] [258] [259] [262] [267] [268] [269] [270] [269] [278] [281] [282] [285] [286] [289] [290] [293] [294] [294]'.split(' ');
function epos(z){const P=[[1,2,1],[3,10,2],[11,18,3],[19,36,4],[37,54,5],[55,86,6],[87,118,7]];const [s,,p]=P.find(x=>z>=x[0]&&z<=x[1]),i=z-s;
  if(p===1)return {r:1,c:z===1?1:18,p,b:z===1?'s':'s'};
  if(p<=3)return {r:p,c:i<2?i+1:i+11,p,b:i<2?'s':'p'};
  if(p<=5)return {r:p,c:i+1,p,b:i<2?'s':i<12?'d':'p'};
  if(i<2)return {r:p,c:i+1,p,b:'s'};if(i<=16)return {r:p+3,c:i+1,p,b:'f'};return {r:p,c:i-13,p,b:i<26?'d':'p'}}
let PQ='';
const BLK={s:'s-block',p:'p-block',d:'d-block (transition)',f:'f-block (lanthanoids, actinoids)'};
function ptView(){return {t:'Periodic table',s:'Tap an element for details',html:()=>`<label class="sbox">${ic('search',18)}<input id="ptq" type="search" placeholder="Search by name, symbol or number" value="${esc3(PQ)}" aria-label="Search elements"></label>
  <div class="lg"><span><i style="background:color-mix(in srgb,var(--c1) 40%,var(--surface))"></i>s-block</span><span><i style="background:color-mix(in srgb,var(--c3) 40%,var(--surface))"></i>p-block</span><span><i style="background:color-mix(in srgb,var(--c2) 40%,var(--surface))"></i>d-block</span><span><i style="background:var(--acc1)"></i>f-block</span></div>
  <div class="ptable"><div class="pgrid" id="pgrid">${PSYM.map((s,i)=>{const z=i+1,q=epos(z);return `<button class="el b${q.b}" style="grid-row:${q.r};grid-column:${q.c}" data-a="el" data-z="${z}" aria-label="${PNAME[i]}, ${z}"><small>${z}</small>${s}</button>`}).join('')}
   <span style="grid-row:6;grid-column:3;display:grid;place-items:center;font-size:9px;color:var(--faint)">57–71</span><span style="grid-row:7;grid-column:3;display:grid;place-items:center;font-size:9px;color:var(--faint)">89–103</span><span style="grid-row:8;height:10px"></span></div></div>
  <p class="hint">Swipe sideways to see the full table.</p>`,after:()=>{const i=$('#ptq');const f=()=>{PQ=i.value.trim().toLowerCase();$$('#pgrid .el').forEach(b=>{const z=+b.dataset.z,m=!PQ||String(z)===PQ||PSYM[z-1].toLowerCase()===PQ||PNAME[z-1].toLowerCase().includes(PQ);b.classList.toggle('dim',!m);b.classList.toggle('hit',!!PQ&&m)});const h=$('#pgrid .el.hit');h&&h.scrollIntoView({block:'nearest',inline:'center',behavior:RM?'auto':'smooth'})};i.oninput=f;f()}}}
A.el=el=>{const z=+el.dataset.z,q=epos(z),g=q.b==='f'?'3 (f-block)':q.c;openSheet(`<div style="display:flex;gap:16px;align-items:center"><span class="ti k" style="width:72px;height:72px;border-radius:20px;font-size:26px;font-weight:600;flex-direction:column;gap:0"><small style="font-size:11px;color:var(--heroMut)">${z}</small>${PSYM[z-1]}</span><div><h2 id="sheetT">${PNAME[z-1]}</h2><p class="sub" style="margin:2px 0 0">${BLK[q.b]}</p></div></div>
  <div class="kv two" style="margin-top:18px"><div><small>Atomic number</small><b>${z}</b></div><div><small>Atomic mass (u)</small><b>${PMASS[z-1]}</b></div><div><small>Period</small><b>${q.p}</b></div><div><small>Group</small><b>${g}</b></div></div>
  <p class="hint" style="margin-top:14px">Masses in brackets are for the most stable isotope.</p>`)};

/* scientific calculator */
const CAL={ex:'',res:'0',deg:true};
function evalExpr(src,deg){const s=src.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');let i=0;const tk=[];
  while(i<s.length){const c=s[i];if(/\s/.test(c)){i++;continue}if(/[0-9.]/.test(c)){let j=i;while(j<s.length&&/[0-9.]/.test(s[j]))j++;tk.push({n:parseFloat(s.slice(i,j))});i=j;continue}
   const fn=['sin','cos','tan','log','ln','√'].find(f=>s.startsWith(f,i));if(fn){tk.push({f:fn});i+=fn.length;continue}if(c==='π'){tk.push({n:Math.PI});i++;continue}if(c==='e'){tk.push({n:Math.E});i++;continue}
   if('+-*/^()'.includes(c)){tk.push({o:c});i++;continue}throw 0}
  let k=0;const peek=()=>tk[k],nx=()=>tk[k++];const ang=v=>deg?v*Math.PI/180:v;
  const F={sin:v=>Math.sin(ang(v)),cos:v=>Math.cos(ang(v)),tan:v=>Math.tan(ang(v)),log:Math.log10,ln:Math.log,'√':Math.sqrt};
  const startsPrimary=t=>t&&(t.n!=null||t.f||t.o==='(');
  function prim(){const t=nx();if(!t)throw 0;if(t.n!=null)return t.n;if(t.f)return F[t.f](unary());if(t.o==='('){const v=expr();if(peek()&&peek().o===')')nx();return v}throw 0}
  function pow(){let v=prim();if(peek()&&peek().o==='^'){nx();v=Math.pow(v,unary())}return v}
  function unary(){if(peek()&&peek().o==='-'){nx();return -unary()}if(peek()&&peek().o==='+'){nx();return unary()}return pow()}
  function term(){let v=unary();for(;;){const t=peek();if(t&&(t.o==='*'||t.o==='/')){nx();const r=unary();v=t.o==='*'?v*r:v/r}else if(startsPrimary(t))v*=unary();else return v}}
  function expr(){let v=term();for(;;){const t=peek();if(t&&(t.o==='+'||t.o==='-')){nx();const r=term();v=t.o==='+'?v+r:v-r}else return v}}
  const v=expr();if(k<tk.length)throw 0;return v}
const fmtR=v=>{if(!isFinite(v))return 'Not defined';const a=Math.abs(v);if(a!==0&&(a>=1e10||a<1e-6))return v.toExponential(6).replace(/\.?0+e/,'e');return String(+v.toPrecision(10))};
const KEYS=[['DEG','fn'],['sin','fn'],['cos','fn'],['tan','fn'],['AC','fn'],['log','fn'],['ln','fn'],['√','fn'],['^','ko'],['⌫','fn'],['7'],['8'],['9'],['('],[')'],['4'],['5'],['6'],['×','ko'],['÷','ko'],['1'],['2'],['3'],['+','ko'],['−','ko'],['0'],['.'],['π'],['e'],['=','eq']];
function sciView(){return {t:'Scientific calculator',s:CAL.deg?'Angles in degrees':'Angles in radians',html:()=>`<div class="hero cdisp"><small id="cEx">${esc3(CAL.ex)||'&nbsp;'}</small><b id="cRes">${esc3(CAL.res)}</b></div>
  <div class="keys">${KEYS.map(k=>`<button class="${k[1]||''}" data-a="key" data-k="${k[0]}" aria-label="${k[0]==='⌫'?'Delete':k[0]}">${k[0]==='DEG'?(CAL.deg?'DEG':'RAD'):k[0]}</button>`).join('')}</div>`}}
A.key=el=>{const k=el.dataset.k;
  if(k==='AC'){CAL.ex='';CAL.res='0'}else if(k==='⌫'){CAL.ex=CAL.ex.replace(/(sin|cos|tan|log|ln)$|.$/,'')}else if(k==='DEG'){CAL.deg=!CAL.deg;$('#scrS').textContent=CAL.deg?'Angles in degrees':'Angles in radians';el.textContent=CAL.deg?'DEG':'RAD'}
  else if(k==='='){try{CAL.res=fmtR(evalExpr(CAL.ex,CAL.deg))}catch(x){CAL.res='Check the expression'}}else{CAL.ex+=['sin','cos','tan','log','ln','√'].includes(k)?k+'(':k;try{CAL.res=fmtR(evalExpr(CAL.ex,CAL.deg))}catch(x){}}
  $('#cEx').innerHTML=esc3(CAL.ex)||'&nbsp;';$('#cRes').textContent=CAL.res};

/* unit converter */
const UNITS={Length:{m:1,cm:.01,mm:.001,km:1000,'µm':1e-6,nm:1e-9,'Å':1e-10,inch:.0254,ft:.3048},Mass:{kg:1,g:1e-3,mg:1e-6,u:1.66054e-27,lb:.453592},Energy:{J:1,kJ:1e3,cal:4.184,kcal:4184,eV:1.602177e-19,kWh:3.6e6,erg:1e-7},Pressure:{Pa:1,kPa:1e3,bar:1e5,atm:101325,mmHg:133.322,torr:133.322},Time:{s:1,min:60,h:3600,day:86400,year:3.156e7},Temperature:{'°C':1,'°F':1,K:1}};
const CV={cat:'Length',v:1,from:'m',to:'cm'};
function convVal(){const {cat,v,from,to}=CV;if(cat==='Temperature'){const c=from==='°C'?v:from==='°F'?(v-32)*5/9:v-273.15;return to==='°C'?c:to==='°F'?c*9/5+32:c+273.15}return v*UNITS[cat][from]/UNITS[cat][to]}
function convView(){return {t:'Unit converter',s:CV.cat,html:()=>{const U=Object.keys(UNITS[CV.cat]),opt=s=>U.map(u=>`<option${u===s?' selected':''}>${u}</option>`).join('');
  return `<div class="chips">${Object.keys(UNITS).map(c=>`<button class="${c===CV.cat?'on':''}" data-a="cvCat" data-v="${c}">${c}</button>`).join('')}</div>
  <div class="card form"><label for="cvV">Value<input class="inp" id="cvV" type="number" inputmode="decimal" value="${CV.v}"></label>
   <div class="conv"><select class="sel" id="cvF" aria-label="From unit">${opt(CV.from)}</select><button class="sw2b" data-a="cvSwap" aria-label="Swap units">${ic('swap',18)}</button><select class="sel" id="cvT" aria-label="To unit">${opt(CV.to)}</select></div></div>
  <div class="hero out"><small class="mut">${esc3(String(CV.v))} ${CV.from} equals</small><b id="cvOut">${fmtR(convVal())} ${CV.to}</b></div>`},
  after:()=>{const v=$('#cvV'),f=$('#cvF'),t=$('#cvT');const up=()=>{CV.v=+v.value||0;CV.from=f.value;CV.to=t.value;$('#cvOut').textContent=`${fmtR(convVal())} ${CV.to}`;$('#cvOut').previousElementSibling.textContent=`${CV.v} ${CV.from} equals`};v.oninput=up;f.onchange=up;t.onchange=up}}}
A.cvCat=el=>{CV.cat=el.dataset.v;const U=Object.keys(UNITS[CV.cat]);CV.from=U[0];CV.to=U[1];$('#scrS').textContent=CV.cat;redraw()};
A.cvSwap=()=>{[CV.from,CV.to]=[CV.to,CV.from];redraw()};

/* constants */
const CONST=[['Speed of light','c','2.998 × 10⁸','m/s'],['Planck constant','h','6.626 × 10⁻³⁴','J s'],['Gravitational constant','G','6.674 × 10⁻¹¹','N m² kg⁻²'],['Elementary charge','e','1.602 × 10⁻¹⁹','C'],['Electron mass','mₑ','9.109 × 10⁻³¹','kg'],['Proton mass','mₚ','1.673 × 10⁻²⁷','kg'],['Avogadro constant','Nₐ','6.022 × 10²³','mol⁻¹'],['Gas constant','R','8.314','J mol⁻¹ K⁻¹'],['Boltzmann constant','k','1.381 × 10⁻²³','J K⁻¹'],['Permittivity of free space','ε₀','8.854 × 10⁻¹²','F m⁻¹'],['Permeability of free space','μ₀','4π × 10⁻⁷','T m A⁻¹'],['Acceleration due to gravity','g','9.8','m s⁻²'],['Atomic mass unit','u','1.661 × 10⁻²⁷','kg'],['Faraday constant','F','96485','C mol⁻¹'],['Rydberg constant','R∞','1.097 × 10⁷','m⁻¹'],['Stefan–Boltzmann constant','σ','5.670 × 10⁻⁸','W m⁻² K⁻⁴']];
function constView(){return {t:'Physical constants',s:'Tap a value to copy it',html:()=>`<div class="card rows">${CONST.map(c=>`<button class="row" data-a="copy" data-v="${c[1]} = ${c[2]} ${c[3]}"><span class="ti g" style="font-weight:600;font-size:15px">${c[1]}</span><span><b>${c[0]}</b><small class="num">${c[2]} ${c[3]}</small></span>${ic('copy',17)}</button>`).join('')}</div>`}}

/* ================= LIBRARY: the classic study features, organised; parts not built yet say so ================= */
const LQ={q:''};
const bmCount=()=>{try{return BM?BM.size:0}catch(e){return 0}};
const pdfCount=()=>{try{return PDFS?Object.keys(PDFS).length:null}catch(e){return null}};
const LMOD=[
 {k:'gen',h:'#/gen',ic:'spark',t:'Test generator',d:'Build your own test from the chapters and topics you choose, then take it like a real test.',tags:['NEET or JEE','Chapters and topics','Your own timing'],cta:'Create a test',grp:'practice'},
 {k:'qb',h:'#/qb',ic:'qb',t:'Question bank',d:'Unlimited practice. Questions you have already done are skipped.',tags:['Subject, chapter, topic','Instant check','Solutions'],cta:'Start practising',grp:'practice'},
 {k:'pyq',h:'#/pyq',ic:'pyq',t:'Previous year papers',d:'NEET and JEE previous year questions, chapter-wise.',tags:['Chapter-wise','Year-wise','Answer key'],cta:'Open PYQ',grp:'practice'},
 {k:'m',h:'#/m',ic:'pen',t:'Mistake notebook',d:'Every question you got wrong, ready to practise again.',grp:'revise'},
 {k:'b',h:'#/b',ic:'bookmark',t:'Saved questions',d:'Questions you bookmarked during tests.',grp:'revise',n:bmCount},
 {k:'notes',h:'#/notes',ic:'file',t:'Notes & PDFs',d:'Notes and PDFs added to your test series.',grp:'material',n:pdfCount}];
const LSOON=[['book','Books and NCERT reader','Read NCERT and reference books inside the app'],['pen','Handwritten notes and DPPs','Chapter-wise notes and daily practice problems'],['cards','Mindmaps and flashcards','Quick revision with flip cards'],['dl','Download manager','Save permitted material for offline reading']];
function libHome(){const P=LMOD.filter(m=>m.grp==='practice'),R=LMOD.filter(m=>m.grp!=='practice');
  return `<section class="sec"><div class="sh"><h2>Practice</h2><span class="aside">Uses the Aspiron question bank</span></div><div class="list">${P.map((m,i)=>`<article class="${i?'card':'hero'} pm"><div class="pm-h"><span class="ti${i?' g':''}" ${i?'':'style="background:rgba(255,255,255,.1);color:var(--heroTx)"'}>${ic(m.ic,22)}</span><div><b>${m.t}</b><small>${m.d}</small></div></div><div class="inc">${m.tags.map(t=>`<span>${t}</span>`).join('')}</div><button class="btn ${i?'ghost':'onhero'} blk" data-a="lmod" data-h="${m.h}">${m.cta}</button></article>`).join('')}</div></section>
  <section class="sec"><div class="sh"><h2>Revise and read</h2></div><div class="card rows">${R.map(m=>{const n=m.n?m.n():null;return `<button class="row" data-a="lmod" data-h="${m.h}"><span class="ti g">${ic(m.ic,20)}</span><span><b>${m.t}</b><small>${m.d}</small></span>${n?`<span class="badge n">${n}</span>`:ic('right',18)}</button>`}).join('')}</div></section>
  <section class="sec"><div class="sh"><h2>Coming soon</h2><span class="aside">Being built</span></div><div class="lgrid">${LSOON.map(s=>`<div class="card lt" style="min-height:0;opacity:.85"><span class="ti">${ic(s[0],20)}</span><div><b style="font-size:15px">${s[1]}</b><small>${s[2]}</small></div><span class="n"><span class="badge pro">Soon</span></span></div>`).join('')}</div></section>`}
function libResults(){const w=LQ.q.toLowerCase().trim();const M=LMOD.filter(m=>(m.t+' '+m.d).toLowerCase().includes(w)),S2=LSOON.filter(s=>(s[1]+' '+s[2]).toLowerCase().includes(w));
  return `<section class="sec"><div class="sh"><h2>${M.length+S2.length} ${M.length+S2.length===1?'result':'results'}</h2><button class="lnk" data-a="lqClear">Clear</button></div>
  ${M.length?`<div class="card rows">${M.map(m=>`<button class="row" data-a="lmod" data-h="${m.h}"><span class="ti g">${ic(m.ic,20)}</span><span><b>${m.t}</b><small>${m.d}</small></span>${ic('right',18)}</button>`).join('')}</div>`:''}
  ${S2.length?`<div class="card rows">${S2.map(s=>`<div class="row"><span class="ti">${ic(s[0],20)}</span><span><b>${s[1]}</b><small>Coming soon</small></span><span></span></div>`).join('')}</div>`:''}
  ${M.length+S2.length?'':`<div class="card empty"><span class="ti">${ic('search',22)}</span><b>Nothing found</b><p>Try “questions”, “PYQ”, “notes” or “mistakes”.</p></div>`}</section>`}
VIEW.lib=()=>`<div class="pt"><div><h1>Library</h1><p>Practice, revision and study material</p></div></div>
  <div class="search"><label class="sbox">${ic('search',19)}<input id="lq" type="search" autocomplete="off" placeholder="Search practice, notes or questions" value="${esc3(LQ.q)}" aria-label="Search the library"><button class="clr" data-a="lqClear" aria-label="Clear search"${LQ.q?'':' hidden'}>${ic('x',17)}</button></label></div>
  <div id="lBody" class="stack" style="gap:var(--gap)">${LQ.q.trim()?libResults():libHome()}</div>`;
function drawL(){const b=$('#lBody');if(!b)return;b.innerHTML=LQ.q.trim()?libResults():libHome();$('[data-a="lqClear"]').hidden=!LQ.q}
AFTER.lib=()=>{const q=$('#lq');q.addEventListener('input',()=>{LQ.q=q.value;drawL()});try{if(typeof loadPdfs==='function'&&pdfCount()===null)loadPdfs().then(()=>{if(S.tab==='lib'&&!LQ.q)drawL()})}catch(e){}};
A.lqClear=()=>{LQ.q='';const q=$('#lq');if(q)q.value='';drawL()};
A.lmod=el=>{const h=el.dataset.h,f={'#/b':openSaved,'#/m':openMistakes,'#/notes':openNotes}[h];if(f)f();else oldHash(h)};

/* ================= ANALYTICS: from the student's own results (cbt_catalog.results) ================= */
const AN={per:'all',chart:'marks',table:false};
const PERS=[['7d','7 days'],['30d','30 days'],['month','This month'],['all','All time']];
const allRes=()=>(C().results||[]).slice().sort((a,b)=>(a.at||0)-(b.at||0));
function resIn(){const L=allRes(),t=nowMs();if(AN.per==='all')return L;if(AN.per==='month'){const d=new Date(t);d.setDate(1);d.setHours(0,0,0,0);return L.filter(r=>r.at>=d.getTime())}const days=AN.per==='7d'?7:30;return L.filter(r=>t-r.at<=days*DAY)}
const pctOf=r=>r.max?Math.max(0,Math.round(r.score*100/r.max)):0;
const accOf=r=>(r.correct+r.wrong)?Math.round(r.correct*100/(r.correct+r.wrong)):0;
const titleOf=r=>{const t=tOf(r.test_id);return t?t.title:'Test'};
const stats=R=>{try{return pstats(R)}catch(e){return {streak:0,week:[],tot:0,cor:0,acc:0,best:0,avg:0,n:R.length,lvl:'Beginner',badges:[],secs:0}}};
let vbId=0;
function vbars(pts,o){if(!pts.length)return `<div class="cempty">${o.empty||'No data in this period yet.'}</div>`;const id='vb'+(++vbId),mx=o.max||Math.max(1,...pts.map(p=>p.v));
  return `<div class="vb" id="${id}"><div class="vb-tip" aria-live="polite">${o.tip0||'Tap a bar to see its value.'}</div><div class="vb-plot" role="img" aria-label="${esc3(o.label)}">${pts.map((p,i)=>`<button class="vbar${p.hi?' hi':''}" style="--h:${(Math.max(.02,p.v/mx)*100).toFixed(1)}%" data-a="vb" data-c="${id}" data-t="${esc3(p.tip)}" aria-label="${esc3(p.tip.replace(/<[^>]+>/g,''))}"><em>${p.v}${o.unit||''}</em><i style="animation-delay:${(i*.04).toFixed(2)}s"></i></button>`).join('')}</div><div class="vb-x">${pts.map(p=>`<span>${p.l}</span>`).join('')}</div></div>`}
A.vb=el=>{const box=root.getElementById(el.dataset.c);box.querySelectorAll('.vbar').forEach(b=>b.classList.toggle('act',b===el));box.querySelector('.vb-tip').innerHTML=el.dataset.t};
const legend=items=>`<div class="lg">${items.map(i=>`<span><i style="background:${i[1]}"></i>${i[0]}${i[2]!=null?` <b>${i[2]}</b>`:''}</span>`).join('')}</div>`;
function heat(R){const days=84,end=day0(nowMs()),start=end-(days-1)*DAY,pad=(new Date(start).getDay()+6)%7,cnt={};R.forEach(r=>{const k=day0(r.at);cnt[k]=(cnt[k]||0)+1});const cells=[];
  for(let i=0;i<pad;i++)cells.push('<i style="visibility:hidden"></i>');
  for(let i=0;i<days;i++){const d=start+i*DAY,n=cnt[d]||0,l=n===0?'':n===1?'l2':n===2?'l3':'l4';cells.push(`<i class="${l}${d===end?' td':''}" title="${fD(d,{day:'numeric',month:'short'})}: ${n} test${n===1?'':'s'}"></i>`)}
  return `<div class="heat" role="img" aria-label="Tests taken per day over the last 12 weeks">${cells.join('')}</div><div class="hl2" style="justify-content:flex-end">Less <i style="background:var(--surface2)"></i><i style="background:color-mix(in srgb,var(--acc2) 55%,var(--surface2))"></i><i style="background:color-mix(in srgb,var(--acc2) 80%,var(--surface2))"></i><i style="background:var(--acc2)"></i> More</div>`}
const resPts=(R,f,u)=>R.slice(-10).map((r,i,a)=>({l:fD(r.at,{day:'numeric',month:'short'}).replace(' ',' '),v:f(r),hi:i===a.length-1,tip:`${esc3(titleOf(r))}: <b>${f(r)}${u}</b>${u==='%'&&f===pctOf?` (${r.score} / ${r.max})`:''}`}));
const CHARTS={
 marks:['Test marks',()=>{const R=resIn();return {html:vbars(resPts(R,pctOf,'%'),{max:100,unit:'%',label:'Marks per test, latest 10',empty:'No tests in this period. Take a test to see it here.'}),rows:R.map(r=>[titleOf(r),`${r.score} / ${r.max} (${pctOf(r)}%)`])}}],
 acc:['Accuracy',()=>{const R=resIn();return {html:vbars(resPts(R,accOf,'%'),{max:100,unit:'%',label:'Accuracy per test, latest 10',empty:'No tests in this period.'}),rows:R.map(r=>[titleOf(r),accOf(r)+'%'])}}],
 week:['This week',()=>{const W=stats(allRes()).week||[];return {html:vbars(W.map((w,i)=>({l:w.l,v:w.n,hi:i===W.length-1,tip:`${w.l}: <b>${w.n}</b> test${w.n===1?'':'s'}`})),{label:'Tests per day this week',tip0:'Tests you took each day this week.'}),rows:W.map(w=>[w.l,w.n])}}],
 activity:['Activity',()=>{const R=allRes(),days=new Set(R.filter(r=>nowMs()-r.at<84*DAY).map(r=>day0(r.at))).size;return {html:heat(R),rows:[['Active days, last 12 weeks',`${days} of 84`],['Current streak',stats(R).streak+' days']]}}]};
function chartArea(){const c=CHARTS[AN.chart],r=c[1]();return `<div class="csel" role="tablist">${Object.entries(CHARTS).map(([k,v])=>`<button role="tab" aria-selected="${k===AN.chart}" class="${k===AN.chart?'on':''}" data-a="chSel" data-v="${k}">${v[0]}</button>`).join('')}</div>
  <div class="ctl"><span>${['week','activity'].includes(AN.chart)?'All time':PERS.find(p=>p[0]===AN.per)[1]}</span><button class="lnk" data-a="chTbl">${AN.table?'Show chart':'Show as table'}</button></div>
  ${AN.table?(r.rows.length?`<table class="tbl"><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody>${r.rows.map(x=>`<tr><td>${esc3(String(x[0]))}</td><td>${x[1]}</td></tr>`).join('')}</tbody></table>`:'<div class="cempty">No data in this period.</div>'):r.html}`}
function ovH(){const R=resIn(),P=stats(R),hrs=P.secs/3600,un=R.reduce((a,r)=>{const t=tOf(r.test_id);return a+(t&&t.questions?Math.max(0,t.questions-r.correct-r.wrong):0)},0);
  return `<div class="mg"><div class="card mt w2"><div><small>Questions answered</small><b>${N(P.tot)}</b><em>${fmtN(P.cor)} right, ${fmtN(P.tot-P.cor)} wrong, ${fmtN(un)} skipped</em></div><span class="ti g">${ic('qb',21)}</span></div>
   <div class="card mt"><small>Tests taken</small><b>${N(P.n)}</b><em>&nbsp;</em></div><div class="card mt"><small>Accuracy</small><b>${N(P.acc)}<span>%</span></b><em>&nbsp;</em></div>
   <div class="card mt"><small>Average score</small><b>${N(P.avg)}<span>%</span></b><em>&nbsp;</em></div><div class="card mt"><small>Best score</small><b>${N(P.best)}<span>%</span></b><em>&nbsp;</em></div>
   <div class="card mt"><small>Time in tests</small><b>${N(hrs.toFixed(1),1)}<span>h</span></b><em>&nbsp;</em></div><div class="card mt"><small>Study streak</small><b>${N(stats(allRes()).streak)}<span>days</span></b><em>&nbsp;</em></div></div>`}
const BDI=['spark','layers','trophy','target','clock','bookmark'];
VIEW.stats=()=>{const R=allRes(),P=stats(R),o=stuProf(),fields=['name','email','phone','school','city','photo','exam','cls'],comp=Math.round(fields.filter(k=>o[k]).length*100/fields.length),C2=2*Math.PI*33,last=R[R.length-1],pcts=R.map(pctOf);
  return `<div class="pt"><div><h1>Analytics</h1><p>Your preparation, from your own results</p></div></div>
  <section class="sec"><div class="hero prof"><div class="prof-top"><div class="pav"><svg viewBox="0 0 72 72" aria-hidden="true"><circle class="tr" cx="36" cy="36" r="33"/><circle class="pg" cx="36" cy="36" r="33" stroke-dasharray="${C2.toFixed(1)}" stroke-dashoffset="${(C2*(1-comp/100)).toFixed(1)}"/></svg>${avatar('pin')}</div>
   <div style="min-width:0"><b>${esc3(stuName())}</b><small>${esc3(stuMeta())}</small></div><button class="ib" style="background:rgba(255,255,255,.1);border-color:var(--heroLine);color:var(--heroTx);box-shadow:none" data-a="profile" aria-label="Edit profile">${ic('pen',17)}</button></div>
   <div class="c3"><div><b>${esc3(P.lvl)}</b><small>Level</small></div><div><b>${P.n}</b><small>Tests taken</small></div><div><b>${P.streak} ${P.streak===1?'day':'days'}</b><small>Streak</small></div></div>
   <div class="ft"><small>Profile <span class="gold">${comp}% complete</span>${comp<100?'. Add the missing details.':''}</small><button class="btn sm onhero" data-a="profile">Edit profile</button></div></div></section>
  <section class="sec"><div class="sh"><h2>Overall performance</h2></div><div class="chips" role="tablist" aria-label="Time period">${PERS.map(p=>`<button role="tab" aria-selected="${p[0]===AN.per}" class="${p[0]===AN.per?'on':''}" data-a="per" data-v="${p[0]}">${p[1]}</button>`).join('')}</div><div id="ovBox">${ovH()}</div></section>
  <section class="sec"><div class="sh"><h2>Test performance</h2><span class="aside">${R.length} tests</span></div><div class="card">${R.length?`<div class="p stack" style="gap:16px">
   <div class="kv"><div><small>Average</small><b>${P.avg}%</b></div><div><small>Highest</small><b>${Math.max(...pcts)}%</b></div><div><small>Lowest</small><b>${Math.min(...pcts)}%</b></div><div><small>Accuracy</small><b>${P.acc}%</b></div><div><small>Time</small><b>${(P.secs/3600).toFixed(1)} h</b></div><div><small>Last test</small><b>${pctOf(last)}%</b></div></div>
   ${vbars(resPts(R,pctOf,'%'),{max:100,unit:'%',label:'Marks across your latest 10 tests',tip0:'Your latest 10 tests. Tap a bar for details.'})}</div>
   <button class="morebtn" data-a="hist"><span>${ic('trophy',19)}Test history, results and solutions</span>${ic('right',18)}</button>`
   :`<div class="empty"><span class="ti">${ic('trophy',22)}</span><b>Take your first test</b><p>Your scores, accuracy and progress will appear here.</p><button class="btn sm gold" data-a="mySeries">Open my test series</button></div>`}</div></section>
  <section class="sec"><div class="sh"><h2>Study activity</h2><span class="aside">${P.streak}-day streak</span></div><div class="card p stack" style="gap:16px">${CHARTS.week[1]().html}<div style="border-top:1px solid var(--line);padding-top:14px" class="stack"><b style="font-size:14px">Last 12 weeks</b>${heat(R)}</div>
   <button class="btn ghost blk" data-a="oldTracker">${ic('list',16)}Open your study tracker</button></div></section>
  ${R.length?`<section class="sec"><div class="sh"><h2>Performance charts</h2></div><div class="card p stack" id="chArea">${chartArea()}</div></section>`:''}
  <section class="sec"><div class="sh"><h2>Badges</h2><span class="aside">${(P.badges||[]).filter(b=>b.on).length} of ${(P.badges||[]).length}</span></div><div class="card p stack" style="gap:18px">
   <div class="lvl"><span class="bdg">${esc3((P.lvl||'B')[0])}</span><div><b>${esc3(P.lvl)}</b><small class="mut">${P.n} tests taken. ${P.n<3?`${3-P.n} more to become a Learner`:P.n<10?`${10-P.n} more to become an Achiever`:P.n<25?`${25-P.n} more to become a Champion`:'Top level reached'}</small><span class="bar"><i style="--p:${Math.min(1,P.n/25).toFixed(3)}"></i></span></div></div>
   <div class="bdgs">${(P.badges||[]).map((b,i)=>`<div class="bdx${b.on?'':' off'}"><span>${ic(b.on?BDI[i%BDI.length]:'lock',20)}</span>${esc3(b.t)}</div>`).join('')}</div></div></section>
  <section class="sec"><div class="sh"><h2>Leaderboard and rewards</h2></div><div class="card rows">
   <button class="row" data-a="oldGo" data-h="#/r"><span class="ti g">${ic('medal',20)}</span><span><b>Ranks and leaderboards</b><small>Your rank in every test you took</small></span>${ic('right',18)}</button>
   <button class="row" data-a="oldGo" data-h="#/refer"><span class="ti g">${ic('gift',20)}</span><span><b>Refer and earn</b><small>Your code, friends who joined and wallet money</small></span>${ic('right',18)}</button></div></section>
  <section class="sec"><div class="sh"><h2>Profile and history</h2></div><div class="card rows">
   ${[['user','My profile','Name, photo, class and target exam','profile',''],['trophy','Test history',`${R.length} tests`,'hist',''],['pen','Mistake notebook','Questions you got wrong','oldGo','#/m'],['bookmark','Saved questions',`${bmCount()} saved`,'oldGo','#/b'],['cal','Study tracker history','Your weekly plans','oldGo','#/t'],['timer','Focus timer','Timed study sessions','focus','']].map(r=>`<button class="row" data-a="${r[3]}"${r[4]?` data-h="${r[4]}"`:''}><span class="ti">${ic(r[0],20)}</span><span><b>${r[1]}</b><small>${r[2]}</small></span>${ic('right',18)}</button>`).join('')}</div></section>`};
A.per=el=>{AN.per=el.dataset.v;$$('[data-a="per"]').forEach(x=>{const on=x===el;x.classList.toggle('on',on);x.setAttribute('aria-selected',on)});const o=$('#ovBox');o.innerHTML=ovH();countUp(o);const c=$('#chArea');if(c)c.innerHTML=chartArea()};
A.chSel=el=>{AN.chart=el.dataset.v;$('#chArea').innerHTML=chartArea()};
A.chTbl=()=>{AN.table=!AN.table;$('#chArea').innerHTML=chartArea()};
A.oldGo=el=>oldHash(el.dataset.h);
A.focus=()=>push(focusView());
function histView(){return {t:'Test history',s:`${allRes().length} tests`,html:()=>{const R=allRes().slice().reverse();return R.length?`<div class="card rows">${R.slice(0,60).map(r=>{const t=tOf(r.test_id),s=t&&sOf(t.series_id);return `<div class="item"><span class="ti g">${ic('trophy',18)}</span><div class="bd"><div class="tt"><b>${esc3(titleOf(r))}</b><span class="badge n">${pctOf(r)}%</span></div><small>${s?esc3(s.title)+', ':''}${dS(r.at)}</small><small>${r.score} / ${r.max} marks. ${r.correct} right, ${r.wrong} wrong. Accuracy ${accOf(r)}%${r.used?`, ${Math.round(r.used/60)} min`:''}</small><div class="acts"><button class="btn sm" data-a="review" data-r="${esc3(r.id)}">Result and solutions</button></div></div></div>`}).join('')}</div>${R.length>60?'<p class="hint">Showing your latest 60 tests.</p>':''}`:`<div class="card empty"><span class="ti">${ic('trophy',22)}</span><b>No tests yet</b><p>Your results show up here after your first test.</p></div>`}}}
A.hist=()=>push(histView());

/* ================= MY STUDY ZONE in the new design: Notes & PDFs, Saved questions, Mistakes, Results =================
   Same server calls as the classic pages (cbt_test_pdfs, cbt_file_part, cbt_bookmarks / cbt_bookmark,
   cbt_mistakes / cbt_mistake_done); only the screens are new. */
const LT='ABCD';
const imgOk=u=>/^(data:image\/(png|jpe?g|webp|gif);base64,|https:\/\/)/i.test(u||'');
const qImg=(u,cls)=>imgOk(u)?`<img class="qimg ${cls||''}" src="${esc3(u)}" alt="diagram" loading="lazy">`:'';
const clearOld=k=>{try{if(k==='bm'&&typeof BMC!=='undefined')BMC=null;if(k==='mk'&&typeof MKC!=='undefined')MKC=null;if(typeof INS!=='undefined')INS=null}catch(e){}};

/* ---------- files: download in parts, then View / Save (the same checks as the classic page) ---------- */
const FILES3={};
async function fileGet(id,title){
  if(FILES3[id])return fileSheet(id);
  openSheet(`<h2 id="sheetT">${esc3(title||'File')}</h2><p class="sub" id="fpS">Downloading…</p><div class="fbar"><i id="fpB"></i></div>`);
  const parts=[];let n=0,total=1,name='file';
  while(n<total){let r=null;try{r=await rpc('cbt_file_part',{p_file:id,p_n:n})}catch(e){}
    if(!r||!r.ok){closeLayer();toast3(r&&r.error==='not_open'?'This file opens on '+dS(r.opens_at)+'.':r&&r.error==='locked'?'This file is part of a test series you have not joined.':'Could not download. Please try again.');return}
    total=r.parts;name=r.name||name;parts.push(r.data||'');n++;const b=$('#fpB'),s=$('#fpS');if(b)b.style.width=Math.round(n*100/total)+'%';if(s)s.textContent=`Downloading… ${Math.round(n*100/total)}%`}
  try{const bin=atob(parts.join('')),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    const sig=Array.from(u.slice(0,12)).map(c=>c.toString(16).padStart(2,'0')).join('');
    const real=/^25504446/.test(sig)?'application/pdf':/^89504e47/.test(sig)?'image/png':/^ffd8ff/.test(sig)?'image/jpeg':/^52494646.{8}57454250/.test(sig)?'image/webp':'';
    FILES3[id]={url:URL.createObjectURL(new Blob([u],{type:real||'application/octet-stream'})),name,view:!!real,title}}catch(e){closeLayer();toast3('This file is damaged.');return}
  fileSheet(id)}
function fileSheet(id){const f=FILES3[id];openSheet(`<span class="ti g" style="margin-bottom:12px">${ic('check',22)}</span><h2 id="sheetT">File ready</h2><p class="sub">${esc3(f.title||f.name)}</p>
  <div class="g2" style="grid-template-columns:${f.view?'1fr 1fr':'1fr'};margin-top:14px">${f.view?`<a class="btn" href="${f.url}" target="_blank" rel="noopener">${ic('file',16)}View</a>`:''}<a class="btn ghost" href="${f.url}" download="${esc3(f.name)}">${ic('dl',16)}Save</a></div>`)}
A.fileOpen=el=>fileGet(el.dataset.id,el.dataset.t||'');

/* ---------- Notes & PDFs: notes of tests (Google Drive links) and the files of every series ---------- */
let PDF3=null;
function notesView(){return {t:'Notes & PDFs',s:'Study material of your test series',key:'notes',html:()=>{
  const T=(C().tests||[]).filter(t=>PDF3&&PDF3[t.id]),S=mine().filter(s=>(s.files||[]).length);
  if(PDF3===null)return '<div class="card sk" style="height:90px"></div><div class="card sk" style="height:90px"></div>';
  if(!T.length&&!S.length)return `<div class="card empty"><span class="ti">${ic('file',22)}</span><b>No notes yet</b><p>When your teacher adds notes or PDFs to your test series, they show up here.</p></div>`;
  return S.map(s=>`<div class="stack" style="gap:10px"><p class="gh">${esc3(s.title)}</p><div class="card rows">${s.files.map(f=>`<button class="row" data-a="fileOpen" data-id="${esc3(f.id)}" data-t="${esc3(f.title||f.name)}"><span class="ti g">${ic(f.kind==='schedule'?'cal':f.kind==='syllabus'?'list':'file',19)}</span><span><b>${esc3(f.title||f.name)}</b><small>${({schedule:'Schedule',syllabus:'Syllabus',notes:'Notes'})[f.kind]||'File'}</small></span>${ic('dl',18)}</button>`).join('')}</div></div>`).join('')
   +(T.length?`<div class="stack" style="gap:10px"><p class="gh">Notes of tests</p><div class="card rows">${T.map(t=>`<button class="row" data-a="pdfOpen" data-id="${esc3(t.id)}"><span class="ti g">${ic('file',19)}</span><span><b>${esc3(PDF3[t.id].label||t.title)}</b><small>${esc3(t.title)}, opens in Google Drive</small></span>${ic('right',18)}</button>`).join('')}</div></div>`:'')}}}
const pdfLinkOk=u=>typeof u==='string'&&u.length<=500&&/^https:\/\/(drive|docs)\.google\.com\/[A-Za-z0-9/_?=&%.#~+-]+$/.test(u);
function loadPdf3(){return rpc('cbt_test_pdfs',{}).then(r=>{const o={};if(r&&r.ok&&r.items)for(const k in r.items){const x=r.items[k];if(/^[A-Za-z0-9_-]{1,64}$/.test(k)&&x&&pdfLinkOk(x.url))o[k]={url:x.url,label:String(x.label||'')}}PDF3=o}).catch(()=>{PDF3=PDF3||{}})}
A.pdfOpen=el=>{const p=PDF3&&PDF3[el.dataset.id];if(!p||!pdfLinkOk(p.url)){toast3('PDF not available');return}const w=window.open(p.url,'_blank','noopener,noreferrer');if(w)w.opener=null};
function openNotes(){push(notesView());loadPdf3().then(()=>{if(top()&&top().key==='notes')redraw()})}

/* ---------- one question card (Saved and Mistakes) ---------- */
function qCard(q,o){const rev=o.rev,pick=o.pick;
  return `<article class="card qc3" id="${o.id}"><div class="qc3-h"><b>Q${q.qidx+1}</b>${q.title||tOf(q.test_id)?`<span class="tag">${esc3(q.title||(tOf(q.test_id)||{}).title)}</span>`:''}${o.badge||''}<span style="flex:1"></span>${o.tools||''}</div>
  <div class="qc3-q">${esc3(q.q||'')}</div>${qImg(q.img)}
  <div class="qc3-o">${(q.options||[]).map((op,j)=>{if(!op&&!(q.oimg&&q.oimg[j]))return '';const cls=rev?(j===q.answer?' c':j===pick?' w':''):'';
    return `<${o.tap&&!rev?`button data-a="${o.tap}" data-n="${o.n}" data-j="${j}"`:'div'} class="opt3${cls}"><span class="k">${LT[j]}</span><span class="ot">${esc3(op||'')}${qImg(q.oimg&&q.oimg[j],'oi')}</span>${rev&&j===q.answer?ic('check',16):''}</${o.tap&&!rev?'button':'div'}>`}).join('')}</div>
  ${o.note||''}${rev&&(q.explanation||q.eimg)?`<div class="exp3"><b>Explanation</b><p>${esc3(q.explanation||'')}</p>${qImg(q.eimg)}</div>`:''}${o.foot||''}</article>`}

/* ---------- Saved questions ---------- */
let BM3=null;
function savedView(){return {t:'Saved questions',get s(){return BM3?`${BM3.length} saved`:''},key:'saved',html:()=>{
  if(BM3===null)return '<div class="card sk" style="height:180px"></div><div class="card sk" style="height:180px"></div>';
  if(!BM3.length)return `<div class="card empty"><span class="ti">${ic('bookmark',22)}</span><b>No saved questions yet</b><p>Tap the bookmark on any question during a test or its solutions to keep it here.</p></div>`;
  const G=new Map();BM3.forEach(x=>{if(!G.has(x.test_id))G.set(x.test_id,{title:x.title||(tOf(x.test_id)||{}).title||'Test',L:[]});G.get(x.test_id).L.push(x)});
  return [...G].map(([tid,g])=>`<div class="stack" style="gap:12px"><p class="gh">${esc3(g.title)} <span>${g.L.length}</span></p>${g.L.map(q=>qCard(q,{id:'bm'+tid+'_'+q.qidx,rev:!!q.solved,
     tools:`<button class="ib sm on" data-a="bmOff" data-t="${esc3(tid)}" data-i="${q.qidx}" aria-label="Remove from saved">${ic('bookmark',17)}</button>`,
     note:q.solved?'':`<p class="qc3-n">${ic('lock',14)}The correct answer shows here after you attempt this test.</p>`})).join('')}</div>`).join('')}}}
function openSaved(){BM3=null;push(savedView());rpc('cbt_bookmarks',{}).then(r=>{BM3=r&&r.ok?r.items||[]:[];if(!(r&&r.ok))toast3('Could not load saved questions.');if(top()&&top().key==='saved'){$('#scrS').textContent=`${BM3.length} saved`;redraw()}}).catch(()=>{BM3=[];redraw()})}
A.bmOff=async el=>{const tid=el.dataset.t,i=+el.dataset.i,card=root.getElementById('bm'+tid+'_'+i);if(card)card.classList.add('out3');
  let r=null;try{r=await rpc('cbt_bookmark',{p_test:tid,p_qidx:i,p_on:false})}catch(e){}
  if(!r||!r.ok){if(card)card.classList.remove('out3');toast3('Could not remove. Please try again.');return}
  clearOld('bm');try{if(typeof BM!=='undefined'&&BM)BM.delete(tid+':'+i)}catch(e){}
  setTimeout(()=>{BM3=BM3.filter(x=>!(x.test_id===tid&&x.qidx===i));$('#scrS').textContent=`${BM3.length} saved`;redraw();toast3('Removed from saved')},RM?0:260)};

/* ---------- Mistake notebook: what to revise, by subject, and a focused practice mode ----------
   Server: cbt_mistakes (list + counts, paged), cbt_mistake_done (mastered). Nothing new is stored. */
const MK3={kind:'all',sec:'',items:null,more:false,counts:null,st:{},open:{},n:0,busy:false};
async function mkLoad(off){if(MK3.busy)return;MK3.busy=true;let r=null;try{r=await rpc('cbt_mistakes',{p_offset:off,p_limit:15,p_kind:MK3.kind,p_sec:MK3.sec})}catch(e){}MK3.busy=false;
  if(!r||!r.ok){if(MK3.items===null)MK3.items=[];if(!MK3.counts)MK3.counts={wrong:0,skipped:0,mastered:0,secs:[]};toast3('Could not load your notebook. Please try again.');if(top()&&top().key==='mk')redraw();return}
  r.items.forEach(x=>{x._n=++MK3.n});MK3.items=off?MK3.items.concat(r.items):r.items;MK3.more=r.more;if(!MK3.sec&&MK3.kind==='all'||!MK3.counts)MK3.counts=r.counts;else MK3.counts=Object.assign({},r.counts,{secs:MK3.counts.secs});
  if(top()&&top().key==='mk'){const b=$('#scrB'),y=b.scrollTop;redraw();b.scrollTop=y}}
const mkRing=(p,sz)=>{const R=sz/2-5,Cc=2*Math.PI*R;return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" aria-hidden="true"><circle cx="${sz/2}" cy="${sz/2}" r="${R}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="7"/><circle cx="${sz/2}" cy="${sz/2}" r="${R}" fill="none" stroke="var(--acc1)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${Cc.toFixed(1)}" stroke-dashoffset="${(Cc*(1-p)).toFixed(1)}" transform="rotate(-90 ${sz/2} ${sz/2})" class="mkr"/></svg>`};
function mkHero(){const c=MK3.counts,tot=c.wrong+c.skipped,all=tot+c.mastered,p=all?c.mastered/all:0;
  return `<section class="mkh"><div class="mkh-top"><div><small>TO REVISE</small><b>${N(tot)}</b><span>${tot===1?'question':'questions'} waiting for you</span></div>
    <div class="mkh-ring">${mkRing(p,96)}<span><b>${Math.round(p*100)}%</b><small>mastered</small></span></div></div>
   <div class="mkh-st"><div><i class="dw"></i><b>${N(c.wrong)}</b><small>Wrong</small></div><div><i class="ds"></i><b>${N(c.skipped)}</b><small>Skipped</small></div><div><i class="dm"></i><b>${N(c.mastered)}</b><small>Mastered</small></div></div>
   ${tot?`<button class="btn gold lg" data-a="mkPrac">${ic('play',17)}Practise ${MK3.sec?esc3(MK3.sec):'now'}</button>`:''}</section>`}
function mkSubjects(){const S=(MK3.counts.secs||[]).filter(s=>s.n>0);if(S.length<2)return '';const mx=Math.max(...S.map(s=>s.n));
  return `<section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>By subject</h2>${MK3.sec?'<button class="lnk" data-a="mkSec" data-v="">Show all</button>':''}</div>
   <div class="card mks">${S.map(s=>`<button class="mks-r${MK3.sec===s.sec?' on':''}" data-a="mkSec" data-v="${esc3(s.sec)}" aria-pressed="${MK3.sec===s.sec}"><span class="mks-t"><b>${esc3(s.sec)}</b><em>${s.n}</em></span><span class="mks-b"><i style="width:${Math.max(6,Math.round(s.n/mx*100))}%"></i></span></button>`).join('')}</div></section>`}
function mkRow(it){const S=MK3.st[it._n]||{},rev=S.pick!=null||!!S.show,open=MK3.open[it._n],t=it.title||(tOf(it.test_id)||{}).title||'Test';
  if(!open)return `<button class="card mkq" id="mk${it._n}" data-a="mkOpen" data-n="${it._n}"><span class="mkq-h"><b>Q${it.qidx+1}</b><span class="mut">${esc3(t)}</span>${it.sec?`<span class="tag">${esc3(it.sec)}</span>`:''}</span>
    <span class="mkq-q">${esc3(it.q||'')}</span><span class="mkq-f">${it.kind==='wrong'?`<span class="st err">You chose ${LT[it.mine]||'-'}</span>`:'<span class="st">Skipped</span>'}<span class="mut">Tap to practise</span>${ic('down',16)}</span></button>`;
  return qCard(it,{id:'mk'+it._n,n:it._n,rev,pick:S.pick,tap:'mkPick',badge:it.kind==='wrong'?`<span class="st err">You chose ${LT[it.mine]||'-'}</span>`:'<span class="st">Skipped</span>',
    tools:`<button class="ib sm" data-a="mkClose" data-n="${it._n}" aria-label="Fold">${ic('x',16)}</button>`,
    note:rev&&S.pick!=null?`<p class="qc3-r ${S.pick===it.answer?'ok':'bad'}">${S.pick===it.answer?'Correct! Well done.':`Not quite. The correct answer is ${LT[it.answer]}.`}</p>`:'',
    foot:rev?`<div class="g2 qc3-f"><button class="btn sm" data-a="mkDone" data-n="${it._n}">${ic('check',15)}Mastered</button><button class="btn sm ghost" data-a="mkAgain" data-n="${it._n}">Try again</button></div>`
     :`<div class="qc3-f row"><span class="mut" style="flex:1;font-size:13px">Pick your answer</span><button class="btn sm ghost" data-a="mkShow" data-n="${it._n}">Show answer</button></div>`})}
function mkView(){return {t:'Mistake notebook',s:'Turn every mistake into marks',key:'mk',html:()=>{const c=MK3.counts;
  if(MK3.items===null||!c)return '<div class="card sk" style="height:230px"></div><div class="card sk" style="height:140px"></div><div class="card sk" style="height:120px"></div>';
  const tot=c.wrong+c.skipped;
  if(!tot&&!MK3.items.length)return mkHero()+`<div class="card empty"><span class="ti g">${ic('check',22)}</span><b>${c.mastered?'Everything mastered!':'Your notebook is empty'}</b><p>${c.mastered?'Every question you got wrong is now mastered. Keep taking tests.':'Questions you get wrong or skip in tests collect here, so you can practise them until you get them right.'}</p></div>`;
  return mkHero()+mkSubjects()+`<div class="seg" role="tablist">${[['all','All',tot],['wrong','Wrong',c.wrong],['skipped','Skipped',c.skipped]].map(t=>`<button role="tab" aria-selected="${MK3.kind===t[0]}" class="${MK3.kind===t[0]?'on':''}" data-a="mkKind" data-v="${t[0]}">${t[1]}<small>${t[2]}</small></button>`).join('')}</div>
   <div class="stack" style="gap:10px">${MK3.items.length?MK3.items.map(mkRow).join(''):`<div class="card empty"><span class="ti">${ic('search',22)}</span><b>Nothing here</b><p>No questions match this filter.</p></div>`}</div>
   ${MK3.more?`<button class="btn lg ghost" data-a="mkMore">${MK3.busy?'Loading…':'Show more questions'}</button>`:''}`}}}
function openMistakes(){MK3.kind='all';MK3.sec='';MK3.items=null;MK3.st={};MK3.open={};push(mkView());mkLoad(0)}
const mkKeep=fn=>{const b=$('#scrB'),y=b.scrollTop;fn();redraw();b.scrollTop=y};
A.mkOpen=el=>mkKeep(()=>{MK3.open[+el.dataset.n]=1});
A.mkClose=el=>mkKeep(()=>{delete MK3.open[+el.dataset.n];delete MK3.st[+el.dataset.n]});
A.mkPick=el=>mkKeep(()=>{MK3.st[+el.dataset.n]={pick:+el.dataset.j};if(navigator.vibrate)navigator.vibrate(8)});
A.mkShow=el=>mkKeep(()=>{MK3.st[+el.dataset.n]={show:1}});
A.mkAgain=el=>mkKeep(()=>{delete MK3.st[+el.dataset.n]});
A.mkKind=el=>{MK3.kind=el.dataset.v;MK3.st={};MK3.open={};MK3.items=[];MK3.more=false;mkKeep(()=>{});mkLoad(0)};
A.mkSec=el=>{MK3.sec=el.dataset.v;MK3.st={};MK3.open={};MK3.items=[];MK3.more=false;mkKeep(()=>{});mkLoad(0)};
A.mkMore=()=>{mkLoad(MK3.items.length);mkKeep(()=>{})};
async function mkMaster(it){let r=null;try{r=await rpc('cbt_mistake_done',{p_test:it.test_id,p_qidx:it.qidx,p_on:true})}catch(e){}
  if(!r||!r.ok)return false;clearOld('mk');const c=MK3.counts;if(c){c[it.kind]=Math.max(0,c[it.kind]-1);c.mastered++;const s=(c.secs||[]).find(x=>x.sec===it.sec);if(s)s.n=Math.max(0,s.n-1)}
  if(MK3.items)MK3.items=MK3.items.filter(x=>!(x.test_id===it.test_id&&x.qidx===it.qidx));return true}
A.mkDone=async el=>{const n=+el.dataset.n,it=(MK3.items||[]).find(x=>x._n===n);if(!it)return;const card=root.getElementById('mk'+n);if(card)card.classList.add('out3');
  const ok=await mkMaster(it);if(!ok){if(card)card.classList.remove('out3');toast3('Could not save. Please try again.');return}
  setTimeout(()=>{mkKeep(()=>{});toast3('Marked as mastered')},RM?0:260)};

/* practice mode: one question at a time, instant feedback, master it or keep it, a short summary at the end */
const PR={q:[],i:0,pick:null,right:0,done:0,mastered:0};
function pracView(){return {t:'Practice',get s(){return PR.q.length?`${MK3.sec||'All subjects'}, ${PR.q.length} question${PR.q.length===1?'':'s'}`:''},key:'prac',html:()=>{
  if(!PR.q.length)return '<div class="card sk" style="height:300px"></div>';
  if(PR.i>=PR.q.length){const p=PR.done?Math.round(PR.right/PR.done*100):0;
    return `<section class="mkh pr-end"><div class="mkh-ring" style="margin:0 auto">${mkRing(p/100,120)}<span><b>${p}%</b><small>right</small></span></div>
     <h2>${p>=80?'Brilliant!':p>=50?'Good progress!':'Keep going!'}</h2><p>You answered <b>${PR.right}</b> of <b>${PR.done}</b> correctly and mastered <b>${PR.mastered}</b> ${PR.mastered===1?'question':'questions'}.</p>
     <div class="g2" style="grid-template-columns:1fr 1fr;width:100%"><button class="btn gold" data-a="mkPrac">${ic('play',16)}Practise again</button><button class="btn ghost on-dark" data-a="back">Back to notebook</button></div></section>`}
  const it=PR.q[PR.i],rev=PR.pick!=null,ok=rev&&PR.pick===it.answer;
  return `<div class="pr-top"><span>Question <b>${PR.i+1}</b> of ${PR.q.length}</span><span class="pr-sc">${ic('check',14)}${PR.right} right</span></div>
   <div class="pr-bar"><i style="width:${(PR.i/PR.q.length*100).toFixed(1)}%"></i></div>
   <div class="pr-card">${qCard(it,{id:'pr'+it._n,rev,pick:PR.pick,tap:'prPick',n:it._n,badge:it.sec?`<span class="tag">${esc3(it.sec)}</span>`:'',
     note:rev?(PR.pick<0?`<p class="qc3-r">The correct answer is ${LT[it.answer]}.</p>`:`<p class="qc3-r ${ok?'ok':'bad'}">${ok?'Correct! You have got this one.':`Not quite. The correct answer is ${LT[it.answer]}.`}</p>`):''})}</div>
   ${rev?`<div class="pr-ft"><button class="btn ghost" data-a="prNext">Keep for later</button><button class="btn" data-a="prMaster">${ic('check',16)}Mastered, next</button></div>`
    :`<div class="pr-ft one"><button class="btn ghost" data-a="prSkip">Show answer</button></div>`}`}}}
A.mkPrac=async()=>{PR.q=[];PR.i=0;PR.pick=null;PR.right=0;PR.done=0;PR.mastered=0;if(!(top()&&top().key==='prac'))push(pracView());else redraw();
  let r=null;try{r=await rpc('cbt_mistakes',{p_offset:0,p_limit:50,p_kind:MK3.kind,p_sec:MK3.sec})}catch(e){}
  if(!r||!r.ok||!r.items.length){toast3(r&&r.ok?'Nothing to practise here.':'Could not load questions. Please try again.');back();return}
  r.items.forEach(x=>{x._n=++MK3.n});PR.q=r.items.sort(()=>Math.random()-.5);$('#scrS').textContent=pracView().s;redraw()};
const prRedraw=()=>{redraw();$('#scrB').scrollTop=0};
A.prPick=el=>{if(PR.pick!=null)return;PR.pick=+el.dataset.j;PR.done++;if(PR.pick===PR.q[PR.i].answer)PR.right++;if(navigator.vibrate)navigator.vibrate(PR.pick===PR.q[PR.i].answer?8:[10,40,10]);redraw()};
A.prSkip=()=>{PR.pick=-1;PR.done++;redraw()};
A.prNext=()=>{PR.i++;PR.pick=null;prRedraw()};
A.prMaster=async el=>{el.disabled=true;const ok=await mkMaster(PR.q[PR.i]);if(ok)PR.mastered++;else toast3('Could not save, kept for later.');PR.i++;PR.pick=null;prRedraw()};

/* ================= PROFILE, SETTINGS, EXAM COUNTDOWN, HELP and SIGN OUT in the new design =================
   The data stays where it always was: profile cbt_pf_<mobile> and countdown cbt_cd_<mobile> on the phone, which the
   app also keeps on the student's account (cbt_keep, v56) on every save; sound cbt_snd; notifications cbt_np. */
const PF3={cls:['Class 9','Class 10','Class 11','Class 12','Dropper','College'],exam:['NEET','JEE','CUET','Boards','Other'],
  f:[['name','Full name','text','Your name','name'],['email','Email','email','name@example.com','email'],['phone','Alternate phone','tel','Optional','tel'],['school','School / Coaching','text','School or coaching name','organization'],['city','City','text','Your city','address-level2']]};
let PFD=null;
function pfAv(sz){const o=stuProf();return o.photo&&/^data:image\//.test(o.photo)?`<img src="${esc3(o.photo)}" alt="" style="width:100%;height:100%;object-fit:cover">`:`<b style="font-size:${Math.round(sz*.4)}px">${initial()}</b>`}
function profileView(){return {t:'My profile',s:'Your details and progress',key:'prof',html:()=>{const o=PFD,R=allRes(),st=stats(R),nm=(o.name||(AUTH&&AUTH.name)||'').trim();let lvl='';try{lvl=pstats(C().results||[]).lvl}catch(e){}
  return `<section class="pfh"><label class="pfa" for="pfFile" aria-label="Change photo">${pfAv(92)}<span class="pfc">${ic('pen',14)}</span></label><input id="pfFile" type="file" accept="image/*" hidden>
    <div class="pfn"><b>${esc3(nm||'Student')}</b><small>+91 ${esc3(typeof maskMob==='function'&&AUTH?maskMob(AUTH.mobile):'')}${lvl?` · ${esc3(lvl)}`:''}</small>${stuProf().photo?'<button class="lnk" data-a="pfRm">Remove photo</button>':''}</div>
    <div class="pfs"><div><b>${st.n||R.length}</b><small>Tests</small></div><div><b>${st.avg!=null?Math.round(st.avg):0}%</b><small>Average</small></div><div><b>${st.streak||0}</b><small>Day streak</small></div></div></section>
   <form class="card pff" id="pfForm" autocomplete="on" onsubmit="return false">
    ${PF3.f.map(f=>`<label class="fl"><span>${f[1]}</span><input class="inp" name="${f[0]}" type="${f[2]}" placeholder="${f[3]}" autocomplete="${f[4]}" maxlength="80" value="${esc3(f[0]==='name'?nm:(o[f[0]]||''))}"></label>`).join('')}
    <div class="fl"><span>Class</span><div class="chips wrap">${PF3.cls.map(c=>`<button type="button" class="${o.cls===c?'on':''}" aria-pressed="${o.cls===c}" data-a="pfPick" data-k="cls" data-v="${c}">${c}</button>`).join('')}</div></div>
    <div class="fl"><span>Target exam</span><div class="chips wrap">${PF3.exam.map(c=>`<button type="button" class="${o.exam===c?'on':''}" aria-pressed="${o.exam===c}" data-a="pfPick" data-k="exam" data-v="${c}">${c}</button>`).join('')}</div></div>
    <label class="fl"><span>About or goal</span><textarea class="inp" name="about" rows="3" maxlength="300" placeholder="e.g. Aim for 650+ in NEET">${esc3(o.about||'')}</textarea></label>
    <p class="hint" style="margin:0">All optional. Saved to your account, so it comes back on any phone.</p></form>
   <div class="buybar"><span class="mut" style="font-size:13px">Changes are saved when you tap Save</span><button class="btn" data-a="pfSave">${ic('check',16)}Save profile</button></div>`},
  after:()=>{const f=$('#pfFile');f&&f.addEventListener('change',()=>pfPhoto(f))}}}
A.profile=()=>{PFD=Object.assign({},stuProf());closeLayer();push(profileView())};
const pfForm=()=>{const F=$('#pfForm');if(!F)return;PF3.f.forEach(f=>{const i=F.querySelector(`[name="${f[0]}"]`);if(i)PFD[f[0]]=i.value.trim()});const a=F.querySelector('[name=about]');if(a)PFD.about=a.value.trim()};
A.pfPick=el=>{pfForm();PFD[el.dataset.k]=PFD[el.dataset.k]===el.dataset.v?'':el.dataset.v;redraw()};
A.pfSave=()=>{pfForm();const o=Object.assign({},stuProf(),PFD);if(AUTH&&o.name===(AUTH.name||'').trim())delete o.name;
  if(o.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)){toast3('Please check your email');return}
  try{pfSave(o);if(typeof pfHdr==='function')pfHdr()}catch(e){toast3('Could not save. Please try again.');return}
  toast3('Profile saved');back();setTimeout(()=>softRender(),350)};
A.pfRm=()=>{const o=Object.assign({},stuProf());delete o.photo;try{pfSave(o)}catch(e){}PFD=Object.assign(PFD||{},{photo:undefined});delete PFD.photo;redraw();toast3('Photo removed')};
function pfPhoto(inp){const f=inp.files&&inp.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{const im=document.createElement('img');im.onload=()=>{const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),m=Math.min(im.width,im.height);
    g.drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,S,S);const o=Object.assign({},stuProf());o.photo=c.toDataURL('image/jpeg',.82);try{pfSave(o)}catch(e){}pfForm();PFD.photo=o.photo;redraw();toast3('Photo updated')};
   im.onerror=()=>toast3('Could not read this picture');im.src=r.result};r.readAsDataURL(f)}

/* ---------- exam countdown editor ---------- */
const CDU3=[['months','Months'],['weeks','Weeks'],['days','Days'],['hours','Hours'],['minutes','Minutes'],['seconds','Seconds']];
const CDQ=[['NEET 2027','2027-05-02T14:00'],['JEE Main 2027','2027-01-22T09:00'],['JEE Advanced 2027','2027-05-23T09:00'],['CUET 2027','2027-05-15T09:00']];
let CDE3=null;
const cdk3=()=>'cbt_cd_'+(AUTH&&AUTH.mobile);
const pad2=n=>String(n).padStart(2,'0');
const dtLocal=t=>{const d=new Date(t);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`};
function cdSheet(){const c=CDE3;openSheet(`<h2 id="sheetT">Exam countdown</h2><p class="sub">Only you see this. It is kept on your account.</p>
  <div class="fg"><h3>Quick pick</h3><div class="chips wrap">${CDQ.map(q=>`<button class="${c.name===q[0]?'on':''}" data-cq="${q[0]}" data-cd="${q[1]}">${q[0]}</button>`).join('')}</div></div>
  <label class="fl"><span>Exam or event name</span><input class="inp" id="cdN" maxlength="30" placeholder="e.g. NEET 2027" value="${esc3(c.name)}"></label>
  <label class="fl"><span>Date and time</span><input class="inp" id="cdD" type="datetime-local" value="${c.date}"></label>
  <div class="fg"><h3>Show these</h3><div class="chips wrap">${CDU3.map(u=>`<button class="${c.units.includes(u[0])?'on':''}" aria-pressed="${c.units.includes(u[0])}" data-cu="${u[0]}">${u[1]}</button>`).join('')}</div></div>
  <div class="sheet-ft">${c.had?'<button class="btn ghost" data-cdx>Remove</button>':'<button class="btn ghost" data-a="close">Cancel</button>'}<button class="btn" data-cds>Save countdown</button></div>`);
  sheet.onclick=e=>{const read=()=>{const n=sheet.querySelector('#cdN'),d=sheet.querySelector('#cdD');if(n)c.name=n.value;if(d)c.date=d.value};
   const q=e.target.closest('[data-cq]');if(q){c.name=q.dataset.cq;c.date=q.dataset.cd;cdSheet();return}
   const u=e.target.closest('[data-cu]');if(u){read();const i=c.units.indexOf(u.dataset.cu);i>-1?c.units.splice(i,1):c.units.push(u.dataset.cu);const y=sheet.scrollTop;cdSheet();sheet.scrollTop=y;return}
   if(e.target.closest('[data-cdx]')){try{LS.del(cdk3())}catch(e2){}closeLayer();toast3('Countdown removed');softRender();return}
   if(e.target.closest('[data-cds]')){read();const n=c.name.trim(),t=new Date(c.date).getTime();if(!n){toast3('Enter the exam name');return}if(!c.date||isNaN(t)){toast3('Pick a date');return}if(!c.units.length){toast3('Pick at least one unit');return}
    let old=null;try{old=cdGet()}catch(e2){}const iso=new Date(t).toISOString();
    try{LS.set(cdk3(),{name:n,date:iso,start:old&&old.date===iso&&old.start?old.start:Date.now(),units:CDU3.map(x=>x[0]).filter(k=>c.units.includes(k))})}catch(e2){toast3('Could not save');return}
    closeLayer();toast3('Countdown saved');softRender()}}}
A.cdEdit=()=>{let c=null;try{c=cdGet()}catch(e){}CDE3={name:c?c.name:'',date:dtLocal(c?c.date:Date.now()+30*DAY),units:c?c.units.slice():['days','hours','minutes'],had:!!c};closeLayer();setTimeout(cdSheet,RM?0:60)};

/* ---------- settings ---------- */
const sndOn3=()=>{try{return LS.get('cbt_snd',true)!==false}catch(e){return true}};
const npOn3=()=>{try{return npOn()}catch(e){return false}};
const standalone3=()=>{try{return isStandalone()}catch(e){return false}};
function setRow(i,t,d,a,right){return `<button class="row" data-a="${a}"><span class="ti g">${ic(i,19)}</span><span><b>${t}</b>${d?`<small>${d}</small>`:''}</span>${right||ic('right',18)}</button>`}
const tgl=on=>`<span class="tgl${on?' on':''}" aria-hidden="true"><i></i></span>`;
function settingsView(){return {t:'Settings',s:'Your account and the app',key:'set',html:()=>{let c=null;try{c=cdGet()}catch(e){}
  return `<div class="stack" style="gap:10px"><p class="gh">Account</p><div class="card rows">${setRow('user','Profile','Name, photo, class and target exam','profile')}${setRow('target','Exam countdown',c?esc3(c.name)+', '+dS(c.date):'Set your exam date','cdEdit')}${setRow('sun','Theme and colours',esc3(themeLabel()),'setTheme')}</div></div>
  <div class="stack" style="gap:10px"><p class="gh">App</p><div class="card rows">${setRow('bell','Phone notifications',npOn3()?'On, new notices appear on your phone':'Get new notices on your phone','setNp',tgl(npOn3()))}${setRow('mega','Opening sound',sndOn3()?'On, a soft sound with the opening animation':'Off, the app opens silently','setSnd',tgl(sndOn3()))}${standalone3()?'':setRow('dl','Install the app','Open it from your home screen, full screen','setInstall')}${setRow('swap','Classic design','Switch back to the older look','setClassic')}</div></div>
  <div class="stack" style="gap:10px"><p class="gh">Help</p><div class="card rows">${setRow('mail','Chat with support','WhatsApp or Telegram','setHelp')}${setRow('info','About us','','setAbout')}${setRow('file','Terms and conditions','','setTerms')}${setRow('file','Privacy policy','','setPrivacy')}${setRow('file','Refund policy','','setRefund')}</div></div>
  <button class="btn lg ghost danger3" data-a="setOut">${ic('out',17)}Sign out</button>`}}}
A.settings=()=>{closeLayer();push(settingsView())};
A.setTheme=()=>openTheme();
A.setSnd=()=>{const on=!sndOn3();try{LS.set('cbt_snd',on)}catch(e){}toast3(on?'Opening sound on':'Opening sound off');redraw()};
A.setNp=async()=>{try{await npToggle()}catch(e){toast3('Could not change notifications')}setTimeout(()=>{if(top()&&top().key==='set')redraw()},300)};
A.setClassic=()=>window.v3Disable();
A.setPrivacy=()=>window.open('privacy','_blank','noopener');A.setRefund=()=>window.open('refund','_blank','noopener');
A.setInstall=()=>{if(standalone3()){toast3('The app is already installed');return}
  try{if(typeof DIP!=='undefined'&&DIP){const p=DIP;DIP=null;p.prompt();return}}catch(e){}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent),st=ios?['Open this site in <b>Safari</b>','Tap the <b>Share</b> button','Tap <b>Add to Home Screen</b>, then <b>Add</b>']:['Tap the <b>⋮</b> menu at the top right of Chrome','Tap <b>Install app</b> (or <b>Add to Home screen</b>)','Tap <b>Install</b>, then open the app from your home screen'];
  openSheet(`<span class="ti g" style="margin-bottom:12px">${ic('dl',22)}</span><h2 id="sheetT">Install the app</h2><p class="sub">Full screen, from your home screen. No app store needed.</p><ol class="steps3">${st.map((s,i)=>`<li><b>${i+1}</b><span>${s}</span></li>`).join('')}</ol><button class="btn blk" data-a="close" style="margin-top:14px">Got it</button>`)};
/* the texts of About, Terms and support come from the classic app, so there is one copy to keep up to date */
function grabSheet(fn){let h='';try{const s=window.sheet;window.sheet=x=>{h=x};try{fn()}finally{window.sheet=s}}catch(e){}return h}
function legalPage(t,fn){const raw=grabSheet(fn),i=raw.indexOf('<div class="legal">');push({t,s:'',key:'legal',html:()=>i>-1?`<div class="card p legal3">${raw.slice(i)}</div>`:`<div class="card empty"><b>Could not open this page</b></div>`})}
A.setAbout=()=>legalPage('About us',()=>openAbout());
A.setTerms=()=>legalPage('Terms and conditions',()=>openTerms());
A.setHelp=()=>{let b='';try{SUPMSG='';b=supBtns()}catch(e){}openSheet(`<span class="ti g" style="margin-bottom:12px">${ic('mail',22)}</span><h2 id="sheetT">Chat with support</h2><p class="sub">Our student support team replies on chat. Choose where you want to talk.</p><div class="sup3">${b}</div><p class="hint" style="text-align:center">Chat only. Calls are not available.</p>`)};
A.setOut=()=>openSheet(`<span class="ti" style="margin-bottom:12px">${ic('out',22)}</span><h2 id="sheetT">Sign out?</h2><p class="sub">Your tests, results and notes stay on your account. Sign in again with your mobile number any time.</p><div class="sheet-ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn danger3" data-a="setOutGo">Sign out</button></div>`);
A.setOutGo=()=>{closeLayer();unwind(()=>{try{doSignOut()}catch(e){location.reload()}})};

/* ================= MENU: the classic menu's items, plus the switch back ================= */
A.menu=()=>{const u=unread(),mi=(i,t,k,on,extra,cls)=>`<button class="mi${on?' on':''}${cls||''}" data-a="m" data-k="${k}">${ic(i)}<span>${t}</span>${extra?`<em>${extra}</em>`:''}</button>`;
  drawer.innerHTML=`<div class="hero pcard"><div class="who">${avatar()}<div style="min-width:0"><b>${esc3(stuName())}</b><small class="mut">${esc3(stuMeta())}</small></div></div><button class="btn sm onhero ghost blk" data-a="m" data-k="profile">View profile</button></div>
  <div class="mgp">${mi('sun','Theme settings','theme',0,THEMES[resolveMode(TH.mode)].name)}</div><div class="mdiv"></div>
  <div class="mgp">${mi('home','Home','home',S.tab==='home')}${mi('tests','Test Series','series',S.tab==='test')}${mi('hist','Test History','history')}${mi('pen','Mistake Notebook','mistakes')}${mi('bookmark','Saved Questions','saved')}${mi('cal','Study Tracker','tracker')}${mi('bell','Notifications','notif',0,u?u+' new':'')}${mi('target','Exam Countdown','cd')}</div><div class="mdiv"></div>
  <div class="mgp">${mi('gear','Settings','settings')}${mi('info','About Us','about')}${mi('file','Terms & Conditions','terms')}${mi('file','Privacy Policy','privacy')}${mi('file','Refund Policy','refund')}${mi('mail','Contact Us','contact')}</div><div class="mdiv"></div>
  ${mi('swap','Switch to the classic design','classic',0,'','')}${mi('out','Logout','logout',0,'',' out')}`;openLayer(drawer)};
A.m=el=>{const k=el.dataset.k;closeLayer();
  const M={profile:A.profile,theme:openTheme,home:()=>go('home'),series:()=>go('test'),history:A.hist,mistakes:()=>openMistakes(),saved:()=>openSaved(),tracker:()=>oldHash('#/t'),notif:A.bell,cd:A.cdEdit,
   settings:A.settings,about:A.setAbout,terms:A.setTerms,privacy:()=>window.open('privacy','_blank','noopener'),refund:()=>window.open('refund','_blank','noopener'),contact:A.setHelp,
   classic:()=>window.v3Disable(),logout:A.setOut};
  setTimeout(()=>{(M[k]||(()=>{}))()},140)};

/* ---------- theme page: preview live, apply to keep, reset to default ---------- */
function themeHtml(){const mode=resolveMode(THP.mode),P=THEMES[mode].pals,cur=THP.pal[mode]||'A';
  return `<div class="card tprev"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">Preview</b><span class="st ok">Live</span></div>
   <div class="hero tp-hero"><div><small>Exam countdown</small><br><b>175 days</b></div>${ic('target',26)}</div>
   <div style="display:flex;justify-content:space-between;font-size:13px"><span class="mut"><b style="color:var(--tx)">48</b> of 120 tests done</span><span class="tag">Premium series</span></div><span class="bar"><i style="--p:.4"></i></span>
   <div style="display:flex;gap:8px;align-items:center"><span class="btn sm">Primary</span><span class="btn sm gold">Accent</span><span class="btn sm ghost">Secondary</span></div></div>
  <div class="bf" style="border:0;padding-bottom:0"><h3>Mode</h3><div class="seg">${[['system','System'],['light','Light'],['dark','Dark'],['black','Black']].map(m=>`<button class="${THP.mode===m[0]?'on':''}" data-a="thm" data-v="${m[0]}" aria-pressed="${THP.mode===m[0]}">${m[1]}</button>`).join('')}</div>${THP.mode==='system'?`<p class="hint">Follows your phone. It is ${mode} right now.</p>`:''}</div>
  <div class="bf" style="border:0;padding-top:4px"><h3>${THEMES[mode].name} palettes</h3><div class="pals">${Object.entries(P).map(([k,v])=>{const t=tokens(mode,k);
   return `<button class="pal${cur===k?' on':''}" data-a="thp" data-v="${k}" aria-pressed="${cur===k}"><span class="swt"><i style="background:${t.bg}"></i><i style="background:${t.s2}"></i><i style="background:linear-gradient(155deg,${t.h1},${t.h2})"></i><i style="background:linear-gradient(135deg,${t.a1},${t.a2})"></i></span><span><b>${v[0]}</b><small>${v[2]}</small></span><span class="ck">${ic('check')}</span></button>`}).join('')}</div></div>
  <div class="g2"><button class="btn ghost" data-a="thReset">Reset to default</button><button class="btn gold" data-a="thApply">Apply theme</button></div>
  <p class="hint">The new design has its own colours. The exam screen and the classic design keep the theme you chose there.</p>`}
function openTheme(){THP=clone(TH);push({t:'Theme & colours',s:'Light, Dark or Black, with a palette',html:themeHtml,leave:()=>{THP=null;applyTheme(TH)}})}
A.thm=el=>{THP.mode=el.dataset.v;applyTheme(THP);redraw()};
A.thp=el=>{THP.pal[resolveMode(THP.mode)]=el.dataset.v;applyTheme(THP);redraw()};
A.thApply=()=>{TH=clone(THP);saveTheme();toast3('Theme applied: '+themeLabel())};
A.thReset=()=>{THP=clone(DEF_TH);applyTheme(THP);redraw();toast3('Default theme shown. Tap Apply theme to keep it.')};

/* ================= WIRING INTO THE CLASSIC APP ================= */
function boot(){if(booted)return;ensureHost();booted=true;
  main=$('#main');dock=$('#dock');scr=$('#scr');sheet=$('#sheet');drawer=$('#drawer');scrim=$('#scrim');
  root.addEventListener('click',onClick);
  root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.fc')){e.preventDefault()}});
  dock.innerHTML=NAV.map(n=>`<button data-a="tab" data-tab="${n[0]}" aria-label="${n[1]}">${ic(n[2])}<span>${n[1]}</span></button>`).join('');
  $('#mnu').innerHTML=ic('menu',22);$('#scrBack').innerHTML=ic('back',20);syncBell();
  /* the header looks the same at every scroll position (no class toggled on scroll) */
  if(!RM){const w=$('#bmk');const sh=()=>{if(document.hidden||document.body.classList.contains('v3old')||!document.body.classList.contains('v3on'))return;w.classList.remove('go');void w.offsetWidth;w.classList.add('go')};setTimeout(sh,900);setInterval(sh,9000)}
  applyTheme(TH);syncDock()}
const _route=route;
route=async function(){
  if(!v3On()||typeof AUTH==='undefined'||!AUTH||INTEST){if(!AUTH)document.body.classList.remove('v3on','v3old');return _route.apply(this,arguments)}
  boot();document.body.classList.add('v3on');
  const h=location.hash||'#/';
  if(lockHash!==null){if(h===lockHash)return;lockHash=null}
  if(!isNewHash(h)){toOld();return _route.apply(this,arguments)}
  toNew();
  if(!CAT||Date.now()-CATAT>30000){if(!CAT)main.innerHTML='<div class="card sk" style="height:220px;margin-top:8px"></div><div class="card sk" style="height:160px"></div><div class="card sk" style="height:200px"></div>';
    const ok=await loadCat(!!CAT);if(!ok){if(AUTH){toOld()}return}if(INTEST||!AUTH)return}
  if(NOTES===null)loadNotes().then(()=>{if(S.tab==='test')softRender()});
  const tab=tabOf(h),changed=tab!==S.tab||!main.children.length||main.querySelector('.sk');S.tab=tab;syncDock();if(changed)scrollTo(0,0);render(changed);
  if(goThen){const f=goThen;goThen=null;setTimeout(f,0)}};
if(typeof login==='function'){const _login=login;login=function(){document.body.classList.remove('v3on','v3old');return _login.apply(this,arguments)}}
if(typeof cdRefresh==='function'){const _cdr=cdRefresh;cdRefresh=function(){const r=_cdr.apply(this,arguments);if(booted&&document.body.classList.contains('v3on')&&!document.body.classList.contains('v3old')&&(S.tab==='home'||S.tab==='tools'))softRender();return r}}
window.v3Enable=function(){lsSet('cbt_v3',true);if(typeof AUTH==='undefined'||!AUTH)return;boot();document.body.classList.add('v3on');toNew();S.tab='';if(!isNewHash(location.hash||'#/'))location.hash='#/';else route();setTimeout(()=>toast3('Welcome to the new design. Switch back any time from the menu.'),600)};
window.v3Disable=function(){lsSet('cbt_v3',false);closeLayer();unwind(()=>{document.body.classList.remove('v3on','v3old');lockHash=null;try{typeof syncTheme==='function'&&syncTheme()}catch(e){}if(location.hash==='#/'||location.hash===''){_route()}else location.hash='#/';try{typeof toast==='function'&&toast('Classic design is back. Try the new one again from the menu.')}catch(e){}})};
/* already signed in and the new design chosen: take over the first screen */
if(v3On()&&typeof AUTH!=='undefined'&&AUTH&&!INTEST){boot();document.body.classList.add('v3on');if(!isNewHash(location.hash||'#/'))toOld();else route()}

/* ================= REVIEW REQUEST after a test (both designs) =================
   After every submitted test the student is asked to rate the test series: stars AND a short comment (at least 15
   letters) are needed to send. Closing once shows a gentle "just 20 seconds" note; closing again lets them go.
   Not asked again once they have written a review with a comment. Saved with cbt_review_save (v23), one review per
   series, which the student can change any time from the series page (Reviews). */
const RVMIN=15;
let rvHost=null;
function rvDark(){try{if(document.body.classList.contains('v3on')&&!document.body.classList.contains('v3old')&&host)return host.dataset.mode!=='light';return document.documentElement.dataset.theme==='dark'}catch(e){return false}}
const RVCSS=`:host{all:initial}*{box-sizing:border-box;margin:0;padding:0;font:inherit;color:inherit}
.w{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;font-family:Geist,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.bg{position:absolute;inset:0;background:rgba(10,10,12,.5);opacity:0;transition:opacity .35s ease}
.c{position:relative;width:100%;max-width:460px;background:var(--s);color:var(--tx);border-radius:28px 28px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom,0px));box-shadow:0 -20px 60px -20px rgba(0,0,0,.4);transform:translateY(105%);transition:transform .5s cubic-bezier(.2,.9,.25,1)}
.on .bg{opacity:1}.on .c{transform:none}
.x{position:absolute;top:14px;right:14px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--s2);border:0;cursor:pointer}
.x svg{width:18px;height:18px}
.ic{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--soft);color:var(--acc);margin-bottom:14px}
.ic svg{width:26px;height:26px}
h2{font-size:21px;font-weight:600;letter-spacing:-.02em;line-height:1.25;padding-right:40px}
p.s{margin-top:6px;font-size:14.5px;line-height:1.55;color:var(--mut)}
.st{display:flex;gap:8px;justify-content:center;margin:20px 0 6px}
.st button{width:48px;height:48px;border:0;background:none;cursor:pointer;color:var(--line2);transition:transform .25s cubic-bezier(.3,1.6,.5,1),color .2s}
.st button svg{width:44px;height:44px}.st button.on{color:#e3a72f}.st button:active{transform:scale(.85)}
.st button.pop{transform:scale(1.18)}
.lb{text-align:center;font-size:13.5px;font-weight:500;color:var(--mut);min-height:20px}
textarea{display:block;width:100%;margin-top:14px;min-height:104px;resize:none;border-radius:16px;border:1.5px solid var(--line);background:var(--s2);padding:13px 14px;font-size:15px;line-height:1.5;outline:none;transition:border-color .2s}
textarea:focus{border-color:var(--acc)}
.ft{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12.5px;color:var(--mut)}
.ft .ok{color:#2d8a5e;font-weight:600}
.go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;margin-top:16px;border:0;border-radius:16px;background:var(--ink);color:var(--on);font-size:16px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .2s}
.go:disabled{opacity:.35;cursor:default}.go:not(:disabled):active{transform:scale(.98)}
.ln{display:block;width:100%;margin-top:10px;height:44px;border:0;background:none;font-size:14.5px;font-weight:500;color:var(--mut);cursor:pointer}
.er{margin-top:10px;font-size:13.5px;color:#c0453e;text-align:center;min-height:0}
.ty{text-align:center;padding:18px 0 8px}.ty .ic{margin:0 auto 14px}.ty h2{padding:0}
@media (prefers-reduced-motion: reduce){.c,.bg{transition:none}}`;
const RVI={star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 2.3a.6.6 0 0 1 1 0l2.6 5.4 5.9.9a.6.6 0 0 1 .3 1l-4.3 4.2 1 5.9a.6.6 0 0 1-.8.6L12 17.6l-5.3 2.8a.6.6 0 0 1-.8-.6l1-5.9-4.3-4.2a.6.6 0 0 1 .3-1l5.9-.9z"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 5.6 5 5 0 0 1 21.2 11C19 15.6 12 20 12 20z"/></svg>'};
const RVW=['','Poor','Could be better','Good','Very good','Excellent'];
function rvClose(){if(!rvHost)return;const h=rvHost;rvHost=null;const w=h.shadowRoot.querySelector('.w');w.classList.remove('on');setTimeout(()=>h.remove(),RM?0:420)}
async function rvAsk(sid,title,manual){
  if(rvHost||!sid||typeof rpc!=='function')return;
  if(!manual&&document.body.classList.contains('intest'))return;
  let mine=null;try{const r=await rpc('cbt_review_mine',{p_series:sid});if(!r||!r.ok){if(manual&&typeof toast==='function')toast('Could not open reviews. Please try again.');return}mine=r.review}catch(e){return}
  if(!manual&&mine&&String(mine.body||'').trim().length>=RVMIN)return;
  if(rvHost||(!manual&&document.body.classList.contains('intest')))return;
  const d=rvDark(),T=d?{s:'#1e1f22',s2:'#27282c',tx:'#ededee',mut:'#a3a5aa',line:'#34353a',line2:'#45464c',ink:'#ededee',on:'#161719',acc:'#d6b878',soft:'#2c271d'}
    :{s:'#ffffff',s2:'#f3f3f1',tx:'#17181b',mut:'#5e6066',line:'#e2e2de',line2:'#d4d4cf',ink:'#1d1e22',on:'#ffffff',acc:'#85672c',soft:'#f4ecdc'};
  rvHost=document.createElement('div');rvHost.id='rvAsk';document.body.appendChild(rvHost);const R=rvHost.attachShadow({mode:'open'});
  let rating=mine?mine.rating:0,nudged=false;
  R.innerHTML=`<style>${RVCSS}:host{--s:${T.s};--s2:${T.s2};--tx:${T.tx};--mut:${T.mut};--line:${T.line};--line2:${T.line2};--ink:${T.ink};--on:${T.on};--acc:${T.acc};--soft:${T.soft}}</style>
   <div class="w" role="dialog" aria-modal="true" aria-labelledby="rvT"><div class="bg"></div><div class="c"><button class="x" aria-label="Close">${RVI.x}</button><div class="body"></div></div></div>`;
  const W=R.querySelector('.w'),B=R.querySelector('.body');
  const form=()=>{B.innerHTML=`<div class="ic">${RVI.star}</div><h2 id="rvT">${manual?'Your review':'How was your test?'}</h2>
    <p class="s">Rate <b>${esc3(title||'this test series')}</b>. Your words help other students choose, and help us make every test better.</p>
    <div class="st" role="radiogroup" aria-label="Your rating">${[1,2,3,4,5].map(n=>`<button role="radio" aria-checked="${rating===n}" aria-label="${n} star${n>1?'s':''}" data-n="${n}" class="${n<=rating?'on':''}">${RVI.star}</button>`).join('')}</div>
    <p class="lb">${rating?RVW[rating]:'Tap a star'}</p>
    <textarea maxlength="600" placeholder="What did you like? What can we do better? (at least ${RVMIN} letters)" aria-label="Your review">${esc3(mine&&mine.body||'')}</textarea>
    <div class="ft"><span class="hn"></span><span class="ct"></span></div>
    <button class="go" disabled>Submit review</button><p class="er" role="alert"></p>`;wire()};
  const sync=()=>{const ta=B.querySelector('textarea');if(!ta)return;const n=ta.value.trim().length,ok=rating&&n>=RVMIN;B.querySelector('.go').disabled=!ok;B.querySelector('.ct').textContent=ta.value.length+' / 600';
    const hn=B.querySelector('.hn');hn.className='hn'+(n>=RVMIN?' ok':'');hn.textContent=!rating?'Choose your stars':n>=RVMIN?'Ready to send':`${RVMIN-n} more letter${RVMIN-n===1?'':'s'} please`};
  const wire=()=>{B.querySelectorAll('.st button').forEach(b=>b.addEventListener('click',()=>{rating=+b.dataset.n;B.querySelectorAll('.st button').forEach(x=>{const on=+x.dataset.n<=rating;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(+x.dataset.n===rating))});
      b.classList.add('pop');setTimeout(()=>b.classList.remove('pop'),220);B.querySelector('.lb').textContent=RVW[rating];sync();const ta=B.querySelector('textarea');if(!ta.value.trim())ta.focus({preventScroll:true})}));
    B.querySelector('textarea').addEventListener('input',sync);B.querySelector('.go').addEventListener('click',send);sync()};
  const send=async()=>{const ta=B.querySelector('textarea'),go=B.querySelector('.go'),er=B.querySelector('.er'),body=ta.value.trim();if(!rating||body.length<RVMIN)return;
    go.disabled=true;go.textContent='Sending…';er.textContent='';let r=null;try{r=await rpc('cbt_review_save',{p_series:sid,p_rating:rating,p_body:body,p_photo:''})}catch(e){}
    if(!r||!r.ok){go.textContent='Submit review';sync();er.textContent=r&&r.error==='busy'?'Please wait a few seconds and try again.':r&&r.error==='not_unlocked'?'Reviews open once this series is unlocked for you.':'Could not send. Please check your internet and try again.';return}
    try{RV&&delete RV[(itemOfSeries(sid)||{}).id];XD=null}catch(e){}
    B.innerHTML=`<div class="ty"><div class="ic">${RVI.heart}</div><h2>Thank you!</h2><p class="s">${r.status==='pending'?'Your review will show after a quick check.':'Your review is live on the series page.'}</p></div>`;
    setTimeout(rvClose,1800);if(scrOpen()&&top()&&top().key==='sp')setTimeout(()=>{loadExtras();redraw()},400)};
  const nudge=()=>{nudged=true;B.innerHTML=`<div class="ty"><div class="ic">${RVI.heart}</div><h2 id="rvT">Just 20 seconds?</h2><p class="s">Two lines from you help hundreds of students pick the right test series, and tell us what to improve next.</p></div>
    <button class="go">Write my review</button><button class="ln">Not now</button>`;B.querySelector('.go').addEventListener('click',form);B.querySelector('.ln').addEventListener('click',rvClose)};
  R.querySelector('.x').addEventListener('click',()=>{const ta=B.querySelector('textarea');if(!manual&&!nudged&&!(ta&&ta.value.trim().length>=RVMIN))nudge();else rvClose()});
  R.querySelector('.bg').addEventListener('click',()=>{if(manual)rvClose()});
  form();requestAnimationFrame(()=>requestAnimationFrame(()=>W.classList.add('on')))}
/* after a test is submitted (result shown, or "result after …"): ask once the screen has settled */
(function(){if(typeof sendPending!=='function')return;let just=null;
  const _sp=sendPending;sendPending=function(it){try{const L=(typeof CAT!=='undefined'&&CAT)||null,t=L&&(L.tests||[]).find(x=>x.id===(it&&it.tid)),s=t&&(L.series||[]).find(x=>x.id===t.series_id);
    just=s&&s.unlocked?{sid:s.id,title:s.title,at:Date.now()}:null}catch(e){just=null}return _sp.apply(this,arguments)};
  const after=()=>{if(!just||Date.now()-just.at>120000)return;const j=just;just=null;setTimeout(()=>rvAsk(j.sid,j.title,false),1400)};
  ['showHeld','showResult'].forEach(n=>{const f=window[n];if(typeof f!=='function')return;window[n]=function(){const r=f.apply(this,arguments);try{after()}catch(e){}return r}})})();
})();
