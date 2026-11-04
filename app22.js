/* app22: Refer & earn (#/refer) — supabase_v52_coupons_refer.sql, cbt_refer_app (signed in).
   The student's link is store.html?r=<first name + last 5 digits>: it always opens the STORE, never the app.
   A new student who buys through it gives the sharer the reward (₹25) in the store wallet. The wallet cannot be
   withdrawn; it is used at checkout on the store. Before v52 is run the page says "coming soon". */
IC.gift='<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 010-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 010 5"/>';
IC.copy='<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/>';
IC.wallet='<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M16 14.5h2"/>';

let RF=null,RFAT=0;
const rfStore=()=>location.href.replace(/[#?].*$/,'').replace(/[^/]*$/,'')+'store.html';
const rfLink=c=>rfStore()+'?r='+encodeURIComponent(c);
const rfText=c=>`${CFG.SITE_NAME||'CBT Test Series'} — NEET / JEE test series with real exam pattern and All-India rank. I use it. Join with my link:\n${rfLink(c)}`;
async function rfLoad(force){
  if(RF&&!force&&Date.now()-RFAT<60000)return RF;
  const r=await rpc('cbt_refer_app',{});
  if(r&&r.ok){RF=r;RFAT=Date.now();return RF}
  if(r&&r.error==='server'&&r.status===404)return {ok:false,error:'missing'};
  if(authErr(r))return null;
  return r||{ok:false,error:'network'};
}
function rfCopy(t,m){
  const done=()=>toast(m||'Copied');
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(done,()=>{rfCopyOld(t);done()});else{rfCopyOld(t);done()}
}
function rfCopyOld(t){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()}
async function rfShare(){
  if(!RF||!RF.code)return;const t=rfText(RF.code);
  if(navigator.share){try{await navigator.share({title:CFG.SITE_NAME||'Test series',text:t});return}catch(e){if(e&&e.name==='AbortError')return}}
  rfCopy(t,'Message copied — paste it in WhatsApp or Telegram');
}
function rfWa(){if(RF&&RF.code){const w=window.open('https://wa.me/?text='+encodeURIComponent(rfText(RF.code)),'_blank','noopener,noreferrer');if(w)w.opener=null}}
async function viewRefer(){
  const back=isV2()?`<div class="crumb"><a href="#/me">${ic('left',16)} Me</a></div>`:`<div class="crumb"><a href="#/">${ic('back',16)} Home</a></div>`;
  if(!RF)setApp(`<div class="wrap rf">${back}<h1 class="ntitle">Refer &amp; earn</h1><div class="card"><div class="sk" style="height:90px"></div></div><div class="card" style="margin-top:14px"><div class="sk" style="height:60px"></div></div></div>`);
  const r=await rfLoad(true);if(location.hash!=='#/refer')return;
  if(!r)return;
  if(!r.ok){setApp(`<div class="wrap rf">${back}<h1 class="ntitle">Refer &amp; earn</h1><div class="card empty">${ic('gift',30)}<h3 style="margin:10px 0 4px">${r.error==='missing'?'Coming soon':'Could not load'}</h3><p class="sm mut">${r.error==='missing'?'Refer &amp; earn will open here soon.':esc(errText(r))}</p>${r.error==='missing'?'':`<button class="btn" onclick="viewRefer()">Try again</button>`}</div></div>`);return}
  const rw='₹'+Number(r.reward||25).toLocaleString('en-IN'),inr=n=>'₹'+Number(n||0).toLocaleString('en-IN'),L=r.list||[];
  setApp(`<div class="wrap rf">${back}
   <div class="card rfh"><span class="rfi">${ic('gift',26)}</span><div style="flex:1;min-width:0"><div class="eyebrow">${r.active===false?'Paused for now':'Refer &amp; earn'}</div><h1>Get ${rw} for every friend who buys</h1><p class="sm mut">Share your link. When a new student opens it and buys any test series on our store, ${rw} comes to your wallet.</p></div></div>
   <div class="card"><div class="eyebrow" style="margin-bottom:8px">Your link · code <b style="text-transform:none;letter-spacing:0">${esc(r.code)}</b></div>
    <div class="rfu"><span>${esc(rfLink(r.code))}</span><button class="btn soft sm" onclick="rfCopy(rfLink(RF.code),'Link copied')">${ic('copy',15)} Copy</button></div>
    <div class="rfb"><button class="btn" onclick="rfShare()">${ic('share',17)} Share link</button><button class="btn ghost" onclick="rfWa()">${ic('wa',17)} WhatsApp</button><button class="btn ghost" onclick="rfCopy(rfText(RF.code),'Message copied')">${ic('copy',17)} Copy message</button></div>
    <p class="sm mut" style="margin:10px 0 0">The link opens our store (not this app), so your friend can see the test series and buy.</p></div>
   <div class="rfk"><div class="card"><span>Friends joined</span><b>${r.joined||0}</b></div><div class="card"><span>Friends bought</span><b style="color:var(--ok)">${r.bought||0}</b></div><div class="card"><span>Total earned</span><b>${inr(r.earned)}</b></div><div class="card"><span>Wallet balance</span><b style="color:var(--pri)">${inr(r.balance)}</b></div></div>
   <div class="card rfw"><span class="rfi sm">${ic('wallet',20)}</span><div style="flex:1;min-width:0"><b>Use your wallet in the store</b><div class="sm mut">At checkout turn on “Use wallet balance”. Wallet money cannot be withdrawn to a bank or UPI.</div></div><a class="btn soft sm" href="store.html">${ic('bag',15)} Store</a></div>
   <div class="card"><div class="eyebrow" style="margin-bottom:6px">Your friends</div>
    ${L.length?L.map(x=>`<div class="rfl"><span class="rfav">${esc(String(x.name||'S')[0].toUpperCase())}</span><div style="flex:1;min-width:0"><b>${esc(x.name||'Student')}</b><div class="sm mut">${esc(x.mobile||'')} · joined ${new Date(x.at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div></div><span class="rfp${x.bought?' on':''}">${x.bought?'Bought · +'+rw:'Not bought yet'}</span></div>`).join('')
      :`<p class="sm mut" style="margin:4px 0 0">Nobody yet. Share your link — friends who join show here.</p>`}</div>
   <div class="card"><div class="eyebrow" style="margin-bottom:8px">How it works</div>
    <ol class="rfo"><li><b>Share your link</b> on WhatsApp, Telegram or anywhere.</li><li><b>A new friend buys</b> any test series on the store. Joining alone gives nothing — the purchase does.</li><li><b>${rw} comes to your wallet</b> after we approve their payment (once per friend).</li><li><b>Use it at checkout</b> for your next test series.</li></ol></div>
  </div>`);
}
/* entry points: the profile sheet, Me (new look) and a small card on Home */
{const _op=openProfile;const add=()=>{
  const box=document.querySelector('#layer .bsheet[data-id="prof"] .box')||document.querySelector('#layer .box');
  if(box&&!box.querySelector('.rfbtn')){const b=box.querySelector('.badges');if(b)b.insertAdjacentHTML('beforebegin',`<button class="btn soft block rfbtn" style="margin-top:10px" onclick="closeModal();location.hash='#/refer'">${ic('gift',17)} Refer &amp; earn ₹25</button>`)}
};openProfile=function(){
  const r=_op.apply(this,arguments);   // app20 makes it async: add the button once it is drawn
  if(r&&typeof r.then==='function')return r.then(v=>{add();return v});
  add();return r;
}}
if(typeof viewMe==='function'){const _vm=viewMe;viewMe=function(){
  _vm.apply(this,arguments);
  const g=document.querySelector('#app .me .lgs .lgp');
  if(g&&typeof lrow==='function')g.insertAdjacentHTML('beforeend',lrow("location.hash='#/refer'",'gift','Refer & earn','Wallet money for every friend who buys'));
}}
function rfHomeCard(){
  if(INTEST||(location.hash&&location.hash!=='#/'&&location.hash!=='#'))return;
  if(LS.get('cbt_rf_hide',0)>Date.now())return;
  const w=document.querySelector('#app>.wrap');if(!w||w.querySelector('.rfhome'))return;
  const tgt=w.querySelector('.card');if(!tgt)return;
  tgt.insertAdjacentHTML('afterend',`<div class="card rfhome" onclick="location.hash='#/refer'" role="button" tabindex="0"><span class="rfi sm">${ic('gift',20)}</span><div style="flex:1;min-width:0"><b>Refer &amp; earn</b><div class="sm mut">Share your link — wallet money for every friend who buys.</div></div><button class="iconbtn" aria-label="Hide" onclick="event.stopPropagation();LS.set('cbt_rf_hide',Date.now()+7*864e5);this.closest('.rfhome').remove()">${ic('x',16)}</button></div>`);
}
{
  const _r0=route0;
  route0=async function(){
    const h=location.hash||'#/';
    if(h==='#/refer'){if(!CAT){skelPage();if(!(await loadCat()))return}return viewRefer()}
    const r=await _r0.apply(this,arguments);
    try{rfHomeCard()}catch(e){}
    return r;
  };
}
{const st=document.createElement('style');st.textContent=`
.rf h1{font-size:21px;line-height:1.25;margin:4px 0 6px}
.rf .card{margin-top:14px}
.rf .crumb+.card,.rf .ntitle+.card{margin-top:0}
.rfh{display:flex;gap:14px;align-items:flex-start;background:linear-gradient(135deg,color-mix(in srgb,var(--pri) 14%,var(--surface)),var(--surface) 70%)}
.rfi{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;flex:none;background:var(--grad);color:#fff;box-shadow:0 6px 16px var(--glow)}
.rfi.sm{width:38px;height:38px;border-radius:12px}
.rfu{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border:1px solid var(--bd);border-radius:12px;background:var(--surface2);min-width:0}
.rfu span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace;font-size:13px}
.rfb{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.rfb .btn{flex:1 1 auto}
.rfk{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.rfk .card{margin-top:14px;padding:14px;display:flex;flex-direction:column;gap:4px}
.rfk span{font-size:12px;color:var(--mut);font-weight:600}.rfk b{font-size:22px}
.rfw,.rfhome{display:flex;align-items:center;gap:12px}
.rfhome{margin:14px 0;cursor:pointer}
.rfl{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--bd)}
.rfl:first-of-type{border-top:0}
.rfav{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--surface2);font-weight:700;flex:none}
.rfp{font-size:12px;font-weight:700;padding:4px 9px;border-radius:99px;background:var(--surface2);color:var(--mut);white-space:nowrap}
.rfp.on{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
.rfo{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.5}
@media (max-width:640px){.rfk{grid-template-columns:repeat(2,minmax(0,1fr))}.rfk .card{margin-top:10px}}
`;document.head.appendChild(st)}

;(window.__p=window.__p||{})['app22']=1;
