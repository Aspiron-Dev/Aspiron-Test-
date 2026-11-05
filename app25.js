/* app25: Question bank (#/qb, unlimited practice) and Test generator (#/gen: make, schedule and take your own tests).
   Server: supabase_v55_qbank.sql. Practice questions come without answers; the answer and explanation come from the
   server only after an option is picked (cbt_qb_check). A generated test is picked, timed and marked on the server.
   Before that SQL is run, the pages say "coming soon" and nothing else changes. */
IC.bank='<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>';
IC.wand='<path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10"/><path d="M19 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>';
IC.check='<path d="M5 12l5 5 9-10"/>';
IC.trash='<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';

const QB={meta:null,metaAt:0,f:null,run:null,list:null,listAt:0,now:0,off:0,form:null,R:null,rf:'all'};
const QB_LV=[['easy','Easy'],['medium','Medium'],['hard','Hard']];
const QB_TY=[['mcq','Multiple choice'],['statement','Statement based'],['match','Match the following'],['fill','Fill in the blanks'],['assertion','Assertion & reason']];
const QB_SR=[['ncert','NCERT based'],['pyq','Previous year (PYQ)'],['extra','Extra · out of NCERT']];
const QB_SUB={phy:'Physics',chem:'Chemistry',bio:'Biology',math:'Mathematics'};
const qbUid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(s||''));
const qbSub=s=>QB_SUB[s]||(s?String(s).replace(/\b\w/g,c=>c.toUpperCase()):'General');
const qbSyl=()=>{try{return window.qbSubjects?qbSubjects():PYQ_SYL.NEET.subjects}catch(e){return []}};
const qbChapObj=(s,c)=>{const sb=qbSyl().find(x=>x.id===s);return sb&&sb.chapters.find(x=>x.id===c)};
function qbChap(s,c){if(!c)return 'Other';const ch=qbChapObj(s,c);return ch?ch.name:c}
function qbChapCls(s,c){const ch=qbChapObj(s,c);return ch?ch.cls:99}
const qbLbl=(L,k)=>(L.find(x=>x[0]===k)||[k,k])[1];
const qbEmptyF=()=>({ex:'',s:[],c:[],t:[],l:[],y:[],o:[]});
/* NEET → Physics, Chemistry, Biology; JEE → Physics, Chemistry, Maths (first from the student's profile) */
function qbExamDef(){
  try{const p=typeof pfGet==='function'?pfGet():{};if(p.exam==='JEE'||p.exam==='NEET')return p.exam}catch(e){}
  try{const t=AUTH&&LS.get('cbt_tsf_'+AUTH.mobile,null);if(t&&t.ex==='jee')return 'JEE';if(t&&t.ex==='neet')return 'NEET'}catch(e){}
  return 'NEET';
}
const qbExSubs=F=>(window.QB_EXAMS&&QB_EXAMS[F.ex])||['phy','chem','bio'];
/* the filter actually used: no subject chosen = every subject of the exam */
function qbEff(F){const e={s:F.s.length?F.s.slice():qbExSubs(F),c:F.c.slice(),t:F.t.slice(),l:F.l.slice(),y:F.y.slice(),o:F.o.slice()};return e}
function qbErr(r){
  if(r&&r.error==='busy')return 'You have practised a lot this hour. Take a short break and continue in a few minutes.';
  if(r&&r.error==='too_many')return 'You already have 30 tests waiting. Take or delete some of them first.';
  if(r&&r.error==='empty')return 'No questions match your choice. Choose more chapters, levels or types.';
  if(r&&r.error==='bad_time')return 'Choose a time within the next 6 months.';
  if(r&&r.error==='not_open')return 'This test opens on '+qbWhen(r.at)+'.';
  if(r&&r.error==='running')return 'This test is running. Finish it first.';
  return typeof errText==='function'?errText(r):'Something went wrong.';
}
const qbMissing=r=>r&&r.ok===false&&r.error==='server'&&(r.status===404||r.status===400);
function qbSoon(title){
  setApp(`<div class="wrap qb"><div class="crumb"><a href="#/">${ic('left',16)} Home</a></div><div class="card empty">${ic('bank',30)}<h3 style="margin:10px 0 4px">${esc(title)} — coming soon</h3><p class="sm mut">This part is being set up. Please check again later.</p></div></div>`);
}

/* ---------- what is in the bank ---------- */
async function qbMeta(force){
  if(QB.meta&&!force&&Date.now()-QB.metaAt<120000)return QB.meta;
  const r=await rpc('cbt_qb_meta',{});
  if(authErr(r))return null;
  if(!r||!r.ok)return r||{ok:false};
  QB.meta={ok:true,rows:(r.rows||[]).map(x=>({s:x[0],c:x[1],t:x[2],l:x[3],y:x[4],o:x[5],n:+x[6]||0})),mine:r.mine||[]};QB.metaAt=Date.now();
  return QB.meta;
}
const qbHas=(a,v)=>!a||!a.length||a.includes(v);
function qbCount(rows,f,skip){
  let n=0;for(const r of rows){if((skip==='s'||qbHas(f.s,r.s))&&(skip==='c'||qbHas(f.c,r.c))&&(skip==='t'||qbHas(f.t,r.t))&&(skip==='l'||qbHas(f.l,r.l))&&(skip==='y'||qbHas(f.y,r.y))&&(skip==='o'||qbHas(f.o,r.o)))n+=r.n}
  return n;
}
function qbGroup(rows,f,key,skip){const m={};rows.forEach(r=>{if(skip&&!skip(r))return;const k=r[key];m[k]=(m[k]||0)+r.n});return m}

/* filter builder: the same for practice and the test generator. Exam switch, subject chips, then drop-downs
   (Chapters, Topics, Level, Question type, Source) — tap to open, tick as many as you like. */
let QBF=null,QBFON=null,QBDD='',QBQ='';
function qbDdHead(key,title,sum,n){
  return `<button type="button" class="qbddh ${QBDD===key?'on':''}" data-dd="${key}"><span class="grow"><b>${title}</b><small>${esc(sum)}</small></span>${n?`<span class="qbddn">${n}</span>`:''}<span class="qbchev ${QBDD===key?'on':''}">${ic(typeof IC.chevd==='string'?'chevd':'down',18)}</span></button>`;
}
function qbOpt(g,k,label,n,on,sub){
  return `<label class="qbopt ${on?'on':''}" data-q="${esc(String(label).toLowerCase())}"><input type="checkbox" data-g="${g}" data-k="${esc(k)}" ${on?'checked':''}><span class="qbbox">${ic('check',13)}</span><span class="grow">${esc(label)}${sub?`<small>${esc(sub)}</small>`:''}</span>${n!=null?`<i class="${n?'':'z'}">${n}</i>`:''}</label>`;
}
function qbFilterHtml(F){
  const rows=QB.meta.rows,E=qbEff(F),subs=qbExSubs(F);
  const cnt=(skip,extra)=>{const f=Object.assign({},E,extra);return qbCount(rows,f,skip)};
  const sumOf=(A,L)=>!A.length?'All':A.map(k=>qbLbl(L,k)).join(', ');
  // subjects of the exam
  const subHtml=subs.map(k=>{const on=F.s.includes(k),n=cnt(null,{s:[k],c:[],t:[]});return `<button type="button" class="qbc ${on?'on':''}" data-g="s" data-k="${k}">${on?ic('check',13):''}${esc(qbSub(k))}<i>${n}</i></button>`}).join('');
  // chapters: every chapter of the syllabus of the chosen subjects (or of the exam)
  const chS=E.s,chRows=[];
  chS.forEach(s=>{const sb=qbSyl().find(x=>x.id===s);if(!sb)return;
    [11,12].forEach(cl=>{const L=sb.chapters.filter(c=>c.cls===cl&&!c.old);if(!L.length)return;
      chRows.push(`<div class="qbgh">${esc(qbSub(s))} · Class ${cl}</div>`);
      L.forEach(c=>chRows.push(qbOpt('c',c.id,c.name,cnt(null,{c:[c.id],s:[s],t:[]}),F.c.includes(c.id))))})});
  const chSum=F.c.length?`${F.c.length} chapter${F.c.length>1?'s':''} chosen`:'All chapters';
  const chChips=F.c.length?`<div class="qbpick">${F.c.map(c=>{const s=(qbSyl().find(x=>x.chapters.some(y=>y.id===c))||{}).id;return `<button type="button" class="qbx" data-g="c" data-k="${esc(c)}">${esc(qbChap(s,c))} ${ic('x',12)}</button>`}).join('')}<button type="button" class="qbx clr" data-clr="c">Clear all</button></div>`:'';
  // topics of the chosen chapters
  let tpBlock='';
  if(F.c.length){
    const tR=[];F.c.forEach(c=>{const s=(qbSyl().find(x=>x.chapters.some(y=>y.id===c))||{}).id;const ch=qbChapObj(s,c);if(!ch||!ch.topics.length)return;
      tR.push(`<div class="qbgh">${esc(ch.name)}</div>`);ch.topics.forEach(t=>tR.push(qbOpt('t',t.name,t.name,cnt(null,{t:[t.name]}),F.t.includes(t.name))))});
    if(tR.length)tpBlock=`<div class="qbdd">${qbDdHead('t','Topics',F.t.length?F.t.join(', '):'All topics of these chapters',F.t.length)}${QBDD==='t'?`<div class="qbddb">${qbAllClr('t')}${tR.join('')}</div>`:''}</div>`;
  }
  const simple=(key,title,L)=>`<div class="qbdd">${qbDdHead(key,title,sumOf(F[key],L),F[key].length)}${QBDD===key?`<div class="qbddb">${qbAllClr(key)}${L.map(([k,l])=>qbOpt(key,k,l,cnt(null,{[key]:[k]}),F[key].includes(k))).join('')}</div>`:''}</div>`;
  return `<div class="qbexr"><span class="qbl" style="margin:0">Exam</span><div class="seg qbex">${['NEET','JEE'].map(x=>`<button type="button" data-ex="${x}" class="${F.ex===x?'on':''}">${x}</button>`).join('')}</div></div>
   <div class="qbl">Subjects <span class="mut sm">— tap one or more to mix · none = all</span></div>
   <div class="qbcs">${subHtml}</div>
   <div class="qbdds">
    <div class="qbdd">${qbDdHead('c','Chapters',chSum,F.c.length)}${QBDD==='c'?`<div class="qbddb"><input type="search" class="qbsrch" placeholder="Search chapters…" value="${esc(QBQ)}">${qbAllClr('c')}${chRows.join('')||'<p class="sm mut">Choose a subject first.</p>'}</div>`:chChips}</div>
    ${tpBlock}
    ${simple('l','Level',QB_LV)}
    ${simple('y','Question type',QB_TY)}
    ${simple('o','Source',QB_SR)}
   </div>`;
}
const qbAllClr=g=>`<div class="qbac"><button type="button" data-all="${g}">Select all</button><button type="button" data-clr="${g}">Clear</button><span class="grow"></span><button type="button" class="qbdone" data-dd="">Done</button></div>`;
function qbAllOf(g){
  const F=QBF;
  if(g==='l')return QB_LV.map(x=>x[0]);if(g==='y')return QB_TY.map(x=>x[0]);if(g==='o')return QB_SR.map(x=>x[0]);
  if(g==='c'){const q=QBQ.toLowerCase();const out=[];qbEff(F).s.forEach(s=>{const sb=qbSyl().find(x=>x.id===s);if(sb)sb.chapters.forEach(c=>{if(!c.old&&(!q||c.name.toLowerCase().includes(q)))out.push(c.id)})});return out}
  if(g==='t'){const out=[];F.c.forEach(c=>{const s=(qbSyl().find(x=>x.chapters.some(y=>y.id===c))||{}).id,ch=qbChapObj(s,c);if(ch)ch.topics.forEach(t=>out.push(t.name))});return out}
  return [];
}
function qbFilterDraw(el){
  const b=el.querySelector('.qbddb'),st=b?b.scrollTop:0;
  el.innerHTML=qbFilterHtml(QBF);
  const b2=el.querySelector('.qbddb');if(b2)b2.scrollTop=st;
  const sr=el.querySelector('.qbsrch');if(sr)qbSearch(el,sr.value);
}
function qbSearch(el,v){
  QBQ=v;const q=v.trim().toLowerCase();
  el.querySelectorAll('.qbddb .qbopt').forEach(o=>{o.style.display=!q||o.dataset.q.includes(q)?'':'none'});
  el.querySelectorAll('.qbddb .qbgh').forEach(h=>{let n=h.nextElementSibling,any=false;while(n&&n.classList.contains('qbopt')){if(n.style.display!=='none')any=true;n=n.nextElementSibling}h.style.display=any?'':'none'});
}
function qbTidy(){   // drop chapters / topics that no longer belong to the chosen subjects / chapters
  const F=QBF,subs=qbEff(F).s;
  F.s=F.s.filter(s=>qbExSubs(F).includes(s));
  F.c=F.c.filter(c=>subs.some(s=>{const sb=qbSyl().find(x=>x.id===s);return sb&&sb.chapters.some(y=>y.id===c)}));
  const tps=new Set(qbAllOf('t'));F.t=F.t.filter(t=>tps.has(t));
}
function qbFilterMount(id,F,onChange){
  QBF=F;QBFON=onChange;
  if(!F.ex)F.ex=qbExamDef();
  qbTidy();
  const el=document.getElementById(id);if(!el)return;
  qbFilterDraw(el);
  if(el.__w)return;el.__w=1;
  const changed=()=>{qbTidy();qbFilterDraw(el);QBFON&&QBFON()};
  el.addEventListener('input',e=>{if(e.target.classList.contains('qbsrch'))qbSearch(el,e.target.value)});
  el.addEventListener('change',e=>{
    const c=e.target.closest('input[type=checkbox][data-g]');if(!c)return;
    const A=QBF[c.dataset.g],k=c.dataset.k,i=A.indexOf(k);
    if(c.checked&&i<0)A.push(k);else if(!c.checked&&i>=0)A.splice(i,1);
    changed();
  });
  el.addEventListener('click',e=>{
    const t=e.target;
    const ex=t.closest('[data-ex]');if(ex){if(QBF.ex!==ex.dataset.ex){QBF.ex=ex.dataset.ex;QBF.s=[];QBF.c=[];QBF.t=[];QBQ=''}changed();return}
    const dd=t.closest('[data-dd]');if(dd){const k=dd.dataset.dd;QBDD=QBDD===k||!k?'':k;QBQ='';qbFilterDraw(el);if(QBDD){const h=el.querySelector('.qbddh.on');if(h&&h.scrollIntoView)h.scrollIntoView({block:'nearest',behavior:'smooth'})}return}
    const al=t.closest('[data-all]');if(al){const g=al.dataset.all;QBF[g]=[...new Set(QBF[g].concat(qbAllOf(g)))];changed();return}
    const cl=t.closest('[data-clr]');if(cl){const g=cl.dataset.clr;if(g==='c'&&QBQ){const drop=new Set(qbAllOf('c'));QBF.c=QBF.c.filter(x=>!drop.has(x))}else QBF[g]=[];changed();return}
    const x=t.closest('.qbx[data-g]');if(x){const A=QBF[x.dataset.g],i=A.indexOf(x.dataset.k);if(i>=0)A.splice(i,1);changed();return}
    const b=t.closest('.qbc[data-g]');if(b){const A=QBF[b.dataset.g],i=A.indexOf(b.dataset.k);if(i>=0)A.splice(i,1);else A.push(b.dataset.k);changed();return}
  });
}

/* ---------- Question bank home + practice setup ---------- */
async function qbHome(){
  setApp(`<div class="wrap qb"><div class="card"><div class="sk" style="height:180px"></div></div></div>`);
  const M=await qbMeta();
  if(location.hash!=='#/qb')return;
  if(!M)return;
  if(!M.ok){if(qbMissing(M))return qbSoon('Question bank');return setApp(`<div class="wrap"><div class="card empty">${ic('wifi',30)}<h3 style="margin:10px 0 4px">Could not load</h3><p class="sm">${esc(qbErr(M))}</p><button class="btn" onclick="route()">Try again</button></div></div>`)}
  QB.f=QB.f||Object.assign(qbEmptyF(),LS.get('cbt_qb_f',{}));
  ['s','c','t','l','y','o'].forEach(k=>{if(!Array.isArray(QB.f[k]))QB.f[k]=[]});if(QB.f.ex!=='NEET'&&QB.f.ex!=='JEE')QB.f.ex='';
  const total=M.rows.reduce((a,r)=>a+r.n,0);
  const done=M.mine.reduce((a,r)=>a+(+r[2]||0),0),right=M.mine.reduce((a,r)=>a+(+r[3]||0),0);
  const mineS={};M.mine.forEach(r=>{const o=mineS[r[0]]=mineS[r[0]]||{n:0,r:0};o.n+=+r[2]||0;o.r+=+r[3]||0});
  if(!total)return setApp(`<div class="wrap qb"><div class="crumb"><a href="#/">${ic('left',16)} Home</a></div><div class="card empty">${ic('bank',30)}<h3 style="margin:10px 0 4px">Question bank</h3><p class="sm mut">Questions are being added. Please check again soon.</p></div></div>`);
  setApp(`<div class="wrap qb">
   <div class="crumb"><a href="#/">${ic('left',16)} Home</a></div>
   <div class="card qbhero"><span class="qbi">${ic('bank',24)}</span><div class="grow"><h2>Question bank</h2><p class="sm mut">${total.toLocaleString('en-IN')} questions · practise as much as you like. Every answer shows the right option and the explanation.</p></div></div>
   <div class="stats qbst"><div class="stat"><b>${done}</b><span>Practised</span></div><div class="stat"><b>${done?Math.round(right/done*100):0}%</b><span>Accuracy</span></div><div class="stat"><b>${Math.max(0,total-done)}</b><span>Not tried yet</span></div></div>
   <div class="h2s">Subjects</div>
   <div class="qbsubs" id="qbSubs"></div>
   <div class="h2s">Choose what to practise</div>
   <div class="card"><div id="qbF"></div>
    <div class="qbgo"><div class="grow"><b id="qbN">0</b> <span class="sm mut">questions match</span></div><button class="btn ghost sm" onclick="qbReset()">Clear</button><button class="btn" id="qbStart" onclick="qbStart()">${ic('play',16)} Start practice</button></div></div>
   <div class="card qbgenad" onclick="location.hash='#/gen'" role="button"><span class="qbi sm">${ic('wand',20)}</span><div class="grow"><b>Make your own test</b><div class="sm mut">Choose chapters, number of questions, level and time — and schedule it.</div></div>${ic('right',18)}</div>
  </div>`);
  QB.mineS=mineS;
  document.getElementById('qbSubs').onclick=e=>{const b=e.target.closest('.qbsub');if(!b)return;QB.f.s=[b.dataset.s];QB.f.c=[];QB.f.t=[];QBDD='c';qbFilterMount('qbF',QB.f,qbUpd);qbUpd();document.getElementById('qbF').scrollIntoView({behavior:'smooth',block:'start'})};
  qbFilterMount('qbF',QB.f,qbUpd);qbUpd();
}
function qbSubCards(){
  const el=document.getElementById('qbSubs');if(!el||!QB.meta)return;
  const subs=qbGroup(QB.meta.rows,{},'s'),M=QB.mineS||{};
  el.innerHTML=qbExSubs(QB.f).map(s=>{const n=subs[s]||0,m=M[s]||{n:0,r:0},p=n?Math.min(100,Math.round(m.n/n*100)):0;
    return `<button class="card qbsub" data-s="${esc(s)}"><b>${esc(qbSub(s))}</b><span class="sm mut">${n} questions · ${m.n} done${m.n?` · ${Math.round(m.r/m.n*100)}% right`:''}</span><div class="qbbar"><i style="width:${p}%"></i></div></button>`}).join('');
}
function qbUpd(){
  qbSubCards();
  const n=qbCount(QB.meta.rows,qbEff(QB.f));const e=document.getElementById('qbN');if(e)e.textContent=n.toLocaleString('en-IN');
  const b=document.getElementById('qbStart');if(b)b.disabled=!n;
  LS.set('cbt_qb_f',QB.f);
}
function qbReset(){QB.f=qbEmptyF();QBDD='';qbFilterMount('qbF',QB.f,qbUpd);qbUpd()}
function qbStart(){
  QB.run={f:qbEff(QB.f),q:[],seen:[],i:0,ans:{},res:{},n:0,ok:0,end:false,busy:null};
  location.hash='#/qb/go';
}

/* ---------- practice: one question at a time ---------- */
async function qbFetch(){
  const R=QB.run;if(!R||R.end)return;
  if(R.busy)return R.busy;
  R.busy=rpc('cbt_qb_next',{p_f:R.f,p_skip:R.seen.slice(-400)}).then(r=>{
    if(authErr(r))return;
    if(!r||!r.ok){R.err=r;return}
    R.err=null;
    const it=(r.items||[]).filter(q=>qbUid(q.id)&&!R.seen.includes(q.id));
    it.forEach(q=>{R.q.push(q);R.seen.push(q.id)});
    if(!it.length)R.end=true;
  }).finally(()=>{R.busy=null});
  return R.busy;
}
async function qbPractice(){
  const R=QB.run;
  if(!R){location.hash='#/qb';return}
  if(R.i>=R.q.length){setApp(`<div class="wrap qb"><div class="card"><div class="sk" style="height:220px"></div></div></div>`);await qbFetch()}
  if(location.hash!=='#/qb/go'||QB.run!==R)return;
  if(R.i>=R.q.length){
    if(R.err)return setApp(`<div class="wrap qb"><div class="card empty">${ic('wifi',30)}<h3 style="margin:10px 0 4px">Could not load questions</h3><p class="sm">${esc(qbErr(R.err))}</p><button class="btn" onclick="route()">Try again</button> <button class="btn ghost" onclick="qbStop()">Finish</button></div></div>`);
    return qbSummary(true);
  }
  qbDraw();
  if(R.q.length-R.i<=3)qbFetch();
}
function qbDraw(){
  const R=QB.run,q=R.q[R.i],a=R.ans[q.id],res=R.res[q.id],L=['A','B','C','D'];
  const tags=[qbSub(q.s),q.c?qbChap(q.s,q.c):'',qbLbl(QB_LV,q.l),qbLbl(QB_TY,q.y),qbLbl(QB_SR,q.o)].filter(Boolean);
  setApp(`<div class="wrap qb qbrun">
   <div class="qbtop"><button class="btn ghost sm" onclick="qbStop()">${ic('x',16)} End</button><div class="grow sm mut" style="text-align:center">Question <b style="color:var(--tx)">${R.i+1}</b> · ${R.ok}/${R.n} right</div><span class="chip pri">${R.n?Math.round(R.ok/R.n*100):0}%</span></div>
   <div class="card qcard">
    <div class="qbtags">${tags.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="qtext">${esc(q.q)}</div>${imgTag(q.img)}
    ${(q.options||[]).map((o,i)=>{const cls=res?(i===res.answer?'ok':(i===a?'bad':'')):(a===i?'sel':'');
      return `<button class="opt ${cls}" onclick="qbPick(${i})"><span class="k">${L[i]}</span><span class="t">${esc(o)}${imgTag(q.oimg&&q.oimg[i],'oi')}</span></button>`}).join('')}
    ${res?`<div class="qbfb ${res.right?'ok':'bad'}">${ic(res.right?'check':'x',18)} <b>${res.right?'Correct!':'Not right'}</b>${res.right?'':` — the answer is <b>${L[res.answer]}</b>`}</div>${res.explanation?`<div class="exp"><b>Explanation:</b> ${esc(res.explanation)}</div>`:''}`
      :a!=null?`<div class="sm mut" style="margin-top:10px">Checking…</div>`:`<div class="sm mut" style="margin-top:10px">Pick an option to see the answer.</div>`}
   </div>
   <div class="qbnav"><button class="btn ghost" ${R.i?'':'disabled'} onclick="qbGo(-1)">${ic('left',16)} Back</button><span class="grow"></span>${res?'':`<button class="btn ghost" onclick="qbGo(1)">Skip</button>`}<button class="btn" ${res?'':'disabled'} onclick="qbGo(1)">Next ${ic('right',16)}</button></div>
  </div>`);
}
async function qbPick(i){
  const R=QB.run,q=R.q[R.i];if(!q||R.ans[q.id]!=null)return;
  R.ans[q.id]=i;if(navigator.vibrate)navigator.vibrate(8);qbDraw();
  const r=await rpc('cbt_qb_check',{p_q:q.id,p_choice:i});
  if(authErr(r))return;
  if(QB.run!==R)return;
  if(!r||!r.ok){delete R.ans[q.id];toast(qbErr(r));if(location.hash==='#/qb/go')qbDraw();return}
  R.res[q.id]={right:!!r.right,answer:+r.answer,explanation:String(r.explanation||'')};R.n++;if(r.right)R.ok++;
  QB.metaAt=0;
  if(location.hash==='#/qb/go'&&R.q[R.i]===q)qbDraw();
}
function qbGo(d){const R=QB.run;if(!R)return;R.i=Math.max(0,R.i+d);if(d>0&&R.i>=R.q.length)return qbPractice();qbDraw();window.scrollTo(0,0);if(R.q.length-R.i<=3)qbFetch()}
function qbStop(){qbSummary(false)}
function qbCont(){const R=QB.run;if(!R)return;if(R.i<R.q.length)qbDraw();else qbPractice()}
function qbSummary(out){
  const R=QB.run;if(!R)return location.hash='#/qb';
  const wrong=R.q.filter(q=>R.res[q.id]&&!R.res[q.id].right);
  setApp(`<div class="wrap qb">
   <div class="card empty"><span class="qbi" style="margin:0 auto">${ic('trophy',26)}</span><h3 style="margin:12px 0 4px">${out?'You have practised every question of your choice!':'Practice finished'}</h3>
    <p class="sm mut">${R.n} answered · ${R.ok} right · ${R.n-R.ok} wrong${R.n?` · ${Math.round(R.ok/R.n*100)}% accuracy`:''}</p>
    <div class="row" style="justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap">${out?'':`<button class="btn" onclick="qbCont()">Continue practising</button>`}<button class="btn ghost" onclick="QB.run=null;location.hash='#/qb'">Choose again</button></div></div>
   ${wrong.length?`<div class="h2s">Revise these (${wrong.length})</div>${wrong.map(q=>{const r=R.res[q.id],L=['A','B','C','D'];return `<div class="card"><div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
     ${(q.options||[]).map((o,j)=>`<div class="ro ${j===r.answer?'c':j===R.ans[q.id]?'w':''}"><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}</span></div>`).join('')}${r.explanation?`<div class="exp"><b>Explanation:</b> ${esc(r.explanation)}</div>`:''}</div>`}).join('')}`:''}
  </div>`);
}

/* ===================== Test generator ===================== */
const qbPad=n=>String(n).padStart(2,'0');
function qbWhen(ms){
  if(!ms)return '';const d=new Date(+ms),t=new Date(),y=new Date(t.getTime()+864e5);
  const same=(a,b)=>a.toDateString()===b.toDateString();
  let h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM';h=h%12||12;
  const tm=`${h}:${qbPad(m)} ${ap}`;
  return same(d,t)?`Today, ${tm}`:same(d,y)?`Tomorrow, ${tm}`:`${d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}, ${tm}`;
}
function qbLeft(ms){
  let s=Math.max(0,Math.round(ms/1000));const d=Math.floor(s/86400);s-=d*86400;const h=Math.floor(s/3600);s-=h*3600;const m=Math.floor(s/60);
  return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m ${s%60}s`;
}
const qbNow=()=>Date.now()+QB.off;
async function genList(force){
  if(QB.list&&!force&&Date.now()-QB.listAt<30000)return {ok:true};
  const r=await rpc('cbt_gen_list',{});
  if(authErr(r))return null;
  if(!r||!r.ok)return r||{ok:false};
  QB.list=(r.items||[]).filter(x=>qbUid(x.id));QB.listAt=Date.now();if(r.now)QB.off=+r.now-Date.now();
  if(QB.list.length&&AUTH)LS.set('cbt_gen_has_'+AUTH.mobile,1);
  return r;
}
function genState(t){
  const now=qbNow();
  if(t.done)return 'done';
  if(t.started&&t.ends&&t.ends+120000>now)return 'run';
  if(t.at<=now)return 'live';
  return 'soon';
}
function genCard(t){
  const st=genState(t),id=esc(t.id);
  const f=(t.opts&&t.opts.f)||{};
  const what=[(f.s||[]).map(qbSub).join(' + ')||'All subjects',(f.c||[]).length?`${f.c.length} chapter${f.c.length>1?'s':''}`:'',(f.l||[]).map(k=>qbLbl(QB_LV,k)).join('/')].filter(Boolean).join(' · ');
  const head=`<div class="gnh"><div class="grow"><b>${esc(t.title)}</b><div class="sm mut">${t.n} questions · ${t.dur} min · +${t.plus}/−${t.minus}</div><div class="sm mut">${esc(what)}</div></div>`;
  if(st==='done'){const pc=t.max?Math.max(0,Math.round(t.score/t.max*100)):0;
    return `<div class="card gn">${head}<div class="gnsc"><b>${+t.score}</b><span>/ ${t.max}</span></div></div>
     <div class="gnf"><span class="chip ok">${t.correct} right</span><span class="chip warn">${t.wrong} wrong</span><span class="chip">${t.skipped} skipped</span><span class="sm mut">${qbWhen(t.done)}</span><span class="grow"></span>
     <button class="btn ghost sm" onclick="genRetake('${id}')">${ic('reset',15)} Retake</button><button class="btn sm" onclick="location.hash='#/gen/r/${id}'">Result ${ic('right',15)}</button></div><div class="qbbar"><i style="width:${pc}%"></i></div></div>`}
  if(st==='run')return `<div class="card gn live">${head}<span class="chip warn">In progress</span></div><div class="gnf"><span class="sm mut">Ends ${qbWhen(t.ends)}</span><span class="grow"></span><button class="btn sm" onclick="genStart('${id}')">${ic('play',15)} Resume</button></div></div>`;
  if(st==='live')return `<div class="card gn live">${head}<span class="chip ok gnlive">● Live</span></div><div class="gnf"><span class="sm mut">Opened ${qbWhen(t.at)}</span><span class="grow"></span><button class="iconbtn" aria-label="Delete" onclick="genDel('${id}')">${ic('trash',17)}</button><button class="btn sm" onclick="genStart('${id}')">${ic('play',15)} Start test</button></div></div>`;
  return `<div class="card gn">${head}<span class="chip pri">Scheduled</span></div><div class="gnf"><span class="sm">${ic('calendar',14)} <b>${qbWhen(t.at)}</b></span><span class="sm mut gncd" data-at="${+t.at}">in ${qbLeft(t.at-qbNow())}</span><span class="grow"></span><button class="iconbtn" aria-label="Delete" onclick="genDel('${id}')">${ic('trash',17)}</button><button class="btn ghost sm" onclick="genMove('${id}')">${ic('clock',15)} Change time</button></div></div>`;
}
let GENT=null;
async function genHome(){
  if(!QB.list)setApp(`<div class="wrap qb"><div class="card"><div class="sk" style="height:160px"></div></div></div>`);
  const r=await genList(true);
  if(location.hash!=='#/gen')return;
  if(!r)return;
  if(!r.ok){if(qbMissing(r))return qbSoon('Test generator');return setApp(`<div class="wrap"><div class="card empty">${ic('wifi',30)}<h3 style="margin:10px 0 4px">Could not load</h3><p class="sm">${esc(qbErr(r))}</p><button class="btn" onclick="route()">Try again</button></div></div>`)}
  const L=QB.list,g={run:[],live:[],soon:[],done:[]};L.forEach(t=>g[genState(t)].push(t));
  g.soon.sort((a,b)=>a.at-b.at);
  const sec=(t,a)=>a.length?`<div class="h2s">${t} <span class="n">${a.length}</span></div>${a.map(genCard).join('')}`:'';
  const done=g.done,avg=done.length?Math.round(done.reduce((s,t)=>s+(t.max?Math.max(0,t.score/t.max):0),0)/done.length*100):0;
  setApp(`<div class="wrap qb">
   <div class="crumb"><a href="#/">${ic('left',16)} Home</a></div>
   <div class="card qbhero"><span class="qbi">${ic('wand',24)}</span><div class="grow"><h2>Test generator</h2><p class="sm mut">Make your own test: choose subjects, chapters, topics, level, question type and source, the number of questions and the time — start now or schedule it for any day.</p></div></div>
   <button class="btn block gnnew" onclick="location.hash='#/gen/new'">${ic('wand',18)} Create a new test</button>
   ${done.length?`<div class="stats qbst"><div class="stat"><b>${done.length}</b><span>Tests taken</span></div><div class="stat"><b>${avg}%</b><span>Average score</span></div><div class="stat"><b>${g.soon.length}</b><span>Scheduled</span></div></div>`:''}
   ${sec('In progress',g.run)}${sec('Live now',g.live)}${sec('Scheduled',g.soon)}${sec('Completed',done)}
   ${L.length?'':`<div class="card empty">${ic('calendar',28)}<h3 style="margin:10px 0 4px">No tests yet</h3><p class="sm mut">Create your first test. It goes live at the time you choose, and you get a full result with solutions.</p></div>`}
   <div class="card qbgenad" onclick="location.hash='#/qb'" role="button"><span class="qbi sm">${ic('bank',20)}</span><div class="grow"><b>Question bank</b><div class="sm mut">Unlimited practice with answers and explanations.</div></div>${ic('right',18)}</div>
  </div>`);
  clearInterval(GENT);
  GENT=setInterval(()=>{
    if(location.hash!=='#/gen'||INTEST){clearInterval(GENT);return}
    let flip=false;document.querySelectorAll('.gncd').forEach(e=>{const l=+e.dataset.at-qbNow();if(l<=0)flip=true;else e.textContent='in '+qbLeft(l)});
    if(flip){clearInterval(GENT);genHome()}
  },1000);
}

/* ---------- create a test ---------- */
function genDays(){const o=[],t=new Date();t.setHours(0,0,0,0);for(let i=0;i<60;i++){const d=new Date(t.getTime()+i*864e5);o.push([d.getTime(),i===0?'Today':i===1?'Tomorrow':d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})])}return o}
async function genNew(){
  setApp(`<div class="wrap qb"><div class="card"><div class="sk" style="height:220px"></div></div></div>`);
  const M=await qbMeta();
  if(location.hash!=='#/gen/new')return;
  if(!M)return;
  if(!M.ok){if(qbMissing(M))return qbSoon('Test generator');return setApp(`<div class="wrap"><div class="card empty"><p class="sm">${esc(qbErr(M))}</p><button class="btn" onclick="route()">Try again</button></div></div>`)}
  const def=new Date(Date.now()+36e5);def.setMinutes(0,0,0);
  QB.form=QB.form||{title:'',f:qbEmptyF(),n:30,dur:45,durAuto:true,mark:'4',order:'mix',when:'now',day:new Date(new Date(def).setHours(0,0,0,0)).getTime(),hm:def.getHours()*60};
  const F=QB.form,days=genDays();
  const times=[];for(let m=0;m<1440;m+=15){let h=Math.floor(m/60),ap=h>=12?'PM':'AM';h=h%12||12;times.push([m,`${h}:${qbPad(m%60)} ${ap}`])}
  setApp(`<div class="wrap qb gnform">
   <div class="crumb"><a href="#/gen">${ic('left',16)} Test generator</a></div>
   <h1 class="gnt">Create your test</h1>
   <div class="card"><div class="qbl" style="margin-top:0">Test name</div><input type="text" id="gnTitle" maxlength="80" placeholder="e.g. Physics — Kinematics revision" value="${esc(F.title)}"></div>
   <div class="h2s">1 · What to ask</div>
   <div class="card"><div id="gnF"></div><div class="qbgo"><div class="grow"><b id="gnAv">0</b> <span class="sm mut">questions available</span></div></div></div>
   <div class="h2s">2 · Questions, time and marks</div>
   <div class="card">
    <div class="qbl" style="margin-top:0">Number of questions</div>
    <div class="qbcs" id="gnN">${[10,20,30,45,60,90,180].map(n=>`<button type="button" class="qbc ${F.n===n?'on':''}" data-n="${n}">${n}</button>`).join('')}<input type="number" id="gnNc" min="5" max="200" placeholder="Other" value="${[10,20,30,45,60,90,180].includes(F.n)?'':F.n}" style="width:96px;padding:7px 10px"></div>
    <div class="qbl">Time (minutes)</div>
    <div class="qbcs" id="gnD">${[15,30,45,60,90,120,180,200].map(n=>`<button type="button" class="qbc ${F.dur===n?'on':''}" data-d="${n}">${n}</button>`).join('')}<input type="number" id="gnDc" min="5" max="360" placeholder="Other" value="${[15,30,45,60,90,120,180,200].includes(F.dur)?'':F.dur}" style="width:96px;padding:7px 10px"></div>
    <p class="sm mut" id="gnDh" style="margin:6px 0 0"></p>
    <div class="qbl">Marking</div>
    <div class="seg" id="gnM"><button type="button" data-m="4" class="${F.mark==='4'?'on':''}">+4 / −1 (NEET)</button><button type="button" data-m="1" class="${F.mark==='1'?'on':''}">+1 / 0 (no negative)</button></div>
    <div class="qbl">Question order</div>
    <div class="seg" id="gnO"><button type="button" data-o="mix" class="${F.order==='mix'?'on':''}">Mixed</button><button type="button" data-o="subject" class="${F.order==='subject'?'on':''}">Subject by subject</button></div>
   </div>
   <div class="h2s">3 · When</div>
   <div class="card">
    <div class="seg" id="gnW"><button type="button" data-w="now" class="${F.when==='now'?'on':''}">Start now</button><button type="button" data-w="later" class="${F.when==='later'?'on':''}">Schedule</button></div>
    <div id="gnSch" style="${F.when==='later'?'':'display:none'}"><div class="gnrow"><div class="grow"><div class="qbl">Day</div><select id="gnDay">${days.map(([v,l])=>`<option value="${v}" ${v===F.day?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
     <div class="grow"><div class="qbl">Time</div><select id="gnTime">${times.map(([v,l])=>`<option value="${v}" ${v===F.hm?'selected':''}>${l}</option>`).join('')}</select></div></div>
     <p class="sm mut" style="margin:8px 0 0">The test goes live at this time. Open the app then and press <b>Start test</b>; your timer starts when you start.</p></div>
   </div>
   <button class="btn block gnnew" id="gnGo" onclick="genCreate()">${ic('wand',18)} Create test</button>
  </div>`);
  const upd=()=>{
    const av=qbCount(QB.meta.rows,qbEff(F.f));const e=document.getElementById('gnAv');if(e)e.textContent=av.toLocaleString('en-IN');
    const h=document.getElementById('gnDh');
    if(h)h.textContent=av&&av<F.n?`Only ${av} questions match — your test will have ${Math.max(av,0)} questions.`:`About ${Math.round(F.dur*60/F.n)} seconds per question.`;
    const b=document.getElementById('gnGo');if(b)b.disabled=av<5;
  };
  qbFilterMount('gnF',F.f,upd);
  const el=$('#app');
  el.querySelector('#gnTitle').oninput=e=>{F.title=e.target.value};
  const suggest=()=>{if(F.durAuto){F.dur=Math.min(360,Math.max(5,Math.round(F.n*1.5/5)*5));
    el.querySelectorAll('#gnD .qbc').forEach(b=>b.classList.toggle('on',+b.dataset.d===F.dur));const c=el.querySelector('#gnDc');c.value=[15,30,45,60,90,120,180,200].includes(F.dur)?'':F.dur}};
  el.querySelector('#gnN').onclick=e=>{const b=e.target.closest('[data-n]');if(!b)return;F.n=+b.dataset.n;el.querySelectorAll('#gnN .qbc').forEach(x=>x.classList.toggle('on',x===b));el.querySelector('#gnNc').value='';suggest();upd()};
  el.querySelector('#gnNc').oninput=e=>{const v=Math.round(+e.target.value);if(v>=5&&v<=200){F.n=v;el.querySelectorAll('#gnN .qbc').forEach(x=>x.classList.remove('on'));suggest();upd()}};
  el.querySelector('#gnD').onclick=e=>{const b=e.target.closest('[data-d]');if(!b)return;F.dur=+b.dataset.d;F.durAuto=false;el.querySelectorAll('#gnD .qbc').forEach(x=>x.classList.toggle('on',x===b));el.querySelector('#gnDc').value='';upd()};
  el.querySelector('#gnDc').oninput=e=>{const v=Math.round(+e.target.value);if(v>=5&&v<=360){F.dur=v;F.durAuto=false;el.querySelectorAll('#gnD .qbc').forEach(x=>x.classList.remove('on'));upd()}};
  const seg=(id,key,cb)=>{el.querySelector(id).onclick=e=>{const b=e.target.closest('button');if(!b)return;F[key]=b.dataset[Object.keys(b.dataset)[0]];el.querySelectorAll(id+' button').forEach(x=>x.classList.toggle('on',x===b));cb&&cb()}};
  seg('#gnM','mark');seg('#gnO','order');seg('#gnW','when',()=>{el.querySelector('#gnSch').style.display=F.when==='later'?'':'none'});
  el.querySelector('#gnDay').onchange=e=>{F.day=+e.target.value};
  el.querySelector('#gnTime').onchange=e=>{F.hm=+e.target.value};
  upd();
}
async function genCreate(){
  const F=QB.form;if(!F)return;
  let at=Date.now();
  if(F.when==='later'){at=F.day+F.hm*60000;if(at<Date.now()-60000)return toast('Choose a time in the future')}
  const b=document.getElementById('gnGo');if(b){b.disabled=true;b.textContent='Creating…'}
  const f=qbEff(F.f);if(F.f.s.length===0)f.all=1;
  const r=await rpc('cbt_gen_create',{p_d:{title:F.title.trim()||genAutoTitle(f),f,n:F.n,dur:F.dur,plus:F.mark==='4'?4:1,minus:F.mark==='4'?1:0,order:F.order,at:F.when==='later'?at+QB.off:0}});
  if(authErr(r))return;
  if(!r||!r.ok){toast(qbErr(r));if(b){b.disabled=false;b.innerHTML=`${ic('wand',18)} Create test`}return}
  QB.form=null;QB.list=null;if(AUTH)LS.set('cbt_gen_has_'+AUTH.mobile,1);
  if(r.want&&r.n<r.want)toast(`Only ${r.n} questions matched, so your test has ${r.n}.`);
  if(F.when==='later'){toast('Test scheduled for '+qbWhen(at));location.hash='#/gen'}
  else genStart(r.id);
}
function genAutoTitle(f){
  if((f.c||[]).length===1){const s=(qbSyl().find(x=>x.chapters.some(y=>y.id===f.c[0]))||{}).id;return qbChap(s,f.c[0])+' test'}
  if(f.all)return ((QB.form&&QB.form.f.ex)||'')+' full syllabus test';
  return (f.s||[]).map(qbSub).join(' + ')+' test';
}
async function genRetake(id){
  if(!qbUid(id))return;
  const r=await rpc('cbt_gen_create',{p_d:{copy:id}});
  if(authErr(r))return;
  if(!r||!r.ok)return toast(qbErr(r));
  QB.list=null;genStart(r.id);
}
async function genDel(id){
  if(!qbUid(id))return;
  modal(`<h2>Delete this test?</h2><p class="mut" style="margin:6px 0 0">It will be removed from your list.</p><div class="row" style="margin-top:16px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Keep</button><button class="btn danger" style="flex:1" id="gnDelY">Delete</button></div>`);
  document.getElementById('gnDelY').onclick=async()=>{
    closeModal();const r=await rpc('cbt_gen_edit',{p_id:id,p_action:'delete',p_at:null});
    if(authErr(r))return;if(!r||!r.ok)return toast(qbErr(r));
    toast('Deleted');genHome();
  };
}
function genMove(id){
  if(!qbUid(id))return;
  const t=(QB.list||[]).find(x=>x.id===id);if(!t)return;
  const d=new Date(t.at),day=new Date(d).setHours(0,0,0,0),hm=d.getHours()*60+Math.floor(d.getMinutes()/15)*15;
  const times=[];for(let m=0;m<1440;m+=15){let h=Math.floor(m/60),ap=h>=12?'PM':'AM';h=h%12||12;times.push([m,`${h}:${qbPad(m%60)} ${ap}`])}
  modal(`<h2>Change the time</h2><p class="mut sm" style="margin:6px 0 12px">${esc(t.title)}</p>
   <div class="gnrow"><div class="grow"><div class="qbl">Day</div><select id="mvDay">${genDays().map(([v,l])=>`<option value="${v}" ${v===day?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
   <div class="grow"><div class="qbl">Time</div><select id="mvTime">${times.map(([v,l])=>`<option value="${v}" ${v===hm?'selected':''}>${l}</option>`).join('')}</select></div></div>
   <div class="row" style="margin-top:16px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="mvY">Save</button></div>`);
  document.getElementById('mvY').onclick=async()=>{
    const at=+document.getElementById('mvDay').value+(+document.getElementById('mvTime').value)*60000;
    if(at<Date.now()-60000)return toast('Choose a time in the future');
    closeModal();const r=await rpc('cbt_gen_edit',{p_id:id,p_action:'reschedule',p_at:at+QB.off});
    if(authErr(r))return;if(!r||!r.ok)return toast(qbErr(r));
    toast('Moved to '+qbWhen(at));genHome();
  };
}

/* ---------- taking a generated test ---------- */
let GT=null,GP=null,GTT=null,GSAVE=0;
const gKey=id=>'cbt_gen_p_'+id;
async function genStart(id){
  if(!qbUid(id))return;
  loading('Opening your test…');
  const r=await rpc('cbt_gen_start',{p_id:id});
  if(authErr(r))return;
  if(!r||!r.ok){
    if(r&&r.error==='done'){location.hash='#/gen/r/'+id;return}
    toast(qbErr(r));location.hash='#/gen';if(location.hash==='#/gen')genHome();return;
  }
  QB.off=(+r.now||Date.now())-Date.now();
  const Q=(r.questions||[]).filter(q=>qbUid(q.id));
  if(!Q.length){toast('This test has no questions left.');location.hash='#/gen';return}
  GT={id,title:String(r.test.title||'My test'),plus:+r.test.plus,minus:+r.test.minus,ends:+r.test.ends,q:Q};
  const loc=LS.get(gKey(id),null);
  GP={cur:0,ans:Object.assign({},r.answers||{},loc&&loc.ans||{}),mark:(loc&&loc.mark)||{},vis:(loc&&loc.vis)||{},dirty:true};
  for(const k in GP.ans)if(!Q.some(q=>q.id===k)||!/^[0-3]$/.test(String(GP.ans[k])))delete GP.ans[k];
  INTEST=true;document.body.classList.add('intest');palOpen=false;
  window.onbeforeunload=()=>'Your test is running.';
  if(location.hash!=='#/gen/t')history.replaceState(null,'','#/gen/t');
  gDraw();
  clearInterval(GTT);GTT=setInterval(gTick,1000);gTick();
}
function gSt(i){const q=GT.q[i],a=GP.ans[q.id]!=null,m=!!GP.mark[q.id];return a&&m?'mans':m?'mark':a?'ans':GP.vis[q.id]?'na':'nv'}
function gPal(){
  const c={nv:0,na:0,ans:0,mark:0,mans:0};GT.q.forEach((_,i)=>c[gSt(i)]++);
  return `<div class="pal">${GT.q.map((_,i)=>`<button class="${gSt(i)} ${i===GP.cur?'cur':''}" onclick="gGo(${i})">${i+1}</button>`).join('')}</div>
  <div class="leg2"><span><i class="lg ans">${c.ans}</i>Answered</span><span><i class="lg na">${c.na}</i>Not answered</span><span><i class="lg nv">${c.nv}</i>Not visited</span><span><i class="lg mark">${c.mark}</i>Marked</span><span style="grid-column:1/3"><i class="lg mans">${c.mans}</i>Answered &amp; marked (will be evaluated)</span></div>`;
}
function gDraw(){
  if(!GT)return;
  const n=GT.q.length,q=GT.q[GP.cur],a=GP.ans[q.id],L=['A','B','C','D'];GP.vis[q.id]=1;
  $('#app').innerHTML=`<div class="cbtbar"><div class="tb-l"><div class="tb-title">${esc(GT.title)}</div><div class="sm mut cand">${esc(qbSub(q.s))}${q.c?' · '+esc(qbChap(q.s,q.c)):''}</div></div>
   <div class="timer" id="tm">${ic('clock')}<span>--:--</span></div><button class="btn danger sm" onclick="gAsk()">Submit</button></div>
   <div class="tlayout"><section class="card qcard"><div class="qmeta"><b>Question ${GP.cur+1} <span class="mut" style="font-weight:500">of ${n}</span></b><span class="chip ok">+${GT.plus}</span>${GT.minus?`<span class="chip warn">−${GT.minus}</span>`:''}${GP.mark[q.id]?'<span class="chip pri">Marked</span>':''}<span style="flex:1"></span><span class="chip">${esc(qbLbl(QB_LV,q.l))}</span></div>
   <div class="qtext">${esc(q.q)}</div>${imgTag(q.img)}
   ${(q.options||[]).map((o,i)=>`<button class="opt ${a===i?'sel':''}" onclick="gSel(${i})"><span class="k">${L[i]}</span><span class="t">${esc(o)}${imgTag(q.oimg&&q.oimg[i],'oi')}</span></button>`).join('')}</section>
   <aside class="side card">${gPal()}<button class="btn danger block" style="margin-top:14px" onclick="gAsk()">Submit test</button></aside></div>
   <div class="bbar"><div class="r"><button class="btn warn sm" onclick="gMarkNext()">${ic('flag')} Mark &amp; Next</button><button class="btn ghost sm" onclick="gClr()">Clear</button><button class="btn sm" onclick="gSaveNext()">Save &amp; Next ${ic('right')}</button></div>
   <div class="r nav"><button class="btn ghost sm" ${GP.cur===0?'disabled':''} onclick="gGo(${GP.cur-1})">${ic('left')} Back</button><button class="btn soft sm only-m" onclick="gPalT(true)">${ic('grid')} Palette</button><button class="btn ghost sm" ${GP.cur===n-1?'disabled':''} onclick="gGo(${GP.cur+1})">Next ${ic('right')}</button></div></div>
   <div class="sheet ${palOpen?'open':''}" onclick="if(event.target===this)gPalT(false)"><div class="in"><div class="grab"></div><b>Question palette</b><div style="margin-top:12px">${gPal()}</div>
   <button class="btn danger block" style="margin-top:14px" onclick="gAsk()">Submit test</button></div></div>`;
  gTick(true);
}
function gKeep(){if(GT&&GP){GP.dirty=true;LS.set(gKey(GT.id),{ans:GP.ans,mark:GP.mark,vis:GP.vis})}}
function gPalT(v){palOpen=v;const s=document.querySelector('.sheet');if(s)s.classList.toggle('open',v)}
function gGo(i){if(!GT||i<0||i>=GT.q.length)return;GP.cur=i;palOpen=false;gKeep();gDraw();window.scrollTo(0,0)}
function gSel(i){const q=GT.q[GP.cur];GP.ans[q.id]=i;if(navigator.vibrate)navigator.vibrate(8);gKeep();gDraw()}
function gClr(){delete GP.ans[GT.q[GP.cur].id];gKeep();gDraw()}
function gSaveNext(){delete GP.mark[GT.q[GP.cur].id];gNext()}
function gMarkNext(){GP.mark[GT.q[GP.cur].id]=1;gNext()}
function gNext(){if(GP.cur<GT.q.length-1)GP.cur++;gKeep();gDraw();window.scrollTo(0,0)}
function gTick(only){
  if(!GT)return;
  const left=Math.round((GT.ends-qbNow())/1000);
  const e=document.getElementById('tm');
  if(e){const s=Math.max(0,left),h=Math.floor(s/3600),m=Math.floor(s%3600/60);e.querySelector('span').textContent=(h?h+':'+qbPad(m):m)+':'+qbPad(s%60);e.classList.toggle('low',left<=300)}
  if(only)return;
  if(left<=0){clearInterval(GTT);toast("Time's up! Submitting your test…");gFinish();return}
  if(GP.dirty&&Date.now()-GSAVE>15000){GSAVE=Date.now();GP.dirty=false;rpc('cbt_gen_save',{p_id:GT.id,p_answers:GP.ans}).then(r=>{if(!r||!r.ok)GP.dirty=true})}
}
function gAsk(){
  const n=GT.q.length,a=GT.q.filter(q=>GP.ans[q.id]!=null).length,m=GT.q.filter(q=>GP.mark[q.id]).length;
  modal(`<h2>Submit test?</h2><p class="mut" style="margin:6px 0 0">You won't be able to change your answers after this.</p>
   <div class="mgrid"><div><b style="color:var(--ok)">${a}</b><span class="sm mut">Answered</span></div><div><b style="color:var(--bad)">${n-a}</b><span class="sm mut">Unanswered</span></div><div><b style="color:var(--pri)">${m}</b><span class="sm mut">Marked</span></div></div>
   <div class="row" style="margin-top:16px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Keep going</button><button class="btn danger" style="flex:1" onclick="closeModal();gFinish()">Submit</button></div>`);
}
async function gFinish(){
  if(!GT)return;
  clearInterval(GTT);window.onbeforeunload=null;
  const t=GT,ans=Object.assign({},GP.ans);
  loading('Submitting your answers…');
  for(let n=0;;n++){
    const r=await rpc('cbt_gen_submit',{p_id:t.id,p_answers:ans});
    if(authErr(r))return;
    if(r&&r.ok){LS.del(gKey(t.id));break}
    if(n>=4){   // keep the answers on the phone; the server marks the saved ones when the time is over
      INTEST=false;GT=null;GP=null;document.body.classList.remove('intest');
      setApp(`<div class="wrap"><div class="card empty">${ic('wifi',32)}<h3 style="margin:10px 0 4px">Could not submit</h3><p class="sm">${esc(qbErr(r))} Your answers are saved on this phone.</p><button class="btn" onclick="genStart('${esc(t.id)}')">Try again</button></div></div>`);return;
    }
    await new Promise(k=>setTimeout(k,2000*(n+1)*(0.6+Math.random()*0.8)));
  }
  INTEST=false;GT=null;GP=null;document.body.classList.remove('intest');QB.list=null;
  location.hash='#/gen/r/'+t.id;
}

/* ---------- result ---------- */
async function genResult(id){
  if(!qbUid(id)){location.hash='#/gen';return}
  if(!QB.R||QB.R.test.id!==id){
    setApp(`<div class="wrap qb"><div class="card"><div class="sk" style="height:200px"></div></div></div>`);
    const r=await rpc('cbt_gen_result',{p_id:id});
    if(authErr(r))return;
    if(location.hash!=='#/gen/r/'+id)return;
    if(!r||!r.ok){if(r&&r.error==='not_done')return genStart(id);return setApp(`<div class="wrap"><div class="card empty"><p class="sm">${esc(qbErr(r))}</p><a class="btn" href="#/gen">Back</a></div></div>`)}
    QB.R=r;QB.rf='all';
  }
  genResDraw();
}
function genResDraw(){
  const R=QB.R,t=R.test,Q=R.questions||[],L=['A','B','C','D'];
  const pc=t.max?Math.max(0,Math.round(t.score/t.max*100)):0,att=t.correct+t.wrong,acc=att?Math.round(t.correct/att*100):0;
  const by=(key,name)=>{const m={};Q.forEach(q=>{const k=key(q);const o=m[k]=m[k]||{name:name(q),n:0,c:0,w:0};o.n++;if(q.my!=null){if(q.my===q.a)o.c++;else o.w++}});return Object.values(m)};
  const subs=by(q=>q.s,q=>qbSub(q.s)),chs=by(q=>q.s+'|'+q.c,q=>qbChap(q.s,q.c)).sort((a,b)=>(a.c/a.n)-(b.c/b.n));
  const row=o=>`<tr><td>${esc(o.name)}</td><td>${o.n}</td><td style="color:var(--ok)">${o.c}</td><td style="color:var(--bad)">${o.w}</td><td>${o.n-o.c-o.w}</td><td><b>${Math.round(o.c/o.n*100)}%</b></td></tr>`;
  const fl=QB.rf,show=Q.map((q,i)=>[q,i]).filter(([q])=>fl==='all'||(fl==='c'&&q.my===q.a)||(fl==='w'&&q.my!=null&&q.my!==q.a)||(fl==='s'&&q.my==null));
  const used=t.used||0;
  setApp(`<div class="wrap qb">
   <div class="crumb"><a href="#/gen">${ic('left',16)} Test generator</a></div>
   <div class="card gnres"><div class="grow"><div class="eyebrow sm mut">Result</div><h2 style="margin:2px 0 4px">${esc(t.title)}</h2><div class="sm mut">${t.n} questions · ${t.dur} min · submitted ${qbWhen(t.done)}</div></div>
    <div class="gnring" style="--p:${pc}"><b>${+t.score}</b><span>/ ${t.max}</span></div></div>
   <div class="stats qbst"><div class="stat"><b style="color:var(--ok)">${t.correct}</b><span>Correct</span></div><div class="stat"><b style="color:var(--bad)">${t.wrong}</b><span>Wrong</span></div><div class="stat"><b>${t.skipped}</b><span>Skipped</span></div><div class="stat"><b>${acc}%</b><span>Accuracy</span></div><div class="stat"><b>${Math.floor(used/60)}m ${used%60}s</b><span>Time used</span></div></div>
   <div class="h2s">Subject-wise</div><div class="card scroll"><table class="tbl sm"><tr><th>Subject</th><th>Qs</th><th>Right</th><th>Wrong</th><th>Left</th><th>Score</th></tr>${subs.map(row).join('')}</table></div>
   ${chs.length>1?`<div class="h2s">Chapter-wise <span class="mut sm">(weakest first)</span></div><div class="card scroll"><table class="tbl sm"><tr><th>Chapter</th><th>Qs</th><th>Right</th><th>Wrong</th><th>Left</th><th>Score</th></tr>${chs.map(row).join('')}</table></div>`:''}
   <div class="row" style="gap:8px;margin:14px 0;flex-wrap:wrap"><button class="btn" onclick="genRetake('${esc(t.id)}')">${ic('reset',16)} Retake this test</button><button class="btn ghost" onclick="location.hash='#/gen/new'">${ic('wand',16)} New test</button></div>
   <div class="h2s">Solutions</div>
   <div class="seg gnrf">${[['all','All',Q.length],['w','Wrong',t.wrong],['s','Skipped',t.skipped],['c','Correct',t.correct]].map(([k,l,n])=>`<button class="${fl===k?'on':''}" onclick="QB.rf='${k}';genResDraw()">${l} ${n}</button>`).join('')}</div>
   ${show.length?show.map(([q,i])=>{const st=q.my==null?'skip':q.my===q.a?'ok':'bad';
     return `<div class="card gnsol"><div class="qbtags"><b class="chip ${st==='ok'?'ok':st==='bad'?'warn':''}">Q${i+1} · ${st==='ok'?'Correct':st==='bad'?'Wrong':'Skipped'}</b><span class="chip">${esc(qbSub(q.s))}</span>${q.c?`<span class="chip">${esc(qbChap(q.s,q.c))}</span>`:''}<span class="chip">${esc(qbLbl(QB_LV,q.l))}</span></div>
      <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
      ${(q.options||[]).map((o,j)=>`<div class="ro ${j===q.a?'c':j===q.my?'w':''}"><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}${imgTag(q.oimg&&q.oimg[j],'oi')}</span>${j===q.a?'<span class="tag g">Correct</span>':j===q.my?'<span class="tag r">Your answer</span>':''}</div>`).join('')}
      ${q.e?`<div class="exp"><b>Explanation:</b> ${esc(q.e)}</div>`:''}</div>`}).join(''):`<div class="card empty"><p class="sm mut">Nothing here.</p></div>`}
  </div>`);
}

/* ---------- home card + menu ---------- */
async function genHomeCard(){
  if(INTEST||(location.hash&&location.hash!=='#/'&&location.hash!=='#'))return;
  const w=document.querySelector('#app>.wrap');if(!w||w.querySelector('.qbhome'))return;
  let live=null;
  if(AUTH&&LS.get('cbt_gen_has_'+AUTH.mobile,0)){
    try{await genList()}catch(e){}
    if(location.hash&&location.hash!=='#/'&&location.hash!=='#')return;
    const now=qbNow();
    live=(QB.list||[]).find(t=>!t.done&&t.at<=now)||(QB.list||[]).filter(t=>!t.done&&t.at>now&&t.at-now<864e5).sort((a,b)=>a.at-b.at)[0]||null;
  }
  const w2=document.querySelector('#app>.wrap');if(!w2||w2.querySelector('.qbhome'))return;
  const tgt=w2.querySelector('.card');if(!tgt)return;
  const liveH=live?`<div class="card qbhome qblive" role="button" onclick="${live.at<=qbNow()?`genStart('${esc(live.id)}')`:`location.hash='#/gen'`}"><span class="qbi sm">${ic(live.at<=qbNow()?'play':'calendar',20)}</span><div class="grow"><b>${live.at<=qbNow()?(live.started?'Your test is in progress':'Your test is live now'):'Your test today'}</b><div class="sm mut">${esc(live.title)} · ${live.at<=qbNow()?'tap to '+(live.started?'resume':'start'):qbWhen(live.at)}</div></div>${ic('right',18)}</div>`:'';
  tgt.insertAdjacentHTML('afterend',`${liveH}<div class="qbhome qbtiles"><button class="card" onclick="location.hash='#/gen'"><span class="qbi sm">${ic('wand',20)}</span><b>Test generator</b><span class="sm mut">Make &amp; schedule your own test</span></button><button class="card" onclick="location.hash='#/qb'"><span class="qbi sm">${ic('bank',20)}</span><b>Question bank</b><span class="sm mut">Unlimited practice</span></button></div>`);
}
{const _om=openMenu;openMenu=function(){_om.apply(this,arguments);
  const b=document.getElementById('dripyq')||[...document.querySelectorAll('#layer .dri')].find(x=>/Test History/.test(x.textContent));
  if(b&&!document.getElementById('drigen'))b.insertAdjacentHTML('afterend',`<button class="dri" id="drigen" onclick="closeModal();location.hash='#/gen'">${ic('wand',22)}<span>Test Generator</span><em class="drnew">NEW</em></button><button class="dri" id="driqb" onclick="closeModal();location.hash='#/qb'">${ic('bank',22)}<span>Question Bank</span><em class="drnew">NEW</em></button>`)}}
if(typeof viewLibrary==='function'){const _vl=viewLibrary;viewLibrary=function(){
  _vl.apply(this,arguments);
  const g=document.querySelector('#app .lib .lgs .lgp');
  if(g&&typeof lrow==='function')g.insertAdjacentHTML('afterbegin',lrow("location.hash='#/qb'",'bank','Question bank','Unlimited practice')+lrow("location.hash='#/gen'",'wand','Test generator','Make and schedule your own test'));
}}
{
  const _r0=route0;
  route0=async function(){
    const h=location.hash||'#/';let m;
    if(/^#\/(qb|gen)(\/|$)/.test(h)&&AUTH){
      if(!CAT){skelPage();if(!(await loadCat()))return}
      if(h==='#/qb')return qbHome();
      if(h==='#/qb/go')return qbPractice();
      if(h==='#/gen')return genHome();
      if(h==='#/gen/new')return genNew();
      if(h==='#/gen/t'){location.replace('#/gen');return}
      if((m=h.match(/^#\/gen\/r\/([0-9a-f-]{36})$/)))return genResult(m[1]);
      location.replace('#/gen');return;
    }
    const r=await _r0.apply(this,arguments);
    try{genHomeCard()}catch(e){}
    return r;
  };
}
{const st=document.createElement('style');st.textContent=`
.qb .card{margin-top:12px}
.qb .crumb+.card{margin-top:0}
.qbhero{display:flex;gap:14px;align-items:flex-start;background:linear-gradient(135deg,color-mix(in srgb,var(--pri) 14%,var(--surface)),var(--surface) 70%)}
.qbhero h2{margin:0 0 4px;font-size:20px}.qbhero p{margin:0}
.qbi{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;flex:none;background:var(--grad);color:#fff;box-shadow:0 6px 16px var(--glow)}
.qbi.sm{width:38px;height:38px;border-radius:12px}
.qbst{margin-top:12px}
.qbl{font-weight:700;font-size:13px;margin:14px 0 8px}
.qbcs{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.qbc{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:600;padding:7px 11px;border-radius:99px;border:1.5px solid var(--bd);background:var(--surface);color:var(--tx);cursor:pointer;max-width:100%;text-align:left}
.qbc i{font-style:normal;font-size:11px;font-weight:700;color:var(--mut);background:var(--surface2);border-radius:99px;padding:1px 7px}
.qbc.on{border-color:var(--pri);background:color-mix(in srgb,var(--pri) 14%,var(--surface));color:var(--pri)}
.qbc.on i{background:color-mix(in srgb,var(--pri) 18%,transparent);color:var(--pri)}
.qbc:disabled{opacity:.45;cursor:default}
.qbexr{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.qbex button{min-width:72px}
.qbdds{display:flex;flex-direction:column;gap:10px;margin-top:16px}
.qbdd{border:1.5px solid var(--bd);border-radius:14px;background:var(--surface);overflow:hidden}
.qbddh{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;background:none;border:0;font:inherit;color:var(--tx);cursor:pointer;text-align:left}
.qbddh .grow{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.qbddh small{color:var(--mut);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qbddh.on{background:color-mix(in srgb,var(--pri) 8%,var(--surface));border-bottom:1px solid var(--bd)}
.qbddn{min-width:22px;height:22px;padding:0 7px;border-radius:99px;background:var(--pri);color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center}
.qbddb{max-height:min(56vh,440px);overflow:auto;padding:6px 8px 10px;overscroll-behavior:contain}
.qbsrch{margin:6px 0 4px}
.qbac{display:flex;align-items:center;gap:6px;padding:6px 4px;position:sticky;top:-6px;background:var(--surface);z-index:1}
.qbac button{font:inherit;font-size:13px;font-weight:700;color:var(--pri);background:none;border:0;padding:6px 8px;border-radius:8px;cursor:pointer}
.qbac .grow{flex:1}
.qbac .qbdone{background:var(--pri);color:#fff;padding:6px 14px}
.qbgh{font-size:11.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--mut);padding:12px 8px 4px}
.qbopt{display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:10px;cursor:pointer;font-size:14.5px}
.qbopt:hover{background:var(--surface2)}
.qbopt.on{background:color-mix(in srgb,var(--pri) 9%,transparent)}
.qbopt input{position:absolute;opacity:0;pointer-events:none}
.qbopt .grow{flex:1;min-width:0}
.qbopt small{display:block;color:var(--mut);font-size:12px}
.qbbox{width:22px;height:22px;border-radius:7px;border:2px solid var(--bd);display:grid;place-items:center;flex:none;color:transparent;transition:all .15s}
.qbopt.on .qbbox{background:var(--pri);border-color:var(--pri);color:#fff}
.qbopt i{font-style:normal;font-size:11.5px;font-weight:700;color:var(--mut);background:var(--surface2);border-radius:99px;padding:2px 8px}
.qbopt i.z{opacity:.55}
.qbpick{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px}
.qbx{display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:12.5px;font-weight:600;padding:5px 8px 5px 11px;border-radius:99px;border:1px solid color-mix(in srgb,var(--pri) 40%,var(--bd));background:color-mix(in srgb,var(--pri) 10%,var(--surface));color:var(--pri);cursor:pointer;max-width:100%;text-align:left}
.qbx.clr{background:none;border-color:var(--bd);color:var(--mut);padding:5px 11px}
.qbgo{display:flex;align-items:center;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--bd);flex-wrap:wrap}
.qbgo b{font-size:20px}
.qbsubs{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.qbsubs .card{margin-top:0}
.qbsub{display:flex;flex-direction:column;gap:4px;text-align:left;font:inherit;color:var(--tx);cursor:pointer;border:1px solid var(--bd)}
.qbbar{height:6px;border-radius:99px;background:var(--surface2);overflow:hidden;margin-top:6px}.qbbar i{display:block;height:100%;background:var(--grad);border-radius:99px}
.qbgenad,.qbhome.card{display:flex;align-items:center;gap:12px;cursor:pointer}
.qbhome{margin:14px 0}
.qblive{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 10%,var(--surface))}
.qbtiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qbtiles .card{margin:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;font:inherit;color:var(--tx);cursor:pointer;border:1px solid var(--bd)}
.qbtiles .qbi{margin-bottom:6px}
.qbtop{display:flex;align-items:center;gap:10px}
.qbrun .qcard{margin-top:12px}
.qbtags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.qbfb{display:flex;align-items:center;gap:6px;margin-top:12px;padding:10px 12px;border-radius:12px;font-size:14px;flex-wrap:wrap}
.qbfb.ok{background:var(--okSoft);color:var(--ok)}.qbfb.bad{background:var(--badSoft);color:var(--bad)}
.qbnav{display:flex;gap:8px;align-items:center;margin-top:12px}
.qbnav .grow,.qbgo .grow,.gnh .grow,.gnf .grow{flex:1}
.gnnew{margin-top:12px;padding:14px}
.gn .gnh{display:flex;gap:10px;align-items:flex-start}
.gn.live{border-color:color-mix(in srgb,var(--ok) 60%,var(--bd))}
.gnlive{animation:gnp 1.6s ease-in-out 4}
@keyframes gnp{50%{opacity:.45}}
.gnf{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.gnsc{text-align:right}.gnsc b{font-size:22px}.gnsc span{color:var(--mut);font-size:13px}
.gnt{font-size:22px;margin:4px 0 8px}
.gnrow{display:flex;gap:10px;flex-wrap:wrap}.gnrow>div{min-width:140px}
.gnform .seg{display:flex;flex-wrap:wrap}
.gnres{display:flex;align-items:center;gap:14px}
.gnres .grow{flex:1;min-width:0}
.gnring{--p:0;width:96px;height:96px;border-radius:50%;flex:none;display:grid;place-content:center;text-align:center;background:radial-gradient(closest-side,var(--surface) 78%,transparent 80% 100%),conic-gradient(var(--pri) calc(var(--p)*1%),var(--surface2) 0)}
.gnring b{font-size:22px;line-height:1}.gnring span{font-size:12px;color:var(--mut)}
.gnrf{margin:4px 0 4px;display:flex;flex-wrap:wrap}
.gnsol .qt{margin-bottom:10px}
.qb .tbl td,.qb .tbl th{white-space:nowrap}
@media (max-width:640px){.qbsubs{grid-template-columns:1fr 1fr}.gnring{width:80px;height:80px}.gnring b{font-size:18px}}
`;document.head.appendChild(st)}

;(window.__p=window.__p||{})['app25']=1;
