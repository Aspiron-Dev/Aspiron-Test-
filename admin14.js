/* ===== Admin layout v2: 4 sections + a centre Create button, an app-style Home, and section tabs =====
   Navigation only — nothing here reads or writes student data on its own. */
AI.cplus='<path d="M12 5v14M5 12h14"/>';
AI.link='<path d="M10 14a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1 1"/><path d="M14 10a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1-1"/>';
const HUBS={
  overview:{label:'Home',icon:'overview',tabs:[['overview','Overview']]},
  students:{label:'Students',icon:'students',tabs:[['students','All students'],['approvals','Approvals'],['live','Live'],['results','Results'],['insights','Insights']]},
  create:{label:'Create',icon:'cplus',tabs:[['create','New test'],['content','Tests & series'],['banners','Banners'],['notices','Announcements'],['pyq','PYQ Bank']]},
  store:{label:'Store',icon:'store',tabs:[['store','Store & orders']]},
  reports:{label:'Reports',icon:'reports',tabs:[['reports','Question reports']]},
};
const hubOf=t=>Object.keys(HUBS).find(h=>HUBS[h].tabs.some(x=>x[0]===t))||'overview';

/* ---------- phone bar: Home · Students · (+) · Store · Reports ---------- */
dockHtml=function(){
  const b=h=>`<button data-hub="${h}" onclick="tab('${HUBS[h].tabs[0][0]}')">${ai(HUBS[h].icon,22)}<span>${HUBS[h].label}</span><em class="nb" id="hb_${h}"></em></button>`;
  return b('overview')+b('students')+`<button class="dfab" data-hub="create" onclick="createSheet()" aria-label="Create"><i>${ai('cplus',26)}</i><span>Create</span></button>`+b('store')+b('reports');
};
/* ---------- computer sidebar: same sections, with their pages under each ---------- */
MGROUPS.length=0;
for(const h of ['students','create','store','reports'])MGROUPS.push([HUBS[h].label,HUBS[h].tabs]);
MKNOWN.clear();MGROUPS.forEach(g=>g[1].forEach(x=>MKNOWN.add(x[0])));

/* ---------- section tabs (pills) under the header ---------- */
function hubBar(t){
  const root=$('#root');if(!root||!document.body.classList.contains('admx')){const o=$('#hubbar');if(o)o.remove();return}
  let bar=$('#hubbar');
  if(!bar){bar=document.createElement('div');bar.id='hubbar';root.prepend(bar)}
  const h=HUBS[hubOf(t)];
  if(!h||h.tabs.length<2){bar.innerHTML='';bar.style.display='none';return}
  bar.style.display='';
  bar.innerHTML=`<div class="hbin" role="tablist">${h.tabs.map(([k,l])=>`<button role="tab" class="hbt ${k===t?'on':''}" aria-selected="${k===t}" onclick="tab('${k}')">${ai(k,15)}<span>${l}</span><em class="nb" data-hbb="${k}"></em></button>`).join('')}</div>`;
  hubBadges();
  const on=bar.querySelector('.hbt.on');if(on)on.scrollIntoView({block:'nearest',inline:'center'});
}
{const _na=navActive;navActive=function(t){
  _na(t);const h=hubOf(t);
  document.querySelectorAll('#adock [data-hub]').forEach(b=>b.classList.toggle('on',b.dataset.hub===h));
  const pt=document.getElementById('ptitle');if(pt)pt.textContent=(TTL[t]||'');
  hubBar(t);
}}

/* ---------- badges ---------- */
function hubCounts(){
  const a=apvCount();
  return{students:a.req,approvals:a.total,store:badgeOf('store')||0,reports:badgeOf('reports')||0,live:badgeOf('live')||0};
}
function hubBadges(){
  const c=hubCounts(),set=(el,k)=>{if(!el)return;const n=c[k]||0;el.textContent=n?(n>99?'99+':n):'';el.classList.toggle('on',!!n);el.classList.toggle('live',k==='live')};
  set(document.getElementById('hb_students'),'approvals');set(document.getElementById('hb_store'),'store');set(document.getElementById('hb_reports'),'reports');
  document.querySelectorAll('[data-hbb]').forEach(e=>set(e,e.dataset.hbb));
  document.querySelectorAll('[data-appb]').forEach(e=>set(e,e.dataset.appb));
  // badge numbers can widen pills after drawing: bring a cut-off active pill back into view
  const on=document.querySelector('#hubbar .hbt.on'),bx=on&&on.parentElement;
  if(on){const l=on.offsetLeft-bx.offsetLeft;if(l<bx.scrollLeft||l+on.offsetWidth>bx.scrollLeft+bx.clientWidth)bx.scrollLeft=l-(bx.clientWidth-on.offsetWidth)/2}
}
{const _nb=navBadges;navBadges=function(){_nb();try{hubBadges()}catch(e){}}}

/* ---------- Create sheet (centre + button) ---------- */
const CRE=[
  ['create','New test','Upload a paper and build the questions',"tab('create')"],
  ['content','Tests & series','Edit, schedule and organise tests',"tab('content')"],
  ['banners','Home banner','Slides on the student home screen',"tab('banners').then(()=>{if(typeof bnModal==='function')bnModal()})"],
  ['notices','Announcement','A notice students see under the bell',"tab('notices').then(()=>{if(typeof annModal==='function')annModal()})"],
  ['store','Store test series','Add a paid series to the store',"creStore()"],
  ['pyq','PYQ paper','Add a past paper to PYQ Analysis',"tab('pyq')"],
  ['plus','Student + access code','Create an account and get the code',"addModal()"],
];
function createSheet(){
  modal(`<div class="mhead"><h2>Create</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">${ai('x',18)}</button></div>
   <div class="cregrid">${CRE.map(([k,t,d,f])=>`<button class="creit" onclick="closeModal();${f}"><span class="creic">${ai(k,22)}</span><span class="cretx"><b>${t}</b><small>${d}</small></span></button>`).join('')}</div>`);
  const b=document.querySelector('#layer .modal');if(b)b.classList.add('asheet');
}
async function creStore(){await tab('store');if(!CA.series.length)await loadCatalog();if(CUR==='store'&&document.querySelector('#stobody .sstats')&&typeof stoEdit==='function')stoEdit(-1)}

/* ---------- Home: every feature as an app icon, then the overview ---------- */
const APPS=[
  ['Students','c-stu',[['students','All students',"tab('students')"],['approvals','Approvals',"tab('approvals')"],['live','Live',"tab('live')"],['results','Results',"tab('results')"],['insights','Insights',"tab('insights')"],['plus','Add student',"addModal()"],['key','New code',"apvCodeFor()"],['dl','Export CSV',"exportStudents()"]]],
  ['Create','c-cre',[['create','New test',"tab('create')"],['content','Tests & series',"tab('content')"],['banners','Banners',"tab('banners')"],['notices','Announce',"tab('notices')"],['pyq','PYQ Bank',"tab('pyq')"],['store','Store item',"creStore()"]]],
  ['Store','c-sto',[['store','Store & orders',"tab('store')"],['site','Store page',"window.open('store.html','_blank','noopener')"],['link','Copy store link',"copyText(new URL('store.html',location.href).href)"]]],
  ['Reports & app','c-app',[['reports','Reports',"tab('reports')"],['search','Search',"openFind()"],['gear','Settings',"settings()"],['site','Student site',"window.open('index.html','_blank','noopener')"],['install','Install app',"installAdmin()",'data-ainst'],['out','Sign out',"signOutAdmin()"]]],
];
function appsHtml(){
  return `<div class="appsec">${APPS.map(([g,c,L])=>`<div class="appgrp ${c}"><div class="appgt">${g}</div><div class="apps">${L.map(([k,l,f,x])=>`<button class="app" ${x||''} onclick="${f}"><span class="appic">${ai(k,22)}${/^tab\('/.test(f)?`<em class="nb" data-appb="${k}"></em>`:''}</span><span class="appl">${l}</span></button>`).join('')}</div></div>`).join('')}</div>`;
}
{const _lo=loadOverview;loadOverview=async function(){
  await _lo();
  const el=$('#pn_overview');if(!el||el.querySelector('.appsec'))return;
  const hero=el.querySelector('.ovhero');
  if(hero)hero.insertAdjacentHTML('afterend',appsHtml());else el.insertAdjacentHTML('afterbegin',appsHtml());
  try{admInstUi()}catch(e){}
  hubBadges();
}}
// "More" now just opens Home, where every feature is
openMore=function(){tab('overview')};

// keep the section tabs right under the header
function hdrH(){const h=document.querySelector('.hdr');if(h&&h.offsetHeight)document.documentElement.style.setProperty('--hdrh',h.offsetHeight+'px')}
addEventListener('resize',hdrH);
/* ---------- apply now (the shell may already be on screen) ---------- */
{const d=document.getElementById('adock');if(d){d.innerHTML=dockHtml()}}
{const s=document.querySelector('.snav');if(s){const t=document.createElement('div');t.innerHTML=navHtml();const n=t.querySelector('.snav');if(n)s.replaceWith(n)}}
setTimeout(()=>{if(!document.body.classList.contains('admx'))return;try{hdrH();navActive(CUR);hubBadges();if(CUR==='overview'&&$('#pn_overview')&&!$('#pn_overview .appsec')&&$('#pn_overview .ovhero'))$('#pn_overview .ovhero').insertAdjacentHTML('afterend',appsHtml())}catch(e){}},50);
;(window.__p=window.__p||{})['admin14']=1;
