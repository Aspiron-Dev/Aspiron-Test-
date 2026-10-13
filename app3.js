function instr(t,s){
  const wait=isWait(t);
  setApp(`<div class="wrap"><div class="ins card"><button class="btn ghost sm" onclick="route()">${ic('back')} Back</button>
  <h1 style="font-size:24px;margin-top:16px">${esc(t.title)}</h1><p class="mut" style="margin:4px 0 0">${esc(s.title||'')}</p>
  <div class="g3"><div><b>${t.questions}</b><span>Questions</span></div><div><b>${t.duration}</b><span>Minutes</span></div><div><b>+${t.correct} / −${t.wrong}</b><span>Marking</span></div></div>
  <h3 style="font-size:15px;margin:6px 0">General instructions</h3>
  <ul>
   <li>${ic('clock')}<span>The countdown timer is shown at the top right. It <b>never pauses</b> – even if you refresh or close the page. The test submits automatically when time ends.</span></li>
   <li>${ic('grid')}<span>The <b>Question Palette</b> shows the status of every question. Use it to jump to any question.</span></li>
   <li><span class="lg-row"><i class="lg nv">1</i> Not visited <i class="lg na">2</i> Not answered <i class="lg ans">3</i> Answered <i class="lg mark">4</i> Marked for review <i class="lg mans">5</i> Answered &amp; marked</span></li>
   <li>${ic('check')}<span><b>Save &amp; Next</b> saves your answer and moves ahead. <b>Mark for Review &amp; Next</b> flags the question to revisit. <b>Clear Response</b> removes your answer.</span></li>
   <li>${ic('star')}<span>Tap <b>★</b> to bookmark a question for later and <b>⚑</b> to report a mistake in a question.</span></li>
   <li>${ic('info')}<span>Correct answer <b>+${t.correct}</b> · Wrong answer <b>−${t.wrong}</b> · Unanswered <b>0</b>.</span></li>
   <li>${ic(t.lock_back?'lock':'info')}<span>${t.lock_back?'<b>You cannot go back</b> to previous questions once you move ahead.':'You can move freely between questions and change answers at any time.'}</span></li>
  </ul>
  <label class="chk decl"><input type="checkbox" id="dc" onchange="$('#sb').disabled=!this.checked||${wait?'true':'false'}"><span class="sm">I have read and understood all the instructions. I am ready to begin the test.</span></label>
  <button class="btn block" id="sb" disabled onclick="startTest('${t.id}')">${wait?`${ic('clock')} Opens in <span data-op="${t.opens_at}">--:--</span>`:`${ic('play')} Start test now`}</button></div></div>`);
}

async function startTest(id){
  loading('Starting your test…');
  const r=await rpc('cbt_start',{p_test:id});
  if(!r.ok){
    if(authErr(r))return;
    if(r.error==='locked'||r.error==='not_found')LS.del(progKey(id));
    if(r.error==='locked'){CAT=null;await route();toast('This test is locked.');return}
    if(r.error==='not_open'){CAT=null;await route();toast('This test opens on '+fmtWhen(r.opens_at));return}
    toast(r.error==='not_found'?'This test is no longer available.':errText(r));CAT=null;route();return;
  }
  T=r.test;const off=r.now-Date.now();SOFF=off;
  let p=getProg(id);
  if(!(p&&p.sid===r.session.id))p={tid:id,sid:r.session.id,cid:uuid(),ans:{},mark:{},vis:{0:1},cur:0,times:{},title:T.title};
  p.times=p.times||{};
  p.ends=r.session.ends_at;p.off=off;
  if(p.cur>=T.questions.length)p.cur=0;
  P=p;saveProg();
  if(P.ends-(Date.now()+P.off)<=0){return finish(true)}
  INTEST=true;warned=false;run();
}
function secSetup(){
  const names=[];T.questions.forEach(q=>{const s=q.sec||'';if(!names.includes(s))names.push(s)});
  SEC={names,has:names.some(x=>x),of:i=>T.questions[i].sec||'',label:s=>s||'General'};
}
let tmark=0,tk=0;
function flushT(){if(!P||!tmark)return;const now=Date.now(),d=Math.min(1800,Math.max(0,Math.round((now-tmark)/100)/10));if(d){P.times=P.times||{};P.times[P.cur]=Math.round(((P.times[P.cur]||0)+d)*10)/10}tmark=now}
document.addEventListener('visibilitychange',()=>{if(!INTEST||!P)return;if(document.hidden){flushT();tmark=0;saveProg()}else tmark=Date.now()});
function run(){
  document.body.classList.add('intest');palOpen=false;secSetup();tmark=Date.now();
  window.onbeforeunload=e=>{e.preventDefault();e.returnValue=''};
  clearInterval(timer);draw();timer=setInterval(tick,1000);tick();
}
function tick(){
  if(!P)return;
  if(++tk%20===0){flushT();saveProg()}
  const left=Math.round((P.ends-(Date.now()+P.off))/1000);
  const e=$('#tm');if(e){e.querySelector('span').textContent=fmt(left);e.classList.toggle('low',left<=300)}
  if(T&&T.duration>10&&left<=300&&left>295&&!warned){warned=true;toast('Only 5 minutes left!')}
  if(left<=0){clearInterval(timer);toast("Time's up! Submitting your test…");finish(true)}
}
const stOf=i=>{const has=P.ans[i]!=null,mk=P.mark[i];return mk?(has?'mans':'mark'):has?'ans':P.vis[i]?'na':'nv'};
function countsOf(idx){
  const c={nv:0,na:0,ans:0,mark:0,mans:0};idx.forEach(i=>c[stOf(i)]++);return c;
}
const allIdx=()=>T.questions.map((_,i)=>i);
const secIdx=name=>allIdx().filter(i=>SEC.of(i)===name);
function counts(){const c=countsOf(allIdx());return{a:c.ans+c.mans,u:T.questions.length-c.ans-c.mans,m:c.mark+c.mans,n:T.questions.length}}
function palHtml(){
  const lock=!!T.lock_back,cur=SEC.of(P.cur),idx=SEC.has?secIdx(cur):allIdx(),c=countsOf(idx);
  return `${SEC.has?`<div class="sm mut" style="margin-bottom:8px"><b style="color:var(--tx)">${esc(SEC.label(cur))}</b></div>`:''}
  <div class="pal">${idx.map(i=>`<button class="${stOf(i)} ${i===P.cur?'cur':''}" ${lock?'disabled':''} onclick="go(${i})">${i+1}</button>`).join('')}</div>
  <div class="leg2"><span><i class="lg ans">${c.ans}</i>Answered</span><span><i class="lg na">${c.na}</i>Not answered</span><span><i class="lg nv">${c.nv}</i>Not visited</span><span><i class="lg mark">${c.mark}</i>Marked</span><span style="grid-column:1/3"><i class="lg mans">${c.mans}</i>Answered &amp; marked (will be evaluated)</span></div>`;
}
function draw(){
  const n=T.questions.length,q=T.questions[P.cur],a=P.ans[P.cur],lock=!!T.lock_back;
  P.vis[P.cur]=1;
  const secTabs=SEC.has?`<div class="stabs">${SEC.names.map(s=>`<button class="${s===SEC.of(P.cur)?'on':''}" ${lock?'disabled':''} onclick="goSec(${JSON.stringify(s).replace(/"/g,'&quot;')})">${esc(SEC.label(s))}</button>`).join('')}</div>`:'';
  $('#app').innerHTML=(`<div class="cbtbar"><div class="tb-l"><div class="tb-title">${esc(T.title)}</div><div class="sm mut cand">${ic('user',13)} ${esc(AUTH.name||'')}</div></div>
   <div class="timer" id="tm">${ic('clock')}<span>--:--</span></div><button class="btn danger sm" onclick="submitAsk()">Submit</button></div>${secTabs}
   <div class="tlayout"><section class="card qcard"><div class="qmeta"><b>Question ${P.cur+1} <span class="mut" style="font-weight:500">of ${n}</span></b><span class="chip ok">+${T.correct}</span><span class="chip warn">−${T.wrong}</span>${P.mark[P.cur]?'<span class="chip pri">Marked</span>':''}<span style="flex:1"></span>${bmBtn(P.tid,P.cur)}${rpBtn(P.tid,P.cur)}</div>
   <div class="qtext">${esc(q.q)}</div>${imgTag(q.img)}
   ${q.options.map((o,i)=>(o||(q.oimg&&q.oimg[i]))?`<button class="opt ${a===i?'sel':''}" onclick="sel(${i})"><span class="k">${L[i]}</span><span class="t">${esc(o)}${imgTag(q.oimg&&q.oimg[i],'oi')}</span></button>`:'').join('')}</section>
   <aside class="side card"><div class="candbox"><div class="avatar" style="width:40px;height:40px;font-size:16px">${esc((AUTH.name||'?').trim()[0].toUpperCase())}</div><div><b>${esc(AUTH.name||'')}</b><div class="sm mut">Candidate</div></div></div>${palHtml()}
   <button class="btn danger block" style="margin-top:14px" onclick="submitAsk()">Submit test</button></aside></div>
   <div class="bbar"><div class="r"><button class="btn warn sm" onclick="markNext()">${ic('flag')} Mark &amp; Next</button><button class="btn ghost sm" onclick="clr()">Clear</button><button class="btn sm" onclick="saveNext()">Save &amp; Next ${ic('right')}</button></div>
   <div class="r nav">${lock?'':`<button class="btn ghost sm" ${P.cur===0?'disabled':''} onclick="go(${P.cur-1})">${ic('left')} Back</button>`}<button class="btn soft sm only-m" onclick="pal(true)">${ic('grid')} Palette</button>${lock?'':`<button class="btn ghost sm" ${P.cur===n-1?'disabled':''} onclick="go(${P.cur+1})">Next ${ic('right')}</button>`}</div></div>
   <div class="sheet ${palOpen?'open':''}" onclick="if(event.target===this)pal(false)"><div class="in"><div class="grab"></div><b>Question palette</b><div style="margin-top:12px">${palHtml()}</div>
   <button class="btn danger block" style="margin-top:14px" onclick="submitAsk()">Submit test</button></div></div>`);
  tick();
}
function pal(v){palOpen=v;const s=document.querySelector('.sheet');if(s)s.classList.toggle('open',v)}
function go(i){if(i<0||i>=T.questions.length)return;flushT();P.cur=i;palOpen=false;saveProg();draw();window.scrollTo(0,0)}
function goSec(name){const idx=secIdx(name);if(!idx.length)return;go(idx.includes(P.cur)?P.cur:idx[0])}
function sel(i){flushT();P.ans[P.cur]=i;if(navigator.vibrate)navigator.vibrate(8);saveProg();draw()}
function clr(){flushT();delete P.ans[P.cur];saveProg();draw()}
function saveNext(){delete P.mark[P.cur];nxt()}
function markNext(){P.mark[P.cur]=1;nxt()}
function nxt(){flushT();if(P.cur<T.questions.length-1)P.cur++;saveProg();draw();window.scrollTo(0,0)}

/* ---------- submitting (answers are marked on the server) ---------- */

const pendKey=()=>'cbt_pend_'+AUTH.mobile;
const getPend=()=>LS.get(pendKey(),[]);
function addPend(it){const l=getPend().filter(x=>x.cid!==it.cid);l.push(it);LS.set(pendKey(),l)}
function delPend(cid){LS.set(pendKey(),getPend().filter(x=>x.cid!==cid))}
function submitAsk(){
  const c=counts();
  const rows=SEC.has?SEC.names.map(s=>{const idx=secIdx(s),k=countsOf(idx);return `<tr><td>${esc(SEC.label(s))}</td><td>${idx.length}</td><td>${k.ans+k.mans}</td><td>${k.na+k.nv}</td><td>${k.mark+k.mans}</td></tr>`}).join(''):'';
  modal(`<h2>Submit test?</h2><p class="mut" style="margin:6px 0 0">You won't be able to change your answers after this.</p>
  ${SEC.has?`<div class="scroll" style="margin-top:12px"><table class="tbl sm"><tr><th>Section</th><th>Total</th><th>Done</th><th>Left</th><th>Marked</th></tr>${rows}</table></div>`
  :`<div class="mgrid"><div><b style="color:var(--ok)">${c.a}</b><span class="sm mut">Answered</span></div><div><b style="color:var(--bad)">${c.u}</b><span class="sm mut">Unanswered</span></div><div><b style="color:var(--pri)">${c.m}</b><span class="sm mut">Marked</span></div></div>`}
  <div class="row" style="margin-top:16px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Keep going</button><button class="btn danger" style="flex:1" onclick="closeModal();finish(false)">Submit</button></div>`);
}
async function finish(auto){
  clearInterval(timer);window.onbeforeunload=null;flushT();
  const it={tid:P.tid,cid:P.cid,ans:P.ans,times:P.times||{},title:(T&&T.title)||P.title,ts:Date.now()};
  addPend(it);LS.del(progKey(P.tid));
  INTEST=false;P=null;T=null;document.body.classList.remove('intest');
  await sendPending(it);
}
let CURPEND=null;
const subAns=it=>Object.assign({},it.ans,{_t:it.times||{}});
async function sendPending(it){
  CURPEND=it;clearTimeout(retryT);loading('Submitting your answers…');
  const r=await rpc('cbt_submit',{p_test:it.tid,p_answers:subAns(it),p_client_id:it.cid});
  if(r.ok){
    delPend(it.cid);CAT=null;INS=null;
    RV={result:r.result,review:r.review,filter:'all',sec:'*',tab:'ov'};
    showResult();lb(r.result);return;
  }
  if(r.error==='network'||r.error==='server'){
    setApp(`<div class="wrap"><div class="card empty">${ic('wifi',32)}<h3 style="margin:10px 0 4px">No connection</h3>
      <p class="sm">Your answers are saved on this phone. We will keep trying to submit them. Please stay on this page.</p>
      <button class="btn" onclick="sendPending(CURPEND)">Try again now</button></div></div>`);
    retryT=setTimeout(()=>sendPending(it),8000);return;
  }
  if(authErr(r))return;
  delPend(it.cid);CAT=null;
  toast(r.error==='no_session'?'This attempt was already closed.':'Could not submit this test.');
  location.hash=RET;route();
}

async function flushPending(){
  if(!AUTH)return;
  // expired local progress -> submit
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('cbt_prog_'+AUTH.mobile+'_')){
        const p=LS.get(k,null);
        if(p&&p.ends&&p.ends<=Date.now()+(p.off||0)){addPend({tid:p.tid,cid:p.cid,ans:p.ans||{},times:p.times||{},title:p.title,ts:Date.now()});LS.del(k)}
      }
    }
  }catch(e){}
  for(const it of getPend()){
    const r=await rpc('cbt_submit',{p_test:it.tid,p_answers:subAns(it),p_client_id:it.cid});
    if(r.ok||['no_session','not_found'].includes(r.error))delPend(it.cid);
    if(r.ok)toast('Your earlier test was submitted.');
  }
}


/* ---------- result / review ---------- */
/* ---------- result / review (v4: tabs, analysis, leaderboard) ---------- */
const fs=t=>{t=Math.round(t||0);return t<60?t+'s':Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s'};
function countUp(root){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  (root||document).querySelectorAll('[data-cu]').forEach(el=>{
    const m=String(el.textContent).match(/^(-?\d+(?:\.\d+)?)(.*)$/);if(!m)return;
    const to=parseFloat(m[1]),suf=m[2],dec=(m[1].split('.')[1]||'').length,t0=performance.now();
    const step=now=>{const k=Math.min(1,(now-t0)/800),e=1-Math.pow(1-k,3);if(k<1){el.textContent=(to*e).toFixed(dec)+suf;requestAnimationFrame(step)}else el.textContent=m[1]+suf};
    requestAnimationFrame(step);
  });
}
async function openReview(id){
  loading('Loading your answers…');
  const r=await rpc('cbt_review',{p_result:id});
  if(!r.ok){if(authErr(r))return;toast('Could not load this result.');route();return}
  if(r.gone){toast('This test is no longer available for review.');route();return}
  if(!CAT)await loadCat(true);
  RV={result:r.result,review:r.review,filter:'all',sec:'*',tab:'ov'};showResult();lb(r.result);
}
async function lb(res){
  const rv=RV;
  if(!res.test_id){rv.lb={ok:false};return}
  const r=await rpc('cbt_leaderboard',{p_test:res.test_id});
  rv.lb=r;if(RV===rv){const el=$('#lb');if(el){el.innerHTML=lbHtml(r);countUp(el)}}
}
const skel=()=>`<div class="card" style="margin-top:12px"><div class="sk" style="width:45%"></div><div class="sk" style="width:100%;height:46px;margin-top:14px"></div><div class="sk" style="width:80%;margin-top:10px"></div></div>`;
function lbHtml(r){
  if(!r||!r.ok||!r.top||!r.top.length)return '';
  const mx=Math.max(1,...(r.dist||[0]));
  const solo=r.total<2;
  const hist=r.dist&&r.dist.length?`<div class="hist">${r.dist.map((n,i)=>`<div class="hb ${r.my_bucket===i?'me':''}"><i style="height:${n?Math.max(10,n/mx*100):3}%"></i><span>${i*10}</span></div>`).join('')}</div><div class="sm mut" style="text-align:center;margin-top:4px">Students by score band (% of max marks) · your band is highlighted</div>`:'';
  return `${r.my_rank?`<div class="card rankc"><div class="rk"><span class="sm">Your rank</span><b data-cu="${r.my_rank}">${r.my_rank}</b><span class="sm">of ${r.total}</span></div>
    <div class="rkr">${solo?`<div class="sm" style="opacity:.9">You are the first to attempt this test. Rank will update as others attempt it.</div>`:`<div><b data-cu="${r.percentile}">${r.percentile}</b><span>Percentile</span></div>`}<div><b>${r.my_score}</b><span>Your best</span></div><div><b>${r.avg}</b><span>Class avg</span></div><div><b>${r.top_score}</b><span>Topper</span></div></div></div>`:''}
   <div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><b>${ic('trophy')} Top ${Math.min(10,r.top.length)}</b><span class="sm mut">Best score per student</span></div>
   ${r.top.map(x=>`<div class="lb ${x.me?'me':''}"><span class="n ${x.rank<=3?'m'+x.rank:''}">${x.rank}</span><span style="flex:1">${esc(x.name)}${x.me?' (you)':''}</span><b>${x.score}</b></div>`).join('')}
   ${r.my_rank&&r.my_rank>10?`<div class="lb me"><span class="n">${r.my_rank}</span><span style="flex:1">You</span><b>${r.my_score}</b></div>`:''}</div>
   ${solo?'':`<div class="card" style="margin-top:12px"><b>Score distribution</b>${hist}</div>`}`;
}
function rAnalyse(){
  const rec=RV.result,Qs=RV.review,ans=rec.answers||{},tm=rec.times||{};
  const all=Qs.map((q,i)=>{const a=ans[i]!=null?+ans[i]:null,t=tm[i]!=null?+tm[i]:null;return{q,i,a,t,st:q.answer==null||a==null?'s':(a===q.answer?'c':'w')}});
  const names=[];Qs.forEach(q=>{const s=q.sec||'';if(!names.includes(s))names.push(s)});
  const cm=Qs.length?rec.max/Qs.length:0,wm=rec.wrong?(rec.correct*cm-rec.score)/rec.wrong:0;
  return{rec,Qs,all,names,cm,wm,hasSec:names.some(x=>x),hasT:all.some(x=>x.t>0)};
}
const avgT=a=>{const v=a.filter(x=>x.t>0);return v.length?v.reduce((s,x)=>s+x.t,0)/v.length:null};
function rvOv(A){
  const {rec,Qs,wm}=A,att=rec.correct+rec.wrong,acc=att?Math.round(rec.correct*100/att):0,p=pct(rec.score,rec.max);
  return `<div class="tiles"><div><b data-cu="${acc}">${acc}%</b><span>Accuracy</span></div><div><b>${att}/${Qs.length}</b><span>Attempted</span></div><div><b>${fmt(rec.used)}</b><span>Time used</span></div>
   <div><b>${Qs.length?fs(rec.used/Qs.length):'–'}</b><span>Avg / question</span></div><div><b style="color:var(--bad)">−${Math.round(rec.wrong*wm*100)/100}</b><span>Negative marks</span></div><div><b data-cu="${p}">${p}%</b><span>Score</span></div></div>
   <div id="lb">${RV.lb?lbHtml(RV.lb):(rec.test_id?skel():'')}</div>`;
}
function rvSub(A){
  const {all,names,cm,wm,hasT}=A;
  const rows=names.map(s=>{const it=all.filter(x=>(x.q.sec||'')===s),c=it.filter(x=>x.st==='c').length,w=it.filter(x=>x.st==='w').length,k=it.length-c-w;
    return{s:s||'General',n:it.length,c,w,k,acc:c+w?Math.round(c*100/(c+w)):0,marks:Math.round((c*cm-w*wm)*100)/100,max:Math.round(it.length*cm*100)/100,t:avgT(it)}});
  const ok=rows.filter(r=>r.c+r.w>0).sort((a,b)=>b.acc-a.acc);
  const tip=ok.length>1?`<div class="card tipc"><div><span class="sm mut">Strongest</span><b>${esc(ok[0].s)}</b><span class="chip ok">${ok[0].acc}%</span></div><div><span class="sm mut">Needs work</span><b>${esc(ok[ok.length-1].s)}</b><span class="chip" style="background:var(--badSoft);color:var(--bad)">${ok[ok.length-1].acc}%</span></div></div>`:'';
  return tip+rows.map(r=>`<div class="card subc"><div class="row" style="justify-content:space-between"><b>${esc(r.s)}</b><span class="chip ${r.acc>=70?'ok':r.acc>=40?'warn':''}">${r.acc}% accuracy</span></div>
   <div class="stk"><i class="c" style="width:${r.n?r.c*100/r.n:0}%"></i><i class="w" style="width:${r.n?r.w*100/r.n:0}%"></i><i class="s" style="width:${r.n?r.k*100/r.n:0}%"></i></div>
   <div class="sm mut"><span style="color:var(--ok)">✓ ${r.c}</span> · <span style="color:var(--bad)">✗ ${r.w}</span> · Skipped ${r.k} · Marks <b style="color:var(--tx)">${r.marks}/${r.max}</b>${hasT&&r.t?` · ${fs(r.t)}/question`:''}</div></div>`).join('');
}
function jumpQ(i){RV.tab='sol';RV.filter='all';RV.sec='*';rRefresh();setTimeout(()=>{const e=document.getElementById('q'+i);if(e){e.scrollIntoView({behavior:'smooth',block:'center'});e.classList.add('flash')}},60)}
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
;(window.__p=window.__p||{})['app3']=1;
