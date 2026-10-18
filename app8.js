/* ===== v19: new Home — promo slider, countdown, performance dashboard, tracker snapshot, leaderboard ===== */
IC.up='<path d="M7 17L17 7M9 7h8v8"/>';IC.down='<path d="M7 7l10 10M17 9v8H9"/>';
IC.users='<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/>';

/* ---------- promo slider (managed from Admin → Banners) ---------- */
let PROMO=null,PRT=null,PRI=0,PRHOLD=0;
function promoDefault(){
  const s=esc(CFG.SITE_NAME||'CBT Test Series');
  return [
    {id:'d1',title:'All India Test Series 2027',text:'Real NEET pattern · All-India rank · Detailed analysis',link:'#/series',label:'Explore tests',c:'a'},
    {id:'d2',title:s,text:'Practise daily, revise your mistakes and track your progress',link:'#/series',label:'Start practising',c:'b'},
    {id:'d3',title:'Need help?',text:'Message our support team on Telegram any time',link:HELP_URL,label:'Contact us',c:'c'}];
}
async function promoLoad(){
  if(!PROMO)PROMO=LS.get('cbt_promo',null);
  const r=await rpc('cbt_banners',{},true);
  if(r&&r.ok){PROMO=r.items||[];LS.set('cbt_promo',PROMO)}
  return PROMO;
}
function promoSlides(){return PROMO&&PROMO.length?PROMO:promoDefault()}
function promoSlide(x,i){
  const u=x.link||'',ext=/^https?:\/\//i.test(u);
  const on=u?(ext?`href="${esc(u)}" target="_blank" rel="noopener noreferrer"`:`href="${esc(u)}"`):'';
  const inner=x.img&&/^data:image\/|^https:\/\//.test(x.img)?`<img src="${x.img}" alt="${esc(x.title||'')}" loading="${i?'lazy':'eager'}" draggable="false">`
   :`<div class="pmtx pv${x.c||'abc'[i%3]}"><div class="pmb"><b>${esc(x.title||'')}</b>${x.text?`<span>${esc(x.text)}</span>`:''}${u?`<em>${esc(x.label||'Open')} →</em>`:''}</div><i class="pmo1"></i><i class="pmo2"></i></div>`;
  return u?`<a class="pms" ${on}>${inner}</a>`:`<div class="pms">${inner}</div>`;
}
function promoHtml(){
  const L=promoSlides();
  return `<div class="promo" id="promo"><div class="pmtrack" id="pmt" onscroll="promoScroll()" ontouchstart="PRHOLD=1" ontouchend="PRHOLD=0;promoAuto()" onmouseenter="PRHOLD=1" onmouseleave="PRHOLD=0">${L.map(promoSlide).join('')}</div>
   ${L.length>1?`<div class="pmdots">${L.map((_,i)=>`<button class="${i===PRI%L.length?'on':''}" aria-label="Slide ${i+1}" onclick="promoGo(${i})"></button>`).join('')}</div>`:''}</div>`;
}
function promoGo(i){const t=$('#pmt');if(!t)return;const n=t.children.length;PRI=(i+n)%n;t.scrollTo({left:PRI*t.clientWidth,behavior:'smooth'});promoDots();promoAuto()}
function promoDots(){document.querySelectorAll('.pmdots button').forEach((b,j)=>b.classList.toggle('on',j===PRI))}
let PRS=null;function promoScroll(){clearTimeout(PRS);PRS=setTimeout(()=>{const t=$('#pmt');if(!t)return;PRI=Math.round(t.scrollLeft/Math.max(1,t.clientWidth));promoDots()},80)}
function promoAuto(){
  clearInterval(PRT);
  PRT=setInterval(()=>{const t=$('#pmt');if(!t){clearInterval(PRT);return}if(PRHOLD||document.hidden||t.children.length<2)return;promoGo(PRI+1)},3500);
}
async function promoStart(){
  promoAuto();
  const before=JSON.stringify(promoSlides().map(x=>x.id+(x.img||'').length+x.link+x.title));
  await promoLoad();
  const e=$('#promo');if(!e)return;
  if(JSON.stringify(promoSlides().map(x=>x.id+(x.img||'').length+x.link+x.title))!==before){PRI=0;e.outerHTML=promoHtml();promoAuto()}
}

/* ---------- performance dashboard ---------- */
function areaChart(vals,avg){
  const w=320,h=120,pl=4,pr=4,pt=10,pb=18,n=vals.length;
  const X=i=>pl+(n<2?(w-pl-pr)/2:i*(w-pl-pr)/(n-1)),Y=v=>pt+(100-Math.max(0,Math.min(100,v)))*(h-pt-pb)/100;
  const pts=vals.map((v,i)=>[X(i),Y(v)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=line+` L${X(n-1).toFixed(1)} ${h-pb} L${X(0).toFixed(1)} ${h-pb} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" class="achart" preserveAspectRatio="none"><defs><linearGradient id="agr" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--pri)" stop-opacity=".35"/><stop offset="1" stop-color="var(--pri)" stop-opacity="0"/></linearGradient></defs>
   ${[25,50,75].map(g=>`<line x1="0" x2="${w}" y1="${Y(g)}" y2="${Y(g)}" class="agl"/>`).join('')}
   <line x1="0" x2="${w}" y1="${Y(avg)}" y2="${Y(avg)}" class="aavg"/>
   <path d="${area}" fill="url(#agr)"/><path d="${line}" fill="none" stroke="var(--pri)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
   ${pts.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===n-1?4.5:3}" class="${i===n-1?'alast':'apt'}" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`;
}
function dashPerf(R){
  const P=pstats(R);
  if(!R.length)return `<div class="h2s">${ic('chart2',20)} Your dashboard</div><div class="card empty dempty">${ic('target',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">Take your first test</h3><p class="sm">Your scores, accuracy, progress and rank will appear here.</p><button class="btn" onclick="location.hash='#/series'">Browse test series</button></div>`;
  const S=R.slice(0,10).reverse().map(x=>pct(x.score,x.max)),last=S[S.length-1],prev=S.length>1?S[S.length-2]:null,first=pct(R[R.length-1].score,R[R.length-1].max);
  const d=prev==null?null:last-prev,since=R.length>1?pct(R[0].score,R[0].max)-first:null;
  const mx=Math.max(1,...P.week.map(w=>w.n)),hrs=Math.round(P.secs/360)/10;
  const delta=(v,t)=>v==null?'':`<span class="dlt ${v>0?'g':v<0?'b':''}">${v>0?ic('up',12):v<0?ic('down',12):''}${v>0?'+':''}${v}% ${t}</span>`;
  return `<div class="h2s">${ic('chart2',20)} Your dashboard</div>
  <div class="card dash">
   <div class="dkpi"><div><span>Tests</span><b data-cu="${R.length}">${R.length}</b></div><div><span>Average</span><b>${P.avg}%</b></div><div><span>Best</span><b>${P.best}%</b></div><div><span>Accuracy</span><b>${P.acc}%</b></div></div>
   <div class="dchart"><div class="dch"><div><span class="sm mut">Latest score</span><div class="dbig">${last}%${delta(d,'vs last')}</div></div><span class="sm mut">Last ${S.length} test${S.length>1?'s':''}</span></div>
    ${S.length>1?areaChart(S,P.avg):`<div class="sm mut" style="padding:16px 0">Attempt one more test to see your progress graph.</div>`}
    ${S.length>1?`<div class="dleg"><span><i class="l1"></i>Score %</span><span><i class="l2"></i>Your average ${P.avg}%</span></div>`:''}</div>
   ${since!=null?`<div class="dnote ${since>=0?'g':'b'}">${since>=0?'📈':'📉'} ${since>=0?`You improved <b>${since}%</b> since your first test`:`Your latest score is <b>${-since}%</b> below your first test — revise your mistakes`}</div>`:''}
   <div class="dmini"><div><b>${P.streak}🔥</b><span>Day streak</span></div><div><b>${hrs}h</b><span>Practised</span></div><div><b>${P.cor}</b><span>Correct</span></div><div><b>${P.tot-P.cor}</b><span>Wrong</span></div></div>
   <div class="dweek"><div class="row" style="justify-content:space-between"><b class="sm">This week</b><span class="sm mut">tests per day</span></div><div class="week">${P.week.map(w=>`<div><i class="${w.n?'':'z'}" style="height:${w.n?Math.max(14,w.n/mx*100):0}%"></i>${w.l}</div>`).join('')}</div></div>
  </div>`;
}

/* ---------- study tracker snapshot ---------- */
function dashTracker(){
  const T=trkLoad(),w=T.weeks[T.cur],s=trkStats(w);
  const subs=w.subjects.map(x=>{const t=x.tasks.length,d=x.tasks.filter(k=>k.done).length;return{...x,t,d,p:t?Math.round(d*100/t):0}}).filter(x=>x.t).sort((a,b)=>b.t-a.t).slice(0,4);
  return `<div class="h2s">${ic('pulse',20)} Study tracker <span class="n">${esc(w.label)}</span></div>
  <div class="card dtrk" onclick="location.hash='#/t'">
   ${s.total?`<div class="dtrkh"><div class="nbring">${ring(s.pct,74,8,s.pct>=75?'var(--ok)':'var(--pri)')}<span><b style="font-size:17px;color:var(--tx)">${s.pct}%</b></span></div>
    <div class="grow"><b>${s.done} of ${s.total} tasks done</b><div class="sm mut">${s.total-s.done?`${s.total-s.done} task${s.total-s.done>1?'s':''} left this week`:'Week complete! 🏆'}</div></div>${ic('right',18)}</div>
    <div class="dtrks">${subs.map(x=>`<div><div class="row sm" style="justify-content:space-between;margin-bottom:5px"><span>${esc(x.emoji+' '+x.name)}</span><span class="mut">${x.d}/${x.t}</span></div><div class="bar"><i style="width:${x.p}%;background:${x.color}"></i></div></div>`).join('')}</div>`
   :`<div class="dtrkh"><span class="mki">${ic('pulse',22)}</span><div class="grow"><b>Plan your week</b><div class="sm mut">Add subjects and daily tasks, tick them off and see your progress here.</div></div>${ic('right',18)}</div>`}
  </div>`;
}

/* ---------- leaderboard ---------- */
function dashLb(b){
  if(!b||!b.my_rank)return `<div class="card empty sm">Attempt a test to see where you stand among other students.</div>`;
  const tot=b.total||1,beat=tot>1?Math.round((tot-b.my_rank)*100/(tot-1)):100,top=(b.top||[]).slice(0,5);
  const nm=x=>esc(x.name||x.student||'Student');
  return `<div class="card dlb"><div class="dlbh"><div class="dlbr"><span>Your rank</span><b>#${b.my_rank}</b><span>of ${tot}</span></div>
   <div class="grow"><div class="dlbbeat">You are ahead of <b>${beat}%</b> students</div><div class="bar"><i style="width:${beat}%"></i></div>
   <div class="dlbk"><div><b>${b.my_pct}%</b><span>Your avg</span></div><div><b>${top[0]?top[0].pct:'–'}%</b><span>Topper avg</span></div><div><b>${top[0]&&b.my_pct!=null?Math.max(0,top[0].pct-b.my_pct):'–'}%</b><span>Gap to #1</span></div></div></div></div>
   ${top.length?`<div class="dlbl">${top.map((x,i)=>{const r=x.rank||i+1,me=x.me||r===b.my_rank;return `<div class="lb ${me?'me':''}"><span class="n ${r<=3?'m'+r:''}">${r}</span><span class="grow">${nm(x)}${me?' (you)':''}</span><b>${x.pct!=null?x.pct+'%':''}</b></div>`}).join('')}
   ${b.my_rank>top.length?`<div class="lb me"><span class="n">${b.my_rank}</span><span class="grow">You</span><b>${b.my_pct}%</b></div>`:''}</div>`:''}</div>`;
}
async function loadDash(){
  const lb=$('#dlb'),ins=$('#ins');
  if(!(INS&&Date.now()-INS.t<90000)){
    const [a,b]=await Promise.all([rpc('cbt_insights',{}),rpc('cbt_overall',{})]);
    INS={t:Date.now(),a:a.ok?a:null,b:b.ok?b:null};
  }
  const l2=$('#dlb'),i2=$('#ins');
  if(l2)l2.innerHTML=dashLb(INS.b);
  if(i2){i2.innerHTML=insHtml({a:INS.a,b:null});countUp(i2)}
}

/* ---------- home ---------- */
IC.chart2='<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>';
{const _vh=viewHome;viewHome=function(tab){
  if(tab!=='dash')return _vh(tab);
  const R=CAT.results||[];
  let o=`<div class="wrap home2">`;
  const pn=getPend();
  if(pn.length)o+=`<div class="card pendc"><span class="mki">${ic('wifi',22)}</span><div class="grow"><b>${pn.length} test waiting to submit</b><div class="sm mut">Your answers are safe on this phone. They will be sent when internet is back.</div></div><button class="btn sm" onclick="retryPend()">Submit now</button></div>`;
  o+=promoHtml()+cdCard()+liveHtml();
  const prog=CAT.tests.filter(t=>t.in_progress&&!t.locked);
  if(prog.length)o+=`<div class="h2s">${ic('play',20)} Continue your test</div>${prog.map(testRow).join('')}`;
  o+=dashPerf(R)+dashTracker();
  o+=`<div class="h2s">${ic('trophy',20)} Leaderboard</div><div id="dlb">${INS&&INS.b?dashLb(INS.b):R.length?`<div class="card"><div class="sk" style="width:50%"></div><div class="sk" style="height:60px;margin-top:12px"></div></div>`:dashLb(null)}</div>`;
  setApp(o+'</div>');setNav('dash');prefetchTabs();
  cdTick();promoStart();annLoad();
  const d=document.querySelector('.dash');if(d)countUp(d);
  if(R.length)loadDash();
}}

/* ---------- shareable links: series pages + open the right page after sign-in ---------- */
IC.share='<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>';
const siteBase=()=>location.href.replace(/[#?].*$/,'').replace(/index\.html$/,'');
async function shareLink(url,title,text){
  if(navigator.share){try{await navigator.share({title,text,url});return}catch(e){if(e&&e.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(url);toast('Link copied')}catch(e){prompt('Copy this link',url)}
}
function shareSeries(id){
  const s=(CAT&&CAT.series||[]).find(x=>x.id===id);if(!s)return;
  shareLink(siteBase()+'#/s/'+id,s.title,`${s.title} — ${CFG.SITE_NAME||'Test series'}`);
}
{const _vs=viewSeries;viewSeries=function(id){
  const r=_vs(id);
    const cv=document.querySelector('.shx .shc');
  if(cv&&!cv.querySelector('.shbtn'))cv.insertAdjacentHTML('beforeend',`<button class="shbtn" aria-label="Share" title="Share" onclick="event.stopPropagation();shareSeries('${id}')">${ic('share',18)}</button>`);
  return r;
}}
const DEEP=/^#\/(s|f|series|t|m|b|r|n)(\/|$)/;
if(!AUTH&&DEEP.test(location.hash||''))LS.set('cbt_after',location.hash);
{const _dl=doLogin;doLogin=async function(){
  await _dl();
  const w=LS.get('cbt_after',null);
  if(AUTH&&w){LS.del('cbt_after');location.hash=w}
}}
{const _lg=login;login=function(mode){
  const r=_lg(mode);
  const w=LS.get('cbt_after',null),c=document.querySelector('#app .card');
  if(w&&c&&!mode&&!document.getElementById('afterNote'))c.insertAdjacentHTML('afterbegin',`<div id="afterNote" class="sm" style="background:var(--priSoft);color:var(--pri);border-radius:12px;padding:10px 12px;margin-bottom:12px;font-weight:600">Sign in to open the link you were sent. New here? Tap “Request access”.</div>`);
  return r;
}}
if(!AUTH&&LS.get('cbt_after',null)&&document.querySelector('#app .card'))login();

/* ---------- live test card (shows only while a test is open and not yet attempted) ---------- */
function liveSeen(){
  const k='cbt_tseen_'+AUTH.mobile;let m=LS.get(k,null),ch=0;
  if(!m){m={};CAT.tests.forEach(t=>m[t.id]=0);ch=1}
  CAT.tests.forEach(t=>{if(!(t.id in m)){m[t.id]=Date.now();ch=1}});
  if(ch)LS.set(k,m);return m;
}
// a test stays LIVE on home (even after the student attempts it) until 9 PM of the day it opens (opens after 9 PM → till 9 PM next day); then it is only in its series
const LIVE_END_H=21;
function liveEnd(ms){if(!ms)return 0;const e=new Date(ms);e.setHours(LIVE_END_H,0,0,0);if(ms>=e.getTime())e.setDate(e.getDate()+1);return e.getTime()}
const liveStart=(t,m)=>t.opens_at||m[t.id]||0;
function liveTests(){
  const m=liveSeen(),now=srvNow();
  return CAT.tests.filter(t=>!t.locked&&!t.practice&&!isWait(t)&&CAT.series.some(s=>s.id===t.series_id)
    &&now<liveEnd(liveStart(t,m))).sort((a,b)=>liveStart(b,m)-liveStart(a,m)).slice(0,2);
}
let liveIv=null;
function liveHtml(){
  const L=liveTests();clearTimeout(liveIv);if(!L.length)return '';
  // at 9 PM the card leaves home by itself
  const m=liveSeen(),end=Math.min(...L.map(t=>liveEnd(liveStart(t,m))))-srvNow();
  if(end>0&&end<864e5)liveIv=setTimeout(()=>{if(document.querySelector('.home2'))viewHome('dash')},end+1000);
  return L.map(t=>{const s=CAT.series.find(x=>x.id===t.series_id)||{},till=new Date(liveEnd(liveStart(t,m))),today=till.toDateString()===new Date(srvNow()).toDateString();
    return `<div class="card livec" onclick="${t.attempts&&!t.in_progress?"location.hash='#/r'":`openTest('${t.id}')`}"><div class="livet"><span class="liveb"><i></i>LIVE</span><span class="sm mut">${t.opens_at?'Started '+new Date(t.opens_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'Available now'} · Live till 9 PM${today?'':' tomorrow'}</span></div>
     <b class="livett">${esc(t.title)}</b><div class="sm mut">${esc(s.title||'')}${s.title?' · ':''}${t.questions} questions · ${t.duration} min</div>
     ${t.in_progress?`<button class="btn block" style="margin-top:12px" onclick="event.stopPropagation();openTest('${t.id}')">${ic('play',16)} Resume test</button>`
      :t.attempts?`<div class="row" style="margin-top:12px;gap:8px"><span class="chip ok" style="align-self:center">✓ Attempted</span><button class="btn soft grow" onclick="event.stopPropagation();location.hash='#/r'">View result</button></div>`
      :`<button class="btn block" style="margin-top:12px" onclick="event.stopPropagation();openTest('${t.id}')">${ic('play',16)} Attempt now</button>`}</div>`}).join('');
}

/* notifications page: full screen, no bottom bar */
{const _vn=viewNotices;viewNotices=async function(){const r=await _vn.apply(this,arguments);if(location.hash==='#/n')document.body.classList.remove('hasnav');return r}}
;(window.__p=window.__p||{})['app8']=1;
