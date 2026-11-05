/* ===== app24: Test series — swipe shelves, new series page, new folders =====
   • Test series (#/series, no search / category picked): a Featured carousel (swipe left / right, dots, moves on by itself
     every 5 s until the student touches it), then one swipe row per category (store sections, Free practice, More),
     each with "See all". A search or a category chip shows the grid of app23 as before.
   • Series page (#/s/…): full-width cover (zooms gently while scrolling), back + share on glass buttons, title, tags,
     stats, progress, then tabs: Folders · All tests · Material. Keeps the medium card (app19), the lock / Buy now banner
     (app23), the next / live test card and the reviews card (app14).
   • Folder page (#/f/…): coloured header with progress, then its tests.
   Uses only data the app already has (cbt_catalog + the public store); nothing new is sent to the server. */
IC.grid2='<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>';

/* ---------- Test series: featured carousel + swipe rows ---------- */
{const _d=tsDraw;tsDraw=function(){
  _d();
  if(tsMy()||TSF.q||TSF.sec)return;
  const l=document.getElementById('tslist');if(!l)return;
  const S=CAT.series,L=S.filter(s=>!tsOwn(s)&&tsPass(s,true));
  if(L.length<3)return;   // a short list reads better as the plain grid
  const nOwn=S.filter(tsOwn).length;
  l.innerHTML=`<div class="tscount">${L.length} series${TSF.ex||TSF.cl?' for '+esc(tsSelTxt()):''}</div>${tsFeat(L)}${tsShelves(L)}`
    +(nOwn?`<button class="tsown" onclick="location.hash='#/my'">${ic('check',16)}<span>You own ${nOwn} series. They are in <b>My tests</b>.</span>${ic('right',16)}</button>`:'');
  loadCovers();tsCarStart();
}}
function tsFeatPick(L){
  const sc=s=>{const it=itemOf(s);return (it&&it.badge?4:0)+(tsId(it)&&it.buy_on!==false?2:0)+(s.is_free?0:1)};
  return L.map((s,i)=>({s,i,k:sc(s)})).sort((a,b)=>b.k-a.k||a.i-b.i).slice(0,5).map(x=>x.s);
}
function tsFeat(L){
  const F=tsFeatPick(L);
  return `<section class="tsfe" aria-label="Featured test series"><div class="tsfe-t" id="tsfe" onscroll="tsFeDot()" onpointerdown="TSCAR.t=Date.now()" ontouchstart="TSCAR.t=Date.now()">${F.map((s,i)=>{
    const it=itemOf(s),g=tsTags(s,it),rv=it&&SHOP&&SHOP.rv[it.id],I=serInfo(s);
    const tags=[...g.ex.map(x=>EXN[x]),...g.cl.map(x=>CLN[x])];
    const badge=s.is_free?'<span class="tsb free">Free</span>':it&&it.badge?`<span class="tsb">${esc(it.badge)}</span>`:it&&it.buy_on===false?'<span class="tsb soon">Coming soon</span>':'<span class="tsb">Featured</span>';
    return `<article class="tsfc" style="--d:${i*70}ms" onclick="location.hash='#/s/${s.id}'">${tsCover(s,it,'tsfcv')}
      ${badge}${rv&&rv.count?tsStars(rv.avg):''}
      <div class="tsfcb">${tags.length?`<div class="tsfct">${tags.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
       <h3>${esc(s.title)}</h3><p>${esc((it&&it.subtitle)||s.description||nTests(I.n))}</p>
       <div class="tsfcf">${tsPrice(s,it)}<div class="tsbt"><button class="btn sm tsglass" onclick="event.stopPropagation();tsExplore('${s.id}')">Explore</button>${tsCta(s,it)}</div></div></div></div></article>`}).join('')}</div>
   ${F.length>1?`<div class="tsfe-d" id="tsfed">${F.map((_,i)=>`<i class="${i?'':'on'}" onclick="tsFeGo(${i})"></i>`).join('')}</div>`:''}</section>`;
}
function tsShelves(L){
  const G=new Map(),order=(SHOP&&SHOP.sections||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean);
  const add=(k,n,s)=>{if(!G.has(k))G.set(k,{k,n,L:[]});G.get(k).L.push(s)};
  L.forEach(s=>{const sec=tsTags(s,itemOf(s)).sec;if(s.is_free)add('free','Free practice',s);else if(sec)add(sec.toLowerCase(),sec,s);else add('','More test series',s)});
  // a section with one series would be a lonely row: it joins "More test series"
  G.forEach((g,k)=>{if(k!=='free'&&k!==''&&g.L.length<2){G.delete(k);g.L.forEach(s=>add('','More test series',s))}});
  if(G.size===1&&G.has(''))G.get('').n='All test series';
  const rank=g=>g.k==='free'?900:g.k===''?1000:(order.indexOf(g.k)+1||800);
  return [...G.values()].sort((a,b)=>rank(a)-rank(b)).map(g=>`<section class="tssh"><div class="tssh-h"><h2>${esc(g.n)} <span>${g.L.length}</span></h2>
     ${g.k!==''&&g.L.length>1?`<button onclick="TSF.sec=${esc(JSON.stringify(g.k))};tsDraw();document.getElementById('tsq').scrollIntoView({behavior:'smooth',block:'start'})">See all ${ic('right',14)}</button>`:''}</div>
    <div class="tssh-r">${g.L.map((s,i)=>tsMini(s,i)).join('')}</div></section>`).join('');
}
function tsMini(s,i){
  const it=itemOf(s),I=serInfo(s),rv=it&&SHOP&&SHOP.rv[it.id];
  const badge=s.is_free?'<span class="tsb free">Free</span>':it&&it.badge?`<span class="tsb">${esc(it.badge)}</span>`:'';
  const nx=I.live.length?'<span class="liveb"><i></i>LIVE</span>':I.nxt?`Next ${esc(new Date(I.nxt.opens_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}))}`:'';
  const act=s.is_free?`<span class="tskgo free" aria-hidden="true">${ic('play',16)}</span>`
    :tsId(it)&&it.buy_on!==false?`<button class="tskgo" aria-label="Buy now" onclick="event.stopPropagation();tsBuy('${s.id}')">${ic('cart',16)}</button>`
    :`<button class="tskgo ghost" aria-label="Explore" onclick="event.stopPropagation();tsExplore('${s.id}')">${ic('eye',16)}</button>`;
  return `<article class="card tsk" style="--d:${Math.min(i,6)*50}ms" onclick="location.hash='#/s/${s.id}'">${tsCover(s,it,'tskcv')}${badge}${rv&&rv.count?tsStars(rv.avg):''}${s.is_free?'':`<span class="tslock">${ic('lock',13)}</span>`}</div>
    <div class="tskb"><h3>${esc(s.title)}</h3><div class="tskm">${ic('file',13)}${nTests(I.n)}${nx?` · ${nx}`:''}</div>
     <div class="tskf">${tsPrice(s,it)}${act}</div></div></article>`;
}
/* carousel: dots follow the swipe, and it moves on by itself until touched */
const TSCAR={t:0,iv:null};
function tsFeIdx(){const t=document.getElementById('tsfe');if(!t||!t.children.length)return 0;const w=t.children[0].getBoundingClientRect().width+14;return Math.round(t.scrollLeft/Math.max(1,w))}
function tsFeDot(){const i=tsFeIdx();document.querySelectorAll('#tsfed i').forEach((d,j)=>d.classList.toggle('on',j===i))}
function tsFeGo(i){const t=document.getElementById('tsfe');if(!t||!t.children[i])return;TSCAR.t=Date.now();t.scrollTo({left:t.children[i].offsetLeft-t.children[0].offsetLeft,behavior:RMOT()?'auto':'smooth'})}
function tsCarStart(){
  clearInterval(TSCAR.iv);
  if(RMOT())return;
  TSCAR.iv=setInterval(()=>{
    const t=document.getElementById('tsfe');if(!t){clearInterval(TSCAR.iv);return}
    if(document.hidden||Date.now()-TSCAR.t<8000||document.getElementById('layer').innerHTML)return;
    const n=t.children.length;if(n<2)return;
    const i=(tsFeIdx()+1)%n;t.scrollTo({left:t.children[i].offsetLeft-t.children[0].offsetLeft,behavior:'smooth'});
  },5000);
}

/* ---------- series page ---------- */
let SVT={};
viewSeries=function(id){
  const s=CAT.series.find(x=>x.id===id);if(!s){location.hash='#/';return}
  if(SVID!==id){SVID=id;TLF='all'}
  const I=serInfo(s),F=CAT.folders.filter(f=>f.series_id===id),it=itemOf(s),g=tsTags(s,it),rv=it&&SHOP&&SHOP.rv[it.id];
  const own=tsOwn(s),open=own||s.is_free,files=s.files||[];
  const tags=[...g.ex.map(x=>EXN[x]),...g.cl.map(x=>CLN[x]),g.sec].filter(Boolean);
  const back=tsMine(s)?['#/my','My tests']:['#/series','Test series'];
  const hl=I.live[0]||I.ts.find(t=>t.in_progress)||I.nxt;
  const tabs=[F.length?['fo','Folders',F.length]:null,['te','All tests',I.n],files.length?['ma','Material',files.length]:null].filter(Boolean);
  if(!SVT[id]||!tabs.some(t=>t[0]===SVT[id]))SVT[id]=tabs[0][0];
  const st=own?`<span class="svst ok">${ic('check',13)} Purchased</span>`:s.is_free?`<span class="svst ok">Free</span>`:`<span class="svst lk">${ic('lock',13)} ${it&&it.price!=null&&it.price!==''?tsInr(it.price):esc(s.price_label||'Premium')}</span>`;
  let o=`<div class="wrap svx">
   <header class="svh">${tsCover(s,it,'svcv')}</div>
    <a class="svb" href="${back[0]}" aria-label="Back to ${back[1]}">${ic('back',20)}</a>
    <button class="svb svsh" aria-label="Share" onclick="shareSeries('${id}')">${ic('share',18)}</button>
    <div class="svt">${tags.length?`<div class="svtg">${tags.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}<h1>${esc(s.title)}</h1>
     <div class="svtm">${st}${rv&&rv.count?`<span class="svst rt">${ic('star',13)} ${(+rv.avg).toFixed(1)} · ${rv.count}</span>`:''}</div></div></header>
   <div class="card svk"><div><b>${I.n}</b><span>Tests</span></div><div><b>${I.done}</b><span>Attempted</span></div><div><b>${I.avg!=null?I.avg+'%':'–'}</b><span>Average</span></div><div><b>${I.best!=null?I.best+'%':'–'}</b><span>Best</span></div>
    ${I.n&&open?`<div class="svpg"><div class="bar"><i style="width:${I.p}%"></i></div><span>${I.p}% done</span></div>`:''}</div>
   ${s.description?`<p class="svd">${esc(s.description)}</p>`:''}
   ${typeof medCard==='function'?medCard(s):''}${lockBanner(s)}`;
  if(hl){const t2=tStat2(hl,liveIds());
    o+=`<div class="card svnx ${t2}"><span class="svnxi">${ic(t2==='live'?'play':t2==='prog'?'clock':'calendar',20)}</span><div class="grow">
      <div class="svnxk">${t2==='live'?'<span class="liveb"><i></i>LIVE NOW</span>':t2==='prog'?'<span class="chip warn">In progress</span>':t2==='lock'?`<span class="chip">${ic('lock',12)} Next test</span>`:`<span class="chip pri">${ic('calendar',12)} Next test</span>`}</div>
      <b>${esc(hl.title)}</b><span>${hl.questions} questions · ${hl.duration} min${isWait(hl)?' · '+esc(fmtWhen(hl.opens_at)):''}</span></div>
     ${t2==='wait'?(typeof alBtn==='function'?alBtn(hl.id):''):`<button class="btn sm" onclick="openTest('${hl.id}')">${t2==='lock'?ic('lock')+' Unlock':t2==='prog'?'Resume':'Start'} ${t2==='lock'?'':ic('right',14)}</button>`}</div>`;}
  o+=`<div class="svtabs" role="tablist">${tabs.map(t=>`<button role="tab" class="${SVT[id]===t[0]?'on':''}" onclick="svTab('${id}','${t[0]}')">${t[1]} <small>${t[2]}</small></button>`).join('')}</div>
   <div id="svp">${svPanel(s)}</div>`;
  setApp(o+'</div>');
  if(own&&typeof rvCard==='function'){const at=document.querySelector('#app .wrap');if(at){at.insertAdjacentHTML('beforeend',`<div id="rvslot" data-sid="${esc(id)}">${rvCard(id)}</div>`);if(typeof RVW!=='undefined'&&RVW[id]===undefined&&typeof rvLoad==='function')rvLoad(id)}}
};
function svPanel(s){
  const k=SVT[s.id],F=CAT.folders.filter(f=>f.series_id===s.id);
  if(k==='fo')return `<div class="svfg">${F.map((f,i)=>svFolder(f,i)).join('')}</div>`;
  if(k==='ma')return filesBlock(s).replace(/^<div class="h2s">[\s\S]*?<\/div>/,'');
  const all=CAT.tests.filter(t=>t.series_id===s.id);
  return all.length?tlBlock(all,()=>CAT.tests.filter(t=>t.series_id===SVID),'All tests'):`<div class="tsempty sm">${ic('file',26)}<h3>Tests are coming soon</h3></div>`;
}
function svTab(id,k){
  SVT[id]=k;document.querySelectorAll('.svtabs button').forEach(b=>b.classList.toggle('on',(b.getAttribute('onclick')||'').includes(`'${k}'`)));
  const p=document.getElementById('svp'),s=CAT.series.find(x=>x.id===id);if(!p||!s)return;
  p.innerHTML=svPanel(s);p.classList.remove('svin');void p.offsetWidth;p.classList.add('svin');startOp();
}
function svFolder(f,i){
  const ts=CAT.tests.filter(t=>t.folder_id===f.id),L=liveIds(),lv=ts.some(t=>tStat2(t,L)==='live'),d=ts.filter(t=>t.attempts>0).length;
  const lk=ts.length&&ts.every(t=>t.locked),p=ts.length?Math.round(d*100/ts.length):0;
  return `<article class="card svf" style="--d:${Math.min(i,8)*45}ms" onclick="location.hash='#/f/${f.id}'">
    <div class="svfi" style="background:${grad(f.id)}">${ic('folder',22)}${lk?`<span class="svfl">${ic('lock',11)}</span>`:''}</div>
    <h3>${esc(f.title)}</h3><span class="svfm">${ts.length?nTests(ts.length):'No tests yet'}${d?` · ${d} done`:''}</span>
    ${lv?'<span class="liveb"><i></i>LIVE</span>':ts.length?`<div class="bar"><i style="width:${p}%"></i></div>`:''}</article>`;
}

/* ---------- folder page ---------- */
viewFolder=function(id){
  const f=CAT.folders.find(x=>x.id===id);if(!f){location.hash='#/';return}
  const s=CAT.series.find(x=>x.id===f.series_id);if(!s){location.hash='#/';return}
  if(FVID!==id){FVID=id;TLF='all'}
  const ts=CAT.tests.filter(t=>t.folder_id===id),d=ts.filter(t=>t.attempts>0).length,p=ts.length?Math.round(d*100/ts.length):0;
  setApp(`<div class="wrap svx">
   <header class="fvh" style="background:${grad(f.id)}"><a class="svb" href="#/s/${s.id}" aria-label="Back to ${esc(s.title)}">${ic('back',20)}</a>
    <div class="fvt"><span>${esc(s.title)}</span><h1>${esc(f.title)}</h1>
     <div class="fvm"><b>${nTests(ts.length)}</b>${d?` · ${d} attempted`:''}</div>
     ${ts.length?`<div class="fvp"><i style="width:${p}%"></i></div>`:''}</div><span class="fvic">${ic('folder',64)}</span></header>
   ${lockBanner(s)}
   ${ts.length?tlBlock(ts,()=>CAT.tests.filter(t=>t.folder_id===FVID),'Tests'):'<div class="tsempty sm"><h3>No tests in this folder yet</h3></div>'}</div>`);
};

;(window.__p=window.__p||{})['app24']=1;
