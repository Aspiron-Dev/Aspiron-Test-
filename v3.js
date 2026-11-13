/* v3.js: the student app's design. It is the only design: there is no switch back to the older look.
   It draws every screen; sign-in, the catalog, the exam engine (timer, saving answers, submit) and the server
   calls are the engine files app1.js … app28.js, which it calls (cbt_catalog, openTest, openReview, the store page).
   It lives inside a Shadow DOM so its styles (v3.css) and the engine's own styles never affect each other. */
(function(){
'use strict';
if(window.__v3)return;window.__v3=1;
const V3VER=50;
const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
/* the new design is the only design now: the old cbt_v3=false choice is ignored. cbt_v3_ci is set only by the
   automated tests (tests/e2e), which still check the exam engine's own pages; no student can reach it. */
const v3On=()=>!lsGet('cbt_v3_ci',false);

/* ---------- host + shadow root ---------- */
let host=null,root=null,booted=false;
const gStyle=document.createElement('style');gStyle.id='v3g';
gStyle.textContent=`body.v3on:not(.v3old):not(.intest) .hdr,body.v3on:not(.v3old):not(.intest):not(.x3ins) #app,body.v3on:not(.v3old):not(.intest) #bnav,body.v3on:not(.v3old):not(.intest) .instbar{display:none!important}
body.v3on:not(.v3old):not(.intest){padding:0!important;background:var(--v3bg,#f5f5f3)!important}
body.intest #v3host,body:not(.v3on) #v3host{display:none!important}
:where(html.v3c) .btn{color:var(--onpri3,#fff)}
body.v3on #layer .modal .box{border-radius:24px;background:var(--surface);color:var(--tx);font-family:Geist,system-ui,sans-serif}
body.v3on #layer .modal .btn{border-radius:14px;min-height:46px;font-weight:600}
body.v3on #layer .modal h2,body.v3on #layer .modal h3{font-family:Geist,system-ui,sans-serif;letter-spacing:-.02em;font-weight:650}`;
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
const P={eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',folder:'<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/>',star:'<path d="M11.5 2.3a.6.6 0 0 1 1 0l2.6 5.4 5.9.9a.6.6 0 0 1 .3 1l-4.3 4.2 1 5.9a.6.6 0 0 1-.8.6L12 17.6l-5.3 2.8a.6.6 0 0 1-.8-.6l1-5.9-4.3-4.2a.6.6 0 0 1 .3-1l5.9-.9z"/>',
 home:'<path class="f" d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2h-4v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H5a2 2 0 0 1-2-2z"/>',
 tests:'<path class="f" d="M7 3h6.5L19 8.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v4a1.5 1.5 0 0 0 1.5 1.5H19"/><path d="m8.6 14.6 2.2 2.2 4.6-4.6"/>',
 tools:'<rect class="f" x="3.5" y="3.5" width="7" height="7" rx="2"/><rect class="f" x="13.5" y="3.5" width="7" height="7" rx="2"/><rect class="f" x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 13.8v6.4"/><path d="M13.8 17h6.4"/>',
 lib:'<rect class="f" x="3.5" y="4" width="4.6" height="16.5" rx="1.3"/><rect class="f" x="9.7" y="4" width="4.6" height="16.5" rx="1.3"/><rect class="f" x="16.2" y="4.6" width="4.6" height="16" rx="1.3" transform="rotate(-12 18.5 12.6)"/><path d="M5.8 8h0"/><path d="M12 8h0"/>',
 stats:'<rect class="f" x="3.5" y="12" width="4.6" height="8.5" rx="1.3"/><rect class="f" x="9.7" y="7" width="4.6" height="13.5" rx="1.3"/><rect class="f" x="15.9" y="3.5" width="4.6" height="17" rx="1.3"/>',
 menu:'<path d="M4.5 6.5h15"/><path d="M8 12h8"/><path d="M4.5 17.5h15"/>',
 wifiOff:'<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.3-1.7"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8A15 15 0 0 0 11 5"/><path d="m2 2 20 20"/>',bell:'<path d="M10.3 21a2 2 0 0 0 3.4 0"/><path d="M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3"/>',
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
  E:['Soft Sage Gray',{bg:'#f3f5f2',bg2:'#e7ebe5',s2:'#ecf0ea',ln:'#dde3da',tx:'#1c231d',mt:'#59645b',ink:'#283429',acc:'#4a6650',a1:'#c6d8c5',a2:'#7f9a80',onA:'#152016',as:'#e5ede5',h1:'#2c3a2f',h2:'#141b15',glow:'rgba(170,205,165,.3)',logo:'#283429',pill:'rgba(40,52,41,.08)'},'Gray with soft green, easy on the eyes'],
  F:['Ivory & Navy',{bg:'#f6f4ee',bg2:'#ebe7dc',s:'#fffdf8',s2:'#f0ece2',ln:'#e3ded1',tx:'#161b2a',mt:'#565d70',ink:'#1b2540',acc:'#2c4170',a1:'#c9d3ea',a2:'#7388b8',onA:'#101829',as:'#e8ebf3',h1:'#24304f',h2:'#111827',glow:'rgba(150,170,220,.32)',logo:'#1b2540',pill:'rgba(27,37,64,.08)',hdr:'rgba(246,244,238,.84)'},'Warm ivory paper with deep navy'],
  G:['Warm Sand',{bg:'#f7f3ec',bg2:'#ece5d8',s:'#fffdf9',s2:'#f1eadd',ln:'#e5dccb',tx:'#221b14',mt:'#655a4c',ink:'#33281d',acc:'#8a4f2a',a1:'#ecc9a8',a2:'#bd7a4a',onA:'#22140a',as:'#f5e8da',h1:'#3a2d21',h2:'#19130d',glow:'rgba(225,160,110,.32)',logo:'#33281d',pill:'rgba(51,40,29,.08)',hdr:'rgba(247,243,236,.84)'},'Soft sand with warm copper'],
  H:['Pearl & Emerald',{bg:'#f5f6f3',bg2:'#e9ece6',s:'#ffffff',s2:'#eef1ec',ln:'#dfe4dc',tx:'#17201b',mt:'#56635b',ink:'#17352a',acc:'#1f6b4c',a1:'#bfe0cf',a2:'#4f9a78',onA:'#0c1f16',as:'#e3f1ea',h1:'#1f3d31',h2:'#0f1d17',glow:'rgba(120,200,160,.3)',logo:'#17352a',pill:'rgba(23,53,42,.08)',hdr:'rgba(245,246,243,.84)'},'Pearl white with deep emerald'],
  I:['Lavender Mist',{bg:'#f5f4f8',bg2:'#e9e7f0',s:'#ffffff',s2:'#efedf5',ln:'#e0dde9',tx:'#1c1a26',mt:'#5c5870',ink:'#2c2845',acc:'#5a4a9a',a1:'#d6cff0',a2:'#8f80c8',onA:'#161226',as:'#ebe7f6',h1:'#322d52',h2:'#16142a',glow:'rgba(160,145,225,.3)',logo:'#2c2845',pill:'rgba(44,40,69,.08)',hdr:'rgba(245,244,248,.84)'},'Soft gray with calm violet']}},
 dark:{name:'Dark',pals:{
  A:['Graphite Gray',{},'Graphite with muted gold'],
  B:['Black & White Dark',{bg:'#121212',bg2:'#0b0b0b',s:'#1a1a1a',s2:'#242424',ln:'#2e2e2e',tx:'#f5f5f5',mt:'#a8a8a8',ink:'#f5f5f5',on:'#121212',acc:'#f5f5f5',a1:'#ffffff',a2:'#bdbdbd',onA:'#111111',as:'#262626',h1:'#2a2a2a',h2:'#141414',glow:'rgba(255,255,255,.08)'},'Dark gray and white, no colour'],
  C:['Midnight Gray',{bg:'#13151b',bg2:'#0c0d11',s:'#1a1d25',s2:'#232732',ln:'#2c313e',tx:'#e8eaf0',mt:'#9ca2b0',ink:'#e8eaf0',on:'#13151b',acc:'#aab5d2',a1:'#d3dbef',a2:'#7e8bb0',onA:'#10131b',as:'#222738',h1:'#2a2f3e',h2:'#14171f',glow:'rgba(150,170,220,.2)',nav:'rgba(26,29,37,.86)',hdr:'rgba(19,21,27,.82)'},'Deep gray with night blue'],
  D:['Blue Gray Dark',{bg:'#151a21',bg2:'#0e1217',s:'#1c222b',s2:'#252d38',ln:'#2f3844',tx:'#e6ebf1',mt:'#9ca8b7',ink:'#e6ebf1',on:'#151a21',acc:'#93afd2',a1:'#c2d5ec',a2:'#6789b3',onA:'#0f141b',as:'#1f2a38',h1:'#2b3646',h2:'#151a22',glow:'rgba(120,160,215,.22)',nav:'rgba(28,34,43,.86)',hdr:'rgba(21,26,33,.82)'},'Slate gray with soft blue'],
  E:['Silver Dark',{bg:'#19191b',bg2:'#111113',s:'#222326',s2:'#2c2d31',ln:'#37383c',tx:'#f0f0f2',mt:'#b0b2b8',ink:'#e2e4e8',on:'#19191b',acc:'#c9cdd4',a1:'#eef0f3',a2:'#9ba1aa',onA:'#151618',as:'#2c2d31',h1:'#333438',h2:'#1b1c1e',glow:'rgba(220,225,235,.14)'},'Lighter graphite with silver'],
  F:['Espresso & Copper',{bg:'#1a1614',bg2:'#110e0d',s:'#231e1b',s2:'#2d2723',ln:'#3a322d',tx:'#f1ebe6',mt:'#b0a59c',ink:'#f1ebe6',on:'#1a1614',acc:'#dc9f75',a1:'#f0c4a2',a2:'#bd7748',onA:'#1c1008',as:'#33261d',h1:'#332a24',h2:'#1b1613',glow:'rgba(220,150,100,.22)',nav:'rgba(35,30,27,.86)',hdr:'rgba(26,22,20,.82)'},'Warm dark brown with copper'],
  G:['Deep Teal',{bg:'#121a1b',bg2:'#0b1112',s:'#192324',s2:'#222e30',ln:'#2c3a3c',tx:'#e6eeee',mt:'#9bacad',ink:'#e6eeee',on:'#121a1b',acc:'#7fc6c2',a1:'#b4e0dc',a2:'#4f9a96',onA:'#081514',as:'#1c2f30',h1:'#26383a',h2:'#131c1d',glow:'rgba(110,190,185,.2)',nav:'rgba(25,35,36,.86)',hdr:'rgba(18,26,27,.82)'},'Dark slate with calm teal'],
  H:['Midnight Gold',{bg:'#10141c',bg2:'#0a0d13',s:'#171c27',s2:'#202735',ln:'#2a3242',tx:'#eceef3',mt:'#a0a8b8',ink:'#eceef3',on:'#10141c',acc:'#dcb96a',a1:'#f0d9a0',a2:'#b98f3f',onA:'#1a1305',as:'#2a2618',h1:'#232c40',h2:'#11151e',glow:'rgba(220,185,105,.2)',nav:'rgba(23,28,39,.86)',hdr:'rgba(16,20,28,.82)'},'Deep navy with gold'],
  I:['Charcoal & Wine',{bg:'#181516',bg2:'#100e0f',s:'#211d1f',s2:'#2b2628',ln:'#383133',tx:'#f1eaec',mt:'#b1a4a8',ink:'#f1eaec',on:'#181516',acc:'#d98a9c',a1:'#f0bcc8',a2:'#b05a70',onA:'#1c0a10',as:'#33202a',h1:'#3a2530',h2:'#1a1316',glow:'rgba(215,130,155,.2)',nav:'rgba(33,29,31,.86)',hdr:'rgba(24,21,22,.82)'},'Charcoal with deep wine red']}},
 black:{name:'Black',pals:{
  A:['Pure AMOLED',{},'True black, saves battery on OLED'],
  B:['Black & Gold',{acc:'#d8b46e',a1:'#f0d9a4',a2:'#b88d43',onA:'#140f05',as:'#1f1a0f',ink:'#f1e3c2',h1:'#1d180c',h2:'#050403',glow:'rgba(216,180,110,.28)',logo:'#f3e6c8',pill:'rgba(216,180,110,.14)'},'Black with Aspiron gold'],
  C:['Black & Silver',{acc:'#c9cdd3',a1:'#f4f5f7',a2:'#9da3ab',h1:'#1a1b1d',h2:'#040404',glow:'rgba(220,225,232,.14)'},'Black with cool silver'],
  D:['Black & Emerald',{acc:'#6cc09c',a1:'#a8dcc4',a2:'#3f9373',onA:'#04140d',as:'#0f1d17',h1:'#11201a',h2:'#020403',glow:'rgba(95,190,150,.22)',pill:'rgba(108,192,156,.12)'},'Black with deep muted green'],
  E:['Black & Graphite',{s:'#121213',s2:'#1c1c1e',ln:'#2a2a2c',acc:'#a6a6aa',a1:'#d7d7da',a2:'#7c7c80',h1:'#222224',h2:'#0b0b0c',glow:'rgba(255,255,255,.07)'},'Black with graphite cards'],
  F:['Black & Rose Gold',{acc:'#e0a899',a1:'#f3cfc4',a2:'#b9796a',onA:'#180a07',as:'#1f1512',ink:'#f5e3dd',h1:'#1f1512',h2:'#050303',glow:'rgba(224,168,153,.24)',logo:'#f5e3dd',pill:'rgba(224,168,153,.13)'},'Black with soft rose gold'],
  G:['Black & Sapphire',{acc:'#8fb2ea',a1:'#c3d6f5',a2:'#5b82c4',onA:'#060d18',as:'#101826',h1:'#111a2a',h2:'#030508',glow:'rgba(120,160,230,.22)',pill:'rgba(143,178,234,.12)'},'Black with deep sapphire blue'],
  H:['Black & Platinum',{acc:'#dfe3e8',a1:'#ffffff',a2:'#aeb5be',onA:'#07090b',as:'#15171a',h1:'#1c1e21',h2:'#040405',glow:'rgba(225,230,238,.16)',pill:'rgba(223,227,232,.12)'},'Black with cool platinum'],
  I:['Black & Amber',{acc:'#f0a850',a1:'#f8cf96',a2:'#c97f25',onA:'#1a0e02',as:'#1f1608',ink:'#f6e6cf',h1:'#20170a',h2:'#050402',glow:'rgba(240,168,80,.24)',logo:'#f6e6cf',pill:'rgba(240,168,80,.13)'},'Black with warm amber']}}
};
const CHL={light:['#3f72b8','#c4692e'],dark:['#4f86cc','#c97042']}; /* validated with the dataviz palette checker */

const MQ=matchMedia('(prefers-color-scheme: dark)');
const clone=o=>JSON.parse(JSON.stringify(o));
const oldMode=lsGet('cbt_theme',null);
const DEF_TH={mode:oldMode==='light'?'light':oldMode==='oled'?'black':oldMode==='dark'?'dark':'system',pal:{light:'A',dark:'A',black:'A'}};
let TH=clone(DEF_TH),THP=null;
{const v=lsGet('cbt_v3_theme',null);if(v&&(v.mode==='system'||THEMES[v.mode]))TH={mode:v.mode,pal:Object.assign({},DEF_TH.pal,v.pal)}}
const resolveMode=m=>m==='system'?(MQ.matches?'dark':'light'):m;
const tokens=(mode,pal)=>Object.assign({},TBASE[mode],(THEMES[mode].pals[pal]||THEMES[mode].pals.A)[1]);
function applyTheme(t,quick){if(!host)return;const mode=resolveMode(t.mode),pal=THEMES[mode].pals[t.pal[mode]]?t.pal[mode]:'A',tk=tokens(mode,pal);
  for(const k in TK)host.style.setProperty(TK[k],tk[k]);
  CHL[mode==='light'?'light':'dark'].forEach((c,i)=>host.style.setProperty('--c'+(i+1),c));
  host.dataset.mode=mode;host.dataset.pal=pal;document.body.style.setProperty('--v3bg',tk.bg);
  /* the few classic pieces still in use (exam engine, its pop-ups) take the same colours: no old blue anywhere */
  if(quick){clearTimeout(docT);docT=setTimeout(()=>applyDoc(t),900)}else applyDoc(t)
  if(!document.body.classList.contains('v3old')){const m=document.querySelector('meta[name="theme-color"]');m&&m.setAttribute('content',tk.bg)}}
/* the engine's own pages (exam, its pop-ups) read these on <html>; changing them restyles the whole document */
let docT=0;
function applyDoc(t){const mode=resolveMode(t.mode),pal=THEMES[mode].pals[t.pal[mode]]?t.pal[mode]:'A',tk=tokens(mode,pal);
  try{const H=document.documentElement,cv={'--bg':tk.bg,'--surface':tk.s,'--surface2':tk.s2,'--bd':tk.ln,'--hair':tk.ln,'--tx':tk.tx,'--mut':tk.mt,'--pri':tk.acc,'--pri2':tk.a2,'--priSoft':tk.as,'--grad':`linear-gradient(180deg,${tk.ink},${tk.ink})`,'--glow':'rgba(0,0,0,.16)','--onpri3':tk.on,'--nav':tk.nav};
    for(const k in cv)H.style.setProperty(k,cv[k]);H.dataset.theme=mode==='light'?'light':'dark';if(mode==='black')H.dataset.oled='1';else delete H.dataset.oled;H.classList.add('v3c')}catch(e){}}
const saveTheme=()=>lsSet('cbt_v3_theme',TH);
MQ.addEventListener&&MQ.addEventListener('change',()=>{if((THP||TH).mode==='system')applyTheme(THP||TH)});
const themeLabel=()=>{const m=resolveMode(TH.mode);return `${TH.mode==='system'?'System, ':''}${THEMES[m].name}, ${THEMES[m].pals[TH.pal[m]||'A'][0]}`};

/* ---------- toast, sheets, drawer ---------- */
let tT=null,tMsg='';
function toast3(m){const t=$('#toast');if(m===tMsg&&t.classList.contains('on')){clearTimeout(tT)}else{t.textContent=m;tMsg=m;t.classList.remove('on');void t.offsetWidth;t.classList.add('on')}tT=setTimeout(()=>{t.classList.remove('on');tMsg=''},2300)}
let layer=null,lastF=null,sheet,drawer,scrim;
/* the phone's Back button closes an open sheet or the menu first (not the page behind it): opening one adds a history
   entry; closing it by a tap or a swipe goes back over that entry, and the popstate it causes is ignored. Moves that
   change the address wait until that step back is done (settled), so it can never undo them. */
let layH=false,popIgnore=0,settleQ=[],settleT=0;
function flushSettle(){popIgnore=0;clearTimeout(settleT);const q=settleQ;settleQ=[];q.forEach(f=>{try{f()}catch(e){console.error(e)}})}
function settled(fn){if(!popIgnore){fn();return}settleQ.push(fn)}
function openLayer(el){if(!layer&&!layH){try{history.pushState({v3l:1},'',location.href);layH=true}catch(e){}}if(layer&&layer!==el)layer.classList.remove('open');$('#app3').classList.add('lay');lastF=root.activeElement;layer=el;scrim.classList.add('open');el.classList.add('open');setTimeout(()=>{const f=el.querySelector('button,input');f&&f.focus({preventScroll:true})},80)}
function closeLayer(fromBack){if(!layer)return;$('#app3').classList.remove('lay');layer.classList.remove('open');scrim.classList.remove('open');layer=null;sheet.onclick=null;lastF&&lastF.focus&&lastF.focus({preventScroll:true});
  if(layH){layH=false;if(fromBack!==true){popIgnore++;clearTimeout(settleT);settleT=setTimeout(flushSettle,700);try{history.back()}catch(e){flushSettle()}}}}
function openSheet(h){sheet.onclick=null;sheet.innerHTML='<div class="grab"></div>'+h;sheet.scrollTop=0;openLayer(sheet)}

/* ---------- full-screen pages; the phone's back button closes them ---------- */
let STK=[],scr,undT=0;
const top=()=>STK[STK.length-1],scrOpen=()=>STK.length>0;
function drawScr(dir){const v=top();if(!v)return;$('#scrT').textContent=v.t;$('#scrS').textContent=v.s||'';$('#scrR').innerHTML=v.right?v.right():'';
  $('#scrB').innerHTML=`<div class="scr-in${dir?' '+dir:''}">${v.html()}</div>`;v.after&&v.after()}
function push(v){if(popIgnore){settled(()=>push(v));return}const was=STK.length>0;STK.push(v);try{history.pushState({v3s:STK.length},'',location.href)}catch(e){}
  drawScr(!RM?'fwd':'');try{pstSync()}catch(e){}$('#scrB').scrollTop=0;if(!scr.classList.contains('open')){scr.classList.add('open');scr.setAttribute('aria-hidden','false');clearTimeout(undT);undT=setTimeout(()=>{if(STK.length)$('#app3').classList.add('under')},260)}setTimeout(()=>$('#scrBack').focus({preventScroll:true}),60)}
function pop(){const v=STK.pop();v&&v.leave&&v.leave();if(STK.length){drawScr(RM?'':'bwd')}else{clearTimeout(undT);$('#app3').classList.remove('under');scr.classList.remove('open');scr.setAttribute('aria-hidden','true');$('#scrB').innerHTML='';try{pstSync()}catch(e){}}}
function back(){if(!STK.length)return;history.back()}
/* close every page first, wait for the browser history to settle, then run cb (so a hash change is never undone) */
let afterUnwind=null;
function unwind(cb){if(popIgnore){settled(()=>unwind(cb));return}if(!STK.length){cb();return}const n=STK.length;while(STK.length)pop();afterUnwind=cb;try{history.go(-n)}catch(e){const f=afterUnwind;afterUnwind=null;f()}}
addEventListener('popstate',()=>{if(popIgnore){if(!--popIgnore)flushSettle();return}if(layer){closeLayer(true);return}if(afterUnwind){const f=afterUnwind;afterUnwind=null;setTimeout(f,0);return}if(STK.length)pop()});
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
function toNew(){document.body.classList.remove('v3old','x3ins');if(!INTEST){const ins=document.querySelector('#app .ins');if(ins)ins.remove()}lockHash=null;host&&host.removeAttribute('data-view');const m=document.querySelector('meta[name="theme-color"]');m&&m.setAttribute('content',getComputedStyle(host).getPropertyValue('--bg').trim()||'#f5f5f3')}
/* go to a classic page by its address (#/qb, #/m, #/s/<id> …) */
function oldHash(h){closeLayer();unwind(()=>{toOld();if(location.hash===h)_route();else location.hash=h})}
/* run a classic function that draws straight into the page (openReview …) */
function oldRun(fn){closeLayer();unwind(()=>{toOld();lockHash=location.hash||'#/';try{fn()}catch(e){toNew();toast3('Could not open this. Please try again.')}})}
/* a classic pop-up (modal) over the new design: nothing to switch */
function oldModal(fn){closeLayer();try{fn()}catch(e){toast3('Could not open this. Please try again.')}}
/* the catalog could not load (no internet): say so in the new look, with Try again */
function netErr3(){if(!main)return;toNew();try{S.tab=tabOf(location.hash);main.dataset.tab=S.tab;syncDock()}catch(e){}main.innerHTML=`<div class="card empty net3"><span class="ti">${ic('wifiOff',26)}</span><b>You are offline</b><p>${navigator.onLine===false?'No internet connection. Check your data or Wi-Fi and try again.':'Could not reach Aspiron. Please try again in a moment.'}</p><button class="btn" data-a="retryNet">Try again</button></div>`}
A.retryNet=()=>{main.innerHTML='<div class="card sk" style="height:220px;margin-top:8px"></div>';route()};
addEventListener('online',()=>{if(main&&main.querySelector('.net3'))route()});
A.backNew=()=>{const t=S.tab||'home',h=t==='home'?'#/':'#/x/'+t;toNew();if(location.hash!==h)location.hash=h;else render(true)};

/* ---------- state, dock, render ---------- */
const S={tab:'home'};
const NAV=[['home','Home','home'],['test','Tests','tests'],['tools','Tools','tools'],['lib','Library','lib'],['stats','Analytics','stats']];
const VIEW={},AFTER={};
let main,dock;
const tabOf=h=>{const m=/^#\/x\/(test|tools|lib|stats)$/.exec(h||'');return m?m[1]:'home'};
const isNewHash=h=>!h||h==='#'||h==='#/'||/^#\/x\/(test|tools|lib|stats)$/.test(h);
/* ---------- social media links (Admin → Social media; config.js): menu, desktop footer, Contact sheet. "" when none is On ---------- */
const socH=()=>{try{return typeof socialLinksHTML==='function'?socialLinksHTML():''}catch(e){return ''}};
function socSync(){const e=$('#dfSoc');if(!e)return;const h=socH();if(e.innerHTML!==h)e.innerHTML=h;e.hidden=!h}
document.addEventListener('social:change',()=>{try{socSync()}catch(e){}});
/* ---------- desktop website parts (shown from 1024 px wide; phones never see them) ---------- */
const DNAV=[['home','Home'],['test','Test Series'],['tools','Tools'],['lib','Library'],['stats','Analytics']];
function deskSync(){const n=$('#dnav');if(!n)return;
  if(!n.firstChild){n.innerHTML=DNAV.map(([k,l])=>`<button data-a="tab" data-tab="${k}">${l}</button>`).join('');const th=$('#dth');if(th)th.innerHTML=ic('sun',19);
    const f=$('#dfoot');if(f)f.innerHTML=`<div class="df-in"><div class="df-b"><span class="bmk" aria-hidden="true"><i class="bmk-w"><i class="bmk-s"></i></i><span class="bmk-e"><span>EDUCATION</span></span></span><p>NEET and JEE test series with the real exam pattern, All-India rank and detailed analysis.</p><div class="df-soc" id="dfSoc" aria-label="Follow us" hidden></div></div>
     <div class="df-c"><b>Study</b><button data-a="tab" data-tab="test">Test series</button><button data-a="dk" data-k="pyq">PYQ Analyzer</button><button data-a="dk" data-k="qb">Question bank</button><button data-a="dk" data-k="gen">Test generator</button></div>
     <div class="df-c"><b>Your progress</b><button data-a="dk" data-k="ranks">Ranks</button><button data-a="dk" data-k="hist">Test history</button><button data-a="dk" data-k="mk">Mistake notebook</button><button data-a="dk" data-k="trk">Study tracker</button></div>
     <div class="df-c"><b>Help</b><button data-a="setHelp">Contact us</button><button data-a="setAbout">About us</button><button data-a="setTerms">Terms</button><a href="privacy" target="_blank" rel="noopener">Privacy</a><a href="refund" target="_blank" rel="noopener">Refund</a></div></div>
     <div class="df-bot"><span>© ${new Date().getFullYear()} Aspiron Education. All rights reserved.</span><nav><a href="privacy" target="_blank" rel="noopener">Privacy Policy</a><a href="terms" target="_blank" rel="noopener">Terms &amp; Conditions</a><a href="refund" target="_blank" rel="noopener">Refund Policy</a><a href="store">Store</a></nav></div>`}
  n.querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===S.tab;b.classList.toggle('on',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')});
  const d=$('#dav');if(d){const h=avatar('dav-i');if(d.innerHTML!==h)d.innerHTML=h}
  socSync()}
/* the profile picture in the top bar: a small menu (profile, settings, sign out); the theme has its own button */
const dmClose=()=>{const m=$('#dmenu');if(m)m.classList.remove('open');const d=$('#dav');if(d)d.setAttribute('aria-expanded','false')};
A.davM=()=>{const m=$('#dmenu');if(!m)return;if(m.classList.contains('open')){dmClose();return}
  m.innerHTML=`<div class="dm-h">${avatar('dm-av')}<span><b>${esc3(stuName())}</b><small>${esc3(stuMeta())}</small></span></div>
   <button role="menuitem" data-a="dmGo" data-k="profile">${ic('user',18)}Edit profile</button><button role="menuitem" data-a="dmGo" data-k="settings">${ic('gear',18)}Settings</button>
   <button role="menuitem" class="dm-out" data-a="dmGo" data-k="out">${ic('out',18)}Logout</button>`;
  m.classList.add('open');$('#dav').setAttribute('aria-expanded','true');
  setTimeout(()=>{const off=e=>{if(!e.composedPath().includes(m)&&!e.composedPath().includes($('#dav'))){dmClose();document.removeEventListener('pointerdown',off,true)}};document.addEventListener('pointerdown',off,true)},0)};
A.dmGo=el=>{dmClose();({profile:A.profile,settings:A.settings,out:A.setOut}[el.dataset.k]||(()=>{}))()};
A.theme3=()=>{dmClose();openTheme()};
addEventListener('keydown',e=>{if(e.key==='Escape')dmClose()});
A.dk=el=>({pyq:()=>openPyq(),qb:()=>openQB(),gen:()=>openGen(),ranks:()=>openRanks(),hist:()=>A.hist(),mk:()=>openMistakes(),trk:()=>openTracker()}[el.dataset.k]||(()=>{}))();
/* ================= QUICK SEARCH (Ctrl/⌘ K or "/"): jump to any page, tool, test series or test ================= */
const CK={el:null,i:0,L:[]};
function ckAll(){const L=[];NAV.forEach(n=>L.push([n[1],'Page',n[2],()=>go(n[0])]));
  [['PYQ Analyzer','pyq',()=>openPyq()],['Question bank','qb',()=>openQB()],['Test generator','spark',()=>openGen()],['Ranks and leaderboards','trophy',()=>openRanks()],['Test history','hist',()=>A.hist()],['Mistake notebook','pen',()=>openMistakes()],['Saved questions','bookmark',()=>openSaved()],['Study tracker','cal',()=>openTracker()],['Notes and PDFs','file',()=>openNotes()],['Notifications','mega',()=>A.bell()],['Refer and earn','gift',()=>openRefer()],['My profile','user',()=>A.profile()],['My test series','layers',()=>A.mySeries()],['Settings','gear',()=>A.settings()],['Theme and colours','sun',()=>openTheme()],['Help and contact','mail',()=>A.setHelp()]].forEach(x=>L.push([x[0],'Page',x[1],x[2]]));
  Object.keys(TOOLS).forEach(k=>TOOLS[k].forEach(t=>L.push([t[2],'Tool',t[1],()=>A.tool({dataset:{k:t[0]}})])));
  try{(C().series||[]).forEach(x=>L.push([x.title,'Test series','layers',()=>openSeriesAny(x.id,'t')]));(C().tests||[]).forEach(t=>L.push([t.title,(sOf(t.series_id)||{}).title||'Test','tests',()=>A.test({dataset:{id:t.id}})]))}catch(e){}
  return L}
function ckDraw(){const q=CK.el.querySelector('input').value.trim().toLowerCase().split(/\s+/).filter(Boolean),all=ckAll();
  CK.L=(q.length?all.filter(x=>q.every(w=>(x[0]+' '+x[1]).toLowerCase().includes(w))):all.slice(0,9)).slice(0,9);CK.i=Math.min(CK.i,Math.max(0,CK.L.length-1));
  CK.el.querySelector('.qs-l').innerHTML=CK.L.length?CK.L.map((x,i)=>`<button role="option" aria-selected="${i===CK.i}" class="${i===CK.i?'on':''}" data-i="${i}"><span class="ti">${ic(x[2],18)}</span><b>${esc3(x[0])}</b><small>${esc3(x[1])}</small></button>`).join(''):'<p class="qs-0">Nothing matches. Try a test name, a tool or a page.</p>'}
function ckClose(){const el=CK.el;if(!el)return;CK.el=null;el.classList.remove('open');setTimeout(()=>el.remove(),RM?0:220)}
function ckRun(i){const x=CK.L[i];if(!x)return;ckClose();try{x[3]()}catch(e){toast3('Could not open this. Please try again.')}}
A.ck=()=>{if(CK.el||!booted||INTEST)return;closeLayer();const el=document.createElement('div');el.className='qs';
  el.innerHTML=`<div class="qs-box" role="dialog" aria-modal="true" aria-label="Search"><label class="qs-in">${ic('search',19)}<input type="search" placeholder="Search pages, tools, series and tests" autocomplete="off" spellcheck="false" aria-label="Search"><kbd>Esc</kbd></label><div class="qs-l" role="listbox"></div><p class="qs-h"><kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>Enter</kbd> to open</p></div>`;
  CK.el=el;CK.i=0;$('#app3').appendChild(el);ckDraw();requestAnimationFrame(()=>el.classList.add('open'));const inp=el.querySelector('input');setTimeout(()=>inp.focus(),30);
  inp.addEventListener('input',()=>{CK.i=0;ckDraw()});
  el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();ckClose()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=CK.L.length;if(n){CK.i=(CK.i+(e.key==='ArrowDown'?1:n-1))%n;ckDraw();const o=el.querySelector('.on');o&&o.scrollIntoView({block:'nearest'})}}else if(e.key==='Enter'){e.preventDefault();ckRun(CK.i)}});
  el.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)ckRun(+b.dataset.i);else if(!e.target.closest('.qs-box'))ckClose()})};
addEventListener('keydown',e=>{if(!booted||INTEST||!document.body.classList.contains('v3on')||document.body.classList.contains('x3ins'))return;
  const typing=()=>{const a=(root&&root.activeElement)||document.activeElement;return !!a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)||!!(a&&a.isContentEditable)};
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();CK.el?ckClose():A.ck()}else if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!typing()&&!document.querySelector('#layer .modal')){e.preventDefault();A.ck()}});
function syncDock(){try{deskSync()}catch(e){}dock.style.setProperty('--i',NAV.findIndex(n=>n[0]===S.tab));dock.querySelectorAll('button').forEach(b=>{const on=b.dataset.tab===S.tab;b.classList.toggle('on',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')})}
let timers=[];
const every=(fn,ms)=>{const t=setInterval(fn,ms);timers.push(t);return t};
function render(anim){timers.forEach(clearInterval);timers=[];main.dataset.tab=S.tab;try{main.innerHTML=VIEW[S.tab]()}catch(e){console.error(e);main.innerHTML=`<div class="card empty"><b>Something went wrong</b><p>Please pull down to refresh, or tell us from Help.</p></div>`}
  main.classList.remove('in','swl','swr');if(swGhost){const g=swGhost;swGhost=null;main.style.transition='';main.style.transform='';dock&&dock.classList.remove('swp');requestAnimationFrame(()=>g.remove())}else if(anim&&!RM){void main.offsetWidth;main.classList.add(SWD==='l'?'swl':SWD==='r'?'swr':'in')}SWD='';try{AFTER[S.tab]&&AFTER[S.tab]()}catch(e){console.error(e)}try{pstSync(true)}catch(e){}countUp(main);reveal(main)}
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
  <nav class="dnav" id="dnav" aria-label="Main"></nav>
  <button class="ib dsr" data-a="ck" aria-label="Search (Ctrl K)" id="dsr"></button>
  <button class="ib" data-a="bell" aria-label="Notifications" id="bell"></button>
  <button class="ib dth" data-a="theme3" aria-label="Theme and colours" id="dth"></button>
  <button class="dav" data-a="davM" aria-label="Your profile" aria-haspopup="menu" id="dav"></button>
  <div class="dmenu" id="dmenu" role="menu"></div></div></header>
 <main class="main" id="main"></main>
 <footer class="dfoot" id="dfoot"></footer>
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
/* study zone: one calm tone for every tile, two-tone line icons */
Object.assign(P,{
 zSer:'<rect class="d" x="4" y="6" width="13" height="15" rx="2.5"/><rect x="4" y="6" width="13" height="15" rx="2.5"/><path d="M8 2.8h9.5A2.5 2.5 0 0 1 20 5.3V17"/><path d="M7.8 11h5.4M7.8 15h3.6"/>',
 zQb:'<rect class="d" x="3" y="3" width="18" height="18" rx="5"/><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5"/><path d="M12 16.8h.01"/>',
 zPyq:'<path class="d" d="M6.5 2.8H14l5 5v12.4H6.5a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2z"/><path d="M19 11V7.8l-5-5H6.5a2 2 0 0 0-2 2v13.4a2 2 0 0 0 2 2H10"/><path d="M14 2.8v5h5"/><circle cx="15.5" cy="16" r="3"/><path d="m17.7 18.2 2.5 2.5"/>',
 zGen:'<path d="m3.5 20.5 10-10"/><path d="m12 9 3 3"/><path class="d" d="m17.5 2.5 1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/><path d="m17.5 2.5 1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/><path d="M6.5 3.5v3M5 5h3"/>',
 zNote:'<path class="d" d="M6 2.8h9l4 4v13.4H6a1.5 1.5 0 0 1-1.5-1.5V4.3A1.5 1.5 0 0 1 6 2.8z"/><path d="M15 2.8H6a1.5 1.5 0 0 0-1.5 1.5v14.4A1.5 1.5 0 0 0 6 20.2h11.5a1.5 1.5 0 0 0 1.5-1.5V6.8z"/><path d="M15 2.8v4h4"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
 zMk:'<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
 zBm:'<path class="d" d="M6.5 3h11a1 1 0 0 1 1 1v17l-6.5-4.2L5.5 21V4a1 1 0 0 1 1-1z"/><path d="M6.5 3h11a1 1 0 0 1 1 1v17l-6.5-4.2L5.5 21V4a1 1 0 0 1 1-1z"/>',
 zRes:'<path class="d" d="M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.8a2 2 0 0 0 0 4H7.2M17 5.5h2.2a2 2 0 0 1 0 4h-2.4"/><path d="M12 14v3.5M8 21h8M9.5 21l.6-3.5h3.8l.6 3.5"/>'});
const ZONE=[['series','zSer','My Test Series'],['qb','zQb','Question Bank'],['pyq','zPyq','PYQ Analyzer'],['gen','zGen','Test Generator'],['dl','zNote','Notes & PDFs'],['mk','zMk','Mistakes'],['bm','zBm','Saved'],['hist','zRes','Results']];
function zone(){return `<section class="sec"><div class="sh"><h2>My study zone</h2></div><div class="card qgrid zgrid">
  ${ZONE.map((z,i)=>`<button class="qi zi" data-a="zone" data-k="${z[0]}" style="--zd:${i*35}ms"><span class="zt">${ic(z[1],24)}</span><span class="zl">${z[2]}</span></button>`).join('')}</div></section>`}
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
A.zone=el=>{const k=el.dataset.k;({study:()=>go('lib'),series:()=>A.mySeries(),dl:()=>openNotes(),hist:()=>A.hist(),mk:()=>openMistakes(),bm:()=>openSaved(),qb:()=>openQB(),pyq:()=>openPyq(),gen:()=>openGen()}[k]||(()=>{}))()};
A.test=el=>{const t=tOf(el.dataset.id);if(!t)return;if(t.locked){lockedSheet(t);return}oldRun(()=>openTest(t.id))};
/* a locked test: what it is part of, and the way to unlock it (the series page with its price and Buy) */
function lockedSheet(t){const s=sOf(t.series_id)||{},x=itemOfSeries(t.series_id),n=testsOf(t.series_id).length;
  openSheet(`<div class="lk3"><span class="lk3i">${ic('lock',26)}</span><h2 id="sheetT">This test is locked</h2>
   <p class="sub">“${esc3(t.title)}” is part of <b>${esc3(s.title||'a premium series')}</b>${n?`, ${n} test${n>1?'s':''} with All-India rank`:''}.</p>
   ${x?`<div class="lk3p">${priceH(x)}</div>`:''}<p class="hint">Every test, result and rank opens right after your payment is approved.</p></div>
   <div class="sheet-ft">${x?`<button class="btn ghost" data-a="xp" data-id="${esc3(x.id)}">See the series</button><a class="btn gold" href="${buyHref(x)}">${x.price?'Unlock now':'Get it free'}</a>`:'<button class="btn" data-a="close">Close</button>'}</div>`)}

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
A.oldTracker=()=>openTracker();

/* ---------- notifications (the classic notices) ---------- */
function syncBell(){const b=$('#bell');if(!b)return;const u=unread();b.innerHTML=ic('bell',20)+`<span class="dot${u?'':' off'}">${u?(u>9?'9+':u):''}</span>`;b.setAttribute('aria-label',u?`Notifications, ${u} unread`:'Notifications')}
const grpOf=t=>{const k=Math.round((day0(nowMs())-day0(t))/DAY);return k<=0?'Today':k===1?'Yesterday':'Earlier'};
let NF='all';
const ntKind=n=>n.img?['img','Picture','file']:n.link?['link',n.label||'Link','mega']:['msg','Notice','bell'];
function notifView(){return {t:'Notifications',get s(){return unread()?`${unread()} unread`:'All caught up'},key:'notif',right:()=>`<button class="ib" data-a="readAll" aria-label="Mark all as read">${ic('checks',19)}</button>`,
  html:()=>{if(NOTES===null)return '<div class="card sk" style="height:96px"></div><div class="card sk" style="height:96px"></div><div class="card sk" style="height:96px"></div>';
  const s=seenAt(),All=(NOTES||[]).slice().sort((a,b)=>(b.at||0)-(a.at||0)),un=All.filter(n=>n.at>s).length,L=NF==='un'?All.filter(n=>n.at>s):All,G=[...new Set(L.map(n=>grpOf(n.at)))];
  if(!All.length)return `<div class="nte"><span class="nte-i">${ic('bell',30)}</span><b>You’re all caught up</b><p>Test alerts, results and notices from Aspiron will show up here.</p></div>`;
  return `<div class="ntt"><div class="seg"><button class="${NF==='all'?'on':''}" data-a="ntF" data-v="all">All<small>${All.length}</small></button><button class="${NF==='un'?'on':''}" data-a="ntF" data-v="un">Unread<small>${un}</small></button></div>${un?`<button class="lnk" data-a="readAll">${ic('checks',16)}Mark all read</button>`:''}</div>
   ${L.length?G.map(g=>`<section class="nts"><p class="gh">${g}</p>${L.filter(n=>grpOf(n.at)===g).map((n,i)=>{const k=ntKind(n),u=n.at>s;
     return `<button class="nt3 k-${k[0]}${u?' un':''}" data-a="openNote" data-id="${esc3(n.id)}" style="--d:${Math.min(i,8)*35}ms"><span class="nt3-i">${ic(k[2],19)}</span><span class="nt3-b"><span class="nt3-h"><b>${esc3(n.title||'Announcement')}</b>${u?'<i class="nt3-dot" aria-label="Unread"></i>':''}</span><p>${esc3((n.text||'').replace(/\s+/g,' ').slice(0,160))}</p><span class="nt3-m"><time>${n.at?dayWord(n.at):''}</time>${k[0]!=='msg'?`<em>${esc3(k[1])}</em>`:''}</span></span>${ic('right',16)}</button>`}).join('')}</section>`).join('')
    :`<div class="nte sm"><span class="nte-i">${ic('checks',26)}</span><b>No unread notices</b><p>You have read everything.</p></div>`}`}}}
A.ntF=el=>{NF=el.dataset.v;qbKeep()};
let bellBusy=false;
A.bell=()=>{if(bellBusy||(top()&&top().key==='notif'))return;bellBusy=true;closeLayer();const b=$('#bell');b.classList.remove('ringing');void b.offsetWidth;b.classList.add('ringing');setTimeout(()=>b.classList.remove('ringing'),700);
  setTimeout(()=>{push(notifView());bellBusy=false;loadNotes().then(()=>{if(top()&&top().key==='notif'){redraw();$('#scrS').textContent=unread()?`${unread()} unread`:'All caught up'}})},RM?0:180)};
function markSeen(at){try{LS.set('cbt_ann_seen',Math.max(seenAt(),at))}catch(e){lsSet('cbt_ann_seen',Math.max(seenAt(),at))}try{bellUpdate()}catch(e){}syncBell()}
A.readAll=()=>{if(!unread()){toast3('Nothing unread');return}markSeen(Math.max(...NOTES.map(n=>n.at||0)));redraw();$('#scrS').textContent='All caught up';toast3('All marked as read')};
A.openNote=el=>{const n=(NOTES||[]).find(x=>String(x.id)===el.dataset.id);if(!n)return;markSeen(n.at||0);redraw();$('#scrS').textContent=unread()?`${unread()} unread`:'All caught up';
  const u=/^https?:\/\//i.test(n.link||'')?n.link:'';
  openSheet(`<h2 id="sheetT">${esc3(n.title||'Announcement')}</h2><p class="sub">${n.at?dS(n.at):''}</p><p style="font-size:15px;line-height:1.65;white-space:pre-wrap">${typeof linkify==='function'?linkify(n.text||''):esc3(n.text||'')}</p>
   ${n.img?'<div class="nimg3" id="nImg"><div class="sk" style="height:180px;border-radius:16px"></div></div>':''}
   ${u?`<a class="btn gold blk" style="margin-top:16px" href="${esc3(u)}" target="_blank" rel="noopener noreferrer">${esc3(n.label||'Open link')}</a>`:''}`);
  if(n.img)noteImg(n.id).then(im=>{const b=sheet.querySelector('#nImg');if(!b)return;if(im){const i=document.createElement('img');i.src=im;i.alt='Picture with this notice';i.loading='lazy';b.innerHTML='';b.appendChild(i)}else b.innerHTML='<p class="hint">The picture could not be loaded.</p>'})};
/* the notice picture, from the classic cache (ANNIMG) or cbt_notice_img */
async function noteImg(id){try{if(typeof ANNIMG!=='undefined'&&ANNIMG[id])return ANNIMG[id]}catch(e){}let r=null;try{r=await rpc('cbt_notice_img',{p_id:id})}catch(e){}const im=r&&r.ok&&imgOk(r.image)?r.image:null;try{if(im&&typeof ANNIMG!=='undefined')ANNIMG[id]=im}catch(e){}return im}

/* ================= TESTS: store + my test series, the store's own data (photos, descriptions, reviews) ================= */
const TQ={q:'',f:{e:[],c:[],s:[]},mf:'paid',cat:'all',sf:'all',xt:'d',tile:'',tf:'all',ts:'all',plan:null};
let XD=null,SRV={},SCHD={},LANGS=new Set(),SMAP={},extrasBusy=null;
function loadExtras(){if(extrasBusy||XD)return extrasBusy;const q=(fn,auth)=>rpc(fn,{},!auth).catch(()=>null);
  extrasBusy=Promise.all([q('cbt_store_explore'),q('cbt_store_reviews'),q('cbt_store_schedules'),q('cbt_store_langs'),q('cbt_store_map',true)]).then(([x,r,s,l,m])=>{
   XD={};(x&&x.ok?x.items||[]:[]).forEach(i=>XD[i.id]=i);SRV={};(r&&r.ok?r.items||[]:[]).forEach(i=>SRV[i.id]=i);SCHD={};(s&&s.ok?s.items||[]:[]).forEach(i=>SCHD[i.id]=i);
   LANGS=new Set((l&&l.ok?l.items||[]:[]).map(String));SMAP=(m&&m.ok&&m.map)||{};
   if(S.tab==='test'&&!scrOpen())drawT();if(scrOpen()&&top().store)redraw()}).finally(()=>{extrasBusy=null});return extrasBusy}
const okImg=u=>/^(data:image\/|https:\/\/)/.test(u||'');
const offPct=x=>x.mrp&&x.mrp>x.price?Math.round((1-x.price/x.mrp)*100):0;
const seriesOfItem=id=>Object.keys(SMAP).find(k=>SMAP[k]===id);
const itemOfSeries=sid=>(STORE||[]).find(x=>x.id===SMAP[sid]);
const owned=x=>{const sid=seriesOfItem(x.id);return sid&&mine().some(s=>s.id===sid)?sid:null};
// v77: a series this student has not bought, opened in explore mode (Description, Schedule, first test, Reviews to read)
const preview=x=>{const sid=seriesOfItem(x.id);return sid&&(C().series||[]).some(s=>s.id===sid)?sid:null};
const cats=()=>[...new Set((STORE||[]).map(x=>String(x.section||'').trim()).filter(Boolean))];
const rvOf=x=>SRV[x.id]&&SRV[x.id].count?SRV[x.id]:null;
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
  return `<div class="pst-stick" id="pstStick">
   <div class="pst-top"><div class="search"><label class="sbox">${ic('search',19)}<input id="tq" type="search" autocomplete="off" placeholder="Search test series, test name or exam" value="${esc3(TQ.q)}" aria-label="Search test series, test name or exam"><button class="clr" data-a="tqClear" aria-label="Clear search"${TQ.q?'':' hidden'}>${ic('x',17)}</button></label>
   <button class="fb${tfCount()?' on':''}" data-a="tFilter" aria-label="Filter${tfCount()?`, ${tfCount()} on`:''}">${ic('filter',20)}${tfCount()?`<b>${tfCount()}</b>`:''}</button></div></div>
   <div class="pst-tabs" id="pstTabs"><div class="pst-bd" id="pstBd"></div>${tabs2()}</div></div>
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
const TABH=116;
let pstRaf=0,lastQ=-1,lastMeta='';
/* sizes are measured once (on draw, resize, picture load), never during the scroll, so every frame only moves things */
const PM={ok:0};
function pstMeasure(){const h=$('#hdr'),ps=$('#pst');if(!h||!ps)return;PM.hh=h.offsetHeight;PM.y0=ps.offsetHeight-PM.hh-96;PM.y1=68;PM.span=Math.max(1,PM.y0-PM.y1);
  PM.bdH=Math.max(220,PM.y0+TABH+14);PM.tabs=$('#pstTabs');PM.bd=$('#pstBd');PM.slim=PM.op=PM.tf=undefined;PM.bg=parseCol(getComputedStyle(host).getPropertyValue('--bg')).slice(0,3);host.style.setProperty('--hh',PM.hh+'px');
  const bd=$('#pstBd');if(bd)bd.style.height=PM.bdH+'px';PM.ok=1;lastQ=-1}
function setMeta(c){const m=document.querySelector('meta[name="theme-color"]');if(m&&c!==lastMeta){m.setAttribute('content',c);lastMeta=c}}
function pstSync(re){if(!root)return;const h=$('#hdr');if(!h||!main)return;const st=$('#pstStick'),ps=$('#pst'),tint=$('#hdrTint'),old=document.body.classList.contains('v3old');
  const on=!!(S.tab==='test'&&!scrOpen()&&st&&ps&&!old);main.classList.toggle('pc',!!(on&&PCOL));
  h.classList.toggle('tp',on);
  if(!on){h.classList.remove('tpfull');if(tint)tint.style.opacity=0;h.classList.remove('onpst');PM.ok=0;lastQ=-1;if(!old&&host)setMeta(getComputedStyle(host).getPropertyValue('--bg').trim()||'#f5f5f3');return}
  if(re||!PM.ok)pstMeasure();
  const sy=Math.max(0,scrollY),p=Math.min(1,sy/PM.span),q=p*p*(3-2*p);
  if(q===1&&lastQ===1)return;lastQ=q;
  /* every frame only moves and fades things (no size change, so no layout while the finger moves): the buttons go
     slim once, by a short CSS transition, when the poster is half gone; the backdrop rides inside the bar */
  const sp=Math.round(p*50)/50;if(PM.slim!==sp){PM.slim=sp;st.style.setProperty('--p',sp)}
  const ty=Math.max(PM.y1,PM.y0-sy);if(!PM.tabs||!PM.tabs.isConnected){PM.tabs=$('#pstTabs');PM.bd=$('#pstBd')}
  PM.tabs.style.transform=`translate3d(0,${ty.toFixed(1)}px,0)`;if(PM.bd)PM.bd.style.opacity=Math.min(1,q*1.15).toFixed(3);
  const art=ps.firstElementChild;if(art){art.style.transform=`translate3d(0,${(Math.min(sy,PM.span+200)*.45).toFixed(2)}px,0)`;art.style.opacity=(1-.92*q).toFixed(3)}
  /* the header sits on the poster with no band of its own; its normal background fades in as the poster leaves */
  if(tint)tint.style.opacity=q.toFixed(3);const op=!!PCOL&&q<.5,tf=q>.98;if(PM.op!==op){PM.op=op;h.classList.toggle('onpst',op)}if(PM.tf!==tf){PM.tf=tf;h.classList.toggle('tpfull',tf)}
  /* the phone's status bar colour changes in a few steps only: repainting it every frame makes Android stutter */
  if(PCOL){const k=Math.round(q*4)/4,c=mixC(PCOL.top,PM.bg,k).map(Math.round);setMeta(`rgb(${c.join(',')})`)}}
addEventListener('scroll',()=>{if(!root||!main||pstRaf)return;if(S.tab!=='test'&&!PM.ok)return;pstRaf=requestAnimationFrame(()=>{pstRaf=0;pstSync()})},{passive:true});
addEventListener('resize',()=>{if(root&&S.tab==='test')pstSync(true)},{passive:true});

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
  /* at most one try a minute: with no banners (or no network) the redraw below used to start the next load at once,
     an endless loop of requests and redraws that made the Tests page stutter */
  try{if(typeof promoLoad==='function'&&!(typeof PROMO!=='undefined'&&PROMO&&PROMO.length)&&Date.now()-promoAt>6e4){promoAt=Date.now();promoLoad().then(()=>{if(S.tab==='test'&&!scrOpen()&&typeof PROMO!=='undefined'&&PROMO&&PROMO.length)softRender()})}}catch(e){}};
let promoAt=0;
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
/* test alerts (classic app12.js, cbt_alert_set): a phone notification the moment an upcoming test goes live */
const alOn3=id=>{try{return typeof alOn==='function'&&alOn(id)}catch(e){return false}};
const alBtn3=id=>typeof alOn==='function'?`<button class="btn sm${alOn3(id)?'':' ghost'} albt" data-a="alT" data-id="${esc3(id)}" aria-pressed="${alOn3(id)}">${ic('bell',15)}${alOn3(id)?'Alert on':'Notify me'}</button>`:'';
let alBusy3=0;
A.alT=async el=>{const id=el.dataset.id,t=tOf(id);if(!t||alBusy3||typeof alOn!=='function')return;const on=alOn(id);
  if(!on){if(!t.opens_at||t.opens_at<=srvNow()){toast3('This test is already live. Open it now.');return}
    try{if(!npSup()||npInApp()){npHelp('app');return}let pm=window.Notification.permission;if(pm==='default'){try{pm=await window.Notification.requestPermission()}catch(e){pm=window.Notification.permission}}
      if(pm!=='granted'){npHelp('blocked');return}if(!npOn())npEnable();else await pushSync(true)}catch(e){toast3('Could not turn on notifications');return}}
  alBusy3=1;let r=null;try{r=await rpc('cbt_alert_set',{p_test:id,p_on:!on})}catch(e){}alBusy3=0;
  if(!r||!r.ok){toast3(r&&r.error==='already_live'?'This test is already live. Open it now.':r&&r.status===404?'Test alerts are not set up yet.':'Could not save. Please try again.');return}
  const m=alGet();if(on)delete m[id];else m[id]=t.opens_at;LS.set(alKey(),m);hap(8);toast3(on?'Alert off':`Done! We will notify you when “${t.title}” goes live`);
  if(scrOpen())redraw();else softRender()};
function tActs(t){const st=stOf(t),r=resOf(t.id)[0],id=esc3(t.id);let p;try{p=typeof pendOf==='function'&&pendOf(t.id)}catch(e){}
  if(st==='lock')return `<button class="btn sm gold" data-a="test" data-id="${id}">${ic('lock',14)}Unlock</button>`;
  if(st==='wait')return `<button class="btn sm ghost" disabled>${ic('clock',15)}Opens ${fD(t.opens_at,{day:'numeric',month:'short'})}, ${fT(t.opens_at)}</button>${alBtn3(t.id)}`;
  if(st==='held')return `<button class="btn sm ghost" disabled>${ic('lock',14)}Result after ${p&&p.result_at?fD(p.result_at,{day:'numeric',month:'short'})+', '+fT(p.result_at):'the test closes'}</button>`;
  if(st==='closed')return r&&!p?`<button class="btn sm ghost" data-a="review" data-r="${esc3(r.id)}">View result</button>`:`<button class="btn sm ghost" disabled>${ic('lock',14)}Closed</button>`;
  pdf3Ask();
  const pdf=PDF3&&PDF3[t.id]?`<button class="btn sm ghost" data-a="pdfOpen" data-id="${id}">${ic('file',14)}Answer key PDF</button>`:'';
  const start=pdf+`<button class="btn sm${st==='done'?' ghost':' gold'}" data-a="test" data-id="${id}">${ic('play',14)}${st==='prog'?'Resume test':st==='done'?'Re-attempt':'Start test'}</button>`;
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
A.xp=el=>{const x=(STORE||[]).find(i=>i.id===el.dataset.id);if(!x)return;loadExtras();loadMeta();const sid=owned(x)||preview(x);TQ.xt='d';TQ.sf='all';TQ.tf='all';TQ.ts='all';TQ.plan=null;closeLayer();push(sid?ownedPage(sid):seriesPage({item:x,sid:null}))};
A.openSD=el=>{const sid=el.dataset.id;if(!sOf(sid))return;loadExtras();loadMeta();if(STORE===null)loadStore();TQ.xt=el.dataset.t||'r';TQ.tf='all';TQ.ts='all';TQ.plan=null;closeLayer();push(ownedPage(sid))};
A.xt=el=>{TQ.xt=el.dataset.v;redraw();requestAnimationFrame(()=>{try{const b=$('.utabs .on');if(b)b.scrollIntoView({inline:'center',block:'nearest'})}catch(e){}})};
A.sf=el=>{TQ.sf=el.dataset.v;redraw()};
A.oldSeries=el=>openSeriesAny(el.dataset.id,'r');   // the series' folders, tests, notes and PDFs in the new design
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
const UT=[['d','Description'],['r','Resources'],['t','Tests'],['a','Announcements'],['v','Reviews']];
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
/* v77: files in the admin's folders and order; a student who has not bought the series opens only the Schedule */
const RESL={schedule:'Schedule',syllabus:'Syllabus',notes:'Notes and PDFs'};
function resGroups(sid){const G=new Map();for(const f of (sOf(sid).files||[])){const k=String(f.folder||'').trim()||RESL[f.kind||'notes']||'Notes and PDFs';if(!G.has(k))G.set(k,[]);G.get(k).push(f)}return [...G]}
function spRes(sid){const G=resGroups(sid),ok=sOk(sOf(sid));pdf3Ask();
  const KT=ok?testsOf(sid).filter(t=>PDF3&&PDF3[t.id]):[];   // result & answer key PDFs (Google Drive): enrolled students only
  const KH=KT.length?`<div class="stack" style="gap:10px"><p class="gh">Result &amp; answer key PDFs <span>${KT.length}</span></p><div class="card rows">${KT.map(t=>`<div class="row"><span class="ti g">${ic('file',19)}</span><span><b>${esc3(PDF3[t.id].label||t.title)}</b><small>${esc3(t.title)}</small></span><button class="btn sm" data-a="pdfOpen" data-id="${esc3(t.id)}">${ic('eye',15)}View</button></div>`).join('')}</div></div>`:'';
  if(!G.length&&!KH)return `<div class="card empty"><span class="ti">${ic('file',22)}</span><b>No study material yet</b><p>Schedules, syllabus and PDFs for this series will appear here.</p></div>`;
  return `<div class="fd3g">${G.map(([k,L],i)=>{const lk=L.every(f=>f.locked);return `<button class="fd3${lk?' lk':''}" style="--i:${i}" data-a="resOpen" data-id="${esc3(sid)}" data-k="${esc3(k)}" aria-label="${esc3(k)}, ${L.length} ${L.length===1?'file':'files'}${lk?', locked':''}">${fd3Ic(lk)}<b>${esc3(k)}</b><small>${lk?`${ic('lock',12)} Buy to open`:`${L.length} ${L.length===1?'file':'files'}`}</small></button>`}).join('')}</div>`+KH}
// v78: a folder drawn in CSS (back, papers, front flap); on tap the flap opens, papers rise, then the files fly out
const fd3Ic=lk=>`<span class="fd3-ic" aria-hidden="true"><i class="fd3-bk"></i><i class="fd3-pp"></i><i class="fd3-pp"></i><i class="fd3-pp"></i><i class="fd3-fr"></i>${lk?`<i class="fd3-lk">${ic('lock',14)}</i>`:''}</span>`;
function resView(sid,k){const g=resGroups(sid).find(x=>x[0]===k);if(!g)return null;const lk=g[1].every(f=>f.locked);
  return {t:k,s:sOf(sid).title,key:'res',html:()=>`<div class="fd3h${lk?' lk':''}">${fd3Ic(lk)}<div><b>${esc3(k)}</b><small>${g[1].length} ${g[1].length===1?'file':'files'}${lk?' · buy the series to open':''}</small></div></div>
   <div class="card rows fd3l">${g[1].map((f,i)=>f.locked?`<button class="row dim fly3" style="--d:${i}" data-a="resLocked"><span class="ti">${ic('lock',19)}</span><span><b>${esc3(f.title||f.name)}</b><small>Buy this series to open it</small></span>${ic('lock',18)}</button>`
     :`<button class="row fly3" style="--d:${i}" data-a="fileOpen" data-id="${esc3(f.id)}" data-t="${esc3(f.title||f.name)}"><span class="ti g">${ic(f.kind==='schedule'?'cal':f.kind==='syllabus'?'list':'file',19)}</span><span><b>${esc3(f.title||f.name)}</b><small>${/\.pdf$/i.test(f.name||'')?'PDF':'Picture'}${f.size?`, ${f.size>1048576?(f.size/1048576).toFixed(1)+' MB':Math.max(1,Math.round(f.size/1024))+' KB'}`:''}</small></span>${ic('eye',18)}</button>`).join('')}</div>`}}
A.resOpen=el=>{const v=resView(el.dataset.id,el.dataset.k);if(!v||el.classList.contains('open'))return;
  if(RM){push(v);return}el.classList.add('open');hap(6);setTimeout(()=>{push(v);setTimeout(()=>el.classList.remove('open'),300)},460)};
A.resLocked=()=>toast3('This file opens after you buy the series.');
/* Tests: category chips (the series' folders), a status filter, the banner from the admin, then the tests in order */
const TSF=[['all','All'],['att','Attempted'],['non','Not attempted'],['res','Resume'],['up','Upcoming'],['miss','Missed']];
function tState(t){const st=stOf(t);return st==='prog'?'res':st==='live'?'live':st==='wait'?'up':st==='lock'?'lock':st==='held'?'held':(st==='done'||t.attempts>0)?'att':st==='closed'?'miss':'new'}
const TSL={live:['live','Live'],res:['live','Resume'],up:['','Upcoming'],new:['ok','Available'],held:['gold','Result soon'],att:['ok','Attempted'],miss:['err','Missed'],lock:['','Locked']};
function tCard(t){const s=tState(t),r=resOf(t.id)[0],syl=((META||{}).syl||{})[t.id],marks=(t.questions||0)*(t.correct||4),when=t.opens_at;let p;try{p=typeof pendOf==='function'&&pendOf(t.id)}catch(e){}
  const act=s==='lock'?['lock','Unlock','test']:s==='up'?['bell',alOn3(t.id)?'Alert on':'Notify me','alT']:s==='held'?['clock','Result','']:s==='miss'?(r&&!p?['chart','Result','review']:['lock','Closed','']):s==='res'?['play','Resume','test']:s==='att'?['play','Start','test']:['play','Start','test'];
  const L=TSL[s];
  return `<article class="card tc3${s==='miss'||s==='lock'?' dim':''}"><div class="tc3-b">
   <div class="tc3-top"><span class="st ${L[0]}">${L[1]}</span>${when?`<span class="mut">${s==='up'?'Opens':'Held on'} ${fD(when,{day:'numeric',month:'short'})}, ${fT(when)}</span>`:''}</div>
   <h3>${esc3(t.title)}</h3>
   <p class="tc3-m">${ic('list',15)}<span>${t.questions||0} Question${t.questions===1?'':'s'}</span><i></i><span>${fmtN(marks)} Marks</span><i></i><span>${t.duration||0} Mins</span></p>
   <p class="tc3-m">${ic('hist',15)}<span>Attempts: ${t.attempts||0}${r&&t.best!=null&&t.best_max?`, best ${t.best}/${t.best_max}`:''}</span></p>
   ${s==='held'&&p&&p.result_at?`<p class="tc3-m">${ic('clock',15)}<span>Result after ${fD(p.result_at,{day:'numeric',month:'short'})}, ${fT(p.result_at)}</span></p>`:''}</div>
   <button class="tc3-go${act[2]?'':' off'}${act[2]==='alT'&&alOn3(t.id)?' alon':''}" ${act[2]==='test'||act[2]==='alT'?`data-a="${act[2]}" data-id="${esc3(t.id)}"`:act[2]==='review'?`data-a="review" data-r="${esc3(r.id)}"`:'disabled'}><span>${ic(act[0],20)}</span><small>${act[1]}</small></button>
   ${pdf3Ask()}${(()=>{const pdf=PDF3&&PDF3[t.id],again=s==='att'&&r&&!p;   // v68: re-attempt any number of times + answer key PDF
     const res=r&&!p&&(s==='att'||s==='miss');void again;
     return syl||res||pdf?`<div class="tc3-f">${syl?`<button data-a="syl" data-id="${esc3(t.id)}">Syllabus</button>`:''}${res?`<button data-a="review" data-r="${esc3(r.id)}">${ic('chart',14)} Result</button>`:''}${pdf?`<button data-a="pdfOpen" data-id="${esc3(t.id)}">${ic('eye',14)} PDF</button>`:''}</div>`:''})()}</article>`}
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
function spRev(sid){const it=itemOfSeries(sid),ok=sOk(sOf(sid));return `${ok?`<button class="btn lg ghost" data-a="rvWrite" data-id="${esc3(sid)}">${ic('star',17)}Write or edit your review</button>`:`<p class="hint">${ic('lock',14)} Only students who bought this series can write a review.</p>`}${rvBlock(it)}`}
A.rvWrite=el=>{const s=sOf(el.dataset.id);if(s)rvAsk(s.id,s.title,true)};

function ownedPage(sid){const s0=sOf(sid);return {t:(s0||{}).title||'Test series',s:s0&&!sOk(s0)?'Explore':'Your test series',store:1,key:'sp',
  html:()=>{const s=sOf(sid);if(!s)return `<div class="card empty"><b>This series is not available</b></div>`;
   const it=!sOk(s)&&itemOfSeries(sid);   // v77: not bought → limited view + buy bar
   return utabs()+`<div class="stack sp-pane" style="gap:16px">${!sOk(s)?`<div class="card p lockn"><span class="ti">${ic('lock',18)}</span><span><b>You are exploring this series</b><small>The first test and the schedule are free. Buy the series to open every test, PDF and announcement.</small></span></div>`:''}${TQ.xt==='d'?spDesc(sid):TQ.xt==='r'?spRes(sid):TQ.xt==='t'?spTests(sid):TQ.xt==='a'?spAnn(sid):spRev(sid)}${it?`<div class="buybar"><span>${priceH(it)}</span>${actH(it)}</div>`:''}</div>`}}}
/* v77: Announcements, only for students who have the series (the server refuses everyone else) */
const ANN3={};
function lockBox(t,d){return `<div class="card empty"><span class="ti">${ic('lock',22)}</span><b>${t}</b><p>${d}</p></div>`}
function spAnn(sid){const s=sOf(sid);
  if(!sOk(s))return lockBox('Announcements are for enrolled students','Buy this series to get its announcements: schedule changes, tips and important notices.');
  const a=ANN3[sid];
  if(a===undefined){ANN3[sid]=null;rpc('cbt_series_posts',{p_series:sid}).then(r=>{ANN3[sid]=r&&r.ok?(r.items||[]):(r&&r.error==='locked'?'locked':'err');if(top()&&top().key==='sp')redraw()}).catch(()=>{ANN3[sid]='err';if(top()&&top().key==='sp')redraw()})}
  if(!a)return '<div class="card sk" style="height:90px"></div><div class="card sk" style="height:90px"></div>';
  if(a==='locked')return lockBox('Announcements are for enrolled students','Buy this series to get its announcements.');
  if(a==='err'){delete ANN3[sid];return `<div class="card empty"><span class="ti">${ic('info',22)}</span><b>Could not load</b><p>Check your internet and open this tab again.</p></div>`}
  if(!a.length)return `<div class="card empty"><span class="ti">${ic('mega',22)}</span><b>No announcements yet</b><p>Notices from your teachers for this series will appear here.</p></div>`;
  return a.map(p=>`<article class="card p stack ann3" style="gap:6px"><div class="tc3-top">${p.pinned?'<span class="st gold">Pinned</span>':''}<span class="mut">${fD(p.at,{day:'numeric',month:'short',year:'numeric'})}, ${fT(p.at)}</span></div>${p.title?`<b style="font-size:15.5px">${esc3(p.title)}</b>`:''}${p.body?`<p class="mut" style="white-space:pre-wrap;font-size:14.5px;line-height:1.65">${linkify3(esc3(p.body))}</p>`:''}</article>`).join('')}
const linkify3=t=>t.replace(/https:\/\/[^\s<>"']+/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

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
let PTQ='';
const BLK={s:'s-block',p:'p-block',d:'d-block (transition)',f:'f-block (lanthanoids, actinoids)'};
function ptView(){return {t:'Periodic table',s:'Tap an element for details',html:()=>`<label class="sbox">${ic('search',18)}<input id="ptq" type="search" placeholder="Search by name, symbol or number" value="${esc3(PTQ)}" aria-label="Search elements"></label>
  <div class="lg"><span><i style="background:color-mix(in srgb,var(--c1) 40%,var(--surface))"></i>s-block</span><span><i style="background:color-mix(in srgb,var(--c3) 40%,var(--surface))"></i>p-block</span><span><i style="background:color-mix(in srgb,var(--c2) 40%,var(--surface))"></i>d-block</span><span><i style="background:var(--acc1)"></i>f-block</span></div>
  <div class="ptable"><div class="pgrid" id="pgrid">${PSYM.map((s,i)=>{const z=i+1,q=epos(z);return `<button class="el b${q.b}" style="grid-row:${q.r};grid-column:${q.c}" data-a="el" data-z="${z}" aria-label="${PNAME[i]}, ${z}"><small>${z}</small>${s}</button>`}).join('')}
   <span style="grid-row:6;grid-column:3;display:grid;place-items:center;font-size:9px;color:var(--faint)">57–71</span><span style="grid-row:7;grid-column:3;display:grid;place-items:center;font-size:9px;color:var(--faint)">89–103</span><span style="grid-row:8;height:10px"></span></div></div>
  <p class="hint">Swipe sideways to see the full table.</p>`,after:()=>{const i=$('#ptq');const f=()=>{PTQ=i.value.trim().toLowerCase();$$('#pgrid .el').forEach(b=>{const z=+b.dataset.z,m=!PTQ||String(z)===PTQ||PSYM[z-1].toLowerCase()===PTQ||PNAME[z-1].toLowerCase().includes(PTQ);b.classList.toggle('dim',!m);b.classList.toggle('hit',!!PTQ&&m)});const h=$('#pgrid .el.hit');h&&h.scrollIntoView({block:'nearest',inline:'center',behavior:RM?'auto':'smooth'})};i.oninput=f;f()}}}
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
A.lmod=el=>{const h=el.dataset.h,f={'#/b':openSaved,'#/m':openMistakes,'#/notes':openNotes,'#/qb':openQB,'#/gen':openGen,'#/pyq':()=>openPyq()}[h];if(f)f();else oldHash(h)};

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
const resPts=(R,f,u)=>R.slice(-10).map((r,i,a)=>({l:new Date(r.at).getDate()+'/'+(new Date(r.at).getMonth()+1),v:f(r),hi:i===a.length-1,tip:`${esc3(titleOf(r))}: <b>${f(r)}${u}</b>${u==='%'&&f===pctOf?` (${r.score} / ${r.max})`:''}`}));
const CHARTS={
 marks:['Test marks',()=>{const R=resIn();return {html:vbars(resPts(R,pctOf,'%'),{max:100,unit:'%',label:'Marks per test, latest 10',empty:'No tests in this period. Take a test to see it here.'}),rows:R.map(r=>[titleOf(r),`${r.score} / ${r.max} (${pctOf(r)}%)`])}}],
 acc:['Accuracy',()=>{const R=resIn();return {html:vbars(resPts(R,accOf,'%'),{max:100,unit:'%',label:'Accuracy per test, latest 10',empty:'No tests in this period.'}),rows:R.map(r=>[titleOf(r),accOf(r)+'%'])}}],
 week:['This week',()=>{const W=stats(allRes()).week||[];return {html:vbars(W.map((w,i)=>({l:w.l,v:w.n,hi:i===W.length-1,tip:`${w.l}: <b>${w.n}</b> test${w.n===1?'':'s'}`})),{label:'Tests per day this week',tip0:'Tests you took each day this week.'}),rows:W.map(w=>[w.l,w.n])}}],
 activity:['Activity',()=>{const R=allRes(),days=new Set(R.filter(r=>nowMs()-r.at<84*DAY).map(r=>day0(r.at))).size;return {html:heat(R),rows:[['Active days, last 12 weeks',`${days} of 84`],['Current streak',stats(R).streak+' days']]}}]};
/* ================= ANALYTICS, written again (v45) =================
   One page that answers: how am I doing, where do I lose marks, what should I do next.
   Everything is the student's own data: test results (cbt_catalog), subject split and time per question
   (cbt_insights), overall rank (cbt_overall), question-bank practice by chapter (cbt_qb_meta) and the mistake
   notebook counts (cbt_mistakes). Bars only: no line charts, no rings. Nothing is stored. */
const AX={t:0,ins:null,ov:null,qb:null,mk:null,tc:null,busy:false};
/* subject and chapter names from the syllabus (app25.js); an unknown id is shown as it is */
const anSN=s=>{try{return qbSub(s)}catch(e){return s||'Other'}},anCN=(s,c)=>{try{return qbChap(s,c)}catch(e){return c||'Other'}};
async function anLoad(force){if(AX.busy||(!force&&AX.t&&Date.now()-AX.t<90000))return;AX.busy=true;
  try{const [a,b,c,d,e]=await Promise.all([rpc('cbt_insights',{}),rpc('cbt_overall',{}),rpc('cbt_qb_meta',{}),rpc('cbt_mistakes',{p_offset:0,p_limit:1,p_kind:'all',p_sec:''}),rpc('cbt_test_chapters',{})]);
    if(a&&a.ok)AX.ins=a;if(b&&b.ok)AX.ov=b;if(c&&c.ok)AX.qb=c;if(d&&d.ok)AX.mk=d.counts||null;if(e&&e.ok)AX.tc=e;AX.t=Date.now()}catch(e){AX.t=Date.now()}
  AX.busy=false;if(S.tab==='stats'&&!scrOpen()){const x=$('#anLive');if(x){x.innerHTML=anLive();countUp(x)}}}
AFTER.stats=()=>{anLoad()};
const anTone=a=>a>=75?'ok':a>=50?'mid':'low';
const anBar=(p,tone)=>`<span class="ahb"><i class="${tone||''}" style="--p:${Math.max(0,Math.min(1,p)).toFixed(3)}"></i></span>`;
const anTime=s=>{s=Math.round(s||0);return s>=3600?(s/3600).toFixed(1)+' h':s>=60?Math.round(s/60)+' min':s+' s'};
const anSk=n=>Array.from({length:n},()=>'<div class="card sk" style="height:132px"></div>').join('');
const anSec=(t,aside,body)=>`<section class="sec an"><div class="sh"><h2>${t}</h2>${aside?`<span class="aside">${aside}</span>`:''}</div>${body}</section>`;
const anKpi=(l,v,u,sub)=>`<div class="card kp"><small>${l}</small><b>${v}${u?`<span class="u">${u}</span>`:''}</b>${sub?`<em>${sub}</em>`:''}</div>`;
/* the part that follows the period chips: key numbers and how the answers split */
function anPer(){const R=resIn(),P=stats(R),sk=R.reduce((a,r)=>a+(+r.skipped||0),0),wr=P.tot-P.cor,all=P.tot+sk,secs=R.reduce((a,r)=>a+(+r.used||0),0);
  let tr='';if(R.length>=4){const h=Math.floor(R.length/2),av=L=>L.reduce((a,r)=>a+pctOf(r),0)/L.length,d=Math.round(av(R.slice(h))-av(R.slice(0,h)));tr=d?`<i class="atr ${d>0?'up':'dn'}">${d>0?'+':'−'}${Math.abs(d)}%</i> than your earlier tests`:'Same as your earlier tests'}
  if(!R.length)return `<div class="card empty"><span class="ti">${ic('chart',22)}</span><b>No tests in this period</b><p>Choose a longer period, or take a test to see your numbers here.</p></div>`;
  return `<div class="kpg">${anKpi('Tests taken',N(P.n))}${anKpi('Average score',N(P.avg),'%',tr)}${anKpi('Accuracy',N(P.acc),'%',`${fmtN(P.cor)} right of ${fmtN(P.tot)} answered`)}${anKpi('Best score',N(P.best),'%')}${anKpi('Questions seen',N(all))}${anKpi('Time in tests',anTime(secs),'',all?`${Math.round(secs/all)} s per question`:'')}</div>
  <div class="card p stack" style="gap:12px"><div class="rowb"><b>How your answers split</b><small class="mut">${fmtN(all)} questions</small></div>
   <span class="astk" role="img" aria-label="${P.cor} right, ${wr} wrong, ${sk} skipped">${all?`<i class="ok" style="flex:${P.cor}"></i><i class="low" style="flex:${wr}"></i><i class="na" style="flex:${sk}"></i>`:''}</span>
   <div class="lg3"><span><i class="ok"></i>Right <b>${fmtN(P.cor)}</b></span><span><i class="low"></i>Wrong <b>${fmtN(wr)}</b></span><span><i class="na"></i>Skipped <b>${fmtN(sk)}</b></span></div></div>`}
/* tests: given, missed, still open; the latest scores; tests taken more than once */
function anTests(R){const T=(C().tests||[]).filter(t=>!t.locked&&!t.practice),t0=nowMs(),done=new Set(R.map(r=>r.test_id)),nD=T.filter(t=>done.has(t.id)||t.attempts>0).length,
    miss=T.filter(t=>!done.has(t.id)&&!t.attempts&&t.closes_at&&t.closes_at<t0),nM=miss.length,nO=Math.max(0,T.length-nD-nM),by={};
  R.forEach(r=>{(by[r.test_id]=by[r.test_id]||[]).push(r)});const re=Object.values(by).filter(L=>L.length>1).map(L=>({t:titleOf(L[0]),a:pctOf(L[0]),b:pctOf(L[L.length-1]),n:L.length})).slice(-5).reverse();
  return anSec('Tests',`${T.length} in your series`,`<div class="card p stack" style="gap:14px">
   <div class="c3n"><div><b>${N(nD)}</b><small>Attempted</small></div><div><b class="${nM?'warn':''}">${N(nM)}</b><small>Missed</small></div><div><b>${N(nO)}</b><small>Not attempted yet</small></div></div>
   ${T.length?`<span class="astk" role="img" aria-label="${nD} attempted, ${nM} missed, ${nO} not attempted yet"><i class="acc" style="flex:${nD}"></i><i class="low" style="flex:${nM}"></i><i class="na" style="flex:${nO}"></i></span>`:''}
   ${nM?`<p class="note">${ic('info',15)}<span>You missed ${nM===1?'<b>'+esc3(miss[0].title)+'</b>':`${nM} tests`}. A missed live test has no rank; you can still take it for practice when it opens again.</span></p>`:''}</div>
  ${R.length?`<div class="card p stack" style="gap:14px"><div class="rowb"><b>Score in your latest tests</b><small class="mut">${Math.min(10,R.length)} of ${R.length}</small></div>${vbars(resPts(R,pctOf,'%'),{max:100,unit:'%',label:'Marks across your latest 10 tests',tip0:'Tap a bar to see the test.'})}
   ${re.length?`<div class="sub2"><b>Tests you took again</b>${re.map(x=>{const d=x.b-x.a;return `<div class="rt"><span>${esc3(x.t)}<small>${x.n} attempts</small></span><span class="rtv">${x.a}% <i aria-hidden="true">→</i> <b>${x.b}%</b><i class="atr ${d>0?'up':d<0?'dn':''}">${d>0?'+':d<0?'−':''}${Math.abs(d)}</i></span></div>`}).join('')}</div>`:''}</div>
   <button class="morebtn card" data-a="hist"><span>${ic('trophy',19)}Test history, results and solutions</span>${ic('right',18)}</button>`
   :`<div class="card empty"><span class="ti">${ic('trophy',22)}</span><b>Take your first test</b><p>Your scores, accuracy and rank appear here after it.</p><button class="btn sm gold" data-a="mySeries">Open my test series</button></div>`}`)}
/* the parts that need their own server calls */
function anLive(){if(!AX.t)return anSk(3);const o=[];
  /* rank */
  const v=AX.ov;if(v&&v.my_rank){const topP=v.top&&v.top[0]?+v.top[0].pct:0,pc=v.total?Math.max(1,Math.round(v.my_rank*100/v.total)):0;
    o.push(anSec('Rank','All India, all tests',`<div class="card p stack" style="gap:14px"><div class="ark"><div><small>Your rank</small><b>#${N(v.my_rank)}</b><em>of ${fmtN(v.total)} students</em></div><span class="tagp">Top ${pc}%</span></div>
     <div class="cmp"><span>You</span>${anBar((+v.my_pct||0)/100,'acc')}<b>${+v.my_pct||0}%</b><span>Topper</span>${anBar(topP/100,'na2')}<b>${topP}%</b></div>
     <button class="btn ghost blk" data-a="ranks">${ic('medal',16)}Open leaderboards</button></div>`))}
  else o.push(anSec('Rank','',`<div class="card rows"><button class="row" data-a="ranks"><span class="ti g">${ic('medal',20)}</span><span><b>Ranks and leaderboards</b><small>Your rank shows after a ranked test</small></span>${ic('right',18)}</button></div>`));
  /* subjects (from the tests) */
  const S0=((AX.ins&&AX.ins.subjects)||[]).filter(s=>(s.correct+s.wrong+(s.skipped||0))>0),Sx=S0.length===1&&S0[0].sec==='General'?[]:S0.map(s=>Object.assign({acc:s.correct+s.wrong?Math.round(s.correct*100/(s.correct+s.wrong)):0},s));
  if(Sx.length){const wk=Sx.filter(s=>s.correct+s.wrong>=3).sort((a,b)=>a.acc-b.acc)[0],bs=Sx.filter(s=>s.correct+s.wrong>=3).sort((a,b)=>b.acc-a.acc)[0];
    o.push(anSec('Subjects','From your tests',`<div class="card p stack" style="gap:16px">${Sx.map(s=>`<div class="sb"><div class="rowb"><b>${esc3(s.sec)}</b><span class="atg ${anTone(s.acc)}">${s.acc>=75?'Strong':s.acc>=50?'Improving':'Needs work'}</span></div>
      <div class="sbl">${anBar(s.acc/100,anTone(s.acc))}<b>${s.acc}%</b></div><small class="mut">${fmtN(s.correct)} right, ${fmtN(s.wrong)} wrong, ${fmtN(s.skipped||0)} skipped${s.avg_time?`, ${Math.round(s.avg_time)} s per question`:''}</small></div>`).join('')}
     ${wk&&bs&&wk.sec!==bs.sec?`<p class="note">${ic('target',15)}<span>Give more time to <b>${esc3(wk.sec)}</b> (${wk.acc}% accuracy). <b>${esc3(bs.sec)}</b> is your strongest (${bs.acc}%).</span></p>`:''}</div>`))}
  /* chapters in tests (v69: each test question's chapter comes from its Question Bank copy) */
  const TC=anTC(),tw=TC.filter(m=>m.n>=3).sort((a,b)=>a.acc-b.acc||b.n-a.n),cov=AX.tc&&AX.tc.all?Math.round(AX.tc.tagged*100/AX.tc.all):0;
  if(TC.length)o.push(anSec('Chapters in your tests',`${TC.length} chapters`,`<div class="card p stack" style="gap:14px"><div class="rowb"><b>${tw.length&&tw[0].acc<75?'Work on these first':'Your chapters'}</b><small class="mut">Lowest accuracy first</small></div>
     ${(tw.length?tw:TC).slice(0,5).map(anChRow).join('')}
     ${cov&&cov<100?`<p class="note">${ic('info',15)}<span>Based on ${cov}% of the questions in your tests: the rest are not sorted by chapter yet.</span></p>`:''}
     <button class="btn ghost blk" data-a="anCh">All chapters</button></div>`));
  /* practice (question bank), chapter by chapter */
  const M=anPrac(),pn=M.reduce((a,m)=>a+m.n,0),pr=M.reduce((a,m)=>a+m.r,0);
  if(pn){const bySub={};M.forEach(m=>{const x=bySub[m.s]=bySub[m.s]||{n:0,r:0};x.n+=m.n;x.r+=m.r});const weak=M.filter(m=>m.n>=5).map(m=>Object.assign({acc:Math.round(m.r*100/m.n)},m)).sort((a,b)=>a.acc-b.acc).slice(0,5).filter(m=>m.acc<75);
    o.push(anSec('Practice','Question bank',`<div class="kpg">${anKpi('Questions practised',N(pn))}${anKpi('Right',N(Math.round(pr*100/pn)),'%',`${fmtN(pr)} right, ${fmtN(pn-pr)} wrong`)}</div>
     <div class="card p stack" style="gap:14px"><b>By subject</b>${Object.entries(bySub).map(([k,x])=>{const a=Math.round(x.r*100/x.n);return `<div class="sb"><div class="rowb"><span>${esc3(anSN(k))}</span><small class="mut">${fmtN(x.n)} questions</small></div><div class="sbl">${anBar(a/100,anTone(a))}<b>${a}%</b></div></div>`}).join('')}</div>
     ${weak.length?`<div class="card p stack" style="gap:14px"><div class="rowb"><b>Chapters to work on</b><small class="mut">Lowest accuracy first</small></div>${weak.map(m=>`<div class="sb"><div class="rowb"><span>${esc3(anCN(m.s,m.c))}<small class="mut" style="display:block">${esc3(anSN(m.s))}</small></span><small class="mut">${m.r} of ${m.n} right</small></div><div class="sbl">${anBar(m.acc/100,anTone(m.acc))}<b>${m.acc}%</b></div></div>`).join('')}
      <div class="g2"><button class="btn ghost" data-a="anCh">All chapters</button><button class="btn" data-a="anQb">${ic('qb',16)}Practise now</button></div></div>`
      :`<div class="g2"><button class="btn ghost" data-a="anCh">All chapters</button><button class="btn" data-a="anQb">${ic('qb',16)}Practise now</button></div>`}`))}
  else o.push(anSec('Practice','Question bank',`<div class="card empty"><span class="ti">${ic('qb',22)}</span><b>No practice yet</b><p>Practise from the question bank and your accuracy in every chapter appears here.</p><button class="btn sm" data-a="anQb">Start practising</button></div>`));
  /* mistakes */
  const k=AX.mk;if(k&&(k.wrong||k.skipped||k.mastered)){const mx=Math.max(1,...(k.secs||[]).map(x=>+x.n||0));
    o.push(anSec('Mistakes','From your tests',`<div class="card p stack" style="gap:14px"><div class="c3n"><div><b class="${k.wrong?'warn':''}">${N(k.wrong||0)}</b><small>Wrong</small></div><div><b>${N(k.skipped||0)}</b><small>Skipped</small></div><div><b class="good">${N(k.mastered||0)}</b><small>Mastered</small></div></div>
     ${(k.secs||[]).length>1?`<div class="stack" style="gap:10px">${k.secs.map(x=>`<div class="sbl"><span class="sbn">${esc3(x.sec)}</span>${anBar((+x.n||0)/mx,'low')}<b>${fmtN(+x.n||0)}</b></div>`).join('')}</div>`:''}
     <button class="btn ghost blk" data-a="oldGo" data-h="#/m">${ic('pen',16)}Open the mistake notebook</button></div>`))}
  return o.join('')}
function anPrac(){return ((AX.qb&&AX.qb.mine)||[]).map(m=>({s:m[0]||'',c:m[1]||'',n:+m[2]||0,r:+m[3]||0})).filter(m=>m.n>0)}
function anTC(){return ((AX.tc&&AX.tc.chapters)||[]).map(x=>{const at=(+x.correct||0)+(+x.wrong||0);return {s:x.s,c:x.c,n:+x.total||0,r:+x.correct||0,w:+x.wrong||0,sk:+x.skipped||0,t:+x.avg_time||0,acc:at?Math.round((+x.correct||0)*100/at):0}}).filter(m=>m.n>0)}
const anChRow=m=>`<div class="sb"><div class="rowb"><span>${esc3(anCN(m.s,m.c))}<small class="mut" style="display:block">${esc3(anSN(m.s))}: ${m.r} right, ${m.w} wrong${m.sk?`, ${m.sk} skipped`:''}${m.t?`, ${m.t} s each`:''}</small></span><small class="mut" style="flex:none">${m.n} Qs</small></div><div class="sbl">${anBar(m.acc/100,anTone(m.acc))}<b>${m.acc}%</b></div></div>`;
/* days: this week, 12 weeks, streaks */
function anDays(R){const days=[...new Set(R.map(r=>day0(r.at)))].sort((a,b)=>a-b);let best=0,run=0,prev=0;days.forEach(d=>{run=prev&&d-prev<=DAY*1.5?run+1:1;best=Math.max(best,run);prev=d});
  const t0=nowMs(),a30=days.filter(d=>t0-d<30*DAY).length,P=stats(R),perDay={};R.forEach(r=>{const k=day0(r.at);perDay[k]=(perDay[k]||0)+1});
  return {best,a30,streak:P.streak,most:Math.max(0,...Object.values(perDay)),P}}
function anRecords(R){if(!R.length)return '';const bs=R.reduce((a,r)=>pctOf(r)>pctOf(a)?r:a),ba=R.filter(r=>r.correct+r.wrong>=5).reduce((a,r)=>!a||accOf(r)>accOf(a)?r:a,null),D=anDays(R),dt=r=>fD(r.at,{day:'numeric',month:'short',year:'numeric'});
  const row=(i,l,v,s)=>`<div class="rec"><span class="ti">${ic(i,19)}</span><span><small>${l}</small><b>${v}</b>${s?`<em>${s}</em>`:''}</span></div>`;
  return anSec('Personal bests','',`<div class="card recs">${row('trophy','Highest score',pctOf(bs)+'%',`${esc3(titleOf(bs))}, ${dt(bs)}`)}${ba?row('target','Best accuracy',accOf(ba)+'%',`${esc3(titleOf(ba))}, ${dt(ba)}`):''}${row('spark','Longest streak',D.best+(D.best===1?' day':' days'),'Days in a row with a test')}${row('cal','Most tests in a day',String(D.most),'')}</div>`)}
VIEW.stats=()=>{const R=allRes(),D=anDays(R);
  return `<div class="pt"><div><h1>Analytics</h1><p>Your preparation, from your own results</p></div></div>
  <section class="sec an"><div class="card anid"><span class="anav">${avatar('anavi')}</span><div class="anidt"><b>${esc3(stuName())}</b><small>${esc3(stuMeta())}</small></div><button class="btn sm ghost" data-a="profile">${ic('pen',14)}Edit</button>
   <div class="anidk"><div><b>${N(R.length)}</b><small>Tests</small></div><div><b>${N(D.streak)}</b><small>Day streak</small></div><div><b>${N(D.a30)}</b><small>Active days (30)</small></div></div></div></section>
  <section class="sec an"><div class="sh"><h2>Overview</h2></div><div class="chips" role="tablist" aria-label="Time period">${PERS.map(p=>`<button role="tab" aria-selected="${p[0]===AN.per}" class="${p[0]===AN.per?'on':''}" data-a="per" data-v="${p[0]}">${p[1]}</button>`).join('')}</div><div id="anPer" class="stack" style="gap:12px">${anPer()}</div></section>
  ${anTests(R)}
  <div id="anLive" class="anlive">${anLive()}</div>
  ${anSec('Activity',`${D.streak}-day streak`,`<div class="card p stack" style="gap:16px">${CHARTS.week[1]().html}<div class="sub2"><b>Last 12 weeks</b>${heat(R)}</div>
   <div class="c3n"><div><b>${N(D.a30)}</b><small>Active days in 30</small></div><div><b>${N(D.streak)}</b><small>Current streak</small></div><div><b>${N(D.best)}</b><small>Longest streak</small></div></div>
   <button class="btn ghost blk" data-a="oldTracker">${ic('list',16)}Open your study tracker</button></div>`)}
  ${anRecords(R)}
  ${anSec('More','',`<div class="card rows">${[['trophy','Test history',`${R.length} tests`,'hist',''],['bookmark','Saved questions',`${bmCount()} saved`,'oldGo','#/b'],['cal','Study tracker','Your weekly plans','oldGo','#/t'],['timer','Focus timer','Timed study sessions','focus',''],['gift','Refer and earn','Your code and wallet money','refer','']].map(r=>`<button class="row" data-a="${r[3]}"${r[4]?` data-h="${r[4]}"`:''}><span class="ti">${ic(r[0],20)}</span><span><b>${r[1]}</b><small>${r[2]}</small></span>${ic('right',18)}</button>`).join('')}</div>`)}`};
A.per=el=>{AN.per=el.dataset.v;$$('[data-a="per"]').forEach(x=>{const on=x===el;x.classList.toggle('on',on);x.setAttribute('aria-selected',on)});const o=$('#anPer');if(o){o.innerHTML=anPer();countUp(o)}};
A.anQb=()=>openQB();
/* every chapter practised, grouped by subject */
A.anCh=()=>{const grp=L=>{const G={};L.forEach(m=>{(G[m.s]=G[m.s]||[]).push(m)});return G},TG=grp(anTC()),PG=grp(anPrac().map(m=>Object.assign({acc:Math.round(m.r*100/m.n),w:m.n-m.r,sk:0,t:0},m)));
  const part=(G,h)=>Object.entries(G).map(([s,L])=>`<section class="sec an"><div class="sh"><h2>${esc3(anSN(s))}</h2><span class="aside">${h}, ${L.length} chapters</span></div><div class="card p stack" style="gap:14px">${L.sort((a,b)=>a.acc-b.acc).map(anChRow).join('')}</div></section>`).join('');
  push({t:'Chapters',s:'Your accuracy, chapter by chapter',html:()=>(Object.keys(TG).length||Object.keys(PG).length)?part(TG,'Tests')+part(PG,'Practice')
   :`<div class="card empty"><span class="ti">${ic('qb',22)}</span><b>No chapters yet</b><p>Take tests and practise from the question bank to see every chapter here.</p><button class="btn sm" data-a="anQb">Start practising</button></div>`})};
A.oldGo=el=>{const f={'#/m':openMistakes,'#/b':openSaved,'#/t':openTracker,'#/notes':openNotes}[el.dataset.h];if(f)f();else oldHash(el.dataset.h)};
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
function fileSheet(id){const f=FILES3[id];   // v77: view only, no Save button
  if(!f.view){toast3('This file cannot be shown.');return}
  openSheet(`<span class="ti g" style="margin-bottom:12px">${ic('check',22)}</span><h2 id="sheetT">File ready</h2><p class="sub">${esc3(f.title||f.name)}</p>
  <div style="margin-top:14px"><a class="btn block" href="${f.url}" target="_blank" rel="noopener">${ic('eye',16)}View</a></div>`)}
A.fileOpen=el=>fileGet(el.dataset.id,el.dataset.t||'');

/* ---------- Notes & PDFs: notes of tests (Google Drive links) and the files of every series ---------- */
let PDF3=null,pdf3Asked=0;
function pdf3Ask(){if(PDF3===null&&!pdf3Asked){pdf3Asked=1;loadPdf3().then(()=>{if(PDF3&&Object.keys(PDF3).length){try{if(scrOpen())redraw();else softRender()}catch(e){}}})}return ''}
function notesView(){return {t:'Notes & PDFs',s:'Study material of your test series',key:'notes',html:()=>{
  const T=(C().tests||[]).filter(t=>PDF3&&PDF3[t.id]),S=mine().filter(s=>(s.files||[]).length);
  if(PDF3===null)return '<div class="card sk" style="height:90px"></div><div class="card sk" style="height:90px"></div>';
  if(!T.length&&!S.length)return `<div class="card empty"><span class="ti">${ic('file',22)}</span><b>No notes yet</b><p>When your teacher adds notes or PDFs to your test series, they show up here.</p></div>`;
  return S.map(s=>`<div class="stack" style="gap:10px"><p class="gh">${esc3(s.title)}</p><div class="card rows">${s.files.map(f=>`<button class="row" data-a="fileOpen" data-id="${esc3(f.id)}" data-t="${esc3(f.title||f.name)}"><span class="ti g">${ic(f.kind==='schedule'?'cal':f.kind==='syllabus'?'list':'file',19)}</span><span><b>${esc3(f.title||f.name)}</b><small>${({schedule:'Schedule',syllabus:'Syllabus',notes:'Notes'})[f.kind]||'File'}</small></span>${ic('eye',18)}</button>`).join('')}</div></div>`).join('')
   +(T.length?`<div class="stack" style="gap:10px"><p class="gh">Notes of tests</p><div class="card rows">${T.map(t=>`<div class="row"><span class="ti g">${ic('file',19)}</span><span><b>${esc3(PDF3[t.id].label||t.title)}</b><small>${esc3(t.title)}, Google Drive</small></span><button class="btn sm" data-a="pdfOpen" data-id="${esc3(t.id)}" aria-label="View">${ic('eye',15)}View</button></div>`).join('')}</div></div>`:'')}}}
const pdfLinkOk=u=>typeof u==='string'&&u.length<=500&&/^https:\/\/(drive|docs)\.google\.com\/[A-Za-z0-9/_?=&%.#~+-]+$/.test(u);
function loadPdf3(){return rpc('cbt_test_pdfs',{}).then(r=>{const o={};if(r&&r.ok&&r.items)for(const k in r.items){const x=r.items[k];if(/^[A-Za-z0-9_-]{1,64}$/.test(k)&&x&&pdfLinkOk(x.url))o[k]={url:x.url,label:String(x.label||'')}}PDF3=o}).catch(()=>{PDF3=PDF3||{}})}
A.pdfOpen=el=>{const p=PDF3&&PDF3[el.dataset.id];if(!p||!pdfLinkOk(p.url)){toast3('PDF not available');return}const w=window.open(p.url,'_blank','noopener,noreferrer');if(w)w.opener=null};
// v68: direct download of a Google Drive / Docs file
const pdfDl3=u=>{let m=/\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(u)||/[?&]id=([A-Za-z0-9_-]{10,})/.exec(u);
  if(m&&/^https:\/\/drive\.google\.com\//.test(u))return 'https://drive.google.com/uc?export=download&id='+m[1];
  m=/^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,})/.exec(u);return m?'https://docs.google.com/'+m[1]+'/d/'+m[2]+'/export?format=pdf':u};
A.pdfDl=el=>{const p=PDF3&&PDF3[el.dataset.id];if(!p||!pdfLinkOk(p.url)){toast3('PDF not available');return}const w=window.open(pdfDl3(p.url),'_blank','noopener,noreferrer');if(w)w.opener=null};
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
  <div class="stack" style="gap:10px"><p class="gh">App</p><div class="card rows">${setRow('bell','Phone notifications',npOn3()?'On, new notices appear on your phone':'Get new notices on your phone','setNp',tgl(npOn3()))}${setRow('mega','Opening sound',sndOn3()?'On, a soft sound with the opening animation':'Off, the app opens silently','setSnd',tgl(sndOn3()))}${standalone3()?'':setRow('dl','Install the app','Open it from your home screen, full screen','setInstall')}</div></div>
  <div class="stack" style="gap:10px"><p class="gh">Help</p><div class="card rows">${setRow('mail','Chat with support','WhatsApp or Telegram','setHelp')}${setRow('info','About us','','setAbout')}${setRow('file','Terms and conditions','','setTerms')}${setRow('file','Privacy policy','','setPrivacy')}${setRow('file','Refund policy','','setRefund')}</div></div>
  <button class="btn lg ghost danger3" data-a="setOut">${ic('out',17)}Sign out</button>`}}}
A.settings=()=>{closeLayer();push(settingsView())};
A.setTheme=()=>openTheme();
A.setSnd=()=>{const on=!sndOn3();try{LS.set('cbt_snd',on)}catch(e){}toast3(on?'Opening sound on':'Opening sound off');redraw()};
A.setNp=async()=>{try{await npToggle()}catch(e){toast3('Could not change notifications')}setTimeout(()=>{if(top()&&top().key==='set')redraw()},300)};
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
A.setHelp=()=>{let b='';try{SUPMSG='';b=supBtns()}catch(e){}openSheet(`<span class="ti g" style="margin-bottom:12px">${ic('mail',22)}</span><h2 id="sheetT">Chat with support</h2><p class="sub">Our student support team replies on chat. Choose where you want to talk.</p><div class="sup3">${b}</div><p class="hint" style="text-align:center">Chat only. Calls are not available.</p>${socH()?`<p class="hsoc-t">Follow us</p><div class="hsoc">${socH()}</div>`:''}`)};
A.setOut=()=>openSheet(`<span class="ti" style="margin-bottom:12px">${ic('out',22)}</span><h2 id="sheetT">Sign out?</h2><p class="sub">Your tests, results and notes stay on your account. Sign in again with your mobile number any time.</p><div class="sheet-ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn danger3" data-a="setOutGo">Sign out</button></div>`);
A.setOutGo=()=>{closeLayer();unwind(()=>{try{doSignOut()}catch(e){location.reload()}})};
/* "turn on notifications" help in the new look: the same steps as the classic npHelp (app9.js), shown in a v3 sheet
   while the new design is on screen; the classic one is used everywhere else */
if(typeof npHelp==='function'){const _nh=npHelp;npHelp=function(kind){
  if(!booted||!document.body.classList.contains('v3on')||document.body.classList.contains('v3old')||INTEST)return _nh.apply(this,arguments);
  const ua=navigator.userAgent,ios=/iphone|ipad|ipod/i.test(ua);if(kind==='app'&&ios&&!(typeof npInApp==='function'&&npInApp()))kind='ask';
  const url=location.href.split('#')[0],chrome=/android/i.test(ua)?`intent://${url.replace(/^https?:\/\//,'')}#Intent;scheme=https;package=com.android.chrome;end`:url;
  const steps=kind==='app'?(ios?['Tap <b>⋯</b> or the share button at the top','Choose <b>Open in Safari</b>','Add the site to your Home Screen, open it from there and turn notifications on']
      :['Tap <b>⋮</b> at the top right','Choose <b>Open in Chrome</b> (or “Open in browser”)','Open Settings there and turn notifications on'])
    :ios?['Add this site to your <b>Home Screen</b> (Share, then Add to Home Screen)','Open it from the Home Screen icon','Turn on Phone notifications again and tap <b>Allow</b>']
    :['Tap the <b>⋮</b> menu at the top right, then <b>Settings</b>','Tap <b>Notifications</b> and make sure <b>Site notifications</b> is on','Tap <b>Site settings</b>, then <b>Notifications</b>, find this site under <b>Blocked</b>, tap it and choose <b>Allow</b>'];
  openSheet(`<div class="lk3"><span class="lk3i np3">${ic('bell',26)}</span><h2 id="sheetT">Turn on notifications</h2>
    <p class="sub">${kind==='app'?'You opened the site inside another app (like WhatsApp or Telegram). Notifications only work in your phone’s browser.':kind==='blocked'?'Notifications were blocked for this site earlier. Only you can unblock them, and it takes 10 seconds:':'Tap <b>Allow</b> when your phone asks. If no question appeared, do this once:'}</p></div>
   <div class="card p rfo3 np3s" style="margin-top:12px">${steps.map((x,i)=>`<div><span>${i+1}</span><p>${x}</p></div>`).join('')}</div>
   <div class="sheet-ft">${kind==='app'?`<a class="btn blk" href="${esc3(chrome)}">Open in Chrome</a>`:'<button class="btn blk" data-a="npAgain">I have allowed it, check again</button>'}</div>
   <p class="hint" style="text-align:center;margin-top:10px">Notices always appear on the bell inside the app too.</p>`)}}
A.npAgain=async()=>{let r='denied';try{const N=window.Notification;r=N?N.permission:'denied';if(r==='default')r=await N.requestPermission()}catch(e){}
  if(r==='granted'){closeLayer();try{npEnable()}catch(e){}toast3('Notifications are on');setTimeout(()=>{if(top()&&top().key==='set')redraw()},300)}else toast3('Still blocked. Follow the steps above.')};

/* ================= RESULT AND SOLUTIONS in the new design =================
   Opened from any "Result" button (cbt_review) and right after a test is submitted (the classic exam screen still
   runs the test; its result is shown here). Server: cbt_review, cbt_leaderboard, cbt_bookmark. */
const RS3={rec:null,Q:[],tab:'ov',f:'all',sec:'*',lb:null,bm:new Set(),title:''};
const pct3=(s,m)=>m?Math.max(0,Math.round(s*100/m)):0;
const fsec=t=>{t=Math.round(t||0);return t<60?t+'s':Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s'};
const fdur=t=>{t=Math.max(0,Math.round(t||0));const h=Math.floor(t/3600),m=Math.floor(t%3600/60);return h?`${h}h ${m}m`:m?`${m}m ${String(t%60).padStart(2,'0')}s`:`${t}s`};
function rsAnalyse(){const rec=RS3.rec,Qs=RS3.Q,ans=rec.answers||{},tm=rec.times||{};
  const all=Qs.map((q,i)=>{const a=ans[i]!=null?+ans[i]:null,t=tm[i]!=null?+tm[i]:null;return {q,i,a,t,st:q.answer==null||a==null?'s':a===q.answer?'c':'w'}});
  const names=[];Qs.forEach(q=>{const s=q.sec||'';if(!names.includes(s))names.push(s)});
  const cm=Qs.length?rec.max/Qs.length:0,wm=rec.wrong?(rec.correct*cm-rec.score)/rec.wrong:0;
  return {rec,Qs,all,names,cm,wm,hasSec:names.some(x=>x),hasT:all.some(x=>x.t>0)}}
const avgT3=a=>{const v=a.filter(x=>x.t>0);return v.length?v.reduce((s,x)=>s+x.t,0)/v.length:null};
function rsRing(p,sz){const R=sz/2-8,Cc=2*Math.PI*R;return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" aria-hidden="true"><circle cx="${sz/2}" cy="${sz/2}" r="${R}" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="10"/><circle cx="${sz/2}" cy="${sz/2}" r="${R}" fill="none" stroke="var(--acc1)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${Cc.toFixed(1)}" stroke-dashoffset="${(Cc*(1-p/100)).toFixed(1)}" transform="rotate(-90 ${sz/2} ${sz/2})" class="mkr"/></svg>`}
function rsHero(A){const r=A.rec,p=pct3(r.score,r.max),att=r.correct+r.wrong,acc=att?Math.round(r.correct*100/att):0;let cheat=false;try{cheat=typeof CHEAT!=='undefined'&&CHEAT&&CHEAT.has(String(r.test_id))}catch(e){}
  return `${cheat?`<div class="card rs-warn">${ic('info',18)}<span><b>Marked for cheating</b><small>The admin marked this test as cheating. Your rank in it is moved to the last place.</small></span></div>`:''}
  <section class="rsh"><div class="rsh-top"><div class="mkh-ring">${rsRing(p,132)}<span><b>${r.score}</b><small>of ${r.max}</small></span></div>
    <div class="rsh-t"><small>${esc3(RS3.title||'Your result')}</small><h2>${p>=75?'Excellent work!':p>=50?'Good effort!':'Keep practising!'}</h2><p>${p}% score · ${acc}% accuracy${r.late?' · submitted late':''}${r.lang==='hi'?' · हिंदी':''}</p></div></div>
   <div class="rsh-st"><div><b class="c">${r.correct}</b><small>Correct</small></div><div><b class="w">${r.wrong}</b><small>Wrong</small></div><div><b>${r.skipped}</b><small>Skipped</small></div><div><b>${fdur(r.used)}</b><small>Time</small></div></div></section>`}
const RST=[['ov','Overview'],['sub','Subjects'],['time','Time'],['sol','Solutions'],['his','Attempts']];
function rsTabs(A){return `<div class="utabs rs-tabs" role="tablist">${RST.filter(t=>t[0]!=='sub'||A.hasSec).map(t=>`<button role="tab" aria-selected="${RS3.tab===t[0]}" class="${RS3.tab===t[0]?'on':''}" data-a="rsTab" data-v="${t[0]}">${t[1]}</button>`).join('')}</div>`}
function rsLb(){const r=RS3.lb;if(r===null)return '<div class="card sk" style="height:150px"></div>';if(!r||!r.ok||!r.top||!r.top.length)return '';
  const solo=r.total<2,mx=Math.max(1,...(r.dist||[0]));
  return `${r.my_rank?`<section class="card rk3"><div class="rk3-m"><small>Your rank</small><b>${fmtN(r.my_rank)}</b><span>of ${fmtN(r.total)}</span></div><div class="rk3-g">${solo?'':`<div><b>${r.percentile}</b><small>Percentile</small></div>`}<div><b>${r.my_score}</b><small>Your score</small></div><div><b>${r.avg}</b><small>Class average</small></div><div><b>${r.top_score}</b><small>Topper</small></div></div>${solo?'<p class="hint" style="margin:10px 0 0">You are the first to attempt this test. Your rank updates as others take it.</p>':''}</section>`:''}
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Top ${Math.min(10,r.top.length)}</h2><span class="aside">First attempt of each student</span></div><div class="card rows">${r.top.map(x=>`<div class="lb3${x.me?' me':''}"><span class="n${x.rank<=3?' m'+x.rank:''}">${x.rank}</span><span class="nm">${esc3(x.name)}${x.me?' (you)':''}</span><b>${x.score}</b></div>`).join('')}${r.my_rank&&r.my_rank>10?`<div class="lb3 me"><span class="n">${r.my_rank}</span><span class="nm">You</span><b>${r.my_score}</b></div>`:''}</div></section>
   ${solo||!r.dist?'':`<section class="card p"><b style="font-size:15px">Score distribution</b><div class="hist3">${r.dist.map((n,i)=>`<div class="${r.my_bucket===i?'me':''}"><i style="height:${n?Math.max(8,n/mx*100):3}%"></i><span>${i*10}</span></div>`).join('')}</div><p class="hint" style="margin:6px 0 0;text-align:center">Students by score band (% of marks). Your band is highlighted.</p></section>`}`}
function rsOv(A){const {rec,Qs,wm}=A,att=rec.correct+rec.wrong;
  return `<div class="tiles3"><div><b>${att}/${Qs.length}</b><small>Attempted</small></div><div><b>${Qs.length?fsec(rec.used/Qs.length):'-'}</b><small>Per question</small></div><div><b class="w">−${Math.round(rec.wrong*wm*100)/100}</b><small>Negative marks</small></div></div>${rsLb()}`}
function rsSub(A){const {all,names,cm,wm,hasT}=A;
  const rows=names.map(s=>{const it=all.filter(x=>(x.q.sec||'')===s),c=it.filter(x=>x.st==='c').length,w=it.filter(x=>x.st==='w').length,k=it.length-c-w;return {s:s||'General',n:it.length,c,w,k,acc:c+w?Math.round(c*100/(c+w)):0,marks:Math.round((c*cm-w*wm)*100)/100,max:Math.round(it.length*cm*100)/100,t:avgT3(it)}});
  const ok=rows.filter(r=>r.c+r.w>0).sort((a,b)=>b.acc-a.acc);
  return `${ok.length>1?`<div class="g2 rs-tip"><div class="card"><small>Strongest</small><b>${esc3(ok[0].s)}</b><span class="st ok">${ok[0].acc}% accuracy</span></div><div class="card"><small>Needs work</small><b>${esc3(ok[ok.length-1].s)}</b><span class="st err">${ok[ok.length-1].acc}% accuracy</span></div></div>`:''}
   ${rows.map(r=>`<div class="card rs-sub"><div class="rs-sub-h"><b>${esc3(r.s)}</b><span>${r.marks} / ${r.max} marks</span></div><div class="stk3"><i class="c" style="width:${r.n?r.c*100/r.n:0}%"></i><i class="w" style="width:${r.n?r.w*100/r.n:0}%"></i></div>
    <p class="rs-sub-m"><span class="c">${r.c} correct</span><span class="w">${r.w} wrong</span><span>${r.k} skipped</span><span>${r.acc}% accuracy</span>${hasT&&r.t?`<span>${fsec(r.t)} per question</span>`:''}</p></div>`).join('')}`}
function rsTime(A){const {all,hasT}=A;if(!hasT)return `<div class="card empty"><span class="ti">${ic('clock',22)}</span><b>No time data for this attempt</b><p>Time per question is recorded for tests you take from now on.</p></div>`;
  const mx=Math.max(1,...all.map(x=>x.t||0)),tc=avgT3(all.filter(x=>x.st==='c')),tw=avgT3(all.filter(x=>x.st==='w')),ta=avgT3(all),slow=all.filter(x=>x.t>0).sort((a,b)=>b.t-a.t).slice(0,5);
  let msg='Your time is spread evenly across questions.';if(tc&&tw&&tw>tc*1.3)msg='You spend more time on questions you get wrong. Skip hard ones early and come back to them at the end.';else if(tc&&tw&&tw<tc*.7)msg='You answer wrong questions faster than right ones. Slow down and check before you move on.';
  return `<div class="tiles3"><div><b>${ta?fsec(ta):'-'}</b><small>Average</small></div><div><b class="c">${tc?fsec(tc):'-'}</b><small>On correct</small></div><div><b class="w">${tw?fsec(tw):'-'}</b><small>On wrong</small></div></div>
   <section class="card p"><b style="font-size:15px">Time per question</b><p class="hint" style="margin:2px 0 0">Tap a bar to open that question</p><div class="tch3-w"><div class="tch3" style="min-width:${Math.max(100,all.length*18)}px">${all.map(x=>`<button class="${x.st}" data-a="rsJump" data-i="${x.i}" aria-label="Question ${x.i+1}, ${fsec(x.t)}"><i style="height:${x.t?Math.max(4,x.t/mx*100):2}%"></i><span>${x.i+1}</span></button>`).join('')}</div></div>
    <p class="rs-key"><span class="c">Correct</span><span class="w">Wrong</span><span class="s">Skipped</span></p></section>
   <div class="card rs-note">${ic('info',18)}<span>${msg}</span></div>
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Slowest questions</h2></div><div class="card rows">${slow.map(x=>`<button class="lb3" data-a="rsJump" data-i="${x.i}"><span class="n">${x.i+1}</span><span class="nm">${esc3((x.q.q||'').slice(0,60))}${(x.q.q||'').length>60?'…':''}</span><b class="${x.st}">${fsec(x.t)}</b></button>`).join('')}</div></section>`}
function rsSol(A){const {all,names,hasSec}=A,f=RS3.f,sf=RS3.sec,cnt=k=>all.filter(x=>k==='all'||x.st===k).length,tid=A.rec.test_id;
  const items=all.filter(x=>(f==='all'||x.st===f)&&(!hasSec||sf==='*'||(x.q.sec||'')===sf));
  return `<div class="seg" role="tablist">${[['all','All'],['c','Correct'],['w','Wrong'],['s','Skipped']].map(t=>`<button role="tab" aria-selected="${f===t[0]}" class="${f===t[0]?'on':''}" data-a="rsF" data-v="${t[0]}">${t[1]}<small>${cnt(t[0])}</small></button>`).join('')}</div>
   ${hasSec?`<div class="chips">${[['*','All sections']].concat(names.map(s=>[s,s||'General'])).map(c=>`<button class="${sf===c[0]?'on':''}" data-a="rsSec" data-v="${esc3(c[0])}">${esc3(c[1])}</button>`).join('')}</div>`:''}
   ${items.length?items.map(({q,i,a,t,st})=>qCard(Object.assign({qidx:i},q),{id:'rq'+i,rev:true,pick:a,badge:`${st==='c'?'<span class="st ok">Correct</span>':st==='w'?'<span class="st err">Wrong</span>':'<span class="st">Skipped</span>'}${q.sec?`<span class="tag">${esc3(q.sec)}</span>`:''}${t?`<span class="mut" style="font-size:12.5px">${fsec(t)}</span>`:''}`,
     tools:tid?`<button class="ib sm${RS3.bm.has(i)?' on':''}" data-a="rsBm" data-i="${i}" aria-label="${RS3.bm.has(i)?'Remove from saved':'Save this question'}">${ic('bookmark',17)}</button>`:'',
     note:q.answer==null?'<p class="qc3-n">No answer key was set for this question, so it is not marked.</p>':''})).join(''):`<div class="card empty"><b>Nothing to show here</b><p>Pick another filter above.</p></div>`}`}
function rsHis(A){const tid=A.rec.test_id,L=allRes().filter(r=>r.test_id===tid).slice().sort((a,b)=>(a.at||0)-(b.at||0));
  if(!L.length)return `<div class="card empty"><b>No other attempts</b><p>Every attempt of this test shows up here.</p></div>`;
  const P=L.map(x=>pct3(x.score,x.max)),best=Math.max(...P);
  return `<div class="card p"><div class="rs-sub-h"><b>${L.length} attempt${L.length>1?'s':''}</b><span>Best ${best}%</span></div>${L.length>1?`<div class="hist3 att">${L.map((x,i)=>`<div class="${x.id===A.rec.id?'me':''}"><i style="height:${Math.max(6,P[i])}%"></i><span>${i+1}</span></div>`).join('')}</div>`:''}</div>
   <div class="card rows">${L.slice().reverse().map((x,j)=>{const i=L.length-1-j;return `<button class="row" data-a="review" data-r="${esc3(x.id)}"${x.id===A.rec.id?' disabled':''}><span class="ti${P[i]===best?' g':''}">${ic(P[i]===best?'trophy':'hist',18)}</span><span><b>Attempt ${i+1}${x.id===A.rec.id?' (this one)':''}</b><small>${x.at?dS(x.at):''}, ${x.score} / ${x.max}</small></span><span class="tag">${P[i]}%</span></button>`}).join('')}</div>`}
function resultView(){return {t:'Result',get s(){return RS3.title||''},key:'res3',html:()=>{if(!RS3.rec)return '<div class="card sk" style="height:260px"></div><div class="card sk" style="height:160px"></div>';
  const A=rsAnalyse();return rsHero(A)+rsTabs(A)+`<div class="stack sp-pane" style="gap:14px">${RS3.tab==='sub'&&A.hasSec?rsSub(A):RS3.tab==='time'?rsTime(A):RS3.tab==='sol'?rsSol(A):RS3.tab==='his'?rsHis(A):rsOv(A)}</div>
   <button class="btn lg ghost" data-a="back">Done</button>`}}}
function rsOpen(rec,review,title){const t=tOf(rec.test_id);RS3.rec=rec;RS3.Q=review||[];RS3.tab='ov';RS3.f='all';RS3.sec='*';RS3.lb=null;RS3.title=title||rec.title||rec.test_title||(t&&t.title)||'';
  RS3.bm=new Set();try{if(typeof BM!=='undefined'&&BM)BM.forEach(k=>{const [a,b]=String(k).split(':');if(a===String(rec.test_id))RS3.bm.add(+b)})}catch(e){}
  if(top()&&top().key==='res3')redraw();else push(resultView());
  if(!rec.test_id||(t&&t.practice)){RS3.lb={ok:false};redraw();return}
  rpc('cbt_leaderboard',{p_test:rec.test_id}).then(r=>{if(RS3.rec===rec){RS3.lb=r||{ok:false};if(top()&&top().key==='res3'&&RS3.tab==='ov'){const b=$('#scrB'),y=b.scrollTop;redraw();b.scrollTop=y}}}).catch(()=>{RS3.lb={ok:false}})}
async function openResult3(id){closeLayer();RS3.rec=null;push(resultView());let r=null;try{r=await rpc('cbt_review',{p_result:id})}catch(e){}
  if(r&&!r.ok&&r.error==='hidden'){back();heldOpen('',r.result_at);return}
  if(!r||!r.ok||r.gone){back();toast3(r&&r.gone?'This test is no longer available for review.':'Could not load this result. Please try again.');return}
  rsOpen(r.result,r.review,'')}
const rsKeep=fn=>{const b=$('#scrB'),y=b.scrollTop;fn();redraw();b.scrollTop=y};
A.review=el=>openResult3(el.dataset.r);
A.rsTab=el=>{RS3.tab=el.dataset.v;redraw();const t=$('.rs-tabs');if(t){const b=$('#scrB');if(t.offsetTop<b.scrollTop)b.scrollTop=t.offsetTop-4}};
A.rsF=el=>rsKeep(()=>{RS3.f=el.dataset.v});A.rsSec=el=>rsKeep(()=>{RS3.sec=el.dataset.v});
A.rsJump=el=>{const i=+el.dataset.i;RS3.tab='sol';RS3.f='all';RS3.sec='*';redraw();setTimeout(()=>{const e=root.getElementById('rq'+i);if(e){e.scrollIntoView({behavior:RM?'auto':'smooth',block:'center'});e.classList.add('flash3')}},80)};
A.rsBm=async el=>{const i=+el.dataset.i,tid=RS3.rec.test_id,on=!RS3.bm.has(i);on?RS3.bm.add(i):RS3.bm.delete(i);el.classList.toggle('on',on);
  let r=null;try{r=await rpc('cbt_bookmark',{p_test:tid,p_qidx:i,p_on:on})}catch(e){}
  if(!r||!r.ok){on?RS3.bm.delete(i):RS3.bm.add(i);el.classList.toggle('on',!on);toast3(r&&r.error==='limit'?'You can save up to 500 questions.':'Could not save. Please try again.');return}
  clearOld('bm');try{if(typeof BM!=='undefined'&&BM){on?BM.add(tid+':'+i):BM.delete(tid+':'+i)}}catch(e){}toast3(on?'Saved':'Removed from saved')};
/* the result is not out yet (live tests): when it will be */
function heldOpen(title,at){push({t:'Test submitted',s:'',key:'held',html:()=>`<section class="rsh held"><span class="ti g">${ic('check',26)}</span><h2>Test submitted</h2>${title?`<p><b>${esc3(title)}</b></p>`:''}<p>Your answers are saved. Your result, rank and answer key will show after</p><b class="held-at">${at?fD(at,{weekday:'short',day:'numeric',month:'short'})+', '+fT(at):'the test closes'}</b></section>
  <div class="card rs-note">${ic('bell',18)}<span>We will show the result here in Test history as soon as it is out.</span></div><button class="btn lg" data-a="back">Done</button>`})}
/* after a test is submitted in the new design, show its result (or "result after …") here instead of the classic page */
(function(){const v3now=()=>document.body.classList.contains('v3on');
  ['showResult','showHeld'].forEach(n=>{const f=window[n];if(typeof f!=='function')return;window[n]=function(){const r=f.apply(this,arguments);
    if(v3now()){try{const args=arguments,R=(typeof RV!=='undefined'&&RV)||null;toNew();if(typeof loadCat==='function')loadCat(true).then(()=>{if(!scrOpen())softRender()}).catch(()=>{});
      if(n==='showResult'&&R&&R.result){let tt='';try{const T0=(typeof CAT!=='undefined'&&CAT&&CAT.tests||[]).find(x=>x.id===R.result.test_id);tt=T0?T0.title:''}catch(e){}rsOpen(R.result,R.review,tt||(typeof CURPEND!=='undefined'&&CURPEND&&CURPEND.title)||'')}else if(n==='showHeld')heldOpen(args[0],args[1])}catch(e){console.error(e)}}
    return r}})})();

/* ================= QUESTION BANK and TEST GENERATOR in the new design =================
   Same server and data as the classic pages (cbt_qb_meta, cbt_qb_next, cbt_qb_check, cbt_gen_list,
   cbt_gen_create, cbt_gen_edit, cbt_gen_result; taking a test: cbt_gen_start / save / submit through the classic
   engine, drawn in the new look). The syllabus lists and counting helpers are the classic ones (app25.js). */
const QBX={F:null,meta:null,err:null};
const QBK=[['l','Level',()=>QB_LV],['y','Question type',()=>QB_TY],['o','Source',()=>QB_SR]];
function qbF0(){let f=null;try{f=Object.assign(qbEmptyF(),lsGet('cbt_qb_f',{}))}catch(e){f={ex:'',s:[],c:[],t:[],l:[],y:[],o:[]}}['s','c','t','l','y','o'].forEach(k=>{if(!Array.isArray(f[k]))f[k]=[]});if(f.ex!=='NEET'&&f.ex!=='JEE')f.ex=qbExamDef();return f}
function qbTidy3(F){const subs=qbEff(F).s;F.s=F.s.filter(s=>qbExSubs(F).includes(s));
  F.c=F.c.filter(c=>subs.some(s=>{const sb=qbSyl().find(x=>x.id===s);return sb&&sb.chapters.some(y=>y.id===c)}));
  const tps=new Set();F.c.forEach(c=>{const s=(qbSyl().find(x=>x.chapters.some(y=>y.id===c))||{}).id,ch=qbChapObj(s,c);if(ch)ch.topics.forEach(t=>tps.add(t.name))});F.t=F.t.filter(t=>tps.has(t))}
const qbN=(F,extra)=>{try{return qbCount(QBX.meta.rows,Object.assign({},qbEff(F),extra||{}))}catch(e){return 0}};
/* the filter: exam, subjects, chapters (sheet with search), topics, level, type, source */
function qbFilter(F,key){const subs=qbExSubs(F),E=qbEff(F);
  const chips=(g,L)=>`<div class="chips wrap">${L.map(([k,l])=>{const on=F[g].includes(k),n=qbN(F,{[g]:[k]});return `<button class="${on?'on':''}" aria-pressed="${on}" data-a="qbT" data-f="${key}" data-g="${g}" data-k="${esc3(k)}">${esc3(l)}<small>${fmtN(n)}</small></button>`}).join('')}</div>`;
  const chName=c=>{const s=(qbSyl().find(x=>x.chapters.some(y=>y.id===c))||{}).id;return qbChap(s,c)};
  return `<div class="qbf"><div class="fl"><span>Exam</span><div class="seg">${['NEET','JEE'].map(x=>`<button class="${F.ex===x?'on':''}" data-a="qbEx" data-f="${key}" data-v="${x}">${x}</button>`).join('')}</div></div>
   <div class="fl"><span>Subjects <em>none chosen = all</em></span><div class="chips wrap">${subs.map(k=>{const on=F.s.includes(k);return `<button class="${on?'on':''}" aria-pressed="${on}" data-a="qbT" data-f="${key}" data-g="s" data-k="${k}">${esc3(qbSub(k))}<small>${fmtN(qbN(F,{s:[k],c:[],t:[]}))}</small></button>`}).join('')}</div></div>
   <div class="fl"><span>Chapters</span><button class="qbpk" data-a="qbChap" data-f="${key}" data-g="c"><b>${F.c.length?`${F.c.length} chapter${F.c.length>1?'s':''} chosen`:'All chapters'}</b>${ic('right',18)}</button>
    ${F.c.length?`<div class="chips wrap qbsel">${F.c.map(c=>`<button class="on" data-a="qbT" data-f="${key}" data-g="c" data-k="${esc3(c)}">${esc3(chName(c))}${ic('x',13)}</button>`).join('')}</div>`:''}</div>
   ${F.c.length?`<div class="fl"><span>Topics</span><button class="qbpk" data-a="qbChap" data-f="${key}" data-g="t"><b>${F.t.length?`${F.t.length} topic${F.t.length>1?'s':''} chosen`:'All topics of these chapters'}</b>${ic('right',18)}</button></div>`:''}
   ${QBK.map(([g,l,L])=>`<div class="fl"><span>${l}</span>${chips(g,L())}</div>`).join('')}</div>`}
const QBFS={};   // key → {F, after}
function qbPick(key,g){const F=QBFS[key].F;let q='';
  const list=()=>{const out=[];if(g==='c'){qbEff(F).s.forEach(s=>{const sb=qbSyl().find(x=>x.id===s);if(!sb)return;[11,12].forEach(cl=>{const L=sb.chapters.filter(c=>c.cls===cl&&!c.old);if(!L.length)return;out.push(['h',`${qbSub(s)}, Class ${cl}`]);L.forEach(c=>out.push(['o',c.id,c.name,qbN(F,{c:[c.id],s:[s],t:[]})]))})})}
    else F.c.forEach(c=>{const s=(qbSyl().find(x=>x.chapters.some(y=>y.id===c))||{}).id,ch=qbChapObj(s,c);if(!ch||!ch.topics.length)return;out.push(['h',ch.name]);ch.topics.forEach(t=>out.push(['o',t.name,t.name,qbN(F,{t:[t.name]})]))});return out};
  const draw=()=>{const L=list(),qq=q.trim().toLowerCase(),vis=L.filter(x=>x[0]==='h'||!qq||String(x[2]).toLowerCase().includes(qq));
    sheet.innerHTML=`<div class="grab"></div><h2 id="sheetT">${g==='c'?'Choose chapters':'Choose topics'}</h2><p class="sub">${F[g].length} chosen. None chosen means all.</p>
     <label class="sbox qbsr">${ic('search',18)}<input id="qbQ" type="search" placeholder="Search" value="${esc3(q)}" autocomplete="off"></label>
     <div class="qbl3">${vis.map((x,i)=>x[0]==='h'?((vis[i+1]&&vis[i+1][0]==='o')?`<p class="gh">${esc3(x[1])}</p>`:''):`<button class="qbo${F[g].includes(x[1])?' on':''}" data-k="${esc3(x[1])}"><i>${ic('check',13)}</i><span>${esc3(x[2])}</span><small>${fmtN(x[3])}</small></button>`).join('')||'<p class="hint">Nothing matches.</p>'}</div>
     <div class="sheet-ft"><button class="btn ghost" data-qc>Clear</button><button class="btn" data-qd>Done</button></div>`;
    const inp=sheet.querySelector('#qbQ');inp.addEventListener('input',()=>{q=inp.value;const y=sheet.scrollTop;draw();sheet.scrollTop=y;const i2=sheet.querySelector('#qbQ');i2.focus();i2.setSelectionRange(q.length,q.length)})};
  openSheet('');draw();
  sheet.onclick=e=>{const o=e.target.closest('.qbo');if(o){const A=F[g],k=o.dataset.k,i=A.indexOf(k);i>-1?A.splice(i,1):A.push(k);o.classList.toggle('on',i<0);sheet.querySelector('.sub').textContent=`${A.length} chosen. None chosen means all.`;return}
   if(e.target.closest('[data-qc]')){F[g]=[];const y=sheet.scrollTop;draw();sheet.scrollTop=y;return}
   if(e.target.closest('[data-qd]')){closeLayer();qbTidy3(F);QBFS[key].after()}}}
A.qbChap=el=>qbPick(el.dataset.f,el.dataset.g);
A.qbT=el=>{const o=QBFS[el.dataset.f];if(!o)return;const A2=o.F[el.dataset.g],k=el.dataset.k,i=A2.indexOf(k);i>-1?A2.splice(i,1):A2.push(k);qbTidy3(o.F);o.after()};
A.qbEx=el=>{const o=QBFS[el.dataset.f];if(!o||o.F.ex===el.dataset.v)return;o.F.ex=el.dataset.v;o.F.s=[];o.F.c=[];o.F.t=[];o.after()};
const qbKeep=()=>{const b=$('#scrB'),y=b.scrollTop;redraw();b.scrollTop=y};

/* ---------- question bank home ---------- */
function qbView(){return {t:'Question bank',s:'Practise with answers and explanations',key:'qb',html:()=>{const M=QBX.meta;
  if(QBX.err)return `<div class="card empty"><span class="ti">${ic('info',22)}</span><b>${QBX.err==='soon'?'Coming soon':'Could not load'}</b><p>${QBX.err==='soon'?'The question bank is being set up. Please check again later.':esc3(QBX.err)}</p></div>`;
  if(!M)return '<div class="card sk" style="height:180px"></div><div class="card sk" style="height:300px"></div>';
  const F=QBX.F,total=M.rows.reduce((a,r)=>a+r.n,0),done=M.mine.reduce((a,r)=>a+(+r[2]||0),0),right=M.mine.reduce((a,r)=>a+(+r[3]||0),0),n=qbN(F);
  if(!total)return `<div class="card empty"><span class="ti">${ic('qb',22)}</span><b>Questions are being added</b><p>Please check again soon.</p></div>`;
  const mineS={};M.mine.forEach(r=>{const o=mineS[r[0]]=mineS[r[0]]||{n:0,r:0};o.n+=+r[2]||0;o.r+=+r[3]||0});const subs={};M.rows.forEach(r=>{subs[r.s]=(subs[r.s]||0)+r.n});
  return `<section class="mkh"><div class="mkh-top"><div><small>QUESTION BANK</small><b>${fmtN(total)}</b><span>questions to practise</span></div><span class="ti qbic">${ic('qb',30)}</span></div>
    <div class="mkh-st"><div><b>${fmtN(done)}</b><small>Practised</small></div><div><b>${done?Math.round(right/done*100):0}%</b><small>Accuracy</small></div><div><b>${fmtN(Math.max(0,total-done))}</b><small>Not tried</small></div></div></section>
   <div class="g2 qbsubs">${qbExSubs(F).map(s=>{const t=subs[s]||0,m=mineS[s]||{n:0,r:0},p=t?Math.min(100,Math.round(m.n/t*100)):0;return `<button class="card qbs" data-a="qbSub1" data-s="${esc3(s)}"><b>${esc3(qbSub(s))}</b><small>${fmtN(t)} questions, ${fmtN(m.n)} done${m.n?`, ${Math.round(m.r/m.n*100)}% right`:''}</small><span class="bar"><i style="--p:${(p/100).toFixed(3)}"></i></span></button>`}).join('')}</div>
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Choose what to practise</h2><button class="lnk" data-a="qbReset">Clear</button></div><div class="card p">${qbFilter(F,'qb')}</div></section>
   <div class="buybar"><span><b style="font-size:18px">${fmtN(n)}</b> <span class="mut" style="font-size:13px">questions match</span></span><button class="btn" data-a="qbGo"${n?'':' disabled'}>${ic('play',16)}Start practice</button></div>
   <button class="card rsc" data-a="genOpen"><span class="rsc-n">NEW</span><b>Make your own test</b><small>Pick chapters, questions, level and time, and schedule it</small>${ic('right',18)}</button>`}}}
async function openQB(){QBX.err=null;if(!QBX.F)QBX.F=qbF0();QBFS.qb={F:QBX.F,after:()=>{lsSet('cbt_qb_f',QBX.F);qbKeep()}};closeLayer();if(!(top()&&top().key==='qb'))push(qbView());
  const M=await qbMeta(true).catch(()=>null);if(!M){QBX.err='Please check your internet and try again.';redraw();return}
  if(!M.ok){QBX.err=qbMissing(M)?'soon':qbErr(M);redraw();return}QBX.meta=M;qbTidy3(QBX.F);if(top()&&top().key==='qb')redraw()}
A.qbSub1=el=>{QBX.F.s=[el.dataset.s];QBX.F.c=[];QBX.F.t=[];lsSet('cbt_qb_f',QBX.F);qbKeep();qbPick('qb','c')};
A.qbReset=()=>{QBX.F=Object.assign(qbEmptyF(),{ex:QBX.F.ex});QBFS.qb.F=QBX.F;lsSet('cbt_qb_f',QBX.F);qbKeep()};

/* ---------- practice: one question at a time ---------- */
let QR=null;
async function qrFetch(){const R=QR;if(!R||R.end||R.busy)return R&&R.busy;
  R.busy=rpc('cbt_qb_next',{p_f:R.f,p_skip:R.seen.slice(-400)}).then(r=>{if(!r||!r.ok){R.err=r||{ok:false};return}R.err=null;const it=(r.items||[]).filter(q=>qbUid(q.id)&&!R.seen.includes(q.id));it.forEach(q=>{R.q.push(q);R.seen.push(q.id)});if(!it.length)R.end=true}).catch(()=>{R.err={ok:false}}).finally(()=>{R.busy=null});return R.busy}
function qrView(){return {t:'Practice',get s(){return QR?`${QR.ok} of ${QR.n} right`:''},key:'qr',html:()=>{const R=QR;if(!R)return '';
  if(R.stop)return qrSum(false);
  if(R.i>=R.q.length){if(R.busy||(!R.end&&!R.err))return '<div class="card sk" style="height:300px"></div>';
   if(R.err&&!R.end)return `<div class="card empty"><span class="ti">${ic('info',22)}</span><b>Could not load questions</b><p>${esc3(qbErr(R.err))}</p><button class="btn sm" data-a="qrMore">Try again</button></div>`;
   return qrSum(true)}
  const q=R.q[R.i],a=R.ans[q.id],res=R.res[q.id],tags=[qbSub(q.s),q.c?qbChap(q.s,q.c):'',qbLbl(QB_LV,q.l),qbLbl(QB_TY,q.y),qbLbl(QB_SR,q.o)].filter(Boolean);
  return `<div class="pr-top"><span>Question <b>${R.i+1}</b></span><span class="pr-sc">${ic('check',14)}${R.ok}/${R.n} right${R.n?`, ${Math.round(R.ok/R.n*100)}%`:''}</span></div>
   <div class="pr-card"><article class="card qc3"><div class="qc3-h">${tags.map(t=>`<span class="tag">${esc3(t)}</span>`).join('')}</div><div class="qc3-q">${esc3(q.q||'')}</div>${qImg(q.img)}
    <div class="qc3-o">${(q.options||[]).map((o,j)=>{const cls=res?(j===res.answer?' c':j===a?' w':''):(a===j?' sel3':'');const tag=res||a!=null?'div':'button';return `<${tag} class="opt3${cls}"${tag==='button'?` data-a="qrPick" data-j="${j}"`:''}><span class="k">${LT[j]}</span><span class="ot">${esc3(o||'')}${qImg(q.oimg&&q.oimg[j],'oi')}</span>${res&&j===res.answer?ic('check',16):''}</${tag}>`}).join('')}</div>
    ${res?`<p class="qc3-r ${res.right?'ok':'bad'}">${res.right?'Correct! Well done.':`Not quite. The correct answer is ${LT[res.answer]}.`}</p>${res.explanation?`<div class="exp3"><b>Explanation</b><p>${esc3(res.explanation)}</p></div>`:''}`:a!=null?'<p class="hint">Checking…</p>':''}</article></div>
   <div class="pr-ft"><button class="btn ghost" data-a="qrEnd">End</button>${res?'<button class="btn" data-a="qrNext">Next'+ic('right',16)+'</button>':'<button class="btn ghost" data-a="qrNext">Skip</button>'}</div>`}}}
function qrSum(out){const R=QR,wrong=R.q.filter(q=>R.res[q.id]&&!R.res[q.id].right),p=R.n?Math.round(R.ok/R.n*100):0;
  return `<section class="mkh pr-end"><div class="mkh-ring" style="margin:0 auto">${rsRing(p,120)}<span><b>${p}%</b><small>right</small></span></div><h2>${out?'You practised every question of your choice!':'Practice finished'}</h2><p><b>${R.n}</b> answered, <b>${R.ok}</b> right, <b>${R.n-R.ok}</b> wrong.</p>
   <div class="g2" style="grid-template-columns:1fr 1fr;width:100%">${out?'':'<button class="btn gold" data-a="qrCont">Keep practising</button>'}<button class="btn ghost on-dark" data-a="back">Choose again</button></div></section>
   ${wrong.length?`<div class="sh" style="margin:0"><h2>Revise these</h2><span class="aside">${wrong.length}</span></div>${wrong.map(q=>{const r=R.res[q.id];return qCard(Object.assign({},q,{answer:r.answer,explanation:r.explanation,qidx:-1}),{id:'qw'+q.id,rev:true,pick:R.ans[q.id]}).replace('<b>Q0</b>','')}).join('')}`:''}`}
A.qbGo=()=>{QR={f:qbEff(QBX.F),q:[],seen:[],i:0,ans:{},res:{},n:0,ok:0,end:false,busy:null,err:null,stop:false};push(qrView());qrFetch().then(()=>{if(top()&&top().key==='qr')redraw()})};
A.qrPick=async el=>{const R=QR,q=R.q[R.i],j=+el.dataset.j;if(!q||R.ans[q.id]!=null)return;R.ans[q.id]=j;if(navigator.vibrate)navigator.vibrate(8);redraw();
  let r=null;try{r=await rpc('cbt_qb_check',{p_q:q.id,p_choice:j})}catch(e){}if(QR!==R)return;
  if(!r||!r.ok){delete R.ans[q.id];toast3(qbErr(r));redraw();return}
  R.res[q.id]={right:!!r.right,answer:+r.answer,explanation:String(r.explanation||'')};R.n++;if(r.right)R.ok++;try{QB.metaAt=0}catch(e){}$('#scrS').textContent=qrView().s;redraw()};
A.qrNext=()=>{const R=QR;R.i++;$('#scrB').scrollTop=0;if(R.i>=R.q.length){redraw();qrFetch().then(()=>{if(QR===R)redraw()})}else{redraw();if(R.q.length-R.i<=3)qrFetch()}};
A.qrMore=()=>{qrFetch().then(()=>redraw());redraw()};
A.qrEnd=()=>{QR.at=QR.res[(QR.q[QR.i]||{}).id]?QR.i+1:QR.i;QR.stop=true;redraw();$('#scrB').scrollTop=0;QBX.meta=null;qbMeta(true).then(M=>{if(M&&M.ok)QBX.meta=M}).catch(()=>{})};
A.qrCont=()=>{QR.stop=false;QR.i=Math.min(QR.at||0,QR.q.length);$('#scrB').scrollTop=0;redraw();if(QR.q.length-QR.i<=3)qrFetch().then(()=>{if(top()&&top().key==='qr')redraw()})};

/* ---------- test generator: your tests ---------- */
let GX=null;
function genCard3(t){const st=genState(t),f=(t.opts&&t.opts.f)||{},what=[(f.s||[]).map(qbSub).join(' + ')||'All subjects',(f.c||[]).length?`${f.c.length} chapter${f.c.length>1?'s':''}`:'',(f.l||[]).map(k=>qbLbl(QB_LV,k)).join('/')].filter(Boolean).join(', '),id=esc3(t.id);
  const top3=`<div class="tc3-top">${st==='done'?'<span class="st ok">Completed</span>':st==='run'?'<span class="st live">In progress</span>':st==='live'?'<span class="st live">Live now</span>':'<span class="st gold">Scheduled</span>'}<span class="mut">${st==='done'?qbWhen(t.done):st==='run'?'Ends '+qbWhen(t.ends):st==='live'?'Opened '+qbWhen(t.at):qbWhen(t.at)}</span></div>`;
  const act=st==='done'?['chart','Result',`data-a="genRes" data-id="${id}"`]:st==='soon'?['clock','Soon','disabled']:['play',st==='run'?'Resume':'Start',`data-a="genGo" data-id="${id}"`];
  return `<article class="card tc3"><div class="tc3-b">${top3}<h3>${esc3(t.title)}</h3><p class="tc3-m">${ic('list',15)}<span>${t.n} Questions</span><i></i><span>${t.dur} Mins</span><i></i><span>+${t.plus} / −${t.minus}</span></p><p class="tc3-m"><span>${esc3(what)}</span></p>
   ${st==='done'?`<p class="tc3-m"><span><b style="color:var(--tx)">${+t.score} / ${t.max}</b></span><span class="c" style="color:var(--ok)">${t.correct} right</span><span style="color:var(--err)">${t.wrong} wrong</span></p>`:''}</div>
   <button class="tc3-go${act[2]==='disabled'?' off':''}" ${act[2]}><span>${ic(act[0],20)}</span><small>${act[1]}</small></button>
   <div class="tc3-f">${st==='done'?`<button data-a="genAgain" data-id="${id}">Retake</button>`:''}${st==='soon'?`<button data-a="genMove" data-id="${id}">Change time</button>`:''}${st==='done'||st==='run'?'':`<button data-a="genDel" data-id="${id}">Delete</button>`}</div></article>`}
function genView(){return {t:'Test generator',s:'Make and schedule your own tests',key:'gen',html:()=>{
  if(GX&&GX.err)return `<div class="card empty"><span class="ti">${ic('info',22)}</span><b>${GX.err==='soon'?'Coming soon':'Could not load'}</b><p>${GX.err==='soon'?'The test generator is being set up. Please check again later.':esc3(GX.err)}</p></div>`;
  if(!GX)return '<div class="card sk" style="height:160px"></div><div class="card sk" style="height:200px"></div>';
  const L=QB.list||[],g={run:[],live:[],soon:[],done:[]};L.forEach(t=>g[genState(t)].push(t));g.soon.sort((a,b)=>a.at-b.at);
  const avg=g.done.length?Math.round(g.done.reduce((s,t)=>s+(t.max?Math.max(0,t.score/t.max):0),0)/g.done.length*100):0;
  return `<section class="mkh"><div class="mkh-top"><div><small>TEST GENERATOR</small><b style="font-size:26px;line-height:1.2">Your own tests</b><span>Choose chapters, questions and time. Start now or schedule it.</span></div><span class="ti qbic">${ic('spark',28)}</span></div>
    ${g.done.length?`<div class="mkh-st"><div><b>${g.done.length}</b><small>Taken</small></div><div><b>${avg}%</b><small>Average</small></div><div><b>${g.soon.length}</b><small>Scheduled</small></div></div>`:''}<button class="btn gold lg" data-a="genNew">${ic('spark',17)}Create a new test</button></section>
   ${[['run','In progress'],['live','Live now'],['soon','Scheduled'],['done','Completed']].map(([k,h])=>g[k].length?`<div class="stack" style="gap:12px"><p class="gh">${h} <span>${g[k].length}</span></p>${g[k].map(genCard3).join('')}</div>`:'').join('')}
   ${L.length?'':`<div class="card empty"><span class="ti">${ic('cal',22)}</span><b>No tests yet</b><p>Create your first test. It goes live at the time you choose, and you get a full result with solutions.</p></div>`}
   <button class="card rsc" data-a="qbOpen"><span class="rsc-n">PRACTICE</span><b>Question bank</b><small>Unlimited practice with answers and explanations</small>${ic('right',18)}</button>`}}}
async function openGen(){closeLayer();GX=null;if(!(top()&&top().key==='gen'))push(genView());else redraw();
  const r=await genList(true).catch(()=>null);if(!r){GX={err:'Please check your internet and try again.'};redraw();return}
  GX=r.ok?{}:{err:qbMissing(r)?'soon':qbErr(r)};if(top()&&top().key==='gen')redraw()}
A.genOpen=()=>openGen();A.qbOpen=()=>openQB();
A.genGo=el=>{closeLayer();unwind(()=>{genStart(el.dataset.id)})};
A.genAgain=async el=>{let r=null;try{r=await rpc('cbt_gen_create',{p_d:{copy:el.dataset.id}})}catch(e){}if(!r||!r.ok){toast3(qbErr(r));return}QB.list=null;unwind(()=>genStart(r.id))};
A.genDel=el=>{const id=el.dataset.id;openSheet(`<h2 id="sheetT">Delete this test?</h2><p class="sub">It will be removed from your list.</p><div class="sheet-ft"><button class="btn ghost" data-a="close">Keep</button><button class="btn danger3" data-a="genDelGo" data-id="${esc3(id)}">Delete</button></div>`)};
A.genDelGo=async el=>{closeLayer();let r=null;try{r=await rpc('cbt_gen_edit',{p_id:el.dataset.id,p_action:'delete',p_at:null})}catch(e){}if(!r||!r.ok){toast3(qbErr(r));return}toast3('Deleted');openGen()};
const genTimes=()=>{const o=[];for(let m=0;m<1440;m+=15){let h=Math.floor(m/60),ap=h>=12?'PM':'AM';h=h%12||12;o.push([m,`${h}:${String(m%60).padStart(2,'0')} ${ap}`])}return o};
const genDays3=()=>{const o=[],t=new Date();t.setHours(0,0,0,0);for(let i=0;i<60;i++){const d=new Date(t.getTime()+i*DAY);o.push([d.getTime(),i===0?'Today':i===1?'Tomorrow':fD(d,{weekday:'short',day:'numeric',month:'short'})])}return o};
A.genMove=el=>{const t=(QB.list||[]).find(x=>x.id===el.dataset.id);if(!t)return;const d=new Date(t.at),day=new Date(d).setHours(0,0,0,0),hm=Math.min(1425,d.getHours()*60+Math.ceil(d.getMinutes()/15)*15);
  openSheet(`<h2 id="sheetT">Change the time</h2><p class="sub">${esc3(t.title)}</p><div class="g2"><label class="fl"><span>Day</span><select class="inp" id="mvD">${genDays3().map(([v,l])=>`<option value="${v}"${v===day?' selected':''}>${esc3(l)}</option>`).join('')}</select></label><label class="fl"><span>Time</span><select class="inp" id="mvT">${genTimes().map(([v,l])=>`<option value="${v}"${v===hm?' selected':''}>${l}</option>`).join('')}</select></label></div>
   <div class="sheet-ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="genMoveGo" data-id="${esc3(t.id)}">Save</button></div>`)};
A.genMoveGo=async el=>{const at=+sheet.querySelector('#mvD').value+(+sheet.querySelector('#mvT').value)*60000;if(at<Date.now()-60000){toast3('Choose a time in the future');return}closeLayer();
  let r=null;try{r=await rpc('cbt_gen_edit',{p_id:el.dataset.id,p_action:'reschedule',p_at:at+(QB.off||0)})}catch(e){}if(!r||!r.ok){toast3(qbErr(r));return}toast3('Moved to '+qbWhen(at));openGen()};

/* ---------- create a test ---------- */
let GF=null;
const GN=[10,20,30,45,60,90,180],GD=[15,30,45,60,90,120,180];
function genNewView(){return {t:'Create your test',s:'',key:'gnew',html:()=>{if(!QBX.meta)return '<div class="card sk" style="height:300px"></div>';const F=GF,av=qbN(F.f);
  return `<label class="fl card p"><span>Test name</span><input class="inp" id="gnT" maxlength="80" placeholder="e.g. Physics, Kinematics revision" value="${esc3(F.title)}"></label>
   <section class="stack" style="gap:10px"><p class="gh">1. What to ask</p><div class="card p">${qbFilter(F.f,'gen')}<p class="hint" style="margin:12px 0 0"><b style="color:var(--tx)">${fmtN(av)}</b> questions available</p></div></section>
   <section class="stack" style="gap:10px"><p class="gh">2. Questions, time and marks</p><div class="card p stack" style="gap:16px">
    <div class="fl"><span>Number of questions</span><div class="chips wrap">${GN.map(n=>`<button class="${F.n===n?'on':''}" data-a="gnN" data-v="${n}">${n}</button>`).join('')}</div></div>
    <div class="fl"><span>Time (minutes)</span><div class="chips wrap">${GD.map(n=>`<button class="${F.dur===n?'on':''}" data-a="gnD" data-v="${n}">${n}</button>`).join('')}</div><p class="hint" style="margin:0">${av&&av<F.n?`Only ${av} questions match, so your test will have ${av}.`:`About ${Math.round(F.dur*60/F.n)} seconds per question.`}</p></div>
    <div class="fl"><span>Marking</span><div class="seg"><button class="${F.mark==='4'?'on':''}" data-a="gnM" data-v="4">+4 / −1</button><button class="${F.mark==='1'?'on':''}" data-a="gnM" data-v="1">+1, no minus</button></div></div>
    <div class="fl"><span>Question order</span><div class="seg"><button class="${F.order==='mix'?'on':''}" data-a="gnO" data-v="mix">Mixed</button><button class="${F.order==='subject'?'on':''}" data-a="gnO" data-v="subject">Subject by subject</button></div></div></div></section>
   <section class="stack" style="gap:10px"><p class="gh">3. When</p><div class="card p stack" style="gap:14px"><div class="seg"><button class="${F.when==='now'?'on':''}" data-a="gnW" data-v="now">Start now</button><button class="${F.when==='later'?'on':''}" data-a="gnW" data-v="later">Schedule</button></div>
    ${F.when==='later'?`<div class="g2"><label class="fl"><span>Day</span><select class="inp" id="gnDay">${genDays3().map(([v,l])=>`<option value="${v}"${v===F.day?' selected':''}>${esc3(l)}</option>`).join('')}</select></label><label class="fl"><span>Time</span><select class="inp" id="gnTime">${genTimes().map(([v,l])=>`<option value="${v}"${v===F.hm?' selected':''}>${l}</option>`).join('')}</select></label></div><p class="hint" style="margin:0">It goes live at this time. Open the app then and tap Start; your timer starts when you start.</p>`:''}</div></section>
   <div class="buybar"><span><b>${Math.min(F.n,av)}</b> <span class="mut" style="font-size:13px">questions, ${F.dur} min</span></span><button class="btn" data-a="gnGo"${av<5?' disabled':''}>${ic('spark',16)}${F.when==='later'?'Schedule test':'Create and start'}</button></div>`},
  after:()=>{const t=$('#gnT');t&&t.addEventListener('input',()=>{GF.title=t.value});const d=$('#gnDay');d&&d.addEventListener('change',()=>{GF.day=+d.value});const m=$('#gnTime');m&&m.addEventListener('change',()=>{GF.hm=+m.value})}}}
async function openGenNew(){const def=new Date(Date.now()+36e5);def.setMinutes(0,0,0);
  GF=GF||{title:'',f:Object.assign(qbEmptyF(),{ex:qbExamDef()}),n:30,dur:45,durAuto:true,mark:'4',order:'mix',when:'now',day:new Date(def).setHours(0,0,0,0),hm:def.getHours()*60};
  QBFS.gen={F:GF.f,after:qbKeep};push(genNewView());if(!QBX.meta){const M=await qbMeta().catch(()=>null);if(M&&M.ok){QBX.meta=M;redraw()}else{toast3(M&&qbMissing(M)?'The test generator is being set up.':'Could not load. Please try again.');back()}}}
A.genNew=()=>openGenNew();
A.gnN=el=>{GF.n=+el.dataset.v;if(GF.durAuto)GF.dur=Math.min(360,Math.max(5,Math.round(GF.n*1.5/5)*5));qbKeep()};
A.gnD=el=>{GF.dur=+el.dataset.v;GF.durAuto=false;qbKeep()};
A.gnM=el=>{GF.mark=el.dataset.v;qbKeep()};A.gnO=el=>{GF.order=el.dataset.v;qbKeep()};A.gnW=el=>{GF.when=el.dataset.v;qbKeep()};
A.gnGo=async el=>{const F=GF;let at=Date.now();if(F.when==='later'){at=F.day+F.hm*60000;if(at<Date.now()-60000){toast3('Choose a time in the future');return}}
  el.disabled=true;const f=qbEff(F.f);if(!F.f.s.length)f.all=1;let r=null;
  try{r=await rpc('cbt_gen_create',{p_d:{title:F.title.trim()||genAutoTitle(f),f,n:F.n,dur:F.dur,plus:F.mark==='4'?4:1,minus:F.mark==='4'?1:0,order:F.order,at:F.when==='later'?at+(QB.off||0):0}})}catch(e){}
  if(!r||!r.ok){el.disabled=false;toast3(qbErr(r));return}
  GF=null;QB.list=null;try{if(AUTH)LS.set('cbt_gen_has_'+AUTH.mobile,1)}catch(e){}if(r.want&&r.n<r.want)toast3(`Only ${r.n} questions matched, so your test has ${r.n}.`);
  if(F.when==='later'){toast3('Test scheduled for '+qbWhen(at));back();setTimeout(openGen,350)}else unwind(()=>genStart(r.id))};

/* ---------- a generated test's result ---------- */
let GR=null,GRF='all';
function genResView(){return {t:'Result',get s(){return GR?GR.test.title:''},key:'gres',html:()=>{if(!GR)return '<div class="card sk" style="height:240px"></div>';
  const t=GR.test,Q=GR.questions||[],pc=t.max?Math.max(0,Math.round(t.score/t.max*100)):0,att=t.correct+t.wrong,acc=att?Math.round(t.correct/att*100):0;
  const by=(key,name)=>{const m={};Q.forEach(q=>{const k=key(q),o=m[k]=m[k]||{name:name(q),n:0,c:0,w:0};o.n++;if(q.my!=null){if(q.my===q.a)o.c++;else o.w++}});return Object.values(m)};
  const subs=by(q=>q.s,q=>qbSub(q.s)),chs=by(q=>q.s+'|'+q.c,q=>qbChap(q.s,q.c)).sort((a,b)=>a.c/a.n-b.c/b.n);
  const row=o=>`<div class="card rs-sub"><div class="rs-sub-h"><b>${esc3(o.name)}</b><span>${Math.round(o.c/o.n*100)}% right</span></div><div class="stk3"><i class="c" style="width:${o.c*100/o.n}%"></i><i class="w" style="width:${o.w*100/o.n}%"></i></div><p class="rs-sub-m"><span class="c">${o.c} correct</span><span class="w">${o.w} wrong</span><span>${o.n-o.c-o.w} skipped</span></p></div>`;
  const show=Q.map((q,i)=>[q,i]).filter(([q])=>GRF==='all'||(GRF==='c'&&q.my===q.a)||(GRF==='w'&&q.my!=null&&q.my!==q.a)||(GRF==='s'&&q.my==null));
  return `<section class="rsh"><div class="rsh-top"><div class="mkh-ring">${rsRing(pc,132)}<span><b>${+t.score}</b><small>of ${t.max}</small></span></div><div class="rsh-t"><small>${esc3(t.title)}</small><h2>${pc>=75?'Excellent work!':pc>=50?'Good effort!':'Keep practising!'}</h2><p>${pc}% score · ${acc}% accuracy</p></div></div>
    <div class="rsh-st"><div><b class="c">${t.correct}</b><small>Correct</small></div><div><b class="w">${t.wrong}</b><small>Wrong</small></div><div><b>${t.skipped}</b><small>Skipped</small></div><div><b>${t.n}</b><small>Questions</small></div></div></section>
   <div class="g2" style="grid-template-columns:1fr 1fr"><button class="btn" data-a="genAgain" data-id="${esc3(t.id)}">Retake</button><button class="btn ghost" data-a="genNew">New test</button></div>
   <div class="sh" style="margin:0"><h2>Subjects</h2></div>${subs.map(row).join('')}
   ${chs.length>1?`<div class="sh" style="margin:0"><h2>Chapters</h2><span class="aside">Weakest first</span></div>${chs.map(row).join('')}`:''}
   <div class="sh" style="margin:0"><h2>Solutions</h2></div>
   <div class="seg">${[['all','All',Q.length],['w','Wrong',t.wrong],['s','Skipped',t.skipped],['c','Correct',t.correct]].map(([k,l,n])=>`<button class="${GRF===k?'on':''}" data-a="grF" data-v="${k}">${l}<small>${n}</small></button>`).join('')}</div>
   ${show.length?show.map(([q,i])=>qCard({q:q.q,img:q.img,options:q.options,oimg:q.oimg,answer:q.a,explanation:q.e,qidx:i},{id:'gq'+i,rev:true,pick:q.my,badge:`${q.my==null?'<span class="st">Skipped</span>':q.my===q.a?'<span class="st ok">Correct</span>':'<span class="st err">Wrong</span>'}<span class="tag">${esc3(qbSub(q.s))}</span>`})).join(''):'<div class="card empty"><b>Nothing here</b></div>'}`}}}
async function openGenRes(id){if(!qbUid(id))return;GR=null;GRF='all';push(genResView());let r=null;try{r=await rpc('cbt_gen_result',{p_id:id})}catch(e){}
  if(!r||!r.ok){if(r&&r.error==='not_done'){back();unwind(()=>genStart(id));return}back();toast3(qbErr(r));return}GR=r;$('#scrS').textContent=r.test.title;redraw()}
A.genRes=el=>openGenRes(el.dataset.id);A.grF=el=>{GRF=el.dataset.v;qbKeep()};
/* classic addresses that open these pages in the new design */
const V3H=[[/^#\/qb(\/go)?$/,()=>openQB()],[/^#\/gen$/,()=>openGen()],[/^#\/gen\/new$/,()=>openGenNew()],[/^#\/gen\/r\/([0-9a-f-]{36})$/,m=>openGenRes(m[1])]];

/* ================= PYQ ANALYZER in the new design =================
   Same data as the classic page (app11.js): cbt_pyq_summary for the exam, cbt_pyq_chapter for one chapter,
   the PQ state, the syllabus (PYQ_SYL) and the classic helpers pqSummary, pqAgg, pqYears, pqChap. */
const PQS={hi:0,lo:0};
const pqWt=n=>!n?'':n>=PQS.hi?'<span class="pqw3 h">High</span>':n>PQS.lo?'<span class="pqw3 m">Medium</span>':'<span class="pqw3 l">Low</span>';
function pqMini3(o,Y){const mx=Math.max(1,...Y.map(y=>o&&o.y[y]||0));return `<span class="pqm3" aria-hidden="true">${Y.map(y=>{const n=o&&o.y[y]||0;return `<i class="${n?'':'z'}" style="--h:${n?Math.max(.18,n/mx).toFixed(2):.08}"></i>`}).join('')}</span>`}
function pyqView(){return {t:'PYQ Analyzer',get s(){try{return PYQ_SYL[PQ.exam].name}catch(e){return ''}},key:'pyq',html:()=>{
  const E=PYQ_SYL,ex=E[PQ.exam];if(!ex||ex.soon)return '';
  if(!PQ.sum)return '<div class="card sk" style="height:200px"></div><div class="card sk" style="height:320px"></div>';
  const A=pqAgg(),S=pqSubj(),Y=pqYears(),chs=S.chapters.map(c=>({c,o:A.ch[c.id]})),total=(PQ.sum||[]).reduce((a,r)=>a+r[5],0);
  const tots=chs.map(x=>x.o?x.o.n:0).filter(Boolean).sort((a,b)=>b-a);PQS.hi=tots[Math.floor(tots.length*.25)]||1;PQS.lo=tots[Math.floor(tots.length*.7)]||0;
  const top=chs.filter(x=>x.o).sort((a,b)=>b.o.n-a.o.n).slice(0,6),tmx=Math.max(1,...top.map(x=>x.o.n));
  const row=({c,o})=>`<button class="pqr3" data-a="pqCh" data-id="${esc3(c.id)}"><span class="pqr3-t"><b>${esc3(c.name)}</b><small>${o?`${o.n} Qs · ${Object.keys(o.y).length} yr${Object.keys(o.y).length>1?'s':''} · ${o.p.size} paper${o.p.size>1?'s':''}`:'No questions yet'}${c.old?' · <em>not in current syllabus</em>':''}</small></span>${pqWt(o&&o.n)}${pqMini3(o,Y.slice(-8))}${ic('right',16)}</button>`;
  const grp=cls=>{let l=chs.filter(x=>x.c.cls===cls);if(!l.length)return '';if(PQ.sort==='most')l=[...l].sort((a,b)=>(b.o?b.o.n:0)-(a.o?a.o.n:0));return `<div class="stack" style="gap:10px"><p class="gh">Class ${cls} <span>${l.length} chapters</span></p><div class="card pql3">${l.map(row).join('')}</div></div>`};
  return `<section class="mkh"><div class="mkh-top"><div><small>${esc3(ex.name)} PYQ</small><b>${fmtN(total)}</b><span>questions from ${A.papers.size} paper${A.papers.size===1?'':'s'}, chapter-wise</span></div><span class="ti qbic">${ic('pyq',30)}</span></div>
    <div class="pqx3">${Object.keys(E).map(k=>`<button class="${k===PQ.exam?'on':''}${E[k].soon?' soon':''}" ${E[k].soon?'disabled':`data-a="pqEx" data-v="${k}"`}>${esc3(E[k].name)}${E[k].soon?'<small>Soon</small>':''}</button>`).join('')}</div></section>
   <div class="seg">${ex.subjects.map(s=>`<button class="${s.id===S.id?'on':''}" data-a="pqSub" data-v="${s.id}">${esc3(s.name)}<small>${fmtN(A.sub[s.id]||0)}</small></button>`).join('')}</div>
   ${PQ.err?'<div class="card empty"><b>Being set up</b><p>PYQ data is being added. Please check back soon.</p></div>':''}
   ${top.length?`<section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Most asked chapters</h2><span class="aside">${esc3(S.name)}</span></div>
     <div class="card p pqt3">${top.map((x,i)=>`<button data-a="pqCh" data-id="${esc3(x.c.id)}"><span class="pqt3-n">${i+1}</span><span class="pqt3-b"><b>${esc3(x.c.name)}</b><span class="bar"><i style="--p:${(x.o.n/tmx).toFixed(3)}"></i></span></span><em>${x.o.n}</em></button>`).join('')}</div></section>`
    :`<div class="card empty"><span class="ti">${ic('pyq',22)}</span><b>Questions are being added</b><p>${esc3(S.name)} questions are added paper by paper. The chapter list is ready below.</p></div>`}
   <div class="sh" style="margin:0;align-items:center"><h2>All chapters</h2><div class="seg pqs3"><button class="${PQ.sort!=='most'?'on':''}" data-a="pqSort" data-v="ncert">NCERT order</button><button class="${PQ.sort==='most'?'on':''}" data-a="pqSort" data-v="most">Most asked</button></div></div>
   ${grp(11)}${grp(12)}`}}}
async function openPyq(exam){closeLayer();if(exam&&PYQ_SYL[exam]&&!PYQ_SYL[exam].soon)PQ.exam=exam;if(!(top()&&top().key==='pyq'))push(pyqView());else redraw();
  await pqSummary().catch(()=>{});if(top()&&top().key==='pyq')redraw()}
A.pyqOpen=()=>openPyq();
A.pqEx=async el=>{if(PQ.exam===el.dataset.v)return;PQ.exam=el.dataset.v;PQ.sum=null;PQ.ch={};redraw();await pqSummary(true).catch(()=>{});redraw()};
A.pqSub=el=>{PQ.sub=el.dataset.v;lsSet('cbt_pq_sub',PQ.sub);qbKeep()};
A.pqSort=el=>{PQ.sort=el.dataset.v;qbKeep()};
A.pqCh=el=>openPyqCh(el.dataset.id);

/* ---------- one chapter ---------- */
let PQC=null;
const PQCOL=['#6d5bd0','#0f8fd1','#14966b','#d08a12','#d14848','#9b5bd0','#0f9d93'];
function pqCard3(q){const op=PQ.open[q.id],reps=(q.rep||[]).filter(Boolean),r=reps.length>1;
  return `<article class="card qc3${r?' pqrep3':''}"><div class="qc3-h"><span class="tag">${esc3(q.p)}${q.n?' · Q'+q.n:''}</span>${q.t?`<span class="tag mutd">${esc3(q.t)}</span>`:''}${r?`<span class="st gold">${ic('swap',13)}Asked ${reps.length}×</span>`:''}</div>
   ${r?`<p class="pqal3">Also asked in ${reps.filter(p=>p!==q.p).map(p=>`<b>${esc3(p)}</b>`).join(', ')}</p>`:''}
   <div class="qc3-q">${esc3(q.q||'')}</div>${q.img?'<p class="hint">This question has a diagram. See the original paper.</p>':''}
   <div class="qc3-o">${(q.o||[]).map((o,j)=>o?`<div class="opt3${op&&j===q.a?' c':''}"><span class="k">${LT[j]}</span><span class="ot">${esc3(o)}</span>${op&&j===q.a?ic('check',16):''}</div>`:'').join('')}</div>
   ${op?(q.e?`<div class="exp3"><b>Explanation</b><p>${esc3(q.e)}</p></div>`:''):`<button class="btn ghost sm" data-a="pqAns" data-id="${esc3(q.id)}">Show answer</button>`}</article>`}
function pyqChView(){return {get t(){return PQC?PQC.c.name:'Chapter'},get s(){return PQC?`Class ${PQC.c.cls} · ${PQC.s.name}`:''},key:'pyqc',html:()=>{const X=PQC;if(!X)return '';const L=PQ.ch[X.c.id];
  if(!L)return '<div class="card sk" style="height:150px"></div><div class="card sk" style="height:220px"></div>';
  const c=X.c;if(!L.length)return `<div class="card empty"><span class="ti">${ic('pyq',22)}</span><b>No questions added yet</b><p>Questions of this chapter are being added. Its topics:</p></div><div class="card p chips wrap">${c.topics.map(t=>`<span class="tag mutd">${esc3(t.name)}</span>`).join('')}</div>`;
  const by={};L.forEach(q=>{by[q.y]=(by[q.y]||0)+1});const Y0=pqYears(),dy=Object.keys(by).map(Number),yMax=Math.max(...Y0,...dy),yMin=Math.min(...dy,yMax-9),Y=Y0.concat(dy).filter((y,i,a)=>y>=yMin&&a.indexOf(y)===i).sort((a,b)=>a-b);const ymx=Math.max(1,...Object.values(by));
  const tp={};c.topics.forEach(t=>{tp[t.name]=0});L.forEach(q=>{tp[q.t||'Other']=(tp[q.t||'Other']||0)+1});
  const tl=Object.entries(tp).sort((a,b)=>b[1]-a[1]),tmx=Math.max(1,...tl.map(x=>x[1]));
  const rep=L.filter(q=>q.rep&&q.rep.length>1),repN=new Set(rep.map(q=>q.k)).size,yrs=Object.keys(by).map(Number),last=yrs.length?Math.max(...yrs):null,papers=new Set(L.map(q=>q.p)).size;
  const f=PQ.f,shown=L.filter(q=>(!f.t||(q.t||'Other')===f.t)&&(!f.y||q.y==f.y)&&(!f.rep||(q.rep&&q.rep.length>1))),lim=PQ.lim||20;
  return `<section class="mkh"><div class="mkh-top"><div><small>CHAPTER ANALYSIS</small><b style="font-size:24px;line-height:1.25">${esc3(c.name)}</b><span>${last?`Last asked in ${last}`:''}${c.old?' · not in current syllabus':''}</span></div></div>
    <div class="mkh-st pqk3"><div><b>${L.length}</b><small>Questions</small></div><div><b>${papers?(L.length/papers).toFixed(1):0}</b><small>Per paper</small></div><div><b>${yrs.length}</b><small>Years</small></div><div><b>${repN}</b><small>Repeated</small></div></div></section>
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Year-wise</h2><span class="aside">Tap a year</span></div>
    <div class="card p"><div class="pqy3">${Y.map(y=>`<button class="${f.y==y?'on':''}${by[y]?'':' z'}" data-a="pqYr" data-v="${y}" aria-label="${y}: ${by[y]||0} questions"><b>${by[y]||''}</b><i style="--h:${by[y]?Math.max(.08,by[y]/ymx).toFixed(2):.03}"></i><span>'${String(y).slice(2)}</span></button>`).join('')}</div></div></section>
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Topic weightage</h2><span class="aside">Tap a topic</span></div>
    <div class="card p pqtp3">${tl.map(([n,v],i)=>`<button class="${f.t===n?'on':''}" data-a="pqTp" data-v="${esc3(n)}"><span><b>${esc3(n)}</b><em>${v}<small> · ${Math.round(v*100/L.length)}%</small></em></span><span class="bar"><i style="--p:${(v/tmx).toFixed(3)};background:${PQCOL[i%PQCOL.length]}"></i></span></button>`).join('')}</div></section>
   <div class="sh" style="margin:0"><h2>Questions</h2><span class="aside">${shown.length}</span></div>
   <div class="chips">${[['','All topics'],...tl.filter(x=>x[1]).map(x=>[x[0],x[0]])].map(([k,t])=>`<button class="${f.t===k?'on':''}" data-a="pqTp" data-v="${esc3(k)}" data-set="1">${esc3(t)}</button>`).join('')}</div>
   <div class="chips"><button class="${f.y?'':'on'}" data-a="pqYr" data-v="">All years</button>${[...yrs].sort((a,b)=>b-a).map(y=>`<button class="${f.y==y?'on':''}" data-a="pqYr" data-v="${y}">${y}</button>`).join('')}<button class="${f.rep?'on':''}" data-a="pqRep">Repeated only<small>${rep.length}</small></button></div>
   ${shown.length?shown.slice(0,lim).map(pqCard3).join('')+(shown.length>lim?`<button class="btn ghost" data-a="pqMore">Load more (${shown.length-lim} left)</button>`:''):'<div class="card empty"><b>Nothing here</b><p>No questions match this filter.</p></div>'}`}}}
async function openPyqCh(cid){const X=pqChap(cid);if(!X){toast3('Chapter not found');return}
  PQ.sub=X.s.id;if(PQ.cid!==cid){PQ.cid=cid;PQ.f={t:'',y:'',rep:0};PQ.open={};PQ.lim=20}PQC=X;push(pyqChView());
  if(!PQ.sum)pqSummary().catch(()=>{});
  if(!PQ.ch[cid]){let r=null;try{r=await rpc('cbt_pyq_chapter',{p_exam:PQ.exam,p_chapter:cid})}catch(e){}if(!r||!r.ok){if(top()&&top().key==='pyqc'){back();toast3('Could not load this chapter. Please try again.')}return}PQ.ch[cid]=r.items||[]}
  if(top()&&top().key==='pyqc'&&PQC===X)redraw()}
A.pqYr=el=>{const v=el.dataset.v;PQ.lim=20;PQ.f.y=(v===''||PQ.f.y==v)?'':+v;qbKeep()};
A.pqTp=el=>{const v=el.dataset.v;PQ.lim=20;PQ.f.t=el.dataset.set?v:(PQ.f.t===v?'':v);qbKeep()};
A.pqRep=()=>{PQ.lim=20;PQ.f.rep=PQ.f.rep?0:1;qbKeep()};
A.pqMore=()=>{PQ.lim=(PQ.lim||20)+20;qbKeep()};
A.pqAns=el=>{PQ.open[el.dataset.id]=1;qbKeep()};
V3H.push([/^#\/pyq(\/([A-Z0-9]+))?$/,m=>openPyq(m[2])],[/^#\/pyq\/([A-Z0-9]+)\/([\w-]+)$/,m=>{if(PYQ_SYL[m[1]]&&!PYQ_SYL[m[1]].soon)PQ.exam=m[1];openPyqCh(m[2])}]);

/* ================= STUDY TRACKER in the new design =================
   The same tracker data as the classic page (app6.js / app9.js): weeks, subjects and tasks in cbt_trk_<mobile>,
   ticks per day in cbt_trkd_<mobile>, read and written through the classic helpers (trkLoad, trkSave, trkStats,
   trkW, trkId, trkDays, trkStreak, tDay). */
const TR3={sel:-1,flt:'all',undo:null,ut:0};
const TREM=['📘','⚡','🧪','📐','🌿','🧬','🌍','💻','📊','📖','🧠','🔬','📝','🎨','🔢','🗣️','⚖️','🏛️','💰','🎯'];
const TRCO=['#10b981','#6366f1','#f59e0b','#ec4899','#14b8a6','#f97316','#8b5cf6','#06b6d4','#ef4444','#84cc16','#3b82f6','#a855f7'];
const trSafe=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#6366f1';
function trRing(p,sz){const R=sz/2-7,C=2*Math.PI*R;return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" aria-hidden="true"><circle cx="${sz/2}" cy="${sz/2}" r="${R}" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="8"/><circle cx="${sz/2}" cy="${sz/2}" r="${R}" fill="none" stroke="var(--acc1)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-p/100)).toFixed(1)}" transform="rotate(-90 ${sz/2} ${sz/2})" class="mkr"/></svg>`}
function trTip(w){const s=trkStats(w);if(!w.subjects.length||!s.total)return '';let low=null,lp=101;
  w.subjects.forEach(x=>{const t=x.tasks.length;if(!t)return;const p=Math.round(x.tasks.filter(k=>k.done).length*100/t);if(p<lp){lp=p;low=x}});
  const nm=x=>`<b>${esc3(x.emoji+' '+x.name)}</b>`;
  return s.pct===100?['ok',`Week complete. All ${s.total} tasks done. Great work!`]:s.done===0?['',`${s.total} tasks are waiting. Start with ${nm(w.subjects.find(x=>x.tasks.length)||w.subjects[0])}.`]
   :low&&lp<30?['warn',`${nm(low)} needs attention. Only ${lp}% done.`]:s.pct>=75?['',`Almost there. Only ${s.total-s.done} task${s.total-s.done>1?'s':''} left.`]:['',`${s.pct}% done. Focus on ${low?nm(low):'pending tasks'} next.`]}
function trView(){return {t:'Study tracker',get s(){try{return trkW().label}catch(e){return ''}},key:'trk',right:()=>`<button class="ib" data-a="trMenu" aria-label="Tracker options">${ic('gear',19)}</button>`,html:()=>{
  const T=trkLoad(),w=T.weeks[T.cur],st=trkStats(w),o=trkDays(),td=o[tDay()]||0,sk=trkStreak(),wk=[];
  for(let k=6;k>=0;k--){const d=new Date();d.setDate(d.getDate()-k);wk.push({l:d.toLocaleDateString('en-IN',{weekday:'narrow'}),n:o[tDay(d)]||0,t:k===0})}const mx=Math.max(1,...wk.map(x=>x.n)),tip=trTip(w);
  let h=`<section class="mkh trh"><div class="trh-top"><div class="mkh-ring">${trRing(st.pct,104)}<span><b>${st.pct}%</b><small>done</small></span></div>
     <div class="trh-t"><button class="trwn" data-a="trRename"><b>${esc3(w.label)}</b>${ic('pen',14)}</button><p><b>${st.done}</b> done · <b>${st.total-st.done}</b> left · <b>${st.total}</b> tasks</p>
      <div class="trday"><span><b>${td}</b> today</span><span><b>${sk}</b> day streak</span></div></div></div>
    <div class="trwk">${wk.map(x=>`<div class="${x.t?'t':''}"><i class="${x.n?'':'z'}" style="--h:${x.n?Math.max(.16,x.n/mx).toFixed(2):.06}"></i><span>${x.l}</span></div>`).join('')}</div>
    <div class="trq"><button data-a="trGrowth">${ic('chart',17)}<span>Growth</span></button><button data-a="trTargets">${ic('target',17)}<span>Targets</span></button><button data-a="trWeeks">${ic('cal',17)}<span>Weeks</span></button><button data-a="trAddWeek">${ic('spark',17)}<span>New week</span></button></div></section>
   ${tip?`<div class="trtip ${tip[0]}">${ic(tip[0]==='ok'?'trophy':tip[0]==='warn'?'info':'target',18)}<p>${tip[1]}</p></div>`:''}
   <div class="chips trwks">${T.weeks.map((x,i)=>`<button class="${i===T.cur?'on':''}" data-a="trWeek" data-i="${i}">${esc3(x.label)}<small>${trkStats(x).pct}%</small></button>`).join('')}<button data-a="trAddWeek">${ic('spark',14)} Add</button></div>`;
  if(!w.subjects.length)return h+`<div class="card empty"><span class="ti">${ic('book',22)}</span><b>Add your subjects</b><p>Pick one to start, or add your own.</p>
    <div class="chips wrap" style="justify-content:center">${['Physics','Chemistry','Maths','Biology','English','Reasoning'].map(n=>`<button data-a="trQuick" data-v="${n}">${n}</button>`).join('')}</div><button class="btn" data-a="trSubj">Add a subject</button></div>`;
  h+=`<div class="chips"><button class="${TR3.sel===-1?'on':''}" data-a="trSel" data-i="-1">All subjects</button>${w.subjects.map((s,i)=>`<button class="${TR3.sel===i?'on':''}" data-a="trSel" data-i="${i}">${esc3(s.emoji)} ${esc3(s.name)}</button>`).join('')}<button data-a="trSubj">${ic('spark',14)} Subject</button></div>
   <div class="seg">${[['all','All'],['pending','Pending'],['done','Done']].map(([k,l])=>`<button class="${TR3.flt===k?'on':''}" data-a="trFlt" data-v="${k}">${l}</button>`).join('')}</div>`;
  w.subjects.forEach((s,si)=>{if(TR3.sel!==-1&&TR3.sel!==si)return;
    const d=s.tasks.filter(x=>x.done).length,t=s.tasks.length,p=t?Math.round(d*100/t):0,goal=T.goals[s.id];
    const rows=s.tasks.map((x,ti)=>({x,ti})).filter(r=>TR3.flt==='all'||(TR3.flt==='done'?r.x.done:!r.x.done));
    h+=`<article class="card trs" style="--sc:${trSafe(s.color)}"><div class="trs-h"><span class="trem">${esc3(s.emoji)}</span><span class="trs-t"><b>${esc3(s.name)}</b><small>${d} of ${t} done${goal?` · target ${goal}`:''}</small></span><em>${p}%</em><button class="trib" data-a="trDelSubj" data-i="${si}" aria-label="Remove ${esc3(s.name)}">${ic('trash',17)}</button></div>
     <span class="trbar"><i style="--p:${(p/100).toFixed(3)}"></i></span>
     <div class="trl">${rows.length?rows.map(r=>`<div class="trt${r.x.done?' dn':''}"><button class="trck" data-a="trTog" data-s="${si}" data-t="${r.ti}" aria-pressed="${!!r.x.done}" aria-label="Done">${ic('check',14)}</button><button class="trtx" data-a="trEdit" data-s="${si}" data-t="${r.ti}">${esc3(r.x.text)}</button><button class="trx" data-a="trDel" data-s="${si}" data-t="${r.ti}" aria-label="Delete task">${ic('x',15)}</button></div>`).join(''):`<p class="hint">${t?'Nothing here for this filter.':'No tasks yet. Add your first one below.'}</p>`}</div>
     <form class="tradd" data-s="${si}"><input class="inp" maxlength="120" placeholder="Add a task" aria-label="New task for ${esc3(s.name)}"><button class="btn sm">Add</button></form></article>`});
  return h},
  after:()=>{$$('#scrB .tradd').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const i=f.querySelector('input'),v=i.value.trim();if(!v)return;
    trkW().subjects[+f.dataset.s].tasks.push({id:trkId(),text:v.slice(0,120),done:false});trkSave();const si=f.dataset.s;qbKeep();const n=$(`#scrB .tradd[data-s="${si}"] input`);n&&n.focus({preventScroll:true})}));
    const a=$('#scrB .trwks .on');if(a)try{a.parentNode.scrollLeft=a.offsetLeft-a.parentNode.clientWidth/2+a.clientWidth/2}catch(e){}}}}
function openTracker(){closeLayer();trkLoad();TR3.sel=-1;TR3.flt='all';if(!(top()&&top().key==='trk'))push(trView());else redraw()}
const trDraw=()=>{if(top()&&top().key==='trk'){qbKeep();$('#scrS').textContent=trkW().label}};
A.trSel=el=>{TR3.sel=+el.dataset.i;qbKeep()};A.trFlt=el=>{TR3.flt=el.dataset.v;qbKeep()};
A.trWeek=el=>{const i=+el.dataset.i;if(i===trkLoad().cur)return;trkLoad().cur=i;TR3.sel=-1;trkSave();trDraw()};
A.trTog=el=>{const s=trkW().subjects[+el.dataset.s],t=s&&s.tasks[+el.dataset.t];if(!t)return;t.done=!t.done;
  if(t.done){t.at=Date.now();trkDays(1);if(navigator.vibrate)navigator.vibrate(12)}else{if(t.at&&tDay(new Date(t.at))===tDay())trkDays(-1);delete t.at}
  trkSave();trDraw();if(t.done){const all=trkStats(trkW());if(all.total&&all.done===all.total)toast3('Week complete! Amazing work');else if(s.tasks.every(x=>x.done))toast3(`${s.name} done for this week!`)}};
A.trDel=el=>{const s=trkW().subjects[+el.dataset.s],ti=+el.dataset.t,t=s&&s.tasks.splice(ti,1)[0];if(!t)return;TR3.undo={sid:s.id,ti,t};trkSave();trDraw();
  const b=$('#trUndo');if(b)b.remove();const u=document.createElement('div');u.id='trUndo';u.className='undo3';u.innerHTML='<span>Task deleted</span><button data-a="trUndo">Undo</button>';root.querySelector('#app3').appendChild(u);
  clearTimeout(TR3.ut);TR3.ut=setTimeout(()=>{u.remove();TR3.undo=null},4500)};
A.trUndo=()=>{const u=TR3.undo;TR3.undo=null;const b=$('#trUndo');if(b)b.remove();if(!u)return;const s=trkW().subjects.find(x=>x.id===u.sid);if(!s)return;s.tasks.splice(Math.min(u.ti,s.tasks.length),0,u.t);trkSave();trDraw()};
function trAsk(title,val,ph,cb){openSheet(`<h2 id="sheetT">${esc3(title)}</h2><form id="trAskF" class="stack" style="gap:14px;margin-top:6px"><input class="inp" id="trAskI" maxlength="120" value="${esc3(val||'')}" placeholder="${esc3(ph||'')}"><div class="sheet-ft" style="margin:0"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn">Save</button></div></form>`);
  const f=sheet.querySelector('#trAskF'),i=sheet.querySelector('#trAskI');setTimeout(()=>{i.focus();i.select()},120);f.addEventListener('submit',e=>{e.preventDefault();const v=i.value.trim();if(!v)return;closeLayer();cb(v)})}
function trConfirm(title,msg,ok,cb){openSheet(`<h2 id="sheetT">${esc3(title)}</h2><p class="sub">${msg}</p><div class="sheet-ft"><button class="btn ghost" data-a="close">No, keep it</button><button class="btn danger3" id="trYes">${esc3(ok)}</button></div>`);sheet.querySelector('#trYes').addEventListener('click',()=>{closeLayer();cb()})}
A.trEdit=el=>{const si=+el.dataset.s,ti=+el.dataset.t,t=trkW().subjects[si].tasks[ti];if(!t)return;trAsk('Edit task',t.text,'',v=>{t.text=v.slice(0,120);trkSave();trDraw()})};
A.trRename=()=>trAsk('Rename this week',trkW().label,'e.g. Week 3, Revision week',v=>{trkW().label=v.slice(0,30);trkSave();trDraw()});
A.trAddWeek=()=>{closeLayer();const prev=trkW(),n=trkLoad().weeks.length+1;trkLoad().weeks.push({id:'w'+trkId(),label:'Week '+n,subjects:prev.subjects.map(s=>({id:s.id,name:s.name,emoji:s.emoji,color:s.color,tasks:[]}))});trkLoad().cur=trkLoad().weeks.length-1;TR3.sel=-1;trkSave();trDraw();toast3('Week '+n+' added')};
A.trDelWeek=el=>{const i=+el.dataset.i,w=trkLoad().weeks[i];if(i<1||!w)return;const s=trkStats(w);
  trConfirm(`Delete ${w.label}?`,`This week${s.total?` and its <b>${s.total} task${s.total>1?'s':''}</b>`:''} will be deleted. This cannot be undone.`,'Yes, delete',()=>{trkLoad().weeks.splice(i,1);if(trkLoad().cur>=trkLoad().weeks.length)trkLoad().cur=trkLoad().weeks.length-1;else if(trkLoad().cur>i)trkLoad().cur--;trkSave();trDraw();toast3(w.label+' deleted')})};
A.trDelSubj=el=>{const si=+el.dataset.i,s=trkW().subjects[si];if(!s)return;trConfirm(`Remove ${s.name}?`,`It will be removed from this week${s.tasks.length?` with its <b>${s.tasks.length} task${s.tasks.length>1?'s':''}</b>`:''}.`,'Yes, remove',()=>{trkW().subjects.splice(si,1);TR3.sel=-1;trkSave();trDraw()})};
A.trQuick=el=>{const n=el.dataset.v,i=trkW().subjects.length,e=['⚡','🧪','📐','🌿','📖','🧠'],s={id:'s'+trkId(),name:n,emoji:e[i%e.length],color:TRCO[i%TRCO.length]};trkLoad().weeks.forEach(w=>w.subjects.push(Object.assign({tasks:[]},s)));trkSave();trDraw()};
let TRN=null;
function trSubjDraw(){const n=TRN;sheet.innerHTML=`<div class="grab"></div><h2 id="sheetT">Add a subject</h2>
  <div class="trprev" style="--sc:${n.color}"><span class="trem">${esc3(n.emoji)}</span><b id="trPn">${esc3(n.name||'Subject name')}</b></div>
  <input class="inp" id="trSn" maxlength="24" placeholder="e.g. Biology, Physics" value="${esc3(n.name)}">
  <p class="gh" style="margin:14px 0 8px">Icon</p><div class="trpick">${TREM.map(e=>`<button class="${e===n.emoji?'on':''}" data-e="${e}">${e}</button>`).join('')}</div>
  <p class="gh" style="margin:14px 0 8px">Colour</p><div class="trpick col">${TRCO.map(c=>`<button class="${c===n.color?'on':''}" data-c="${c}" style="background:${c}" aria-label="Colour"></button>`).join('')}</div>
  <button class="row trall" data-all><span><b>Add to every week</b><small>Otherwise only this week</small></span><span class="sw${n.all?' on':''}" aria-hidden="true"></span></button>
  <div class="sheet-ft"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-ok>Add subject</button></div>`;
  const i=sheet.querySelector('#trSn');i.addEventListener('input',()=>{n.name=i.value;sheet.querySelector('#trPn').textContent=i.value||'Subject name'})}
A.trSubj=()=>{TRN={name:'',emoji:TREM[0],color:TRCO[0],all:trkLoad().weeks.length>1};openSheet('');trSubjDraw();
  sheet.onclick=e=>{const n=TRN;if(!n)return;const b=e.target.closest('button');if(!b)return;
    if(b.dataset.e){n.emoji=b.dataset.e;trSubjDraw();return}if(b.dataset.c){n.color=b.dataset.c;trSubjDraw();return}
    if(b.hasAttribute('data-all')){n.all=!n.all;trSubjDraw();return}
    if(b.hasAttribute('data-ok')){const nm=(n.name||'').trim();if(!nm){toast3('Enter a subject name');return}const id='s'+trkId(),mk=()=>({id,name:nm,emoji:n.emoji,color:n.color,tasks:[]});
      if(n.all)trkLoad().weeks.forEach(w=>w.subjects.push(mk()));else trkW().subjects.push(mk());TRN=null;trkSave();closeLayer();trDraw();toast3('Subject added')}}};
A.trTargets=()=>{const T=trkLoad(),w=trkW();if(!w.subjects.length){toast3('Add a subject first');return}
  openSheet(`<h2 id="sheetT">Weekly targets</h2><p class="sub">How many tasks do you want to finish in each subject this week?</p><div class="stack" style="gap:10px">${w.subjects.map(s=>{const d=s.tasks.filter(x=>x.done).length,g=T.goals[s.id]||10,p=Math.min(100,Math.round(d*100/g));
    return `<div class="card p trg" style="--sc:${trSafe(s.color)}"><div class="trg-h"><span class="trem">${esc3(s.emoji)}</span><b>${esc3(s.name)}</b><input class="inp" type="number" min="1" max="999" inputmode="numeric" value="${g}" data-g="${esc3(s.id)}" aria-label="Target for ${esc3(s.name)}"></div><span class="trbar"><i style="--p:${(p/100).toFixed(3)}"></i></span><small>${d} of ${g} done</small></div>`}).join('')}</div>
    <div class="sheet-ft"><button class="btn" data-a="close">Done</button></div>`);
  sheet.querySelectorAll('[data-g]').forEach(i=>i.addEventListener('change',()=>{T.goals[i.dataset.g]=Math.max(1,Math.min(999,parseInt(i.value)||1));i.value=T.goals[i.dataset.g];trkSave();trDraw()}))};
A.trGrowth=()=>{const T=trkLoad(),W=T.weeks,cw=trkW(),P=W.map(w=>trkStats(w).pct),best=P.indexOf(Math.max(...P)),avg=Math.round(P.reduce((a,b)=>a+b,0)/Math.max(W.length,1));
  openSheet(`<h2 id="sheetT">Your growth</h2><p class="sub">How much of each week you finished</p>
   <div class="trgw">${W.map((w,i)=>`<div class="${i===T.cur?'on':''}"><b>${P[i]?P[i]+'%':''}</b><i style="--h:${Math.max(.04,P[i]/100).toFixed(2)}"></i><span>W${i+1}</span></div>`).join('')}</div>
   <div class="mkh-st trgs"><div><b>${W.length}</b><small>Weeks</small></div><div><b>${avg}%</b><small>Average</small></div><div><b>W${best+1}</b><small>Best week</small></div></div>
   <p class="gh" style="margin:16px 0 8px">Subjects · ${esc3(cw.label)}</p>${cw.subjects.map(s=>{const d=s.tasks.filter(x=>x.done).length,t=s.tasks.length,p=t?Math.round(d*100/t):0;return `<div class="trgr" style="--sc:${trSafe(s.color)}"><span class="trem">${esc3(s.emoji)}</span><span class="trgr-b"><b>${esc3(s.name)}</b><span class="trbar"><i style="--p:${(p/100).toFixed(3)}"></i></span></span><em>${p}%</em></div>`}).join('')||'<p class="hint">No subjects yet.</p>'}
   <div class="sheet-ft"><button class="btn" data-a="close">Close</button></div>`)};
A.trWeeks=()=>{const T=trkLoad();openSheet(`<h2 id="sheetT">All weeks</h2><div class="stack" style="gap:8px;margin-top:8px">${T.weeks.map((w,i)=>{const s=trkStats(w);return `<div class="trwr${i===T.cur?' on':''}"><button data-a="trWeekGo" data-i="${i}"><b>${esc3(w.label)}</b><span class="trbar"><i style="--p:${(s.pct/100).toFixed(3)}"></i></span><small>${s.done} of ${s.total} done</small></button>${i>0?`<button class="trib" data-a="trDelWeek" data-i="${i}" aria-label="Delete ${esc3(w.label)}">${ic('trash',17)}</button>`:''}</div>`}).join('')}</div>
  <div class="sheet-ft"><button class="btn ghost" data-a="close">Close</button><button class="btn" data-a="trAddWeek">New week</button></div>`)};
A.trWeekGo=el=>{closeLayer();A.trWeek(el)};
A.trCarry=()=>{closeLayer();const T=trkLoad(),i=T.cur;if(i<1){toast3('There is no previous week');return}const prev=T.weeks[i-1],cur=T.weeks[i];let n=0;
  prev.subjects.forEach(ps=>{const p=ps.tasks.filter(t=>!t.done);if(!p.length)return;let cs=cur.subjects.find(x=>x.id===ps.id);if(!cs){cs={id:ps.id,name:ps.name,emoji:ps.emoji,color:ps.color,tasks:[]};cur.subjects.push(cs)}
    p.forEach(t=>{if(!cs.tasks.some(x=>x.text===t.text)){cs.tasks.push({id:trkId(),text:t.text,done:false});n++}})});
  trkSave();trDraw();toast3(n?`${n} pending task${n>1?'s':''} moved from ${prev.label}`:'No pending tasks in '+prev.label)};
A.trResetWeek=()=>{closeLayer();setTimeout(()=>trConfirm('Reset this week?','All tasks of this week will be marked as pending again.','Yes, reset',()=>{trkW().subjects.forEach(s=>s.tasks.forEach(t=>{t.done=false;delete t.at}));trkSave();trDraw();toast3('Week reset')}),250)};
A.trResetAll=()=>{closeLayer();setTimeout(()=>trConfirm('Delete everything?','<b>All weeks, subjects and tasks</b> will be deleted. This cannot be undone.','Yes, delete all',()=>{const T=trkLoad();LS.del(trkDayKey());T.cur=0;T.nid=1;T.weeks=[{id:'w1',label:'Week 1',subjects:[]}];T.goals={};trkSave();TR3.sel=-1;trDraw();toast3('Tracker reset')}),250)};
A.trMenu=()=>{const it=(a,i,t,s,c)=>`<button class="row${c?' '+c:''}" data-a="${a}"><span class="ti">${ic(i,19)}</span><span><b>${t}</b><small>${s}</small></span></button>`;
  openSheet(`<h2 id="sheetT">Tracker options</h2><div class="list trmn">${it('trRename','pen','Rename this week','Change the week name')}${trkLoad().cur>0?it('trCarry','swap','Carry over pending tasks','Copy unfinished tasks from '+esc3(trkLoad().weeks[trkLoad().cur-1].label)):''}${it('trAddWeek','cal','Add a new week','Copies your subjects with empty tasks')}${it('trSubj','book','Add a subject','In this week or every week')}${it('trTargets','target','Set targets','A task goal for each subject')}${it('trGrowth','chart','Growth','Progress across all weeks')}${it('trResetWeek','clock','Reset this week','Mark all tasks as pending')}${it('trResetAll','trash','Delete everything','All weeks, subjects and tasks','bad')}</div>`)};
['trSubj','trTargets','trGrowth','trRename'].forEach(k=>{const f=A[k];A[k]=el=>{if(layer){closeLayer();setTimeout(()=>f(el),250)}else f(el)}});
V3H.push([/^#\/t$/,()=>openTracker()]);
/* the account's copy arrived (another phone was newer): show it */
addEventListener('cbt-keep',()=>{try{if(top()&&top().key==='trk'){TR3.sel=-1;trDraw()}}catch(e){}});

/* ================= RANKS AND LEADERBOARDS in the new design =================
   Same server and cache as the classic Results page (app10.js): cbt_overall for the overall rank (average score
   over all tests), cbt_leaderboard for each test (first attempt per student), cached in the classic LBC with lbStale,
   and the classic list of tests that have ranks (lbTests). */
const RK3={ov:null,i:0,busy:0};
const rkFirst=x=>String(x.name||x.student||'Student').split(' ')[0];
const rkVal=x=>x.pct!=null?x.pct+'%':(x.score!=null?String(x.score):'');
function rkPod(top,me){const p=[top[1],top[0],top[2]];
  return `<div class="rkpod">${p.map((x,i)=>{if(!x)return '<div class="rkp z"></div>';const r=x.rank||(i===1?1:i===0?2:3),m=x.me||r===me;
    return `<div class="rkp r${Math.min(r,3)}${m?' me':''}"><span class="rkav">${esc3((rkFirst(x)[0]||'?').toUpperCase())}${r===1?`<i>${ic('crown',14)}</i>`:''}</span><b>${esc3(rkFirst(x))}${m?' (you)':''}</b><small>${esc3(rkVal(x))}</small>${x.cheat?'<em>Flagged</em>':''}<span class="rkst"><span>${r}</span></span></div>`}).join('')}</div>`}
function rkRows(top,me,mine){const rest=top.slice(3,10);
  return `${rest.length?`<div class="card rkl">${rest.map((x,i)=>{const r=x.rank||i+4,m=x.me||r===me;return `<div class="rkr${m?' me':''}"><span class="rkn">${r}</span><span class="rkav sm">${esc3((rkFirst(x)[0]||'?').toUpperCase())}</span><b>${esc3(x.name||x.student||'Student')}${m?' (you)':''}${x.cheat?' <em>Flagged</em>':''}</b><span class="rkv">${esc3(rkVal(x))}</span></div>`}).join('')}</div>`:''}
   ${me&&me>Math.min(top.length,10)?`<div class="card rkl"><div class="rkr me"><span class="rkn">${me}</span><span class="rkav sm">${esc3(((AUTH&&AUTH.name)||'Y')[0].toUpperCase())}</span><b>You</b><span class="rkv">${esc3(mine)}</span></div></div>`:''}`}
function rkOverall(){const b=RK3.ov;
  if(!b)return '<div class="card sk" style="height:180px"></div><div class="card sk" style="height:220px"></div>';
  if(!b.ok||!b.top||!b.top.length)return `<div class="card empty"><span class="ti">${ic('trophy',22)}</span><b>No ranks yet</b><p>Take a test to get your overall rank.</p></div>`;
  const tot=b.total||1,beat=b.my_rank?(tot>1?Math.round((tot-b.my_rank)*100/(tot-1)):100):null;
  return `<section class="mkh rkh"><div class="mkh-top"><div><small>OVERALL RANK · AVERAGE OF ALL TESTS</small><b>${b.my_rank?'#'+b.my_rank:'–'}</b><span>${b.my_rank?`Ahead of ${beat}% of ${fmtN(tot)} students`:`${fmtN(tot)} students ranked`}</span></div><span class="ti qbic">${ic('trophy',28)}</span></div>
    ${b.my_rank?`<span class="bar"><i style="--p:${(beat/100).toFixed(3)}"></i></span><div class="mkh-st"><div><b>${b.my_pct}%</b><small>Your average</small></div><div><b>${b.top[0].pct}%</b><small>Topper</small></div><div><b>${fmtN(tot)}</b><small>Students</small></div></div>`:''}</section>
   ${rkPod(b.top,b.my_rank)}${rkRows(b.top,b.my_rank,(b.my_pct!=null?b.my_pct+'%':''))}`}
function rkTest(t){const r=LBC[t.id];
  if(!r)return '<div class="card sk" style="height:150px"></div><div class="card sk" style="height:200px"></div>';
  const go=t.attempts||(typeof isClosed==='function'&&isClosed(t))?'':`<button class="btn sm" data-a="test" data-id="${esc3(t.id)}">Attempt now</button>`;
  if(r.ok&&r.hidden)return `<div class="card empty"><span class="ti">${ic('clock',22)}</span><b>Ranks come out later</b><p>Ranks will be shown after ${esc3(fmtWhen(r.result_at))}.</p>${go}</div>`;
  if(!r.ok||!r.top||!r.top.length)return `<div class="card empty"><span class="ti">${ic('trophy',22)}</span><b>No ranks yet</b><p>Nobody has a rank in this test yet.</p>${go}</div>`;
  const solo=r.total<2;
  return `${r.my_rank?`<section class="mkh rkh"><div class="mkh-top"><div><small>YOUR RANK</small><b>#${r.my_rank}<em> of ${fmtN(r.total)}</em></b><span>${esc3(t.title)}</span></div><span class="ti qbic">${ic('medal',28)}</span></div>
     <div class="mkh-st rk4"><div><b>${r.my_score}</b><small>Your score</small></div><div><b>${solo?'–':r.percentile}</b><small>Percentile</small></div><div><b>${r.avg}</b><small>Average</small></div><div><b>${r.top_score}</b><small>Topper</small></div></div></section>`
    :`<div class="card rkna"><p>${t.attempts?'Only a first attempt submitted on time gets a rank.':'You have not taken this test yet.'}</p>${t.attempts?'':go}</div>`}
   ${rkPod(r.top,r.my_rank)}${rkRows(r.top,r.my_rank,r.my_score)}<p class="hint" style="text-align:center">${fmtN(r.total)} student${r.total===1?'':'s'} ranked · first attempt per student</p>`}
function rkView(){return {t:'Ranks and leaderboards',s:'Overall and for every test',key:'rank',html:()=>{let T=[];try{T=lbTests()}catch(e){}RK3.i=Math.min(RK3.i,T.length);
  return `<div class="chips rktabs"><button class="${RK3.i===0?'on':''}" data-a="rkTab" data-i="0">${ic('trophy',14)} Overall</button>${T.map((t,i)=>`<button class="${RK3.i===i+1?'on':''}" data-a="rkTab" data-i="${i+1}">${esc3(t.title)}</button>`).join('')}</div>
   <div class="rkbody">${RK3.i===0?rkOverall():rkTest(T[RK3.i-1])}</div>`},
  after:()=>{const a=$('#scrB .rktabs .on');if(a)try{a.parentNode.scrollLeft=a.offsetLeft-a.parentNode.clientWidth/2+a.clientWidth/2}catch(e){}}}}
async function rkLoad(t){if(!t)return;try{lbStale(t.id)}catch(e){}if(LBC[t.id])return;let r=null;try{r=await rpc('cbt_leaderboard',{p_test:t.id})}catch(e){}LBC[t.id]=r&&r.ok?r:{ok:false}}
async function openRanks(){closeLayer();RK3.i=0;if(!(top()&&top().key==='rank'))push(rkView());else redraw();
  let r=null;try{r=await rpc('cbt_overall',{})}catch(e){}RK3.ov=r||{ok:false};if(r&&r.ok){try{if(typeof INS!=='undefined'&&INS)INS.b=r}catch(e){}}
  if(top()&&top().key==='rank'&&RK3.i===0)qbKeep()}
A.rkTab=async el=>{RK3.i=+el.dataset.i;qbKeep();if(!RK3.i)return;let T=[];try{T=lbTests()}catch(e){}const t=T[RK3.i-1],k=RK3.i;await rkLoad(t);if(top()&&top().key==='rank'&&RK3.i===k)qbKeep()};
A.ranks=()=>openRanks();
V3H.push([/^#\/r$/,()=>openRanks()]);

/* ================= REFER AND EARN in the new design =================
   Same server as the classic page (app22.js): cbt_refer_app through the classic rfLoad; the link and the message
   are the classic rfLink / rfText (the link opens the store). */
let RF3=null;
const rfInr=n=>'₹'+Number(n||0).toLocaleString('en-IN');
function rfCopy3(t,m){const ok=()=>toast3(m||'Copied');const old=()=>{const a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok,()=>{old();ok()});else{old();ok()}}
function rfView(){return {t:'Refer and earn',s:'Wallet money for every friend who buys',key:'refer',html:()=>{const r=RF3;
  if(!r)return '<div class="card sk" style="height:220px"></div><div class="card sk" style="height:120px"></div>';
  if(!r.ok)return `<div class="card empty"><span class="ti">${ic('gift',22)}</span><b>${r.error==='missing'?'Coming soon':'Could not load'}</b><p>${r.error==='missing'?'Refer and earn will open here soon.':'Please check your internet and try again.'}</p>${r.error==='missing'?'':'<button class="btn sm" data-a="rfAgain">Try again</button>'}</div>`;
  const rw=rfInr(r.reward||25),L=r.list||[],H=r.history||[],link=rfLink(r.code);
  return `<section class="mkh rfh3"><div class="mkh-top"><div><small>${r.active===false?'PAUSED FOR NOW':'REFER AND EARN'}</small><b style="font-size:26px;line-height:1.2">Get ${rw} for every friend who buys</b><span>Share your link. When a new student buys any test series on our store, ${rw} comes to your wallet.</span></div><span class="ti qbic">${ic('gift',28)}</span></div>
    <div class="rfl3"><span>${esc3(link.replace(/^https?:\/\//,''))}</span><button data-a="rfCopyLink">${ic('copy',15)}Copy</button></div>
    <div class="rfb3"><button class="btn gold" data-a="rfShare">${ic('share',16)}Share link</button><button class="btn ghost on-dark" data-a="rfWa">WhatsApp</button></div>
    <p class="rfc3">Your code <b>${esc3(r.code)}</b> · the link opens our store, so your friend can see the series and buy.</p></section>
   <div class="g2 rfk3"><div class="card"><small>Friends joined</small><b>${fmtN(r.joined||0)}</b></div><div class="card"><small>Friends bought</small><b class="ok">${fmtN(r.bought||0)}</b></div><div class="card"><small>Total earned</small><b>${rfInr(r.earned)}</b></div><div class="card"><small>Wallet balance</small><b class="acc">${rfInr(r.balance)}</b></div></div>
   <a class="card rsc" href="store"><span class="rsc-n">WALLET</span><b>Use your wallet in the store</b><small>At checkout turn on “Use wallet balance”. It cannot be withdrawn to a bank or UPI.</small>${ic('right',18)}</a>
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Your friends</h2><span class="aside">${L.length}</span></div>
    ${L.length?`<div class="card rkl">${L.map(x=>`<div class="rkr"><span class="rkav sm">${esc3(String(x.name||'S')[0].toUpperCase())}</span><b>${esc3(x.name||'Student')}<small>${esc3(x.mobile||'')} · joined ${fD(x.at,{day:'numeric',month:'short'})}</small></b><span class="st${x.bought?' ok':''}">${x.bought?'Bought · +'+rw:'Not bought yet'}</span></div>`).join('')}</div>`
      :'<div class="card empty"><b>Nobody yet</b><p>Share your link. Friends who join show here.</p></div>'}</section>
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>Wallet history</h2></div>
    ${H.length?`<div class="card rkl">${H.map(x=>`<div class="rkr"><span class="rkav sm ${x.amount>0?'pos':''}">${x.amount>0?'+':'−'}</span><b>${esc3(x.note||'')}<small>${x.order?esc3(x.order)+' · ':''}${fD(x.at,{day:'numeric',month:'short',year:'numeric'})}</small></b><span class="rkv ${x.amount>0?'ok':''}">${x.amount>0?'+':'−'}${rfInr(Math.abs(x.amount))}</span></div>`).join('')}</div>`
      :'<div class="card empty"><b>Nothing yet</b><p>Referral rewards show here.</p></div>'}</section>
   <section class="stack" style="gap:10px"><div class="sh" style="margin:0"><h2>How it works</h2></div>
    <div class="card p rfo3">${[['share','Share your link','On WhatsApp, Telegram or anywhere.'],['bag','A new friend buys','Any test series on the store. Joining alone gives nothing; the purchase does.'],['gift',`${rw} comes to your wallet`,'After we approve their payment, once per friend.'],['check','Use it at checkout','For your next test series. Wallet money cannot be withdrawn.']].map(([i,t,d],k)=>`<div><span>${k+1}</span><p><b>${t}</b>${d}</p></div>`).join('')}</div></section>`}}}
async function openRefer(){closeLayer();RF3=null;if(!(top()&&top().key==='refer'))push(rfView());else redraw();let r=null;try{r=await rfLoad(true)}catch(e){}if(!r)r={ok:false,error:'network'};RF3=r;if(top()&&top().key==='refer')redraw()}
A.refer=()=>openRefer();A.rfAgain=()=>openRefer();
A.rfCopyLink=()=>{if(RF3&&RF3.code)rfCopy3(rfLink(RF3.code),'Link copied')};
A.rfShare=async()=>{if(!RF3||!RF3.code)return;const t=rfText(RF3.code);if(navigator.share){try{await navigator.share({title:'Aspiron Education',text:t});return}catch(e){if(e&&e.name==='AbortError')return}}rfCopy3(t,'Message copied. Paste it in WhatsApp or Telegram.')};
A.rfWa=()=>{if(!RF3||!RF3.code)return;const w=window.open('https://wa.me/?text='+encodeURIComponent(rfText(RF3.code)),'_blank','noopener,noreferrer');if(w)w.opener=null};
V3H.push([/^#\/refer$/,()=>openRefer()]);
/* every other classic address opens its page in the new design (links in notices, notifications, shared links) */
function openSeriesAny(sid,tab){const s=sOf(sid);if(!s){go('test');return}loadExtras();loadMeta();if(STORE===null)loadStore();TQ.tf='all';TQ.ts='all';TQ.plan=null;closeLayer();
  TQ.xt=sOk(s)?(tab||'t'):'d';push(ownedPage(sid))}
V3H.push([/^#\/s\/([^/?#]+)$/,m=>openSeriesAny(decodeURIComponent(m[1]),'t')],
  [/^#\/f\/([^/?#]+)$/,m=>{const f=((C().folders)||[]).find(x=>x.id===decodeURIComponent(m[1]));if(f)openSeriesAny(f.series_id,'t');else go('test')}],
  [/^#\/m$/,()=>openMistakes()],[/^#\/b$/,()=>openSaved()],[/^#\/notes$/,()=>openNotes()],[/^#\/n$/,()=>A.bell()],
  [/^#\/h\/.+$/,()=>A.hist()],[/^#\/(series|my)$/,()=>A.mySeries()],
  [/^#\/lib$/,()=>go('lib')],[/^#\/me$/,()=>go('stats')]);

/* ================= FIRST-TIME SETUP in the new design =================
   Shown once per student on this phone (cbt_v3_onb_<mobile>) when the profile has no class or target exam yet:
   welcome, class and target exam (saved in the classic profile cbt_pf_<mobile>, which is kept on the account by
   cbt_keep), then notifications and install. Skip closes it for good; everything can be changed later in Profile. */
const OB={st:0,d:null,el:null};
const obKey=()=>'cbt_v3_onb_'+((AUTH&&AUTH.mobile)||'');
function maybeOnb(){try{if(!AUTH||INTEST||OB.el||lsGet(obKey(),0)||layer||scrOpen()||document.body.classList.contains('v3old'))return;const p=stuProf();if(p.cls&&p.exam){lsSet(obKey(),1);return}openOnb()}catch(e){}}
function obStep(){const d=OB.d,nm=String((AUTH&&AUTH.name)||'').trim().split(' ')[0]||'there';
  if(OB.st===0)return `<div class="ob-art">${ic('spark',34)}</div><small class="ob-k">WELCOME</small><h1>Hi ${esc3(nm)}, let’s set up your study space</h1><p>Two quick choices so your tests, schedule and tips fit you. It takes 20 seconds.</p>`;
  if(OB.st===1)return `<small class="ob-k">STEP 1 OF 2</small><h1>About you</h1><p>We use this to show the right series and tips.</p>
    <div class="fl"><span>Your class</span><div class="chips wrap">${PF3.cls.map(c=>`<button class="${d.cls===c?'on':''}" aria-pressed="${d.cls===c}" data-ob="cls" data-v="${c}">${c}</button>`).join('')}</div></div>
    <div class="fl"><span>Target exam</span><div class="chips wrap">${PF3.exam.map(c=>`<button class="${d.exam===c?'on':''}" aria-pressed="${d.exam===c}" data-ob="exam" data-v="${c}">${c}</button>`).join('')}</div></div>`;
  const np=npOn3(),inst=standalone3();
  return `<small class="ob-k">STEP 2 OF 2</small><h1>Never miss a test</h1><p>Get an alert when a test goes live and when your result is out.</p>
    <div class="card rows ob-rows"><button class="row" data-ob="np"><span class="ti g">${ic('bell',20)}</span><span><b>Phone notifications</b><small>${np?'On. You are all set.':'Test alerts, results and notices'}</small></span><span class="sw${np?' on':''}" aria-hidden="true"></span></button>
     ${inst?'':`<button class="row" data-ob="inst"><span class="ti g">${ic('dl',20)}</span><span><b>Install the app</b><small>Open it from your home screen</small></span>${ic('right',18)}</button>`}</div>`}
function obDraw(dir){const el=OB.el;if(!el)return;const last=OB.st===2,ok=OB.st!==1||(OB.d.cls&&OB.d.exam);
  el.innerHTML=`<div class="ob-in"><div class="ob-top"><div class="ob-dots">${[0,1,2].map(i=>`<i class="${i===OB.st?'on':i<OB.st?'done':''}"></i>`).join('')}</div><button class="ob-skip" data-ob="skip">${last?'Close':'Skip'}</button></div>
   <div class="ob-b ${dir||''}">${obStep()}</div>
   <div class="ob-ft">${OB.st?'<button class="btn ghost" data-ob="back">Back</button>':''}<button class="btn ${OB.st===0?'gold lg':''}" data-ob="next"${ok?'':' disabled'}>${OB.st===0?'Let’s start':last?'Finish':'Continue'}${ic('right',16)}</button></div></div>`}
function openOnb(){const p=stuProf();OB.d={cls:p.cls||'',exam:p.exam||''};OB.st=0;
  const el=document.createElement('div');el.className='ob3';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Set up your study space');OB.el=el;root.querySelector('#app3').appendChild(el);obDraw('');
  requestAnimationFrame(()=>el.classList.add('open'));
  el.addEventListener('click',async e=>{const b=e.target.closest('[data-ob]');if(!b)return;const k=b.dataset.ob;
    if(k==='cls'||k==='exam'){OB.d[k]=b.dataset.v;obDraw('');return}
    if(k==='skip'){obClose(OB.st===2);return}
    if(k==='back'){OB.st=Math.max(0,OB.st-1);obDraw(RM?'':'bwd');return}
    if(k==='next'){if(OB.st===1){if(!OB.d.cls||!OB.d.exam)return;try{pfSave(Object.assign({},stuProf(),{cls:OB.d.cls,exam:OB.d.exam}));if(typeof pfHdr==='function')pfHdr()}catch(err){}}
      if(OB.st===2){obClose(true);return}OB.st++;obDraw(RM?'':'fwd');return}
    if(k==='np'){try{await npToggle()}catch(err){}setTimeout(()=>{if(OB.el&&OB.st===2)obDraw('')},400);return}
    if(k==='inst'){try{A.setInstall()}catch(err){}}})}
/* ================= "TWO QUICK THINGS" on every app open (new design) =================
   Install the app and turn on phone notifications: only what is still missing is shown (the classic setupNeed:
   installed = opened as the app, or Chrome says it is on the phone, or installed here before). Nothing when both are
   done. Skip hides it for this open only; it comes back on the next open until both are done. */
let SU3=false;
async function maybeSetup(){try{if(SU3||!AUTH||INTEST||OB.el||layer||scrOpen()||document.body.classList.contains('v3old')||typeof setupNeed!=='function')return;
  if(typeof npInApp==='function'&&npInApp())return;SU3=true;const need=await setupNeed();if(!need.length||layer||scrOpen()||INTEST)return;suDraw(need)}catch(e){}}
function suDraw(need){const row=(k,i,t,d,b)=>`<div class="su-r"><span class="ti g">${ic(i,20)}</span><span class="su-t"><b>${t}</b><small>${d}</small></span><button class="btn sm" data-a="${k}">${b}</button></div>`;
  let blocked=false;try{blocked=window.Notification&&window.Notification.permission==='denied'}catch(e){}
  openSheet(`<h2 id="sheetT">Two quick things</h2><p class="sub">So you never miss a test or a result. Each takes one tap.</p>
   <div class="su-l">${need.includes('install')?row('suInst','dl','Install the app','Open it from your home screen, like an app','Install'):''}${need.includes('notify')?row('suNp','bell','Turn on notifications','Test alerts and results, even when the app is closed',blocked?'How?':'Turn on'):''}</div>
   <button class="btn ghost blk" data-a="close" style="margin-top:14px">Skip for now</button>`)}
const suAgain=()=>setTimeout(async()=>{try{const n=await setupNeed();if(!n.length){closeLayer();toast3('All set!');return}if(layer===sheet&&sheet.querySelector('.su-l'))suDraw(n)}catch(e){}},700);
A.suInst=()=>{closeLayer();setTimeout(()=>{A.setInstall()},200)};
A.suNp=async()=>{let r='denied';try{const N=window.Notification;r=N?N.permission:'denied';if(r==='default')r=await N.requestPermission()}catch(e){}
  if(r==='granted'){try{npEnable()}catch(e){}hap(8);suAgain()}else{closeLayer();setTimeout(()=>npHelp(r==='denied'?'blocked':'ask'),200)}};
function obClose(done){lsSet(obKey(),1);const el=OB.el;OB.el=null;if(!el)return;setTimeout(maybeSetup,900);el.classList.remove('open');setTimeout(()=>el.remove(),RM?0:420);if(done)toast3('All set. You can change these in your profile.');try{softRender()}catch(e){}}

/* ================= MENU: the classic menu's look (profile on top, grouped list, NEW tags, Logout last) =================
   About two thirds of the screen wide, the page behind blurred, and the items come in one after another from the top. */
A.menu=()=>{const u=unread();let n=0;const web=!standalone3();
  const mi=(i,t,k,on,extra,cls)=>`<button class="mi${on?' on':''}${cls||''}${n<14?' ma':''}" data-a="m" data-k="${k}" style="--i:${n++}">${ic(i)}<span>${t}</span>${extra||''}</button>`;
  const nw='<em class="mnew">NEW</em>',gh=t=>`<p class="mgh${n<14?' ma':''}" style="--i:${n++}">${t}</p>`;
  drawer.innerHTML=`<div class="mtop ma" style="--i:${n++}"><button class="mx" data-a="close" aria-label="Close menu">${ic('x',18)}</button>${avatar('mav')}<b>${esc3(stuName())}</b><small>${esc3(stuMeta())}</small><button class="mvp" data-a="m" data-k="profile">View Profile <span aria-hidden="true">→</span></button></div>
  <div class="mlist">${gh('Study')}${mi('home','Home','home',S.tab==='home')}${mi('tests','Test Series','series',S.tab==='test')}${mi('lib','Library','lib',S.tab==='lib')}${mi('pyq','PYQ Analysis','pyq',0,nw)}${mi('qb','Question Bank','qb',0,nw)}${mi('spark','Test Generator','gen',0,nw)}
   ${gh('My progress')}${mi('trophy','Results & Ranks','ranks')}${mi('hist','Test History','history')}${mi('pen','Mistake Notebook','mistakes')}${mi('bookmark','Saved Questions','saved')}${mi('cal','Study Tracker','tracker')}
   ${gh('Explore')}${mi('layers','Store','store')}${mi('gift','Refer & Earn','refer')}${mi('bell','Notifications','notif',0,u?`<em class="mcnt">${u}</em>`:'')}${mi('target','Exam Countdown','cd')}
   ${gh('Help & settings')}${mi('sun','Theme Settings','theme',0,`<em class="mval">${THEMES[resolveMode(TH.mode)].name}</em>`)}${mi('gear','Settings','settings')}${mi('info','About Us','about')}${mi('mail','Contact Us','contact')}
   ${web?gh('Policies')+mi('file','Terms & Conditions','terms')+mi('file','Privacy Policy','privacy')+mi('file','Refund Policy','refund'):''}
   ${socH()?gh('Follow us')+`<div class="msoc" style="--i:${n++}">${socH()}</div>`:''}
   <div class="mdiv" style="--i:${n++}"></div>${mi('out','Logout','logout',0,'',' mout')}</div>`;
  /* the list is built and laid out first; the slide starts on the next frame, so its first frame is never the heavy one */
  drawer.scrollTop=0;void drawer.offsetHeight;if(RM)openLayer(drawer);else requestAnimationFrame(()=>requestAnimationFrame(()=>openLayer(drawer)))};
A.m=el=>{const k=el.dataset.k;closeLayer();
  const M={profile:A.profile,theme:openTheme,home:()=>go('home'),series:()=>go('test'),lib:()=>go('lib'),pyq:()=>openPyq(),qb:()=>openQB(),gen:()=>openGen(),ranks:()=>openRanks(),refer:()=>openRefer(),store:()=>{location.href='store'},history:A.hist,mistakes:()=>openMistakes(),saved:()=>openSaved(),tracker:()=>openTracker(),notif:A.bell,cd:A.cdEdit,
   settings:A.settings,about:A.setAbout,terms:A.setTerms,privacy:()=>window.open('privacy','_blank','noopener'),refund:()=>window.open('refund','_blank','noopener'),contact:A.setHelp,
   logout:A.setOut};
  setTimeout(()=>{(M[k]||(()=>{}))()},140)};

/* ---------- theme page: preview live, apply to keep, reset to default ---------- */
function themeHtml(){const mode=resolveMode(THP.mode),P=THEMES[mode].pals,cur=P[THP.pal[mode]]?THP.pal[mode]:'A';
  return `<div class="th-top"><span><b>Appearance</b><small class="th-sv">Saved automatically</small></span><button class="btn sm ghost" data-a="thReset">${ic('hist',15)}Reset</button></div>
  <div class="seg th-seg" role="group" aria-label="Mode">${[['system','System'],['light','Light'],['dark','Dark'],['black','Black']].map(m=>`<button class="${THP.mode===m[0]?'on':''}" data-a="thm" data-v="${m[0]}" aria-pressed="${THP.mode===m[0]}">${m[1]}</button>`).join('')}</div>
  ${THP.mode==='system'?`<p class="hint" style="margin-top:-6px">Follows your phone. It is ${mode} right now.</p>`:''}
  <div class="sh" style="margin-top:4px"><h2>${THEMES[mode].name} themes</h2><span class="aside">${Object.keys(P).length} to choose</span></div>
  <div class="pals">${Object.entries(P).map(([k,v])=>{const t=tokens(mode,k);
   return `<button class="pal${cur===k?' on':''}" data-a="thp" data-v="${k}" aria-pressed="${cur===k}"><span class="pv" style="background:${t.bg}"><i class="pv-h" style="background:linear-gradient(155deg,${t.h1},${t.h2})"></i><i class="pv-c" style="background:${t.s};border-color:${t.ln}"><b style="background:${t.tx}"></b><b style="background:${t.mt}"></b></i><i class="pv-a" style="background:linear-gradient(135deg,${t.a1},${t.a2})"></i></span><span class="pn"><b>${v[0]}</b><small>${v[2]}</small></span><span class="ck">${ic('check',14)}</span></button>`}).join('')}</div>
  <p class="hint">Tap a theme to use it. It is used everywhere in the app, the exam screen too.</p>`}
function openTheme(){THP=clone(TH);push({t:'Theme & colours',s:'Tap a theme to use it',html:themeHtml,leave:()=>{if(thRaf){window.cancelAnimationFrame(thRaf);thRaf=0;if(THP){TH=clone(THP);saveTheme()}}THP=null;clearTimeout(docT);applyTheme(TH)}})}
/* Theme page: a tap is the choice. It is applied and saved at once (no Apply button); Reset sits in the page header.
   Light <-> Dark is a big jump, so a soft veil in the new background colour covers the swap for a moment (opacity
   only). A palette change inside the same mode is small and simply changes, with no redraw of the page. */
function thKeep(){TH=clone(THP);saveTheme()}
let thRaf=0;
/* the tap is answered at once (tick, pressed state, a short buzz); the colours follow on the next frame. Many quick
   taps are merged into one colour change, so the page never queues up work and never stops answering */
function thSoon(redrawPage){if(thRaf)window.cancelAnimationFrame(thRaf);thRaf=requestAnimationFrame(()=>{thRaf=0;if(!THP)return;applyTheme(THP,true);thKeep();if(redrawPage)redraw()})}
function thBuzz(){try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}}
A.thm=el=>{if(!THP||THP.mode===el.dataset.v)return;THP.mode=el.dataset.v;$$('[data-a="thm"]').forEach(b=>{const on=b===el;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});thBuzz();thSoon(true)};
A.thp=el=>{if(!THP)return;const m=resolveMode(THP.mode);if(THP.pal[m]===el.dataset.v)return;THP.pal[m]=el.dataset.v;
  $$('.pal').forEach(b=>{const on=b===el;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});thBuzz();thSoon(false)};
A.thReset=()=>{if(!THP)return;THP=clone(DEF_TH);thSoon(true);toast3('Default theme is back.')};


/* ================= SWIPE BETWEEN TABS, and SLIDE ALONG THE DOCK =================
   Like a phone's home screens: drag the screen left / right to go to the next / previous tab (the page follows the
   finger; a short flick is enough). Tapping the dock works as before. On the dock, keep the finger down and slide it:
   each tab it passes is shown, with a light buzz on every step. Inner rows that scroll sideways (chips, posters,
   carousels) keep their own swipe; vertical scrolling is untouched. */
const hap=ms=>{try{navigator.vibrate&&navigator.vibrate(ms||8)}catch(e){}};
const tabIx=()=>Math.max(0,NAV.findIndex(n=>n[0]===S.tab));
let SWD='',swGhost=null;
function swTo(i,dir){if(i<0||i>=NAV.length||NAV[i][0]===S.tab)return false;SWD=dir||'';hap(8);go(NAV[i][0]);return true}
function hScroller(el){for(let e=el;e&&e!==main;e=e.parentElement){if(e.closest&&e.closest('[data-noswipe],input,textarea,select,[contenteditable]'))return true;
  if(e.scrollWidth>e.clientWidth+4){const o=getComputedStyle(e).overflowX;if(o==='auto'||o==='scroll')return true}}return false}
function swipeInit(){if(swipeInit.done)return;swipeInit.done=true;
  /* ---- the screen: the next / previous tab is drawn beside the page and comes in with the finger ---- */
  let x0=0,y0=0,t0=0,dx=0,mode='',w=1,swF=0,gh=null,gd=0,gtop=0;
  const GAP=14,ease='cubic-bezier(.22,1,.36,1)';
  const ghostFor=d=>{const n=tabIx()+d;if(n<0||n>=NAV.length)return null;const g=document.createElement('div');g.className='main swg';g.setAttribute('aria-hidden','true');
    const keep=S.tab;S.tab=NAV[n][0];try{g.innerHTML=VIEW[S.tab]()}catch(e){g.innerHTML=''}S.tab=keep;
    const r=main.getBoundingClientRect(),hd=$('#hdr');gtop=hd?Math.max(0,hd.getBoundingClientRect().bottom):0;
    g.style.cssText=`position:fixed;top:${gtop}px;left:${r.left}px;width:${r.width}px;height:${window.innerHeight-gtop}px;overflow:hidden;margin:0;z-index:4;pointer-events:none;will-change:transform`;
    main.parentElement.appendChild(g);return g};
  const dropGhost=()=>{if(gh){gh.remove();gh=null}gd=0};
  const paint=()=>{main.style.transform=`translate3d(${dx}px,0,0)`;if(gh)gh.style.transform=`translate3d(${dx+gd*(w+GAP)}px,0,0)`;
    dock.style.setProperty('--i',Math.max(0,Math.min(NAV.length-1,tabIx()-dx/w*(gh?1:.25))))};
  const settle=(cb,ms)=>{main.style.transition=gh?`transform ${ms}ms ${ease}`:'';if(gh)gh.style.transition=`transform ${ms}ms ${ease}`;dock.classList.add('swp');setTimeout(cb,RM?0:ms)};
  main.addEventListener('touchstart',e=>{mode='';dx=0;if(e.touches.length!==1||STK.length||layer||INTEST||hScroller(e.target)){mode='no';return}
    const p=e.touches[0];x0=p.clientX;y0=p.clientY;t0=Date.now();w=main.clientWidth||window.innerWidth},{passive:true});
  main.addEventListener('touchmove',e=>{if(mode==='no'||mode==='v'||e.touches.length!==1)return;const p=e.touches[0],mx=p.clientX-x0,my=p.clientY-y0;
    if(!mode){if(Math.abs(mx)<10&&Math.abs(my)<10)return;mode=Math.abs(mx)>Math.abs(my)*1.15?'h':'v';if(mode==='v')return;dock.classList.add('swp')}
    const d=mx<0?1:-1;if(d!==gd){dropGhost();if(!RM){gh=ghostFor(d);gd=gh?d:0}}
    dx=gh||RM?mx:mx*.25;
    if(!RM&&!swF){swF=requestAnimationFrame(()=>{swF=0;if(mode!=='h')return;main.style.transition='';paint()})}},{passive:true});
  const back=()=>{dx=0;if(RM){dropGhost();main.style.transform='';dock.classList.remove('swp');syncDock();return}
    main.style.transition=`transform .34s ${ease}`;if(gh)gh.style.transition=`transform .34s ${ease}`;main.style.transform='';if(gh)gh.style.transform=`translate3d(${gd*(w+GAP)}px,0,0)`;syncDock();
    setTimeout(()=>{main.style.transition='';dropGhost();dock.classList.remove('swp')},360)};
  const end=()=>{if(mode!=='h'){mode='';return}mode='';const v=Math.abs(dx)/Math.max(1,Date.now()-t0),i=tabIx(),go2=Math.abs(dx)>Math.min(90,w*.22)||(v>.45&&Math.abs(dx)>30);
    const n=dx<0?i+1:i-1;
    if(!(go2&&n>=0&&n<NAV.length&&(gh||RM))){back();return}
    if(RM){dropGhost();SWD='';hap(8);go(NAV[n][0]);return}
    const ms=Math.max(160,Math.min(300,Math.round((w-Math.abs(dx))/Math.max(.9,v)))),g=gh;
    main.style.transition=`transform ${ms}ms ${ease}`;g.style.transition=`transform ${ms}ms ${ease}`;main.style.transform=`translate3d(${-gd*(w+GAP)}px,0,0)`;g.style.transform='translate3d(0,0,0)';
    dock.style.setProperty('--i',n);hap(8);
    setTimeout(()=>{SWD='';swGhost=g;gh=null;gd=0;go(NAV[n][0])},ms)};
  main.addEventListener('touchend',end,{passive:true});main.addEventListener('touchcancel',()=>{if(mode==='h'){mode='';back()}},{passive:true});
  /* ---- the dock: slide the finger along it ---- */
  let dk=false,moved=false,cur=-1,tmr=0,sx=0;
  const ixAt=x=>{const r=dock.getBoundingClientRect();return Math.max(0,Math.min(NAV.length-1,Math.floor((x-r.left)/(r.width/NAV.length))))};
  dock.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;dk=true;moved=false;sx=e.touches[0].clientX;cur=ixAt(sx)},{passive:true});
  dock.addEventListener('touchmove',e=>{if(!dk)return;const x=e.touches[0].clientX;if(!moved&&Math.abs(x-sx)<8)return;moved=true;e.preventDefault();
    const i=ixAt(x);if(i===cur)return;cur=i;hap(6);dock.classList.add('drag');dock.style.setProperty('--i',i);
    dock.querySelectorAll('button').forEach((b,j)=>b.classList.toggle('hov',j===i));
    clearTimeout(tmr);tmr=setTimeout(()=>{if(NAV[cur][0]!==S.tab){SWD='';go(NAV[cur][0])}},110)},{passive:false});
  const dEnd=()=>{if(!dk)return;dk=false;dock.classList.remove('drag');dock.querySelectorAll('button.hov').forEach(b=>b.classList.remove('hov'));
    if(moved){clearTimeout(tmr);if(NAV[cur]&&NAV[cur][0]!==S.tab){SWD='';go(NAV[cur][0])}else syncDock();
      const stop=ev=>{ev.stopPropagation();ev.preventDefault()};dock.addEventListener('click',stop,{capture:true,once:true});setTimeout(()=>dock.removeEventListener('click',stop,{capture:true}),400)}};
  dock.addEventListener('touchend',dEnd,{passive:true});dock.addEventListener('touchcancel',dEnd,{passive:true})}
/* ================= WIRING INTO THE CLASSIC APP ================= */
function boot(){if(booted)return;ensureHost();booted=true;
  main=$('#main');dock=$('#dock');scr=$('#scr');sheet=$('#sheet');drawer=$('#drawer');scrim=$('#scrim');
  root.addEventListener('click',onClick);
  root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.fc')){e.preventDefault()}});
  dock.innerHTML=NAV.map(n=>`<button data-a="tab" data-tab="${n[0]}" aria-label="${n[1]}">${ic(n[2])}<span>${n[1]}</span></button>`).join('');
  $('#mnu').innerHTML=ic('menu',22);$('#dsr').innerHTML=ic('search',20);$('#scrBack').innerHTML=ic('back',20);syncBell();
  /* the header looks the same at every scroll position (no class toggled on scroll) */
  if(!RM){const w=$('#bmk');const sh=()=>{if(document.hidden||document.body.classList.contains('v3old')||!document.body.classList.contains('v3on'))return;w.classList.remove('go');void w.offsetWidth;w.classList.add('go')};setTimeout(sh,900);setInterval(sh,9000)}
  /* computers: a soft light follows the pointer over the dark hero cards and tool cards (one write per frame) */
  if(!RM&&matchMedia('(hover:hover) and (pointer:fine)').matches){let sp=null,raf=0;root.addEventListener('pointermove',e=>{sp=e;if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const c=sp.target.closest&&sp.target.closest('.hero,.tl,.scard,.pc');if(!c)return;const r=c.getBoundingClientRect();c.style.setProperty('--mx',(sp.clientX-r.left)+'px');c.style.setProperty('--my',(sp.clientY-r.top)+'px')})},{passive:true})}
  applyTheme(TH);syncDock();try{swipeInit()}catch(e){}}
const _route=route;
route=async function(){
  if(!v3On()||typeof AUTH==='undefined'||!AUTH||INTEST){if(!AUTH)document.body.classList.remove('v3on','v3old');return _route.apply(this,arguments)}
  boot();document.body.classList.add('v3on');
  let h=location.hash||'#/';
  if(lockHash!==null){if(h===lockHash)return;lockHash=null}
  /* classic addresses of pages that now live in the new design (question bank, test generator) */
  const m3=V3H.map(([re,f])=>[h.match(re),f]).find(x=>x[0]);
  if(m3){closeLayer();while(STK.length)pop();try{history.replaceState(null,'','#/')}catch(e){}h='#/';const f=goThen;goThen=()=>{f&&f();m3[1](m3[0])}}
  if(!isNewHash(h)){try{history.replaceState(null,'','#/')}catch(e){}h='#/'}
  toNew();
  /* the profile, countdown and study tracker kept on the account (cbt_keep): fetched once per page load, as the classic pages do */
  try{if(typeof keepPull==='function')setTimeout(keepPull,0)}catch(e){}
  if(!CAT||Date.now()-CATAT>30000){if(!CAT)main.innerHTML='<div class="card sk" style="height:220px;margin-top:8px"></div><div class="card sk" style="height:160px"></div><div class="card sk" style="height:200px"></div>';
    const ok=await loadCat(!!CAT);if(!ok){if(AUTH)netErr3();return}if(INTEST||!AUTH)return}
  if(NOTES===null)loadNotes().then(()=>{if(S.tab==='test')softRender()});
  const tab=tabOf(h),changed=tab!==S.tab||!main.children.length||main.querySelector('.sk');S.tab=tab;syncDock();if(changed)scrollTo(0,0);render(changed);if(tab==='home'&&!goThen)setTimeout(maybeOnb,1100);if(tab==='home'&&!goThen)setTimeout(maybeSetup,1700);
  if(goThen){const f=goThen;goThen=null;setTimeout(f,0)}};
if(typeof login==='function'){const _login=login;login=function(){document.body.classList.remove('v3on','v3old');return _login.apply(this,arguments)}}
if(typeof cdRefresh==='function'){const _cdr=cdRefresh;cdRefresh=function(){const r=_cdr.apply(this,arguments);if(booted&&document.body.classList.contains('v3on')&&!document.body.classList.contains('v3old')&&(S.tab==='home'||S.tab==='tools'))softRender();return r}}
window.v3BackNew=()=>{document.body.classList.remove('x3ins');A.backNew()};
window.v3Enable=function(){lsSet('cbt_v3',true);return;if(typeof AUTH==='undefined'||!AUTH)return;boot();document.body.classList.add('v3on');toNew();S.tab='';if(!isNewHash(location.hash||'#/'))location.hash='#/';else route();setTimeout(()=>toast3('Welcome to the new design. Switch back any time from the menu.'),600)};
window.v3Disable=function(){lsSet('cbt_v3',true)};
/* already signed in and the new design chosen: take over the first screen */
if(v3On()&&typeof AUTH!=='undefined'&&AUTH&&!INTEST){boot();document.body.classList.add('v3on');route()}

/* ================= REVIEW REQUEST after a test (both designs) =================
   After every submitted test the student is asked to rate THAT TEST (v66: cbt_test_review_save, private to the admin;
   before v66 is run, the test series is asked for instead): stars AND a short comment (at least 15
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
async function rvAsk(sid,title,manual,test){
  if(rvHost||(!sid&&!test)||typeof rpc!=='function')return;
  if(!manual&&document.body.classList.contains('intest'))return;
  let mine=null;
  /* one test (v66); if the server does not have it yet, the series as before */
  if(test&&test.id){try{const r=await rpc('cbt_test_review_mine',{p_test:test.id});if(r&&r.ok)mine=r.review;else if(r&&r.error==='server'&&r.status===404){test=null}else return}catch(e){return}
    if(!test&&!sid)return}
  if(!test){try{const r=await rpc('cbt_review_mine',{p_series:sid});if(!r||!r.ok){if(manual&&typeof toast==='function')toast('Could not open reviews. Please try again.');return}mine=r.review}catch(e){return}}
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
    <p class="s">${test?`Rate <b>${esc3(test.title||'this test')}</b>. Tell us about the questions, the level and the time. It goes straight to our team.`:`Rate <b>${esc3(title||'this test series')}</b>. Your words help other students choose, and help us make every test better.`}</p>
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
    go.disabled=true;go.textContent='Sending…';er.textContent='';let r=null;
    try{r=test?await rpc('cbt_test_review_save',{p_test:test.id,p_rating:rating,p_body:body}):await rpc('cbt_review_save',{p_series:sid,p_rating:rating,p_body:body,p_photo:''})}catch(e){}
    if(!r||!r.ok){go.textContent='Submit review';sync();er.textContent=r&&r.error==='busy'?'Please wait a few seconds and try again.':r&&r.error==='not_unlocked'?'Reviews open once this series is unlocked for you.':r&&r.error==='short'?`Please write at least ${RVMIN} letters.`:'Could not send. Please check your internet and try again.';return}
    if(!test){try{SRV&&delete SRV[(itemOfSeries(sid)||{}).id];XD=null}catch(e){}}
    B.innerHTML=`<div class="ty"><div class="ic">${RVI.heart}</div><h2>Thank you!</h2><p class="s">${test?'Your feedback has reached our team. It helps us make every test better.':r.status==='pending'?'Your review will show after a quick check.':'Your review is live on the series page.'}</p></div>`;
    setTimeout(rvClose,1800);if(scrOpen()&&top()&&top().key==='sp')setTimeout(()=>{loadExtras();redraw()},400)};
  const nudge=()=>{nudged=true;B.innerHTML=`<div class="ty"><div class="ic">${RVI.heart}</div><h2 id="rvT">Just 20 seconds?</h2><p class="s">${test?'Two lines from you tell us what to improve in the next test.':'Two lines from you help hundreds of students pick the right test series, and tell us what to improve next.'}</p></div>
    <button class="go">Write my review</button><button class="ln">Not now</button>`;B.querySelector('.go').addEventListener('click',form);B.querySelector('.ln').addEventListener('click',rvClose)};
  R.querySelector('.x').addEventListener('click',()=>{const ta=B.querySelector('textarea');if(!manual&&!nudged&&!(ta&&ta.value.trim().length>=RVMIN))nudge();else rvClose()});
  R.querySelector('.bg').addEventListener('click',()=>{if(manual)rvClose()});
  form();requestAnimationFrame(()=>requestAnimationFrame(()=>W.classList.add('on')))}
/* after a test is submitted (result shown, or "result after …"): ask once the screen has settled */
(function(){if(typeof sendPending!=='function')return;let just=null;
  const _sp=sendPending;sendPending=function(it){try{const L=(typeof CAT!=='undefined'&&CAT)||null,t=L&&(L.tests||[]).find(x=>x.id===(it&&it.tid)),s=t&&(L.series||[]).find(x=>x.id===t.series_id);
    just=t?{sid:s&&s.unlocked?s.id:null,title:s&&s.title,test:{id:t.id,title:t.title},at:Date.now()}:null}catch(e){just=null}return _sp.apply(this,arguments)};
  const after=()=>{if(!just||Date.now()-just.at>120000)return;const j=just;just=null;setTimeout(()=>rvAsk(j.sid,j.title,false,j.test),1400)};
  ['showHeld','showResult'].forEach(n=>{const f=window[n];if(typeof f!=='function')return;window[n]=function(){const r=f.apply(this,arguments);try{after()}catch(e){}return r}})})();
})();

/* ================= THE EXAM SCREEN in the new design =================
   Runs outside the v3 bubble on purpose: the exam engine stays the classic one (cbt_start, timer, answers saved on
   the phone every change and online every few seconds, offline resume, leave warnings, Hindi / English, submit and
   the pending queue). Only the screen is drawn here, with the same actions (sel, clr, go, goSec, saveNext,
   markNext, pal, submitAsk). With the classic design on, nothing here runs. */
(function(){'use strict';
if(typeof draw!=='function'||typeof T==='undefined')return;
const on=()=>document.body.classList.contains('v3on');
const XV=['bg','surface','surface2','line','tx','mut','faint','ink','onInk','acc','acc1','acc2','onAcc','accSoft','ok','err','warn','hero1','hero2','heroTx','heroMut','glow'];
function xSync(){const h=document.getElementById('v3host');if(!h)return;const cs=getComputedStyle(h),b=document.body.style;XV.forEach(v=>{const x=cs.getPropertyValue('--'+v).trim();if(x)b.setProperty('--x-'+v,x)});
  b.setProperty('--x-dark',(h.dataset.mode&&h.dataset.mode!=='light')?'1':'0');document.body.classList.toggle('x3dark',!!h.dataset.mode&&h.dataset.mode!=='light')}
const xs=i=>{const has=P.ans[i]!=null,mk=P.mark[i];return mk?(has?'mans':'mark'):has?'ans':P.vis[i]?'na':'nv'};
const LBL={nv:'Not visited',na:'Not answered',ans:'Answered',mark:'Marked',mans:'Answered & marked'};
function xCounts(idx){const c={nv:0,na:0,ans:0,mark:0,mans:0};idx.forEach(i=>c[xs(i)]++);return c}
function xPal(){const lock=!!T.lock_back,cur=SEC.of(P.cur),idx=SEC.has?T.questions.map((_,i)=>i).filter(i=>SEC.of(i)===cur):T.questions.map((_,i)=>i),c=xCounts(idx);
  return `${SEC.has?`<p class="x3ps">${esc(SEC.label(cur))}</p>`:''}<div class="x3pal">${idx.map(i=>`<button class="${xs(i)}${i===P.cur?' cur':''}" ${lock?'disabled':''} onclick="go(${i})" aria-label="Question ${i+1}, ${LBL[xs(i)]}">${i+1}</button>`).join('')}</div>
  <div class="x3leg">${['ans','na','nv','mark','mans'].map(k=>`<span><i class="${k}">${c[k]}</i>${LBL[k]}</span>`).join('')}</div>`}
const _draw=draw;
draw=function(){if(!on()||!T||!P)return _draw.apply(this,arguments);
  document.body.classList.remove('x3ins');xSync();const n=T.questions.length,q=T.questions[P.cur],a=P.ans[P.cur],lock=!!T.lock_back,all=xCounts(T.questions.map((_,i)=>i)),done=all.ans+all.mans;
  P.vis[P.cur]=1;const hi=T.lang==='hi';
  const opt=(o,i)=>(o||(q.oimg&&q.oimg[i]))?`<button class="x3op ${pracCls(q,a,i)}" ${T.practice&&a!=null?'':`onclick="sel(${i})"`} aria-pressed="${a===i}"><span class="k">${L[i]}</span><span class="t">${esc(o)}${imgTag(q.oimg&&q.oimg[i],'oi')}</span></button>`:'';
  document.getElementById('app').innerHTML=`<div class="x3">
   <header class="x3h cbtbar"><div class="x3t"><b class="tb-title">${esc(T.title)}${hi?' <span class="lgb">हिंदी</span>':''}</b><small>${esc((AUTH&&AUTH.name)||'')}</small></div>
    <div class="timer x3tm" id="tm">${ic('clock',16)}<span>--:--</span></div><button class="x3sub" onclick="submitAsk()">Submit</button></header>
   <div class="x3bar" aria-hidden="true"><i style="width:${(done/n*100).toFixed(1)}%"></i></div>
   ${SEC.has?`<nav class="x3sec">${SEC.names.map(s=>`<button class="${s===SEC.of(P.cur)?'on':''}" ${lock?'disabled':''} onclick="goSec(${JSON.stringify(s).replace(/"/g,'&quot;')})">${esc(SEC.label(s))}</button>`).join('')}</nav>`:''}
   <div class="x3m"><section class="qcard x3q"${hi?' lang="hi"':''}>
     <div class="x3qm"><span class="x3qn">Question ${P.cur+1}<small> of ${n}</small></span><span class="x3mk"><i class="g">+${T.correct}</i><i class="b">−${T.wrong}</i></span>${P.mark[P.cur]?'<span class="x3chip">Marked</span>':''}<span style="flex:1"></span>${bmBtn(P.tid,P.cur)}${rpBtn(P.tid,P.cur)}</div>
     <div class="x3qt">${esc(q.q)}</div>${imgTag(q.img)}
     <div class="x3os">${q.options.map(opt).join('')}</div>${pracFb(q,a)}
     ${a!=null&&!T.practice?'<button class="x3clr" onclick="clr()">Clear response</button>':''}</section>
    <aside class="x3side"><div class="x3who"><span>${esc(((AUTH&&AUTH.name)||'?').trim()[0].toUpperCase())}</span><div><b>${esc((AUTH&&AUTH.name)||'')}</b><small>Candidate</small></div></div>${xPal()}<button class="x3sub blk" onclick="submitAsk()">Submit test</button></aside></div>
   <footer class="x3f">${lock?'':`<button class="x3nav" ${P.cur===0?'disabled':''} onclick="go(${P.cur-1})" aria-label="Previous question">${ic('left',20)}</button>`}
    <button class="x3pb" onclick="pal(true)" aria-label="Question palette">${ic('grid',18)}<span>${done}/${n}</span></button>
    <button class="x3mn" onclick="markNext()">${ic('flag',16)}<span>Mark &amp; Next</span></button>
    <button class="x3sn" onclick="saveNext()"><span>${P.cur===n-1?'Save':'Save &amp; Next'}</span>${ic('right',18)}</button></footer>
   <div class="sheet x3sh ${typeof palOpen!=='undefined'&&palOpen?'open':''}" onclick="if(event.target===this)pal(false)"><div class="in"><div class="grab"></div><div class="x3shh"><b>Question palette</b><button onclick="pal(false)" aria-label="Close">${ic('x',18)}</button></div>${xPal()}<button class="x3sub blk" onclick="submitAsk()">Submit test</button></div></div></div>`;
  tick()};
/* the instructions page and the exam pop-ups take the new look too (CSS below); keep the colours in step */
if(typeof instr==='function'){const _in=instr;instr=function(){const r=_in.apply(this,arguments);if(on()){xSync();document.body.classList.add('x3ins');
    const b=document.querySelector('#app .ins > button.btn.ghost');if(b&&window.v3BackNew){b.removeAttribute('onclick');b.addEventListener('click',e=>{e.preventDefault();window.v3BackNew()})}}return r}}
addEventListener('hashchange',()=>{if(!document.querySelector('#app .ins'))document.body.classList.remove('x3ins')});
/* a test you made with the test generator: the same classic engine (cbt_gen_start / save / submit), drawn like the exam above */
if(typeof gDraw==='function'&&typeof gSt==='function'){const _gd=gDraw;
  const gPal3=()=>{const c={nv:0,na:0,ans:0,mark:0,mans:0};GT.q.forEach((_,i)=>c[gSt(i)]++);
    return `<div class="x3pal">${GT.q.map((_,i)=>`<button class="${gSt(i)}${i===GP.cur?' cur':''}" onclick="gGo(${i})" aria-label="Question ${i+1}, ${LBL[gSt(i)]}">${i+1}</button>`).join('')}</div>
    <div class="x3leg">${['ans','na','nv','mark','mans'].map(k=>`<span><i class="${k}">${c[k]}</i>${LBL[k]}</span>`).join('')}</div>`};
  gDraw=function(){if(!on()||!GT)return _gd.apply(this,arguments);
    document.body.classList.remove('x3ins');xSync();const n=GT.q.length,q=GT.q[GP.cur],a=GP.ans[q.id],L=['A','B','C','D'];GP.vis[q.id]=1;
    const done=GT.q.filter(x=>GP.ans[x.id]!=null).length;
    document.getElementById('app').innerHTML=`<div class="x3">
     <header class="x3h cbtbar"><div class="x3t"><b class="tb-title">${esc(GT.title)}</b><small>${esc(qbSub(q.s))}${q.c?' · '+esc(qbChap(q.s,q.c)):''}</small></div>
      <div class="timer x3tm" id="tm">${ic('clock',16)}<span>--:--</span></div><button class="x3sub" onclick="gAsk()">Submit</button></header>
     <div class="x3bar" aria-hidden="true"><i style="width:${(done/n*100).toFixed(1)}%"></i></div>
     <div class="x3m"><section class="qcard x3q">
       <div class="x3qm"><span class="x3qn">Question ${GP.cur+1}<small> of ${n}</small></span><span class="x3mk"><i class="g">+${GT.plus}</i>${GT.minus?`<i class="b">−${GT.minus}</i>`:''}</span>${GP.mark[q.id]?'<span class="x3chip">Marked</span>':''}<span style="flex:1"></span><span class="x3chip">${esc(qbLbl(QB_LV,q.l))}</span></div>
       <div class="x3qt">${esc(q.q)}</div>${imgTag(q.img)}
       <div class="x3os">${(q.options||[]).map((o,i)=>`<button class="x3op${a===i?' sel':''}" onclick="gSel(${i})" aria-pressed="${a===i}"><span class="k">${L[i]}</span><span class="t">${esc(o)}${imgTag(q.oimg&&q.oimg[i],'oi')}</span></button>`).join('')}</div>
       ${a!=null?'<button class="x3clr" onclick="gClr()">Clear response</button>':''}</section>
      <aside class="x3side"><div class="x3who"><span>${esc(((AUTH&&AUTH.name)||'?').trim()[0].toUpperCase())}</span><div><b>${esc((AUTH&&AUTH.name)||'')}</b><small>Candidate</small></div></div>${gPal3()}<button class="x3sub blk" onclick="gAsk()">Submit test</button></aside></div>
     <footer class="x3f"><button class="x3nav" ${GP.cur===0?'disabled':''} onclick="gGo(${GP.cur-1})" aria-label="Previous question">${ic('left',20)}</button>
      <button class="x3pb" onclick="gPalT(true)" aria-label="Question palette">${ic('grid',18)}<span>${done}/${n}</span></button>
      <button class="x3mn" onclick="gMarkNext()">${ic('flag',16)}<span>Mark &amp; Next</span></button>
      <button class="x3sn" onclick="gSaveNext()"><span>${GP.cur===n-1?'Save':'Save &amp; Next'}</span>${ic('right',18)}</button></footer>
     <div class="sheet x3sh ${typeof palOpen!=='undefined'&&palOpen?'open':''}" onclick="if(event.target===this)gPalT(false)"><div class="in"><div class="grab"></div><div class="x3shh"><b>Question palette</b><button onclick="gPalT(false)" aria-label="Close">${ic('x',18)}</button></div>${gPal3()}<button class="x3sub blk" onclick="gAsk()">Submit test</button></div></div></div>`;
    gTick(true)}}
const css=document.createElement('style');css.id='x3css';css.textContent=`
body.v3on.intest{background:var(--x-bg)!important;font-family:Geist,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body.v3on.intest #app{max-width:none;padding:0}
.x3{min-height:100vh;background:var(--x-bg);color:var(--x-tx);padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}
.x3 button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;-webkit-tap-highlight-color:transparent}
.x3h{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top,0px));background:color-mix(in srgb,var(--x-bg) 88%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-bottom:1px solid var(--x-line);box-shadow:none;margin:0;border-radius:0}
.x3t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.x3t b{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.x3t small{font-size:12px;color:var(--x-mut)}
.x3tm{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:12px;background:var(--x-surface2);font-weight:600;font-variant-numeric:tabular-nums;font-size:15px;color:var(--x-tx);border:0}
.x3tm.low{background:color-mix(in srgb,var(--x-err) 14%,transparent);color:var(--x-err);animation:x3p 1s ease-in-out infinite}
@keyframes x3p{50%{opacity:.6}}
.x3sub{height:38px;padding:0 14px;border-radius:12px;background:var(--x-ink)!important;color:var(--x-onInk)!important;font-weight:600;font-size:14px}
.x3sub.blk{width:100%;height:48px;margin-top:16px;border-radius:14px;font-size:15px}
.x3bar{height:3px;background:var(--x-surface2)}.x3bar i{display:block;height:100%;background:var(--x-acc1);transition:width .4s ease}
.x3sec{display:flex;gap:8px;overflow-x:auto;padding:12px 14px 0;scrollbar-width:none}.x3sec::-webkit-scrollbar{display:none}
.x3sec button{flex:none;height:36px;padding:0 14px;border-radius:99px;border:1.5px solid var(--x-line)!important;font-size:13.5px;font-weight:500;background:var(--x-surface)!important}
.x3sec button.on{background:var(--x-ink)!important;color:var(--x-onInk)!important;border-color:transparent!important}
.x3m{max-width:1080px;margin:0 auto;padding:14px;display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:900px){.x3m{grid-template-columns:1fr 320px;align-items:start}}
.x3q{background:var(--x-surface)!important;border:1px solid var(--x-line)!important;border-radius:22px!important;padding:18px!important;box-shadow:0 12px 30px -22px rgba(0,0,0,.35)!important;margin:0!important}
.x3qm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.x3qn{font-size:15px;font-weight:600}.x3qn small{font-weight:400;color:var(--x-mut)}
.x3mk{display:inline-flex;gap:4px}.x3mk i{font-style:normal;font-size:12px;font-weight:600;padding:3px 8px;border-radius:8px}
.x3mk .g{background:color-mix(in srgb,var(--x-ok) 13%,transparent);color:var(--x-ok)}.x3mk .b{background:color-mix(in srgb,var(--x-err) 12%,transparent);color:var(--x-err)}
.x3chip{font-size:12px;font-weight:600;padding:3px 9px;border-radius:8px;background:var(--x-accSoft);color:var(--x-acc)}
.x3qt{font-size:16.5px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
.x3q img.qi{max-width:100%;height:auto;border-radius:12px;margin-top:12px;background:#fff}
.x3os{display:flex;flex-direction:column;gap:10px;margin-top:18px}
.x3op{display:flex;align-items:flex-start;gap:12px;width:100%;padding:14px!important;border-radius:16px!important;border:1.5px solid var(--x-line)!important;background:var(--x-surface)!important;text-align:left;font-size:15.5px;line-height:1.5;transition:border-color .2s,background .2s,transform .2s}
.x3op:active{transform:scale(.99)}
.x3op .k{flex:none;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-weight:600;font-size:14px;background:var(--x-surface2)}
.x3op .t{flex:1;min-width:0;overflow-wrap:anywhere}
.x3op.sel{border-color:var(--x-ink)!important;background:color-mix(in srgb,var(--x-ink) 6%,var(--x-surface))!important}
.x3op.sel .k{background:var(--x-ink);color:var(--x-onInk)}
.x3op.ok{border-color:var(--x-ok)!important;background:color-mix(in srgb,var(--x-ok) 10%,var(--x-surface))!important}.x3op.ok .k{background:var(--x-ok);color:#fff}
.x3op.bad{border-color:var(--x-err)!important;background:color-mix(in srgb,var(--x-err) 9%,var(--x-surface))!important}.x3op.bad .k{background:var(--x-err);color:#fff}
.x3q .pfb{margin-top:14px;padding:14px;border-radius:14px;background:var(--x-surface2);font-size:14.5px;line-height:1.55}
.x3clr{margin-top:12px;height:38px;padding:0 14px;border-radius:12px;background:var(--x-surface2)!important;font-size:13.5px;font-weight:500}
.x3side{display:none;background:var(--x-surface);border:1px solid var(--x-line);border-radius:22px;padding:16px;position:sticky;top:80px}
@media(min-width:900px){.x3side{display:block}}
.x3who{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.x3who>span{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:600;background:var(--x-surface2)}
.x3who b{display:block;font-size:14.5px}.x3who small{font-size:12px;color:var(--x-mut)}
.x3ps{font-size:13px;font-weight:600;margin:0 0 10px}
.x3pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:8px}
.x3pal button{height:42px;border-radius:12px!important;font-size:14px;font-weight:600;border:1.5px solid transparent!important;transition:transform .2s}
.x3pal button:active{transform:scale(.92)}
.x3pal .nv{background:var(--x-surface2)!important;color:var(--x-mut)!important}
.x3pal .na{background:color-mix(in srgb,var(--x-err) 12%,var(--x-surface))!important;color:var(--x-err)!important}
.x3pal .ans{background:var(--x-ok)!important;color:#fff!important}
.x3pal .mark{background:#8a6fd1!important;color:#fff!important}
.x3pal .mans{background:#8a6fd1!important;color:#fff!important;box-shadow:inset 0 -4px 0 var(--x-ok)}
.x3pal .cur{border-color:var(--x-ink)!important;box-shadow:0 0 0 2px var(--x-surface),0 0 0 4px var(--x-ink)}
.x3leg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;font-size:12.5px;color:var(--x-mut)}
.x3leg span{display:flex;align-items:center;gap:7px}.x3leg span:last-child{grid-column:1/-1}
.x3leg i{font-style:normal;min-width:24px;height:24px;padding:0 5px;border-radius:7px;display:grid;place-items:center;font-size:12px;font-weight:600}
.x3leg .nv{background:var(--x-surface2)}.x3leg .na{background:color-mix(in srgb,var(--x-err) 12%,var(--x-surface));color:var(--x-err)}.x3leg .ans{background:var(--x-ok);color:#fff}.x3leg .mark,.x3leg .mans{background:#8a6fd1;color:#fff}
.x3f{position:fixed;left:0;right:0;bottom:0;z-index:25;display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--x-surface) 92%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-top:1px solid var(--x-line)}
.x3f button{height:50px;border-radius:15px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:600;font-size:14.5px}
.x3nav{flex:none;width:50px;background:var(--x-surface2)!important}.x3nav:disabled{opacity:.4}
.x3pb{flex:none;padding:0 12px;background:var(--x-surface2)!important;font-size:13.5px!important}
.x3mn span,.x3sn span{white-space:nowrap}
@media(max-width:430px){.x3mn svg{display:none}.x3mn{font-size:13.5px!important}}
body.x3ins .hdr,body.x3ins #bnav{display:none!important}
body.x3ins #v3host{display:none!important}
body.v3on.x3ins{padding-top:env(safe-area-inset-top,0px)}
.x3mn{flex:1;background:color-mix(in srgb,#8a6fd1 14%,var(--x-surface))!important;color:#7a5fc4!important}
.x3sn{flex:1.4;background:var(--x-ink)!important;color:var(--x-onInk)!important}
body.x3dark .x3mn{color:#c3b2f2!important}
.x3sh{position:fixed;inset:0;z-index:40;background:rgba(10,10,12,.45);opacity:0;pointer-events:none;transition:opacity .3s}
.x3sh.open{opacity:1;pointer-events:auto}
.x3sh .in{position:absolute;left:0;right:0;bottom:0;max-height:82vh;overflow:auto;background:var(--x-surface);color:var(--x-tx);border-radius:26px 26px 0 0;padding:10px 18px calc(18px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:transform .45s cubic-bezier(.2,.9,.25,1)}
.x3sh.open .in{transform:none}
.x3sh .grab{width:40px;height:4px;border-radius:4px;background:var(--x-line);margin:0 auto 12px}
.x3shh{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.x3shh b{font-size:17px}
.x3shh button{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--x-surface2)!important}
.x3 .iconbtn{width:36px;height:36px;border-radius:11px;background:var(--x-surface2);border:0;color:var(--x-tx)}
.x3 .iconbtn.on{color:var(--x-acc);background:var(--x-accSoft)}
body.v3on.intest #layer .modal .box,body.v3on.v3old #layer .modal .box{border-radius:24px;background:var(--x-surface);color:var(--x-tx);font-family:Geist,system-ui,sans-serif}
body.v3on.intest #layer .modal .btn,body.v3on.v3old #layer .modal .btn{border-radius:14px;min-height:46px;font-weight:600}
body.v3on.v3old #app .ins.im{font-family:Geist,system-ui,sans-serif}
body.v3on.v3old #app .ins.im .im-hero{background:radial-gradient(120% 90% at 100% 0%,var(--x-glow),transparent 60%),linear-gradient(155deg,var(--x-hero1),var(--x-hero2));color:var(--x-heroTx);border-radius:24px;box-shadow:0 24px 50px -28px rgba(0,0,0,.5)}
body.v3on.v3old #app .ins.im .im-hero h1{color:var(--x-heroTx)}
body.v3on.v3old #app .ins.im #sb{background:var(--x-ink);color:var(--x-onInk);border-radius:16px;min-height:52px;font-weight:600}
body.v3on.v3old #app .ins.im #sb:disabled{opacity:.4}
`;document.head.appendChild(css);
})();
