/* Store page: the paid test series (managed in the admin console → Store), in the admin console's design: a menu on
   the left on computers, a menu bar at the bottom on phones, and five pages — Home (the series, one row per section),
   Search, Reviews, Help and Profile. Each series has its Explore page (description, schedule, demo tests, reviews).
   The student gives name + mobile + course (NEET / JEE) once on the welcome screen. Then: Buy now → pay with UPI →
   payment details → verify on Telegram / WhatsApp (message + screenshot). Prices, UPI ID and Telegram come only
   from the database. */
// never run inside someone else's page (stops look-alike sites from framing the real store)
if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location.replace(window.self.location.href)}catch(e){}}
const CFG=window.CBT_CONFIG||{},API=(CFG.SUPABASE_URL||'').replace(/\/$/,'');
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLORS=['blue','green','purple','orange','red','dark'];
// icons: one set of line icons in store.html (<symbol id="i-…">, the admin console's shapes), used by name
const I=(n,c)=>`<svg class="i${c?' '+c:''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
// a big icon tile (empty states, payment steps); k = its colour: pri, gold, ok, bad, info, vio
const bigI=(n,k)=>`<div class="bigi ${k||'pri'}">${I(n)}</div>`;
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const inr=n=>'₹'+Number(n||0).toLocaleString('en-IN');
const plural=(n,w)=>{n=Number(n)||0;return `${n} ${w}${n>1?'s':''}`};
let ST={settings:{},items:[]},ORD=null,IT=null,LOADED=0;   // LOADED: 0 = loading, 1 = ready, -1 = could not load
const LSg=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(_){return d}};
const LSs=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
const LSd=k=>{try{localStorage.removeItem(k)}catch(_){}};

async function rpc(fn,args){
  try{
    const r=await fetch(API+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args||{})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    return await r.json();
  }catch(e){return{ok:false,error:'network'}}
}
// a short message at the bottom (above the menu bar on phones); ic = its icon, k = 'bad' for a problem
function toast(t,ic,k){
  const w=$('#tst'),o=w.querySelector('.toast');if(o)o.remove();
  const d=document.createElement('div');d.className='toast'+(k?' '+k:'');d.setAttribute('role','status');
  d.innerHTML=`<span class="ti">${I(ic||(k==='bad'?'alert':'ok'))}</span><span class="tt"></span>`;d.lastChild.textContent=t;w.appendChild(d);
  setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),RM?0:220)},2800);
}
async function copy(t,what){
  try{await navigator.clipboard.writeText(t)}catch(_){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()}
  toast(what||'Copied','copy');
}
// a wrong entry: the box shakes once
function shake(e){if(!e||RM)return;e.classList.remove('shake');void e.offsetWidth;e.classList.add('shake')}
// the one support account from config.js (falls back to the store's Telegram setting)
const tgUser=()=>String((CFG.SUPPORT_URL||'').replace(/^.*t\.me\//,'').replace(/[/?#].*$/,'')||ST.settings.telegram||'').replace(/^@/,'');

/* ---------- light / dark theme: the saved choice, else the phone's setting (store-theme.js applies it before the page
   is drawn). A new theme grows as a circle from the button that was tapped. ---------- */
function themeMeta(){
  const t=document.documentElement.dataset.theme;
  $$('meta[name=theme-color]').forEach(m=>{m.removeAttribute('media');m.content=t==='light'?'#f3f6fa':'#060a13'});
}
const themeSaved=()=>{try{const t=localStorage.getItem('store_theme');return t==='light'||t==='dark'?t:''}catch(_){return ''}};
const themeOs=()=>matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
// t: 'light', 'dark' or '' (= follow the phone). ev: the tap
function themeSet(t,ev){
  const d=document.documentElement,now=t||themeOs();
  const apply=()=>{d.dataset.theme=now;try{t?localStorage.setItem('store_theme',t):localStorage.removeItem('store_theme')}catch(_){}themeMeta();themeUi()};
  if(now===d.dataset.theme||RM||!document.startViewTransition||!ev||!ev.clientX)return apply();
  const x=ev.clientX,y=ev.clientY,r=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  const vt=document.startViewTransition(apply);
  vt.ready.then(()=>d.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${r}px at ${x}px ${y}px)`]},{duration:560,easing:'cubic-bezier(.2,.8,.2,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
}
function themeToggle(ev){themeSet(document.documentElement.dataset.theme==='dark'?'light':'dark',ev)}
function themeUi(){const s=themeSaved();$$('[data-theme-set]').forEach(b=>{const on=b.dataset.themeSet===s;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)})}

/* ---------- the student: name + mobile, asked once on the welcome screen, used for every order ---------- */
let MEM=null;   // if the phone does not allow saving, keep the details for this visit
const meOk=m=>!!m&&String(m.name||'').trim().length>=2&&/^[6-9]\d{9}$/.test(m.mobile||'');
const ME=()=>{const m=LSg('store_me',null);return meOk(m)?m:meOk(MEM)?MEM:null};
const meCheck=(n,m)=>n.length<2?'Please enter your name.':!/^[6-9]\d{9}$/.test(m)?'Please enter a valid 10-digit mobile number.':'';
const meRead=(ni,mi)=>[$(ni).value.trim().replace(/\s+/g,' ').slice(0,60),$(mi).value.replace(/\D/g,'').slice(-10)];
function meSave(n,m,c){
  const old=ME(),was=course();if(!old||old.mobile!==m)LSd('store_ord');   // a new number never continues the old number's order
  MEM={name:n,mobile:m,course:CN[c]?c:was};LSs('store_me',MEM);CRS=MEM.course;
  document.documentElement.classList.add('has-me');meUi();
  // "You will be notified" belongs to a number: redraw those buttons for the new one
  $$('[data-soon]').forEach(e=>{const x=ST.items.find(i=>i.id===e.dataset.soon);if(x)e.outerHTML=buyBtn(x,e.dataset.k)});
  if(MEM.course!==was)courseGo();
}
// the name everywhere: menu, menu bar, greeting, Profile
function meUi(){
  const m=ME();if(!m)return;
  $$('[data-meini]').forEach(e=>e.textContent=m.name[0].toUpperCase());$$('[data-mename]').forEach(e=>e.textContent=m.name);
  const s=$('#mesub');if(s)s.textContent=`${CN[course()]} · ${m.mobile}`;
  hero();if(VW==='me')meDraw();
}
function gateGo(){
  const [n,m]=meRead('#gn','#gm'),c=gcPick('#gate'),bad=meCheck(n,m)||(c?'':'Please choose your course — NEET or JEE.');
  if(bad){$('#ger').textContent=bad;shake($('#gate .lg-card'));return}
  $('#ger').textContent='';const g=$('#gate');if(g.classList.contains('out'))return;g.classList.add('out');
  setTimeout(()=>{meSave(n,m,c);g.classList.remove('out');appIn();jump()},RM?0:420);
}
// the store behind the welcome screen: closed to taps until the student is known, then it rises in
function appIn(){
  $$('.app,.dock').forEach(e=>e.inert=false);
  requestAnimationFrame(()=>{navUi();railsInit()});
  if(RM)return;document.body.classList.add('boot');setTimeout(()=>document.body.classList.remove('boot'),1200);
}
/* ---------- course: NEET or JEE (welcome screen, Profile, or the switch at the top). A series set to NEET or
   JEE in the admin panel shows only for that course; a series with no course shows for both. ---------- */
const CN={neet:'NEET',jee:'JEE'},other=c=>c==='jee'?'neet':'jee';
let CRS='';   // the course for this visit if the phone does not allow saving
const course=()=>{const m=ME(),c=(m&&m.course)||CRS;return CN[c]?c:'neet'};
const forC=(x,c)=>!x.course||x.course===(c||course());
const gcPick=box=>{const b=$(box+' [data-gc][aria-checked=true]');return b?b.dataset.gc:''};
const CRSL=[['neet','steth','Medical'],['jee','atom','Engineering']];
// the two course tiles: in a form (a = 'gc', saved with the form) or on Profile (a = 'course', switches at once)
const crsHtml=(c,a,lid)=>`<div class="crs" role="radiogroup" aria-labelledby="${lid}">${CRSL.map(([k,i,t])=>`<button type="button" class="crsb" role="radio" aria-checked="${k===c}" data-${a}="${k}"><i>${I(i)}</i><span><b>${CN[k]}</b><small>${t}</small></span>${I('check','ck')}</button>`).join('')}</div>`;
function courseUi(){
  const c=course();document.documentElement.dataset.course=c;
  $$('[role=radio][data-course]').forEach(b=>b.setAttribute('aria-checked',b.dataset.course===c));
  $$('[data-cname]').forEach(e=>e.textContent=CN[c]);
  const q=$('#q');if(q){q.placeholder=`Search ${CN[c]} test series`;q.setAttribute('aria-label',`Search ${CN[c]} test series`)}
  const s=$('#mesub'),m=ME();if(s&&m)s.textContent=`${CN[c]} · ${m.mobile}`;
}
function setCourse(c){
  if(!CN[c])return;const was=course();CRS=c;
  const m=ME();if(m&&m.course!==c){MEM=Object.assign({},m,{course:c});LSs('store_me',MEM)}
  if(c===was)return courseUi();
  courseGo(1);if(VW==='me'||VW==='help')toast(`Showing ${CN[c]} test series`,c==='jee'?'atom':'steth');
}
// the course changed: redraw the series, the search and the reviews for it
// fade = the student tapped the switch: the old list fades out first
function courseGo(fade){
  courseUi();
  const l=$('#list'),f=fade&&l&&ST.items.length&&!RM&&VW==='home',run=()=>{if(l)l.classList.remove('fade');draw(true);rvAllDraw();if(VW==='search')sDraw();if(VW==='me')meDraw()};
  if(f){l.classList.add('fade');setTimeout(run,170)}else run();
  if(VW==='home'&&scrollY>240)scrollTo({top:0,behavior:RM?'auto':'smooth'});
}
let AFTER=null;
const fld=(id,lab,ic,attrs)=>`<div class="fld"><label for="${id}">${lab}</label><div class="inp-wrap">${I(ic)}<input class="inp" id="${id}" ${attrs}></div></div>`;
// edit name / mobile (Profile, or "change" on the payment step); then = what to do after saving
function meSheet(then){
  const m=ME()||{};AFTER=then||null;
  ovSet(modal({t:'Your details',s:'Your series is unlocked on this mobile number.',cls:'narrow',
   body:`${fld('sn','Full name','user',`autocomplete="name" maxlength="60" value="${esc(m.name||'')}" placeholder="e.g. Rahul Sharma"`)}
    ${fld('sm','Mobile number','phone',`type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" value="${esc(m.mobile||'')}" placeholder="10-digit mobile number"`)}
    ${then?'':`<div class="fld"><span class="lbl" id="mcl">Your course</span>${crsHtml(course(),'gc','mcl')}</div>`}<div class="err" id="er" role="alert"></div>`,
   foot:`<button class="btn pri lg block" id="go" data-mesave>${then?`Save &amp; continue ${I('next')}`:`${I('check')}Save`}</button>`}));
}
function meSaveGo(){
  const [n,m]=meRead('#sn','#sm'),bad=meCheck(n,m);
  if(bad){$('#er').textContent=bad;shake($('.ov .modal'));return}
  meSave(n,m,gcPick('.ov'));const a=AFTER;AFTER=null;
  if(a)a();else{closeSheet();toast('Details saved')}
}

/* ---------- pages: Home · Search · Reviews · Help · Profile. Home is the first history entry; another page goes on
   top of it (one entry), so the phone's Back button comes back to Home. ---------- */
const VIEWS={home:'Home',search:'Search',reviews:'Reviews',help:'Help',me:'Profile'},VK=Object.keys(VIEWS);
let VW='',VH=false;const VS={};   // the page shown; VH = it has its own history entry; VS = where each page was scrolled to
const vHash=()=>{const m=location.hash.match(/^#\/(\w+)/);return m&&VIEWS[m[1]]?m[1]:'home'};
function go(v,focus){
  if(!VIEWS[v])return;
  if(v===VW){if(v==='search'&&focus)qFocus();else scrollTo({top:0,behavior:RM?'auto':'smooth'});return}
  if(v==='home'){if(VH){history.back();return}history.replaceState(null,'',location.pathname+location.search)}
  else{try{history[VW==='home'?'pushState':'replaceState']({v:1},'','#/'+v)}catch(_){}if(VW==='home')VH=true}
  show(v);
  if(v==='search'&&(focus||matchMedia('(hover:hover)').matches))qFocus();
}
function show(v){
  const was=VW,el=$('#v-'+v);if(!el)return;
  if(was)VS[was]=scrollY;
  $$('.view').forEach(o=>{if(o!==el){o.hidden=true;o.classList.remove('vin')}});
  VW=v;document.body.dataset.v=v;el.hidden=false;
  // the new page slides in from the side of the menu item that was tapped
  if(was&&!RM){el.style.setProperty('--dx',Math.sign(VK.indexOf(v)-VK.indexOf(was))*22+'px');el.classList.remove('vin');void el.offsetWidth;el.classList.add('vin')}
  $('#crumb').textContent=VIEWS[v];
  document.title=(v==='home'?'Store':VIEWS[v]+' · Store')+' · '+(CFG.SITE_NAME||'CBT Test Series');
  navUi();
  if(v==='search')sDraw();else if(v==='me')meDraw();
  scrollTo(0,v==='home'?VS.home||0:0);
  if(v==='home')requestAnimationFrame(railsInit);
}
// the open page in the menu: the highlight slides to it
function navUi(){
  $$('.ni[data-go],.me[data-go],.dock [data-go]').forEach(a=>{const on=a.dataset.go===VW;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  const n=$('.nav .ni.on'),ind=$('.nav .ind');
  if(ind){ind.classList.toggle('on',!!n);if(n)ind.style.setProperty('--y',n.offsetTop+'px')}
  const dk=$('.dock');if(dk)dk.style.setProperty('--k',Math.max(0,VK.indexOf(VW)));
}
function qFocus(){const q=$('#q');if(q)q.focus({preventScroll:true})}
// a link straight to a page (#/reviews …) or a series (#x=…): Home goes under it, so Back comes to Home instead of leaving
function under(st,hash){try{history.replaceState(null,'',location.pathname+location.search);history.pushState(st,'',hash);if(st.v)VH=true;else XH=true}catch(_){}}

async function load(){
  const nm=CFG.SITE_NAME||'CBT Test Series';$$('[data-sname]').forEach(e=>e.textContent=nm);
  const r=await rpc('cbt_store');
  if(!r.ok){
    LOADED=-1;$('#kpis').hidden=true;
    $('#list').innerHTML=emptyHtml(r.error==='network'?'alert':'rocket',r.error==='network'?'No internet':'Store is opening soon',r.error==='network'?'Check your connection and refresh.':'Please check back in a little while.',r.error==='network'?'bad':'gold');
    sDraw();rvAllDraw();return;
  }
  ST=r;ST.items=ST.items||[];ST.settings=ST.settings||{};LOADED=1;
  supportUi();
  if(ST.settings.payee)$$('[data-payee]').forEach(e=>e.textContent=ST.settings.payee);
  if(!ST.items.length){$('#kpis').hidden=true;$('#list').innerHTML=emptyHtml('rocket','New test series coming soon','Please check back in a little while.','gold');sDraw();rvAllDraw();return}
  draw(true);if(VW==='search')sDraw();if(VW==='me')meDraw();
  loadSch();loadRv();loadXp();
  if(ME()){liveCheck();jump()}
}
const emptyHtml=(ic,t,p,k,more)=>`<div class="card empty ${k||''}"><div class="e-ic">${I(ic)}</div><h4>${t}</h4><p>${p}</p>${more||''}</div>`;
// a shared link (#p=…) shows that series on Home (or opens it, if it is not there); an Explore link (#x=…) opens its page
function jump(){
  const x=location.hash.match(/x=([0-9a-f-]{36})/);
  if(x&&ST.items.some(i=>i.id===x[1])){if(!history.state)under({xp:1},'#x='+x[1]);return explore(x[1])}
  const h=location.hash.match(/p=([0-9a-f-]{36})/);if(!h||!ST.items.some(i=>i.id===h[1]))return;
  const c=document.getElementById('p_'+h[1]);if(!c)return explore(h[1]);
  c.classList.add('hl');setTimeout(()=>c.scrollIntoView({behavior:RM?'auto':'smooth',block:'center',inline:'center'}),250);
}

/* ---------- Home: greeting, three numbers, then the course's series, one row per section, left to right ---------- */
function greet(){const h=new Date().getHours();return h>=5&&h<12?'Good morning':h>=12&&h<17?'Good afternoon':'Good evening'}
function hero(){
  const c=course(),m=ME(),n=ST.items.filter(x=>forC(x,c)).length;
  $('#hey').textContent=m?`${greet()}, ${m.name.split(' ')[0]}`:`${CN[c]} test series`;
  $('#hh').innerHTML=`Choose your <span class="gt">${CN[c]}</span> test series`;
  if(LOADED===1)$('#hs').textContent=n?`${n} ${CN[c]} test series · real exam pattern · pay with any UPI app`:`${CN[c]} test series are coming soon.`;
}
// a new tile (first draw, other course, the rating arrived) rises in and its number counts up from zero; the rest stay
function kpis(anim){
  const box=$('#kpis');if(!box||LOADED!==1||!ST.items.length)return;
  const c=course(),n=ST.items.filter(x=>forC(x,c)).length,r=rvStat();
  const K=[['layers','Test series',n,0,`for ${CN[c]}`,'','list'],
    r.count?['star','Rating',r.avg,1,plural(r.count,'review'),'gold','reviews']:['trophy','Rank','AIR',-1,'after every test','gold','list'],
    ['card','Pay with','UPI',-1,'Any UPI app','info','help']];
  const key=k=>k[1]+k[2]+k[4];
  const tile=(k,i)=>{const [ic,l,v,d,f,cls,to]=k;return `<button class="kpi ${cls}" style="--i:${i}" data-kpi="${to}" data-k="${esc(key(k))}"><span class="k-l">${I(ic)}<span>${l}</span></span><b class="k-v"${d>=0&&!RM?` data-to="${v}" data-dec="${d}">0`:`>${d>=0?Number(v).toFixed(d):esc(v)}`}</b><span class="k-f">${esc(f)}</span></button>`};
  box.hidden=false;
  const T=box.querySelectorAll('.kpi:not(.skel)');
  if(anim||T.length!==K.length)box.innerHTML=K.map(tile).join('');
  else K.forEach((k,i)=>{if(T[i].dataset.k!==key(k))T[i].outerHTML=tile(k,i)});
  box.querySelectorAll('[data-to]').forEach(countUp);
}
function countUp(e){
  const to=+e.dataset.to,d=+e.dataset.dec||0,t0=performance.now(),T=900;e.removeAttribute('data-to');
  const f=t=>{const p=Math.min(1,(t-t0)/T),k=1-Math.pow(1-p,3);e.textContent=(to*k).toFixed(d);if(p<1)requestAnimationFrame(f)};
  requestAnimationFrame(f);
}
function draw(anim){
  const A=ST.items||[];if(!A.length)return;
  const c=course(),L=A.filter(x=>forC(x,c)),box=$('#list');
  hero();kpis(anim);
  box.classList.toggle('noanim',!anim);
  box.innerHTML=secsHtml(L,c);
  railsInit();
}
// sections in the order set in the admin panel (Store setup ↑ ↓), then any others; series without a section last
const SECI=[[/full|complete|mock|grand|all india/i,'layers'],[/subject/i,'books'],[/chapter|unit/i,'bookopen'],[/topic/i,'target'],[/pyq|previous|past/i,'file'],[/crash|revision|rapid|short/i,'zap'],[/free|demo/i,'gift']];
const secIco=n=>(SECI.find(([r])=>r.test(n))||[0,'spark'])[1];
const SECK=['pri','gold','vio','info','ok','bad'];
// the section's name as written in the admin panel (a series may have it in other capitals)
const secName=x=>{const n=String(x.section||'').trim(),k=n.toLowerCase();return (ST.settings.sections||[]).map(s=>String(s).trim()).find(s=>s.toLowerCase()===k)||n};
function groups(L){
  const S=(ST.settings.sections||[]).map(x=>String(x).trim()).filter(Boolean),ord=S.map(x=>x.toLowerCase()),G=new Map();
  for(const x of L){const n=String(x.section||'').trim(),k=n.toLowerCase();if(!G.has(k))G.set(k,{k,name:S[ord.indexOf(k)]||n,items:[]});G.get(k).items.push(x)}
  const rank=k=>k?(ord.includes(k)?ord.indexOf(k):1e6):2e6;
  return [...G.values()].map((g,i)=>Object.assign(g,{i})).sort((a,b)=>rank(a.k)-rank(b.k)||a.i-b.i);
}
function secsHtml(L,c){
  if(!L.length){const o=other(c),n=ST.items.filter(x=>forC(x,o)).length;
    return emptyHtml('rocket',`${CN[c]} test series are coming soon`,'Please check back in a little while.','gold',n?`<button class="btn pri" data-course="${o}">See ${CN[o]} test series ${I('next')}</button>`:'')}
  const G=groups(L);
  return G.map((g,k)=>{const nm=g.name||(G.length>1?'More test series':'All test series');
    return `<section class="sec" aria-label="${esc(nm)}" style="--s:${k}"><div class="sech"><span class="secic ${SECK[k%SECK.length]}" aria-hidden="true">${I(g.name?secIco(g.name):'spark')}</span><div class="grow"><h2>${esc(nm)}</h2><span class="secn">${g.items.length} test series</span></div>
     <button class="lnk" data-all aria-expanded="false" hidden><span>See all</span>${I('cr')}</button><span class="rarr" hidden><button class="ibtn line sm" data-rl="-1" aria-label="Previous">${I('cl')}</button><button class="ibtn line sm" data-rl="1" aria-label="Next">${I('cr')}</button></span></div>
     <div class="rail">${g.items.map(cardHtml).join('')}</div></section>`}).join('');
}
// "See all" and the ‹ › buttons only when a row has more than fits
function railsInit(){
  $$('#list .sec').forEach(s=>{
    const r=s.querySelector('.rail');if(!r.clientWidth)return;   // Home is hidden: checked again when it shows
    const all=s.classList.contains('all'),over=r.scrollWidth>r.clientWidth+4,a=s.querySelector('[data-all]'),ar=s.querySelector('.rarr');
    if(a)a.hidden=!over&&!all;if(ar)ar.hidden=!over||all;railArrows(r);
  });
}
function railArrows(r){const b=r.parentNode.querySelectorAll('[data-rl]');if(b.length===2){b[0].disabled=r.scrollLeft<8;b[1].disabled=r.scrollLeft+r.clientWidth>r.scrollWidth-8}}
const okImg=u=>/^(data:image\/|https:\/\/)/.test(u||'');
const offPct=x=>x.mrp&&x.mrp>x.price?Math.round((1-x.price/x.mrp)*100):0;
const colOf=x=>COLORS.includes(x.color)?x.color:'blue';
function mediaHtml(x){
  return okImg(x.image)?`<img src="${esc(x.image)}" alt="${esc(x.title)}" loading="lazy">`
    :`<div class="phc c-${colOf(x)}"><small>${esc((CFG.SITE_NAME||'Test series').toUpperCase())}</small><b>${esc(x.title)}</b>${I('target','phi')}</div>`;
}
function priceHtml(x,short){
  const off=offPct(x);return `<div class="pr"><b>${inr(x.price)}</b>${off?`<s>${inr(x.mrp)}</s><span class="pill ok">Save ${inr(x.mrp-x.price)}${short?'':` · ${off}% off`}</span>`:''}</div>`;
}
// a card: photo, name, rating (one thin line), short description, price, then Explore and Buy now (everything else is on the Explore page)
function cardHtml(x,i){
  const off=offPct(x),ph=!okImg(x.image),bdg=x.badge||(x.buy_on===false?'Coming soon':'');
  return `<article class="sc" id="p_${esc(x.id)}" style="--i:${Math.min(i||0,7)}"><div class="sc-m${ph?' isph':''}" data-view="${esc(x.id)}">${bdg?`<span class="tag${x.buy_on===false&&!x.badge?' soon':''}">${esc(bdg)}</span>`:''}${off?`<span class="tag off">${off}% off</span>`:''}${mediaHtml(x)}</div>
   <div class="sc-b"><h3 class="sc-t${ph?' sr':''}">${esc(x.title)}</h3><div class="rlw" data-rline="${esc(x.id)}">${rLine(x.id)}</div>${x.subtitle?`<p class="sc-s">${esc(x.subtitle)}</p>`:''}
   ${priceHtml(x,1)}
   <div class="sc-a"><button class="btn line" data-explore="${esc(x.id)}">${I('compass')}Explore</button>${buyBtn(x,1)}</div></div></article>`;
}
// Buy now, or — for a series not launched yet (Buy now off in the admin panel) — "Coming soon · Notify me". short = on a card
function buyBtn(x,short){
  if(x.buy_on!==false)return `<button class="btn pri block" data-buy="${esc(x.id)}">${I('bag')}${short?'Buy now':`Buy now · ${inr(x.price)}`}</button>`;
  const m=ME(),done=!!m&&LSg('store_notify',{})[x.id]===m.mobile;
  return `<button class="btn ${done?'okb':'goldl'} block" data-soon="${esc(x.id)}"${short?' data-k="1"':''}>${done?`${I('ok')}${short?'Notified':'You will be notified'}`:`${I('bell')}${short?'Notify me':'Coming soon · Notify me'}`}</button>`;
}

/* ---------- Search: every word must match the name, short description, section, features or description ---------- */
let Q='',QT=0,SF='',SLAST='';   // the words, the section chosen above the results ('' = all), the results shown last
const norm=t=>String(t||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
const hay=x=>norm([x.title,x.subtitle,x.section,x.badge,(x.features||[]).join(' '),(XD[x.id]||{}).description,CN[x.course]||''].join(' '));
function find(q,L){const w=norm(q).split(/\s+/).filter(Boolean),t=norm(q);return L.filter(x=>{const h=hay(x);return w.every(v=>h.includes(v))}).sort((a,b)=>norm(b.title).includes(t)-norm(a.title).includes(t))}
// the words found, marked in the text
function hiLite(s,q){
  const w=String(q||'').trim().split(/\s+/).filter(v=>v.length>1).map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if(!w.length)return esc(s);
  return String(s).split(new RegExp('('+w.join('|')+')','ig')).map((p,i)=>i%2?`<mark>${esc(p)}</mark>`:esc(p)).join('');
}
const thumb=x=>okImg(x.image)?`<span class="th"><img src="${esc(x.image)}" alt="" loading="lazy"></span>`:`<span class="th c-${colOf(x)}">${I(secIco(x.section||''))}</span>`;
function rowHtml(x,i,q){
  const r=RV[x.id],s=secName(x),off=offPct(x);
  return `<div class="srow" style="--i:${Math.min(i,9)}"><button class="sr-main" data-view="${esc(x.id)}">${thumb(x)}<span class="grow"><b class="sr-t">${hiLite(x.title,q)}</b>
    <span class="sr-m">${r&&r.count?`<span class="rt">${I('star','fill')}${Number(r.avg).toFixed(1)}<small>(${r.count})</small></span>`:''}${s?`<span>${esc(s)}</span>`:''}${x.buy_on===false?'<span class="pill gold">Coming soon</span>':''}</span>
    ${x.subtitle?`<span class="sr-s">${hiLite(x.subtitle,q)}</span>`:''}</span><span class="sr-p"><b>${inr(x.price)}</b>${off?`<s>${inr(x.mrp)}</s>`:''}</span>${I('cr','sr-c')}</button><div class="sr-buy">${buyBtn(x,1)}</div></div>`;
}
function sDraw(){
  const box=$('#sres'),fl=$('#sfil');if(!box)return;
  if(LOADED===0){fl.innerHTML='';box.innerHTML='<div class="rows">'+'<div class="skel srk"></div>'.repeat(4)+'</div>';return}
  if(LOADED<0||!ST.items.length){fl.innerHTML='';box.innerHTML=emptyHtml('rocket','Nothing to search yet','Test series will show here as soon as they are added.','gold');return}
  const c=course(),L=ST.items.filter(x=>forC(x,c)),G=groups(L),gk=g=>g.k||'~';   // '~' = the series without a section ('' is "All")
  if(SF&&!G.some(g=>gk(g)===SF))SF='';
  fl.innerHTML=G.length>1?[['','All',L.length],...G.map(g=>[gk(g),g.name||'Other',g.items.length])].map(([k,n,m])=>`<button class="chip${SF===k?' on':''}" data-sf="${esc(k)}">${esc(n)}<em>${m}</em></button>`).join(''):'';
  const base=SF?L.filter(x=>(String(x.section||'').trim().toLowerCase()||'~')===SF):L,q=Q.trim();
  const R=q?find(q,base):G.filter(g=>!SF||gk(g)===SF).flatMap(g=>g.items);
  // the same results as before (another letter typed): no rising in again
  if(R.length){const ids=R.map(x=>x.id).join(),still=ids===SLAST;SLAST=ids;box.innerHTML=`<p class="resh">${q?`<b>${R.length} result${R.length>1?'s':''}</b> for “${esc(q)}”`:`<b>${R.length}</b> ${CN[c]} test series`}</p><div class="rows${still?' still':''}">${R.map((x,i)=>rowHtml(x,i,q)).join('')}</div>`;return}
  SLAST='';
  const o=other(c),n=q?find(q,ST.items.filter(x=>forC(x,o))).length:0;
  box.innerHTML=emptyHtml('search',q?`No ${CN[c]} test series for “${esc(q)}”`:'No test series here',q?'Try another word — like a subject, a chapter or “full test”.':'Choose another section.','',
    `<div class="row wrap center">${n?`<button class="btn pri" data-course="${o}">See ${n} in ${CN[o]} ${I('next')}</button>`:''}${q?'<button class="btn line" data-qx>Clear search</button>':''}${SF?'<button class="btn line" data-sf="">All sections</button>':''}</div>`);
}
function qSet(v){
  clearTimeout(QT);const q=$('#q');if(q&&q.value!==v)q.value=v;
  Q=v;$('#qx').hidden=!v;sDraw();
}

/* ---------- sheets: one layer for every sheet (checkout, details, schedule, demo test, help). A bottom sheet on phones
   (pull it down to close), a dialog on bigger screens. It gets its own history entry, so the phone's Back button
   closes the sheet instead of leaving the store. ---------- */
let OVH=false,IGNPOP=false,OVF=null;
// computers: the cursor moves into a sheet or the Explore page, and back to the button that opened it when it closes
const FINE=matchMedia('(hover:hover) and (pointer:fine)').matches;
function ovEl(){
  let ov=$('.ov');
  if(!ov){
    OVF=document.activeElement;ov=document.createElement('div');ov.className='ov';ov.addEventListener('click',e=>{if(e.target===ov)closeSheet()});document.body.appendChild(ov);document.body.style.overflow='hidden';
    if(!OVH){try{history.pushState(Object.assign({},history.state,{ov:1}),'')}catch(_){}OVH=true}
  }
  return ov;
}
// put a sheet in the layer; a sheet that replaces another one (next checkout step) changes in place instead of popping up again
function ovSet(html){
  const ov=ovEl(),swap=!!ov.firstElementChild;ov.innerHTML=html;
  if(swap&&ov.firstElementChild)ov.firstElementChild.classList.add('swap');
  if(FINE){const f=ov.querySelector('.m-b .inp')||ov.querySelector('[data-close]');if(f)f.focus({preventScroll:true})}
  return ov;
}
// t = title, s = small line under it (HTML), top = under the title (checkout steps), body, foot = buttons at the bottom
function modal(o){
  return `<div class="modal${o.cls?' '+o.cls:''}" role="dialog" aria-modal="true" aria-label="${esc(o.t)}"${o.attr||''}><div class="m-h"><div class="grow"><h2>${esc(o.t)}</h2>${o.s?`<p class="m-s">${o.s}</p>`:''}</div><button class="ibtn" data-close aria-label="Close">${I('x')}</button></div>${o.top||''}<div class="m-b">${o.body}</div>${o.foot?`<div class="m-f">${o.foot}</div>`:''}</div>`;
}
// from the Explore page the link opens that page (#x=…); from a card it shows the card (#p=…)
async function share(id,xp){
  const x=ST.items.find(i=>i.id===id);if(!x)return;
  const url=location.href.split('#')[0]+(xp?'#x=':'#p=')+id,text=`${x.title} — ${inr(x.price)}. See details and buy here:`;
  if(navigator.share){try{await navigator.share({title:x.title,text,url});return}catch(e){if(e&&e.name==='AbortError')return}}
  copy(text+' '+url,'Link copied');
}
// an element on its way out: plays its closing animation, then goes. Its ids go at once, so nothing finds it any more.
function gone(e,cls,ms){e.className=cls;e.removeAttribute('id');e.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));setTimeout(()=>e.remove(),RM?0:ms)}
// close the sheet (it slides away). pop = the phone's Back button already took its history entry
function closeSheet(pop){
  closeEdit();const o=$('.ov');
  if(o){gone(o,'ovx',280);if(FINE&&OVF&&OVF.isConnected&&!o.contains(OVF))OVF.focus({preventScroll:true})}
  document.body.style.overflow=$('#xp')?'hidden':'';
  // take the sheet's history entry back, unless another sheet opened right away (it keeps the entry)
  if(!pop&&OVH)setTimeout(()=>{if(OVH&&!$('.ov')){OVH=false;IGNPOP=true;history.back()}},0);
}
// phones: pull a sheet down by its top to close it
let DRAG=null;
addEventListener('touchstart',e=>{
  const h=e.target.closest('.ov .m-h');if(!h||innerWidth>759||e.target.closest('button,a,input'))return;
  DRAG={m:h.parentNode,y:e.touches[0].clientY,t:performance.now(),dy:0};
},{passive:true});
addEventListener('touchmove',e=>{
  if(!DRAG)return;DRAG.dy=Math.max(0,e.touches[0].clientY-DRAG.y);
  DRAG.m.classList.add('drag');DRAG.m.style.transform=`translate3d(0,${DRAG.dy}px,0)`;
},{passive:true});
addEventListener('touchend',()=>{
  if(!DRAG)return;const {m,dy,t}=DRAG;DRAG=null;m.classList.remove('drag');
  if(dy>110||(dy>36&&dy/(performance.now()-t)>.6))closeSheet();   // the closing slide starts where the finger left it
  else m.style.transform='';
});

/* ---------- Explore test series: its own page (a panel from the right on computers) with Description · Resources ·
   Reviews. Description and demo tests come from supabase_v30_store_explore.sql; without it the page still opens
   (photo, features, schedule, reviews) and the demo tests show "Coming soon". The phone's Back button closes it. ---------- */
let XP=null,XD={},XH=false,XTI=0,XPF=null;
async function loadXp(){
  const r=await rpc('cbt_store_explore');if(!r.ok)return;
  XD={};(r.items||[]).forEach(x=>XD[x.id]=x);
  if(XP)xpDraw();if(VW==='search'&&Q.trim())sDraw();   // search the descriptions too
}
const XTABS=[['d','Description'],['r','Resources'],['v','Reviews']];
function explore(id,tab){
  const x=ST.items.find(i=>i.id===id);if(!x)return;
  const sh=OVH;closeSheet(true);OVH=false;IT=x;   // a sheet that was open hands its history entry to this page
  if(XP&&XP.id===id){XP.tab=tab||XP.tab;return xpDraw(true,true)}
  XP={id,tab:tab||'d'};XTI=XTABS.findIndex(t=>t[0]===XP.tab);if(!$('#xp'))XPF=document.activeElement;
  let p=$('#xp');if(!p){p=document.createElement('div');p.id='xp';p.className='xp';p.addEventListener('click',e=>{if(e.target===p)xpBack()});document.body.appendChild(p)}
  const off=offPct(x);
  p.innerHTML=`<div class="xpd" role="dialog" aria-modal="true" aria-label="${esc(x.title)}"><div class="xtop"><div class="xph"><button class="ibtn" data-xback aria-label="Back">${I('back','xb-m')}${I('x','xb-d')}</button><b class="xpt">${esc(x.title)}</b><button class="ibtn" data-share="${esc(id)}" aria-label="Share" title="Share">${I('share')}</button></div>
    <div class="xtabs" role="tablist">${XTABS.map(([k,l])=>`<button role="tab" data-xtab="${k}">${l}</button>`).join('')}<span class="ink"></span></div></div>
   <div class="xbody" id="xbody"></div>
   <div class="xbar"><div class="xbp"><small>Price</small><span><b>${inr(x.price)}</b>${off?`<s>${inr(x.mrp)}</s>`:''}</span></div>${buyBtn(x,1)}</div></div>`;
  document.body.style.overflow='hidden';
  if(!/[#&]x=/.test(location.hash)){history[sh?'replaceState':'pushState']({xp:1},'','#x='+id);XH=true}
  xpDraw(true);
  requestAnimationFrame(()=>{const k=$('#xp .ink');if(k)k.classList.add('ready')});
  if(FINE)p.querySelector('[data-xback]').focus({preventScroll:true});
}
// the line under the open tab slides to it
function xpInk(){const t=$('[data-xtab].on'),k=$('#xp .ink');if(t&&k){k.style.setProperty('--x',t.offsetLeft+'px');k.style.setProperty('--w',t.offsetWidth+'px')}}
function xpDraw(top,anim){
  const b=$('#xbody');if(!b||!XP)return;const x=ST.items.find(i=>i.id===XP.id);if(!x)return xpClose();
  const n=Number((RV[x.id]||{}).count)||0,ti=XTABS.findIndex(t=>t[0]===XP.tab),dx=Math.sign(ti-XTI)*26;XTI=ti;
  $$('[data-xtab]').forEach(t=>{const k=t.dataset.xtab,on=k===XP.tab;t.classList.toggle('on',on);t.setAttribute('aria-selected',on);if(k==='v')t.innerHTML=n?`Reviews <em>${n}</em>`:'Reviews'});
  xpInk();
  b.innerHTML=`<div class="xin${top||anim?' go':''}" style="--dx:${dx}px">${XP.tab==='r'?xpRes(x):XP.tab==='v'?xpRv(x):xpDesc(x)}</div>`;
  if(top)b.scrollTop=0;
  xpTitle();
}
// the name in the bar shows once the big name under the photo has scrolled away
function xpTitle(){const h=$('#xp .xph'),b=$('#xbody');if(!h||!b||!XP)return;const t=b.querySelector('.xt');h.classList.toggle('show',XP.tab!=='d'||!t||b.scrollTop>t.offsetTop+t.offsetHeight-8)}
function xpClose(){
  const p=$('#xp');if(p)gone(p,'xpx',300);XP=null;if(!$('.ov'))document.body.style.overflow='';
  if(FINE&&XPF&&XPF.isConnected&&!(p&&p.contains(XPF)))XPF.focus({preventScroll:true});
}
function xpBack(){if(XH)history.back();else{xpClose();history.replaceState(null,'',location.pathname+location.search)}}
// the phone's Back button: first the open sheet, then the Explore page, then the page (Search, Reviews …) back to Home
addEventListener('popstate',e=>{
  if(IGNPOP){IGNPOP=false;return}
  if(OVH&&!(e.state&&e.state.ov)){OVH=false;closeSheet(true)}
  if($('#xp')&&!/[#&]x=/.test(location.hash)){XH=false;closeSheet(true);xpClose()}
  if(!/[#&]x=/.test(location.hash)){const v=vHash();VH=v!=='home'&&!!(history.state&&history.state.v);if(v!==VW)show(v)}
});
// Description: the series photo, then everything about it
function xpDesc(x){
  const d=String((XD[x.id]||{}).description||'').trim(),F=x.features||[],s=secName(x);
  return `<div class="ximg${okImg(x.image)?'':' isph'}">${mediaHtml(x)}</div>
   ${CN[x.course]||s?`<div class="xcat">${CN[x.course]?`<span class="pill pri">${CN[x.course]}</span>`:''}${s?`<span class="pill">${esc(s)}</span>`:''}</div>`:''}<h2 class="xt">${esc(x.title)}</h2>${x.subtitle?`<p class="xsub">${esc(x.subtitle)}</p>`:''}
   <div data-rvmini="${esc(x.id)}">${rvMini(x.id)}</div>
   <div class="xprice">${priceHtml(x)}<p>${I('shield')}Pay with any UPI app · every order has its own code</p></div>
   ${d?`<h4 class="xh">About this test series</h4><div class="xdesc">${esc(d)}</div>`:''}
   ${F.length?`<h4 class="xh">What you get</h4><ul class="feat">${F.map(f=>`<li>${I('check')}<span>${esc(f)}</span></li>`).join('')}</ul>`:''}`;
}
// Resources: the schedule and demo test 1 / 2 (an empty one shows "Coming soon")
const fkind=m=>m==='application/pdf'?'PDF':'Photo';
function xpRes(x){
  const f=SCH[x.id],D=(XD[x.id]||{}).demos||[];
  const row=(ico,k,lab,t,sub,btn,none)=>`<div class="xres${none?' none':''}"><span class="xri ${none?'':k}">${I(none?'clock':ico)}</span><div class="grow"><small class="lab">${lab}</small><b>${t}</b>${sub?`<small>${sub}</small>`:''}</div>${btn}</div>`;
  const open=a=>`<button class="btn soft sm" ${a}>${I('eye')}Open</button>`;
  return `<h4 class="xh">Schedule</h4>
   ${f?row('cal','gold','Schedule',esc(f.name||'Schedule'),`${fkind(f.mime)} · ${fsize(f.size)}`,open(`data-sch="${esc(x.id)}"`)):row('cal','gold','Schedule','Coming soon','','',1)}
   <h4 class="xh">Demo tests</h4>
   ${[1,2].map(n=>{const d=D.find(z=>z.slot===n)||{};
     return d.size>0?row(d.mime==='application/pdf'?'file':'img','vio',`Demo Test ${n}`,esc(d.title||`Demo Test ${n}`),`${fkind(d.mime)} · ${fsize(d.size)}`,open(`data-demo="${esc(x.id)}" data-slot="${n}"`))
       :row('file','vio',`Demo Test ${n}`,d.title?esc(d.title):'Coming soon',d.title?'Coming soon':'','',1)}).join('')}`;
}
// Reviews: every review of this series
function xpRv(x){
  if(!RVDONE)return '<div class="skel box"></div>';
  const r=RV[x.id];
  if(!r||!r.count)return emptyHtml('chat','No reviews yet','Reviews are written by students whose series is unlocked.','gold');
  const L=(r.list||[]).slice().sort(rvSort);
  return `${rvSum(r.avg,r.count,r.stars||[])}<div class="rvlist">${L.map(v=>rvItem(v)).join('')}</div>
   ${r.count>L.length?`<p class="sm mut center mt12">Showing ${L.length} of ${Number(r.count)||0} reviews.</p>`:''}${RVNOTE}`;
}

/* ---------- Coming soon: "Notify me" saves the student's name + mobile for this series (supabase_v31_store_soon.sql);
   the admin panel lists them to message on launch ---------- */
function soonSheet(id){
  const x=ST.items.find(i=>i.id===id);if(!x)return;IT=x;
  const me=ME();if(!me)return meSheet(()=>soonSheet(id));
  const done=LSg('store_notify',{})[id]===me.mobile;
  ovSet(modal({t:x.title,s:'Coming soon',cls:'narrow',
   body:`<div class="soonbox">${done?bigI('ok','ok'):bigI('rocket','gold')}<b>${done?'You are on the list':'Launching soon'}</b>
    <p>${done?`We will message you on <b>${esc(me.mobile)}</b> as soon as this test series is live.`:'This test series is not available yet. Tap “Notify me” and we will message you as soon as it is live.'}</p>
    ${done?'':`<p class="for">We will message: <b>${esc(me.name)} · ${esc(me.mobile)}</b> · <a href="#" data-soonme="${esc(id)}">change</a></p>`}</div><div class="err center" id="ner" role="alert"></div>`,
   foot:done?'<button class="btn line lg block" data-close>OK</button>':`<button class="btn gold lg block" id="ngo" data-notify="${esc(id)}">${I('bell')}Notify me</button>`}));
}
async function notifyGo(id){
  const me=ME(),b=$('#ngo'),er=$('#ner');if(!me||!b)return;
  b.disabled=true;b.innerHTML='<span class="spin"></span>Please wait…';er.textContent='';
  const r=await rpc('cbt_store_notify',{p_item:id,p_name:me.name,p_mobile:me.mobile});
  if(!$('#ngo'))return;
  if(!r.ok){b.disabled=false;b.innerHTML=`${I('bell')}Notify me`;
    return er.textContent=r.error==='open'?'It is live now — refresh the page to buy it.':r.error==='busy'?'Too many tries. Please wait a while and try again.':r.error==='network'?'No internet. Please try again.':'Something went wrong. Please try again.'}
  const n=LSg('store_notify',{});n[id]=me.mobile;LSs('store_notify',n);
  const x=ST.items.find(i=>i.id===id);if(x)$$(`[data-soon="${id}"]`).forEach(e=>e.outerHTML=buyBtn(x,e.dataset.k));
  soonSheet(id);
}
// a series the student asked about is live now: say so once
function liveCheck(){
  const n=LSg('store_notify',{});let ch=false;
  for(const id of Object.keys(n)){
    const x=ST.items.find(i=>i.id===id);if(x&&x.buy_on===false)continue;
    delete n[id];ch=true;
    if(x){toast(`${x.title} is live now — tap Buy now`,'gift');const c=document.getElementById('p_'+id);if(c)c.classList.add('hl')}
  }
  if(ch)LSs('store_notify',n);
}

/* ---------- checkout: pay → payment details → verify on Telegram / WhatsApp (3 steps; name + mobile are already known) ---------- */
const STEPS=['Pay','Payment details','Verify'],STS=['Pay','Details','Verify'];
function sheet(step,body,foot){
  ovSet(modal({t:IT.title,s:`Step ${step} of 3 · ${STEPS[step-1]}`,cls:'co',body,foot,
   top:`<div class="steps" aria-hidden="true">${STS.map((s,i)=>`<div class="st${i+1<step?' done':i+1===step?' on':''}"><i>${i+1<step?I('check'):i+1}</i><span>${s}</span></div>${i<2?`<span class="sl${i+1<step?' fill':''}${i+2===step?' now':''}"></span>`:''}`).join('')}</div>`}));
}
let BUYN=0;
/* ---------- promotion link: store.html?ref=CODE. The last link opened is remembered for 30 days. Each new visit to a link
   counts one click; an order made after that is tied to the link on the server (the admin panel counts it there). ---------- */
const REF_OK=/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
function captureRef(){
  const c=(new URLSearchParams(location.search).get('ref')||'').trim().toLowerCase();
  if(!REF_OK.test(c))return;
  LSs('store_ref',{c,at:Date.now()});
  try{if(!sessionStorage.getItem('ref_'+c)){sessionStorage.setItem('ref_'+c,'1');rpc('cbt_promo_click',{p_code:c})}}catch(_){}
}
function attachRef(order,mobile){
  const r=LSg('store_ref',null);
  if(order&&r&&REF_OK.test(r.c)&&Date.now()-r.at<30*864e5)rpc('cbt_promo_attach',{p_order:order,p_code:r.c,p_mobile:mobile||''});
}
async function buy(id){
  IT=ST.items.find(i=>i.id===id);if(!IT)return;
  if(IT.buy_on===false)return soonSheet(id);
  const me=ME();if(!me)return meSheet(()=>buy(id));
  const last=LSg('store_ord',null);
  // same series + same number ordered in the last 24 h → continue that order instead of making a new code
  if(last&&last.item===id&&last.mobile===me.mobile&&Date.now()-last.at<864e5){attachRef(last.code,last.mobile);ORD=last;return payStep()}
  const n=++BUYN;
  sheet(1,`<div class="ld"><span class="spin"></span><span>Getting your payment details…</span></div><div class="skel qrsk"></div>`);
  const r=await rpc('cbt_store_order',{p_item:IT.id,p_name:me.name,p_mobile:me.mobile});
  if(n!==BUYN||!$('.ov'))return;   // closed or another series tapped meanwhile
  if(!r.ok){
    const t=r.error==='busy'?'Too many tries. Please wait a while and try again.':r.error==='network'?'No internet. Please try again.':r.error==='item'?'This series is not available right now.':r.error==='mobile'||r.error==='name'?'Please check your name and mobile number.':'Something went wrong. Please try again.';
    return sheet(1,`${bigI('alert','bad')}<p class="center lg b">${t}</p>
     <p class="for">For ${esc(me.name)} · ${esc(me.mobile)} · <a href="#" data-redo>change</a></p>`,`<button class="btn pri lg block" data-buy="${esc(id)}">${I('next')}Try again</button>`);
  }
  ORD={item:IT.id,code:r.code,amount:r.amount,title:r.title,name:me.name,mobile:me.mobile,at:Date.now()};LSs('store_ord',ORD);attachRef(r.code,me.mobile);
  payStep();
}
const upiLink=()=>{const s=ST.settings,e=encodeURIComponent;return `upi://pay?pa=${s.upi}&pn=${e(s.payee||'')}&am=${ORD.amount}&cu=INR&tn=${e(ORD.code)}`};
const qrMake=t=>{const q=qrcode(0,'M');q.addData(t);q.make();return q};
const upiOk=()=>/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(ST.settings.upi||'')&&!/[<>"`]/.test(ST.settings.payee||'');
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isMob=()=>/android/i.test(navigator.userAgent)||isIOS();
const cpBtn=(v,what)=>`<button class="btn xs soft" data-copy="${esc(v)}" data-what="${what}">${I('copy')}Copy</button>`;
/* step 1: QR, UPI ID and order code; at the bottom "Save QR to pay" (phones) and "I have already paid" */
function payStep(){
  if(!upiOk())return sheet(1,`${bigI('alert','bad')}<h3 class="center">Payment is paused</h3><p class="sm mut center mt8">Please message support. Do not pay anywhere else.</p>`,`<a class="btn tg lg block" target="_blank" rel="noopener" href="${esc(tgLink(''))}">${I('tg')}Message support</a>`);
  const s=ST.settings,mob=isMob();
  sheet(1,`<div class="amt"><span>Amount to pay</span><b>${inr(ORD.amount)}</b></div>
   <div class="qrw"><div class="qr"><img src="${qrMake(upiLink()).createDataURL(8,2)}" alt="UPI QR code"></div><p class="sm mut">Scan with GPay, PhonePe, Paytm or any UPI app</p></div>
   <div class="callout warn">${I('alert')}<span>Before paying, check that the name shown in your UPI app is <b>${esc(s.payee)}</b>. Pay only to the UPI ID below.</span></div>
   <div class="kvl"><div><span>UPI ID</span><b>${esc(s.upi)}</b>${cpBtn(s.upi,'UPI ID copied')}</div>
    <div><span>Amount</span><b>${inr(ORD.amount)}</b>${cpBtn(ORD.amount,'Amount copied')}</div>
    <div><span>Order code</span><b class="code">${esc(ORD.code)}</b>${cpBtn(ORD.code,'Code copied')}</div></div>
   <p class="sm mut">If you pay with the UPI ID, write the order code <b class="code">${esc(ORD.code)}</b> in the payment note.</p>
   ${s.note?`<p class="sm mut mt8">${esc(s.note)}</p>`:''}
   <p class="for">For ${esc(ORD.name)} · ${esc(ORD.mobile)} · <a href="#" data-redo>change</a></p>`,
   `${mob?`<button class="btn pri lg block two" data-saveqr>${I('dl')}<span class="bl"><b>Save QR to pay</b><small>Then: UPI app → Scan → Gallery → this QR</small></span></button>`:''}
    <button class="btn ${mob?'line':'pri'} lg block" data-step="paid">${I('check')}I have already paid ${I('next')}</button>`);
}
/* "Save QR to pay": the QR as a picture in the gallery. UPI apps pay a QR chosen from the gallery like a scanned one,
   while a pay link from a website to a personal UPI ID is often blocked (Google Pay: "exceeded the bank limit"). */
async function saveQr(){
  const q=qrMake(upiLink()),n=q.getModuleCount(),W=720,cell=Math.floor(560/(n+8)),qs=cell*(n+8),x0=(W-qs)/2,y0=96,c=document.createElement('canvas');
  c.width=W;c.height=y0+qs+170;
  const g=c.getContext('2d'),F='"Plus Jakarta Sans",system-ui,sans-serif';
  g.fillStyle='#fff';g.fillRect(0,0,W,c.height);g.textAlign='center';g.fillStyle='#0a1222';
  g.font='800 40px '+F;g.fillText('Scan & pay '+inr(ORD.amount),W/2,64);
  for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))g.fillRect(x0+(k+4)*cell,y0+(r+4)*cell,cell,cell);
  g.font='700 30px '+F;g.fillText(ST.settings.payee||'',W/2,y0+qs+40);
  g.font='500 26px '+F;g.fillStyle='#475569';g.fillText('UPI ID: '+ST.settings.upi,W/2,y0+qs+86);g.fillText('Order code: '+ORD.code,W/2,y0+qs+128);
  const blob=await new Promise(ok=>c.toBlob(ok,'image/png'));if(!blob)return toast('Could not save. Long-press the QR and save it.','alert','bad');
  const name='Pay-'+ORD.code+'.png',file=new File([blob],name,{type:'image/png'});
  let saved=false;
  // iPhone: the share sheet has "Save Image" (to Photos); a download would go to Files instead
  if(isIOS()&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file]});saved=true}catch(e){if(e&&e.name==='AbortError')return}
  }
  if(!saved){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}
  toast('QR saved — open your UPI app → Scan → Gallery','qr');
  setTimeout(()=>{const b=$('[data-step=paid]');if(b)b.classList.add('nudge')},800);
}
// message for the support chat (Telegram / WhatsApp); the student sends the payment screenshot with it
function tgText(){return `Payment done ✅\nOrder code: ${ORD.code}\nSeries: ${ORD.title}\nAmount: ${inr(ORD.amount)}\nStudent name: ${ORD.name}\nMobile: ${ORD.mobile}\nPaid from account of: ${ORD.payer||'-'}\nUTR / Transaction ID: ${ORD.utr||'-'}\n📎 Payment screenshot attached`}
/* step 2: who paid (account holder name) + UTR, saved with the order */
function paidStep(){
  sheet(2,`${bigI('receipt','ok')}<h3 class="center">Payment details</h3>
   <p class="sm mut center mt4">This helps us find your payment quickly.</p>
   <div class="fld mt16"><label for="py">Name on the account you paid from <span class="req">*</span></label><input class="inp" id="py" maxlength="60" autocomplete="off" value="${esc(ORD.payer||'')}" placeholder="As shown in your UPI app, e.g. Ramesh Kumar"><span class="hint">If a parent or friend paid, write their name.</span></div>
   <div class="fld mt12"><label for="pu">UTR / Transaction ID <span class="mut">(recommended)</span></label><input class="inp mono" id="pu" maxlength="30" inputmode="text" autocomplete="off" value="${esc(ORD.utr||'')}" placeholder="12-digit number in your UPI app"></div>
   <details class="hint2"><summary>${I('info')}Where do I find the UTR?</summary><p>Open your UPI app → payment history → tap this payment. Look for <b>UTR</b>, <b>UPI Ref No.</b> or <b>Transaction ID</b> (usually 12 digits).</p></details>
   <div class="err" id="er" role="alert"></div>`,
   `<div class="row"><button class="btn line lg" data-step="back1" aria-label="Back to payment">${I('back')}Back</button><button class="btn pri lg grow" id="pgo" data-paidgo>Save &amp; continue ${I('next')}</button></div>`);
}
async function paidGo(){
  const py=$('#py').value.trim(),pu=$('#pu').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase(),er=$('#er');
  if(py.length<2){er.textContent='Please write the name on the account you paid from.';shake($('#py'));return}
  if(pu&&pu.length<6){er.textContent='This UTR looks too short. Check it, or leave it empty.';shake($('#pu'));return}
  const b=$('#pgo');b.disabled=true;b.innerHTML='<span class="spin"></span>Saving…';er.textContent='';
  const r=await rpc('cbt_store_paid',{p_code:ORD.code,p_mobile:ORD.mobile,p_payer:py,p_utr:pu});
  b.disabled=false;b.innerHTML=`Save &amp; continue ${I('next')}`;
  // if the server is not updated yet, the details still go in the chat message
  if(!r.ok&&r.error!=='missing'&&r.error!=='server'){
    if(r.error==='network')return er.textContent='No internet. Please try again.';
    if(r.error==='order'){LSd('store_ord');return er.textContent='This order was not found. Please close and tap Buy again.'}
  }
  ORD.payer=py;ORD.utr=pu;LSs('store_ord',ORD);vStep();
}
const tgLink=txt=>'https://t.me/'+encodeURIComponent(tgUser())+(txt?'?text='+encodeURIComponent(txt):'');
// WhatsApp support from config.js. With the number (SUPPORT_WA_NUMBER) the message is already written in the chat,
// like Telegram; a wa.me/message link can't take a message, so then it is only copied.
const waNum=(()=>{let n=String(CFG.SUPPORT_WA_NUMBER||'').replace(/\D/g,'');if(n.length===10)n='91'+n;return n.length>=11&&n.length<=15?n:''})();
const waUrl=txt=>{const v=String(CFG.SUPPORT_WA||'').trim(),n=waNum||(/^https:\/\//.test(v)?'':v.replace(/\D/g,''));
  return n.length>=10?'https://wa.me/'+n+(txt?'?text='+encodeURIComponent(txt):''):/^https:\/\//.test(v)?v:''};
/* ---------- Help: choose WhatsApp or Telegram (chat only) ---------- */
function supHtml(){
  const wa=waUrl(''),tg=tgUser()?tgLink(''):'';
  return `<div class="supgrid">${wa?`<a class="supb wa" href="${esc(wa)}" target="_blank" rel="noopener"><span class="si">${I('wa')}</span><span class="grow"><b>WhatsApp</b><small>Chat with support</small></span>${I('ext','go')}</a>`:''}${tg?`<a class="supb tg" href="${esc(tg)}" target="_blank" rel="noopener"><span class="si">${I('tg')}</span><span class="grow"><b>Telegram</b><small>Chat with support</small></span>${I('ext','go')}</a>`:''}</div>`;
}
function helpSheet(){
  ovSet(modal({t:'Chat with support',s:'Questions about a series, payment or login',cls:'narrow',
   body:`${supHtml()}<p class="sm mut center mt12">Chat only — calls are not available.${ORD&&ORD.code?` Your order code: <b class="code">${esc(ORD.code)}</b>`:''}</p>`}));
}
// no support chat set up: hide every "Chat with support"
function supportUi(){
  const any=!!(waUrl('')||tgUser());
  $$('[data-help]').forEach(e=>e.hidden=!any);
  const s=$('#sup');if(s)s.innerHTML=any?`<div class="card supc"><div class="card-h"><span class="hic ok">${I('chat')}</span><div class="grow"><h3>Chat with support</h3><p class="sub">Questions about a series, payment or login — chat only, calls are not available.</p></div></div>${supHtml()}</div>`:'';
}
/* step 3 (last): summary of what goes in the chat message (editable), then verify on Telegram / WhatsApp */
function vStep(){
  const tg=tgUser(),wa=waUrl(''),msg=tgText(),v=x=>x?esc(x):'<i class="nil">—</i>';
  sheet(3,`<div class="sum">
   <div class="sumh"><div class="grow"><b>Summary</b><span>Please check your details once</span></div><button class="btn sm line" data-edit>${I('edit')}Edit</button></div>
   <dl><div><dt>Series name</dt><dd>${esc(ORD.title)}</dd></div><div><dt>Amount</dt><dd>${inr(ORD.amount)}</dd></div></dl>
   <dl><div><dt>Student name</dt><dd>${esc(ORD.name)}</dd></div><div><dt>Mobile no.</dt><dd>${esc(ORD.mobile)}</dd></div></dl>
   <dl><div><dt>Order code</dt><dd class="code">${esc(ORD.code)}</dd></div><div><dt>Paid from account of</dt><dd>${v(ORD.payer)}</dd></div><div><dt>UTR / Transaction ID</dt><dd class="code">${v(ORD.utr)}</dd></div></dl>
   <p class="sumok">${I('ok')}Payment done</p></div>
   <div class="callout gold mt12">${I('info')}<span><b>Note:</b> Is message ke saath apna <b>payment screenshot</b> zaroor bhejein — verification ke liye.</span></div>`,
   `${tg?`<a class="btn tg lg block vbtn" data-verify target="_blank" rel="noopener" href="${esc(tgLink(msg))}">${I('tg')}Verify on Telegram</a>`:''}${wa?`<a class="btn wa lg block vbtn" data-verify target="_blank" rel="noopener" href="${esc(waUrl(msg))}">${I('wa')}Verify on WhatsApp</a>`:''}`);
}
/* Edit (small box over the summary): name, mobile, account holder, UTR. Series and order code stay as they are.
   A new name / mobile updates the order on the server (a new mobile gets its own order code, like Buy now). */
function editBox(){
  closeEdit();
  const d=document.createElement('div');d.className='ebox';d.addEventListener('click',e=>{if(e.target===d)closeEdit()});
  d.innerHTML=`<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Edit details"><div class="m-h"><div class="grow"><h2>Edit details</h2><p class="m-s">Series and order code stay the same.</p></div><button class="ibtn" data-editx aria-label="Close">${I('x')}</button></div>
   <div class="m-b">${fld('en','Student name','user',`maxlength="60" autocomplete="name" value="${esc(ORD.name)}"`)}
   ${fld('em','Mobile no.','phone',`type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" value="${esc(ORD.mobile)}"`)}
   ${fld('ep','Paid from account of','card',`maxlength="60" autocomplete="off" value="${esc(ORD.payer||'')}"`)}
   ${fld('eu','UTR / Transaction ID','receipt',`maxlength="30" autocomplete="off" value="${esc(ORD.utr||'')}"`)}
   <div class="err" id="eer" role="alert"></div></div><div class="m-f"><button class="btn pri lg block" id="esave" data-esave>${I('check')}Save</button></div></div>`;
  document.body.appendChild(d);
}
function closeEdit(){const d=$('.ebox');if(d)gone(d,'eboxx',220)}
async function editSave(){
  const [n,m]=meRead('#en','#em'),py=$('#ep').value.trim(),pu=$('#eu').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase(),er=$('#eer');
  const bad=meCheck(n,m)||(py.length<2?'Please write the name on the account you paid from.':pu&&pu.length<6?'This UTR looks too short. Check it, or leave it empty.':'');
  if(bad){er.textContent=bad;shake($('.ebox .modal'));return}
  const b=$('#esave');b.disabled=true;b.innerHTML='<span class="spin"></span>Saving…';er.textContent='';
  const fail=t=>{if($('#esave')){b.disabled=false;b.innerHTML=`${I('check')}Save`;er.textContent=t}};
  if(n!==ORD.name||m!==ORD.mobile){
    const r=await rpc('cbt_store_order',{p_item:ORD.item,p_name:n,p_mobile:m});
    if(!r.ok)return fail(r.error==='busy'?'Too many tries. Please wait a while and try again.':r.error==='network'?'No internet. Please try again.':'Could not save. Please try again.');
    meSave(n,m);
    Object.assign(ORD,{code:r.code,amount:r.amount,title:r.title,name:n,mobile:m,at:Date.now()});attachRef(r.code,m);
  }
  const r=await rpc('cbt_store_paid',{p_code:ORD.code,p_mobile:ORD.mobile,p_payer:py,p_utr:pu});
  if(!r.ok&&r.error==='network'){LSs('store_ord',ORD);return fail('No internet. Please try again.')}
  ORD.payer=py;ORD.utr=pu;LSs('store_ord',ORD);
  closeEdit();if($('.ov'))vStep();
}

/* ---------- Profile: details, course, theme, the last order (24 h) and the "Notify me" list ---------- */
const lastOrd=()=>{const o=LSg('store_ord',null),m=ME();return o&&m&&o.mobile===m.mobile&&Date.now()-o.at<864e5&&ST.items.some(i=>i.id===o.item)?o:null};
const ago=ms=>{const m=Math.max(1,Math.round((Date.now()-ms)/6e4));return m<60?plural(m,'minute')+' ago':plural(Math.round(m/60),'hour')+' ago'};
function meDraw(){
  const box=$('#mebox'),m=ME();if(!box||!m)return;
  const c=course(),o=lastOrd(),N=LSg('store_notify',{}),soon=ST.items.filter(x=>N[x.id]===m.mobile&&x.buy_on===false);
  const T=[['','auto','Auto'],['light','sun','Light'],['dark','moon','Dark']],s=themeSaved();
  box.innerHTML=`<div class="card pf"><span class="av lg">${esc(m.name[0].toUpperCase())}</span><div class="grow"><h2>${esc(m.name)}</h2><p class="mono">${esc(m.mobile)}</p><span class="pill pri">${I(c==='jee'?'atom':'steth')}${CN[c]}</span></div><button class="btn line sm" data-me>${I('edit')}Edit</button></div>
   ${o?`<div class="card ord"><div class="card-h"><span class="hic gold">${I('receipt')}</span><div class="grow"><h3>Your order</h3><p class="sub">Made ${ago(o.at)} · continue within 24 hours</p></div></div>
     <div class="ordb"><div class="grow"><b>${esc(o.title)}</b><span>${inr(o.amount)} · Order code <b class="code">${esc(o.code)}</b></span></div>
     ${o.payer?`<button class="btn pri" data-ordv>${I('shield')}Verify payment</button>`:`<button class="btn pri" data-buy="${esc(o.item)}">${I('card')}Continue payment</button>`}</div></div>`:''}
   <div class="pgrid">
    <div class="card"><div class="card-h"><span class="hic">${I('target')}</span><div class="grow"><h3 id="pcl">Your course</h3><p class="sub">You see the test series of this course.</p></div></div>${crsHtml(c,'course','pcl')}</div>
    <div class="card"><div class="card-h"><span class="hic vio">${I('auto')}</span><div class="grow"><h3 id="ptl">Theme</h3><p class="sub">Auto follows your phone's setting.</p></div></div>
     <div class="seg tseg" role="radiogroup" aria-labelledby="ptl">${T.map(([k,ic,l])=>`<button type="button" role="radio" class="${k===s?'on':''}" aria-checked="${k===s}" data-theme-set="${k}">${I(ic)}${l}</button>`).join('')}</div></div>
   </div>
   ${soon.length?`<div class="card"><div class="card-h"><span class="hic gold">${I('bell')}</span><div class="grow"><h3>We will message you</h3><p class="sub">When these test series are live</p></div></div><div class="list">${soon.map(x=>`<button class="li" data-view="${esc(x.id)}">${thumb(x)}<span class="grow"><b>${esc(x.title)}</b><small>Coming soon</small></span>${I('cr')}</button>`).join('')}</div></div>`:''}
   <p class="sm faint center mt16">${I('lock')} Your details are saved only on this phone and used for your orders.</p>`;
}

/* ---------- schedule and demo tests (PDF / photo) ---------- */
let SCH={};
const fsize=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
async function loadSch(){
  const r=await rpc('cbt_store_schedules');if(!r.ok)return;
  SCH={};(r.items||[]).forEach(x=>SCH[x.id]=x);
  if(XP)xpDraw();
}
// only a PDF or a photo (the admin panel allows nothing else); anything else is not opened, so a wrong file can never
// run as a page of the store
const FILET=['application/pdf','image/jpeg','image/png','image/webp'];
function dataToBlob(d){
  const m=String(d||'').match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]*)$/);if(!m||!FILET.includes(m[1]))return null;
  try{const b=atob(m[2].replace(/\s+/g,'')),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Blob([u],{type:m[1]})}catch(_){return null}
}
let SCHURL=null,FILEN=0;
// a schedule or demo test file: PDF (open / download) or photo
async function fileSheet(id,o){
  const x=ST.items.find(i=>i.id===id);if(!x)return;IT=x;
  const n=++FILEN,box=(body,foot)=>ovSet(modal({t:o.name,s:esc(x.title),body,foot,attr:` data-file="${n}"`}));
  box('<div class="skel box"></div>');
  const r=await o.load();
  if(n!==FILEN||!$(`.ov [data-file="${n}"]`))return;   // closed, or another file opened meanwhile
  const blob=r.ok&&r.data?dataToBlob(r.data):null;
  if(!blob)return box(emptyHtml('alert','Could not open it','Please try again.','bad'));
  if(SCHURL)URL.revokeObjectURL(SCHURL);SCHURL=URL.createObjectURL(blob);
  const pdf=blob.type==='application/pdf',fname=((o.name||'').replace(/[^\w\- ]+/g,'').trim()||'File')+(pdf?'.pdf':blob.type==='image/png'?'.png':blob.type==='image/webp'?'.webp':'.jpg');
  box(pdf?`<div class="pdfbox">${bigI(o.icon,o.k)}<b>${esc(o.name)}</b><small>PDF · ${fsize(o.size)}</small></div>`
    :`<img class="fimg" src="${esc(r.data)}" alt="${esc(o.name)}">`,   // a checked photo (data: — what the page may show)
    `${pdf?`<a class="btn pri lg block" href="${esc(SCHURL)}" target="_blank" rel="noopener">${I('eye')}${o.open}</a>`:''}<a class="btn line lg block" href="${esc(SCHURL)}" download="${esc(fname)}">${I('dl')}Download</a>${buyBtn(x)}`);
}
function schedule(id){const f=SCH[id];if(f)fileSheet(id,{icon:'cal',k:'gold',name:f.name||'Schedule',size:f.size,open:'Open schedule',load:()=>rpc('cbt_store_schedule',{p_item:id})})}
function demo(id,n){const d=((XD[id]||{}).demos||[]).find(z=>z.slot===n);if(d&&d.size)fileSheet(id,{icon:'file',k:'vio',name:d.title||`Demo Test ${n}`,size:d.size,open:'Open demo test',load:()=>rpc('cbt_store_demo',{p_item:id,p_slot:n})})}

/* ---------- ratings & reviews (from students whose series is unlocked; managed in the admin panel) ---------- */
let RV={};
// stars filled to the exact rating (4.5 → four and a half stars)
const stars=(n,cls)=>{const v=Math.max(0,Math.min(5,Number(n)||0));return `<span class="stars ${cls||''}" role="img" aria-label="${v.toFixed(1)} out of 5 stars"><i class="s0">★★★★★</i><i class="s1" style="width:${(v*20).toFixed(1)}%">★★★★★</i></span>`};
const rvDate=ms=>new Date(ms).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const rvWhen=ms=>{const d=Math.floor((Date.now()-ms)/864e5);return d<1?'Today':d<2?'Yesterday':d<7?d+' days ago':d<28?Math.floor(d/7)+(d<14?' week ago':' weeks ago'):rvDate(ms)};
// pinned first, then written reviews, then newest (nothing is hidden)
const rvSort=(a,b)=>(b.pinned-a.pinned)||(!!b.body-!!a.body)||(b.at-a.at);
const AVC=['#3b82f6','#10b981','#8b5cf6','#f59e0b','#f43f5e','#0ea5e9'];
function rvAva(x){const n=String(x.name||'S').trim()||'S',h=[...n].reduce((a,c)=>a+c.charCodeAt(0),0);return `<span class="av sm round" style="--c:${AVC[h%AVC.length]}">${/^data:image\//.test(x.photo||'')?`<img src="${esc(x.photo)}" alt="">`:esc(n[0].toUpperCase())}</span>`}
const RVNOTE=`<p class="rvnote">${I('shield')}<span><b>Verified</b> = written from the student's own account after their series was unlocked. One review per student.</span></p>`;
// on each card, under the name: one thin line (stars · average · count), opens the Reviews tab
function rLine(id){const r=RV[id];return r&&r.count?`<button class="rline" data-rv="${esc(id)}">${stars(r.avg)}<b>${Number(r.avg).toFixed(1)}</b><span>(${plural(r.count,'review')})</span></button>`:''}
// on the Explore page: stars · average · count, opens the Reviews tab
function rvMini(id){const r=RV[id];return r&&r.count?`<button class="rvmini" data-rv="${esc(id)}">${stars(r.avg)}<b>${Number(r.avg).toFixed(1)}</b><span>· ${plural(r.count,'review')}</span><u>Read</u>${I('cr')}</button>`:''}
function rvItem(x,withTitle){
  const long=(x.body||'').length>170;
  return `<article class="rv${long?' clip':''}"><div class="rvt">${rvAva(x)}<div class="grow"><div class="rvn"><b>${esc(x.name||'Student')}</b><span class="vb" title="This student's series is unlocked">${I('ok')}Verified</span></div><div class="rvm">${stars(x.rating)}<span title="${esc(rvDate(x.at))}">${rvWhen(x.at)}</span>${x.pinned?`<span class="pin">${I('pin')}Pinned</span>`:''}</div></div></div>
    ${x.body?`<p class="rvb">${esc(x.body)}</p>${long?'<button class="rvx" data-rvx aria-expanded="false">Read more</button>':''}`:`<p class="rvb rvno">Gave ${Number(x.rating)||0} star${x.rating>1?'s':''} · no written review</p>`}${x.reply?`<div class="rvr"><b><img src="icon-192.png" alt="">Reply from ${esc(CFG.SITE_NAME||'the team')}</b><p>${esc(x.reply)}</p></div>`:''}${withTitle&&x.title?`<button class="rvon" data-view="${esc(x.item)}">on <b>${esc(x.title)}</b>${I('cr')}</button>`:''}</article>`;
}
function rvSum(avg,count,S){
  count=Number(count)||0;S=[0,1,2,3,4].map(i=>Number((S||[])[i])||0);
  return `<div class="rvsum"><div class="rvbig"><b>${Number(avg).toFixed(1)}</b>${stars(avg)}<span>${plural(count,'review')}</span></div>
    <div class="rvbars">${[5,4,3,2,1].map((n,i)=>`<div><span>${n}${I('star','fill')}</span><i><em style="width:${count?Math.round((S[i]||0)*100/count):0}%"></em></i><span>${S[i]||0}</span></div>`).join('')}</div></div>`;
}
let RVDONE=false;
async function loadRv(){
  const r=await rpc('cbt_store_reviews');RVDONE=true;if(!r.ok){rvAllDraw();if(XP)xpDraw();return}
  RV={};(r.items||[]).forEach(x=>RV[x.id]=x);
  $$('[data-rvmini]').forEach(e=>e.innerHTML=rvMini(e.dataset.rvmini));
  $$('[data-rline]').forEach(e=>e.innerHTML=rLine(e.dataset.rline));
  rvAllDraw();if(XP)xpDraw();if(VW==='search')sDraw();
}
/* ---------- the Reviews page and the reviews on Home: every review of the student's course ---------- */
let RVF='',RVN=8;
function rvAll(){
  const L=[];for(const x of ST.items){const r=RV[x.id];if(forC(x)&&r&&r.list)r.list.forEach(v=>L.push(Object.assign({item:x.id,title:x.title},v)))}
  return L.sort(rvSort);
}
// all reviews of the course: count, star counts and the exact average (each series' avg from the server is already rounded)
function rvStat(){
  const its=ST.items.filter(x=>forC(x)&&RV[x.id]&&RV[x.id].count),count=its.reduce((a,x)=>a+RV[x.id].count,0);
  const S=[0,1,2,3,4].map(i=>its.reduce((a,x)=>a+((RV[x.id].stars||[])[i]||0),0));
  const avg=!count?0:S.reduce((a,b)=>a+b,0)===count?(5*S[0]+4*S[1]+3*S[2]+2*S[3]+S[4])/count:its.reduce((a,x)=>a+RV[x.id].avg*RV[x.id].count,0)/count;
  return {its,count,avg,stars:S};
}
function rvAllDraw(){
  const st=rvStat(),nb=$('#nrv');
  if(nb){nb.hidden=!st.count;nb.textContent=st.count}
  rvHome(st);kpis();
  const box=$('#rvall');if(!box)return;
  if(!RVDONE&&LOADED>=0){box.innerHTML='<div class="skel box"></div>';return}
  if(!st.count){box.innerHTML=emptyHtml('chat','No reviews yet',`Reviews of ${CN[course()]} test series are written by students whose series is unlocked.`,'gold');return}
  if(RVF&&!st.its.some(x=>x.id===RVF))RVF='';
  const R=RVF?RV[RVF]:st,L=rvAll().filter(v=>!RVF||v.item===RVF),show=L.slice(0,RVN),more=L.length-show.length;
  box.innerHTML=`<div class="rvhead">${rvSum(R.avg,R.count,R.stars||[])}${RVNOTE}</div>
   ${st.its.length>1?`<div class="chips">${[['','All',st.count],...st.its.map(x=>[x.id,x.title,RV[x.id].count])].map(([k,l,c])=>`<button class="chip${RVF===k?' on':''}" data-rvf="${esc(k)}">${esc(l)}<em>${Number(c)||0}</em></button>`).join('')}</div>`:''}
   <div class="rvgrid">${show.map(v=>rvItem(v,!RVF&&st.its.length>1)).join('')}</div>
   ${more>0?`<div class="more"><button class="btn line" data-rvmore>See ${plural(more,'more review')} ${I('cd')}</button></div>`:''}`;
}
// Home: the average and the newest written reviews, then "See all"
function rvHome(st){
  const sec=$('#rvhome');if(!sec)return;
  if(!st.count){sec.hidden=true;return}
  const L=rvAll().filter(v=>v.body).slice(0,6);
  sec.hidden=false;
  sec.innerHTML=`<div class="bh"><div class="grow"><span class="eyebrow">Student reviews</span><h2>What students say</h2></div><a class="lnk" href="#/reviews" data-go="reviews">See all ${st.count} ${I('cr')}</a></div>
   <div class="rvh"><div class="rvbig card"><b>${st.avg.toFixed(1)}</b>${stars(st.avg)}<span>${plural(st.count,'review')} · verified</span></div>
   ${L.length?`<div class="rvrail">${L.map(v=>rvItem(v,1)).join('')}</div>`:''}</div>`;
}

/* ---------- taps, keys ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('button,a,[data-view]');if(!t)return;
  const d=t.dataset;
  if('help' in d){e.preventDefault();helpSheet();return}
  if(d.go){e.preventDefault();go(d.go,'focus' in d);return}
  if('themeToggle' in d)themeToggle(e);
  else if('themeSet' in d)themeSet(d.themeSet,e);
  else if(d.gc){t.parentNode.querySelectorAll('[data-gc]').forEach(b=>b.setAttribute('aria-checked',b===t));if(t.closest('#gate'))$('#ger').textContent=''}
  else if(d.course)setCourse(d.course);
  else if(d.kpi){if(d.kpi==='list'){const l=$('#list');if(l)l.scrollIntoView({behavior:RM?'auto':'smooth',block:'start'})}else go(d.kpi)}
  else if('qx' in d){qSet('');qFocus()}
  else if('sf' in d){SF=d.sf;sDraw()}
  else if('all' in d){const s=t.closest('.sec');if(s){const on=s.classList.toggle('all');t.firstChild.textContent=on?'Show less':'See all';t.setAttribute('aria-expanded',on);railsInit();if(!on)s.scrollIntoView({behavior:RM?'auto':'smooth',block:'start'})}}
  else if(d.rl){const r=t.closest('.sec').querySelector('.rail');r.scrollBy({left:(+d.rl)*r.clientWidth*.85,behavior:RM?'auto':'smooth'})}
  else if('gate' in d)gateGo();
  else if('me' in d)meSheet();
  else if('mesave' in d)meSaveGo();
  else if(d.buy){closeSheet();buy(d.buy)}
  else if('ordv' in d){const o=lastOrd();if(o){ORD=o;IT=ST.items.find(i=>i.id===o.item);vStep()}}
  else if(d.explore)explore(d.explore);
  else if(d.soon)soonSheet(d.soon);
  else if(d.notify)notifyGo(d.notify);
  else if(d.soonme){e.preventDefault();const id=d.soonme;meSheet(()=>soonSheet(id))}
  else if(d.view)explore(d.view,'d');
  else if(d.rv)explore(d.rv,'v');
  else if(d.xtab){if(XP){XP.tab=d.xtab;xpDraw(true)}}
  else if('xback' in d)xpBack();
  else if(d.sch)schedule(d.sch);
  else if(d.demo)demo(d.demo,+d.slot);
  else if('rvf' in d){RVF=d.rvf;RVN=8;rvAllDraw()}
  else if('rvmore' in d){RVN+=8;rvAllDraw()}
  else if('rvx' in d){const c=t.closest('.rv');if(c){const o=c.classList.toggle('open');t.textContent=o?'Show less':'Read more';t.setAttribute('aria-expanded',o)}}
  else if(d.share)share(d.share,!!t.closest('.xp'));
  else if('close' in d)closeSheet();
  else if('redo' in d){e.preventDefault();const id=IT.id;meSheet(()=>{LSd('store_ord');closeSheet();buy(id)})}
  else if(d.copy)copy(d.copy,d.what);
  else if('saveqr' in d)saveQr();
  else if('verify' in d){try{navigator.clipboard.writeText(tgText())}catch(_){}}
  else if('edit' in d)editBox();
  else if('editx' in d)closeEdit();
  else if('esave' in d)editSave();
  else if(d.step==='paid')paidStep();
  else if(d.step==='back1')payStep();
  else if('paidgo' in d)paidGo();
});
const hasMe=()=>document.documentElement.classList.contains('has-me');
document.addEventListener('keydown',e=>{
  if(e.target&&e.target.id==='q'){if(e.key==='Enter'){e.preventDefault();qSet(e.target.value);e.target.blur()}else if(e.key==='Escape'&&e.target.value){e.preventDefault();qSet('')}return}
  if(e.key==='Escape'){if($('.ebox'))closeEdit();else if($('.ov'))closeSheet();else if($('#xp'))xpBack();return}
  // "/" opens Search (computers)
  if(e.key==='/'&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)&&!$('.ov')&&!$('#xp')&&hasMe()){e.preventDefault();go('search',1);return}
  if(e.key!=='Enter'||/^(BUTTON|A|SUMMARY)$/.test(e.target.tagName))return;   // a focused button: its own tap does it
  if($('#esave'))editSave();
  else if(!hasMe()&&$('#gate'))gateGo();
  else if($('#go'))meSaveGo();
  else if($('#pgo'))paidGo();
});
$('#q').addEventListener('input',e=>{const v=e.target.value;$('#qx').hidden=!v;clearTimeout(QT);QT=setTimeout(()=>qSet(v),140)});
// typing on a phone: the menu bar steps aside while the keyboard is open (the screen got shorter), and comes back when
// the keyboard closes, even if the box still has the cursor
{const vv=window.visualViewport;let H=0;
 const kb=()=>{const h=vv?vv.height:innerHeight,t=document.activeElement;H=Math.max(H,h);document.body.classList.toggle('typing',!!t&&t.matches('input,textarea')&&h<H*.8)};
 if(vv)vv.addEventListener('resize',kb);addEventListener('resize',kb);
 document.addEventListener('focusin',()=>setTimeout(kb,350));document.addEventListener('focusout',()=>setTimeout(kb,60));
 addEventListener('orientationchange',()=>{H=0;setTimeout(kb,500)});}
// a row scrolled by hand: update its ‹ › buttons; the Explore page scrolled: its name shows in the bar
document.addEventListener('scroll',e=>{const r=e.target;if(r.classList&&r.classList.contains('rail'))railArrows(r);else if(r.id==='xbody')xpTitle()},{capture:true,passive:true});
addEventListener('scroll',()=>{
  const t=$('#tb');if(t)t.classList.toggle('stuck',scrollY>4);
  if(VW==='search'){const w=$('.qwrap');w.classList.toggle('stuck',scrollY>0&&w.getBoundingClientRect().top<=parseFloat(getComputedStyle(w).top)+1)}
},{passive:true});
{let t=0;addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(()=>{railsInit();navUi();if(XP)xpInk()},150)})}
// "Auto" theme: follow the phone when its setting changes
{const mq=matchMedia('(prefers-color-scheme: light)'),f=()=>{if(!themeSaved())themeSet('')};try{mq.addEventListener('change',f)}catch(_){try{mq.addListener(f)}catch(e){}}}

themeMeta();themeUi();courseUi();meUi();
captureRef();
{const v=vHash();if(v!=='home'){if(!history.state)under({v:1},'#/'+v);else VH=!!history.state.v}show(v)}   // the page from the link, else Home
if(!ME()){$$('.app,.dock').forEach(e=>e.inert=true);if(matchMedia('(hover:hover)').matches)setTimeout(()=>{const n=$('#gn');if(n)n.focus()},400)}
else if(!RM){document.body.classList.add('boot');setTimeout(()=>document.body.classList.remove('boot'),1200)}
// blocks further down rise into view as the page scrolls to them
if('IntersectionObserver' in window&&!RM){
  document.documentElement.classList.add('anim');
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -6% 0px'});
  $$('.rvl').forEach(e=>io.observe(e));
}
load();
