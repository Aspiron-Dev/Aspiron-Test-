/* ===== v16: 5-tab app — Home · Tests · Store (in-app) · Vault (Mistakes + Saved) · Analytics =====
   Study tracker opens from the Home "Today's focus" card or the header icon. Store is store.html in a frame,
   so buying (UPI, verify) never leaves the app. Graphs moved off Home; all numbers live in Analytics. */
IC.bag='<path d="M6 7h12l1 14H5z"/><path d="M9 7V6a3 3 0 016 0v1"/>';
IC.vault='<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5"/>';
IC.chart2=IC.chart2||'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>';

NAVIT.splice(0,NAVIT.length,['dash','#/','Home','grid'],['series','#/series','Tests','file'],['store','#/store','Store','bag'],['vault','#/m','Vault','vault'],['results','#/r','Analytics','chart2']);
const T5={mk:'vault',bm:'vault',tr:'dash'};
const tab5=h=>h==='#/store'?'store':T5[navTab(h)]||navTab(h);
const rk5=h=>{const t=NAVIT.findIndex(x=>x[0]===tab5(h));return /^#\/(s|f|h)\//.test(h)||h==='#/n'||h==='#/t'?t+0.5:t};

setNav=function(tab){
  if(location.hash==='#/store')tab='store';tab=T5[tab]||tab;
  const bn=$('#bnav');
  if(bn.dataset.v!=='5'){bn.dataset.v='5';bn.innerHTML=NAVIT.map(x=>`<button data-k="${x[0]}" aria-label="${x[2]}" onclick="navGo('${x[1]}')"><span class="bni">${ic(x[3],22)}</span><span class="bnl">${x[2]}</span></button>`).join('')}
  bn.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.k===tab));
  bn.style.setProperty('--i',Math.max(0,NAVIT.findIndex(x=>x[0]===tab)));
  document.body.classList.add('hasnav');
  document.body.classList.toggle('onstore',tab==='store');
};
function navGo(h){
  const cur=location.hash||'#/';
  if(navigator.vibrate)navigator.vibrate(6);
  if(cur===h||(tab5(h)==='vault'&&tab5(cur)==='vault')){
    if(h==='#/store'){try{$('#storehost iframe').contentWindow.scrollTo({top:0,behavior:'smooth'})}catch(e){}}
    else window.scrollTo({top:0,behavior:'smooth'});
    return;
  }
  location.hash=h;
}
tabsHtml=function(tab){
  tab=T5[tab]||tab;
  return `<div class="sec-h hometabs"><div class="seg">${NAVIT.map(x=>`<button class="${tab===x[0]?'on':''}" onclick="location.hash='${x[1]}'">${x[2]}</button>`).join('')}</div></div>`;
};

/* router: same as app1 route(), with the 5-tab order for the slide direction */
route=async function(){
  if(INTEST||!AUTH)return;
  const h0=location.hash||'#/',rk=rk5(h0);let dir=0;
  if(LASTRK!==null&&rk!==LASTRK)dir=rk>LASTRK?1:-1;
  LASTRK=rk;
  ROUTING++;
  try{
    setNav(tab5(h0));
    if(CAT&&Date.now()-CATAT>30000){await loadCat(true);if(!AUTH||INTEST)return}
    let p=null;
    if(dir&&CAT&&document.startViewTransition&&!RMOT()){
      const H=document.documentElement;H.dataset.vt=dir>0?'f':'b';
      try{
        const vt=document.startViewTransition(()=>{p=route0();return Promise.race([p,new Promise(r=>setTimeout(r,40))])});
        vt.finished.then(()=>{delete H.dataset.vt},()=>{delete H.dataset.vt});
        await vt.updateCallbackDone.catch(()=>{});
      }catch(e){delete H.dataset.vt}
    }
    if(!p){if(dir)PGDX=dir;p=route0()}
    await p;
  }finally{ROUTING--}
};
{const _r=route0;route0=async function(){if(location.hash==='#/store')return viewStore();return _r.apply(this,arguments)}}

/* ---------- page heading ---------- */
const pgHead=(t,s)=>`<div class="pgh"><h1 class="pgt">${t}</h1>${s?`<p class="pgs">${s}</p>`:''}</div>`;

/* ---------- header: study tracker quick icon (theme stays in the menu) ---------- */
{const b=$('#bell');if(b&&!$('#trkb'))b.insertAdjacentHTML('beforebegin',`<button class="iconbtn" id="trkb" aria-label="Study tracker" onclick="location.hash='#/t'" style="display:none">${ic('pulse',20)}</button>`)}
const trkbSync=()=>{const t=$('#trkb');if(t)t.style.display=AUTH?'':'none'};
{const _uh=updateHeader;updateHeader=function(){const r=_uh.apply(this,arguments);trkbSync();return r}}
trkbSync();

/* ---------- HOME: action only — countdown, live / up next, today's focus ---------- */
dashPerf=()=>'';
{const _lh=liveHtml;liveHtml=function(){const h=_lh();return h?`<div class="h2s">${ic('play',20)} Live now</div>`+h:upNext()}}
function upNext(){
  const ok=t=>CAT.series.some(s=>s.id===t.series_id&&(s.is_free||s.unlocked));
  const nxt=CAT.tests.filter(t=>!t.locked&&!t.attempts&&!t.in_progress&&!isWait(t)&&!isClosed(t)&&ok(t))[0];
  const up=CAT.tests.filter(t=>isWait(t)&&ok(t)).sort((a,b)=>a.opens_at-b.opens_at)[0];
  const t=nxt||up;
  if(!t)return `<div class="card hero5 none"><div class="h5k"><span class="h5b">ALL CAUGHT UP</span></div><b class="h5t">No test waiting for you</b><div class="h5m">Get a new test series and keep your streak going.</div><button class="btn h5go" onclick="location.hash='#/store'">${ic('bag',16)} Explore store</button></div>`;
  const s=CAT.series.find(x=>x.id===t.series_id)||{};
  return `<div class="card hero5"><div class="h5k"><span class="h5b">${nxt?'UP NEXT':'UPCOMING'}</span><span>${nxt?'Ready to start':'Opens '+esc(fmtWhen(t.opens_at))}</span></div>
   <b class="h5t">${esc(t.title)}</b><div class="h5m">${esc(s.title||'')}${s.title?' · ':''}${t.questions} questions · ${t.duration} min</div>
   ${nxt?`<button class="btn h5go" onclick="openTest('${t.id}')">${ic('play',16)} Start test</button>`:`<button class="btn h5go" onclick="location.hash='#/s/${t.series_id}'">${ic('calendar',16)} View schedule</button>`}</div>`;
}
dashTracker=function(){
  const T=trkLoad(),w=T.weeks[T.cur],s=trkStats(w),P=pstats(CAT.results||[]);
  const st=Math.max(P.streak||0,typeof trkStreak==='function'?trkStreak():0);
  const pend=[];w.subjects.forEach((x,si)=>x.tasks.forEach((k,ti)=>{if(!k.done&&pend.length<3)pend.push({x,k,si,ti})}));
  return `<div id="hstk"><div class="h2s">${ic('target',20)} Today's focus</div>
  <div class="card hstk"><div class="hstkh" onclick="location.hash='#/t'"><div class="hfire"><b>${st}</b><span>🔥 streak</span></div>
    <div class="grow"><b>${s.total?`${s.done} of ${s.total} tasks done`:'Plan your week'}</b><div class="sm mut">${s.total?(s.total-s.done?`${s.total-s.done} left in ${esc(w.label)}`:'Week complete! 🏆'):'Add subjects and daily tasks'}</div>${s.total?`<div class="pbar"><i style="width:${s.pct}%"></i></div>`:''}</div>${ic('right',18)}</div>
   ${pend.length?`<div class="hqt">${pend.map(p=>`<button class="hq" onclick="hqTog(${p.si},${p.ti},this)"><span class="hqc">${ic('check',13)}</span><span class="grow">${esc(p.k.text)}</span><em>${esc(p.x.name)}</em></button>`).join('')}</div>`
    :s.total?'':`<button class="btn soft sm block" style="margin-top:12px" onclick="location.hash='#/t'">＋ Add tasks</button>`}</div></div>`;
};
function hqTog(si,ti,el){
  el.classList.add('dn');
  setTimeout(()=>{trkTog(si,ti);const c=$('#hstk');if(c)c.outerHTML=dashTracker()},380);
}
{const _vh=viewHome;viewHome=function(tab){
  const r=_vh.apply(this,arguments);
  const w=document.querySelector('#app .wrap');
  if(tab==='dash'&&w){
    const d=$('#dlb');if(d){const p=d.previousElementSibling;if(p&&p.classList.contains('h2s'))p.remove();d.remove()}
    if(!w.querySelector('.hgreet')){const hr=new Date().getHours(),nm=(pfName()||'').split(' ')[0];
      w.insertAdjacentHTML('afterbegin',`<div class="hgreet"><span>${hr<12?'Good morning':hr<17?'Good afternoon':'Good evening'}</span><h1>${nm?esc(nm)+' 👋':'Welcome 👋'}</h1></div>`)}
  }
  if(tab==='results'&&w&&!w.querySelector('.pgh'))w.insertAdjacentHTML('afterbegin',pgHead('Analytics','Scores, ranks and every attempt'));
  return r;
}}

/* ---------- TESTS: price badge off the banner, equal-height cards ---------- */
{const _sc=seriesCard;seriesCard=function(s){
  const t=tag(s),h3=`<h3>${esc(s.title)}</h3>`;
  return _sc(s).replace(t,'').replace(h3,`<div class="sc2tt">${h3}${t}</div>`);
}}

/* ---------- STORE: store.html inside the app ---------- */
function stMe(){
  try{
    const m=JSON.parse(localStorage.getItem('store_me')||'null'),nm=(pfName()||AUTH.name||'').trim();
    if(m&&m.mobile===AUTH.mobile&&String(m.name||'').trim().length>=2)return;
    if(nm.length<2||!/^[6-9]\d{9}$/.test(AUTH.mobile||''))return;
    const ex=String(pfGet().exam||'').toLowerCase();
    localStorage.setItem('store_me',JSON.stringify({name:nm,mobile:AUTH.mobile,course:ex==='neet'||ex==='jee'?ex:(m&&m.course)||'neet'}));
  }catch(e){}
}
function stTheme(){try{$('#storehost iframe').contentDocument.documentElement.setAttribute('data-theme',document.documentElement.dataset.theme==='light'?'light':'dark')}catch(e){}}
function stPlace(){const h=$('#storehost'),hd=$('.hdr');if(h&&hd)h.style.top=Math.max(0,Math.round(hd.getBoundingClientRect().bottom))+'px'}
function viewStore(){
  setApp('<div class="wrap"></div>');setNav('store');stMe();
  let h=$('#storehost');
  if(!h){h=document.createElement('div');h.id='storehost';h.innerHTML='<div class="stload"><div class="spin"></div></div>';document.body.insertBefore(h,$('#bnav'))}
  if(!h.querySelector('iframe')){const f=document.createElement('iframe');f.title='Store';f.src='store.html?embed=1';f.onload=()=>{h.classList.add('ready');stTheme()};h.appendChild(f)}
  else stTheme();
  stPlace();
}
addEventListener('resize',stPlace);
{const _so=signOut;signOut=function(){const h=$('#storehost');if(h)h.remove();document.body.classList.remove('onstore');return _so.apply(this,arguments)}}
{const _om=openMenu;openMenu=function(){
  _om.apply(this,arguments);
  const b=[...document.querySelectorAll('#layer .dri')].find(x=>/Test Series/.test(x.textContent));
  if(b&&!$('#dristore'))b.insertAdjacentHTML('afterend',`<button class="dri ${location.hash==='#/store'?'on':''}" id="dristore" onclick="closeModal();location.hash='#/store'">${ic('bag',22)}<span>Store</span></button>`);
}}

/* ---------- VAULT: Mistakes + Saved in one place, compact cards that open on tap ---------- */
function vaultSeg(on){
  const c=(MK&&MK.counts)||(MKC&&MKC.counts),mc=c?c.wrong+c.skipped:null,bc=typeof BVR!=='undefined'&&BVR?BVR.items.length:BM.size;
  return pgHead('Vault','Revise your mistakes and saved questions')+`<div class="vseg" style="--i:${on==='bm'?1:0}"><button class="${on==='mk'?'on':''}" onclick="location.hash='#/m'">${ic('notebook',17)} Mistakes${mc!=null?` <small>${mc}</small>`:''}</button><button class="${on==='bm'?'on':''}" onclick="location.hash='#/b'">${ic('bmark',17)} Saved <small>${bc}</small></button></div>`;
}
function vaultTop(on){const w=document.querySelector('#app .wrap');if(w&&!w.querySelector('.vseg')){w.classList.add('vlt');w.insertAdjacentHTML('afterbegin',vaultSeg(on))}}
{const _m=mkRender;mkRender=function(){const r=_m.apply(this,arguments);vaultTop('mk');return r}}
{const _b=bmRender;bmRender=function(){const r=_b.apply(this,arguments);vaultTop('bm');return r}}
const VX=new Set();
function vxWrap(h,k){return h.replace(/^<div class="card rv/,`<div data-vx="${k}" onclick="vxTap(event,this)" class="${VX.has(k)?'vxo':'vxc'} card rv`).replace('<span style="flex:1"></span>',`<span style="flex:1"></span><span class="vxch">${ic('right',16)}</span>`)}
{const _c=mkCard;mkCard=function(it){return vxWrap(_c(it),'m'+qKey(it))}}
{const _c=bmCard;bmCard=function(q){return vxWrap(_c(q),'b'+qKey(q))}}
function vxTap(e,el){
  if(e.target.closest('button,a,input,textarea,.ro.pick,.qnote,.qi'))return;
  const k=el.dataset.vx;
  if(el.classList.contains('vxc')){VX.add(k);el.classList.remove('vxc');el.classList.add('vxo','vxa')}
  else if(e.target.closest('.qxh,.qsrc,.qt')){VX.delete(k);el.classList.remove('vxo','vxa');el.classList.add('vxc')}
}

;(window.__p=window.__p||{})['app16']=1;
