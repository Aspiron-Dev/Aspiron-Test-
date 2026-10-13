function rvSol(A){
  const {all,names,hasSec}=A,f=RV.filter,sf=RV.sec||'*',tid=A.rec.test_id;
  const items=all.filter(x=>(f==='all'||x.st===f)&&(!hasSec||sf==='*'||(x.q.sec||'')===sf));
  const fb=(k,t)=>`<button class="${f===k?'on':''}" onclick="setFilter('${k}')">${t}</button>`;
  const sb=(k,t)=>`<button class="${sf===k?'on':''}" onclick="setSecF(${JSON.stringify(k).replace(/"/g,'&quot;')})">${esc(t)}</button>`;
  return `<div class="seg" style="width:100%;display:flex;margin-bottom:12px">${fb('all','All')}${fb('c','Correct')}${fb('w','Wrong')}${fb('s','Skipped')}</div>
   ${hasSec?`<div class="seg" style="margin-bottom:12px">${sb('*','All sections')}${names.map(s=>sb(s,s||'General')).join('')}</div>`:''}
   ${items.map(({q,i,a,t,st})=>`<div class="card rv" id="q${i}"><div class="row" style="margin-bottom:8px"><b>Q${i+1}</b>${st==='c'?'<span class="chip ok">Correct</span>':st==='w'?'<span class="chip" style="background:var(--badSoft);color:var(--bad)">Wrong</span>':'<span class="chip">Skipped</span>'}${q.sec?`<span class="chip">${esc(q.sec)}</span>`:''}${t>0?`<span class="chip">${ic('clock',12)} ${fs(t)}</span>`:''}<span style="flex:1"></span>${tid?bmBtn(tid,i)+rpBtn(tid,i):''}</div>
    <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
    ${q.options.map((o,j)=>{if(!o&&!(q.oimg&&q.oimg[j]))return '';const isC=j===q.answer,isY=j===a;return `<div class="ro ${isC?'c':(isY?'w':'')}"><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}${imgTag(q.oimg&&q.oimg[j],'oi')}${isC||isY?`<span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${isC?'<span class="tag g" style="margin:0">Correct answer</span>':''}${isY&&!isC?'<span class="tag r" style="margin:0">Your answer</span>':''}${isY&&isC?'<span class="tag g" style="margin:0">Your answer</span>':''}</span>`:''}</span></div>`}).join('')}
    ${q.answer==null?'<div class="sm mut" style="margin-top:6px">No answer key was set for this question, so it is not marked.</div>':''}
    ${q.explanation||q.eimg?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''}</div>`).join('')||'<div class="card empty">Nothing to show here.</div>'}
   <div style="text-align:center;margin-top:8px"><button class="btn" onclick="doneResult()">Back to tests</button></div>`;
}
function rBody(){const A=rAnalyse();return RV.tab==='sub'?rvSub(A):RV.tab==='time'?rvTime(A):RV.tab==='sol'?rvSol(A):rvOv(A)}
function rRefresh(){const b=$('#rbody');if(!b)return;b.innerHTML=rBody();document.querySelectorAll('#rtabs button').forEach(x=>x.classList.toggle('on',x.dataset.t===RV.tab));countUp(b)}
function rTab(t){RV.tab=t;rRefresh();const e=$('#rtabs');if(e&&e.getBoundingClientRect().top<0)window.scrollTo({top:Math.max(0,e.parentElement.offsetTop-10),behavior:'smooth'})}
function setFilter(f){RV.filter=f;rRefresh()}
function setSecF(s){RV.sec=s;rRefresh()}
function doneResult(){RV=null;CAT=null;const h=RET&&RET!=='#/'?RET:'#/r';history.replaceState(null,'',h);route()}
function showResult(){
  document.body.classList.remove('intest');
  RV.tab=RV.tab||'ov';
  const A=rAnalyse(),rec=A.rec,p=pct(rec.score,rec.max),col=ringCol(p);
  const tb=(k,t)=>`<button data-t="${k}" class="${RV.tab===k?'on':''}" onclick="rTab('${k}')">${t}</button>`;
  setApp(`<div class="wrap"><div class="row" style="margin-bottom:12px"><button class="btn ghost sm" onclick="doneResult()">${ic('back')} Back</button><span class="mut sm" style="flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(rec.title)}</span></div>
   <div class="card rhero">
   <div class="ring">${ring(p,150,12,col)}<div class="c"><div><b data-cu="${rec.score}">${rec.score}</b><span class="sm mut">out of ${rec.max}</span></div></div></div>
   <h2>${p>=75?'Excellent work! 🎉':p>=50?'Good effort 👍':'Keep practising 💪'}</h2><div class="mut sm" style="margin-top:4px">${p}%${rec.late?' · Submitted late':''}</div>
   <div class="s4"><div><b style="color:var(--ok)">${rec.correct}</b><span>Correct</span></div><div><b style="color:var(--bad)">${rec.wrong}</b><span>Wrong</span></div><div><b>${rec.skipped}</b><span>Skipped</span></div><div><b>${A.Qs.length}</b><span>Total</span></div></div></div>
   <div class="rtabs"><div class="seg" id="rtabs">${tb('ov','Overview')}${A.hasSec?tb('sub','Subjects'):''}${tb('time','Time')}${tb('sol','Solutions')}</div></div>
   <div id="rbody">${rBody()}</div></div>`);
}


/* ---------- boot ---------- */
async function init(){
  updateTheme();updateHeader();
  if(getComputedStyle(document.documentElement).getPropertyValue('--cssv').trim()!=='5'){const b=document.createElement('div');b.className='cssbanner';b.textContent='Design is not fully updated. Please upload the new style.css to GitHub, then refresh.';b.style.cssText='position:fixed;left:12px;right:12px;top:12px;z-index:99;background:#c9780a;color:#fff;border-radius:14px;padding:12px 14px;font-weight:600';document.body.appendChild(b)}
  if(!cloud)return login();
  if(!AUTH)return login();
  loading('Loading…');
  await flushPending();
  // a test is still running on this device -> go straight back into it
  const rid=runningTest();
  if(rid){RET='#/';return startTest(rid)}
  route();
}
function runningTest(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('cbt_prog_'+AUTH.mobile+'_')){const p=LS.get(k,null);if(p&&p.tid)return p.tid}
    }
  }catch(e){}
  return null;
}
/* ---------- v4: dashboard insights, mistake notebook, PWA ---------- */
IC.notebook='<path d="M5 3h12a2 2 0 012 2v16H7a2 2 0 01-2-2V3z"/><path d="M9 8h6M9 12h6"/>';
IC.install='<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>';
let INS=null;
const sk3=()=>`<div class="card" style="margin-top:12px"><div class="sk" style="width:40%"></div><div class="sk" style="width:100%;height:40px;margin-top:12px"></div><div class="sk" style="width:70%;margin-top:10px"></div></div>`;
async function loadIns(){
  const el=$('#ins');if(!el)return;
  if(INS&&Date.now()-INS.t<90000){el.innerHTML=insHtml(INS);countUp(el);return}
  el.innerHTML=sk3();
  const [a,b]=await Promise.all([rpc('cbt_insights',{}),rpc('cbt_overall',{})]);
  const cur=$('#ins');if(!cur)return;
  if(!a.ok&&!b.ok){cur.innerHTML='';return}
  INS={t:Date.now(),a:a.ok?a:null,b:b.ok?b:null};cur.innerHTML=insHtml(INS);countUp(cur);
}
function insHtml(I){
  let o='';const a=I.a,b=I.b;
  if(b&&b.my_rank)o+=`<div class="card rankc" style="margin-top:12px"><div class="rk"><span class="sm">Overall rank</span><b data-cu="${b.my_rank}">${b.my_rank}</b><span class="sm">of ${b.total}</span></div><div class="rkr"><div><b>${b.my_pct}%</b><span>Your avg score</span></div><div><b>${b.top[0]?b.top[0].pct:'–'}%</b><span>Topper avg</span></div></div></div>`;
  if(a&&a.mistakes>0)o+=`<div class="card mkcard" onclick="location.hash='#/m'"><span class="mki">${ic('notebook',22)}</span><div class="grow"><b>Mistake notebook</b><div class="sm mut">${a.mistakes} wrong / skipped questions to revise</div></div><span class="btn sm">Revise</span></div>`;
  const sub=a?(a.subjects||[]).filter(s=>s.correct+s.wrong>0||s.total>0):[];
  if(sub.length&&!(sub.length===1&&sub[0].sec==='General')){
    const rows=sub.map(s=>({...s,acc:s.correct+s.wrong?Math.round(s.correct*100/(s.correct+s.wrong)):0}));
    const wk=[...rows].filter(r=>r.correct+r.wrong>0).sort((x,y)=>x.acc-y.acc)[0];
    o+=`<div class="h2s">${ic('target',20)} Subject strength</div><div class="card">${rows.map(r=>`<div class="prow"><div class="row sm" style="justify-content:space-between;margin-bottom:6px"><b>${esc(r.sec)}</b><span class="mut">${r.acc}% · ✓${r.correct} ✗${r.wrong}${r.avg_time?' · '+fs(r.avg_time)+'/q':''}</span></div><div class="bar"><i style="width:${r.acc}%;background:${ringCol(r.acc)}"></i></div></div>`).join('')}
    ${wk&&rows.length>1?`<div class="sm mut" style="margin-top:10px">${ic('info',14)} Focus more on <b style="color:var(--tx)">${esc(wk.sec)}</b> (${wk.acc}% accuracy).</div>`:''}</div>`;
  }
  return o;
}
/* mistake notebook */
let MK=null,MKN=0;
async function viewMistakes(){
  loading('Opening your notebook…');
  MK={kind:'all',sec:'',items:[],st:{},more:false,counts:null};
  const ok=await mkFetch(0);if(!ok)return;mkRender();
}
async function mkFetch(off){
  const r=await rpc('cbt_mistakes',{p_offset:off,p_limit:15,p_kind:MK.kind,p_sec:MK.sec});
  if(!r.ok){if(!authErr(r))setApp(`<div class="wrap">${tabsHtml('mk')}<div class="card empty">${ic('wifi',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">Could not open notebook</h3><p class="sm">Please check your connection and try again.</p><button class="btn" onclick="viewMistakes()">Try again</button></div></div>`),setNav('mk');return false}
  r.items.forEach(x=>{x._n=++MKN});MK.items=off?MK.items.concat(r.items):r.items;MK.more=r.more;MK.counts=r.counts;return true;
}
function mkHead(){
  const c=MK.counts,tot=c.wrong+c.skipped;
  const kb=(k,t)=>`<button class="${MK.kind===k?'on':''}" onclick="mkKind('${k}')">${t}</button>`;
  const sb=(k,t)=>`<button class="${MK.sec===k?'on':''}" onclick="mkSec(${JSON.stringify(k).replace(/"/g,'&quot;')})">${esc(t)}</button>`;
  return `<div class="card rankc" style="margin-bottom:12px"><div class="rk"><span class="sm">To revise</span><b>${tot}</b><span class="sm">questions</span></div><div class="rkr"><div><b>${c.wrong}</b><span>Wrong</span></div><div><b>${c.skipped}</b><span>Skipped</span></div><div><b>${c.mastered}</b><span>Mastered</span></div></div></div>
  <div class="seg" style="width:100%;display:flex;margin-bottom:10px">${kb('all','All')}${kb('wrong','Wrong')}${kb('skipped','Skipped')}</div>
  ${c.secs.length>1?`<div class="seg" style="margin-bottom:12px">${sb('','All subjects')}${c.secs.map(s=>sb(s.sec,s.sec+' ('+s.n+')')).join('')}</div>`:''}`;
}
function mkRender(){
  const c=MK.counts;
  let o=`<div class="wrap">${tabsHtml('mk')}<div id="mkh">${mkHead()}</div><div id="mklist">${mkList()}</div></div>`;
  setApp(o);setNav('mk');
}
function mkList(){
  if(!MK.items.length)return `<div class="card empty">${ic('check',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">${MK.counts.wrong+MK.counts.skipped?'Nothing here':'All clear! 🎉'}</h3><p class="sm">${MK.counts.wrong+MK.counts.skipped?'No questions match this filter.':'Questions you get wrong or skip in tests will collect here for revision.'}</p></div>`;
  return MK.items.map(mkCard).join('')+(MK.more?`<div style="text-align:center;margin-top:8px"><button class="btn ghost" onclick="mkMore()">Load more</button></div>`:'');
}
function mkCard(it){
  const n=it._n,S=MK.st[n]||{},rev=S.pick!=null||S.show,q=it;
  return `<div class="card rv mkc" id="mk${n}"><div class="row" style="margin-bottom:8px;flex-wrap:wrap"><b>Q${it.qidx+1}</b><span class="chip">${esc(it.title)}</span>${it.kind==='wrong'?`<span class="chip" style="background:var(--badSoft);color:var(--bad)">You chose ${L[it.mine]}</span>`:'<span class="chip">Skipped</span>'}${it.sec&&it.sec!=='General'?`<span class="chip pri">${esc(it.sec)}</span>`:''}<span style="flex:1"></span>${bmBtn(it.test_id,it.qidx)}${rpBtn(it.test_id,it.qidx)}</div>
   <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
   ${q.options.map((o,j)=>{if(!o&&!(q.oimg&&q.oimg[j]))return '';const cls=rev?(j===q.answer?'c':(j===S.pick?'w':'')):'';return `<div class="ro pick ${cls}" ${rev?'':`onclick="mkPick(${n},${j})"`}><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}${imgTag(q.oimg&&q.oimg[j],'oi')}</span></div>`}).join('')}
   ${rev?`${S.pick!=null?`<div class="sm" style="margin:4px 0;font-weight:700;color:${S.pick===q.answer?'var(--ok)':'var(--bad)'}">${S.pick===q.answer?'Correct! 🎉':'Not quite — correct answer is '+L[q.answer]}</div>`:''}${q.explanation||q.eimg?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''}
   <div class="row" style="margin-top:12px"><button class="btn sm" style="flex:1" onclick="mkDone(${n})">${ic('check')} Got it — remove</button><button class="btn ghost sm" style="flex:1" onclick="mkReset(${n})">Practise again</button></div>`
   :`<div class="row" style="margin-top:10px"><span class="sm mut" style="flex:1">Tap an option to practise</span><button class="btn ghost sm" onclick="mkShow(${n})">Show answer</button></div>`}</div>`;
}
const mkGet=n=>MK.items.find(x=>x._n===n);
function mkUp(n){const it=mkGet(n),e=document.getElementById('mk'+n);if(it&&e)e.outerHTML=mkCard(it)}
function mkPick(n,j){MK.st[n]={pick:j};if(navigator.vibrate)navigator.vibrate(8);mkUp(n)}
function mkShow(n){MK.st[n]={show:1};mkUp(n)}
function mkReset(n){delete MK.st[n];mkUp(n)}
async function mkDone(n){
  const it=mkGet(n);if(!it)return;
  const e=document.getElementById('mk'+n);if(e)e.classList.add('out');
  const r=await rpc('cbt_mistake_done',{p_test:it.test_id,p_qidx:it.qidx,p_on:true});
  if(!r.ok){if(e)e.classList.remove('out');toast('Could not save. Try again.');return}
  INS=null;MK.items=MK.items.filter(x=>x._n!==n);
  const c=MK.counts;c[it.kind]=Math.max(0,c[it.kind]-1);c.mastered++;
  const s=c.secs.find(x=>x.sec===it.sec);if(s)s.n--;
  setTimeout(()=>{const h=$('#mkh');if(h)h.innerHTML=mkHead();const l=$('#mklist');if(l)l.innerHTML=mkList();toast('Marked as mastered ✓')},260);
}
async function mkKind(k){MK.kind=k;MK.st={};if(await mkFetch(0))mkRender()}
async function mkSec(s){MK.sec=s;MK.st={};if(await mkFetch(0))mkRender()}
async function mkMore(){if(await mkFetch(MK.items.length)){const l=$('#mklist');if(l)l.innerHTML=mkList()}}
/* PWA */
let DIP=null;
function syncTheme(){try{const m=document.querySelector('meta[name=theme-color]');if(m)m.content=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#1d6fe8'}catch(e){}}
const isStandalone=()=>matchMedia('(display-mode:standalone)').matches||navigator.standalone;
function showInstall(ios){
  if(isStandalone()||LS.get('cbt_noinst',0)||document.querySelector('.instbar'))return;
  const d=document.createElement('div');d.className='instbar';
  d.innerHTML=`<span class="mki">${ic('install',20)}</span><div class="grow"><b>Install this app</b><div class="sm mut">${ios?'Tap Share, then “Add to Home Screen”':'Open it like an app from your home screen'}</div></div>${ios?'':'<button class="btn sm" id="instgo">Install</button>'}<button class="iconbtn sm" id="instx" aria-label="Close">${ic('x',16)}</button>`;
  document.body.appendChild(d);
  $('#instx').onclick=()=>{LS.set('cbt_noinst',1);d.remove()};
  const g=$('#instgo');if(g)g.onclick=async()=>{if(!DIP)return;DIP.prompt();try{await DIP.userChoice}catch(e){}DIP=null;d.remove()};
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();DIP=e;setTimeout(()=>{if(!INTEST)showInstall(false)},4000)});
window.addEventListener('appinstalled',()=>{const d=document.querySelector('.instbar');if(d)d.remove()});
if(/iphone|ipad|ipod/i.test(navigator.userAgent)&&!isStandalone())setTimeout(()=>{if(!INTEST&&AUTH)showInstall(true)},6000);
window.addEventListener('offline',()=>toast('You are offline'));
window.addEventListener('online',()=>toast('Back online'));
if('serviceWorker' in navigator&&/^https?:/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
init();
;(window.__p=window.__p||{})['app4']=1;
