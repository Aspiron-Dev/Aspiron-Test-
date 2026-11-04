/* ===== app23: Test series like a store — search, exam + class, My tests, Explore, Buy now =====
   #/series  All test series. Search, exam (NEET / JEE) and class (11 / 12 / Dropper) — first taken from the student's
             profile — and category chips (Free + the store's sections). A series the student has bought leaves this
             list and moves to My tests. Every other series stays visible (tests, folders, dates) but locked, with
             Explore and Buy now.
   #/my      My tests: the series the student bought, plus free series they have started.
   Explore   Overview (description, what you get, facts) · Resources (folders, tests, files, demo tests) · Reviews.
   Data: cbt_catalog (series, tests, files, unlocked) + the public store (cbt_store, cbt_store_explore,
   cbt_store_reviews). The store item of a series comes from cbt_store_map (supabase_v54_store_map.sql: the series the
   admin set on the item); before v54 is run, from the item with the same name as the series.
   Exam comes from the store item's course; class from words in the series name / description ("Class 11",
   "Class 12", "Dropper"). A series without them shows for every exam / class.
   Nothing here opens paid content: locked tests, files and PDFs are refused by the server (cbt_start, cbt_file_part,
   cbt_test_pdfs), the app only shows what they are. Buy now opens the store's payment for the app's own mobile
   number, so the series unlocks on this account after the payment is approved. */
IC.cart='<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>';
IC.chevd='<path d="M6 9l6 6 6-6"/>';
IC.cap='<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>';
IC.shieldok='<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>';
IC.layers2='<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';

/* ---------- store data (public, cached) ---------- */
let SHOP=null,SHOPAT=0,shopBusy=null;
{const c=LS.get('cbt_shop',null);if(c&&c.items&&Date.now()-c.t<864e5)SHOP={items:c.items,sections:c.sections||[],map:c.map||{},ex:{},rv:{},old:1}}
function shopLoad(force){
  if(SHOP&&!SHOP.old&&!force&&Date.now()-SHOPAT<300000)return Promise.resolve(SHOP);
  if(shopBusy)return shopBusy;
  shopBusy=Promise.all([rpc('cbt_store',{},true),rpc('cbt_store_explore',{},true),rpc('cbt_store_reviews',{},true),AUTH?rpc('cbt_store_map',{}):null]).then(([a,b,c,d])=>{
    if(!a||!a.ok){if(!SHOP)SHOP={items:[],sections:[],ex:{},rv:{}};return SHOP}
    const ex={},rv={},map={};
    if(d&&d.ok&&d.map)for(const k in d.map)if(/^[0-9a-f-]{36}$/i.test(String(d.map[k])))map[k]=String(d.map[k]);
    ((b&&b.ok&&b.items)||[]).forEach(x=>{if(x&&x.id)ex[x.id]=x});
    ((c&&c.ok&&c.items)||[]).forEach(x=>{if(x&&x.id)rv[x.id]=x});
    SHOP={items:a.items||[],sections:(a.settings&&a.settings.sections)||[],ex,rv,map};SHOPAT=Date.now();IMAP=null;
    LS.set('cbt_shop',{t:SHOPAT,items:SHOP.items,sections:SHOP.sections,map});
    return SHOP;
  }).catch(()=>SHOP||(SHOP={items:[],sections:[],ex:{},rv:{}})).finally(()=>{shopBusy=null});
  return shopBusy;
}
const tsN=s=>String(s||'').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g,'');
let IMAP=null,IMAPS=null;
function itemOf(s){
  if(!SHOP||!s)return null;
  if(!IMAP||IMAPS!==SHOP){IMAP=new Map();SHOP.items.forEach(i=>{const k=tsN(i.title);if(k&&!IMAP.has(k))IMAP.set(k,i)});IMAPS=SHOP}
  const id=SHOP.map&&SHOP.map[s.id];
  if(id){const it=SHOP.items.find(i=>i.id===id);if(it)return it}
  return IMAP.get(tsN(s.title))||null;
}
const tsId=i=>!!i&&/^[0-9a-f-]{36}$/i.test(String(i.id));
const tsInr=n=>'₹'+Number(n||0).toLocaleString('en-IN');
const tsOff=i=>i&&+i.mrp>+i.price&&+i.price>0?Math.round((i.mrp-i.price)*100/i.mrp):0;
// a store photo goes into CSS url('…'): only a plain https address or a base64 photo, no quotes / brackets / spaces
const tsImg=u=>{u=String(u||'');return u.length<2e6&&/^(https:\/\/[^\s'"()\\<>]+|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+)$/i.test(u)};

/* ---------- exam, class, category of a series ---------- */
const EXN={neet:'NEET',jee:'JEE'},CLN={'11':'Class 11','12':'Class 12',d:'Dropper'};
function tsTags(s,it){
  const txt=[s.title,it&&it.subtitle,it&&it.section,s.description].join(' ');
  const ex=it&&EXN[it.course]?[it.course]:[];
  if(!ex.length){if(/\bneet\b/i.test(txt))ex.push('neet');if(/\bjee\b/i.test(txt))ex.push('jee')}
  const cl=[];
  if(/class\s*-?\s*(11|xi)\b|\b11th\b|\b(11|xi)\s*(&|and|\+|,|\/)\s*(12|xii)\b/i.test(txt))cl.push('11');
  if(/class\s*-?\s*(12|xii)\b|\b12th\b|\b(11|xi)\s*(&|and|\+|,|\/)\s*(12|xii)\b/i.test(txt))cl.push('12');
  if(/\b(droppers?|repeaters?)\b/i.test(txt))cl.push('d');
  return{ex,cl,sec:String(it&&it.section||'').trim()};
}
const tsOwn=s=>!s.is_free&&!!s.unlocked;
const tsStarted=s=>CAT.tests.some(t=>t.series_id===s.id&&(t.attempts>0||t.in_progress));
const tsMine=s=>tsOwn(s)||(s.is_free&&tsStarted(s));

/* ---------- filters (exam + class saved on this phone) ---------- */
const TSF={q:'',ex:'',cl:'',sec:''};
let TSFI=false;
function tsfInit(){
  if(TSFI||!AUTH)return;TSFI=true;
  const sv=LS.get('cbt_tsf_'+AUTH.mobile,null);
  if(sv){TSF.ex=EXN[sv.ex]?sv.ex:'';TSF.cl=CLN[sv.cl]?sv.cl:'';return}
  const p=typeof pfGet==='function'?pfGet():{};
  TSF.ex=p.exam==='NEET'?'neet':p.exam==='JEE'?'jee':'';
  TSF.cl=p.cls==='Class 11'?'11':p.cls==='Class 12'?'12':p.cls==='Dropper'?'d':'';
}
const tsfSave=()=>LS.set('cbt_tsf_'+AUTH.mobile,{ex:TSF.ex,cl:TSF.cl});
function tsPass(s,useSel){
  const it=itemOf(s),g=tsTags(s,it);
  if(useSel){
    if(TSF.ex&&g.ex.length&&!g.ex.includes(TSF.ex))return false;
    if(TSF.cl&&g.cl.length&&!g.cl.includes(TSF.cl))return false;
    if(TSF.sec==='free'&&!s.is_free)return false;
    if(TSF.sec&&TSF.sec!=='free'&&g.sec.toLowerCase()!==TSF.sec)return false;
  }
  if(TSF.q){
    const hay=[s.title,s.description,it&&it.subtitle,it&&it.section,it&&it.badge,((it&&it.features)||[]).join(' '),g.ex.map(x=>EXN[x]).join(' '),g.cl.map(x=>CLN[x]).join(' ')].join(' ').toLowerCase();
    if(!TSF.q.toLowerCase().split(/\s+/).filter(Boolean).every(w=>hay.includes(w)))return false;
  }
  return true;
}
const tsMy=()=>location.hash==='#/my';

/* ---------- page ---------- */
function seriesList(){
  tsfInit();
  const my=tsMy(),S=CAT.series,nMine=S.filter(tsMine).length;
  setTimeout(tsAfter,0);
  return `<div class="tsp${my?' my':''}">
   <div class="tsh"><div class="grow"><span class="tsey">${my?'Your library':'Aspiron store'}</span><h1>${my?'My tests':'Test series'}</h1></div>
    <button class="tsmy${my?' on':''}" onclick="location.hash='${my?'#/series':'#/my'}'">${my?`${ic('back',16)}<span>All series</span>`:`${ic('bmark',16)}<span>My tests</span><b>${nMine}</b>`}</button></div>
   <label class="tss">${ic('search',18)}<input id="tsq" type="search" autocomplete="off" placeholder="${my?'Search my test series':'Search test series, subjects, exams'}" value="${esc(TSF.q)}" oninput="TSF.q=this.value;tsDraw()"><button class="tsqx" aria-label="Clear search" onclick="event.preventDefault();TSF.q='';const q=document.getElementById('tsq');q.value='';q.focus();tsDraw()">${ic('x',16)}</button></label>
   ${my?'':`<div class="tsfr"><button class="tsx" onclick="tsPick()">${ic('cap',17)}<span id="tsxl">${tsSelTxt()}</span>${ic('chevd',16)}</button><div class="tsc" id="tsc"></div></div>`}
   <div id="tslist"></div></div>`;
}
function tsSelTxt(){return [TSF.ex?EXN[TSF.ex]:'All exams',TSF.cl?CLN[TSF.cl]:'All classes'].join(' · ')}
function tsAfter(){
  if(!document.getElementById('tslist'))return;
  document.body.classList.toggle('tsq-on',!!TSF.q);
  tsDraw();
  shopLoad().then(()=>{if(document.getElementById('tslist'))tsDraw()});
}
function tsChips(base){
  const c=document.getElementById('tsc');if(!c)return;
  const sec=new Map();
  (SHOP&&SHOP.sections||[]).forEach(x=>{const n=String(x||'').trim();if(n)sec.set(n.toLowerCase(),n)});
  base.forEach(s=>{const g=tsTags(s,itemOf(s));if(g.sec&&!sec.has(g.sec.toLowerCase()))sec.set(g.sec.toLowerCase(),g.sec)});
  const used=[...sec.entries()].filter(([k])=>base.some(s=>tsTags(s,itemOf(s)).sec.toLowerCase()===k));
  const hasFree=base.some(s=>s.is_free);
  if(TSF.sec&&TSF.sec!=='free'&&!used.some(([k])=>k===TSF.sec))TSF.sec='';
  if(TSF.sec==='free'&&!hasFree)TSF.sec='';
  const L=[['','All'],...used,...(hasFree?[['free','Free']]:[])];
  c.innerHTML=L.length>2?L.map(([k,n])=>`<button class="chip${TSF.sec===k?' on':''}" onclick="TSF.sec=${esc(JSON.stringify(k))};tsDraw()">${esc(n)}</button>`).join(''):'';
}
function tsDraw(){
  const l=document.getElementById('tslist');if(!l)return;
  const my=tsMy(),S=CAT.series;
  document.body.classList.toggle('tsq-on',!!TSF.q);
  if(my){
    const L=S.filter(tsMine).filter(s=>tsPass(s,false));
    const all=S.filter(tsMine).length;
    l.innerHTML=!all?`<div class="tsempty">${ic('bmark',30)}<h3>No test series yet</h3><p>Series you buy show here, with your progress and the next test.</p><button class="btn" onclick="location.hash='#/series'">${ic('cart',16)} Explore test series</button></div>`
      :!L.length?`<div class="tsempty sm">${ic('search',26)}<h3>Nothing matches “${esc(TSF.q)}”</h3></div>`
      :`<div class="tscount">${L.length} series</div><div class="tsg mine">${L.map(tsMineCard).join('')}</div>`;
    loadCovers();return;
  }
  const base=S.filter(s=>!tsOwn(s));
  tsChips(base);
  const L=base.filter(s=>tsPass(s,true));
  const nOwn=S.filter(tsOwn).length;
  l.innerHTML=(!S.length?`<div class="tsempty">${ic('book',30)}<h3>Test series are coming soon</h3><p>Please check back in a little while.</p></div>`
    :!base.length?`<div class="tsempty">${ic('check',30)}<h3>You have every test series</h3><p>Find them all in My tests.</p><button class="btn" onclick="location.hash='#/my'">${ic('bmark',16)} Open My tests</button></div>`
    :!L.length?`<div class="tsempty sm">${ic('search',26)}<h3>No test series here</h3><p>Try another exam, class or word.</p><button class="btn ghost" onclick="TSF.q='';TSF.sec='';TSF.ex='';TSF.cl='';tsfSave();route()">Show all</button></div>`
    :`<div class="tscount">${L.length} series${TSF.ex||TSF.cl?' for '+esc(tsSelTxt()):''}</div><div class="tsg">${L.map(tsCard).join('')}</div>`)
   +(nOwn&&L.length?`<button class="tsown" onclick="location.hash='#/my'">${ic('check',16)}<span>You own ${nOwn} series. They are in <b>My tests</b>.</span>${ic('right',16)}</button>`:'');
  loadCovers();
}

/* ---------- cards ---------- */
function tsCover(s,it,cls){
  const img=it&&tsImg(it.image)&&!s.cover_v?`;background-image:url('${esc(it.image)}');background-size:cover;background-position:center`:'';
  return `<div class="${cls}" style="background:${grad(s.id)}${img}" data-cov="${s.id}" data-v="${s.cover_v||0}">`;
}
function tsStars(v){return `<span class="tsst">${ic('star',13)}${(+v).toFixed(1)}</span>`}
function tsPrice(s,it){
  if(s.is_free)return `<div class="tspr free"><b>Free</b><span>for every student</span></div>`;
  if(it&&it.price!=null&&it.price!==''){const o=tsOff(it);return `<div class="tspr"><b>${tsInr(it.price)}</b>${+it.mrp>+it.price?`<s>${tsInr(it.mrp)}</s>`:''}${o?`<em>${o}% off</em>`:''}</div>`}
  return `<div class="tspr"><b>${esc(s.price_label||'Premium')}</b></div>`;
}
function tsCta(s,it,big){
  const c=big?'btn':'btn sm';
  if(tsOwn(s))return `<button class="${c}" onclick="event.stopPropagation();closeModal();location.hash='#/s/${s.id}'">${ic('play',15)} Open series</button>`;
  if(s.is_free)return `<button class="${c}" onclick="event.stopPropagation();closeModal();location.hash='#/s/${s.id}'">${ic('play',15)} Start free</button>`;
  if(it&&it.buy_on===false)return `<button class="${c} ghost" onclick="event.stopPropagation();tsSoon('${s.id}')">${ic('bell',15)} Notify me</button>`;
  if(tsId(it))return `<button class="${c} tsbuy" onclick="event.stopPropagation();tsBuy('${s.id}')">${ic('cart',15)} Buy now</button>`;
  return `<button class="${c}" onclick="event.stopPropagation();tsAsk('${s.id}')">${ic('msg',15)} Get access</button>`;
}
function tsCard(s,i){
  const it=itemOf(s),g=tsTags(s,it),I=serInfo(s),rv=it&&SHOP&&SHOP.rv[it.id],prev=I.ts.filter(t=>t.free_preview).length;
  const badge=s.is_free?'<span class="tsb free">Free</span>':it&&it.badge?`<span class="tsb">${esc(it.badge)}</span>`:it&&it.buy_on===false?'<span class="tsb soon">Coming soon</span>':'';
  const tags=[...g.ex.map(x=>EXN[x]),...g.cl.map(x=>CLN[x])];
  const sub=(it&&it.subtitle)||s.description||'';
  const facts=[`${ic('file',14)}${nTests(I.n)}`,I.folders?`${ic('folder',14)}${I.folders} folder${I.folders===1?'':'s'}`:'',prev&&!s.is_free?`${ic('eye',14)}${prev} free preview${prev===1?'':'s'}`:'',
    I.live.length?'<span class="liveb"><i></i>LIVE</span>':I.nxt?`${ic('calendar',14)}Next ${esc(new Date(I.nxt.opens_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}))}`:''].filter(Boolean);
  return `<article class="card tscard" style="--d:${Math.min(i||0,8)*45}ms" onclick="location.hash='#/s/${s.id}'">
   ${tsCover(s,it,'tscv')}${badge}${rv&&rv.count?tsStars(rv.avg):''}
    ${tags.length?`<div class="tstags">${tags.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
    ${s.is_free?'':`<span class="tslock">${ic('lock',14)}</span>`}</div>
   <div class="tsbd"><h3>${esc(s.title)}</h3>${sub?`<p class="clamp2">${esc(sub)}</p>`:''}
    <div class="tsfa">${facts.map(f=>`<span>${f}</span>`).join('')}</div>
    <div class="tsft">${tsPrice(s,it)}<div class="tsbt"><button class="btn ghost sm" onclick="event.stopPropagation();tsExplore('${s.id}')">Explore</button>${tsCta(s,it)}</div></div></div></article>`;
}
function tsMineCard(s,i){
  const it=itemOf(s),I=serInfo(s),p=I.n?Math.round(I.done*100/I.n):0;
  const nx=I.live[0]?`<span class="liveb"><i></i>LIVE</span><span class="grow">${esc(I.live[0].title)}</span>`
    :I.prog?`${ic('play',14)}<span class="grow">A test is in progress — resume</span>`
    :I.nxt?`${ic('calendar',14)}<span class="grow">Next: <b>${esc(I.nxt.title)}</b> · ${esc(fmtWhen(I.nxt.opens_at))}</span>`
    :`${ic('check',14)}<span class="grow">${I.n?(I.done===I.n?'Every test attempted':`${I.n-I.done} test${I.n-I.done===1?'':'s'} to attempt`):'Tests coming soon'}</span>`;
  return `<article class="card tsmc" style="--d:${Math.min(i||0,8)*45}ms" onclick="location.hash='#/s/${s.id}'">
   ${tsCover(s,it,'tsmcv')}</div>
   <div class="grow tsmb"><span class="tsb ${s.is_free?'free':'own'}">${s.is_free?'Free':`${ic('check',11)} Purchased`}</span><h3>${esc(s.title)}</h3>
    <div class="tsmp"><div class="bar"><i style="width:${p}%"></i></div><span><b>${I.done}</b>/${I.n} done</span></div>
    <div class="tsmn">${nx}</div></div><span class="tsmch">${ic('right',18)}</span></article>`;
}

/* ---------- exam + class picker ---------- */
function tsPick(){
  const b=(k,v,t)=>`<button class="tspk${TSF[k]===v?' on':''}" onclick="TSF.${k}=${esc(JSON.stringify(v))};tsfSave();tsPick();tsRe()">${t}</button>`;
  const n=CAT.series.filter(s=>!tsOwn(s)&&tsPass(s,true)).length;
  sheet(`<h2 class="sht">Exam and class</h2><div class="shl"></div>
   <div class="eyebrow" style="margin:0 0 10px">Exam</div><div class="tspks">${b('ex','','All exams')}${b('ex','neet','NEET')}${b('ex','jee','JEE')}</div>
   <div class="eyebrow" style="margin:18px 0 10px">Class</div><div class="tspks">${b('cl','','All classes')}${b('cl','11','Class 11')}${b('cl','12','Class 12')}${b('cl','d','Dropper')}</div>
   <p class="sm mut" style="margin:14px 0 0">Series made for every class always show. Saved on this phone.</p>
   <button class="btn block" style="margin-top:16px" onclick="closeModal()">Show ${n} series</button>`,'tspick');
}
function tsRe(){const l=document.getElementById('tsxl');if(l)l.textContent=tsSelTxt();tsDraw()}

/* ---------- Explore ---------- */
let XS={id:null,tab:'ov'};
function tsExplore(id,tab){
  XS={id,tab:tab||'ov'};tsXDraw();
  if(!SHOP||SHOP.old||!Object.keys(SHOP.ex).length)shopLoad(true).then(()=>{if(XS.id===id&&document.querySelector('#layer .bsheet[data-id="tsx"]'))tsXDraw(1)});
}
function tsXDraw(keep){
  const s=CAT.series.find(x=>x.id===XS.id);if(!s)return;
  const it=itemOf(s),g=tsTags(s,it),rv=it&&SHOP&&SHOP.rv[it.id],I=serInfo(s);
  const tags=[...g.ex.map(x=>EXN[x]),...g.cl.map(x=>CLN[x]),g.sec].filter(Boolean);
  const bi=typeof serBi==='function'&&serBi(s.id);
  const own=tsOwn(s)||s.is_free;
  const body=`<div class="tsxh">${tsCover(s,it,'tsxcv')}<div class="tsxht">${tags.length?`<span>${esc(tags.join(' · '))}</span>`:''}<h2>${esc(s.title)}</h2></div></div></div>
   <div class="tsxm">${rv&&rv.count?`${tsStars(rv.avg)}<span>${rv.count} review${rv.count===1?'':'s'}</span>`:''}<span>${nTests(I.n)}</span>${bi?'<span>English + हिंदी</span>':''}${own?`<span class="ok">${ic('check',13)} ${s.is_free?'Free':'Purchased'}</span>`:`<span>${ic('lock',13)} Locked</span>`}</div>
   <div class="seg tsxtab">${[['ov','Overview'],['rs','Resources'],['rv',`Reviews${rv&&rv.count?' · '+rv.count:''}`]].map(([k,t])=>`<button class="${XS.tab===k?'on':''}" onclick="XS.tab='${k}';tsXTab()">${t}</button>`).join('')}</div>
   <div id="tsxb">${tsXBody(s,it,rv,I)}</div>
   <div class="tsxf">${own?'<div class="grow"></div>':tsPrice(s,it)}${tsCta(s,it,1)}</div>`;
  if(keep){const b=document.querySelector('#layer .bsheet[data-id="tsx"] .box');if(b){const y=b.scrollTop;sheet(body,'tsx');const n=document.querySelector('#layer .bsheet .box');if(n)n.scrollTop=y;loadCovers();return}}
  sheet(body,'tsx');loadCovers();
}
function tsXTab(){
  document.querySelectorAll('.tsxtab button').forEach((b,i)=>b.classList.toggle('on',['ov','rs','rv'][i]===XS.tab));
  const s=CAT.series.find(x=>x.id===XS.id),it=itemOf(s),b=document.getElementById('tsxb');
  if(b){b.innerHTML=tsXBody(s,it,it&&SHOP&&SHOP.rv[it.id],serInfo(s));b.classList.remove('tsin');void b.offsetWidth;b.classList.add('tsin')}
}
function tsXBody(s,it,rv,I){
  const own=tsOwn(s)||s.is_free;
  if(XS.tab==='rs'){
    const F=CAT.folders.filter(f=>f.series_id===s.id),T=I.ts,files=s.files||[],demos=(tsId(it)&&SHOP&&SHOP.ex[it.id]&&SHOP.ex[it.id].demos||[]).filter(d=>d&&d.size&&Number.isInteger(+d.slot));
    const trow=t=>{const op=!t.locked;return `<li><span class="tsxi${op?' op':''}">${ic(op?'file':'lock',15)}</span><div class="grow"><b>${esc(t.title)}</b><span>${t.questions} questions · ${t.duration} min${t.opens_at&&isWait(t)?' · '+esc(fmtWhen(t.opens_at)):''}${t.free_preview&&!own?' · Free preview':''}</span></div></li>`};
    return `${F.length?`<h4 class="tsxs">${ic('folder',16)} Folders <span>${F.length}</span></h4><ul class="tsxl">${F.map(f=>{const n=T.filter(t=>t.folder_id===f.id).length;return `<li><span class="tsxi">${ic('folder',15)}</span><div class="grow"><b>${esc(f.title)}</b><span>${nTests(n)}</span></div></li>`}).join('')}</ul>`:''}
     <h4 class="tsxs">${ic('file',16)} Tests <span>${T.length}</span></h4>${T.length?`<ul class="tsxl">${T.slice(0,10).map(trow).join('')}</ul>${T.length>10?`<button class="tsxmore" onclick="closeModal();location.hash='#/s/${s.id}'">See all ${T.length} tests ${ic('right',14)}</button>`:''}`:'<p class="sm mut">Tests are coming soon.</p>'}
     ${files.length?`<h4 class="tsxs">${ic('layers2',16)} Study material <span>${files.length}</span></h4><ul class="tsxl">${files.map(f=>`<li class="${own?'tap':''}" ${own?`onclick="openFile('${esc(f.id)}')"`:''}><span class="tsxi${own?' op':''}">${ic(own?'download':'lock',15)}</span><div class="grow"><b>${esc(f.title)}</b><span>${esc(KIND[f.kind]||'File')}${f.size?' · '+fsize(f.size):''}${own?'':' · opens after you buy'}</span></div></li>`).join('')}</ul>`:''}
     ${demos.length?`<h4 class="tsxs">${ic('eye',16)} Demo tests <span>free</span></h4><ul class="tsxl">${demos.map(d=>`<li class="tap" onclick="tsDemo('${it.id}',${+d.slot})"><span class="tsxi op">${ic('eye',15)}</span><div class="grow"><b>${esc(d.title||'Demo test '+d.slot)}</b><span>PDF · ${fsize(d.size)} · open for everyone</span></div></li>`).join('')}</ul>`:''}`;
  }
  if(XS.tab==='rv'){
    if(!rv||!rv.count)return `<div class="tsempty sm">${ic('star',26)}<h3>No reviews yet</h3><p>Students who buy this series can rate it from the series page.</p></div>`;
    const st=rv.stars||[0,0,0,0,0],mx=Math.max(1,...st);
    return `<div class="tsrv"><div class="tsrva"><b>${(+rv.avg).toFixed(1)}</b><span class="rvst">${[1,2,3,4,5].map(k=>`<i class="${k<=Math.round(rv.avg)?'on':''}">★</i>`).join('')}</span><small>${rv.count} review${rv.count===1?'':'s'}</small></div>
      <div class="tsrvb">${st.map((n,k)=>`<div><span>${5-k}</span><i><em style="width:${n*100/mx}%"></em></i><small>${n}</small></div>`).join('')}</div></div>
     <ul class="tsrl">${(rv.list||[]).slice(0,20).map(r=>`<li><div class="row"><span class="tsrav">${esc((String(r.name||'S').trim()[0]||'S').toUpperCase())}</span><div class="grow"><b>${esc(r.name||'Student')}</b><span class="rvst">${[1,2,3,4,5].map(k=>`<i class="${k<=r.rating?'on':''}">★</i>`).join('')}</span></div><small>${r.at?esc(new Date(r.at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})):''}</small></div>
       ${r.body?`<p>${esc(r.body)}</p>`:''}${r.reply?`<div class="tsrr"><b>Reply from ${esc(CFG.SITE_NAME||'the team')}</b><p>${esc(r.reply)}</p></div>`:''}</li>`).join('')}</ul>`;
  }
  const ex=it&&SHOP&&SHOP.ex[it.id],desc=String((ex&&ex.description)||s.description||'').trim(),F=(it&&it.features)||[];
  const prev=I.ts.filter(t=>t.free_preview).length;
  return `${desc?`<div class="tsxd${desc.length>420?' clamp':''}">${esc(desc)}</div>${desc.length>420?`<button class="tsxmore" onclick="this.previousElementSibling.classList.remove('clamp');this.remove()">Read more</button>`:''}`:''}
   ${F.length?`<h4 class="tsxs">${ic('shieldok',16)} What you get</h4><ul class="tsxg">${F.slice(0,10).map(f=>`<li>${ic('check',15)}<span>${esc(f)}</span></li>`).join('')}</ul>`:''}
   <div class="tsxk"><div><b>${I.n}</b><span>Tests</span></div><div><b>${I.folders||'–'}</b><span>Folders</span></div><div><b>${s.is_free?'All':prev||'–'}</b><span>Free to try</span></div><div><b>${I.nxt?esc(new Date(I.nxt.opens_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})):I.live.length?'Live':'–'}</b><span>Next test</span></div></div>
   ${!tsOwn(s)&&!s.is_free?`<p class="tsxnote">${ic('lock',14)} You can see every test, date and file here. They open after you buy${prev?` — ${prev} free preview test${prev===1?' is':'s are'} open now`:''}.</p>`:''}`;
}
async function tsDemo(item,slot){
  if(!/^[0-9a-f-]{36}$/i.test(item))return;
  toast('Opening the demo test…');
  const r=await rpc('cbt_store_demo',{p_item:item,p_slot:+slot},true);
  const m=r&&r.ok&&typeof r.data==='string'&&r.data.match(/^data:(application\/pdf|image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!m){toast('Could not open the demo test.');return}
  try{const bin=atob(m[3]),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([u],{type:m[1]}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){toast('Could not open the demo test.')}
}

/* ---------- Buy now: the store's payment, for this account's mobile number ---------- */
function tsBuy(sid){
  const s=CAT.series.find(x=>x.id===sid),it=itemOf(s);
  if(!s||!tsId(it))return tsAsk(sid);
  try{
    const m=LS.get('store_me',null)||{};
    const c=EXN[it.course]?it.course:EXN[m.course]?m.course:EXN[TSF.ex]?TSF.ex:'neet';
    if(m.mobile&&m.mobile!==AUTH.mobile)LS.del('store_ord');   // never continue another number's order
    LS.set('store_me',{name:String(pfName()||AUTH.name||'Student').slice(0,60),mobile:AUTH.mobile,course:c});
  }catch(e){}
  const o=tsOff(it);
  $('#layer').innerHTML=`<div class="tsgo"><div class="tsgoin"><span class="tsgoi">${ic('shieldok',30)}</span><b>Opening secure checkout</b>
    <p>${esc(s.title)} · ${tsInr(it.price)}${o?` <s>${tsInr(it.mrp)}</s>`:''}</p><i class="tsgob"><em></em></i><small>Pay with any UPI app · for ${esc(maskMob(AUTH.mobile))}</small></div></div>`;
  setTimeout(()=>{location.href='store.html#b='+it.id},RMOT()?0:900);
}
function tsSoon(sid){const s=CAT.series.find(x=>x.id===sid),it=itemOf(s);if(tsId(it))location.href='store.html#x='+it.id}
function tsAsk(sid){
  const s=CAT.series.find(x=>x.id===sid)||{};
  const wa=waLink(`Hi, I am ${AUTH.name} (${AUTH.mobile}). I want to buy "${s.title}".`);
  modal(`<div class="logo" style="background:var(--goldg)">${ic('crown',24)}</div><h2>${esc(s.title||'Premium series')}</h2>
   <p class="mut" style="margin:6px 0 14px">${s.price_label?esc(s.price_label)+' · ':''}This series is not in the online store yet. Message us and we will unlock it for your account.</p>
   <div class="row">${wa?`<a class="btn" style="flex:1;text-decoration:none" href="${wa}" target="_blank" rel="noopener">${ic('msg')} Message us</a>`:`<button class="btn" style="flex:1" onclick="closeModal();supportSheet()">${ic('msg')} Contact us</button>`}<button class="btn ghost" style="flex:1" onclick="closeModal()">Close</button></div>`);
}

/* ---------- series page + locked tests: buy instead of "ask the admin" ---------- */
lockBanner=function(s){
  if(s.is_free||s.unlocked)return '';
  const it=itemOf(s),I=serInfo(s),prev=I.ts.filter(t=>t.free_preview).length;
  if(!SHOP||SHOP.old)shopLoad().then(()=>{const e=document.getElementById('tslk');if(e&&itemOf(s))e.outerHTML=lockBanner(s)});
  return `<div class="card tslk" id="tslk"><div class="tslkh"><span class="tslki">${ic('lock',20)}</span><div class="grow"><b>Unlock all ${nTests(I.n)}</b>
    <span>${prev?`${prev} free preview test${prev===1?' is':'s are'} open now. `:''}Every test, result and rank opens right after the payment is approved.</span></div></div>
   <div class="tslkf">${tsPrice(s,it)}<div class="tsbt"><button class="btn ghost sm" onclick="tsExplore('${s.id}')">Explore</button>${tsCta(s,it)}</div></div></div>`;
};
{const _o=openTest;openTest=function(id){
  const t=CAT&&CAT.tests.find(x=>x.id===id);
  if(!t||!t.locked)return _o(id);
  const s=CAT.series.find(x=>x.id===t.series_id)||{},it=itemOf(s),I=serInfo(s);
  modal(`<div class="logo" style="background:var(--goldg);color:#4a3003">${ic('lock',24)}</div><h2>This test is locked</h2>
   <p class="mut" style="margin:6px 0 4px">“${esc(t.title)}” is part of <b>${esc(s.title||'a premium series')}</b> — ${nTests(I.n)} with All-India rank.</p>
   <div class="tsmd">${tsPrice(s,it)}</div>
   <div class="row" style="margin-top:6px"><button class="btn ghost" style="flex:1" onclick="closeModal();tsExplore('${s.id}')">Explore</button><span style="flex:1;display:flex">${tsCta(s,it,1).replace('class="btn ','class="btn block ')}</span></div>`);
}}
{const _fb=filesBlock;filesBlock=function(s){
  if(s.is_free||s.unlocked)return _fb(s);
  const fl=s.files||[];if(!fl.length)return '';
  return `<div class="h2s">${ic('file',20)} Syllabus &amp; schedule</div><div class="card">${fl.map(f=>`<div class="rrow"><div class="tico">${ic('lock')}</div>
    <div class="grow"><b>${esc(f.title)}</b><span class="sm mut">${esc(KIND[f.kind]||'File')} · opens after you buy</span></div>
    <button class="btn ghost sm" onclick="tsExplore('${s.id}','rs')">${ic('lock')} Locked</button></div>`).join('')}</div>`;
}}
{const _vs=viewSeries;viewSeries=function(id){
  const r=_vs.apply(this,arguments),s=CAT&&CAT.series.find(x=>x.id===id);
  if(s&&tsMine(s)){const a=document.querySelector('#app .crumb a[href="#/series"]');if(a){a.setAttribute('href','#/my');a.lastChild.nodeValue=' My tests'}}
  if(s&&!s.is_free&&!s.unlocked){const b=document.querySelector('#app .svhl button.btn'),m=b&&(b.getAttribute('onclick')||'').match(/openTest\('([^']+)'\)/),t=m&&CAT.tests.find(x=>x.id===m[1]);if(t&&t.locked)b.innerHTML=ic('lock')+' Unlock'}
  return r;
}}

/* ---------- route: #/my ---------- */
{const _r0=route0;route0=async function(){
  if((location.hash||'')==='#/my'&&AUTH){
    if(typeof annLoad==='function')annLoad();
    if(!CAT){skelPage();if(!(await loadCat()))return}
    else if(Date.now()-CATAT>30000){await loadCat(true);if(!AUTH||INTEST)return}
    return viewHome('series');
  }
  return _r0.apply(this,arguments);
}}

;(window.__p=window.__p||{})['app23']=1;
