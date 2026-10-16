/* ================= v8 admin: new navigation, Live monitor, quick search, activity, notices page ================= */
async function A3(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin3',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
const AI={
  overview:'<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  live:'<circle cx="12" cy="12" r="2.5"/><path d="M16.2 7.8a6 6 0 010 8.4M7.8 16.2a6 6 0 010-8.4M19 5a10 10 0 010 14M5 19A10 10 0 015 5"/>',
  students:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/>',
  content:'<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5V21h16"/>',
  create:'<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  results:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
  notices:'<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 003.4 0"/>',
  reports:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  more:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  site:'<path d="M14 3h7v7M10 14L21 3M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  out:'<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  wa:'<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  reset:'<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/>',
  dl:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  play:'<path d="M7 4l13 8-13 8z"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
};
const ai=(n,s)=>`<svg class="i" viewBox="0 0 24 24"${s?` style="width:${s}px;height:${s}px"`:''}>${AI[n]||''}</svg>`;
const NAVX=[['overview','Home'],['live','Live monitor'],['students','Students'],['content','Series & tests'],['create','Create test'],['results','Results'],['notices','Notices'],['reports','Reports']];
const DOCKX=['overview','live','students','content'];
const XTRA=['live','notices'];
const TTL={overview:'Home',live:'Live test monitor',students:'Students',content:'Series & tests',create:'Create test',results:'Results',notices:'Notices',reports:'Reports'};

function navHtml(){
  return `<a class="sbrand" href=""><span class="logo"><svg class="i" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/></svg></span><span><b>Admin</b><small>Control centre</small></span></a>
   <button class="sfind" onclick="openFind()">${ai('search',16)}<span>Search…</span><kbd>/</kbd></button>
   <div class="snav">${NAVX.map(([k,l])=>`<button class="sni" data-k="${k}" onclick="tab('${k}')">${ai(k,19)}<span>${l}</span><em class="nb" id="nb_${k}"></em></button>`).join('')}</div>
   <div class="sfoot"><a class="sni" href="index.html" target="_blank" rel="noopener">${ai('site',19)}<span>Student site</span></a>
   <button class="sni" onclick="toggleTheme()">${MOON.replace('class="i"','class="i" style="width:19px;height:19px"')}<span>Dark / light</span></button>
   <button class="sni" onclick="settings()">${ai('gear',19)}<span>Settings</span></button></div>`;
}
function dockHtml(){
  return DOCKX.map(k=>`<button data-k="${k}" onclick="tab('${k}')">${ai(k,21)}<span>${k==='overview'?'Home':k==='content'?'Tests':k==='live'?'Live':'Students'}</span><em class="nb" id="nd_${k}"></em></button>`).join('')+
   `<button data-k="more" onclick="openMore()">${ai('more',21)}<span>More</span><em class="nb" id="nd_more"></em></button>`;
}
function openMore(){
  const it=(k,l,f)=>`<button class="mitem" onclick="closeModal();${f}">${ai(k,20)}<span>${l}</span><em class="nb">${badgeOf(k)||''}</em></button>`;
  modal(`<div class="mhead"><h2>More</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">${ai('x',18)}</button></div>
   <div class="mgrid2">${it('create','Create test',"tab('create')")}${it('results','Results',"tab('results')")}${it('notices','Notices',"tab('notices')")}${it('reports','Reports',"tab('reports')")}
   ${it('search','Search',"openFind()")}${it('gear','Settings',"settings()")}
   <a class="mitem" href="index.html" target="_blank" rel="noopener">${ai('site',20)}<span>Student site</span></a>${it('out','Sign out',"signOutAdmin()")}</div>`);
  const b=document.querySelector('#layer .modal');if(b)b.classList.add('asheet');
}
function badgeOf(k){
  if(k==='students')return (ST||[]).filter(s=>s.status==='pending').length;
  if(k==='reports')return (RP||[]).filter(x=>x.status==='open').length;
  if(k==='live')return LVN||0;
  return 0;
}
let LVN=0;
function navBadges(){
  for(const k of ['students','reports','live']){
    const n=badgeOf(k);
    for(const id of ['nb_'+k,'nd_'+k]){const e=document.getElementById(id);if(e){e.textContent=n?(n>99?'99+':n):'';e.classList.toggle('on',!!n);e.classList.toggle('live',k==='live')}}
  }
  const m=document.getElementById('nd_more'),r=badgeOf('reports');if(m){m.textContent=r||'';m.classList.toggle('on',!!r)}
}
function navActive(t){
  document.querySelectorAll('.sni[data-k],#adock button[data-k]').forEach(b=>b.classList.toggle('on',b.dataset.k===t||(b.dataset.k==='more'&&!DOCKX.includes(t))));
  const pt=document.getElementById('ptitle');if(pt)pt.textContent=TTL[t]||'';
  document.title=(TTL[t]||'Admin')+' · Admin';
}

/* ---- wrap the original shell / tab / gate ---- */
const _shell5=shell,_tab5=tab,_gate5=gate,_badge5=badge,_repBadge5=repBadge,_loadOverview5=loadOverview;
shell=function(){
  document.body.classList.add('admx');
  let as=document.getElementById('aside');
  if(!as){as=document.createElement('aside');as.id='aside';document.body.appendChild(as)}
  as.innerHTML=navHtml();
  let dk=document.getElementById('adock');
  if(!dk){dk=document.createElement('nav');dk.id='adock';document.body.appendChild(dk)}
  dk.innerHTML=dockHtml();
  const hi=document.querySelector('.hdr-in');
  if(hi&&!document.getElementById('ptitle')){
    const t=document.createElement('div');t.id='ptitle';t.className='ptitle';hi.insertBefore(t,hi.querySelector('.sp'));
    const s=document.createElement('button');s.className='iconbtn';s.id='findb';s.setAttribute('aria-label','Search');s.innerHTML=ai('search');s.onclick=openFind;
    hi.insertBefore(s,document.getElementById('gear'));
  }
  let saved='overview';try{saved=sessionStorage.getItem('adm_tab')||'overview'}catch(e){}
  _shell5();
  const root=$('#root');
  for(const k of XTRA)if(!document.getElementById('pn_'+k)){const p=document.createElement('div');p.className='pane';p.id='pn_'+k;root.appendChild(p)}
  if(XTRA.includes(saved))tab(saved);else navActive(CUR);
  navBadges();
  if(!ST.length)A('students').then(r=>{if(r.ok){ST=r.students;badge()}});
  liveCount();
};
tab=async function(t){
  navActive(t);
  if(t!=='live')lvStop();
  if(XTRA.includes(t)){
    CUR=t;try{sessionStorage.setItem('adm_tab',t)}catch(e){}
    for(const k of ['overview','students','content','create','results','reports']){const b=$('#tb_'+k),p=$('#pn_'+k);if(b)b.classList.remove('on');if(p)p.classList.remove('on')}
    for(const k of XTRA){const p=$('#pn_'+k);if(p)p.classList.toggle('on',k===t)}
    window.scrollTo(0,0);
    if(t==='live')return loadLive();
    if(t==='notices')return loadNotices();
    return;
  }
  for(const k of XTRA){const p=$('#pn_'+k);if(p)p.classList.remove('on')}
  window.scrollTo(0,0);
  return _tab5(t);
};
gate=function(err){document.body.classList.remove('admx');lvStop();return _gate5(err)};
badge=function(){_badge5();navBadges()};
repBadge=function(){_repBadge5();navBadges()};

/* ---- overview: live strip + activity feed (notices moved to their own page) ---- */
loadOverview=async function(){
  await _loadOverview5();
  const el=$('#pn_overview');if(!el||!OV)return;
  const ab=el.querySelector('#annbox');
  if(ab){const h=ab.previousElementSibling;if(h&&h.classList.contains('h2s'))h.remove();ab.remove()}
  const hero=el.querySelector('.ovhero');
  if(hero&&!el.querySelector('#ovlive')){const d=document.createElement('div');d.id='ovlive';hero.insertAdjacentElement('afterend',d)}
  el.insertAdjacentHTML('beforeend',`<div class="h2s">Recent activity</div><div class="card actc" id="actbox"><div class="sk" style="width:60%"></div><div class="sk" style="width:85%;margin-top:12px"></div></div>
    <div class="h2s">Notices</div><div class="card attn1" onclick="tab('notices')"><span class="ico1">${ai('notices',20)}</span><div class="grow"><b>Manage notices</b><div class="sm mut">Create, edit, hide or delete what students see under the bell</div></div><span class="chev2">›</span></div>`);
  loadActivity();
};
const ACTI={result:['results','ok'],start:['play','pri'],request:['user','warn'],join:['user','pri'],report:['reports','bad']};
async function loadActivity(){
  const r=await A3('activity');
  const box=$('#actbox'),lv=$('#ovlive');
  if(!r.ok){if(box)box.innerHTML=`<div class="sm mut">${r.error==='missing'?'Run <b>supabase_v8_update.sql</b> in Supabase once to see live activity.':'Could not load activity.'}</div>`;return}
  LVN=r.writing||0;navBadges();
  if(lv)lv.innerHTML=r.writing?`<div class="livestrip" onclick="tab('live')"><span class="pulse"></span><div class="grow"><b>${r.writing} student${r.writing==1?'':'s'} writing a test right now</b><div class="sm">Tap to open the live monitor</div></div><span class="chev2">›</span></div>`
    :(r.online?`<div class="onl"><span class="gdot"></span>${r.online} student${r.online==1?'':'s'} online in the last 10 min</div>`:'');
  if(!box)return;
  const txt=x=>x.k==='result'?`<b>${esc(x.name)}</b> submitted <b>${esc(x.title)}</b> · ${+x.score}/${+x.max}${x.late?' <span class="chip warn">late</span>':''}`
    :x.k==='start'?`<b>${esc(x.name)}</b> started <b>${esc(x.title)}</b>`
    :x.k==='request'?`<b>${esc(x.name)}</b> requested access <span class="chip warn">pending</span>`
    :x.k==='join'?`<b>${esc(x.name)}</b> joined`
    :`<b>${esc(x.name)}</b> reported Q${x.q} in <b>${esc(x.title||'a test')}</b>`;
  const go=x=>x.k==='request'?"tab('students')":x.k==='report'?"tab('reports')":x.k==='result'||x.k==='start'?`lvOpen('${x.tid}')`:'';
  box.innerHTML=r.items.length?r.items.slice(0,30).map(x=>{const c=ACTI[x.k]||['user',''];return `<div class="actr" ${go(x)?`onclick="${go(x)}"`:''}><span class="aico ${c[1]}">${ai(c[0],16)}</span><div class="grow">${txt(x)}</div><span class="sm mut nowrap">${ago(x.at)}</span></div>`}).join('')
    :'<div class="sm mut">Nothing yet.</div>';
}
async function liveCount(){const r=await A3('activity');if(r.ok){LVN=r.writing||0;navBadges()}}

/* ---- notices page ---- */
function loadNotices(){
  const p=$('#pn_notices');
  if(!p.querySelector('#annbox'))p.innerHTML=`<div class="phead"><div><h1>Notices</h1><p class="sm mut">Students see these on their Notifications page (bell icon). The newest also shows on their Home. Make as many as you want.</p></div></div><div id="annbox"><div class="card"><div class="sk" style="width:50%"></div></div></div>`;
  return loadAnnAdmin();
}

/* ---- live test monitor ---- */
let LV={id:null,tests:[],data:null,seg:'writing',timer:null,tick:null};
function lvOpen(id){LV.id=id;LV.seg='writing';tab('live')}
function lvStop(){clearInterval(LV.timer);clearInterval(LV.tick);LV.timer=LV.tick=null}
async function loadLive(){
  const p=$('#pn_live');
  if(!LV.tests.length||!p.querySelector('#lvbody')){
    p.innerHTML=`<div class="phead"><div><h1>Live test monitor</h1><p class="sm mut">See who is writing, who submitted and who has not started — updates every 15 seconds.</p></div></div><div id="lvbody">${askel()}</div>`;
    const r=await A3('live_tests');
    if(!r.ok){$('#lvbody').innerHTML=`<div class="card empty"><b>${r.error==='missing'?'One-time setup needed':'Could not load'}</b><p class="sm">${r.error==='missing'?'Run <b>supabase_v8_update.sql</b> in Supabase → SQL Editor once, then refresh this page.':'Check your internet and try again.'}</p></div>`;return}
    LV.tests=r.tests;
    if(!LV.id||!LV.tests.some(t=>t.id===LV.id)){const live=LV.tests.find(t=>t.open_now>0);LV.id=(live||LV.tests[0]||{}).id||null}
  }
  if(!LV.id){$('#lvbody').innerHTML=`<div class="card empty"><b>No tests yet.</b></div>`;return}
  await lvFetch();
  lvStop();
  LV.timer=setInterval(()=>{if(!document.hidden&&CUR==='live')lvFetch(true)},15000);
  LV.tick=setInterval(lvTick,1000);
}
async function lvFetch(quiet){
  const r=await A3('live',{id:LV.id});
  if(!r.ok){if(!quiet)toast('Could not load');return}
  LV.data=r;LV.skew=r.now-Date.now();LVN=r.writing.length;navBadges();lvDraw();
}
const lvNow=()=>Date.now()+(LV.skew||0);
const mmss=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(x).padStart(2,'0')};
function lvDraw(){
  const d=LV.data,t=d.test,b=$('#lvbody');if(!b)return;
  const wr=d.writing.length,dn=d.done.length,ns=d.waiting.length,ex=d.expired.length,el=Math.max(d.eligible,wr+dn+ns+ex);
  const pc=n=>el?n*100/el:0;
  const opens=t.opens_at?(t.opens_at>lvNow()?`Opens ${new Date(t.opens_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} · <span data-op="${t.opens_at}"></span>`:`Opened ${new Date(t.opens_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}`):'Open any time';
  const sel=`<select id="lvsel" onchange="LV.id=this.value;LV.seg='writing';lvFetch()">${LV.tests.map(x=>`<option value="${x.id}" ${x.id===LV.id?'selected':''}>${x.open_now?'● ':''}${esc(x.title)} — ${esc(x.series)}</option>`).join('')}</select>`;
  const seg=(k,l,n)=>`<button class="${LV.seg===k?'on':''}" onclick="LV.seg='${k}';lvDraw()">${l} <b>${n}</b></button>`;
  b.innerHTML=`<div class="lvtop card">${sel}<div class="lvmeta"><span class="chip">${t.questions} Q · ${t.duration} min · max ${+t.max}</span><span class="chip ${t.active?'ok':''}">${t.active?'Visible':'Hidden'}</span><span class="sm mut">${opens}</span>
     <button class="btn ghost sm" onclick="lvFetch()">${ai('reset',14)} Refresh</button></div></div>
   <div class="lvk">
     <div class="lk w"><b>${wr}</b><span>Writing now</span></div>
     <div class="lk d"><b>${dn}</b><span>Submitted</span></div>
     <div class="lk n"><b>${ns}</b><span>Not started</span></div>
     <div class="lk x"><b>${ex}</b><span>Time over, not submitted</span></div></div>
   <div class="lvbar" title="Progress"><i class="d" style="width:${pc(dn)}%"></i><i class="w" style="width:${pc(wr)}%"></i><i class="x" style="width:${pc(ex)}%"></i></div>
   <div class="sm mut" style="margin:6px 2px 14px">${el} student${el==1?'':'s'} can take this test · updated ${new Date(lvNow()).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',second:'2-digit'})}</div>
   <div class="seg lvseg">${seg('writing','Writing',wr)}${seg('done','Submitted',dn)}${seg('waiting','Not started',ns)}${seg('expired','Time over',ex)}</div>
   <div class="card lvlist">${lvRows()}</div>
   ${LV.seg==='done'&&dn?`<button class="btn ghost sm" style="margin-top:10px" onclick="lvCsv()">${ai('dl',14)} Download CSV</button>`:''}`;
  lvTick();
}
const waTo=(m,txt)=>`https://wa.me/91${String(m).replace(/\D/g,'').slice(-10)}?text=${encodeURIComponent(txt)}`;
function lvRows(){
  const d=LV.data,t=d.test,L=d[LV.seg];
  if(!L.length)return `<div class="sm mut" style="padding:14px 4px;text-align:center">${LV.seg==='writing'?'Nobody is writing this test right now.':LV.seg==='done'?'No submissions yet.':LV.seg==='waiting'?'Everyone has started 🎉':'None.'}</div>`;
  const site=siteUrl();
  if(LV.seg==='writing')return L.map(x=>{const tot=(x.ends-x.started)||1;return `<div class="lrow"><span class="av">${esc((x.name||'?')[0].toUpperCase())}</span><div class="grow"><b>${esc(x.name)}</b><div class="sm mut">${esc(x.mobile)} · started ${new Date(x.started).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})}</div>
      <div class="tleft"><i data-tb="${x.started}|${x.ends}" style="width:${Math.max(0,Math.min(100,(x.ends-lvNow())*100/tot))}%"></i></div></div><div class="lend"><b data-te="${x.ends}">–</b><span class="sm mut">left</span></div></div>`}).join('');
  if(LV.seg==='done')return L.map((x,i)=>{const p=x.max?Math.round(x.score*100/x.max):0;return `<div class="lrow"><span class="rk">${i+1}</span><div class="grow"><b>${esc(x.name)}</b> ${x.late?'<span class="chip warn">late</span>':''}<div class="sm mut">✓${x.correct} ✗${x.wrong} – ${x.skipped} · ${Math.round(x.used/60)} min · ${new Date(x.at).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})}</div></div><div class="lend"><b>${+x.score}/${+x.max}</b><span class="sm ${p>=60?'okt':p>=35?'wt':'bt'}">${p}%</span></div></div>`}).join('');
  if(LV.seg==='waiting')return L.map(x=>`<div class="lrow"><span class="av">${esc((x.name||'?')[0].toUpperCase())}</span><div class="grow"><b>${esc(x.name)}</b><div class="sm mut">${esc(x.mobile)} · seen ${ago(x.seen)} · devices ${x.devices}/${x.max_devices}</div></div>
      <div class="lact">${x.devices>=x.max_devices?`<button class="btn warn sm" onclick="lvReset('${x.id}')" title="Reset devices">${ai('reset',14)}</button>`:''}<a class="btn soft sm" target="_blank" rel="noopener" href="${waTo(x.mobile,`Hi ${x.name}, "${t.title}" is live now. Open ${site} and start your test. All the best!`)}">${ai('wa',14)}</a></div></div>`).join('');
  return L.map(x=>`<div class="lrow"><span class="av">${esc((x.name||'?')[0].toUpperCase())}</span><div class="grow"><b>${esc(x.name)}</b><div class="sm mut">${esc(x.mobile)} · ended ${ago(x.ends)} · answers may still arrive when their phone is back online</div></div>
      <div class="lact"><a class="btn soft sm" target="_blank" rel="noopener" href="${waTo(x.mobile,`Hi ${x.name}, your time for "${t.title}" is over. Please open ${site} once with internet so your answers are submitted.`)}">${ai('wa',14)}</a></div></div>`).join('');
}
function lvTick(){
  const n=lvNow();
  document.querySelectorAll('#pn_live [data-te]').forEach(e=>{const s=(+e.dataset.te-n)/1000;e.textContent=s>0?mmss(s):'0:00';e.parentElement.parentElement.classList.toggle('low',s<300)});
  document.querySelectorAll('#pn_live [data-tb]').forEach(e=>{const [a,z]=e.dataset.tb.split('|').map(Number);e.style.width=Math.max(0,Math.min(100,(z-n)*100/((z-a)||1)))+'%'});
  document.querySelectorAll('#pn_live [data-op]').forEach(e=>{const s=(+e.dataset.op-n)/1000;e.textContent=s>0?'in '+mmss(s):'now'});
}
async function lvReset(id){const r=await A('student_devices_reset',{id});if(r.ok){toast('Devices reset — student can sign in now');lvFetch(true)}}
function lvCsv(){
  const d=LV.data;dl(`${d.test.title.replace(/[^\w ]+/g,'')}-live-results.csv`,[['Rank','Name','Mobile','Score','Max','Correct','Wrong','Skipped','Minutes','Late','Submitted at'],
    ...d.done.map((x,i)=>[i+1,x.name,x.mobile,x.score,x.max,x.correct,x.wrong,x.skipped,Math.round(x.used/60),x.late?'yes':'',new Date(x.at).toLocaleString('en-IN')])]);
}

/* ---- quick search ( / or Ctrl+K ) ---- */
let FD={q:'',sel:0,items:[]};
async function openFind(){
  modal(`<div class="findbox"><div class="fin">${ai('search',18)}<input id="fq" type="search" placeholder="Search students, mobile numbers, tests…" autocomplete="off" oninput="findRun(this.value)" onkeydown="findKey(event)"><kbd>Esc</kbd></div><div id="fres" class="fres"></div></div>`);
  const m=document.querySelector('#layer .modal');if(m)m.classList.add('afind');
  setTimeout(()=>{const i=$('#fq');if(i)i.focus()},30);
  findRun('');
  const need=[];if(!ST.length)need.push(A('students').then(r=>{if(r.ok){ST=r.students;badge()}}));if(!CA.tests.length)need.push(loadCatalog());
  if(need.length){await Promise.all(need);const i=$('#fq');if(i)findRun(i.value)}
}
function findRun(q){
  q=(q||'').trim().toLowerCase();FD.q=q;FD.sel=0;
  const acts=[['plus','Add a student',"addModal()"],['create','Create a new test',"tab('create')"],['notices','Write a notice',"tab('notices').then(()=>annModal())"],['live','Open live monitor',"tab('live')"],['results','See all results',"tab('results')"]];
  const it=[];
  if(q){
    const dq=q.replace(/\D/g,'');
    ST.filter(s=>(s.name||'').toLowerCase().includes(q)||(dq.length>=3&&String(s.mobile).includes(dq))).slice(0,8)
      .forEach(s=>it.push({ic:'user',t:s.name,s:`${s.mobile} · ${s.status}${s.status==='pending'?' — needs approval':''}`,f:`manage('${s.id}')`}));
    CA.tests.filter(x=>(x.title||'').toLowerCase().includes(q)).slice(0,6)
      .forEach(x=>it.push({ic:'create',t:x.title,s:'Test · open analytics',f:`analytics('${x.id}')`,x:[['live',"lvOpen('"+x.id+"')"]]}));
    CA.series.filter(x=>(x.title||'').toLowerCase().includes(q)).slice(0,4)
      .forEach(x=>it.push({ic:'content',t:x.title,s:'Series · '+(x.is_free?'free':'paid'),f:`OPEN['${x.id}']=true;tab('content')`}));
    acts.filter(a=>a[1].toLowerCase().includes(q)).forEach(a=>it.push({ic:a[0],t:a[1],s:'Action',f:a[2]}));
  }else acts.forEach(a=>it.push({ic:a[0],t:a[1],s:'Action',f:a[2]}));
  FD.items=it;
  const r=$('#fres');if(!r)return;
  r.innerHTML=it.length?it.map((x,i)=>`<div class="fitem ${i===FD.sel?'on':''}" onmouseenter="findHi(${i})" onclick="findGo(${i})"><span class="aico">${ai(x.ic,16)}</span><div class="grow"><b>${esc(x.t)}</b><div class="sm mut">${esc(x.s)}</div></div>${(x.x||[]).map(([k,f])=>`<button class="iconbtn sm" title="Live monitor" onclick="event.stopPropagation();closeModal();${f}">${ai(k,15)}</button>`).join('')}</div>`).join('')
    :`<div class="sm mut" style="padding:18px;text-align:center">Nothing found for “${esc(q)}”.</div>`;
}
function findHi(i){FD.sel=i;document.querySelectorAll('.fitem').forEach((e,k)=>e.classList.toggle('on',k===i))}
function findGo(i){const x=FD.items[i];if(!x)return;closeModal();setTimeout(()=>{(new Function(x.f))()},0)}
function findKey(e){
  if(e.key==='ArrowDown'){e.preventDefault();findHi(Math.min(FD.items.length-1,FD.sel+1))}
  else if(e.key==='ArrowUp'){e.preventDefault();findHi(Math.max(0,FD.sel-1))}
  else if(e.key==='Enter'){e.preventDefault();findGo(FD.sel)}
  else if(e.key==='Escape')closeModal();
}
document.addEventListener('keydown',e=>{
  if(!document.body.classList.contains('admx'))return;
  const typing=/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||'');
  if((e.key==='k'&&(e.ctrlKey||e.metaKey))||(e.key==='/'&&!typing&&!$('#layer').innerHTML)){e.preventDefault();openFind()}
  if(e.key==='Escape'&&$('#layer').innerHTML&&!typing)closeModal();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&CUR==='live'&&LV.id)lvFetch(true)});
;(window.__p=window.__p||{})['admin5']=1;
