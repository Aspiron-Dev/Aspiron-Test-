/* ===== Admin: Approvals hub (requests + payments + access codes) and a grouped, tidy menu ===== */
AI.approvals='<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9"/>';
AI.key='<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2"/>';
XTRA.push('approvals');TTL.approvals='Approvals';
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='approvals')return loadApprovals();return r}}

/* ---------- menu groups (sidebar on computer, More sheet on phone) ---------- */
const MGROUPS=[
  ['Students & payments',[['approvals','Approvals'],['students','Students'],['store','Store & orders'],['reports','Reports']]],
  ['Create & publish',[['create','Create test'],['content','Series & tests'],['banners','Home banners'],['notices','Announcements'],['pyq','PYQ Bank']]],
  ['Results & live',[['live','Live monitor'],['results','Results'],['insights','Insights']]],
];
const MKNOWN=new Set(MGROUPS.flatMap(g=>g[1].map(x=>x[0])));
// phone bottom bar: Home · Live · Approvals · Students · Tests · More
DOCKX.length=0;DOCKX.push('overview','live','approvals','students','content');
const DOCKL={overview:'Home',live:'Live',approvals:'Approvals',students:'Students',content:'Tests'};
dockHtml=function(){
  return DOCKX.map(k=>`<button data-k="${k}" onclick="tab('${k}')">${ai(k,21)}<span>${DOCKL[k]}</span><em class="nb" id="nd_${k}"></em></button>`).join('')+
   `<button data-k="more" onclick="openMore()">${ai('more',21)}<span>More</span><em class="nb" id="nd_more"></em></button>`;
};
{const _nh=navHtml;navHtml=function(){
  const h=_nh(),a=h.indexOf('<div class="snav">'),b=h.indexOf('<div class="sfoot">');if(a<0||b<0)return h;
  const extra=NAVX.filter(([k])=>k!=='overview'&&!MKNOWN.has(k));
  const item=([k,l])=>`<button class="sni" data-k="${k}" onclick="tab('${k}')">${ai(k,19)}<span>${l}</span><em class="nb" id="nb_${k}"></em></button>`;
  const nav=`<div class="snav">${item(['overview','Home'])}${MGROUPS.map(([g,L])=>`<div class="sgrp">${g}</div>${L.map(item).join('')}`).join('')}${extra.length?`<div class="sgrp">More</div>${extra.map(item).join('')}`:''}</div>`;
  return h.slice(0,a)+nav+h.slice(b);
}}
openMore=function(){
  const it=([k,l])=>`<button class="mitem" onclick="closeModal();tab('${k}')">${ai(k,20)}<span>${l}</span><em class="nb ${badgeOf(k)?'on':''}">${badgeOf(k)||''}</em></button>`;
  const act=(k,l,f,x='')=>`<button class="mitem" ${x} onclick="closeModal();${f}">${ai(k,20)}<span>${l}</span></button>`;
  modal(`<div class="mhead"><h2>Menu</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">${ai('x',18)}</button></div>
   ${MGROUPS.map(([g,L])=>`<div class="mgt">${g}</div><div class="mgrid2">${L.map(it).join('')}</div>`).join('')}
   <div class="mgt">Quick actions</div><div class="mgrid2">${act('plus','Add student + code','addModal()')}${act('key','New code for a student','apvCodeFor()')}</div>
   <div class="mgt">App</div><div class="mgrid2">${act('search','Search','openFind()')}${act('gear','Settings','settings()')}
    <a class="mitem" href="index.html" target="_blank" rel="noopener">${ai('site',20)}<span>Student site</span></a><a class="mitem" href="store.html" target="_blank" rel="noopener">${ai('store',20)}<span>Store page</span></a>
    ${act('install','Install admin app','installAdmin()','data-ainst')}${act('out','Sign out','signOutAdmin()')}</div>`);
  const b=document.querySelector('#layer .modal');if(b)b.classList.add('asheet');
  try{admInstUi()}catch(e){}
};
// badges: approvals = student requests + payments the student says are done (or all pending orders)
{const _b=badgeOf;badgeOf=function(k){
  if(k==='approvals')return apvCount().total;
  return _b(k);
}}
function apvCount(){
  const req=(ST||[]).filter(s=>s.status==='pending').length,ord=((typeof SS!=='undefined'&&SS.orders)||[]).filter(o=>o.status==='pending'),paid=ord.filter(o=>o.payer||o.utr).length;
  return{req,paid,wait:ord.length-paid,total:req+(paid||ord.length)};
}
{const _nb=navBadges;navBadges=function(){_nb();const n=badgeOf('approvals');for(const id of ['nb_approvals','nd_approvals']){const e=document.getElementById(id);if(e){e.textContent=n?(n>99?'99+':n):'';e.classList.toggle('on',!!n)}}
  const m=document.getElementById('nd_more');if(m){const r=badgeOf('reports');m.textContent=r||'';m.classList.toggle('on',!!r)}}}
{const d=document.getElementById('adock');if(d){d.innerHTML=dockHtml();navBadges()}}
{const s=document.querySelector('.snav');if(s&&s.parentElement){const t=document.createElement('div');t.innerHTML=navHtml();const n=t.querySelector('.snav');if(n)s.replaceWith(n)}}

/* ---------- Approvals page ---------- */
async function loadApprovals(){
  const p=$('#pn_approvals');if(!p)return;
  p.innerHTML=`<div class="phead"><div><h1>Approvals</h1><p class="sm mut">Everything waiting for you in one place: payments to verify, new access requests and access codes.</p></div></div><div id="apvbody">${askel()}</div>`;
  const [s,o]=await Promise.all([A('students'),ASTO('get')]);
  if(s.ok)ST=s.students;
  if(o.ok)SS=Object.assign(SS,{settings:o.settings||{},items:o.items||[],orders:o.orders||[]});
  if(!CA.series.length)await loadCatalog();
  APV.store=o.ok;apvDraw();navBadges();
}
const APV={store:true};
const apvAgo=t=>{const m=Math.round((Date.now()-new Date(t).getTime())/6e4);return m<60?`${Math.max(1,m)} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`};
function apvDraw(){
  const b=$('#apvbody');if(!b)return;const c=apvCount();
  const ord=(SS.orders||[]).filter(o=>o.status==='pending'),ready=ord.filter(o=>o.payer||o.utr),wait=ord.filter(o=>!o.payer&&!o.utr);
  const req=(ST||[]).filter(s=>s.status==='pending').sort((a,b)=>(b.created||0)-(a.created||0));
  b.innerHTML=`<div class="sstats" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px"><div class="sbox"><b>${c.paid}</b><span>Payments to verify</span></div><div class="sbox"><b>${c.req}</b><span>Access requests</span></div><div class="sbox"><b>${c.wait}</b><span>Waiting to pay</span></div></div>
   <div class="h2s">💳 Payments to verify <span class="n">${ready.length}</span></div>
   ${!APV.store?'<div class="card empty sm">Store is not set up yet (run supabase_v13_store.sql).</div>'
    :ready.length?`<div class="card"><p class="sm mut" style="margin-top:0">Match the <b>amount</b>, <b>paid-from name</b> and <b>UTR</b> with your bank / UPI app and the screenshot on Telegram, then tap <b>✅ Approve &amp; unlock</b>.</p><div id="stol">${ready.map(stoOrd).join('')}</div></div>`
    :'<div class="card empty sm">No payments waiting. 🎉</div>'}
   <div class="h2s">🙋 Access requests <span class="n">${req.length}</span></div>
   ${req.length?`<div class="card" style="padding:4px 16px">${req.map(s=>`<div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--bd);flex-wrap:wrap" class="apvr">
      <div style="flex:1;min-width:170px"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)}${s.created?' · '+apvAgo(s.created):''}${ord.some(o=>o.mobile===s.mobile)?' · <span class="chip warn">has a store order</span>':''}</div></div>
      <div class="row" style="gap:6px"><button class="btn sm" onclick="approve('${s.id}')">✓ Approve &amp; get code</button><button class="btn ghost sm" onclick="reject('${s.id}')">Reject</button></div></div>`).join('')}</div>`
    :'<div class="card empty sm">No new requests.</div>'}
   <div class="h2s">🔑 Access codes</div>
   <div class="card"><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" onclick="addModal()">➕ Add student &amp; get code</button><button class="btn ghost" onclick="apvCodeFor()">🔁 New code for a student</button></div>
    <p class="sm mut" style="margin:10px 0 0">A new code signs the student out of all their phones. Use it only if they lost their code.</p></div>
   ${wait.length?`<div class="h2s">⏳ Started buying, not paid yet <span class="n">${wait.length}</span></div><div class="card"><div>${wait.map(stoOrd).join('')}</div></div>`:''}`;
}
async function apvCodeFor(){
  if(!(ST||[]).length){const r=await A('students');if(r.ok)ST=r.students}
  modal(`<div class="stohd"><h2>New code for a student</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <label class="l">Mobile number or name</label><input type="search" id="apvq" placeholder="Type to search…" oninput="apvFind(this.value)" autocomplete="off">
   <div id="apvl" style="margin-top:8px"></div>`);
  stoSheet();setTimeout(()=>{const i=$('#apvq');if(i)i.focus()},50);
}
function apvFind(q){
  q=q.trim().toLowerCase();const l=$('#apvl');if(!l)return;
  const L=q.length<2?[]:(ST||[]).filter(s=>s.mobile.includes(q)||String(s.name||'').toLowerCase().includes(q)).slice(0,8);
  l.innerHTML=L.length?L.map(s=>`<div class="arow"><div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)} · ${esc(s.status)}</div></div><button class="btn sm" onclick="closeModal();newCode('${s.id}')">New code</button></div>`).join('')
    :`<p class="sm mut">${q.length<2?'Type at least 2 letters or digits.':'No student found.'}</p>`;
}
// keep the Approvals page fresh after any action on it
{const _sd=stoDraw;stoDraw=function(){_sd();apvDraw()}}
{const _ap=approve;approve=async function(id){await _ap(id);apvDraw();navBadges()}}
{const _rj=reject;reject=async function(id){await _rj(id);setTimeout(()=>{apvDraw();navBadges()},600)}}
// fill the approvals badge soon after opening the panel
setTimeout(async()=>{if(!PW)return;if(!(ST||[]).length){const r=await A('students');if(r.ok)ST=r.students}navBadges()},5000);
;(window.__p=window.__p||{})['admin13']=1;
