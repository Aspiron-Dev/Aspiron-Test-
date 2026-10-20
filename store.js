/* Store page: lists the paid test series (managed in the admin panel → Store), each with its Explore page
   (description, schedule, demo tests, reviews). The student gives name + mobile once
   on the welcome screen, then: Buy now → pay with UPI → payment details → verify on Telegram / WhatsApp (message + screenshot).
   Prices, UPI ID and Telegram come only from the database. */
// never run inside someone else's page (stops look-alike sites from framing the real store)
if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location.replace(window.self.location.href)}catch(e){}}
const CFG=window.CBT_CONFIG||{},API=(CFG.SUPABASE_URL||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLORS=['blue','green','purple','orange','red','dark'];
const SHARE='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"/></svg>';
const inr=n=>'₹'+Number(n||0).toLocaleString('en-IN');
let ST={settings:{},items:[]},ORD=null,IT=null;
const LSg=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(_){return d}};
const LSs=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
const LSd=k=>{try{localStorage.removeItem(k)}catch(_){}};

async function rpc(fn,args){
  try{
    const r=await fetch(API+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args||{})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    return await r.json();
  }catch(e){return{ok:false,error:'network'}}
}
function toast(t){const o=$('.toast');if(o)o.remove();const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}
async function copy(t,what){
  try{await navigator.clipboard.writeText(t)}catch(_){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()}
  toast((what||'Copied')+' ✓');
}
// the one support account from config.js (falls back to the store's Telegram setting)
const tgUser=()=>String((CFG.SUPPORT_URL||'').replace(/^.*t\.me\//,'').replace(/[/?#].*$/,'')||ST.settings.telegram||'').replace(/^@/,'');

/* ---------- light / dark theme (first choice comes from the phone; store-theme.js applies a saved one early) ---------- */
function themeMeta(){
  const t=document.documentElement.dataset.theme;if(!t)return;
  document.querySelectorAll('meta[name=theme-color]').forEach(m=>{m.removeAttribute('media');m.content=t==='dark'?'#060c18':'#f4f7fb'});
}
function themeToggle(){
  const d=document.documentElement,dark=d.dataset.theme?d.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches,t=dark?'light':'dark';
  d.dataset.theme=t;try{localStorage.setItem('store_theme',t)}catch(_){}
  themeMeta();
}

/* ---------- the student: name + mobile, asked once on the welcome screen, used for every order ---------- */
let MEM=null;   // if the phone does not allow saving, keep the details for this visit
const meOk=m=>!!m&&String(m.name||'').trim().length>=2&&/^[6-9]\d{9}$/.test(m.mobile||'');
const ME=()=>{const m=LSg('store_me',null);return meOk(m)?m:meOk(MEM)?MEM:null};
const meCheck=(n,m)=>n.length<2?'Please enter your name.':!/^[6-9]\d{9}$/.test(m)?'Please enter a valid 10-digit mobile number.':'';
const meRead=(ni,mi)=>[$(ni).value.trim().replace(/\s+/g,' ').slice(0,60),$(mi).value.replace(/\D/g,'').slice(-10)];
function meSave(n,m){
  const old=ME();if(!old||old.mobile!==m)LSd('store_ord');   // a new number never continues the old number's order
  MEM={name:n,mobile:m};LSs('store_me',MEM);
  document.documentElement.classList.add('has-me');meChip();
}
function meChip(){const m=ME();if(!m)return;$('#mename').textContent=m.name.split(' ')[0];$('#meini').textContent=m.name[0].toUpperCase()}
function gateGo(){
  const [n,m]=meRead('#gn','#gm'),bad=meCheck(n,m);
  if(bad)return $('#ger').textContent=bad;
  $('#ger').textContent='';const g=$('#gate');g.classList.add('out');
  setTimeout(()=>{meSave(n,m);g.classList.remove('out');jump()},300);
}
let AFTER=null;
// edit name / mobile later (header chip, or "change" on the payment step)
function meSheet(then){
  const m=ME()||{};AFTER=then||null;
  ovEl().innerHTML=`<div class="sheet" role="dialog" aria-modal="true"><div class="shd"><div class="grow"><b>Your details</b><span class="sm mut">Your series is unlocked on this mobile number.</span></div><button class="x" data-close aria-label="Close">✕</button></div>
   <label for="sn">Full name</label><div class="fld"><span>👤</span><input id="sn" autocomplete="name" maxlength="60" value="${esc(m.name||'')}" placeholder="e.g. Rahul Sharma"></div>
   <label for="sm">Mobile number</label><div class="fld"><span>📱</span><input id="sm" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" value="${esc(m.mobile||'')}" placeholder="10-digit mobile number"></div>
   <div class="err" id="er"></div><button class="btn block" id="go" data-mesave>${then?'Save &amp; continue →':'Save'}</button></div>`;
}
function meSaveGo(){
  const [n,m]=meRead('#sn','#sm'),bad=meCheck(n,m);
  if(bad)return $('#er').textContent=bad;
  meSave(n,m);const a=AFTER;AFTER=null;
  if(a)a();else{closeSheet();toast('Details saved')}
}

async function load(){
  const nm=CFG.SITE_NAME||'CBT Test Series';$('#sname').textContent=nm;$('#fname').textContent=nm;
  const r=await rpc('cbt_store');
  if(!r.ok){$('#list').innerHTML=`<div class="card empty"><b>${r.error==='network'?'No internet':'Store is opening soon'}</b><p class="sm">${r.error==='network'?'Check your connection and refresh.':'Please check back in a little while.'}</p></div>`;return}
  ST=r;const tg=tgUser();
  // Help button + footer link open the WhatsApp / Telegram chooser
  if(!tg&&!waUrl(''))$('#fab').remove();
  if(ST.settings.payee)$('#spayee').textContent=ST.settings.payee;
  const L=ST.items||[];
  if(!L.length){$('#list').innerHTML=`<div class="card empty"><b>New test series coming soon</b><p class="sm">Please check back in a little while.</p></div>`;return}
  $('#lcount').textContent=`${L.length} test series · pay with any UPI app`;
  $('#list').innerHTML=L.map(cardHtml).join('');
  loadSch();loadRv();loadXp();
  if(ME())jump();
}
// a shared link (#p=…) scrolls to that series; an Explore link (#x=…) opens its page
function jump(){
  const x=location.hash.match(/x=([0-9a-f-]{36})/);if(x&&ST.items.some(i=>i.id===x[1]))return explore(x[1]);
  const h=location.hash.match(/p=([0-9a-f-]{36})/);
  if(h){const c=document.getElementById('p_'+h[1]);if(c){c.classList.add('hl');setTimeout(()=>c.scrollIntoView({behavior:'smooth',block:'center'}),200)}}
}
const okImg=u=>/^(data:image\/|https:\/\/)/.test(u||'');
const offPct=x=>x.mrp&&x.mrp>x.price?Math.round((1-x.price/x.mrp)*100):0;
function mediaHtml(x,tag){
  const col=COLORS.includes(x.color)?x.color:'blue';
  return okImg(x.image)?`<img src="${esc(x.image)}" alt="${esc(x.title)}" loading="lazy">`
    :`<div class="ph c-${col}"><small>${esc((CFG.SITE_NAME||'TEST SERIES').toUpperCase())}</small><b>${esc(x.title)}</b></div>`;
}
function priceHtml(x){
  const off=offPct(x);return `<div class="price"><b>${inr(x.price)}</b>${off?`<s>${inr(x.mrp)}</s><span class="save">Save ${inr(x.mrp-x.price)} · ${off}% off</span>`:''}</div>`;
}
// a card: photo, name, short description, rating, price, then Explore and Buy now (everything else is on the Explore page)
function cardHtml(x,i){
  const off=offPct(x),ph=!okImg(x.image);
  return `<div class="card" id="p_${esc(x.id)}" style="--i:${Math.min(i||0,6)}"><div class="media${ph?' isph':''}" data-view="${esc(x.id)}">${x.badge?`<span class="badge">${esc(x.badge)}</span>`:''}${off?`<span class="off">${off}% OFF</span>`:''}${mediaHtml(x)}</div>
   <div class="cbody"><h3${ph?' class="sr"':''}>${esc(x.title)}</h3>${x.subtitle?`<p class="sub">${esc(x.subtitle)}</p>`:''}
   <div data-rvmini="${esc(x.id)}">${rvMini(x.id)}</div>
   ${priceHtml(x)}
   <div class="cact"><button class="btn xbtn block" data-explore="${esc(x.id)}">🔍 Explore test series</button>
    <button class="btn block" data-buy="${esc(x.id)}">Buy now · ${inr(x.price)}</button></div></div></div>`;
}
// the one overlay that holds every sheet (checkout, schedule, demo test, help)
function ovEl(){
  let ov=$('.ov');
  if(!ov){ov=document.createElement('div');ov.className='ov';ov.addEventListener('click',e=>{if(e.target===ov)closeSheet()});document.body.appendChild(ov);document.body.style.overflow='hidden'}
  return ov;
}
// from the Explore page the link opens that page (#x=…); from a card it shows the card (#p=…)
async function share(id,xp){
  const x=ST.items.find(i=>i.id===id);if(!x)return;
  const url=location.href.split('#')[0]+(xp?'#x=':'#p=')+id,text=`${x.title} — ${inr(x.price)}. See details and buy here:`;
  if(navigator.share){try{await navigator.share({title:x.title,text,url});return}catch(e){if(e&&e.name==='AbortError')return}}
  copy(text+' '+url,'Link copied');
}

/* ---------- Explore test series: its own page with Description · Resources · Reviews ----------
   Description and demo tests come from supabase_v30_store_explore.sql; without it the page still opens (photo,
   features, schedule, reviews) and the demo tests show "Coming soon". The phone's Back button closes the page. */
let XP=null,XD={},XH=false;
async function loadXp(){
  const r=await rpc('cbt_store_explore');if(!r.ok)return;
  XD={};(r.items||[]).forEach(x=>XD[x.id]=x);
  if(XP)xpDraw();
}
const XTABS=[['d','Description'],['r','Resources'],['v','Reviews']];
function explore(id,tab){
  const x=ST.items.find(i=>i.id===id);if(!x)return;
  closeSheet();IT=x;
  if(XP&&XP.id===id){XP.tab=tab||XP.tab;return xpDraw(true)}
  XP={id,tab:tab||'d'};
  let p=$('#xp');if(!p){p=document.createElement('div');p.id='xp';p.className='xp';p.setAttribute('role','dialog');p.setAttribute('aria-modal','true');document.body.appendChild(p)}
  p.setAttribute('aria-label',x.title);
  p.innerHTML=`<div class="xtop"><div class="xph"><button class="x" data-xback aria-label="Back">←</button><b>${esc(x.title)}</b><button class="x" data-share="${esc(id)}" aria-label="Share" title="Share">${SHARE}</button></div>
    <div class="xtabs" role="tablist">${XTABS.map(([k,l])=>`<button role="tab" data-xtab="${k}">${l}</button>`).join('')}</div></div>
   <div class="xbody" id="xbody"></div>
   <div class="xbar"><button class="btn block" data-buy="${esc(id)}">Buy now · ${inr(x.price)}</button></div>`;
  document.body.style.overflow='hidden';
  if(!/[#&]x=/.test(location.hash)){history.pushState({xp:1},'','#x='+id);XH=true}
  xpDraw(true);
}
function xpDraw(top){
  const b=$('#xbody');if(!b||!XP)return;const x=ST.items.find(i=>i.id===XP.id);if(!x)return xpClose();
  const n=(RV[x.id]||{}).count||0;
  document.querySelectorAll('[data-xtab]').forEach(t=>{const k=t.dataset.xtab,on=k===XP.tab;t.classList.toggle('on',on);t.setAttribute('aria-selected',on);if(k==='v')t.textContent=n?`Reviews · ${n}`:'Reviews'});
  b.innerHTML=XP.tab==='r'?xpRes(x):XP.tab==='v'?xpRv(x):xpDesc(x);
  if(top){const p=$('#xp');if(p)p.scrollTop=0}
}
function xpClose(){const p=$('#xp');if(p)p.remove();XP=null;if(!$('.ov'))document.body.style.overflow=''}
function xpBack(){if(XH)history.back();else{xpClose();history.replaceState(null,'',location.pathname+location.search)}}
addEventListener('popstate',()=>{if($('#xp')&&!/[#&]x=/.test(location.hash)){XH=false;closeSheet();xpClose()}});
// Description: the series photo, then everything about it
function xpDesc(x){
  const d=String((XD[x.id]||{}).description||'').trim(),F=x.features||[];
  return `<div class="ximg${okImg(x.image)?'':' isph'}">${mediaHtml(x)}</div>
   <h2 class="xt">${esc(x.title)}</h2>${x.subtitle?`<p class="xsub">${esc(x.subtitle)}</p>`:''}
   <div data-rvmini="${esc(x.id)}">${rvMini(x.id)}</div>
   <div class="xprice">${priceHtml(x)}</div>
   ${d?`<div class="xdesc">${esc(d)}</div>`:''}
   ${F.length?`<h4 class="xh">What you get</h4><ul class="f">${F.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}`;
}
// Resources: the schedule and demo test 1 / 2 (an empty one shows "Coming soon")
const fkind=m=>m==='application/pdf'?'PDF':'Photo';
function xpRes(x){
  const f=SCH[x.id],D=(XD[x.id]||{}).demos||[];
  const row=(ico,lab,t,sub,btn,empty)=>`<div class="xres${empty?' empty':''}"><i>${ico}</i><div class="grow"><small class="lab">${lab}</small><b>${t}</b>${sub?`<small>${sub}</small>`:''}</div>${btn}</div>`;
  return `<h4 class="xh">Schedule</h4>
   ${f?row('📅','Schedule',esc(f.name||'Schedule'),`${fkind(f.mime)} · ${fsize(f.size)}`,`<button class="btn" data-sch="${esc(x.id)}">Open</button>`):row('📅','Schedule','Coming soon','','',1)}
   <h4 class="xh">Demo tests</h4>
   ${[1,2].map(n=>{const d=D.find(z=>z.slot===n)||{};
     return d.size>0?row('📂',`Demo Test ${n}`,esc(d.title||`Demo Test ${n}`),`${fkind(d.mime)} · ${fsize(d.size)}`,`<button class="btn" data-demo="${esc(x.id)}" data-slot="${n}">Open</button>`)
       :row('📁',`Demo Test ${n}`,d.title?esc(d.title):'Coming soon',d.title?'Coming soon':'','',1)}).join('')}`;
}
// Reviews: every review of this series
function xpRv(x){
  if(!RVDONE)return '<div class="sk" style="height:220px"></div>';
  const r=RV[x.id];
  if(!r||!r.count)return `<div class="xempty"><span>⭐</span><b>No reviews yet</b><p class="sm mut">Reviews are written by students whose series is unlocked.</p></div>`;
  const L=(r.list||[]).slice().sort(rvSort);
  return `${rvSum(r.avg,r.count,r.stars||[])}${RVNOTE}<div class="rvlist">${L.map(v=>rvItem(v)).join('')}</div>
   ${r.count>L.length?`<p class="sm mut" style="text-align:center;margin:10px 0">Showing ${L.length} of ${r.count} reviews.</p>`:''}`;
}

/* ---------- checkout: pay → payment details → verify on Telegram / WhatsApp (3 steps; name + mobile are already known) ---------- */
const STEPS=['Pay','Payment details','Verify'];
function sheet(step,body){
  ovEl().innerHTML=`<div class="sheet" role="dialog" aria-modal="true"><div class="shd"><div class="grow"><b>${esc(IT.title)}</b><span class="sm mut">Step ${step} of 3 · ${STEPS[step-1]}</span></div><button class="x" data-close aria-label="Close">✕</button></div>
   <div class="steps">${[1,2,3].map(i=>`<i class="${i<step?'on':i===step?'on now':''}"></i>`).join('')}</div>${body}</div>`;
}
function closeSheet(){closeEdit();const o=$('.ov');if(o)o.remove();document.body.style.overflow=$('#xp')?'hidden':''}
let BUYN=0;
async function buy(id){
  IT=ST.items.find(i=>i.id===id);if(!IT)return;
  const me=ME();if(!me)return meSheet(()=>buy(id));
  const last=LSg('store_ord',null);
  // same series + same number ordered in the last 24 h → continue that order instead of making a new code
  if(last&&last.item===id&&last.mobile===me.mobile&&Date.now()-last.at<864e5){ORD=last;return payStep()}
  const n=++BUYN;
  sheet(1,`<div class="ld"><span class="spin"></span><span>Getting your payment details…</span></div>`);
  const r=await rpc('cbt_store_order',{p_item:IT.id,p_name:me.name,p_mobile:me.mobile});
  if(n!==BUYN||!$('.ov'))return;   // closed or another series tapped meanwhile
  if(!r.ok){
    const t=r.error==='busy'?'Too many tries. Please wait a while and try again.':r.error==='network'?'No internet. Please try again.':r.error==='item'?'This series is not available right now.':r.error==='mobile'||r.error==='name'?'Please check your name and mobile number.':'Something went wrong. Please try again.';
    return sheet(1,`<div class="bigok">⚠️</div><p style="text-align:center">${t}</p><button class="btn block" style="margin-top:14px" data-buy="${esc(id)}">Try again</button>
     <p class="sm mut" style="text-align:center;margin-top:12px">For ${esc(me.name)} · ${esc(me.mobile)} · <a href="#" data-redo style="color:var(--pri)">change</a></p>`);
  }
  ORD={item:IT.id,code:r.code,amount:r.amount,title:r.title,name:me.name,mobile:me.mobile,at:Date.now()};LSs('store_ord',ORD);
  payStep();
}
const upiLink=()=>{const s=ST.settings,e=encodeURIComponent;return `upi://pay?pa=${s.upi}&pn=${e(s.payee||'')}&am=${ORD.amount}&cu=INR&tn=${e(ORD.code)}`};
const qrMake=t=>{const q=qrcode(0,'M');q.addData(t);q.make();return q};
const upiOk=()=>/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(ST.settings.upi||'')&&!/[<>"`]/.test(ST.settings.payee||'');
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isMob=()=>/android/i.test(navigator.userAgent)||isIOS();
/* step 1: QR, UPI ID and order code; at the bottom "Pay with UPI" (opens the phone's UPI app) and "I have already paid" */
function payStep(){
  if(!upiOk())return sheet(1,`<div class="bigok">⚠️</div><h3 style="text-align:center">Payment is paused</h3><p class="sm mut" style="text-align:center">Please message support. Do not pay anywhere else.</p><a class="btn tg block" style="margin-top:12px" target="_blank" rel="noopener" href="${esc(tgLink(''))}">💬 Message support</a>`);
  const s=ST.settings,mob=isMob();
  sheet(1,`<div class="amt"><span class="sm mut">Amount to pay</span><br><b>${inr(ORD.amount)}</b></div>
   <div class="qr"><img src="${qrMake(upiLink()).createDataURL(8,2)}" alt="UPI QR code"></div>
   <p class="sm mut" style="text-align:center;margin-top:8px">Scan with GPay, PhonePe, Paytm or any UPI app</p>
   <div class="verify"><span>⚠️</span><span>Before paying, check that the name shown in your UPI app is <b>${esc(s.payee)}</b>. Pay only to the UPI ID below.</span></div>
   <div class="kv"><div><span>UPI ID</span><b>${esc(s.upi)}</b><button class="cp" data-copy="${esc(s.upi)}" data-what="UPI ID copied">Copy</button></div>
    <div><span>Amount</span><b>${inr(ORD.amount)}</b><button class="cp" data-copy="${ORD.amount}" data-what="Amount copied">Copy</button></div>
    <div><span>Order code</span><b class="code">${esc(ORD.code)}</b><button class="cp" data-copy="${esc(ORD.code)}" data-what="Code copied">Copy</button></div></div>
   <p class="sm mut">If you pay with the UPI ID, write the order code <b class="code">${esc(ORD.code)}</b> in the payment note.</p>
   ${s.note?`<p class="sm mut" style="margin-top:10px">${esc(s.note)}</p>`:''}
   <p class="sm mut" style="text-align:center;margin-top:12px">For ${esc(ORD.name)} · ${esc(ORD.mobile)} · <a href="#" data-redo style="color:var(--pri)">change</a></p>
   <div class="sbuy paybar">${mob?`<button class="btn block big two" data-saveqr><span class="bl"><b>⬇ Save QR to pay</b><small>Then: UPI app → Scan → Gallery → this QR</small></span></button>`:''}
    <button class="btn block${mob?' line':''}" data-step="paid">✔ I have already paid →</button></div>`);
}
/* "Save QR to pay": the QR as a picture in the gallery. UPI apps pay a QR chosen from the gallery like a scanned one,
   while a pay link from a website to a personal UPI ID is often blocked (Google Pay: "exceeded the bank limit"). */
async function saveQr(){
  const q=qrMake(upiLink()),n=q.getModuleCount(),W=720,cell=Math.floor(560/(n+8)),qs=cell*(n+8),x0=(W-qs)/2,y0=96,c=document.createElement('canvas');
  c.width=W;c.height=y0+qs+170;
  const g=c.getContext('2d'),F='Inter,system-ui,sans-serif';
  g.fillStyle='#fff';g.fillRect(0,0,W,c.height);g.textAlign='center';g.fillStyle='#0b1726';
  g.font='800 40px '+F;g.fillText('Scan & pay '+inr(ORD.amount),W/2,64);
  for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))g.fillRect(x0+(k+4)*cell,y0+(r+4)*cell,cell,cell);
  g.font='700 30px '+F;g.fillText(ST.settings.payee||'',W/2,y0+qs+40);
  g.font='500 26px '+F;g.fillStyle='#475569';g.fillText('UPI ID: '+ST.settings.upi,W/2,y0+qs+86);g.fillText('Order code: '+ORD.code,W/2,y0+qs+128);
  const blob=await new Promise(ok=>c.toBlob(ok,'image/png'));if(!blob)return toast('Could not save. Long-press the QR and save it.');
  const name='Pay-'+ORD.code+'.png',file=new File([blob],name,{type:'image/png'});
  let saved=false;
  // iPhone: the share sheet has "Save Image" (to Photos); a download would go to Files instead
  if(isIOS()&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file]});saved=true}catch(e){if(e&&e.name==='AbortError')return}
  }
  if(!saved){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}
  toast('QR saved ✓ Open your UPI app → Scan → Gallery');
  setTimeout(()=>{const b=$('[data-step=paid]');if(b)b.classList.add('nudge')},800);
}
// message for the support chat (Telegram / WhatsApp); the student sends the payment screenshot with it
function tgText(){return `Payment done ✅\nOrder code: ${ORD.code}\nSeries: ${ORD.title}\nAmount: ${inr(ORD.amount)}\nStudent name: ${ORD.name}\nMobile: ${ORD.mobile}\nPaid from account of: ${ORD.payer||'-'}\nUTR / Transaction ID: ${ORD.utr||'-'}\n📎 Payment screenshot attached`}
/* step 2: who paid (account holder name) + UTR, saved with the order */
function paidStep(){
  sheet(2,`<div class="bigok">🧾</div><h3 style="text-align:center;margin-bottom:6px">Payment details</h3>
   <p class="sm mut" style="text-align:center">This helps us find your payment quickly.</p>
   <label for="py">Name on the account you paid from <span style="color:var(--bad)">*</span></label>
   <input id="py" maxlength="60" autocomplete="off" value="${esc(ORD.payer||'')}" placeholder="As shown in your UPI app, e.g. Ramesh Kumar">
   <p class="sm mut" style="margin-top:6px">If a parent or friend paid, write their name.</p>
   <label for="pu">UTR / Transaction ID <span class="mut">(recommended)</span></label>
   <input id="pu" maxlength="30" inputmode="text" autocomplete="off" value="${esc(ORD.utr||'')}" placeholder="12-digit number in your UPI app" style="font-family:ui-monospace,Menlo,monospace;letter-spacing:1px">
   <details class="hint"><summary>Where do I find the UTR?</summary><p>Open your UPI app → payment history → tap this payment. Look for <b>UTR</b>, <b>UPI Ref No.</b> or <b>Transaction ID</b> (usually 12 digits).</p></details>
   <div class="err" id="er"></div>
   <button class="btn block" id="pgo" data-paidgo>Save &amp; continue →</button>
   <button class="btn soft block" style="margin-top:10px" data-step="back1">← Back to payment</button>`);
}
async function paidGo(){
  const py=$('#py').value.trim(),pu=$('#pu').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase(),er=$('#er');
  if(py.length<2)return er.textContent='Please write the name on the account you paid from.';
  if(pu&&pu.length<6)return er.textContent='This UTR looks too short. Check it, or leave it empty.';
  const b=$('#pgo');b.disabled=true;b.textContent='Saving…';er.textContent='';
  const r=await rpc('cbt_store_paid',{p_code:ORD.code,p_mobile:ORD.mobile,p_payer:py,p_utr:pu});
  b.disabled=false;b.textContent='Save & continue →';
  // if the server is not updated yet, the details still go in the chat message
  if(!r.ok&&r.error!=='missing'&&r.error!=='server'){
    if(r.error==='network')return er.textContent='No internet. Please try again.';
    if(r.error==='order'){LSd('store_ord');return er.textContent='This order was not found. Please close and tap Buy again.'}
  }
  ORD.payer=py;ORD.utr=pu;LSs('store_ord',ORD);vStep();
}
const tgLink=txt=>'https://t.me/'+encodeURIComponent(tgUser())+(txt?'?text='+encodeURIComponent(txt):'');
// WhatsApp support from config.js. With the number (SUPPORT_WA_NUMBER) the message is already written in the chat,
// like Telegram; a wa.me/message link can't take a message, so then it is only copied.
const waNum=(()=>{let n=String(CFG.SUPPORT_WA_NUMBER||'').replace(/\D/g,'');if(n.length===10)n='91'+n;return n.length>=11&&n.length<=15?n:''})();
const waUrl=txt=>{const v=String(CFG.SUPPORT_WA||'').trim(),n=waNum||(/^https:\/\//.test(v)?'':v.replace(/\D/g,''));
  return n.length>=10?'https://wa.me/'+n+(txt?'?text='+encodeURIComponent(txt):''):/^https:\/\//.test(v)?v:''};
/* ---------- Help: choose WhatsApp or Telegram (chat only) ---------- */
function helpSheet(){
  const wa=waUrl(''),tg=tgUser()?tgLink(''):'';
  ovEl().innerHTML=`<div class="sheet" role="dialog" aria-modal="true"><div class="shd"><div class="grow"><b>Chat with support</b><span class="sm mut">Questions about a series, payment or login</span></div><button class="x" data-close aria-label="Close">✕</button></div>
   <div class="supgrid">${wa?`<a class="supb wa" href="${esc(wa)}" target="_blank" rel="noopener"><span class="supi">💬</span><span><b>WhatsApp</b><small>Chat with support</small></span></a>`:''}
    ${tg?`<a class="supb tg" href="${esc(tg)}" target="_blank" rel="noopener"><span class="supi">✈️</span><span><b>Telegram</b><small>Chat with support</small></span></a>`:''}</div>
   <p class="sm mut" style="text-align:center;margin-top:12px">Chat only — calls are not available.${ORD&&ORD.code?` Your order code: <b class="code">${esc(ORD.code)}</b>`:''}</p></div>`;
}
/* step 3 (last): summary of what goes in the chat message (editable), then verify on Telegram / WhatsApp */
const TGI='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>';
const WAI='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
const PEN='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
function vStep(){
  const tg=tgUser(),wa=waUrl(''),msg=tgText(),v=x=>x?esc(x):'<i class="nil">—</i>';
  sheet(3,`<div class="sum">
   <div class="sumh"><div><b>Summary</b><span>Please check your details once</span></div><button class="sumed" data-edit>${PEN} Edit</button></div>
   <dl><div><dt>Series name</dt><dd>${esc(ORD.title)}</dd></div><div><dt>Amount</dt><dd>${inr(ORD.amount)}</dd></div></dl>
   <dl><div><dt>Student name</dt><dd>${esc(ORD.name)}</dd></div><div><dt>Mobile no.</dt><dd>${esc(ORD.mobile)}</dd></div></dl>
   <dl><div><dt>Order code</dt><dd class="code">${esc(ORD.code)}</dd></div><div><dt>Paid from account of</dt><dd>${v(ORD.payer)}</dd></div><div><dt>UTR / Transaction ID</dt><dd class="code">${v(ORD.utr)}</dd></div></dl>
   <p class="sumok">Payment done ✅</p>
   <p class="sumnote"><b>Note:</b> Is message ke saath apna <b>payment screenshot</b> zaroor bhejein — verification ke liye.</p></div>
   <div class="vgo">${tg?`<a class="btn tg block vbtn" data-verify target="_blank" rel="noopener" href="${esc(tgLink(msg))}">${TGI} Verify on Telegram</a>`:''}${wa?`<a class="btn wa block vbtn" data-verify target="_blank" rel="noopener" href="${esc(waUrl(msg))}">${WAI} Verify on WhatsApp</a>`:''}</div>`);
}
/* Edit (small box over the summary): name, mobile, account holder, UTR. Series and order code stay as they are.
   A new name / mobile updates the order on the server (a new mobile gets its own order code, like Buy now). */
function editBox(){
  closeEdit();
  const d=document.createElement('div');d.className='ebox';d.addEventListener('click',e=>{if(e.target===d)closeEdit()});
  d.innerHTML=`<div class="eboxin" role="dialog" aria-modal="true" aria-label="Edit details"><div class="shd"><div class="grow"><b>Edit details</b></div><button class="x" data-editx aria-label="Close">✕</button></div>
   <label for="en">Student name</label><input id="en" maxlength="60" autocomplete="name" value="${esc(ORD.name)}">
   <label for="em">Mobile no.</label><input id="em" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" value="${esc(ORD.mobile)}">
   <label for="ep">Paid from account of</label><input id="ep" maxlength="60" autocomplete="off" value="${esc(ORD.payer||'')}">
   <label for="eu">UTR / Transaction ID</label><input id="eu" maxlength="30" autocomplete="off" value="${esc(ORD.utr||'')}" style="font-family:ui-monospace,Menlo,monospace;letter-spacing:1px">
   <div class="err" id="eer"></div><button class="btn block" id="esave" data-esave>Save</button></div>`;
  document.body.appendChild(d);
}
function closeEdit(){const d=$('.ebox');if(d)d.remove()}
async function editSave(){
  const [n,m]=meRead('#en','#em'),py=$('#ep').value.trim(),pu=$('#eu').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase(),er=$('#eer');
  const bad=meCheck(n,m)||(py.length<2?'Please write the name on the account you paid from.':pu&&pu.length<6?'This UTR looks too short. Check it, or leave it empty.':'');
  if(bad)return er.textContent=bad;
  const b=$('#esave');b.disabled=true;b.textContent='Saving…';er.textContent='';
  const fail=t=>{if($('#esave')){b.disabled=false;b.textContent='Save';er.textContent=t}};
  if(n!==ORD.name||m!==ORD.mobile){
    const r=await rpc('cbt_store_order',{p_item:ORD.item,p_name:n,p_mobile:m});
    if(!r.ok)return fail(r.error==='busy'?'Too many tries. Please wait a while and try again.':r.error==='network'?'No internet. Please try again.':'Could not save. Please try again.');
    meSave(n,m);
    Object.assign(ORD,{code:r.code,amount:r.amount,title:r.title,name:n,mobile:m,at:Date.now()});
  }
  const r=await rpc('cbt_store_paid',{p_code:ORD.code,p_mobile:ORD.mobile,p_payer:py,p_utr:pu});
  if(!r.ok&&r.error==='network'){LSs('store_ord',ORD);return fail('No internet. Please try again.')}
  ORD.payer=py;ORD.utr=pu;LSs('store_ord',ORD);
  closeEdit();if($('.ov'))vStep();
}
document.addEventListener('click',e=>{
  const t=e.target.closest('button,a,[data-view]');if(!t)return;
  if('help' in t.dataset){e.preventDefault();helpSheet();return}
  if('themeToggle' in t.dataset)themeToggle();
  else if('gate' in t.dataset)gateGo();
  else if('me' in t.dataset)meSheet();
  else if('mesave' in t.dataset)meSaveGo();
  else if(t.dataset.buy){closeSheet();buy(t.dataset.buy)}
  else if(t.dataset.explore)explore(t.dataset.explore);
  else if(t.dataset.view)explore(t.dataset.view,'d');
  else if(t.dataset.rv)explore(t.dataset.rv,'v');
  else if(t.dataset.xtab){if(XP){XP.tab=t.dataset.xtab;xpDraw(true)}}
  else if('xback' in t.dataset)xpBack();
  else if(t.dataset.sch)schedule(t.dataset.sch);
  else if(t.dataset.demo)demo(t.dataset.demo,+t.dataset.slot);
  else if('rvf' in t.dataset){RVF=t.dataset.rvf;RVN=8;rvAllDraw()}
  else if('rvmore' in t.dataset){const r=$('.rvrail'),x=r?r.scrollLeft:0;RVN+=8;rvAllDraw();const r2=$('.rvrail');if(r2)r2.scrollLeft=x}
  else if('rvjump' in t.dataset){const r=$('#reviews');if(r)r.scrollIntoView({behavior:'smooth',block:'start'})}
  else if('rvx' in t.dataset){const c=t.closest('.rv');if(c){const o=c.classList.toggle('open');t.textContent=o?'Show less':'Read more';t.setAttribute('aria-expanded',o)}}
  else if(t.dataset.share)share(t.dataset.share,!!t.closest('#xp'));
  else if('close' in t.dataset)closeSheet();
  else if('redo' in t.dataset){e.preventDefault();const id=IT.id;meSheet(()=>{LSd('store_ord');closeSheet();buy(id)})}
  else if(t.dataset.copy)copy(t.dataset.copy,t.dataset.what);
  else if('saveqr' in t.dataset)saveQr();
  else if('verify' in t.dataset){try{navigator.clipboard.writeText(tgText())}catch(_){}}
  else if('edit' in t.dataset)editBox();
  else if('editx' in t.dataset)closeEdit();
  else if('esave' in t.dataset)editSave();
  else if(t.dataset.step==='paid')paidStep();
  else if(t.dataset.step==='back1')payStep();
  else if('paidgo' in t.dataset)paidGo();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if($('.ebox'))closeEdit();else if($('.ov'))closeSheet();else if($('#xp'))xpBack()}
  if(e.key!=='Enter')return;
  if($('#esave'))editSave();
  else if(!document.documentElement.classList.contains('has-me')&&$('#gate'))gateGo();
  else if($('#go'))meSaveGo();
  else if($('#pgo'))paidGo();
});
themeMeta();meChip();
if(!ME()&&matchMedia('(hover:hover)').matches)setTimeout(()=>{const n=$('#gn');if(n)n.focus()},300);
/* ---------- schedule (PDF / photo) ---------- */
let SCH={};
const fsize=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
async function loadSch(){
  const r=await rpc('cbt_store_schedules');if(!r.ok)return;
  SCH={};(r.items||[]).forEach(x=>SCH[x.id]=x);
  if(XP)xpDraw();
}
function dataToBlob(d){
  const m=d.match(/^data:([^;]+);base64,(.*)$/);if(!m)return null;
  const b=atob(m[2]),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
  return new Blob([u],{type:m[1]});
}
let SCHURL=null;
// a schedule or demo test file: PDF (open / download) or photo
async function fileSheet(id,o){
  const x=ST.items.find(i=>i.id===id);if(!x)return;IT=x;
  const head=`<div class="shd"><div class="grow"><b style="white-space:normal">${o.icon} ${esc(o.name)}</b><span class="sm mut">${esc(x.title)}</span></div><button class="x" data-close aria-label="Close">✕</button></div>`;
  ovEl().innerHTML=`<div class="sheet" role="dialog" aria-modal="true">${head}<div class="sk" style="height:220px"></div></div>`;
  const r=await o.load();
  const sh=$('.ov .sheet');if(!sh)return;
  if(!r.ok||!r.data){sh.innerHTML=head+`<p class="sm mut">Could not open it. Please try again.</p>`;return}
  const blob=dataToBlob(r.data);if(SCHURL)URL.revokeObjectURL(SCHURL);SCHURL=blob?URL.createObjectURL(blob):r.data;
  const pdf=r.mime==='application/pdf',fname=((o.name||'').replace(/[^\w\- ]+/g,'').trim()||'File')+(pdf?'.pdf':r.mime==='image/png'?'.png':'.jpg');
  sh.innerHTML=head+(pdf?`<div class="pdfbox"><span>📄</span><b>${esc(o.name)}</b><small>PDF · ${fsize(o.size)}</small></div>
     <a class="btn block" href="${SCHURL}" target="_blank" rel="noopener">👁 ${o.open}</a>`
    :`<img src="${esc(r.data)}" alt="${esc(o.name)}" style="width:100%;border-radius:14px;display:block;margin-bottom:12px">`)
    +`<a class="btn soft block" style="margin-top:10px" href="${SCHURL}" download="${esc(fname)}">⬇ Download</a>
     <button class="btn block" style="margin-top:10px" data-buy="${esc(id)}">Buy this series · ${inr(x.price)}</button>`;
}
function schedule(id){const f=SCH[id];if(f)fileSheet(id,{icon:'📅',name:f.name||'Schedule',size:f.size,open:'Open schedule',load:()=>rpc('cbt_store_schedule',{p_item:id})})}
function demo(id,n){const d=((XD[id]||{}).demos||[]).find(z=>z.slot===n);if(d&&d.size)fileSheet(id,{icon:'🧪',name:d.title||`Demo Test ${n}`,size:d.size,open:'Open demo test',load:()=>rpc('cbt_store_demo',{p_item:id,p_slot:n})})}
/* ---------- ratings & reviews (from students whose series is unlocked; managed in the admin panel) ---------- */
let RV={};
// stars filled to the exact rating (4.5 → four and a half stars)
const stars=(n,cls)=>{const v=Math.max(0,Math.min(5,Number(n)||0));return `<span class="stars ${cls||''}" role="img" aria-label="${v.toFixed(1)} out of 5 stars"><i class="s0">★★★★★</i><i class="s1" style="width:${(v*20).toFixed(1)}%">★★★★★</i></span>`};
const rvDate=ms=>new Date(ms).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
const rvWhen=ms=>{const d=Math.floor((Date.now()-ms)/864e5);return d<1?'Today':d<2?'Yesterday':d<7?d+' days ago':d<28?Math.floor(d/7)+(d<14?' week ago':' weeks ago'):rvDate(ms)};
const plural=(n,w)=>`${n} ${w}${n>1?'s':''}`;
// pinned first, then written reviews, then newest (nothing is hidden)
const rvSort=(a,b)=>(b.pinned-a.pinned)||(!!b.body-!!a.body)||(b.at-a.at);
function rvAva(x){const n=String(x.name||'S').trim()||'S',h=[...n].reduce((a,c)=>a+c.charCodeAt(0),0);return `<span class="rva c-${COLORS[h%5]}">${/^data:image\//.test(x.photo||'')?`<img src="${esc(x.photo)}" alt="">`:esc(n[0].toUpperCase())}</span>`}
const RVNOTE=`<p class="rvnote">✔ <b>Verified</b> = written from the student's own account after their series was unlocked. One review per student.</p>`;
const clip=(t,n)=>{t=String(t||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1).trim()+'…':t};
// on each card and on the Explore page: stars · average · count, opens the Reviews tab
function rvMini(id){const r=RV[id];return r&&r.count?`<button class="rvmini" data-rv="${esc(id)}">${stars(r.avg)}<b>${Number(r.avg).toFixed(1)}</b><span>· ${plural(r.count,'review')}</span><u>Read ›</u></button>`:''}
function rvItem(x,withTitle){
  const long=(x.body||'').length>170;
  return `<div class="rv${long?' clip':''}"><div class="rvt">${rvAva(x)}<div class="grow"><div class="rvn"><b>${esc(x.name||'Student')}</b><span class="vb" title="This student's series is unlocked">✔ Verified</span></div><div class="rvm">${stars(x.rating)}<span title="${esc(rvDate(x.at))}">${rvWhen(x.at)}</span>${x.pinned?'<span class="pin">📌 Pinned</span>':''}</div></div></div>
    ${x.body?`<p class="rvb">${esc(x.body)}</p>${long?'<button class="rvx" data-rvx aria-expanded="false">Read more</button>':''}`:`<p class="rvb rvno">Gave ${Number(x.rating)||0} star${x.rating>1?'s':''} · no written review</p>`}${x.reply?`<div class="rvr"><b><img src="icon-192.png" alt="">Reply from ${esc(CFG.SITE_NAME||'the team')}</b><p>${esc(x.reply)}</p></div>`:''}${withTitle&&x.title?`<button class="rvon" data-view="${esc(x.item)}">on <b>${esc(x.title)}</b> ›</button>`:''}</div>`;
}
function rvSum(avg,count,S){
  return `<div class="rvsum"><div class="rvbig"><b>${Number(avg).toFixed(1)}</b>${stars(avg)}<span>${plural(count,'review')}</span></div>
    <div class="rvbars">${[5,4,3,2,1].map((n,i)=>`<div><span>${n}★</span><i><em style="width:${count?Math.round((S[i]||0)*100/count):0}%"></em></i><span>${S[i]||0}</span></div>`).join('')}</div></div>`;
}
let RVDONE=false;
async function loadRv(){
  const r=await rpc('cbt_store_reviews');RVDONE=true;if(!r.ok){if(XP)xpDraw();return}
  RV={};(r.items||[]).forEach(x=>RV[x.id]=x);
  document.querySelectorAll('[data-rvmini]').forEach(e=>e.innerHTML=rvMini(e.dataset.rvmini));
  rvAllDraw();if(XP)xpDraw();
}
/* ---------- under the cards: every review, all series ---------- */
let RVF='',RVN=8;
function rvAll(){
  const L=[];for(const x of ST.items){const r=RV[x.id];if(r&&r.list)r.list.forEach(v=>L.push(Object.assign({item:x.id,title:x.title},v)))}
  return L.sort(rvSort);
}
function rvAllDraw(){
  const sec=$('#reviews'),j=$('#rvjump');if(!sec)return;
  const its=ST.items.filter(x=>RV[x.id]&&RV[x.id].count),total=its.reduce((a,x)=>a+RV[x.id].count,0);
  if(!total){sec.hidden=true;if(j)j.hidden=true;return}
  const S=[0,1,2,3,4].map(i=>its.reduce((a,x)=>a+((RV[x.id].stars||[])[i]||0),0));
  // exact average from the star counts (each series' avg from the server is already rounded)
  const avg=S.reduce((a,b)=>a+b,0)===total?(5*S[0]+4*S[1]+3*S[2]+2*S[3]+S[4])/total:its.reduce((a,x)=>a+RV[x.id].avg*RV[x.id].count,0)/total;
  const all=rvAll();
  if(j){const q=all.find(v=>v.body&&v.rating>=4);j.hidden=false;
    j.innerHTML=`<span class="rjtop"><span class="rjbig">${avg.toFixed(1)}</span><span class="grow">${stars(avg,'big')}<span class="rjtx">${plural(total,'review')} from verified students</span></span><span class="ava3">${all.slice(0,3).map(v=>rvAva(v)).join('')}</span></span>
     ${q?`<span class="rjq">“${esc(clip(q.body,120))}”<small>${esc(q.name||'Student')} · ✔ Verified student</small></span>`:''}<span class="rjgo">Read all reviews →</span>`}
  if(RVF&&!its.some(x=>x.id===RVF))RVF='';
  const R=RVF?RV[RVF]:{avg,count:total,stars:S};
  const L=all.filter(v=>!RVF||v.item===RVF),show=L.slice(0,RVN),more=L.length-show.length;
  sec.hidden=false;
  sec.innerHTML=`<div class="sh rvhead"><div><small>Student reviews</small><h2>What our students say</h2></div></div>
   <p class="sm mut rvsub">Real reviews from students whose test series is unlocked.</p>
   ${rvSum(R.avg,R.count,R.stars||[])}
   ${its.length>1?`<div class="rvchips">${[['','All',total],...its.map(x=>[x.id,x.title,RV[x.id].count])].map(([k,l,c])=>`<button class="${RVF===k?'on':''}" data-rvf="${esc(k)}">${esc(l)} · ${Number(c)||0}</button>`).join('')}</div>`:''}
   <div class="rvrail">${show.map(v=>rvItem(v,!RVF&&its.length>1)).join('')}${more>0?`<button class="rvmoret" data-rvmore>See ${plural(more,'more review')} →</button>`:''}</div>
   ${RVNOTE}`;
}
addEventListener('scroll',()=>{const f=$('#fab');if(f)f.classList.toggle('mini',scrollY>160)},{passive:true});
load();
