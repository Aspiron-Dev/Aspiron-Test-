function tabsHtml(tab){
  const b=(k,h,t)=>`<button class="${tab===k?'on':''}" onclick="location.hash='${h}'">${t}</button>`;
  return `<div class="sec-h hometabs"><div class="seg">${b('dash','#/','Dashboard')}${b('series','#/series','Test series')}${b('mk','#/m','Mistakes')}${b('bm','#/b','Bookmarks')}${b('results','#/r','Results')}</div></div>`;
}
function resultRow(x){
  const p=pct(x.score,x.max);
  return `<div class="rrow"><div class="mring">${ring(p,54,6,ringCol(p))}<span>${p}%</span></div>
    <div class="grow"><b>${esc(x.title)}</b><span class="sm mut">${new Date(x.at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · ${x.score}/${x.max} · ✓${x.correct} ✗${x.wrong}</span></div>
    <button class="btn soft sm" onclick="openReview('${x.id}')">Review</button></div>`;
}
function viewHome(tab){
  const R=CAT.results||[];
  const P=pstats(R),avg=P.avg,best=P.best;
  const hr=new Date().getHours(),gr=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const nm=(AUTH.name||'').trim();
  let o=`<div class="wrap">${tab!=='dash'?'':`<div class="hero"><div class="who"><div class="bigav">${pfInner(nm)}</div>
   <div><div class="sm" style="opacity:.85">${gr}</div><h1>${esc(nm.split(' ')[0])}</h1><span class="lvl${/Achiever|Champion/.test(P.lvl)?' gold':''}">${/Achiever|Champion/.test(P.lvl)?ic('crown',12):''}${P.lvl}</span></div>
   <div class="streak"><b>${P.streak}🔥</b><span>day streak</span></div></div>
  <div class="stats"><div class="stat"><b data-cu="${R.length}">${R.length}</b><span>Tests taken</span></div><div class="stat"><b data-cu="${avg}">${avg}%</b><span>Average</span></div><div class="stat"><b data-cu="${best}">${best}%</b><span>Best</span></div></div></div>`}${tabsHtml(tab)}`;
  if(tab==='dash')o+=dashBody(R,avg);
  else if(tab==='series')o+=seriesList();
  else{
    if(!R.length)o+=`<div class="card empty">You have not attempted any test yet.</div>`;
    else o+=histList(R);
  }
  setApp(o+'</div>');setNav(tab);
  if(tab==='dash'){loadNotice();cdTick();if(R.length)loadIns()}
}
function dashBody(R,avg){
  let o='<div id="notice"></div>'+cdCard();
  const pn=getPend();
  if(pn.length)o+=`<div class="card pendc"><span class="mki">${ic('wifi',22)}</span><div class="grow"><b>${pn.length} test waiting to submit</b><div class="sm mut">Your answers are safe on this phone. They will be sent when internet is back.</div></div><button class="btn sm" onclick="retryPend()">Submit now</button></div>`;
  const prog=CAT.tests.filter(t=>t.in_progress&&!t.locked);
  if(prog.length)o+=`<div class="h2s">${ic('play',20)} Continue your test</div>${prog.map(testRow).join('')}`;
  const up=CAT.tests.filter(t=>isWait(t)).sort((a,b)=>a.opens_at-b.opens_at);
  if(up.length)o+=`<div class="h2s">${ic('calendar',20)} Upcoming tests <span class="n">${up.length}</span></div>${up.map(testRow).join('')}`;
  const P=pstats(R),acc=P.acc,cor=P.cor,secs=P.secs;
  const trend=R.slice(0,10).reverse().map(x=>pct(x.score,x.max));
  const nxt=CAT.tests.filter(t=>!t.locked&&!t.attempts&&!t.in_progress&&!isWait(t)&&CAT.series.some(s=>s.id===t.series_id&&(s.is_free||s.unlocked)))[0];
  if(nxt)o+=`<div class="h2s">${ic('play',20)} Up next for you</div><div class="next"><div class="grow"><b>${esc(nxt.title)}</b><div class="sm mut">${nxt.questions} questions · ${nxt.duration} min</div></div><button class="btn sm" onclick="openTest('${nxt.id}')">Start</button></div>`;
  if(R.length){
    const mx=Math.max(1,...P.week.map(w=>w.n));
    o+=`<div class="h2s">${ic('target',20)} Your performance</div><div class="dtop">
      <div class="card"><div class="accwrap"><div class="ringbox">${ring(acc,96,10,ringCol(acc))}<span>${acc}%</span></div>
        <div><b>Accuracy</b><div class="sm mut">${cor} correct of ${P.tot} attempted</div><div class="sm mut" style="margin-top:4px">${Math.round(secs/3600*10)/10}h practised · ${BM.size} bookmarks</div></div></div></div>
      <div class="card"><b>This week</b><span class="sm mut"> · tests per day</span><div class="week">${P.week.map(w=>`<div><i class="${w.n?'':'z'}" style="height:${w.n?Math.max(14,w.n/mx*100):0}%"></i>${w.l}</div>`).join('')}</div></div></div>
      ${trend.length>1?`<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between"><b>Score trend</b><span class="sm mut">Last ${trend.length} tests · best ${P.best}%</span></div><div class="trend">${spark(trend)}</div></div>`:''}
      <div id="ins"></div><div class="h2s">${ic('trophy',20)} Achievements <span class="n">${P.badges.filter(b=>b.on).length}/${P.badges.length}</span></div><div class="badges">${P.badges.map(b=>`<div class="bdg ${b.on?'on':''}"><b>${b.i}</b>${b.t}</div>`).join('')}</div>
      <div class="h2s">${ic('clock',20)} Recent results</div><div class="card">${R.slice(0,4).map(resultRow).join('')}</div>
      ${R.length>4?`<div style="text-align:center;margin-top:10px"><button class="btn ghost sm" onclick="location.hash='#/r'">All results</button></div>`:''}`;
  }else{
    o+=`<div class="card empty" style="margin-top:16px">${ic('target',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">Take your first test</h3><p class="sm">Your scores, accuracy and progress will appear here.</p><button class="btn" onclick="location.hash='#/series'">Browse test series</button></div>`;
  }
  const ser=CAT.series.map(s=>({s,st:seriesStats(s)})).filter(x=>x.st.n);
  if(ser.length)o+=`<div class="h2s">${ic('book',20)} Series progress</div><div class="card">${ser.map(({s,st})=>{const p=Math.round(st.done*100/st.n);
    return `<div class="prow" onclick="location.hash='#/s/${s.id}'"><div class="row sm" style="justify-content:space-between;margin-bottom:6px"><b>${esc(s.title)}</b><span class="mut">${st.done}/${st.n} attempted</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`}).join('')}</div>`;
  return o;
}

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
   <div class="cover" style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}">${s.is_free?'':`<span class="prem">${ic('crown',12)} PREMIUM</span>`}<div class="ico">${ic(s.is_free?'book':'crown')}</div></div>
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
    <div class="grow"><b>${esc(f.title)}</b><span class="sm mut">${KIND[f.kind]||'File'}</span></div>
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
    :(wait&&!t.in_progress)?`<button class="btn ghost sm" disabled>${ic('clock')} <span data-op="${t.opens_at}">--:--</span></button><button class="btn soft sm" onclick="remindMe('${t.id}')">${ic('calendar')} Remind me</button>`
    :`<button class="btn sm" onclick="openTest('${t.id}')">${t.in_progress?'Resume':t.attempts?'Try again':'Start'} ${ic('right')}</button>`;
  return `<div class="card trow"><div class="tico">${ic(t.locked?'lock':wait?'calendar':'file')}</div>
   <div class="info"><h3>${esc(t.title)}</h3><div class="chips"><span class="chip">${t.questions} questions</span><span class="chip">${t.duration} min</span>${t.practice?'<span class="chip ok">Practice</span>':''}${status}${t.free_preview&&t.locked===false?'<span class="chip pri">Free preview</span>':''}</div>
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
  skelPage();
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
const PRACID={};
const isPrac=id=>PRACID[id]||(CAT&&CAT.tests.some(t=>t.id===id&&t.practice));
const tdKey=id=>'cbt_td_'+AUTH.mobile+'_'+id;
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
;(window.__p=window.__p||{})['app2']=1;
