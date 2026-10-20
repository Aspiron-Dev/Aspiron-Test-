function jumpQ(i){RV.tab='sol';RV.filter='all';RV.sec='*';rRefresh();setTimeout(()=>{const e=document.getElementById('q'+i);if(e){e.scrollIntoView({behavior:'instant',block:'start'});e.classList.add('flash')}},60)}
function rvTime(A){
  const {all,rec,hasT}=A;
  if(!hasT)return `<div class="card empty">${ic('clock',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">No time data for this attempt</h3><p class="sm">Question-wise time is recorded for tests you attempt from now on.</p></div>`;
  const mx=Math.max(1,...all.map(x=>x.t||0));
  const tc=avgT(all.filter(x=>x.st==='c')),tw=avgT(all.filter(x=>x.st==='w')),ta=avgT(all);
  const slow=all.filter(x=>x.t>0).sort((a,b)=>b.t-a.t).slice(0,5);
  let msg='Your time is spread evenly across questions.';
  if(tc&&tw&&tw>tc*1.3)msg='You spend more time on questions you get wrong. Skip hard ones early and return to them at the end.';
  else if(tc&&tw&&tw<tc*.7)msg='You answer wrong questions faster than correct ones. Slow down and double-check before moving on.';
  const lab={c:'Correct',w:'Wrong',s:'Skipped'};
  return `<div class="tiles"><div><b>${ta?fs(ta):'–'}</b><span>Avg / question</span></div><div><b style="color:var(--ok)">${tc?fs(tc):'–'}</b><span>On correct</span></div><div><b style="color:var(--bad)">${tw?fs(tw):'–'}</b><span>On wrong</span></div></div>
   <div class="card" style="margin-top:12px"><b>Time per question</b><div class="sm mut">Tap a bar to open that question</div>
   <div class="scroll"><div class="tchart" style="min-width:${Math.max(100,all.length*20)}px">${all.map(x=>`<button class="tb ${x.st}" onclick="jumpQ(${x.i})" aria-label="Q${x.i+1} ${fs(x.t)}"><i style="height:${x.t?Math.max(4,x.t/mx*100):2}%"></i><span>${x.i+1}</span></button>`).join('')}</div></div>
   <div class="row sm" style="gap:12px;margin-top:6px"><span class="dot c"></span>Correct <span class="dot w"></span>Wrong <span class="dot s"></span>Skipped</div></div>
   <div class="card tipc1" style="margin-top:12px">${ic('info',18)}<span>${msg}</span></div>
   <div class="h2s" style="font-size:16px">${ic('clock',18)} Slowest questions</div><div class="card">${slow.map(x=>`<div class="lb" onclick="jumpQ(${x.i})" style="cursor:pointer"><span class="n">${x.i+1}</span><span style="flex:1">${esc((x.q.q||'').slice(0,46))}${(x.q.q||'').length>46?'…':''}</span><span class="chip ${x.st==='c'?'ok':''}">${lab[x.st]}</span><b>${fs(x.t)}</b></div>`).join('')}</div>`;
}
function rvSol(A){
  const {all,names,hasSec}=A,f=RV.filter,sf=RV.sec||'*',tid=A.rec.test_id;
  const items=all.filter(x=>(f==='all'||x.st===f)&&(!hasSec||sf==='*'||(x.q.sec||'')===sf));
  const fb=(k,t)=>`<button class="${f===k?'on':''}" onclick="setFilter('${k}')">${t}</button>`;
  const sb=(k,t)=>`<button class="${sf===k?'on':''}" onclick="setSecF(${JSON.stringify(k).replace(/"/g,'&quot;')})">${esc(t)}</button>`;
  return `<div class="seg" style="width:100%;display:flex;margin-bottom:12px">${fb('all','All')}${fb('c','Correct')}${fb('w','Wrong')}${fb('s','Skipped')}</div>
   ${hasSec?`<div class="seg" style="margin-bottom:12px">${sb('*','All sections')}${names.map(s=>sb(s,s||'General')).join('')}</div>`:''}
   ${items.map(({q,i,a,t,st})=>`<div class="card rv qx" id="q${i}"><div class="qxh"><span class="qno">Q${i+1}</span>${st==='c'?'<span class="chip ok">Correct</span>':st==='w'?'<span class="chip bad">Wrong</span>':'<span class="chip">Skipped</span>'}<span style="flex:1"></span>${tid?bmBtn(tid,i)+rpBtn(tid,i):''}</div>
    ${q.sec||t>0?`<div class="qsrc">${q.sec?`<b>${esc(q.sec)}</b>`:''}${q.sec&&t>0?' · ':''}${t>0?`${ic('clock',13)} ${fs(t)}`:''}</div>`:''}
    <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
    ${q.options.map((o,j)=>{if(!o&&!(q.oimg&&q.oimg[j]))return '';const isC=j===q.answer,isY=j===a;return `<div class="ro ${isC?'c':(isY?'w':'')}"><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}${imgTag(q.oimg&&q.oimg[j],'oi')}${isC||isY?`<span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${isC?'<span class="tag g" style="margin:0">Correct answer</span>':''}${isY&&!isC?'<span class="tag r" style="margin:0">Your answer</span>':''}${isY&&isC?'<span class="tag g" style="margin:0">Your answer</span>':''}</span>`:''}</span></div>`}).join('')}
    ${q.answer==null?'<div class="sm mut" style="margin-top:6px">No answer key was set for this question, so it is not marked.</div>':''}
    ${q.explanation||q.eimg?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''}</div>`).join('')||'<div class="card empty">Nothing to show here.</div>'}
   <div style="text-align:center;margin-top:8px"><button class="btn" onclick="doneResult()">Back to tests</button></div>`;
}
function rBody(){const A=rAnalyse();return RV.tab==='his'?rvHis(A):RV.tab==='sub'?rvSub(A):RV.tab==='time'?rvTime(A):RV.tab==='sol'?rvSol(A):rvOv(A)}
// a tab animates (bars, count-up) only the first time it is opened; later visits and filters just fade in
function rRefresh(){const b=$('#rbody');if(!b)return;const s=RV.seen=RV.seen||{},again=!!s[RV.tab];s[RV.tab]=1;b.classList.toggle('again',again);b.innerHTML=rBody();document.querySelectorAll('#rtabs button').forEach(x=>x.classList.toggle('on',x.dataset.t===RV.tab));if(!again)countUp(b)}
// when the tabs are stuck at the top, start the new content right below them (no jump to the middle of it)
function rAlign(){const s=$('.rtabs'),b=$('#rbody');if(!s||!b)return;const d=b.getBoundingClientRect().top-s.getBoundingClientRect().bottom;if(d<0)window.scrollBy({top:d,behavior:'instant'})}
function rTab(t){if(!RV)return;RV.tab=t;rRefresh();rAlign()}
function setFilter(f){if(!RV)return;RV.filter=f;rRefresh();rAlign()}
function setSecF(s){if(!RV)return;RV.sec=s;rRefresh();rAlign()}
function doneResult(){RV=null;const h=RET&&RET!=='#/'?RET:'#/r';history.replaceState(null,'',h);if(NAVRK(h)===LASTRK)PGDX=-1;route()}
function showResult(){
  document.body.classList.remove('intest');
  RV.tab=RV.tab||'ov';RV.seen={[RV.tab]:1};
  const A=rAnalyse(),rec=A.rec,p=pct(rec.score,rec.max),col=ringCol(p);
  const tb=(k,t)=>`<button data-t="${k}" class="${RV.tab===k?'on':''}" onclick="rTab('${k}')">${t}</button>`;
  setApp(`<div class="wrap"><div class="row" style="margin-bottom:12px"><button class="btn ghost sm" onclick="doneResult()">${ic('back')} Back</button><span class="mut sm" style="flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(rec.title)}</span></div>
   <div class="card rhero">
   <div class="ring">${ring(p,150,12,col)}<div class="c"><div><b data-cu="${rec.score}">${rec.score}</b><span class="sm mut">out of ${rec.max}</span></div></div></div>
   <h2>${p>=75?'Excellent work! 🎉':p>=50?'Good effort 👍':'Keep practising 💪'}</h2><div class="mut sm" style="margin-top:4px">${p}%${rec.late?' · Submitted late':''}</div>
   <div class="s4"><div><b style="color:var(--ok)">${rec.correct}</b><span>Correct</span></div><div><b style="color:var(--bad)">${rec.wrong}</b><span>Wrong</span></div><div><b>${rec.skipped}</b><span>Skipped</span></div><div><b>${A.Qs.length}</b><span>Total</span></div></div></div>
   <div class="rtabs"><div class="seg" id="rtabs">${tb('ov','Overview')}${A.hasSec?tb('sub','Subjects'):''}${tb('time','Time')}${tb('sol','Solutions')}${tb('his','History')}</div></div>
   <div id="rbody">${rBody()}</div></div>`);
}


/* ---------- boot ---------- */
async function init(){
  updateTheme();updateHeader();
  if(getComputedStyle(document.documentElement).getPropertyValue('--cssv').trim()!=='5'){const b=document.createElement('div');b.className='cssbanner';b.textContent='Design is not fully updated. Please upload the new style.css to GitHub, then refresh.';b.style.cssText='position:fixed;left:12px;right:12px;top:12px;z-index:99;background:#c9780a;color:#fff;border-radius:14px;padding:12px 14px;font-weight:600';document.body.appendChild(b)}
  if(!cloud)return login();
  if(!AUTH)return login();
  skelPage();
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
let T0=Date.now();
function hideSplash(){const e=document.getElementById('splash');if(!e||e.classList.contains('off'))return;setTimeout(()=>{e.classList.add('off');setTimeout(()=>e.remove(),350)},Math.max(0,300-(Date.now()-T0)))}
setTimeout(hideSplash,5000);
function skelPage(){
  setApp(`<div class="wrap skpage"><div class="sk skhero"></div><div class="skrow"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
  ${[1,2,3].map(()=>`<div class="card"><div class="sk" style="width:55%"></div><div class="sk" style="width:90%;margin-top:12px"></div><div class="sk" style="width:70%;margin-top:10px"></div></div>`).join('')}</div>`);
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
let MKC=null;
let PREF=0;
function prefetchTabs(){
  if(PREF||!AUTH)return;PREF=1;
  const go=async()=>{
    if(!AUTH||INTEST)return;
    if(!MKC){const r=await rpc('cbt_mistakes',{p_offset:0,p_limit:15,p_kind:'all',p_sec:''});if(r.ok&&!MKC){r.items.forEach(x=>{x._n=++MKN});MKC={kind:'all',sec:'',items:r.items,st:{},more:r.more,counts:r.counts}}}
    if(!BMC){const r=await rpc('cbt_bookmarks',{});if(r.ok&&!BMC)BMC=r}
  };
  setTimeout(()=>(window.requestIdleCallback||setTimeout)(go),1200);
}
const mkFresh=()=>({kind:'all',sec:'',items:[],st:{},more:false,counts:null});
const mkSig=x=>JSON.stringify([x.items.map(i=>i.test_id+':'+i.qidx),x.counts]);
async function viewMistakes(){
  if(!MKC){
    skelPage();MK=mkFresh();if(!(await mkFetch(0)))return;
    MKC=JSON.parse(JSON.stringify(MK));
    if(location.hash==='#/m'&&!INTEST){SOFT=1;try{mkRender()}finally{SOFT=0}}
    return;
  }
  MK=JSON.parse(JSON.stringify(MKC));mkRender();
  const r=await rpc('cbt_mistakes',{p_offset:0,p_limit:15,p_kind:'all',p_sec:''});
  if(!r.ok||mkSig(r)===mkSig(MKC))return;
  r.items.forEach(x=>{x._n=++MKN});
  MKC={kind:'all',sec:'',items:r.items,st:{},more:r.more,counts:r.counts};
  if(location.hash!=='#/m'||INTEST||MK.kind!=='all'||MK.sec!==''||Object.keys(MK.st).length||MK.items.length>15)return;
  MK=JSON.parse(JSON.stringify(MKC));SOFT=1;try{mkRender()}finally{SOFT=0}
}
async function mkFetch(off){
  const M=MK,k=M.kind,s=M.sec,r=await rpc('cbt_mistakes',{p_offset:off,p_limit:15,p_kind:k,p_sec:s});
  if(MK!==M||M.kind!==k||M.sec!==s||off&&off!==M.items.length)return false;   // a newer filter / page was asked meanwhile
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
  MKC=null;
  const it=mkGet(n);if(!it)return;
  const e=document.getElementById('mk'+n);if(e){if(e.classList.contains('out'))return;e.classList.add('out')}
  const r=await rpc('cbt_mistake_done',{p_test:it.test_id,p_qidx:it.qidx,p_on:true});
  if(!r.ok){if(e)e.classList.remove('out');toast('Could not save. Try again.');return}
  INS=null;MK.items=MK.items.filter(x=>x._n!==n);
  const c=MK.counts;c[it.kind]=Math.max(0,c[it.kind]-1);c.mastered++;
  const s=c.secs.find(x=>x.sec===it.sec);if(s)s.n--;
  if(e){e.style.maxHeight=e.offsetHeight+'px';void e.offsetHeight;e.classList.add('gone')}   // collapse, the cards below slide up
  setTimeout(()=>{const h=$('#mkh');if(h){h.classList.add('re');h.innerHTML=mkHead()}const l=$('#mklist');if(e)e.remove();if(l&&(!e||!l.querySelector('.mkc')))l.innerHTML=mkList();toast('Marked as mastered ✓')},300);
}
// filters: mark the tapped chip and dim the list at once, then swap only the head + list (page keeps its scroll)
const mkOn=(sel,cls,f)=>document.querySelectorAll(sel).forEach(b=>b.classList.toggle(cls,b.getAttribute('onclick')===f));
function mkPaint(){const h=$('#mkh'),l=$('#mklist');if(!h||!l)return mkRender();h.classList.add('re');h.innerHTML=mkHead();l.classList.remove('ld');l.innerHTML=mkList()}
async function mkKind(k){MK.kind=k;MK.st={};mkOn('#mkh .seg button','on',`mkKind('${k}')`);const l=$('#mklist');if(l)l.classList.add('ld');if(await mkFetch(0))mkPaint()}
async function mkSec(s){MK.sec=s;MK.st={};mkOn('#mkh .chiprow .chip','pri','mkSec('+JSON.stringify(s)+')');const l=$('#mklist');if(l)l.classList.add('ld');if(await mkFetch(0))mkPaint()}
async function mkMore(b){if(b){if(b.disabled)return;b.disabled=true;b.textContent='Loading…'}if(await mkFetch(MK.items.length)){const l=$('#mklist');if(l)l.innerHTML=mkList()}else if(b){b.disabled=false;b.textContent='Load more'}}
/* announcement banner */
IC.mega='<path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 6a9 9 0 010 12"/>';
IC.bell='<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>';
let ANN=null,ANNT=0;const ANNIMG={};
async function annLoad(force){
  if(!AUTH)return ANN;
  if(!force&&ANN&&Date.now()-ANNT<60000){bellUpdate();return ANN}
  const r=await rpc('cbt_notice',{});
  if(r.ok){ANN=r.items||(r.on&&r.text?[{id:'x',title:'',text:r.text,at:r.at}]:[]);ANNT=Date.now()}
  bellUpdate();return ANN;
}
const annUnseen=()=>{const s=LS.get('cbt_ann_seen',0);return (ANN||[]).filter(x=>x.at>s).length};
function bellUpdate(){
  const b=$('#bell');if(!b)return;
  b.style.display=AUTH?'':'none';
  if(!b.firstChild)b.innerHTML=ic('bell',20);
  const n=annUnseen();let d=b.querySelector('.bdot');
  if(n){if(!d){d=document.createElement('i');d.className='bdot';b.appendChild(d)}d.textContent=n>9?'9+':n}else if(d)d.remove();
}
const linkify=t=>esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'';
function annCard(x){
  const u=safeUrl(x.link);
  return `<div class="annc"><div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><b>${esc(x.title||'Announcement')}</b><span class="sm mut" style="white-space:nowrap">${new Date(x.at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div>
   ${x.text?`<div class="annb">${linkify(x.text)}</div>`:''}${x.img?`<div class="annimg" data-ai="${x.id}"><div class="sk" style="height:140px;border-radius:12px"></div></div>`:''}
   ${u?`<a class="btn soft sm" style="margin-top:10px;text-decoration:none" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(x.label||'Open link')} ↗</a>`:''}</div>`;
}
async function openAnn(){
  modal(`<h2>Announcements</h2><div class="sk" style="height:60px;margin-top:14px;border-radius:12px"></div>`);
  const l=await annLoad(true)||[];
  if(l.length)LS.set('cbt_ann_seen',Math.max(...l.map(x=>x.at)));
  bellUpdate();
  modal(`<div class="row" style="justify-content:space-between"><h2>${ic('bell',20)} Announcements</h2><button class="iconbtn sm" onclick="closeModal()" aria-label="Close">${ic('x',16)}</button></div>
   ${l.length?l.map(annCard).join(''):`<div class="empty" style="padding:28px 8px;text-align:center;color:var(--mut)">No announcements yet.</div>`}`);
  l.filter(x=>x.img).forEach(async x=>{
    let im=ANNIMG[x.id];
    if(!im){const r=await rpc('cbt_notice_img',{p_id:x.id});im=r.ok?r.image:null;if(im)ANNIMG[x.id]=im}
    const el=document.querySelector(`[data-ai="${x.id}"]`);if(!el)return;
    el.innerHTML=im?`<img class="qi zm" src="${im}" alt="" style="margin-top:10px;border-radius:12px">`:'';
  });
}
;(window.__p=window.__p||{})['app4']=1;
