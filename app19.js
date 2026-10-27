/* ===== v19 redesign (ui19.css): new app shell and new pages. Loads last; every older page keeps working underneath.
   - Menu on the left on computers (icons only on tablets), a new 5-tab bar on phones: Home · Tests · Library · Ranks · Planner.
   - Tests is one place for everything about tests: My series · Explore & buy · Results · Mistakes · Saved (tabs on top).
   - My series = free + purchased series. Explore & buy = locked premium series + the store's series (opens store.html).
   - Library (#/lib): study files of all series, PYQ analysis, mistakes, saved, notes, focus timer, countdown, tip of the day.
   - Leaderboard (#/lb): overall + every test, your rank, gap to the next student, podium, test-wise ranks.
   - My notes (#/notes) and Focus timer (#/focus): saved on this phone only. ===== */

IC.lib='<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16.5 4.5l3.8-1 3.2 15.5-3.8 1z" transform="translate(-2 1)"/>';
IC.cart='<path d="M6 7h12l-1 13H7z"/><path d="M9 7V6a3 3 0 016 0v1"/>';
IC.timer='<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6M12 2v3"/>';
IC.bulb='<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0012 3z"/>';
IC.plus='<path d="M12 5v14M5 12h14"/>';
IC.trash='<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
IC.pin='<path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z"/>';
IC.ext='<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>';
IC.shield='<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>';
IC.layers='<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';
IC.medal='<circle cx="12" cy="15" r="6"/><path d="M8.5 10L6 3h4l2 4 2-4h4l-2.5 7"/>';

/* ---------- where am I: section (bottom tab / menu) and Tests tab ---------- */
NAVIT.splice(0,NAVIT.length,['dash','#/','Home','home'],['tests','#/series','Tests','file'],['lib','#/lib','Library','lib'],['lb','#/lb','Ranks','trophy'],['tr','#/t','Planner','pulse']);
function sec19(h){
  h=h||location.hash||'#/';
  if(/^#\/(series|buy|r|m|b)$/.test(h)||/^#\/(s|f|h)\//.test(h))return 'tests';
  if(/^#\/(lib|notes|focus)$/.test(h)||/^#\/pyq/.test(h))return 'lib';
  if(h==='#/lb')return 'lb';
  if(h==='#/t')return 'tr';
  return 'dash';
}
function hub19k(h){h=h||location.hash||'#/';return /^#\/(series|s\/|f\/)/.test(h)?'series':h==='#/buy'?'buy':/^#\/(r$|h\/)/.test(h)?'r':h==='#/m'?'m':h==='#/b'?'b':''}

/* ---------- bottom tab bar (phones) + side menu (computers) ---------- */
setNav=function(){
  const bn=$('#bnav'),k=sec19();
  if(bn.dataset.v!=='19'){bn.dataset.v='19';bn.style.setProperty('--n',NAVIT.length);
    bn.innerHTML=NAVIT.map(x=>`<button data-k="${x[0]}" onclick="location.hash='${x[1]}'"><span class="bni">${ic(x[3],22)}</span><span class="bnl">${x[2]}</span></button>`).join('')}
  bn.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.k===k));
  bn.style.setProperty('--i',Math.max(0,NAVIT.findIndex(x=>x[0]===k)));
  document.body.classList.add('hasnav');
  sb19();hdr19();
  const hb=document.querySelector('.hub19'),ha=hb&&hb.querySelector('.on');if(ha&&hb.scrollWidth>hb.clientWidth)hb.scrollLeft=ha.offsetLeft-hb.clientWidth/2+ha.clientWidth/2;
};
const SB19=[
  ['',[['#/','home','Home']]],
  ['Tests',[['#/series','book','My series'],['#/buy','cart','Explore & buy'],['#/r','chart2','Results'],['#/m','notebook','Mistakes'],['#/b','bmark','Saved']]],
  ['Study',[['#/lib','lib','Library'],['#/pyq','pyq','PYQ analysis'],['#/notes','edit','My notes'],['#/focus','timer','Focus timer'],['#/t','pulse','Study planner']]],
  ['Compete',[['#/lb','trophy','Leaderboard']]],
];
function sb19On(h){
  const c=location.hash||'#/';
  if(h==='#/')return c==='#/'||c==='#'||c==='';
  if(h==='#/series')return hub19k(c)==='series';
  if(h==='#/r')return hub19k(c)==='r';
  if(h==='#/pyq')return /^#\/pyq/.test(c);
  return c===h;
}
function sb19(){
  let a=document.getElementById('sb19');
  if(!a){a=document.createElement('aside');a.id='sb19';a.className='sb19';a.setAttribute('aria-label','Menu');document.body.appendChild(a)}
  if(!a.dataset.v){a.dataset.v='1';
    const it=(h,i,t)=>`<a class="sbi" href="${h}" data-h="${h}" title="${t}">${ic(i,20)}<span class="sbt">${t}</span></a>`;
    a.innerHTML=`<a class="sbb" href="#/"><span class="sblg">${ic('target',20)}</span><span class="sbt"><b>${esc(CFG.SITE_NAME||'CBT Test Series')}</b><small>Student app</small></span></a>
     <nav class="sbn19">${SB19.map(g=>`${g[0]?`<div class="sbg">${g[0]}</div>`:''}${g[1].map(x=>it(x[0],x[1],x[2])).join('')}`).join('')}
</nav>
     <div class="sbf" id="sbf"></div>`;
  }
  a.querySelectorAll('.sbi[data-h]').forEach(e=>e.classList.toggle('on',sb19On(e.dataset.h)));
  const f=document.getElementById('sbf');
  if(f&&AUTH){const R=CAT?CAT.results||[]:[],P=pstats(R),nm=pfName();
    f.innerHTML=`<button class="sbme" onclick="openProfile()" title="My profile"><span class="sbav">${pfInner(nm)}</span><span class="sbt"><b>${esc(nm)}</b><small>${esc(P.lvl)} · ${P.streak}🔥 streak</small></span></button>
     <div class="sbtools"><button onclick="openLook()" title="Theme" aria-label="Theme">${ic('palette',19)}</button><button onclick="openSettings()" title="Settings" aria-label="Settings">${ic('gear',19)}</button><button onclick="supportSheet()" title="Help &amp; support" aria-label="Help">${ic('msg',19)}</button><button class="sbout" onclick="signOut()" title="Sign out" aria-label="Sign out">${ic('logout',19)}</button></div>`}
}
/* page title in the top bar (computers) + focus timer pill */
const TT19={dash:'Home',tests:'Tests',lib:'Library',lb:'Leaderboard',tr:'Study planner'};
function hdr19(){
  const hi=document.querySelector('.hdr-in');if(!hi)return;
  let t=document.getElementById('hd19t');
  if(!t){t=document.createElement('div');t.id='hd19t';t.className='hd19t';hi.insertBefore(t,document.getElementById('usr'))}
  const h=location.hash||'#/',k=sec19(h);
  const sub=k==='tests'?{series:'My series',buy:'Explore & buy',r:'Results',m:'Mistakes',b:'Saved'}[hub19k(h)]:h==='#/notes'?'My notes':h==='#/focus'?'Focus timer':/^#\/pyq/.test(h)?'PYQ analysis':h==='#/n'?'Notifications':'';
  t.innerHTML=k==='dash'&&!sub?`<small>${esc(new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'}))}</small><b>Home</b>`:`<small>${TT19[k]}</small><b>${esc(sub||TT19[k])}</b>`;
  fcPill();
}

addEventListener('scroll',()=>{const e=document.querySelector('.hdr');if(e)e.classList.toggle('t19',scrollY>70)},{passive:true});

/* ---------- the Tests tabs (replace the old Dashboard / Test series / … row) ---------- */
tabsHtml=function(tab){
  const k={series:'series',results:'r',mk:'m',bm:'b',buy:'buy'}[tab]||hub19k();
  const R=CAT?CAT.results||[]:[],mk=INS&&INS.a&&INS.a.mistakes;
  const lk=CAT?CAT.series.filter(s=>!s.is_free&&!s.unlocked).length:0;
  const T=[['series','#/series','book','My series','Series',''],['buy','#/buy','cart','Explore & buy','Buy',lk||''],['r','#/r','chart2','Results','Results',R.length||''],['m','#/m','notebook','Mistakes','Mistakes',mk||''],['b','#/b','bmark','Saved','Saved',BM.size||'']];
  return `<div class="hub19" role="tablist">${T.map(x=>`<button role="tab" class="${k===x[0]?'on':''}" aria-selected="${k===x[0]}" onclick="location.hash='${x[1]}'">${ic(x[2],17)}<span class="hl">${x[3]}</span><span class="hs">${x[4]}</span>${x[5]!==''?`<small>${x[5]}</small>`:''}</button>`).join('')}</div>`
   +(k==='r'?`<div class="pgh"><div><span class="eyebrow">Tests</span><h1 class="pgt">Results</h1><div class="sm mut">Every attempt with score, rank and answer review.</div></div></div>`:'');
};
// Results: the leaderboard has its own tab now, so Results opens on "By test"
if(typeof HV!=='undefined'&&HV==='lb')HV='test';

/* ---------- store items (public list from the store) ---------- */
let ST19=null,ST19T=0;
const nrm19=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
async function st19Load(){
  if(ST19&&Date.now()-ST19T<120000)return ST19;
  const r=await rpc('cbt_store',{},true);
  if(r&&r.ok){ST19=r.items||[];ST19T=Date.now()}
  return ST19||[];
}
const st19For=s=>(ST19||[]).find(i=>nrm19(i.title)===nrm19(s.title));
const stLink=i=>i&&/^[0-9a-f-]{36}$/i.test(i.id)?`store.html#x=${i.id}`:'store.html';
const inr19=n=>'₹'+Number(n||0).toLocaleString('en-IN');
const off19=i=>i&&i.mrp>i.price&&i.price>0?Math.round((i.mrp-i.price)*100/i.mrp):0;
const okImg19=u=>/^(https:\/\/|data:image\/(png|jpe?g|webp|gif);)/i.test(String(u||''));
const STC={blue:'linear-gradient(135deg,#1c5fe0,#38bdf8)',green:'linear-gradient(135deg,#047857,#34d399)',purple:'linear-gradient(135deg,#6d28d9,#c084fc)',orange:'linear-gradient(135deg,#c2410c,#fbbf24)',red:'linear-gradient(135deg,#be123c,#fb7185)',dark:'linear-gradient(135deg,#0f172a,#475569)'};

/* ---------- My series: free + purchased ---------- */
seriesList=function(){
  const S=CAT.series,own=S.filter(s=>s.is_free||s.unlocked),paid=own.filter(s=>!s.is_free),free=own.filter(s=>s.is_free),lk=S.length-own.length;
  const ts=CAT.tests.filter(t=>own.some(s=>s.id===t.series_id)),done=ts.filter(t=>t.attempts>0).length;
  let o=`<div class="pgh"><div><span class="eyebrow">Your library of tests</span><h1 class="pgt">My series</h1><div class="sm mut">${own.length} series · ${nTests(ts.length)} · ${done} attempted</div></div></div>`;
  if(own.length>3)o+=`<div class="qsearch">${ic('search',17)}<input type="search" placeholder="Search my series…" oninput="filterSeries(this.value)"></div>`;
  if(!own.length)o+=`<div class="card empty19">${ic('book',34)}<h3>No series yet</h3><p class="sm mut">Buy a premium series or ask the admin to unlock one. Free series show here too.</p><button class="btn" onclick="location.hash='#/buy'">${ic('cart',16)} Explore &amp; buy</button></div>`;
  if(paid.length)o+=`<div class="h2s">${ic('shield',20)} Purchased <span class="n">${paid.length}</span></div><div class="sgrid2">${paid.map(seriesCard).join('')}</div>`;
  if(free.length)o+=`<div class="h2s">${ic('book',20)} Free practice <span class="n">${free.length}</span></div><div class="sgrid2">${free.map(seriesCard).join('')}</div>`;
  if(lk||own.length)o+=`<div class="card upsell19" onclick="location.hash='#/buy'"><span class="usi">${ic('crown',22)}</span><div class="grow"><b>${lk?`${lk} premium series to explore`:'Explore premium series'}</b><div class="sm mut">Full mock tests, All-India rank and detailed analysis.</div></div><span class="btn sm">Explore ${ic('right',14)}</span></div>`;
  return o;
};
{const _sc=seriesCard;seriesCard=function(s){
  let h=_sc(s);
  if(!s.is_free&&s.unlocked)h=h.replace(tag(s),'').replace('<div class="ico">',`<span class="own19">${ic('check',12)} PURCHASED</span><div class="ico">`);
  return h;
}}

/* ---------- Explore & buy ---------- */
function buyCard(s,it){
  const off=off19(it),soon=it&&it.buy_on===false;
  const price=it?`<div class="bp19"><b>${inr19(it.price)}</b>${it.mrp>it.price?`<s>${inr19(it.mrp)}</s>`:''}${off?`<em>${off}% off</em>`:''}</div>`:s&&s.price_label?`<div class="bp19"><b>${esc(s.price_label)}</b></div>`:'';
  const F=(it&&it.features||[]).slice(0,3);
  const cov=s?`style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}"`:`style="background:${okImg19(it.image)?'var(--surface2)':(STC[it.color]||STC.blue)}"`;
  const t=s?s.title:it.title,d=it&&it.subtitle||s&&s.description||'';
  const n=s?CAT.tests.filter(x=>x.series_id===s.id).length:0;
  return `<div class="card buy19">
   <div class="cover bc19" ${cov}>${!s&&okImg19(it.image)?`<img src="${esc(it.image)}" alt="" loading="lazy">`:`<div class="ico">${ic('crown')}</div>`}
    ${it&&it.badge?`<span class="bb19">${esc(it.badge)}</span>`:soon?'<span class="bb19">Coming soon</span>':''}</div>
   <div class="bd19"><h3>${esc(t)}</h3>${d?`<div class="sm mut clamp2">${esc(d)}</div>`:''}
    ${F.length?`<ul class="bf19">${F.map(f=>`<li>${ic('check',14)}${esc(f)}</li>`).join('')}</ul>`:''}
    ${n?`<div class="sc3m">${nTests(n)} · some may be open as a free preview</div>`:''}
    <div class="bfoot19">${price}<div class="row">${s?`<a class="btn ghost sm" href="#/s/${s.id}">Preview</a>`:''}<a class="btn sm" href="${stLink(it)}">${soon?'Notify me':`${ic('cart',15)} Buy now`}</a></div></div></div></div>`;
}
function buyList(){
  const lk=CAT.series.filter(s=>!s.is_free&&!s.unlocked),own=CAT.series.filter(s=>s.is_free||s.unlocked);
  const used=new Set();
  const a=lk.map(s=>{const it=st19For(s);if(it)used.add(it.id);return buyCard(s,it)});
  const ex=String(pfGet().exam||'').toLowerCase();   // the student's exam (Profile) first
  const b=(ST19||[]).filter(i=>!used.has(i.id)&&!own.some(s=>nrm19(s.title)===nrm19(i.title))).sort((x,y)=>(y.course===ex)-(x.course===ex)).map(i=>buyCard(null,i));
  if(!a.length&&!b.length)return ST19?`<div class="card empty19">${ic('check',34)}<h3>You have every series</h3><p class="sm mut">New series will show here when they come out.</p></div>`:`<div class="sgrid2">${[1,2].map(()=>`<div class="card"><div class="sk" style="height:120px;border-radius:14px"></div><div class="sk" style="width:60%;margin-top:14px"></div><div class="sk" style="width:85%;margin-top:10px"></div></div>`).join('')}</div>`;
  return `${a.length?`<div class="h2s">${ic('lock',20)} Unlock in this app <span class="n">${a.length}</span></div><div class="sgrid2">${a.join('')}</div>`:''}
   ${b.length?`<div class="h2s">${ic('cart',20)} More from the store <span class="n">${b.length}</span></div><div class="sgrid2">${b.join('')}</div>`:''}`;
}
async function viewBuy(){
  setApp(`<div class="wrap">${tabsHtml('buy')}
   <div class="pgh"><div><span class="eyebrow">Premium</span><h1 class="pgt">Explore &amp; buy</h1><div class="sm mut">Buy once, practise all year. Your purchases show in <a href="#/series">My series</a>.</div></div><a class="btn ghost sm" href="store.html">Full store ${ic('ext',14)}</a></div>
   <div class="trust19"><span>${ic('target',15)} Real exam pattern</span><span>${ic('trophy',15)} All-India rank</span><span>${ic('shield',15)} Safe UPI payment</span><span>${ic('bolt',15)} Unlock on this number</span></div>
   <div id="buyl">${buyList()}</div>
   <div class="card help19"><span class="usi">${ic('msg',20)}</span><div class="grow"><b>Paid already?</b><div class="sm mut">The series unlocks on your mobile number after the payment is checked. Need help? Chat with us.</div></div><button class="btn ghost sm" onclick="supportSheet()">Help</button></div></div>`);
  setNav();
  await st19Load();
  const l=document.getElementById('buyl');if(l&&location.hash==='#/buy'){l.innerHTML=buyList();loadCovers()}
}
// a locked series page: buy it in the store (or ask the admin on WhatsApp, as before)
{lockBanner=function(s){
  if(s.is_free||s.unlocked)return '';
  const it=st19For(s);if(!ST19)st19Load().then(()=>{const e=document.getElementById('lk19');if(e&&st19For(s))e.outerHTML=lockBanner(s)});
  const wa=waLink(`Hi, I am ${AUTH.name} (${AUTH.mobile}). Please unlock "${s.title}" for me.`),off=off19(it);
  return `<div class="card lock19" id="lk19"><span class="usi">${ic('crown',22)}</span><div class="grow"><b>Unlock the full series</b>
   <div class="sm mut">${it?`${inr19(it.price)}${it.mrp>it.price?` <s>${inr19(it.mrp)}</s>`:''}${off?` · ${off}% off`:''} · `:s.price_label?esc(s.price_label)+' · ':''}Some tests may be open as a free preview.</div></div>
   <div class="row"><a class="btn sm" href="${stLink(it)}">${ic('cart',15)} Buy now</a>${wa?`<a class="btn ghost sm" href="${wa}" target="_blank" rel="noopener">${ic('msg',15)} Ask</a>`:''}</div></div>`;
}}

/* ---------- Leaderboard page ---------- */
let LB19='o';
const lbAv=x=>{const n=String(x.name||x.student||'S').trim();return `<span class="lav" style="background:${grad(n)}">${esc((n[0]||'S').toUpperCase())}</span>`};
function lb19Sk(){return `<div class="card"><div class="sk" style="height:120px;border-radius:18px"></div><div class="sk" style="height:150px;margin-top:14px;border-radius:18px"></div>${[1,2,3].map(()=>'<div class="sk" style="height:44px;margin-top:10px;border-radius:12px"></div>').join('')}</div>`}
function lb19Rows(top,me,val,max){
  return `<div class="card lbl19">${top.map((x,i)=>{const r=x.rank||i+1,m=x.me||r===me,v=val(x);
    return `<div class="lr19${m?' me':''}" style="--d:${Math.min(i,10)*35}ms"><span class="lrk ${r<=3?'m'+r:''}">${r}</span>${lbAv(x)}<div class="grow"><b>${lbName(x)}${m?' <em>You</em>':''}${x.cheat?'<span class="chtag">🚩 Cheating</span>':''}</b>
     <div class="lbar"><i style="width:${max?Math.max(4,Math.min(100,v/max*100)):0}%"></i></div></div><span class="lv">${x.pct!=null?x.pct+'%':esc(String(x.score))}</span></div>`}).join('')}</div>`;
}
function lb19Pod(top,me){
  const p=[top[1],top[0],top[2]];
  return `<div class="pod19">${p.map((x,i)=>{if(!x)return '<div class="pdx empty"></div>';const r=x.rank||(i===1?1:i===0?2:3);
    return `<div class="pdx p${r}${x.me||r===me?' me':''}"><div class="pda">${lbAv(x)}${r===1?'<i>👑</i>':''}</div><b>${lbFirst(x)}${x.me||r===me?' (you)':''}</b><span>${x.pct!=null?x.pct+'%':esc(String(x.score))}</span><div class="pdb"><em>${r}</em></div></div>`}).join('')}</div>`;
}
function lb19Me(rank,total,cells,next){
  const beat=rank?(total>1?Math.round((total-rank)*100/(total-1)):100):null;
  return `<div class="card lme19"><div class="lmr"><span>Your rank</span><b>#${rank}</b><small>of ${total}</small></div><div class="grow">
    <div class="lmb"><b>Ahead of ${beat}%</b> of students</div><div class="bar"><i style="width:${beat}%"></i></div>
    <div class="lmc">${cells.map(c=>`<div><b>${esc(String(c[0]==null?'–':c[0]))}</b><span>${c[1]}</span></div>`).join('')}</div>${next?`<div class="lmn">${ic('bolt',14)} ${next}</div>`:''}</div></div>`;
}
function lb19Overall(b){
  if(!b)return lb19Sk();
  if(!b.top||!b.top.length)return `<div class="card empty19">${ic('trophy',34)}<h3>No ranks yet</h3><p class="sm mut">Attempt a test to enter the leaderboard.</p><button class="btn" onclick="location.hash='#/series'">Go to tests</button></div>`;
  const top=b.top,me=b.my_rank,up=me>1?top[me-2]:null;
  const next=up&&up.pct!=null&&b.my_pct!=null?`${Math.max(1,up.pct-b.my_pct)}% more average to pass ${lbFirst(up)} (#${me-1})`:me===1?'You are the topper — keep it up! 🏆':'';
  return `${me?lb19Me(me,b.total||1,[[b.my_pct+'%','Your avg'],[top[0].pct+'%','Topper'],[Math.max(0,top[0].pct-b.my_pct)+'%','Gap to #1']],next):''}
   ${lb19Pod(top,me)}${lb19Rows(top.slice(0,10),me,x=>x.pct||0,top[0].pct||100)}
   ${me&&me>Math.min(10,top.length)?`<div class="card lbl19"><div class="lr19 me"><span class="lrk">${me}</span>${lbAv({name:pfName()})}<div class="grow"><b>You</b></div><span class="lv">${b.my_pct}%</span></div></div>`:''}
   <div id="lbmine"></div><p class="sm mut" style="text-align:center">Overall rank = average score of all your ranked tests.</p>`;
}
function lb19Test(t){
  const r=LBC[t.id];if(!r)return lb19Sk();
  if(r.ok&&r.hidden)return `<div class="card empty19">${ic('clock',34)}<h3>Ranks are not out yet</h3><p class="sm mut">Ranks show after ${esc(fmtWhen(r.result_at))}.</p>${t.attempts||isClosed(t)?'':`<button class="btn" onclick="openTest('${t.id}')">Attempt now</button>`}</div>`;
  if(!r.ok||!r.top||!r.top.length)return `<div class="card empty19">${ic('trophy',34)}<h3>No ranks yet for this test</h3>${t.attempts?'':`<button class="btn" onclick="openTest('${t.id}')">Attempt now</button>`}</div>`;
  const me=r.my_rank,up=me>1?r.top[me-2]:null,solo=r.total<2;
  const next=up&&up.score!=null&&r.my_score!=null?`${Math.max(1,up.score-r.my_score)} more marks to pass ${lbFirst(up)} (#${me-1})`:me===1?'You topped this test! 🏆':'';
  return `${me?lb19Me(me,r.total,[[r.my_score,'Your score'],[solo?'–':r.percentile,'Percentile'],[r.avg,'Class avg'],[r.top_score,'Topper']],next)
    :`<div class="card lme19 na"><div class="grow sm">${t.attempts?'Only a first attempt submitted on time gets a rank.':'You have not attempted this test yet.'}</div>${t.attempts?'':`<button class="btn sm" onclick="openTest('${t.id}')">Attempt</button>`}</div>`}
   ${lb19Pod(r.top,me)}${lb19Rows(r.top.slice(0,10),me,x=>+x.score||0,+r.top_score||+r.top[0].score||1)}
   ${me&&me>Math.min(10,r.top.length)?`<div class="card lbl19"><div class="lr19 me"><span class="lrk">${me}</span>${lbAv({name:pfName()})}<div class="grow"><b>You</b></div><span class="lv">${esc(String(r.my_score))}</span></div></div>`:''}
   <p class="sm mut" style="text-align:center">${r.total} student${r.total==1?'':'s'} attempted · first attempt per student</p>`;
}
function lb19Mine(){
  const e=document.getElementById('lbmine');if(!e)return;
  const L=lbTests().filter(t=>LBC[t.id]&&LBC[t.id].ok&&LBC[t.id].my_rank);if(!L.length){e.innerHTML='';return}
  e.innerHTML=`<div class="h2s">${ic('medal',20)} Your rank in each test</div><div class="card lbl19">${L.map(t=>{const r=LBC[t.id];
    return `<button class="lr19 lt" onclick="LB19='${t.id}';lb19Draw()"><span class="lrk ${r.my_rank<=3?'m'+r.my_rank:''}">${r.my_rank}</span><div class="grow"><b>${esc(t.title)}</b><span class="sm mut">${esc(String(r.my_score))} marks · of ${r.total}</span></div>${ic('right',16)}</button>`}).join('')}</div>`;
}
function lb19Draw(){
  const T=lbTests(),c=document.getElementById('lbch'),x=document.getElementById('lbx');if(!x)return;
  if(c)c.innerHTML=[`<button class="chip ${LB19==='o'?'pri':''}" onclick="LB19='o';lb19Draw()">🏆 Overall</button>`,...T.map(t=>`<button class="chip ${LB19===t.id?'pri':''}" onclick="LB19='${t.id}';lb19Draw()">${esc(t.title)}</button>`)].join('');
  const t=T.find(z=>z.id===LB19);
  x.innerHTML=t?lb19Test(t):lb19Overall(INS&&INS.b);
  x.classList.remove('lbin');void x.offsetWidth;x.classList.add('lbin');
  if(!t)lb19Mine();
  const a=c&&c.querySelector('.pri');if(a)c.scrollTo({left:a.offsetLeft-c.clientWidth/2+a.clientWidth/2,behavior:'smooth'});
}
async function viewLb(){
  const T=lbTests();if(LB19!=='o'&&!T.some(t=>t.id===LB19))LB19='o';
  setApp(`<div class="wrap lb19"><div class="pgh"><div><span class="eyebrow">Compete</span><h1 class="pgt">Leaderboard</h1><div class="sm mut">See where you stand — overall and in every test.</div></div></div>
   <div class="chiprow" id="lbch"></div><div id="lbx"></div></div>`);
  setNav();lb19Draw();
  if(!(INS&&INS.b&&Date.now()-INS.t<90000)){const r=await rpc('cbt_overall',{});INS=INS||{t:Date.now(),a:null,b:null};if(r.ok){INS.b=r;INS.t=Date.now()}else if(authErr(r))return}
  if(location.hash==='#/lb')lb19Draw();
  await Promise.all(T.map(async t=>{lbStale(t.id);if(!LBC[t.id]){const r=await rpc('cbt_leaderboard',{p_test:t.id});LBC[t.id]=r&&r.ok?r:{ok:false}}}));
  if(location.hash==='#/lb'){if(LB19==='o')lb19Mine();else lb19Draw()}
}
// Home: the rank card opens the new Leaderboard page
{const _d=dashLb;dashLb=function(b){return _d(b).split(`HV='lb';location.hash='#/r'`).join(`location.hash='#/lb'`)}}

/* ---------- Library ---------- */
const TIPS=['Revise the mistakes of your last test before starting a new one.','Study in 25-minute focus blocks with 5-minute breaks — your memory holds more.','Attempt full tests at the same time as the real exam to train your body clock.','Make one page of short notes per chapter. Read them the night before the test.','Do not skip NCERT lines — most questions come straight from them.','Sleep 7–8 hours. A tired brain makes silly mistakes.','After every test, write the 3 topics that cost you the most marks — and fix those first.','Read every option before you mark an answer. Trap options look right at first glance.','Practise PYQs of the last 10 years — patterns repeat.','Keep your phone away while you study. Use Focus timer to stay on track.'];
const tip19=()=>TIPS[Math.floor(Date.now()/864e5)%TIPS.length];
const KIC={syllabus:'layers',schedule:'calendar',notes:'note'};
let LBF='all';
function libFiles(){return CAT.series.flatMap(s=>(s.files||[]).map(f=>({f,s})))}
function libFileList(){
  const A=libFiles().filter(x=>LBF==='all'||x.f.kind===LBF);
  if(!A.length)return `<div class="card empty19 sm">${ic('file',30)}<p class="mut">No study files here yet. Notes, syllabus and schedules from your series show here.</p></div>`;
  return `<div class="card lfl19">${A.map(({f,s})=>`<button class="lf19" onclick="openFile('${f.id}')"><span class="lfi k-${esc(f.kind||'file')}">${ic(KIC[f.kind]||'file',19)}</span><div class="grow"><b>${esc(f.title)}</b><span class="sm mut">${esc(KIND[f.kind]||'File')} · ${esc(s.title)}</span></div><span class="lfo">${ic('download',16)}</span></button>`).join('')}</div>`;
}
function libDrawF(){const l=document.getElementById('lflist');if(l)l.innerHTML=libFileList();document.querySelectorAll('#lfch .chip').forEach(b=>b.classList.toggle('pri',b.dataset.k===LBF))}
function libSearch(v){v=v.trim().toLowerCase();document.querySelectorAll('.lf19').forEach(c=>{c.style.display=!v||c.textContent.toLowerCase().includes(v)?'':'none'})}
function viewLib(){
  const F=libFiles(),R=CAT.results||[],N=notes19().length,mk=INS&&INS.a&&INS.a.mistakes;
  const cnt=k=>F.filter(x=>x.f.kind===k).length;
  const tile=(on,i,t,s,k)=>`<button class="card lt19 t-${k}" onclick="${on}"><span class="lti">${ic(i,22)}</span><b>${t}</b><span class="sm mut">${s}</span></button>`;
  const fs=fcStats();
  setApp(`<div class="wrap lib19">
   <div class="card libh19"><div class="grow"><span class="eyebrow">Library</span><h1>Everything you need to study</h1><p>Notes, syllabus, PYQs, your mistakes and saved questions — in one place.</p>
    <div class="libk"><span><b>${F.length}</b> files</span><span><b>${BM.size}</b> saved</span><span><b>${N}</b> notes</span><span><b>${fs.today}</b> min focus today</span></div></div><div class="libart">${ic('lib',58)}</div></div>
   <div class="ltg19">
    ${tile("document.getElementById('lfsec').scrollIntoView({behavior:'smooth'})",'file','Study files',`${F.length} file${F.length===1?'':'s'}`,'a')}
    ${tile("location.hash='#/pyq'",'pyq','PYQ analysis','Past papers, chapter-wise','b')}
    ${tile("location.hash='#/m'",'notebook','Mistake notebook',mk?`${mk} to revise`:'Revise wrong answers','c')}
    ${tile("location.hash='#/b'",'bmark','Saved questions',`${BM.size} saved`,'d')}
    ${tile("location.hash='#/notes'",'edit','My notes',`${N} note${N===1?'':'s'}`,'e')}
    ${tile("location.hash='#/focus'",'timer','Focus timer',fcRun()?'Running now':'25-min study blocks','f')}
    ${tile("location.hash='#/t'",'pulse','Study planner','Weekly subjects & tasks','g')}
    ${tile('cdEdit()','calendar','Exam countdown','Days left to your exam','h')}
   </div>
   <div class="card tip19"><span class="usi">${ic('bulb',20)}</span><div class="grow"><span class="eyebrow">Tip of the day</span><div>${esc(tip19())}</div></div></div>
   <div class="h2s" id="lfsec">${ic('file',20)} Study files <span class="n">${F.length}</span></div>
   ${F.length>5?`<div class="qsearch">${ic('search',17)}<input type="search" placeholder="Search files…" oninput="libSearch(this.value)"></div>`:''}
   <div class="chiprow" id="lfch">${[['all','All',F.length],['notes','Notes',cnt('notes')],['syllabus','Syllabus',cnt('syllabus')],['schedule','Schedule',cnt('schedule')]].filter(x=>x[0]==='all'||x[2]).map(x=>`<button class="chip ${LBF===x[0]?'pri':''}" data-k="${x[0]}" onclick="LBF='${x[0]}';libDrawF()">${x[1]} <small>${x[2]}</small></button>`).join('')}</div>
   <div id="lflist">${libFileList()}</div>
   ${R.length?`<div class="h2s">${ic('eye',20)} Review your recent tests</div><div class="card lfl19">${R.slice(0,3).map(x=>`<button class="lf19" onclick="openReview('${x.id}')"><span class="lfi k-rev">${ic('check',19)}</span><div class="grow"><b>${esc(x.title)}</b><span class="sm mut">${x.score}/${x.max} · ✓${x.correct} ✗${x.wrong} · ${new Date(x.at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div><span class="lfo">${ic('right',16)}</span></button>`).join('')}</div>`:''}
  </div>`);
  setNav();
}

/* ---------- My notes (this phone) ---------- */
const NSUB=['Physics','Chemistry','Biology','Maths','Other'];
const NCOL={Physics:'#3b82f6',Chemistry:'#f59e0b',Biology:'#10b981',Maths:'#8b5cf6',Other:'#64748b'};
const nKey=()=>'cbt_notes_'+(AUTH?AUTH.mobile:'');
function notes19(){return AUTH?LS.get(nKey(),[]):[]}
function notesSave(l){LS.set(nKey(),l)}
let NF='all';
function notesList(){
  const L=notes19().filter(n=>NF==='all'||n.s===NF).sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)||b.at-a.at);
  if(!L.length)return `<div class="card empty19">${ic('edit',34)}<h3>${NF==='all'?'No notes yet':'No '+esc(NF)+' notes'}</h3><p class="sm mut">Write formulas, short notes and doubts. Saved on this phone.</p><button class="btn" onclick="nt19Edit()">${ic('plus',16)} New note</button></div>`;
  return `<div class="ngrid19">${L.map(n=>`<div class="card note19" style="--nc:${NCOL[n.s]||NCOL.Other}" onclick="nt19Edit('${n.id}')"><div class="nh"><span class="ns">${esc(n.s||'Other')}</span>${n.pin?`<span class="np">${ic('pin',13)}</span>`:''}</div><b>${esc(n.t||'Untitled')}</b><p>${esc(n.b||'')}</p><span class="sm mut">${new Date(n.at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div>`).join('')}</div>`;
}
function notesDraw(){const l=document.getElementById('nlist');if(l)l.innerHTML=notesList();document.querySelectorAll('#nch .chip').forEach(b=>b.classList.toggle('pri',b.dataset.k===NF))}
function notesSearch(v){v=v.trim().toLowerCase();document.querySelectorAll('.note19').forEach(c=>{c.style.display=!v||c.textContent.toLowerCase().includes(v)?'':'none'})}
function viewNotes(){
  const L=notes19();
  setApp(`<div class="wrap"><div class="crumb"><a href="#/lib">${ic('back',14)} Library</a></div>
   <div class="pgh"><div><span class="eyebrow">Library</span><h1 class="pgt">My notes</h1><div class="sm mut">${L.length} note${L.length===1?'':'s'} · saved on this phone only</div></div><button class="btn" onclick="nt19Edit()">${ic('plus',16)} New</button></div>
   ${L.length>3?`<div class="qsearch">${ic('search',17)}<input type="search" placeholder="Search notes…" oninput="notesSearch(this.value)"></div>`:''}
   <div class="chiprow" id="nch">${['all',...NSUB].map(k=>`<button class="chip ${NF===k?'pri':''}" data-k="${k}" onclick="NF='${k}';notesDraw()">${k==='all'?'All':k}</button>`).join('')}</div>
   <div id="nlist">${notesList()}</div></div>`);
  setNav();
}
let NEDS='';
function ntRedraw(){if(location.hash!=='#/notes')return;SOFT=1;try{viewNotes()}finally{SOFT=0}}
function nt19Edit(id){
  const n=id?notes19().find(x=>x.id===id):null;NEDS=n?n.s||'Other':NF!=='all'?NF:'Physics';
  sheet(`<h2 class="sht">${n?'Edit note':'New note'}</h2><div class="shl"></div>
   <label class="pfl">Title</label><input class="pfi" id="nt_t" maxlength="80" placeholder="e.g. Kinematics formulas" value="${esc(n?n.t:'')}">
   <label class="pfl">Subject</label><div class="chiprow" id="nt_s">${NSUB.map(s=>`<button class="chip ${NEDS===s?'pri':''}" onclick="NEDS='${s}';this.parentNode.querySelectorAll('.chip').forEach(b=>b.classList.toggle('pri',b===this))">${s}</button>`).join('')}</div>
   <label class="pfl">Note</label><textarea class="pfi" id="nt_b" rows="8" maxlength="5000" placeholder="Write here…">${esc(n?n.b:'')}</textarea>
   <label class="chk"><input type="checkbox" id="nt_p" ${n&&n.pin?'checked':''}> Pin on top</label>
   <div class="row" style="margin-top:12px">${n?`<button class="btn ghost" onclick="nt19Del('${n.id}')">${ic('trash',16)} Delete</button>`:''}<button class="btn" style="flex:1" onclick="nt19Save('${n?n.id:''}')">${ic('check',16)} Save note</button></div>`,'note');
  setTimeout(()=>{const t=document.getElementById(n?'nt_b':'nt_t');if(t)t.focus()},350);
}
function nt19Save(id){
  const t=$('#nt_t').value.trim(),b=$('#nt_b').value.trim(),p=$('#nt_p').checked;
  if(!t&&!b){toast('Write something first');return}
  const L=notes19(),i=L.findIndex(x=>x.id===id),o={id:id||uuid(),t,b,s:NEDS,pin:p,at:Date.now()};
  if(i>=0)L[i]=o;else L.unshift(o);
  try{notesSave(L)}catch(e){}
  closeModal();toast(id?'Note saved':'Note added');ntRedraw();
}
function nt19Del(id){askYes({icon:'🗑️',title:'Delete this note?',msg:'It cannot be brought back.',ok:'Yes, delete',danger:1,yes:()=>{notesSave(notes19().filter(x=>x.id!==id));closeModal();toast('Note deleted');ntRedraw()}})}

/* ---------- Focus timer (keeps running while you use the app) ---------- */
const FCM={focus:['Focus',25],short:['Short break',5],long:['Long break',15]};
function fcGet(){return LS.get('cbt_focus',{mode:'focus',dur:1500,end:0,left:1500})}
function fcSet(o){LS.set('cbt_focus',o)}
const fcRun=()=>{const f=fcGet();return f.end&&f.end>Date.now()};
const fcLeft=f=>Math.max(0,Math.round(f.end?(f.end-Date.now())/1000:f.left));
const fcLogKey=()=>'cbt_focus_log_'+(AUTH?AUTH.mobile:'');
function fcStats(){
  const L=LS.get(fcLogKey(),{}),k=tDay19(new Date());let streak=0,d=new Date();if(!L[tDay19(d)])d.setDate(d.getDate()-1);
  while(L[tDay19(d)]&&L[tDay19(d)].m>0){streak++;d.setDate(d.getDate()-1)}
  const tot=Object.values(L).reduce((a,x)=>a+(x.m||0),0);
  return{today:(L[k]&&L[k].m)||0,sess:(L[k]&&L[k].n)||0,streak,tot};
}
const tDay19=d=>d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
function fcMode(m,min){const mm=min||FCM[m][1];fcSet({mode:m,dur:mm*60,end:0,left:mm*60});fcDraw()}
function fcStart(){const f=fcGet();if(fcRun())return;f.end=Date.now()+fcLeft(f)*1000;fcSet(f);fcDraw();fcTick()}
function fcPause(){const f=fcGet();f.left=fcLeft(f);f.end=0;fcSet(f);fcDraw()}
function fcReset(){const f=fcGet();fcSet({mode:f.mode,dur:f.dur,end:0,left:f.dur});fcDraw()}
function fcCustom(){
  sheet(`<h2 class="sht">Custom time</h2><div class="shl"></div><label class="pfl">Minutes (1–180)</label><input class="pfi" id="fc_m" type="number" min="1" max="180" value="${Math.round(fcGet().dur/60)}">
   <button class="btn block" style="margin-top:14px" onclick="const v=Math.max(1,Math.min(180,+$('#fc_m').value||25));closeModal();fcMode('focus',v)">Set timer</button>`,'fcm');
}
function fcDone(f,quiet){
  if(f.mode==='focus'){const L=LS.get(fcLogKey(),{}),k=tDay19(new Date());L[k]=L[k]||{m:0,n:0};L[k].m+=Math.round(f.dur/60);L[k].n++;LS.set(fcLogKey(),L)}
  const nx=f.mode==='focus'?(fcStats().sess%4===0?'long':'short'):'focus';
  fcSet({mode:nx,dur:FCM[nx][1]*60,end:0,left:FCM[nx][1]*60});
  toast(f.mode==='focus'?'Focus session done! Take a break ☕':'Break over — back to study 📚');
  if(quiet)return;
  try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}
  try{const A=new (window.AudioContext||window.webkitAudioContext)(),o=A.createOscillator(),g=A.createGain();o.frequency.value=880;o.connect(g);g.connect(A.destination);g.gain.setValueAtTime(.15,A.currentTime);g.gain.exponentialRampToValueAtTime(.001,A.currentTime+1.2);o.start();o.stop(A.currentTime+1.2)}catch(e){}
}
let FCT=null;
function fcTick(){
  clearInterval(FCT);
  FCT=setInterval(()=>{const f=fcGet();
    if(f.end&&f.end<=Date.now()){clearInterval(FCT);FCT=null;fcDone(f);fcDraw();fcPill();return}
    if(!f.end){clearInterval(FCT);FCT=null}
    const t=document.getElementById('fct');if(t){t.textContent=fmt(fcLeft(f));const b=document.getElementById('fcb');if(b)b.style.width=(100-fcLeft(f)*100/f.dur)+'%'}
    fcPill()},1000);
}
function fcPill(){
  const hi=document.querySelector('.hdr-in');if(!hi)return;let p=document.getElementById('fcp');
  const on=AUTH&&!INTEST&&fcRun();
  if(!on){if(p)p.remove();return}
  if(!p){p=document.createElement('button');p.id='fcp';p.className='fcp';p.setAttribute('aria-label','Focus timer');p.onclick=()=>{location.hash='#/focus'};hi.insertBefore(p,document.getElementById('bell'))}
  const f=fcGet();p.innerHTML=`${ic('timer',15)}<span>${fmt(fcLeft(f))}</span>`;p.classList.toggle('brk',f.mode!=='focus');
}
function fcDraw(){
  const e=document.getElementById('fcx');if(!e)return;
  const f=fcGet(),run=fcRun(),s=fcStats(),l=fcLeft(f);
  e.innerHTML=`<div class="card fc19 m-${f.mode}${run?' run':''}">
   <div class="chiprow fcm">${Object.keys(FCM).map(k=>`<button class="chip ${f.mode===k?'pri':''}" onclick="fcMode('${k}')">${FCM[k][0]} · ${FCM[k][1]}m</button>`).join('')}<button class="chip" onclick="fcCustom()">Custom</button></div>
   <div class="fcclk"><span class="fcl">${FCM[f.mode][0]}</span><b id="fct">${fmt(l)}</b><div class="pbar"><i id="fcb" style="width:${100-l*100/f.dur}%"></i></div></div>
   <div class="row fcbt">${run?`<button class="btn ghost" onclick="fcPause()">Pause</button>`:`<button class="btn" onclick="fcStart()">${ic('play',16)} ${l<f.dur?'Resume':'Start'}</button>`}<button class="btn ghost" onclick="fcReset()">${ic('reset',16)} Reset</button></div></div>
   <div class="tiles fcs"><div><b>${s.today}</b><span>Minutes today</span></div><div><b>${s.sess}</b><span>Sessions today</span></div><div><b>${s.streak}🔥</b><span>Day streak</span></div></div>
   <div class="card tip19"><span class="usi">${ic('bulb',20)}</span><div class="grow"><span class="eyebrow">How it works</span><div class="sm">Study for 25 minutes, then take a 5-minute break. After 4 sessions take a longer break. The timer keeps running while you use the app — you will see it at the top.</div></div></div>`;
}
function viewFocus(){
  setApp(`<div class="wrap"><div class="crumb"><a href="#/lib">${ic('back',14)} Library</a></div>
   <div class="pgh"><div><span class="eyebrow">Library</span><h1 class="pgt">Focus timer</h1><div class="sm mut">Total focus so far: ${Math.round(fcStats().tot/60*10)/10} hours</div></div></div><div id="fcx"></div></div>`);
  setNav();fcDraw();if(fcRun())fcTick();
}
// a session that ended while the app was closed still counts
{const f0=fcGet();if(f0.end&&f0.end<=Date.now())fcDone(f0,1);else if(fcRun())fcTick()}

/* ---------- Home: greeting card + quick actions on top ---------- */
function homeDeco(){
  const w=document.querySelector('.home2');if(!w||w.querySelector('.hx19'))return;
  const R=CAT.results||[],P=pstats(R),nm=pfName(),b=INS&&INS.b;
  const hr=new Date().getHours(),gr=hr<5?'Late night study?':hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const gold=/Achiever|Champion/.test(P.lvl);
  const qa=[['#/series','file','Tests','a'],['#/buy','cart','Explore','d'],['#/lib','lib','Library','b'],['#/lb','trophy','Ranks','h'],['#/m','notebook','Mistakes','c'],['#/b','bmark','Saved','f'],['#/focus','timer','Focus','e'],['#/notes','edit','Notes','g']];
  w.insertAdjacentHTML('afterbegin',`<div class="card hx19"><div class="hxo"></div><div class="hxw"><div class="hxav">${pfInner(nm)}</div><div class="grow"><span class="hxg">${gr}</span><h1>${esc(nm.split(' ')[0]||'Student')}</h1>
    <span class="hxl${gold?' gold':''}">${gold?ic('crown',12):ic('star',12)} ${esc(P.lvl)}</span></div><div class="hxs"><b>${P.streak}🔥</b><span>day streak</span></div></div>
    <div class="hxk"><div><b data-cu="${R.length}">${R.length}</b><span>Tests</span></div><div><b data-cu="${P.avg}">${P.avg}%</b><span>Average</span></div><div><b data-cu="${P.best}">${P.best}%</b><span>Best</span></div><div><b id="hxrk">${b&&b.my_rank?'#'+b.my_rank:'–'}</b><span>Rank</span></div></div></div>
   <div class="qa19">${qa.map(x=>`<a class="qa t-${x[3]}" href="${x[0]}"><span>${ic(x[1],22)}</span><b>${x[2]}</b></a>`).join('')}</div>`);
  w.insertAdjacentHTML('beforeend',`<div class="card tip19" style="margin-top:16px"><span class="usi">${ic('bulb',20)}</span><div class="grow"><span class="eyebrow">Tip of the day</span><div>${esc(tip19())}</div></div></div>`);
  // wide screens: the banner on the left, countdown + live / up-next cards on the right
  const pm=w.querySelector(':scope>.promo'),cd=w.querySelector(':scope>.cdc');
  if(pm&&cd&&pm.nextElementSibling===cd){const g=document.createElement('div'),c=document.createElement('div');g.className='htop19';pm.before(g);
    let e=cd;const L=[];while(e&&!e.classList.contains('h2s')&&!e.classList.contains('hstk')&&e.id!=='dlb'){L.push(e);e=e.nextElementSibling}
    c.append(...L);g.append(pm,c)}
  // computers: study planner and leaderboard side by side
  const tk=w.querySelector('.hstk'),lb=w.querySelector('#dlb');
  if(tk&&lb){const g=document.createElement('div'),c1=document.createElement('div'),c2=document.createElement('div'),h1=tk.previousElementSibling,h2=lb.previousElementSibling;
    g.className='hgrid19';tk.before(g);
    if(h1&&h1.classList.contains('h2s'))c1.append(h1);c1.append(tk);
    if(h2&&h2.classList.contains('h2s'))c2.append(h2);c2.append(lb);
    g.append(c1,c2)}
  countUp(w.querySelector('.hx19'));
}
function hxRank(){const k=document.getElementById('hxrk'),b=INS&&INS.b;if(k&&b&&b.my_rank)k.textContent='#'+b.my_rank}
{const _ld=loadDash;loadDash=async function(){const r=await _ld.apply(this,arguments);hxRank();return r}}
{const _vh=viewHome;viewHome=function(tab){const r=_vh.apply(this,arguments);if(tab==='dash')try{homeDeco()}catch(e){}return r}}

/* ---------- routes (pages slide left / right in the order of the menu) ---------- */
const RK19=h=>{const k=sec19(h),i=Math.max(0,NAVIT.findIndex(x=>x[0]===k));let d=0;
  if(k==='tests'){d=Math.max(0,['series','buy','r','m','b'].indexOf(hub19k(h)))*.1;if(/^#\/(s|f|h)\//.test(h))d+=.05}
  else if(k==='lib')d=h==='#/notes'?.1:h==='#/focus'?.2:/^#\/pyq/.test(h)?.3:0;
  else if(h==='#/n')d=.5;
  return i+d};
route=async function(){
  if(INTEST||!AUTH)return;
  const h0=location.hash||'#/',rk=RK19(h0);let dir=0;
  if(LASTRK!==null&&rk!==LASTRK)dir=rk>LASTRK?1:-1;
  LASTRK=rk;
  ROUTING++;
  try{
    setNav();
    if(CAT&&Date.now()-CATAT>30000){await loadCat(true);if(!AUTH||INTEST)return}
    let p=null;
    if(dir&&CAT&&document.startViewTransition&&!RMOT()){
      const H=document.documentElement;H.dataset.vt=dir>0?'f':'b';
      try{
        const vt=document.startViewTransition(()=>{p=route0();return Promise.race([p,new Promise(r=>setTimeout(r,40))])});
        vt.finished.then(()=>{delete H.dataset.vt},()=>{delete H.dataset.vt});
        await vt.updateCallbackDone.catch(()=>{});
      }catch(e){delete H.dataset.vt}
    }
    if(!p){if(dir)PGDX=dir;p=route0()}
    await p;
  }finally{ROUTING--}
};
{const _r0=route0;route0=async function(){
  const h=location.hash||'#/';
  if(/^#\/(buy|lb|lib|notes|focus)$/.test(h))annLoad();
  if(CAT&&AUTH){
    if(h==='#/buy')return viewBuy();
    if(h==='#/lb')return viewLb();
    if(h==='#/lib')return viewLib();
    if(h==='#/notes')return viewNotes();
    if(h==='#/focus')return viewFocus();
  }else if(/^#\/(buy|lb|lib|notes|focus)$/.test(h)&&AUTH){
    skelPage();if(!(await loadCat()))return;return route0();
  }
  return _r0.apply(this,arguments);
}}

/* ---------- phone menu (☰): the same groups as the computer menu ---------- */
openMenu=function(){
  if(!AUTH)return;
  const R=CAT?CAT.results||[]:[],P=pstats(R),nm=pfName()||AUTH.name||'',o=pfGet();
  const sub=[o.exam,o.cls].filter(Boolean).join(' · ')||('+91 '+maskMob(AUTH.mobile)+' · '+P.lvl);
  const it=(i,t,f,on,c)=>`<button class="dri ${on?'on':''} ${c||''}" onclick="${f}">${ic(i,22)}<span>${t}</span></button>`;
  const go=h=>`closeModal();location.hash='${h}'`;
  $('#layer').innerHTML=`<div class="drw" onclick="if(event.target===this)closeModal()"><aside class="drp sb">
   <div class="sbh"><button class="sbx" onclick="closeModal()" aria-label="Close">${ic('x',18)}</button>
    <div class="sbav">${pfInner(nm)}</div><b class="sbn">${esc(nm)}</b><div class="sbs">${esc(sub)}</div>
    <button class="sbvp" onclick="closeModal();openProfile()">View Profile →</button></div>
   <div class="drl">
   ${SB19.map(g=>`${g[0]?`<div class="drs">${g[0]}</div>`:''}${g[1].map(x=>it(x[1],x[2],go(x[0]),sb19On(x[0]))).join('')}`).join('')}
   <div class="drs">More</div>
   ${it('bell','Notifications',go('#/n'),location.hash==='#/n')}${it('calendar','Exam countdown','closeModal();cdEdit()')}
   ${it('cart','Store','closeModal();location.href=\'store.html\'')}${it('sun','Theme settings','openLook()')}
   ${it('gear','Settings','openSettings()')}${it('info','About us','openAbout()')}${it('file','Terms &amp; conditions','openTerms()')}${it('mail','Contact us','closeModal();supportSheet()')}
   ${it('logout','Logout','closeModal();signOut()',0,'out')}</div></aside></div>`;
};

/* keep the top bar title and the focus pill fresh */
{const _sa=setApp;setApp=function(h){const r=_sa.apply(this,arguments);try{fcPill();if(!INTEST&&AUTH&&document.body.classList.contains('hasnav'))hdr19()}catch(e){}return r}}

;(window.__p=window.__p||{})['app19']=1;
