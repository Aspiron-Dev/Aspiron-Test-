/* Store page: lists the paid test series (managed in the admin panel → Store) and walks the student through
   UPI payment → Telegram screenshot → register. Prices, UPI ID and Telegram come only from the database. */
const CFG=window.CBT_CONFIG||{},API=(CFG.SUPABASE_URL||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLORS=['blue','green','purple','orange','red','dark'];
const inr=n=>'₹'+Number(n||0).toLocaleString('en-IN');
let ST={settings:{},items:[]},ORD=null,IT=null;
const LSg=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(_){return d}};
const LSs=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};

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
const tgUser=()=>String(ST.settings.telegram||'').replace(/^@/,'');

async function load(){
  if(CFG.SITE_NAME)$('#sname').textContent=CFG.SITE_NAME;
  const r=await rpc('cbt_store');
  if(!r.ok){$('#list').innerHTML=`<div class="card empty"><b>${r.error==='network'?'No internet':'Store is opening soon'}</b><p class="sm">${r.error==='network'?'Check your connection and refresh.':'Please check back in a little while.'}</p></div>`;return}
  ST=r;const tg=tgUser();if(tg)$('#ftg').href='https://t.me/'+encodeURIComponent(tg);
  const L=ST.items||[];
  if(!L.length){$('#list').innerHTML=`<div class="card empty"><b>New test series coming soon</b><p class="sm">Please check back in a little while.</p></div>`;return}
  $('#list').innerHTML=L.map(cardHtml).join('');
  const h=location.hash.match(/p=([0-9a-f-]{36})/);
  if(h){const c=document.getElementById('p_'+h[1]);if(c){c.classList.add('hl');setTimeout(()=>c.scrollIntoView({behavior:'smooth',block:'center'}),200)}}
}
function cardHtml(x){
  const off=x.mrp&&x.mrp>x.price?Math.round((1-x.price/x.mrp)*100):0,col=COLORS.includes(x.color)?x.color:'blue';
  return `<div class="card" id="p_${esc(x.id)}"><div class="ctop c-${col}">${x.badge?`<span class="badge">${esc(x.badge)}</span>`:''}<h3>${esc(x.title)}</h3>${x.subtitle?`<p>${esc(x.subtitle)}</p>`:''}</div>
   <div class="cbody"><div class="price"><b>${inr(x.price)}</b>${off?`<s>${inr(x.mrp)}</s><em>${off}% OFF</em>`:''}</div>
   ${(x.features||[]).length?`<ul class="f">${x.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:'<div style="flex:1"></div>'}
   <div class="row"><button class="btn soft" data-share="${esc(x.id)}" aria-label="Share">↗ Share</button><button class="btn" style="flex:1" data-buy="${esc(x.id)}">Buy now</button></div></div></div>`;
}
async function share(id){
  const x=ST.items.find(i=>i.id===id);if(!x)return;
  const url=location.href.split('#')[0]+'#p='+id,text=`${x.title} — ${inr(x.price)}. See details and buy here:`;
  if(navigator.share){try{await navigator.share({title:x.title,text,url});return}catch(e){if(e&&e.name==='AbortError')return}}
  copy(text+' '+url,'Link copied');
}

/* ---------- checkout: details → pay → telegram → register ---------- */
function sheet(step,body){
  let ov=$('.ov');
  if(!ov){ov=document.createElement('div');ov.className='ov';ov.addEventListener('click',e=>{if(e.target===ov)closeSheet()});document.body.appendChild(ov);document.body.style.overflow='hidden'}
  ov.innerHTML=`<div class="sheet" role="dialog" aria-modal="true"><div class="shd"><div class="grow"><b>${esc(IT.title)}</b><span class="sm mut">Step ${step} of 4</span></div><button class="x" data-close aria-label="Close">✕</button></div>
   <div class="steps">${[1,2,3,4].map(i=>`<i class="${i<=step?'on':''}"></i>`).join('')}</div>${body}</div>`;
}
function closeSheet(){const o=$('.ov');if(o)o.remove();document.body.style.overflow=''}
function buy(id){
  IT=ST.items.find(i=>i.id===id);if(!IT)return;
  const me=LSg('store_me',{}),last=LSg('store_ord',null);
  // same series ordered in the last 24 h → continue that order instead of making a new code
  if(last&&last.item===id&&Date.now()-last.at<864e5){ORD=last;return payStep()}
  sheet(1,`<p class="sm mut">Enter the name and mobile number you will register with. Your series is unlocked on this number.</p>
   <label for="sn">Full name</label><input id="sn" autocomplete="name" maxlength="60" value="${esc(me.name||'')}" placeholder="e.g. Rahul Sharma">
   <label for="sm">Mobile number</label><input id="sm" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" value="${esc(me.mobile||'')}" placeholder="10-digit mobile number">
   <div class="err" id="er"></div><button class="btn block" id="go" data-order>Continue to payment →</button>`);
}
async function order(){
  const n=$('#sn').value.trim(),m=$('#sm').value.replace(/\D/g,'').slice(-10),er=$('#er');
  if(n.length<2)return er.textContent='Please enter your name.';
  if(!/^[6-9]\d{9}$/.test(m))return er.textContent='Please enter a valid 10-digit mobile number.';
  const b=$('#go');b.disabled=true;b.textContent='Please wait…';er.textContent='';
  const r=await rpc('cbt_store_order',{p_item:IT.id,p_name:n,p_mobile:m});
  if(!r.ok){b.disabled=false;b.textContent='Continue to payment →';
    return er.textContent=r.error==='busy'?'Too many tries. Please wait a while and try again.':r.error==='network'?'No internet. Please try again.':r.error==='item'?'This series is not available right now.':'Something went wrong. Please try again.'}
  LSs('store_me',{name:n,mobile:m});
  ORD={item:IT.id,code:r.code,amount:r.amount,title:r.title,name:n,mobile:m,at:Date.now()};LSs('store_ord',ORD);
  payStep();
}
function upiLink(){
  const s=ST.settings;
  const e=encodeURIComponent;
  return `upi://pay?pa=${s.upi}&pn=${e(s.payee||'')}&am=${ORD.amount}&cu=INR&tn=${e(ORD.code)}`;
}
function qrSvg(t){const q=qrcode(0,'M');q.addData(t);q.make();return q.createSvgTag({cellSize:4,margin:2,scalable:true})}
function payStep(){
  const s=ST.settings,mob=/android|iphone|ipad|ipod/i.test(navigator.userAgent);
  sheet(2,`<div class="amt"><span class="sm mut">Amount to pay</span><br><b>${inr(ORD.amount)}</b></div>
   <div class="qr">${qrSvg(upiLink())}</div>
   <p class="sm mut" style="text-align:center;margin-top:8px">Scan with GPay, PhonePe, Paytm or any UPI app</p>
   <div class="verify"><span>⚠️</span><span>Before paying, check that the name shown in your UPI app is <b>${esc(s.payee)}</b>. Pay only to the UPI ID below.</span></div>
   <div class="kv"><div><span>UPI ID</span><b>${esc(s.upi)}</b><button class="cp" data-copy="${esc(s.upi)}" data-what="UPI ID copied">Copy</button></div>
    <div><span>Amount</span><b>${inr(ORD.amount)}</b><button class="cp" data-copy="${ORD.amount}" data-what="Amount copied">Copy</button></div>
    <div><span>Order code</span><b class="code">${esc(ORD.code)}</b><button class="cp" data-copy="${esc(ORD.code)}" data-what="Code copied">Copy</button></div></div>
   <p class="sm mut">If you pay with the UPI ID, write the order code <b class="code">${esc(ORD.code)}</b> in the payment note.</p>
   ${mob?`<a class="btn soft block" style="margin-top:12px" href="${esc(upiLink())}">Open UPI app</a>`:''}
   <button class="btn block" style="margin-top:10px" data-step="3">I have paid → Next</button>
   ${s.note?`<p class="sm mut" style="margin-top:10px">${esc(s.note)}</p>`:''}
   <p class="sm mut" style="text-align:center;margin-top:12px">For ${esc(ORD.name)} · ${esc(ORD.mobile)} · <a href="#" data-redo style="color:var(--pri)">change</a></p>`);
}
function tgText(){return `Payment done ✅\nOrder code: ${ORD.code}\nSeries: ${ORD.title}\nAmount: ${inr(ORD.amount)}\nName: ${ORD.name}\nMobile: ${ORD.mobile}\n(Screenshot attached)`}
function tgStep(){
  const u=tgUser();
  sheet(3,`<div class="bigok">📸</div><h3 style="text-align:center;margin-bottom:6px">Send your payment screenshot</h3>
   <p class="sm mut" style="text-align:center">Send the <b>payment screenshot</b> and this message to us on Telegram <b>@${esc(u)}</b>. We check it and unlock your series.</p>
   <div class="msg">${esc(tgText())}</div>
   <button class="btn soft block" data-copy-msg>Copy message</button>
   <a class="btn tg block" style="margin-top:10px" target="_blank" rel="noopener" href="https://t.me/${encodeURIComponent(u)}?text=${encodeURIComponent(tgText())}">✈ Open Telegram @${esc(u)}</a>
   <button class="btn block" style="margin-top:10px" data-step="4">I have sent it → Next</button>`);
}
function doneStep(){
  const u=tgUser();
  sheet(4,`<div class="bigok">✓</div><h3 style="text-align:center;margin-bottom:4px">Thank you!</h3>
   <p class="sm mut" style="text-align:center">Our team will check your payment and send you everything on Telegram.</p>
   <div class="st"><i>1</i><div><b>We verify your payment</b><div class="sm mut">Using your screenshot and order code <b class="code">${esc(ORD.code)}</b>.</div></div></div>
   <div class="st"><i>2</i><div><b>You get your login details on Telegram</b><div class="sm mut">The website link and your personal access code, for mobile ${esc(ORD.mobile)}.</div></div></div>
   <div class="st"><i>3</i><div><b>Start your tests</b><div class="sm mut">Sign in and your test series is ready.</div></div></div>
   <a class="btn tg block" style="margin-top:6px" target="_blank" rel="noopener" href="https://t.me/${encodeURIComponent(u)}">✈ Open Telegram @${esc(u)}</a>
   <button class="btn soft block" style="margin-top:10px" data-close>Close</button>
   <p class="sm mut" style="text-align:center;margin-top:10px">Keep your order code <b class="code">${esc(ORD.code)}</b> for any help.</p>`);
}
document.addEventListener('click',e=>{
  const t=e.target.closest('button,a');if(!t)return;
  if(t.dataset.buy)buy(t.dataset.buy);
  else if(t.dataset.share)share(t.dataset.share);
  else if('close' in t.dataset)closeSheet();
  else if('redo' in t.dataset){e.preventDefault();localStorage.removeItem('store_ord');buy(IT.id)}
  else if('order' in t.dataset)order();
  else if(t.dataset.copy)copy(t.dataset.copy,t.dataset.what);
  else if('copyMsg' in t.dataset)copy(tgText(),'Message copied');
  else if(t.dataset.step==='3')tgStep();
  else if(t.dataset.step==='4')doneStep();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();if(e.key==='Enter'&&$('#go'))order()});
load();
