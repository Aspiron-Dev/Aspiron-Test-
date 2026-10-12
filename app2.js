function seriesList(){
  const free=CAT.series.filter(s=>s.is_free),paid=CAT.series.filter(s=>!s.is_free);
  let o=CAT.series.length>3?`<div class="searchbox">${ic('search',18)}<input type="search" placeholder="Search test series" oninput="filterSeries(this.value)"></div>`:'';
  if(!CAT.series.length)o+=`<div class="card empty">No test series have been added yet.</div>`;
  if(free.length)o+=`<div class="h2s">${ic('book',20)} Free practice <span class="n">${free.length}</span></div><div class="sgrid">${free.map(seriesCard).join('')}</div>`;
  if(paid.length)o+=`<div class="h2s">${ic('crown',20)} Premium series <span class="n">${paid.length}</span></div><div class="sgrid">${paid.map(seriesCard).join('')}</div>`;
  return o;
}
function filterSeries(v){v=v.trim().toLowerCase();document.querySelectorAll('.scard').forEach(c=>{c.style.display=!v||c.textContent.toLowerCase().includes(v)?'':'none'})}
function seriesStats(s){
  const ts=CAT.tests.filter(t=>t.series_id===s.id);
  return{n:ts.length,done:ts.filter(t=>t.attempts>0).length,folders:CAT.folders.filter(f=>f.series_id===s.id).length};
}
const tag=s=>s.is_free?`<span class="tag free">FREE</span>`:s.unlocked?`<span class="tag ok">${ic('check',12)} Unlocked</span>`:`<span class="tag paid">${ic('lock',12)} ${esc(s.price_label||'Premium')}</span>`;
const badge=s=>s.is_free?`<span class="pill free">FREE</span>`:s.unlocked?`<span class="pill">${ic('check')} UNLOCKED</span>`:`<span class="pill paid">${ic('lock')} ${esc(s.price_label||'PREMIUM')}</span>`;
function seriesCard(s){
  const st=seriesStats(s),p=st.n?Math.round(st.done*100/st.n):0;
  return `<div class="card scard" onclick="location.hash='#/s/${s.id}'">
   <div class="cover" style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}"><div class="ico">${ic(s.is_free?'book':'crown')}</div></div>
   <div class="body"><div class="ttl"><h3>${esc(s.title)}</h3>${tag(s)}</div>
    ${s.description?`<div class="mut sm clamp2">${esc(s.description)}</div>`:''}
    <div class="chips"><span class="chip">${st.n} test${st.n===1?'':'s'}</span>${st.folders?`<span class="chip">${st.folders} folder${st.folders===1?'':'s'}</span>`:''}${(s.files||[]).length?`<span class="chip pri">${ic('file',12)} Syllabus</span>`:''}</div>
    ${st.n?`<div><div class="row sm mut" style="justify-content:space-between;margin-bottom:6px"><span>Attempted</span><b style="color:var(--tx)">${st.done}/${st.n}</b></div><div class="bar"><i style="width:${p}%"></i></div></div>`:''}
    <button class="btn ${s.is_free||s.unlocked?'':'ghost'}" style="margin-top:auto">${s.is_free||s.unlocked?'Open':'View'} ${ic('right')}</button></div></div>`;
}

/* ---------- series & folder ---------- */
function lockBanner(s){
  if(s.is_free||s.unlocked)return '';
  const wa=waLink(`Hi, I am ${AUTH.name} (${AUTH.mobile}). Please unlock "${s.title}" for me.`);
  return `<div class="banner"><div style="color:var(--warn)">${ic('lock',26)}</div><div class="t"><b>Premium series</b><div class="sm mut">${esc(s.price_label?s.price_label+' · ':'')}Ask the admin to unlock this series for you. Some tests may be open as a free preview.</div></div>
   ${wa?`<a class="btn sm" style="text-decoration:none" href="${wa}" target="_blank" rel="noopener">${ic('msg')} Unlock</a>`:''}</div>`;
}
const KIND={syllabus:'Syllabus',schedule:'Schedule',notes:'Notes'};
const fsize=b=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
function filesBlock(s){
  const fl=s.files||[];if(!fl.length)return '';
  return `<div class="h2s">${ic('file',20)} Syllabus &amp; schedule</div><div class="card">${fl.map(f=>`<div class="rrow"><div class="tico">${ic('file')}</div>
    <div class="grow"><b>${esc(f.title)}</b><span class="sm mut">${KIND[f.kind]||'File'} · ${fsize(f.size)}</span></div>
    <button class="btn soft sm" onclick="openFile('${f.id}')">${ic('download')} Open</button></div>`).join('')}</div>`;
}
async function openFile(id){
  if(FILEURL[id])return showFile(id);
  modal(`<div class="spin"></div><p class="mut" style="text-align:center" id="fp">Downloading…</p>`);
  const parts=[];let n=0,total=1,mime='application/pdf',name='file';
  while(n<total){
    const r=await rpc('cbt_file_part',{p_file:id,p_n:n});
    if(!r.ok){closeModal();if(!authErr(r))toast('Could not download this file.');return}
    total=r.parts;mime=r.mime;name=r.name;parts.push(r.data||'');n++;
    const e=$('#fp');if(e)e.textContent=`Downloading… ${Math.round(n*100/total)}%`;
  }
  try{
    const bin=atob(parts.join(''));const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    FILEURL[id]={url:URL.createObjectURL(new Blob([u],{type:mime})),name};
  }catch(e){closeModal();toast('This file is damaged.');return}
  showFile(id);
}
function showFile(id){
  const f=FILEURL[id];
  modal(`<div class="logo" style="background:var(--ok)">${ic('check',24)}</div><h2>File ready</h2><p class="mut" style="margin:6px 0 14px">${esc(f.name)}</p>
   <div class="row"><a class="btn" style="flex:1;text-decoration:none" href="${f.url}" target="_blank" rel="noopener">${ic('eye')} View</a><a class="btn soft" style="flex:1;text-decoration:none" href="${f.url}" download="${esc(f.name)}">${ic('download')} Save</a></div>
   <button class="btn ghost block" style="margin-top:10px" onclick="closeModal()">Close</button>`);
}
function viewSeries(id){
  const s=CAT.series.find(x=>x.id===id);if(!s){location.hash='#/';return}
  const folders=CAT.folders.filter(f=>f.series_id===id),root=CAT.tests.filter(t=>t.series_id===id&&!t.folder_id);
  let o=`<div class="wrap"><div class="crumb"><a href="#/series">${ic('back',14)} Test series</a></div>
  <div class="card shx"><div class="shc cover" style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}"><div class="ico">${ic(s.is_free?'book':'crown')}</div></div>
   <div class="shb"><div class="ttl"><h1>${esc(s.title)}</h1>${tag(s)}</div>${s.description?`<p class="mut">${esc(s.description)}</p>`:''}</div></div>${lockBanner(s)}${filesBlock(s)}`;
  if(folders.length){
    o+=`<div class="h2s">${ic('folder',20)} Folders <span class="n">${folders.length}</span></div><div class="fgrid">${folders.map(f=>{
      const ts=CAT.tests.filter(t=>t.folder_id===f.id),d=ts.filter(t=>t.attempts>0).length;
      return `<div class="card fcard" onclick="location.hash='#/f/${f.id}'"><div class="fico">${ic('folder',22)}</div><div style="flex:1;min-width:0"><b>${esc(f.title)}</b><span class="sm mut">${ts.length} test${ts.length===1?'':'s'}${ts.length?` · ${d} done`:''}</span></div>${ic('right')}</div>`}).join('')}</div>`;
  }
  if(root.length)o+=`<div class="h2s">${ic('file',20)} Tests <span class="n">${root.length}</span></div>${root.map(t=>testRow(t)).join('')}`;
  if(!folders.length&&!root.length)o+=`<div class="card empty" style="margin-top:16px">No tests in this series yet.</div>`;
  setApp(o+'</div>');
}
function viewFolder(id){
  const f=CAT.folders.find(x=>x.id===id);if(!f){location.hash='#/';return}
  const s=CAT.series.find(x=>x.id===f.series_id);if(!s){location.hash='#/';return}
  const ts=CAT.tests.filter(t=>t.folder_id===id);
  setApp(`<div class="wrap"><div class="crumb"><a href="#/series">Test series</a> ${ic('right',12)} <a href="#/s/${s.id}">${esc(s.title)}</a></div>
  <div class="sh" style="background:${grad(s.id)}"><div style="position:relative;z-index:1;margin-bottom:8px"><span class="pill">${ic('folder')} FOLDER</span></div><h1>${esc(f.title)}</h1><p>${esc(s.title)}</p></div>${lockBanner(s)}
  <div class="h2s">${ic('file',20)} Tests <span class="n">${ts.length}</span></div>
  ${ts.length?ts.map(t=>testRow(t)).join(''):'<div class="card empty">No tests in this folder yet.</div>'}</div>`);
}
function testRow(t){
  const p=t.best!=null&&t.best_max?pct(t.best,t.best_max):null;
  const last=(CAT.results||[]).find(r=>r.test_id===t.id);
  const wait=isWait(t);
  const status=t.in_progress?'<span class="chip warn">In progress</span>':wait?`<span class="chip pri">${ic('calendar',12)} ${esc(fmtWhen(t.opens_at))}</span>`:t.locked?`<span class="chip lockbadge">${ic('lock',12)} Locked</span>`
    :t.attempts?`<span class="chip ok">Attempted ${t.attempts}×</span>`:'<span class="chip pri">New</span>';
  const cta=t.locked?`<button class="btn ghost sm" onclick="openTest('${t.id}')">${ic('lock')} Unlock</button>`
    :(wait&&!t.in_progress)?`<button class="btn ghost sm" disabled>${ic('clock')} <span data-op="${t.opens_at}">--:--</span></button>`
    :`<button class="btn sm" onclick="openTest('${t.id}')">${t.in_progress?'Resume':t.attempts?'Try again':'Start'} ${ic('right')}</button>`;
  return `<div class="card trow"><div class="tico">${ic(t.locked?'lock':wait?'calendar':'file')}</div>
   <div class="info"><h3>${esc(t.title)}</h3><div class="chips"><span class="chip">${t.questions} questions</span><span class="chip">${t.duration} min</span>${status}${t.free_preview&&t.locked===false?'<span class="chip pri">Free preview</span>':''}</div>
   ${p!=null?`<div style="margin-top:10px"><div class="row sm mut" style="justify-content:space-between;margin-bottom:5px"><span>Best score</span><b style="color:var(--tx)">${t.best}/${t.best_max} · ${p}%</b></div><div class="bar"><i style="width:${p}%"></i></div></div>`:''}</div>
   <div class="acts">${last?`<button class="btn soft sm" onclick="openReview('${last.id}')">${ic('eye')} Review</button>`:''}${cta}</div></div>`;
}

/* ---------- images / bookmarks / reports ---------- */
const imgTag=(src,cls)=>src?`<img class="qi zm ${cls||''}" src="${esc(src)}" alt="diagram" loading="lazy">`:'';
document.addEventListener('click',e=>{
  const im=e.target.closest&&e.target.closest('img.zm');
  if(im){e.preventDefault();e.stopPropagation();const d=document.createElement('div');d.className='lightbox';d.innerHTML=`<img src="${im.src}"><button class="btn sm ghost">${ic('x')} Close</button>`;d.onclick=()=>d.remove();document.body.appendChild(d)}
});
async function toggleBM(tid,i,fromBM){
  const k=tid+':'+i,on=!BM.has(k);
  if(on)BM.add(k);else BM.delete(k);
  const b=document.querySelector(`[data-bm="${k}"]`);if(b)b.classList.toggle('on',on);
  const r=await rpc('cbt_bookmark',{p_test:tid,p_qidx:i,p_on:on});
  if(!r.ok){
    if(on)BM.delete(k);else BM.add(k);
    if(b)b.classList.toggle('on',!on);
    toast(r.error==='limit'?'Bookmark limit reached (500).':'Could not save the bookmark.');return;
  }
  if(fromBM){const c=document.querySelector(`[data-bmcard="${k}"]`);if(c&&!on)c.remove()}
  else toast(on?'Bookmarked ★':'Bookmark removed');
}
const bmBtn=(tid,i)=>`<button class="iconbtn sm ${BM.has(tid+':'+i)?'on':''} bmb" data-bm="${tid}:${i}" aria-label="Bookmark" onclick="toggleBM('${tid}',${i})">${ic('star',17)}</button>`;
const rpBtn=(tid,i)=>`<button class="iconbtn sm" aria-label="Report a problem" title="Report a problem" onclick="reportQ('${tid}',${i})">${ic('flag',16)}</button>`;
function reportQ(tid,i){
  modal(`<h2>Report question ${i+1}</h2><p class="mut sm" style="margin:4px 0 0">Tell the admin what is wrong. They will check and fix it.</p>
   <label class="l">What is the problem?</label>
   <select id="rk"><option value="wrong_answer">Correct answer looks wrong</option><option value="wrong_question">Question is wrong or unclear</option><option value="missing_option">Option is missing / incorrect</option><option value="bad_image">Diagram / image problem</option><option value="other">Something else</option></select>
   <label class="l">Details (optional)</label><textarea id="rn2" maxlength="500" placeholder="Write a short note…" style="min-height:70px"></textarea>
   <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="rsb" onclick="sendReport('${tid}',${i})">Send report</button></div>`);
}
async function sendReport(tid,i){
  const b=$('#rsb');b.disabled=true;b.textContent='Sending…';
  const r=await rpc('cbt_report',{p_test:tid,p_qidx:i,p_kind:$('#rk').value,p_note:$('#rn2').value});
  closeModal();
  toast(r.ok?'Thank you! Your report was sent.':r.error==='limit'?'Too many reports today. Please try later.':'Could not send the report.');
}
async function viewBookmarks(){
  loading('Loading bookmarks…');
  const r=await rpc('cbt_bookmarks',{});
  if(!r.ok){if(!authErr(r))toast('Could not load bookmarks.');return}
  const groups={};r.items.forEach(x=>{(groups[x.test_id]=groups[x.test_id]||{title:x.title,items:[]}).items.push(x)});
  let o=`<div class="wrap">${tabsHtml('bm')}`;
  if(!r.items.length)o+=`<div class="card empty">${ic('star',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">No bookmarks yet</h3><p class="sm">Tap the ★ on any question during a test or review to save it here.</p></div>`;
  Object.keys(groups).forEach(tid=>{
    const g=groups[tid];
    o+=`<div class="h2s">${ic('file',20)} ${esc(g.title)} <span class="n">${g.items.length}</span></div>`;
    o+=g.items.map(q=>`<div class="card rv" data-bmcard="${tid}:${q.qidx}"><div class="row" style="margin-bottom:8px"><b>Q${q.qidx+1}</b><span style="flex:1"></span>${q.solved?rpBtn(tid,q.qidx):''}<button class="iconbtn sm on bmb" onclick="toggleBM('${tid}',${q.qidx},true)" aria-label="Remove bookmark">${ic('star',17)}</button></div>
      <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
      ${q.options.map((op,j)=>`<div class="ro ${q.solved&&j===q.answer?'c':''}"><span class="k">${L[j]}</span><span style="flex:1">${esc(op)}${imgTag(q.oimg&&q.oimg[j],'oi')}</span>${q.solved&&j===q.answer?'<span class="tag g">Correct</span>':''}</div>`).join('')}
      ${q.solved?(q.answer==null?'':'')+((q.explanation||q.eimg)?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''):`<div class="sm mut" style="margin-top:6px">${ic('lock',13)} The correct answer appears here after you attempt this test.</div>`}</div>`).join('');
  });
  setApp(o+'</div>');setNav('bm');
}

/* ---------- starting a test ---------- */
const progKey=id=>'cbt_prog_'+AUTH.mobile+'_'+id;
const getProg=id=>LS.get(progKey(id),null);
const saveProg=()=>LS.set(progKey(P.tid),P);
function openTest(id){
  const t=CAT.tests.find(x=>x.id===id);if(!t)return;
  const s=CAT.series.find(x=>x.id===t.series_id)||{};
  if(t.locked){
    const wa=waLink(`Hi, I am ${AUTH.name} (${AUTH.mobile}). Please unlock "${s.title}" for me.`);
    return modal(`<div class="logo" style="background:var(--warn)">${ic('lock',24)}</div><h2>This test is locked</h2>
      <p class="mut" style="margin:6px 0 14px">"${esc(s.title||'This series')}" is a premium series${s.price_label?' ('+esc(s.price_label)+')':''}. Ask the admin to unlock it for your account.</p>
      <div class="row">${wa?`<a class="btn" style="flex:1;text-decoration:none" href="${wa}" target="_blank" rel="noopener">${ic('msg')} Contact admin</a>`:''}<button class="btn ghost" style="flex:1" onclick="closeModal()">Close</button></div>`);
  }
  RET=location.hash||'#/';
  if(getProg(id)||t.in_progress)return startTest(id);
  instr(t,s);
}
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
  if(!(p&&p.sid===r.session.id))p={tid:id,sid:r.session.id,cid:uuid(),ans:{},mark:{},vis:{0:1},cur:0,title:T.title};
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
function run(){
  document.body.classList.add('intest');palOpen=false;secSetup();
  window.onbeforeunload=e=>{e.preventDefault();e.returnValue=''};
  clearInterval(timer);draw();timer=setInterval(tick,1000);tick();
}
function tick(){
  if(!P)return;
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
function go(i){if(i<0||i>=T.questions.length)return;P.cur=i;palOpen=false;saveProg();draw();window.scrollTo(0,0)}
function goSec(name){const idx=secIdx(name);if(!idx.length)return;go(idx.includes(P.cur)?P.cur:idx[0])}
function sel(i){P.ans[P.cur]=i;saveProg();draw()}
function clr(){delete P.ans[P.cur];saveProg();draw()}
function saveNext(){delete P.mark[P.cur];nxt()}
function markNext(){P.mark[P.cur]=1;nxt()}
function nxt(){if(P.cur<T.questions.length-1)P.cur++;saveProg();draw();window.scrollTo(0,0)}

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
  clearInterval(timer);window.onbeforeunload=null;
  const it={tid:P.tid,cid:P.cid,ans:P.ans,title:(T&&T.title)||P.title,ts:Date.now()};
  addPend(it);LS.del(progKey(P.tid));
  INTEST=false;P=null;T=null;document.body.classList.remove('intest');
  await sendPending(it);
}
let CURPEND=null;
async function sendPending(it){
  CURPEND=it;clearTimeout(retryT);loading('Submitting your answers…');
  const r=await rpc('cbt_submit',{p_test:it.tid,p_answers:it.ans,p_client_id:it.cid});
  if(r.ok){
    delPend(it.cid);CAT=null;
    RV={result:r.result,review:r.review,filter:'all'};
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
;(window.__p=window.__p||{})['app2']=1;
