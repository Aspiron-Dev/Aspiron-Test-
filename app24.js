/* ===== app24: Test series — new design (list, My tests, series page, folder page, Explore header) =====
   Covers   The whole photo at 16:9: never cropped, never covered by text (a soft blur of the same photo fills the
            sides when its shape is different). No photo → a typeset cover in the series colour.
   #/series Every series once. Grouped by store section in swipe rows on a phone (a grid on a computer); search,
            a chip or a single section show one list.
   #/my     Purchased series with progress and the next test.
   #/s/:id  Cover + title, then either progress (owned / free) or the price and Buy now (locked), the next test,
            and four separate tabs: Tests (folders, then tests outside folders) · Schedule (dated tests by day) ·
            Material (files) · Reviews (rating, reviews and the student's own review — only here).
   #/f/:id  Folder header, progress, the folder's tests, previous / next folder.
   Access does not change: locked tests, files and PDFs stay closed on the server; the buttons only open the same
   Explore / Buy now / openTest / openFile as before. */

/* ---------- covers ---------- */
const xTagL=(s,it)=>{const g=tsTags(s,it);return [...g.ex.map(x=>EXN[x]),...g.cl.map(x=>CLN[x])]};
function xCover(s,it,inner){
  const img=it&&tsImg(it.image)&&!s.cover_v?it.image:'',t=xTagL(s,it);
  return `<div class="xi${img?' has':''}" style="--g:${grad(s.id)}${img?`;--img:url('${esc(img)}')`:''}"${s.cover_v?` data-xc="${esc(s.id)}" data-v="${+s.cover_v||0}"`:''}>
   <div class="xi-f" aria-hidden="true"><b>${esc(xMono(s,it))}</b><span>${esc(s.is_free&&!t.length?'Practice':t.slice(1).join(' · ')||'Test series')}</span><i>Aspiron</i></div>${inner||''}</div>`;
}
// series photos come from cbt_cover (cached like loadCovers); only a plain https address or a base64 photo is used
function xCovers(){
  document.querySelectorAll('[data-xc]').forEach(async el=>{
    const id=el.dataset.xc,v=+el.dataset.v;if(!id||!v||el.dataset.done)return;el.dataset.done='1';
    let d=null;
    try{const c=JSON.parse(localStorage.getItem('cbt_cov_'+id)||'null');if(c&&c.v===v)d=c.d}catch(e){}
    if(!d){
      try{if(!COVQ[id])COVQ[id]=rpc('cbt_cover',{p_series:id});const r=await COVQ[id];delete COVQ[id];
        if(r&&r.ok&&r.cover){d=r.cover;try{localStorage.setItem('cbt_cov_'+id,JSON.stringify({v:r.v,d}))}catch(e){}}}catch(e){}
    }
    if(d&&tsImg(d)){el.style.setProperty('--img',`url("${d}")`);requestAnimationFrame(()=>el.classList.add('has'))}
  });
}

// a cover without a photo shows a mark (the exam, else the initials), never the title a second time
function xMono(s,it){const t=xTagL(s,it);if(t.length)return t[0];if(s.is_free)return 'FREE';return String(s.title||'').replace(/[^A-Za-z0-9ऀ-ॿ ]/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'A'}
/* ---------- small parts ---------- */
const xDay=t=>esc(new Date(t).toLocaleDateString('en-IN',{day:'numeric',month:'short'}));
const xNo=i=>String(i+1).padStart(2,'0');
const xRv=it=>it&&SHOP&&SHOP.rv&&SHOP.rv[it.id];
function xRate(it){const rv=xRv(it);return rv&&rv.count?`<span class="xr">${ic('star',12)}<b>${(+rv.avg).toFixed(1)}</b><small>(${rv.count})</small></span>`:''}
function xBadge(s,it){return s.is_free?'<span class="xbd free">Free</span>':it&&it.buy_on===false?'<span class="xbd">Coming soon</span>':it&&it.badge?`<span class="xbd">${esc(it.badge)}</span>`:''}
function xPrice(s,it){
  if(s.is_free)return `<div class="xp free"><b>Free</b><span>for every student</span></div>`;
  if(it&&it.price!=null&&it.price!==''){const o=tsOff(it);return `<div class="xp"><b>${tsInr(it.price)}</b>${+it.mrp>+it.price?`<s>${tsInr(it.mrp)}</s>`:''}${o?`<em>${o}% off</em>`:''}</div>`}
  return `<div class="xp"><b>${esc(s.price_label||'Premium')}</b></div>`;
}
function xCta(s,it){
  if(tsOwn(s)||s.is_free)return `<button class="xb pri" onclick="event.stopPropagation();closeModal();location.hash='#/s/${s.id}'">${ic('play',15)}<span>${tsOwn(s)?'Open':'Start free'}</span></button>`;
  if(it&&it.buy_on===false)return `<button class="xb ghost" onclick="event.stopPropagation();tsSoon('${s.id}')">${ic('bell',15)}<span>Notify me</span></button>`;
  if(tsId(it))return `<button class="xb gold" onclick="event.stopPropagation();tsBuy('${s.id}')">${ic('cart',15)}<span>Buy now</span></button>`;
  return `<button class="xb pri" onclick="event.stopPropagation();tsAsk('${s.id}')">${ic('msg',15)}<span>Get access</span></button>`;
}
const xEmpty=(icon,h,p,btn)=>`<div class="xempty"><span class="xempty-i">${ic(icon,24)}</span><h3>${h}</h3>${p?`<p>${p}</p>`:''}${btn||''}</div>`;

/* ---------- list page ---------- */
seriesList=function(){
  tsfInit();
  const my=tsMy(),nMine=CAT.series.filter(tsMine).length;
  setTimeout(tsAfter,0);
  return `<div class="x24 xl${my?' my':''}">
   <header class="xh"><div class="grow"><span class="xey">Aspiron</span><h1>${my?'My tests':'Test series'}</h1></div>
    <button class="xmy${my?' on':''}" onclick="location.hash='${my?'#/series':'#/my'}'">${my?`${ic('back',16)}<span>All series</span>`:`${ic('bmark',16)}<span>My tests</span><b>${nMine}</b>`}</button></header>
   <label class="xs">${ic('search',18)}<input id="tsq" type="search" autocomplete="off" placeholder="${my?'Search my test series':'Search series, subjects, exams'}" value="${esc(TSF.q)}" oninput="TSF.q=this.value;tsDraw()"><button class="tsqx" aria-label="Clear search" onclick="event.preventDefault();TSF.q='';const q=document.getElementById('tsq');q.value='';q.focus();tsDraw()">${ic('x',16)}</button></label>
   ${my?'':`<div class="xf"><button class="xpk" onclick="tsPick()">${ic('cap',16)}<span id="tsxl">${tsSelTxt()}</span>${ic('chevd',15)}</button><div class="xc" id="tsc"></div></div>`}
   <div id="tslist"></div></div>`;
};
function xCard(s,i){
  const it=itemOf(s),I=serInfo(s),t=xTagL(s,it),sub=(it&&it.subtitle)||s.description||'';
  const fx=[`${ic('file',14)}${nTests(I.n)}`,I.folders?`${ic('folder',14)}${I.folders} folder${I.folders===1?'':'s'}`:'',
    I.live.length?'<span class="liveb"><i></i>LIVE</span>':I.nxt?`${ic('calendar',14)}Next ${xDay(I.nxt.opens_at)}`:''].filter(Boolean);
  return `<article class="xk" style="--d:${Math.min(i||0,8)*60}ms" onclick="location.hash='#/s/${s.id}'">
   <div class="xkf">${xCover(s,it,xBadge(s,it)+(s.is_free?'':`<span class="xlk" aria-label="Locked">${ic('lock',13)}</span>`))}</div>
   <div class="xkb"><div class="xkm"><span>${esc(t.join(' · '))}</span>${xRate(it)}</div>
    <h3>${esc(s.title)}</h3>${sub?`<p>${esc(sub)}</p>`:''}
    <div class="xkx">${fx.map(f=>`<span>${f}</span>`).join('')}</div></div>
   <div class="xkp">${xPrice(s,it)}<div class="xka"><button class="xb ghost" onclick="event.stopPropagation();tsExplore('${s.id}')">Details</button>${xCta(s,it)}</div></div></article>`;
}
function xMine(s,i){
  const it=itemOf(s),I=serInfo(s),p=I.n?Math.round(I.done*100/I.n):0;
  const nx=I.live[0]?`<span class="liveb"><i></i>LIVE</span><span class="grow">${esc(I.live[0].title)}</span>`
    :I.prog?`${ic('play',14)}<span class="grow">A test is in progress — resume</span>`
    :I.nxt?`${ic('calendar',14)}<span class="grow">Next: <b>${esc(I.nxt.title)}</b> · ${esc(fmtWhen(I.nxt.opens_at))}</span>`
    :`${ic('check',14)}<span class="grow">${I.n?(I.done===I.n?'Every test attempted':`${I.n-I.done} test${I.n-I.done===1?'':'s'} to attempt`):'Tests coming soon'}</span>`;
  return `<article class="xm" style="--d:${Math.min(i||0,8)*60}ms" onclick="location.hash='#/s/${s.id}'">
   <div class="xmf">${xCover(s,it,'')}</div>
   <div class="xmb"><span class="xst ${s.is_free?'free':'ok'}">${s.is_free?'Free':`${ic('check',12)} Purchased`}</span><h3>${esc(s.title)}</h3>
    <div class="xbar"><i style="width:${p}%"></i></div><div class="xmm"><span><b>${I.done}</b> of ${I.n} attempted</span><span>${p}%</span></div></div>
   <div class="xmn">${nx}${ic('right',16)}</div></article>`;
}
function xGroups(L){
  const G=new Map(),order=(SHOP&&SHOP.sections||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean);
  const add=(k,n,s)=>{if(!G.has(k))G.set(k,{k,n,L:[]});G.get(k).L.push(s)};
  L.forEach(s=>{const sec=tsTags(s,itemOf(s)).sec;if(s.is_free)add('free','Free practice',s);else if(sec)add(sec.toLowerCase(),sec,s);else add('','More test series',s)});
  G.forEach((g,k)=>{if(k!=='free'&&k!==''&&g.L.length<2){G.delete(k);g.L.forEach(s=>add('','More test series',s))}});
  const rank=g=>g.k==='free'?1100:g.k===''?1000:(order.indexOf(g.k)+1||800);
  return [...G.values()].sort((a,b)=>rank(a)-rank(b));
}
tsDraw=function(){
  const l=document.getElementById('tslist');if(!l)return;
  const my=tsMy(),S=CAT.series;
  document.body.classList.toggle('tsq-on',!!TSF.q);
  if(my){
    const all=S.filter(tsMine),L=all.filter(s=>tsPass(s,false));
    l.innerHTML=!all.length?xEmpty('bmark','No test series yet','Series you buy show here, with your progress and the next test.',`<button class="xb pri" onclick="location.hash='#/series'">${ic('cart',15)}<span>Explore test series</span></button>`)
      :!L.length?xEmpty('search',`Nothing matches “${esc(TSF.q)}”`,'')
      :`<div class="xcount">${L.length} series</div><div class="xmine">${L.map(xMine).join('')}</div>`;
    xCovers();return;
  }
  const base=S.filter(s=>!tsOwn(s));
  tsChips(base);
  const L=base.filter(s=>tsPass(s,true)),nOwn=S.filter(tsOwn).length;
  let h;
  if(!S.length)h=xEmpty('book','Test series are coming soon','Please check back in a little while.');
  else if(!base.length)h=xEmpty('check','You have every test series','Find them all in My tests.',`<button class="xb pri" onclick="location.hash='#/my'">${ic('bmark',15)}<span>Open My tests</span></button>`);
  else if(!L.length)h=xEmpty('search','No test series here','Try another exam, class or word.',`<button class="xb ghost" onclick="TSF.q='';TSF.sec='';TSF.ex='';TSF.cl='';tsfSave();route()">Show all</button>`);
  else{
    const G=!TSF.q&&!TSF.sec?xGroups(L):[];
    h=`<div class="xcount">${L.length} series${TSF.ex||TSF.cl?' · '+esc(tsSelTxt()):''}</div>`+(G.length>1
      ?G.map((g,gi)=>`<section class="xsec"><div class="xsh"><span class="xno">${xNo(gi)}</span><h2>${esc(g.n)}</h2><span class="xn">${g.L.length}</span>
          ${g.k!==''&&g.L.length>2?`<button onclick="TSF.sec=${esc(JSON.stringify(g.k))};tsDraw();document.getElementById('tsq').scrollIntoView({behavior:'smooth',block:'start'})">See all ${ic('right',14)}</button>`:''}</div>
         <div class="xrow">${g.L.map((s,i)=>xCard(s,i)).join('')}</div></section>`).join('')
      :`<div class="xgrid">${L.map(xCard).join('')}</div>`);
  }
  l.innerHTML=h+(nOwn&&L.length?`<button class="xown" onclick="location.hash='#/my'">${ic('check',16)}<span>You own ${nOwn} series — they are in <b>My tests</b></span>${ic('right',16)}</button>`:'');
  xCovers();
};

/* ---------- test rows (series + folder pages) ---------- */
tlList=function(ts){
  const L=liveIds(),l=ts.filter(t=>{const s=tStat2(t,L);return TLF==='all'||(TLF==='new'?['new','live','prog'].includes(s):TLF==='done'?s==='done'||s==='held':TLF===s)});
  return l.length?`<div class="xtl">${l.map(xRow).join('')}</div>`:`<div class="xempty sm"><p>No tests here.</p></div>`;
};
function xTl(ts,src){TLSRC=src;return `<div id="tlf" class="xtf">${tlFilt(ts)}</div><div id="tll">${tlList(ts)}</div>`}
function xRow(t,i){
  const st=tStat2(t,liveIds()),last=(CAT.results||[]).find(r=>r.test_id===t.id),pd=pendOf(t.id),pdf=typeof PDFS!=='undefined'&&PDFS&&PDFS[t.id];
  const chip={prog:'<span class="xchip warn">In progress</span>',wait:`<span class="xchip pri">${ic('calendar',11)} ${esc(fmtWhen(t.opens_at))}</span>`,
    lock:`<span class="xchip lk">${ic('lock',11)} Locked</span>`,held:`<span class="xchip ok">${ic('check',11)} Submitted</span>`,
    done:`<span class="xchip ok">${ic('check',11)} Attempted${t.attempts>1?' '+t.attempts+'×':''}</span>`,closed:`<span class="xchip">${ic('clock',11)} Closed</span>`,
    live:'<span class="liveb"><i></i>LIVE</span>',new:''}[st]||'';
  const note=st==='held'?`Result &amp; re-attempt after ${esc(fmtWhen(liveTill(t)))}`:pd?`Result after ${esc(fmtWhen(pd.result_at))}`
    :t.best!=null&&t.best_max&&st==='done'?`Best <b>${t.best}/${t.best_max}</b>`:'';
  const cta=st==='lock'?`<button class="xb ghost sm" onclick="openTest('${t.id}')">${ic('lock',14)}<span>Unlock</span></button>`
    :st==='wait'?`<span class="xcd">${ic('clock',13)}<span data-op="${t.opens_at}">--:--</span></span>${typeof alBtn==='function'?alBtn(t.id,0):''}`
    :st==='closed'?`<button class="xb ghost sm" disabled>Closed</button>`
    :st==='held'?`<button class="xb ghost sm" disabled>Attempted</button>`
    :`<button class="xb ${st==='done'?'soft':'pri'} sm" onclick="openTest('${t.id}')"><span>${st==='prog'?'Resume':st==='done'?'Re-attempt':'Start'}</span>${ic('right',14)}</button>`;
  return `<div class="xrw st-${st}"><span class="xrn">${xNo(i)}</span>
   <div class="xri"><h4>${esc(t.title)}</h4><div class="xrm">${t.questions} questions · ${t.duration} min${t.practice?' · Practice':''}${t.free_preview&&t.locked===false?' · <em>Free preview</em>':''}</div>
    ${chip||note?`<div class="xrs">${chip}${note?`<span class="xrnote">${note}</span>`:''}</div>`:''}</div>
   <div class="xra">${pdf?`<button class="xb soft sm" aria-label="Result and answer key PDF" onclick="openPdf('${esc(String(t.id))}')">${ic('pdf',15)}<span>PDF</span></button>`:''}${last&&!pd?`<button class="xb soft sm" onclick="openReview('${last.id}')">${ic('eye',14)}<span>Review</span></button>`:''}${cta}</div></div>`;
}

/* ---------- series page ---------- */
let SVT='te';
function xTabsOf(s){
  const I=serInfo(s),it=itemOf(s),rv=xRv(it),dated=I.ts.filter(t=>t.opens_at).length,files=(s.files||[]).length;
  const T=[['te','Tests',I.n]];
  if(dated)T.push(['sc','Schedule',dated]);
  if(files)T.push(['ma','Material',files]);
  if(!s.is_free&&(tsId(it)||tsOwn(s)))T.push(['rv','Reviews',rv&&rv.count?rv.count:'']);
  return T;
}
function xBuy(s,it,I){
  const prev=I.ts.filter(t=>t.free_preview).length;
  return `<div class="xbuy"><div class="xbuyh"><span class="xey">Unlock this series</span>${xPrice(s,it)}</div>
   <p>${ic('lock',14)}<span>All ${nTests(I.n)}${I.folders?` in ${I.folders} folder${I.folders===1?'':'s'}`:''}, results and All-India rank open right after the payment is approved.${prev?` <b>${prev} free preview test${prev===1?' is':'s are'} open now.</b>`:''}</span></p>
   <div class="xka"><button class="xb ghost" onclick="tsExplore('${s.id}')">${ic('eye',15)}<span>Details</span></button>${xCta(s,it)}</div></div>`;
}
function xNext(s,I){
  const hl=I.live[0]||I.ts.find(t=>t.in_progress)||I.nxt;if(!hl)return '';
  const k=I.live.includes(hl)?'live':hl.in_progress?'prog':'wait';
  const act=hl.locked?`<button class="xb ghost sm" onclick="openTest('${hl.id}')">${ic('lock',14)}<span>Unlock</span></button>`
    :k==='wait'?(typeof alBtn==='function'?alBtn(hl.id):'')
    :`<button class="xb pri sm" onclick="openTest('${hl.id}')"><span>${k==='prog'?'Resume':'Start'}</span>${ic('right',14)}</button>`;
  return `<div class="xnext ${k}"><span class="xnx-i">${ic(k==='wait'?'calendar':'play',20)}</span>
   <div class="grow"><span class="xnx-k">${k==='live'?'<span class="liveb"><i></i>LIVE NOW</span>':k==='prog'?'In progress':`Next test${isWait(hl)?` · opens in <span data-op="${hl.opens_at}">--:--</span>`:''}`}</span>
    <b>${esc(hl.title)}</b><small>${hl.questions} questions · ${hl.duration} min${k==='wait'?' · '+esc(fmtWhen(hl.opens_at)):''}</small></div>${act}</div>`;
}
viewSeries=function(id){
  const s=CAT.series.find(x=>x.id===id);if(!s){location.hash='#/';return}
  if(SVID!==id){SVID=id;TLF='all';SVT='te'}
  const it=itemOf(s),I=serInfo(s),t=xTagL(s,it),own=tsOwn(s),open=own||s.is_free,mine=tsMine(s),rv=xRv(it);
  const ex=it&&SHOP&&SHOP.ex&&SHOP.ex[it.id],sub=(it&&it.subtitle)||'',desc=String(s.description||(ex&&ex.description)||'').trim();
  // store data (price, rating, reviews) may arrive after the page is drawn
  if(!SHOP||SHOP.old)shopLoad().then(()=>{
    if(SVID!==id||(location.hash||'')!=='#/s/'+id||!document.querySelector('.xsv'))return;
    if(!open&&itemOf(s))return viewSeries(id);
    const m=document.querySelector('.xsv .xhm'),tb=document.querySelector('.xsv .xtabs');
    if(m)m.innerHTML=xMeta(s);if(tb)tb.outerHTML=xTabsHtml(s);
    if(SVT==='rv'){const p=document.getElementById('svp');if(p)p.innerHTML=xPanel(s)}
  });
  if(!xTabsOf(s).some(x=>x[0]===SVT))SVT='te';
  const status=own?`<span class="xst ok">${ic('check',12)} Purchased</span>`:s.is_free?'<span class="xst free">Free for every student</span>':`<span class="xst lk">${ic('lock',12)} Locked</span>`;
  const prog=`<div class="xprog"><div class="xkk"><div><b>${I.n}</b><span>Tests</span></div><div><b>${I.done}</b><span>Attempted</span></div><div><b>${I.avg!=null?I.avg+'%':'–'}</b><span>Average</span></div><div><b>${I.best!=null?I.best+'%':'–'}</b><span>Best</span></div></div>
    <div class="xpg"><div class="xbar"><i style="width:${I.p}%"></i></div><span>${I.p}% complete</span></div></div>`;
  setApp(`<div class="wrap x24 xsv">
   <nav class="xtop"><a class="xback" href="${mine?'#/my':'#/series'}">${ic('back',16)}<span>${mine?'My tests':'Test series'}</span></a>
    <button class="xib" aria-label="Share" title="Share" onclick="shareSeries('${id}')">${ic('share',17)}</button></nav>
   <section class="xhero"><div class="xhf">${xCover(s,it,'')}</div>
    <div class="xht"><div class="xkm"><span>${esc(t.join(' · '))}</span>${status}</div>
     <h1>${esc(s.title)}</h1>${sub?`<p class="xsub">${esc(sub)}</p>`:''}
     <div class="xhm">${xMeta(s)}</div>
     ${desc?`<p class="xdesc${desc.length>220?' clamp':''}">${esc(desc)}</p>${desc.length>220?`<button class="xmore" onclick="this.previousElementSibling.classList.remove('clamp');this.remove()">Read more</button>`:''}`:''}
     ${open?prog:xBuy(s,it,I)}</div></section>
   ${typeof medCard==='function'?medCard(s):''}
   ${xNext(s,I)}
   ${xTabsHtml(s)}
   <div id="svp" class="xpanel">${xPanel(s)}</div></div>`);
  xAfter(s);
};
function xMeta(s){
  const it=itemOf(s),I=serInfo(s),bi=typeof serBi==='function'&&serBi(s.id);
  return [xRate(it),`<span>${ic('file',14)}${nTests(I.n)}</span>`,I.folders?`<span>${ic('folder',14)}${I.folders} folder${I.folders===1?'':'s'}</span>`:'',bi?`<span>${ic('globe',14)}English + हिंदी</span>`:''].filter(Boolean).join('');
}
function xTabsHtml(s){
  const T=xTabsOf(s);if(!T.some(x=>x[0]===SVT))SVT='te';
  return `<div class="xtabs" role="tablist" style="--n:${T.length};--i:${T.findIndex(x=>x[0]===SVT)}">${T.map(([k,n,c])=>`<button role="tab" aria-selected="${SVT===k}" class="${SVT===k?'on':''}" data-k="${k}" onclick="xTab('${s.id}','${k}')">${n}${c!==''?`<small>${c}</small>`:''}</button>`).join('')}<i class="xtabs-i"></i></div>`;
}
function xAfter(s){
  xCovers();
  if(SVT==='rv'&&tsOwn(s)&&typeof RVW!=='undefined'&&RVW[s.id]===undefined&&typeof rvLoad==='function')rvLoad(s.id);
}
function xTab(id,k){
  const s=CAT.series.find(x=>x.id===id);if(!s)return;
  SVT=k;
  const bar=document.querySelector('.xtabs');
  if(bar){const b=[...bar.querySelectorAll('button')];b.forEach(x=>{const on=x.dataset.k===k;x.classList.toggle('on',on);x.setAttribute('aria-selected',on)});bar.style.setProperty('--i',Math.max(0,b.findIndex(x=>x.dataset.k===k)))}
  const p=document.getElementById('svp');if(!p)return;
  p.innerHTML=xPanel(s);p.classList.remove('xin');void p.offsetWidth;p.classList.add('xin');
  clearInterval(opTimer);opTimer=null;startOp();xAfter(s);
  if(bar){const top=bar.getBoundingClientRect().top;if(top<0||top>innerHeight*.6)bar.scrollIntoView({behavior:RMOT()?'auto':'smooth',block:'start'})}
}
function xPanel(s){
  const I=serInfo(s),open=tsOwn(s)||s.is_free;
  if(SVT==='sc'){
    const L=liveIds(),D=I.ts.filter(t=>t.opens_at);
    const live=D.filter(t=>L.has(t.id)),up=D.filter(t=>!L.has(t.id)&&isWait(t)).sort((a,b)=>a.opens_at-b.opens_at),past=D.filter(t=>!L.has(t.id)&&!isWait(t)).sort((a,b)=>b.opens_at-a.opens_at);
    const F=new Map(CAT.folders.map(f=>[f.id,f.title]));
    const row=(t,k)=>{const d=new Date(t.opens_at);
      const act=t.locked?`<span class="xtm-l" aria-label="Locked">${ic('lock',15)}</span>`
        :k==='live'?`<button class="xb pri sm" onclick="openTest('${t.id}')"><span>Start</span></button>`
        :k==='up'?(typeof alBtn==='function'?alBtn(t.id,0):'')
        :t.attempts>0?`<span class="xchip ok">${ic('check',11)} Done</span>`:'';
      return `<li class="${k}"><div class="xd"><b>${d.getDate()}</b><span>${esc(d.toLocaleDateString('en-IN',{month:'short'}))}</span></div>
       <div class="grow"><b>${esc(t.title)}</b><small>${esc(d.toLocaleDateString('en-IN',{weekday:'short'}))}, ${esc(d.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}))} · ${t.questions} Q · ${t.duration} min${t.folder_id&&F.get(t.folder_id)?' · '+esc(F.get(t.folder_id)):''}</small></div>${act}</li>`};
    const grp=(n,L,k)=>L.length?`<div class="xsh2"><h3>${n}</h3><span>${L.length}</span></div><ol class="xtime">${L.map(t=>row(t,k)).join('')}</ol>`:'';
    return grp('Live now',live,'live')+grp('Upcoming',up,'up')+grp('Earlier',past,'past');
  }
  if(SVT==='ma'){
    const fl=s.files||[];
    return `<div class="xfiles">${fl.map(f=>`<button class="xfile${open?'':' lk'}" onclick="${open?`openFile('${esc(f.id)}')`:`tsExplore('${s.id}','rs')`}"><span class="xfi">${ic(open?(f.kind==='schedule'?'calendar':'file'):'lock',18)}</span>
      <span class="grow"><b>${esc(f.title)}</b><small>${esc(KIND[f.kind]||'File')}${f.size?' · '+fsize(f.size):''}${open?'':' · opens after you buy'}</small></span><span class="xfa">${ic(open?'download':'lock',16)}</span></button>`).join('')}</div>`;
  }
  if(SVT==='rv'){
    const it=itemOf(s),rv=xRv(it);let h='';
    if(tsOwn(s)&&typeof rvCard==='function')h+=`<div id="rvslot" data-sid="${esc(s.id)}">${rvCard(s.id)}</div>`;
    const o=XS.tab;XS.tab='rv';h+=`<div class="xrv">${tsXBody(s,it,rv,I)}</div>`;XS.tab=o;
    return h;
  }
  const F=CAT.folders.filter(f=>f.series_id===s.id),root=I.ts.filter(t=>!t.folder_id);
  let h='';
  if(F.length)h+=`<div class="xsh2"><h3>Folders</h3><span>${F.length}</span></div><div class="xfg">${F.map(xFolder).join('')}</div>`;
  if(root.length)h+=`${F.length?`<div class="xsh2"><h3>More tests</h3><span>${root.length}</span></div>`:''}${xTl(root,()=>CAT.tests.filter(t=>t.series_id===SVID&&!t.folder_id))}`;
  return h||xEmpty('file','Tests are coming soon','New tests show up here as soon as they are added.');
}
function xFolder(f,i){
  const ts=CAT.tests.filter(t=>t.folder_id===f.id),L=liveIds(),lv=ts.some(t=>L.has(t.id)&&!t.attempts),d=ts.filter(t=>t.attempts>0).length;
  const p=ts.length?Math.round(d*100/ts.length):0,lk=ts.length&&ts.every(t=>t.locked),nx=ts.filter(isWait).sort((a,b)=>a.opens_at-b.opens_at)[0];
  return `<button class="xfo" style="--d:${Math.min(i,8)*50}ms;--g:${grad(f.id)}" onclick="location.hash='#/f/${f.id}'">
   <span class="xfo-t"><span class="xfo-i">${ic('folder',19)}</span><span class="xfo-n">${xNo(i)}</span></span>
   <b>${esc(f.title)}</b><small>${ts.length?nTests(ts.length):'No tests yet'}${d?` · ${d} done`:''}</small>
   <span class="xfo-s">${lv?'<span class="liveb"><i></i>LIVE</span>':lk?`<span class="xchip lk">${ic('lock',11)} Locked</span>`:nx?`<span class="xchip pri">${ic('calendar',11)} ${xDay(nx.opens_at)}</span>`:p===100?`<span class="xchip ok">${ic('check',11)} Complete</span>`:''}</span>
   <span class="xbar"><i style="width:${p}%"></i></span></button>`;
}

/* ---------- folder page ---------- */
viewFolder=function(id){
  const f=CAT.folders.find(x=>x.id===id);if(!f){location.hash='#/';return}
  const s=CAT.series.find(x=>x.id===f.series_id);if(!s){location.hash='#/';return}
  if(FVID!==id){FVID=id;TLF='all'}
  SVID=s.id;
  const ts=CAT.tests.filter(t=>t.folder_id===id),d=ts.filter(t=>t.attempts>0).length,p=ts.length?Math.round(d*100/ts.length):0;
  const L=liveIds(),lv=ts.filter(t=>L.has(t.id)&&!t.attempts).length,up=ts.filter(isWait).length;
  const F=CAT.folders.filter(x=>x.series_id===s.id),k=F.indexOf(f),pv=F[k-1],nx=F[k+1];
  const open=tsOwn(s)||s.is_free,it=itemOf(s);
  setApp(`<div class="wrap x24 xfv">
   <nav class="xtop"><a class="xback" href="#/s/${s.id}">${ic('back',16)}<span>${esc(s.title)}</span></a></nav>
   <header class="xfh" style="--g:${grad(f.id)}"><span class="xfh-i">${ic('folder',26)}</span>
    <div class="grow"><span class="xey">Folder ${xNo(k)} of ${F.length}</span><h1>${esc(f.title)}</h1><p>${esc(s.title)}</p></div></header>
   <div class="xprog"><div class="xkk"><div><b>${ts.length}</b><span>Tests</span></div><div><b>${d}</b><span>Attempted</span></div><div><b>${up}</b><span>Upcoming</span></div><div><b>${lv}</b><span>Live</span></div></div>
    <div class="xpg"><div class="xbar"><i style="width:${p}%"></i></div><span>${p}% complete</span></div></div>
   ${open?'':xBuy(s,it,serInfo(s))}
   <div class="xsh2"><h3>Tests</h3><span>${ts.length}</span></div>
   ${ts.length?xTl(ts,()=>CAT.tests.filter(t=>t.folder_id===FVID)):xEmpty('file','No tests in this folder yet','')}
   ${pv||nx?`<div class="xfnav">${pv?`<a href="#/f/${pv.id}">${ic('back',15)}<span><small>Previous</small>${esc(pv.title)}</span></a>`:'<i></i>'}${nx?`<a class="nx" href="#/f/${nx.id}"><span><small>Next</small>${esc(nx.title)}</span>${ic('right',15)}</a>`:''}</div>`:''}</div>`);
  xCovers();
};

/* ---------- Explore sheet: whole photo on top, title below it ---------- */
{const _xd=tsXDraw;tsXDraw=function(keep){
  _xd(keep);
  const s=CAT.series.find(x=>x.id===XS.id),h=document.querySelector('#layer .bsheet[data-id="tsx"] .tsxh');
  if(!s||!h)return;
  const it=itemOf(s),t=[...xTagL(s,it),tsTags(s,it).sec].filter(Boolean);
  h.outerHTML=`<div class="xxh">${xCover(s,it,'')}<div class="xxt">${t.length?`<span class="xey">${esc(t.join(' · '))}</span>`:''}<h2>${esc(s.title)}</h2></div></div>`;
  xCovers();
}}

;(window.__p=window.__p||{})['app24']=1;
