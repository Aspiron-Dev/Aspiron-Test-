/* ===== v17: live test = one attempt; clean series, folder and test rows (no % bars) =====
   Server: supabase_v33_live_one_attempt.sql refuses a second start of a live test until the result time. */

/* ---------- one attempt while live ---------- */
// end of the live window: result time, or "Live ends" when no result time is set
const liveTill=t=>t&&!t.practice?(t.result_at||t.closes_at||null):null;
const liveDone=t=>!!(t&&t.attempts>0&&!t.in_progress&&!getProg(t.id)&&liveTill(t)&&srvNow()<liveTill(t));
function liveDoneMsg(t){toast('You have already attempted this live test. You can attempt it again after '+fmtWhen(liveTill(t))+'.')}
{const _o=openTest;openTest=function(id){const t=CAT&&CAT.tests.find(x=>x.id===id);if(liveDone(t))return liveDoneMsg(t);return _o(id)}}
{const _s=startTest;startTest=async function(id){
  const t=CAT&&CAT.tests.find(x=>x.id===id);
  if(liveDone(t)){liveDoneMsg(t);return route()}
  return _s(id);
}}

/* ---------- shared bits ---------- */
const tStat2=(t,L)=>t.in_progress?'prog':t.locked?'lock':isWait(t)?'wait':liveDone(t)?'held':t.attempts?'done':isClosed(t)?'closed':L.has(t.id)?'live':'new';
const nTests=n=>`${n} test${n===1?'':'s'}`;
let TLF='all';
function tlFilt(ts){
  if(ts.length<4)return '';
  const L=liveIds(),c={all:ts.length,new:0,done:0,wait:0};
  ts.forEach(t=>{const s=tStat2(t,L);if(['new','live','prog'].includes(s))c.new++;else if(s==='done'||s==='held')c.done++;else if(s==='wait')c.wait++});
  const b=(k,x)=>c[k]||k==='all'?`<button class="chip ${TLF===k?'pri':''}" data-f="${k}" onclick="TLF='${k}';tlDraw()">${x} <small>${c[k]}</small></button>`:'';
  return `<div class="chiprow">${b('all','All')}${b('new','To attempt')}${b('done','Attempted')}${b('wait','Upcoming')}</div>`;
}
function tlList(ts){
  const L=liveIds(),l=ts.filter(t=>{const s=tStat2(t,L);return TLF==='all'||(TLF==='new'?['new','live','prog'].includes(s):TLF==='done'?s==='done'||s==='held':TLF===s)});
  return l.length?`<div class="tl3">${l.map(testRow).join('')}</div>`:`<div class="card empty sm">No tests here.</div>`;
}
let TLSRC=()=>[];
function tlDraw(){const ts=TLSRC(),f=$('#tlf'),l=$('#tll');if(f)f.innerHTML=tlFilt(ts);if(l)l.innerHTML=tlList(ts)}
function tlBlock(ts,src,title){
  TLSRC=src;
  return `<div class="h2s">${ic('file',20)} ${title||'Tests'} <span class="n">${ts.length}</span></div><div id="tlf">${tlFilt(ts)}</div><div id="tll">${tlList(ts)}</div>`;
}

/* ---------- series list: no progress ring / bars ---------- */
function seriesList(){
  const S=CAT.series,tot=CAT.tests.length;
  if(!S.length)return `<div class="card empty">No test series have been added yet.</div>`;
  const cnt={all:S.length,free:S.filter(s=>s.is_free).length,prem:S.filter(s=>!s.is_free).length,mine:S.filter(s=>serInfo(s).done>0).length};
  const fb=(k,t)=>cnt[k]||k==='all'?`<button class="chip ${SLF===k?'pri':''}" onclick="SLF='${k}';slDraw()">${t} <small>${cnt[k]}</small></button>`:'';
  return `<div class="slhead"><div><h1 class="slt">Test series</h1><div class="sm mut">${S.length} series · ${nTests(tot)}</div></div></div>
   <div class="qsearch">${ic('search',17)}<input type="search" placeholder="Search test series…" oninput="filterSeries(this.value)"></div>
   <div class="chiprow">${fb('all','All')}${fb('mine','My series')}${fb('free','Free')}${fb('prem','Premium')}</div>
   <div id="sllist">${slList()}</div>`;
}
function seriesCard(s){
  const I=serInfo(s),open=s.is_free||s.unlocked;
  const sub=I.live.length?`<div class="sc3n live"><span class="liveb"><i></i>LIVE</span><span class="grow">${esc(I.live[0].title)}</span></div>`
    :I.prog?`<div class="sc3n prog">${ic('play',14)}<span class="grow">Test in progress — resume</span></div>`
    :I.nxt?`<div class="sc3n">${ic('calendar',14)}<span class="grow">Next: <b>${esc(I.nxt.title)}</b> · ${esc(fmtWhen(I.nxt.opens_at))}</span></div>`:'';
  return `<div class="card scard2 sc3" onclick="location.hash='#/s/${s.id}'">
   <div class="cover sc2c" style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}"><div class="ico">${ic(s.is_free?'book':'crown')}</div></div>
   <div class="sc2b"><div class="sc2tt"><h3>${esc(s.title)}</h3>${tag(s)}</div>${s.description?`<div class="mut sm clamp2">${esc(s.description)}</div>`:''}
    <div class="sc3m">${I.n?nTests(I.n):'Tests coming soon'}${I.folders?` · ${I.folders} folder${I.folders===1?'':'s'}`:''}${I.done?` · ${I.done} attempted`:''}</div>
    ${sub}
    <div class="sc2f"><span class="btn sm block ${open?'':'ghost'}">${open?(I.done?'Continue':'Open series'):'View details'} ${ic('right',14)}</span></div></div></div>`;
}

/* ---------- series page: plain header, folder list, tests ---------- */
function viewSeries(id){
  const s=CAT.series.find(x=>x.id===id);if(!s){location.hash='#/';return}
  if(SVID!==id){SVID=id;TLF='all'}
  const I=serInfo(s),folders=CAT.folders.filter(f=>f.series_id===id);
  const hl=I.live[0]||CAT.tests.find(t=>t.series_id===id&&t.in_progress)||I.nxt;
  let o=`<div class="wrap"><div class="crumb"><a href="#/series">${ic('back',14)} Test series</a></div>
  <div class="card shx sv3"><div class="shc cover" style="background:${grad(s.id)}" data-cov="${s.id}" data-v="${s.cover_v||0}"><div class="ico">${ic(s.is_free?'book':'crown')}</div>
    <button class="shbtn" aria-label="Share" title="Share" onclick="event.stopPropagation();shareSeries('${id}')">${ic('share',18)}</button></div>
   <div class="shb"><div class="ttl"><h1>${esc(s.title)}</h1>${tag(s)}</div>${s.description?`<p class="mut">${esc(s.description)}</p>`:''}
    <div class="sv3m"><span>${ic('file',14)} ${nTests(I.n)}</span>${folders.length?`<span>${ic('folder',14)} ${folders.length} folder${folders.length===1?'':'s'}</span>`:''}${I.done?`<span>${ic('check',14)} ${I.done} attempted</span>`:''}</div></div></div>
  ${lockBanner(s)}`;
  if(hl){const st=tStat2(hl,liveIds());
    o+=`<div class="card svhl ${st}"><div class="grow"><div class="svhlk">${st==='live'?'<span class="liveb"><i></i>LIVE NOW</span>':st==='prog'?'<span class="chip warn">In progress</span>':`<span class="chip pri">${ic('calendar',12)} Next test</span>`}</div>
     <b>${esc(hl.title)}</b><div class="sm mut">${hl.questions} questions · ${hl.duration} min${st==='wait'?' · '+esc(fmtWhen(hl.opens_at)):''}</div></div>
     ${st==='wait'?(typeof alBtn==='function'?alBtn(hl.id):''):`<button class="btn sm" onclick="openTest('${hl.id}')">${st==='prog'?'Resume':'Start'} ${ic('right',14)}</button>`}</div>`;}
  o+=filesBlock(s);
  if(folders.length){
    o+=`<div class="h2s">${ic('folder',20)} Folders <span class="n">${folders.length}</span></div><div class="fl3">${folders.map(f=>{
      const ts=CAT.tests.filter(t=>t.folder_id===f.id),L=liveIds(),lv=ts.some(t=>tStat2(t,L)==='live'),d=ts.filter(t=>t.attempts>0).length;
      return `<div class="card fr3" onclick="location.hash='#/f/${f.id}'"><div class="fico">${ic('folder',20)}</div>
       <div class="grow"><b>${esc(f.title)}</b><span class="sm mut">${ts.length?nTests(ts.length)+(d?` · ${d} attempted`:''):'No tests yet'}</span></div>
       ${lv?'<span class="liveb"><i></i>LIVE</span>':''}<span class="fr3c">${ic('right',18)}</span></div>`}).join('')}</div>`;
  }
  const root=CAT.tests.filter(t=>t.series_id===id&&!t.folder_id);
  if(root.length)o+=tlBlock(root,()=>CAT.tests.filter(t=>t.series_id===SVID&&!t.folder_id));
  if(!folders.length&&!root.length)o+=`<div class="card empty" style="margin-top:16px">No tests in this series yet.</div>`;
  setApp(o+'</div>');
}

/* ---------- folder page ---------- */
let FVID=null;
function viewFolder(id){
  const f=CAT.folders.find(x=>x.id===id);if(!f){location.hash='#/';return}
  const s=CAT.series.find(x=>x.id===f.series_id);if(!s){location.hash='#/';return}
  if(FVID!==id){FVID=id;TLF='all'}
  const ts=CAT.tests.filter(t=>t.folder_id===id),d=ts.filter(t=>t.attempts>0).length;
  setApp(`<div class="wrap"><div class="crumb"><a href="#/s/${s.id}">${ic('back',14)} ${esc(s.title)}</a></div>
  <div class="card fh3"><div class="fico">${ic('folder',24)}</div><div class="grow"><h1>${esc(f.title)}</h1><div class="sm mut">${esc(s.title)} · ${nTests(ts.length)}${d?` · ${d} attempted`:''}</div></div></div>
  ${lockBanner(s)}
  ${ts.length?tlBlock(ts,()=>CAT.tests.filter(t=>t.folder_id===FVID)):'<div class="card empty">No tests in this folder yet.</div>'}</div>`);
}

/* ---------- test row: one status, one button, no % bar ---------- */
function testRow(t){
  const st=tStat2(t,liveIds()),last=(CAT.results||[]).find(r=>r.test_id===t.id),pd=pendOf(t.id);
  const chip={prog:'<span class="chip warn">In progress</span>',
    wait:`<span class="chip pri">${ic('calendar',12)} ${esc(fmtWhen(t.opens_at))}</span>`,
    lock:`<span class="chip lockbadge">${ic('lock',12)} Locked</span>`,
    held:`<span class="chip ok">${ic('check',12)} Submitted</span>`,
    done:`<span class="chip ok">${ic('check',12)} Attempted${t.attempts>1?' '+t.attempts+'×':''}</span>`,
    closed:`<span class="chip">${ic('clock',12)} Closed</span>`,
    live:'<span class="liveb"><i></i>LIVE</span>',
    new:'<span class="chip pri">New</span>'}[st];
  const note=st==='held'?`Result &amp; re-attempt after ${esc(fmtWhen(liveTill(t)))}`
    :pd?`Result after ${esc(fmtWhen(pd.result_at))}`
    :t.best!=null&&t.best_max&&st==='done'?`Best score ${t.best}/${t.best_max}`:'';
  const cta=st==='lock'?`<button class="btn ghost sm" onclick="openTest('${t.id}')">${ic('lock')} Unlock</button>`
    :st==='wait'?`<button class="btn ghost sm" disabled>${ic('clock')} <span data-op="${t.opens_at}">--:--</span></button>${typeof alBtn==='function'?alBtn(t.id):''}`
    :st==='closed'?`<button class="btn ghost sm" disabled>${ic('lock')} Closed</button>`
    :st==='held'?`<button class="btn ghost sm" disabled>${ic('lock')} Attempted</button>`
    :`<button class="btn sm" onclick="openTest('${t.id}')">${st==='prog'?'Resume':st==='done'?'Re-attempt':'Start'} ${ic('right')}</button>`;
  return `<div class="card trow tr3 st-${st}"><div class="tico">${ic(st==='lock'?'lock':st==='wait'?'calendar':st==='done'||st==='held'?'check':'file')}</div>
   <div class="info"><h3>${esc(t.title)}</h3><div class="tr3m">${t.questions} questions · ${t.duration} min${t.practice?' · Practice':''}${t.free_preview&&t.locked===false?' · Free preview':''}</div>
    <div class="chips">${chip}</div>${note?`<div class="tr3n">${note}</div>`:''}</div>
   <div class="acts">${last&&!pd?`<button class="btn soft sm" onclick="openReview('${last.id}')">${ic('eye')} Review</button>`:''}${cta}</div></div>`;
}

;(window.__p=window.__p||{})['app17']=1;
