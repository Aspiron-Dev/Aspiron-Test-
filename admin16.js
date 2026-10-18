/* ===== Admin: cheating reports + suspensions =====
   Server: supabase_v24_cheating.sql (cbt_admin_cheat).
   Results → 🚩 marks one result as cheating (tag on the student's result, last place on that test's leaderboard).
   Suspend: the student's app shows a full-screen notice with a Support button until you lift it or the time ends. */
async function ACH(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_cheat',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    // keep the database's own message, so a failure says what went wrong
    if(!r.ok){let m='';try{m=(await r.json()).message||''}catch(e){}return{ok:false,error:r.status===404?'missing':'server',msg:m}}
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
AI.cheat='<path d="M4 21V4"/><path d="M4 4h12l-2 4 2 4H4"/>';
XTRA.push('cheat');TTL.cheat='Cheating & suspensions';
HUBS.students.tabs.push(['cheat','Cheating']);MKNOWN.add('cheat');
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='cheat')return loadCheat();return r}}

let CH={flags:[],suspended:[],ok:false};
const chSetup=`<div class="card empty"><b>One-time setup needed</b><p class="sm">Open Supabase → SQL Editor, paste <b>supabase_v24_cheating.sql</b> and press Run once. Then refresh.</p></div>`;
async function chFetch(){const r=await ACH('get');if(r.ok)CH={flags:r.flags||[],suspended:r.suspended||[],ok:true};return r}
const chTest=id=>(CA.tests.find(t=>t.id===id)||{}).title||'Test';
const chWhen=v=>new Date(v).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
const chFlagged=(m,t)=>CH.flags.some(f=>f.mobile===m&&f.test_id===t);
const chSusp=m=>CH.suspended.find(s=>s.mobile===m);

/* ---------- page: Students → Cheating ---------- */
async function loadCheat(){
  const p=$('#pn_cheat');if(!p)return;
  p.innerHTML=`<div class="phead"><div><h1>Cheating &amp; suspensions</h1><p class="sm mut">Report cheating from <b>Results → 🚩</b>, suspend from here or from a student's page. A suspended student sees a full-screen notice with a Support button and cannot use the app until you lift it.</p></div></div><div id="chbody">${askel()}</div>`;
  if(!CA.tests.length)await loadCatalog();
  const r=await chFetch();
  if(!r.ok){$('#chbody').innerHTML=r.error==='missing'?chSetup:'<div class="card empty">Could not load. Check your internet and try again.</div>';return}
  chDraw();
}
function chDraw(){
  const b=$('#chbody');if(!b)return;
  b.innerHTML=`<div class="h2s">⛔ Suspended now <span class="n">${CH.suspended.length}</span></div>
   ${CH.suspended.length?CH.suspended.map(s=>`<div class="card" style="margin-bottom:10px;border-left:4px solid var(--bad)"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
     <div style="flex:1 1 100%;min-width:0"><b>${esc(s.name||'Student')}</b> <span class="sm mut">${esc(s.mobile)}</span>
      <div class="sm mut">Since ${chWhen(s.at)} · ${s.until?'until '+chWhen(s.until):'until you lift it'}</div>${s.reason?`<div class="sm" style="margin-top:4px">${esc(s.reason)}</div>`:''}</div>
     <a class="btn soft sm" style="text-decoration:none" target="_blank" rel="noopener" href="${waTo(s.mobile,`Hi ${(s.name||'').split(' ')[0]}, `)}">WhatsApp</a>
     <button class="btn sm" onclick="chLift('${esc(s.mobile)}')">✅ Lift suspension</button></div></div>`).join(''):'<div class="card empty"><p class="sm mut">Nobody is suspended.</p></div>'}
   <div class="h2s">🚩 Results marked as cheating <span class="n">${CH.flags.length}</span></div>
   ${CH.flags.length?`<div class="card" style="padding:6px 14px">${CH.flags.map(f=>`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--bd)">
     <div style="flex:1 1 100%;min-width:0"><b>${esc(f.name||'Student')}</b> <span class="sm mut">${esc(f.mobile||'')}</span><div class="sm mut">${esc(chTest(f.test_id))} · ${chWhen(f.at)}${f.note?' · '+esc(f.note):''}</div></div>
     ${chSusp(f.mobile)?'<span class="chip" style="background:var(--badSoft);color:var(--bad)">Suspended</span>':`<button class="btn ghost sm" onclick="chSuspendForm('${esc(f.mobile)}','${esc(f.test_id)}')">⛔ Suspend</button>`}
     <button class="btn ghost sm" onclick="chUnflag('${esc(f.mobile)}','${esc(f.test_id)}')">Remove tag</button></div>`).join('')}</div>`:'<div class="card empty"><p class="sm mut">No reports yet.</p></div>'}`;
}

/* ---------- report from Results ---------- */
{const _dr=drawRes;drawRes=function(){
  _dr();
  const f=resFiltered(),rows=document.querySelectorAll('#rtb tbody tr');
  rows.forEach((tr,i)=>{const x=f[i],td=tr.lastElementChild;if(!x||!td)return;
    const tid=chTid(x),on=tid&&chFlagged(x.mobile,tid);
    if(on)tr.children[2].insertAdjacentHTML('beforeend',' <span class="chip" style="background:var(--badSoft);color:var(--bad)">🚩 Cheating</span>');
    td.insertAdjacentHTML('afterbegin',`<button class="btn ${on?'':'ghost'} sm" title="Report cheating" onclick="chReport('${esc(x.id)}')">🚩</button> `)});
}}
{const _lr=loadResults;loadResults=async function(){await Promise.all([_lr(),chFetch()]);if($('#rtb'))drawRes()}}
// the result's test id: from the row, else the only test with this title
function chTid(x){if(x.test_id)return String(x.test_id);const L=CA.tests.filter(t=>t.title===x.title);return L.length===1?String(L[0].id):''}
function chReport(rid){
  const x=RS.find(z=>String(z.id)===String(rid));if(!x)return;
  const tid=chTid(x),on=tid&&chFlagged(x.mobile,tid),su=chSusp(x.mobile);
  if(!CH.ok){modal(chSetup+'<button class="btn ghost block" style="margin-top:10px" onclick="closeModal()">Close</button>');return}
  if(!tid){modal(`<h2>Which test?</h2><p class="sm mut">More than one test is called “${esc(x.title)}”. Delete or rename the duplicate, then try again.</p><button class="btn block" onclick="closeModal()">OK</button>`);return}
  modal(`<div class="row" style="justify-content:space-between"><h2>🚩 Report cheating</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <p class="sm mut" style="margin-top:0"><b style="color:var(--tx)">${esc(x.student)}</b> · ${esc(x.mobile)}<br>${esc(x.title)} · ${x.score}/${x.max}</p>
   <div class="sm" style="background:var(--surface2);border-radius:12px;padding:9px 12px;margin-bottom:10px">Everyone sees a <b>🚩 Cheating</b> tag next to this student on this test's leaderboard, and they move to the last place.</div>
   ${on?`<button class="btn ghost block" onclick="chUnflag('${esc(x.mobile)}','${esc(tid)}',1)">Remove the cheating tag</button>`:
   `<label class="l">Note (only for you)</label><input type="text" id="chnote" maxlength="300" placeholder="e.g. Same answers as another student">
    <label style="display:flex;gap:8px;align-items:center;margin:12px 0 4px"><input type="checkbox" id="chsus" ${su?'disabled':'checked'} onchange="$('#chsusf').style.display=this.checked?'':'none'"> ${su?'Already suspended':'Also suspend this account'}</label>
    <div id="chsusf" ${su?'style="display:none"':''}>${chSusFields(x.title)}</div>
    <button class="btn block" style="margin-top:12px;background:var(--bad)" onclick="chSave('${esc(x.mobile)}','${esc(tid)}','${esc(x.id)}',this)">🚩 Mark as cheating</button>`}`);
}
const CHDUR=[['','Until I lift it'],['24','24 hours'],['72','3 days'],['168','7 days'],['720','30 days']];
function chSusFields(title){
  return `<label class="l">How long</label><select id="chdur">${CHDUR.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
   <label class="l">Message the student sees</label><textarea id="chmsg" rows="4" maxlength="500" style="width:100%">You were found cheating in the test "${esc(title||'')}". Your ID is suspended. Talk to the support team within 24 hours to solve this.</textarea>`;
}
async function chSave(m,tid,rid,b){
  b.disabled=true;
  const r=await ACH('flag',{mobile:m,test_id:tid,result_id:rid,note:$('#chnote').value.trim()});
  if(!r.ok){b.disabled=false;toast(chErr(r));return}
  const sus=$('#chsus');
  if(sus&&sus.checked&&!sus.disabled){const s=await ACH('suspend',{mobile:m,hours:$('#chdur').value,reason:$('#chmsg').value.trim()});if(!s.ok)toast('Marked, but could not suspend')}
  closeModal();await chFetch();toast('Marked as cheating');if($('#rtb'))drawRes();chDraw();
}
// in-page "are you sure?" (the browser's confirm() is switched off inside some apps, then the button seemed dead)
function chAsk(title,text,yes,fn){
  modal(`<h2>${title}</h2><p class="sm mut">${text}</p><div class="row" style="margin-top:14px;gap:8px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="chyes">${yes}</button></div>`);
  $('#chyes').onclick=async()=>{const b=$('#chyes');b.disabled=true;b.textContent='Please wait…';await fn()};
}
const chErr=r=>r.error==='missing'?'Run supabase_v24_cheating.sql in Supabase first':r.error==='network'?'No internet. Try again.':r.error==='student'?'Student not found':'Could not save ('+(r.msg||r.error||'error')+')';
function chUnflag(m,tid){chAsk('Remove the cheating tag?','The 🚩 tag goes away and the student gets their real rank back on this test.','Remove tag',()=>chUnflagGo(m,tid))}
async function chUnflagGo(m,tid){
  const r=await ACH('unflag',{mobile:m,test_id:tid});if(!r.ok){closeModal();toast(chErr(r));return}
  closeModal();await chFetch();toast('Tag removed');if($('#rtb'))drawRes();chDraw();
}

/* ---------- suspend / lift (also from the student's page) ---------- */
function chSuspendForm(m,tid){
  const s=(ST||[]).find(x=>x.mobile===m)||CH.flags.find(f=>f.mobile===m)||{name:''};
  modal(`<div class="row" style="justify-content:space-between"><h2>⛔ Suspend ${esc(s.name||m)}</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <p class="sm mut" style="margin-top:0">The app and website show a full-screen notice with a Support button instead of the tests. Nothing else is deleted.</p>
   ${chSusFields(tid?chTest(tid):'')}<button class="btn block" style="margin-top:12px;background:var(--bad)" onclick="chSuspend('${esc(m)}',this)">⛔ Suspend now</button>`);
}
async function chSuspend(m,b){
  b.disabled=true;const r=await ACH('suspend',{mobile:m,hours:$('#chdur').value,reason:$('#chmsg').value.trim()});
  if(!r.ok){b.disabled=false;toast(chErr(r));return}
  closeModal();await chFetch();toast('Suspended');chDraw();if(typeof loadStudents==='function'&&CUR==='students')loadStudents();
}
function chLift(m){const s=chSusp(m)||{};chAsk('✅ Lift suspension?',`<b style="color:var(--tx)">${esc(s.name||m)}</b> can use the app and website again at once. The suspension notice goes away on their phone.`,'Yes, lift it',()=>chLiftGo(m))}
async function chLiftGo(m){
  const r=await ACH('lift',{mobile:m});if(!r.ok){closeModal();toast(chErr(r));return}
  closeModal();await chFetch();toast('Suspension lifted');chDraw();if(typeof loadStudents==='function'&&CUR==='students')loadStudents();
}
{const _mg=manage;manage=function(id){
  _mg(id);
  const s=ST.find(x=>x.id===id),box=document.querySelector('#layer .box');if(!s||!box)return;
  const add=()=>{if(!document.querySelector('#layer .box')||document.getElementById('chmg'))return;const su=chSusp(s.mobile);
    box.insertAdjacentHTML('beforeend',`<div id="chmg" class="card" style="margin-top:12px;${su?'border-left:4px solid var(--bad)':''}"><b>${su?'⛔ Suspended':'Suspension'}</b>
     <div class="sm mut" style="margin:2px 0 8px">${su?`${su.until?'Until '+chWhen(su.until):'Until you lift it'}${su.reason?' · '+esc(su.reason):''}`:'Block the app with a notice and a Support button (e.g. for cheating).'}</div>
     ${su?`<button class="btn sm" onclick="chLift('${esc(s.mobile)}')">✅ Lift suspension</button>`:`<button class="btn ghost sm" style="color:var(--bad)" onclick="chSuspendForm('${esc(s.mobile)}')">⛔ Suspend…</button>`}</div>`)};
  if(CH.ok)add();else chFetch().then(r=>{if(r.ok)add()});
}}
{const s=document.querySelector('.snav');if(s){const t=document.createElement('div');t.innerHTML=navHtml();const n=t.querySelector('.snav');if(n)s.replaceWith(n)}}
;(window.__p=window.__p||{})['admin16']=1;
