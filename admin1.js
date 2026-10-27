
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CFG=window.CBT_CONFIG||{};
const API=String(CFG.SUPABASE_URL||'').replace(/\/$/,'');
const cloud=!!(API&&CFG.SUPABASE_KEY);
const SUN='<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg class="i" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
const CHEV='<svg class="i chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
const FOLDER='<svg class="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>';
function updTheme(){$('#thm').innerHTML=document.documentElement.dataset.theme==='dark'?SUN:MOON}
function toggleTheme(){const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('cbt_theme',JSON.stringify(t))}catch(e){}updTheme()}
updTheme();
if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='lib/pdfjs-3.11.174/pdf.worker.min.js';

function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2800)}
function modal(h,wide){$('#layer').innerHTML=`<div class="modal" onclick="if(event.target===this)closeModal()"><div class="box${wide?' wide':''}">${h}</div></div>`}
function closeModal(){$('#layer').innerHTML=''}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);toast('Copied')}
  catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Copied')}catch(_){toast('Copy failed')}ta.remove()}
}
function ago(ms){
  if(!ms)return 'never';
  const s=Math.floor((Date.now()-ms)/1000);
  if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+' min ago';if(s<86400)return Math.floor(s/3600)+' h ago';
  return Math.floor(s/86400)+' d ago';
}
const siteUrl=()=>location.href.replace(/[#?].*$/,'').replace(/[^/]*\.html$/,'');

/* ---------- api ---------- */
let PW='';try{PW=sessionStorage.getItem('adm_pw')||''}catch(e){}
async function A(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:'server'};
    const j=await r.json();
    if(!j.ok&&['invalid','locked','not_set','need_2fa','signed_out','expired'].includes(j.error))gate(j.error);
    return j;
  }catch(e){toast('No internet connection');return{ok:false,error:'network'}}
}

/* ---------- gate ---------- */
function gate(err){
  $('#gear').style.display='none';closeModal();
  if(!cloud){$('#root').innerHTML=`<div class="card empty"><b>Not connected.</b><p class="sm">Fill in config.js with your Supabase URL and key.</p></div>`;return}
  const msg=err==='invalid'?'Wrong password.':err==='locked'?'Too many wrong attempts. Try again in 15 minutes.':err==='otp_required'?'Enter the 6-digit code from your authenticator app.':err==='otp_invalid'?'Wrong code. Use the newest code in the app.':err==='otp_locked'?'Too many wrong codes. Try again in 15 minutes.':err==='need_2fa'||err==='signed_out'||err==='expired'?'Please sign in again.':'';
  const otp=['otp_required','otp_invalid','otp_locked'].includes(err);
  $('#root').innerHTML=`<div class="card login" style="max-width:400px;margin:6vh auto 0"><h2>Admin sign in</h2><p class="mut sm" style="margin:4px 0 0">Enter your admin password.</p>
   ${err==='not_set'?`<div class="banner"><div class="t sm"><b>Admin password is not set yet.</b><br>In Supabase open <b>SQL Editor → New query</b>, type <b>select cbt_private.set_admin_password('your-password');</b> with your own password (min 8 characters), and press Run.</div></div>`:''}
   <label class="l">Password</label><input type="password" id="pw" autocomplete="current-password" onkeydown="if(event.key==='Enter')unlock()">
   <div id="otpw" style="display:${otp?'':'none'}"><label class="l">Code from your authenticator app</label><input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="11" onkeydown="if(event.key==='Enter')unlock()"></div>
   <div class="sm err" style="min-height:22px;margin-top:6px">${msg}</div>
   <button class="btn block" onclick="unlock()">Sign in</button></div>`;
}
async function unlock(){
  const p=$('#pw').value;if(!p)return;
  const o=$('#otp')?$('#otp').value.trim():'';
  // a sign-in session (supabase_v35) when the database has it: needed when two-step sign-in is on
  let l=null;
  try{const q=await fetch(API+'/rest/v1/rpc/cbt_admin_login',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({p_user:'',p_pw:p,p_device:'Backup panel'},o?{p_otp:o}:{}))});l=q.ok?await q.json():null}catch(e){}
  if(l&&!l.ok){gate(l.error);$('#pw').value=p;const f=$(['otp_required','otp_invalid','otp_locked'].includes(l.error)?'#otp':'#pw');if(f)f.focus();return}
  PW=l&&l.ok?l.token:p;
  const r=await A('ping');
  if(r.ok){try{sessionStorage.setItem('adm_pw',PW)}catch(e){}shell()}
}

/* ---------- shell ---------- */
let ST=[],CA={series:[],folders:[],tests:[]},Q=[],EDIT=null,CUR='students',OPEN={},SF={q:'',s:'all',b:'all',o:'new'},RP=[],RF='open';
function shell(){
  $('#gear').style.display='';
  $('#root').innerHTML=`<div class="atabs">
    <button id="tb_overview" onclick="tab('overview')">Overview</button>
    <button id="tb_students" onclick="tab('students')">Students <span class="cnt" id="pc" style="display:none"></span></button>
    <button id="tb_content" onclick="tab('content')">Series &amp; tests</button>
    <button id="tb_create" onclick="tab('create')">Create test</button>
    <button id="tb_results" onclick="tab('results')">Results</button>
    <button id="tb_reports" onclick="tab('reports')">Reports <span class="cnt" id="rc" style="display:none"></span></button></div>
   <div class="pane" id="pn_overview"></div><div class="pane" id="pn_students"></div><div class="pane" id="pn_content"></div><div class="pane" id="pn_create"></div><div class="pane" id="pn_results"></div><div class="pane" id="pn_reports"></div>`;
  buildCreate();
  let t0='overview';try{t0=sessionStorage.getItem('adm_tab')||'overview'}catch(e){}
  if(!['overview','students','content','create','results','reports'].includes(t0))t0='overview';
  tab(t0);
  A('reports').then(r=>{if(r.ok){RP=r.reports;repBadge()}});
}
async function tab(t){
  CUR=t;try{sessionStorage.setItem('adm_tab',t)}catch(e){}
  for(const k of ['overview','students','content','create','results','reports']){$('#tb_'+k).classList.toggle('on',k===t);$('#pn_'+k).classList.toggle('on',k===t)}
  const pn0=$('#pn_'+t);if(pn0&&!pn0.innerHTML.trim()&&t!=='create')pn0.innerHTML=askel();
  if(t==='overview')await loadOverview();
  if(t==='students')await loadStudents();
  if(t==='content')await loadContent();
  if(t==='create'){await loadCatalog();syncSelects()}
  if(t==='results')await loadResults();
  if(t==='reports')await loadReports();
}
let PRAC=new Set();
async function AP(action,data){
  try{const r=await fetch(API+'/rest/v1/rpc/cbt_admin_practice',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    return r.ok?await r.json():{ok:false}}catch(e){return{ok:false}}
}
async function setPrac(id,on){
  const r=await AP('set',{id,on});
  if(r.ok){if(on)PRAC.add(id);else PRAC.delete(id)}
  else if(on)toast('Practice mode needs the v5 SQL update in Supabase');
}
async function loadCatalog(){const r=await A('catalog');if(r.ok){CA={series:r.series,folders:r.folders,tests:r.tests};const p=await AP('list');PRAC=new Set(p.ok?p.ids:[])}return r.ok}

/* ================= STUDENTS ================= */
async function loadStudents(){
  const [r]=await Promise.all([A('students'),loadCatalog()]);
  if(!r.ok)return;ST=r.students;renderStudents();
}
function badge(){
  const n=ST.filter(s=>s.status==='pending').length,e=$('#pc');
  if(e){e.style.display=n?'':'none';e.textContent=n}
}
let SEL=new Set();
const paidSer=()=>CA.series.filter(x=>!x.is_free);
const isPaid=s=>{const p=new Set(paidSer().map(x=>x.id));return (s.access||[]).some(a=>p.has(a))};
// names and mobiles can be missing or empty, so every helper here must cope with that
const nameOf=s=>String(s.name||'').trim()||'Unnamed';
const ini=s=>{const w=nameOf(s).split(/\s+/);return ((w[0]||'?')[0]+(w.length>1?w[w.length-1][0]:'')).toUpperCase()};
const hueOf=s=>{let h=0;for(const c of String(s.id||s.mobile||''))h=(h*31+c.charCodeAt(0))>>>0;return h%360};
const IC={
  students:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5.5 5.5 0 015.5 5.3"/>',
  paid:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  active:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  block:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  dl:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>'
};
const svgI=k=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
function updStats(){const e=$('#sstats');if(e)e.innerHTML=statsHtml();badge()}
function renderStudents(){
  badge();
  SEL=new Set([...SEL].filter(id=>ST.some(s=>s.id===id)));
  const pend=ST.filter(s=>s.status==='pending'),ps=paidSer();
  $('#pn_students').innerHTML=`
   ${pend.length?`<section class="sreq"><div class="h2s" style="margin-top:0">Approval requests <span class="n">${pend.length}</span></div>${pend.map(s=>`<div class="card srow2 reqcard"><div class="av">${esc(ini(s))}</div><div class="grow"><b>${esc(nameOf(s))}</b><span class="sm mut">${esc(s.mobile)} · requested ${ago(s.created)}</span></div>
     <div class="sacts"><button class="btn sm" onclick="approve('${s.id}')">Approve</button><button class="btn ghost sm" onclick="reject('${s.id}')">Reject</button></div></div>`).join('')}</section>`:''}
   <div class="sstats" id="sstats">${statsHtml()}</div>
   <div class="stoolbar">
     <div class="ssearch">${svgI('search')}<input type="search" id="sq" placeholder="Search name or mobile" autocomplete="off" value="${esc(SF.q)}" oninput="SF.q=this.value;drawList()"><kbd title="Press / to search">/</kbd></div>
     <select id="so" class="ssort" onchange="SF.o=this.value;drawList()" aria-label="Sort students"><option value="new">Newest</option><option value="name">Name A–Z</option><option value="seen">Last seen</option><option value="tests">Most tests</option></select>
     <button class="btn ghost sm" onclick="exportStudents()">${svgI('dl')}CSV</button><button class="btn sm" onclick="addModal()">${svgI('plus')}Add student</button></div>
   <div class="seg fseg" id="sseg"></div>
   <div class="srow-tools"><select id="sb" class="sbatch" onchange="SF.b=this.value;drawList()" aria-label="Filter by batch"><option value="all">All batches</option>${ps.map(x=>`<option value="${x.id}">${esc(x.title)} (${ST.filter(s=>(s.access||[]).includes(x.id)).length})</option>`).join('')}</select>
     <button class="btn soft sm" onclick="selAll()">Select all shown</button></div>
   <div id="slist"></div><div id="bulkbar"></div>`;
  $('#sb').value=SF.b;$('#so').value=SF.o;drawList();
}
// press / anywhere on the Students tab to jump to search
document.addEventListener('keydown',e=>{
  if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey||CUR!=='students')return;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)||!$('#sq'))return;
  e.preventDefault();$('#sq').focus();
});
function resetSF(){SF.q='';SF.s='all';SF.b='all';const q=$('#sq');if(q)q.value='';const b=$('#sb');if(b)b.value='all';drawList()}
function selTog(id,on){on?SEL.add(id):SEL.delete(id);drawList()}
function selAll(){const l=shownStudents();const all=l.length&&l.every(s=>SEL.has(s.id));l.forEach(s=>all?SEL.delete(s.id):SEL.add(s.id));drawList()}
async function toggleStuAcc(sid,ser){
  const s=ST.find(x=>x.id===sid);if(!s)return;
  const on=!(s.access||[]).includes(ser);
  const r=await A('grant',{student_id:sid,series_id:ser,on});
  if(r.ok){s.access=on?[...new Set([...(s.access||[]),ser])]:(s.access||[]).filter(x=>x!==ser);toast(on?'Access given to '+s.name:'Access removed');updStats();drawList()}
}
async function bulkAcc(on){
  const ser=$('#bsr').value,ids=[...SEL];let n=0;
  for(const id of ids){
    const r=await A('grant',{student_id:id,series_id:ser,on});
    if(r.ok){const s=ST.find(x=>x.id===id);if(s){s.access=on?[...new Set([...(s.access||[]),ser])]:(s.access||[]).filter(x=>x!==ser);n++}}
  }
  SEL.clear();toast((on?'Access given to ':'Access removed from ')+n+' students');renderStudents();
}
// website link for messages to students: the short link if set, else the full address
const stuLink=()=>/^https:\/\//.test(CFG.SHORT_URL||'')?CFG.SHORT_URL:siteUrl();
/* message sent to a student with their login (WhatsApp shows *text* in bold, _text_ in italics) */
const MSGLINE='━━━━━━━━━━━━━━━━';
function stuMsg({name,title,order,mobile,code,keep}){
  const tg=/^https:\/\/t\.me\//.test(CFG.TG_CHANNEL||'')?CFG.TG_CHANNEL:'';
  const c=code?code.slice(0,4)+'-'+code.slice(4):'';
  return [`Hi *${name}* 👋`,'',
    title?`Your payment for *"${title}"* is verified ✅`:`Your access to *${CFG.SITE_NAME||'the test series'}* is approved ✅`,
    ...(order?[`🧾 Order: *${order}*`]:[]),
    MSGLINE,
    ...(tg?['📢 *Join our Telegram channel*',tg,MSGLINE]:[]),
    '📱 *Open website*',stuLink(),'',
    '🔑 *Login with*',`Mobile: *${mobile}*`,code?`Access code: *${c}*`:keep?'Access code: *your current code*':'Access code: ______',
    MSGLINE,
    title?'🔓 Your series is unlocked. All the best! 💪':'All the best for your preparation! 💪',
    '_Keep your code private. It works on up to 2 phones._'].join('\n');
}
// preview of a WhatsApp message in the admin panel (bold / italics like on the phone)
const msgHtml=m=>esc(m).replace(/\*([^*\n]+)\*/g,'<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g,'$1<i>$2</i>');
function codeMsg(name,mobile,code){return stuMsg({name,mobile,code})}
function showCode(name,mobile,code,title){
  const msg=codeMsg(name,mobile,code);
  window._cm=msg;
  const wa='https://wa.me/'+(mobile.length===10?'91':'')+mobile+'?text='+encodeURIComponent(msg);
  modal(`<h2>${esc(title||'Access code ready')}</h2><div class="sm mut">${esc(name)} · ${esc(mobile)}</div>
   <div class="big-code">${esc(code.slice(0,4)+'-'+code.slice(4))}</div>
   <p class="sm mut" style="margin:0 0 12px">Save or send this code now. For safety it is stored only in scrambled form, so it cannot be shown again. If it is lost, create a new code.</p>
   <div class="row"><a class="btn" style="flex:1;text-decoration:none" href="${wa}" target="_blank" rel="noopener">Send on WhatsApp</a><a class="btn tgsend" style="flex:1;text-decoration:none" href="https://t.me/+${(mobile.length===10?'91':'')+mobile}" target="_blank" rel="noopener" onclick="copyText(window._cm)">Send on Telegram</a></div>
   <button class="btn soft block" style="margin-top:10px" onclick="copyText(window._cm)">📋 Copy message</button>
   <p class="sm mut" style="margin:8px 0 0">Telegram: the message is copied first — paste it in the chat that opens.</p>
   <button class="btn ghost block" style="margin-top:10px" onclick="closeModal()">Done</button>`);
}
async function approve(id){
  const r=await A('student_approve',{id});
  if(!r.ok){toast('Could not approve');return}
  await loadStudents();showCode(r.name,r.mobile,r.code,'Approved ✓');
}
async function reject(id){
  const s=ST.find(x=>x.id===id);if(!s)return;
  if(!confirm(`Reject and remove the request from ${nameOf(s)}?`))return;
  const r=await A('student_delete',{id});if(r.ok){toast('Request removed');loadStudents()}
}
function addModal(){
  modal(`<h2>Add students</h2><div class="seg" style="margin:10px 0"><button id="am1" class="on" onclick="amTab(1)">One student</button><button id="am2" onclick="amTab(2)">Many at once</button></div>
   <div id="amb1"><label class="l">Full name</label><input type="text" id="an" placeholder="Rahul Sharma"><label class="l">Mobile number</label><input type="tel" id="ap" inputmode="numeric" placeholder="10-digit number">
   <div id="aer" class="sm err" style="min-height:22px;margin-top:6px"></div><button class="btn block" onclick="addOne()">Create &amp; get code</button></div>
   <div id="amb2" style="display:none"><label class="l">One student per line: name, mobile</label><textarea id="ab" class="mono" style="min-height:150px" placeholder="Rahul Sharma, 9876543210&#10;Priya Singh, 9123456780"></textarea>
   <button class="btn block" style="margin-top:10px" id="abtn" onclick="addBulk()">Create all &amp; get codes</button><div id="about"></div></div>`,true);
}
function amTab(n){$('#am1').classList.toggle('on',n===1);$('#am2').classList.toggle('on',n===2);$('#amb1').style.display=n===1?'':'none';$('#amb2').style.display=n===2?'':'none'}
async function addOne(){
  const name=$('#an').value.trim(),mobile=$('#ap').value.replace(/\D/g,'').slice(-10);
  const r=await A('student_add',{name,mobile});
  if(!r.ok){$('#aer').textContent=r.error==='exists'?'This mobile number already has an account. Use Manage → New access code.':r.error==='name'?'Please enter a name.':r.error==='mobile'?'Please enter a valid 10-digit mobile number.':'Could not add.';return}
  await loadStudents();showCode(r.name,r.mobile,r.code);
}
async function addBulk(){
  const lines=$('#ab').value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!lines.length)return;
  $('#abtn').disabled=true;const out=[];
  for(let i=0;i<lines.length;i++){
    $('#abtn').textContent=`Creating ${i+1} of ${lines.length}…`;
    const m=lines[i].match(/(\+?\d[\d\s\-]{8,}\d)/);
    if(!m){out.push({line:lines[i],err:'no mobile number found'});continue}
    const mobile=m[1].replace(/\D/g,'').slice(-10);
    const name=lines[i].replace(m[1],'').replace(/^[\s,;:|\-–]+|[\s,;:|\-–]+$/g,'');
    const r=await A('student_add',{name,mobile});
    out.push(r.ok?{name:r.name,mobile:r.mobile,code:r.code}:{line:lines[i],err:r.error==='exists'?'already has an account':'invalid'});
  }
  await loadStudents();
  const good=out.filter(x=>x.code);
  window._bulk=good.map(x=>`${x.name} | ${x.mobile} | ${x.code.slice(0,4)}-${x.code.slice(4)}`).join('\n');
  $('#abtn').style.display='none';
  $('#about').innerHTML=`<p class="sm" style="margin:14px 0 6px"><b>${good.length}</b> created${out.length>good.length?`, <span class="err">${out.length-good.length} skipped</span>`:''}. Copy this list now, the codes cannot be shown again.</p>
   <div class="scroll"><table class="tbl"><tbody>${out.map(x=>x.code?`<tr><td>${esc(x.name)}</td><td>${esc(x.mobile)}</td><td><b>${x.code.slice(0,4)}-${x.code.slice(4)}</b></td></tr>`:`<tr><td colspan="3" class="err">${esc(x.line)}: ${esc(x.err)}</td></tr>`).join('')}</tbody></table></div>
   <button class="btn block" style="margin-top:12px" onclick="copyText(window._bulk)">Copy all codes</button>`;
}
function manage(id){
  const s=ST.find(x=>x.id===id);if(!s)return;
  const paid=CA.series.filter(x=>!x.is_free),blk=s.status==='blocked',joined=s.created?new Date(s.created).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'–';
  modal(`<div class="mhead stuhd"><span class="av ${isPaid(s)?'avp':''}" style="--h:${hueOf(s)}">${esc(ini(s))}</span>
    <div class="grow"><h2>${esc(nameOf(s))}</h2><span class="tg ${blk?'bad':'paid'}">${blk?'BLOCKED':'ACTIVE'}</span></div><button class="iconbtn" onclick="closeModal()" aria-label="Close">${svgI('x')}</button></div>
   <div class="sm mut" style="margin:-6px 0 14px">${esc(s.mobile)} · ${s.devices||0}/${s.max_devices} devices in use · joined ${esc(joined)}</div>
   <div class="h2s">Details</div>
   <div class="g2"><div><label class="l">Name</label><input type="text" id="mn" maxlength="80" value="${esc(s.name)}"></div><div><label class="l">Max devices</label><input type="number" id="md" min="1" max="10" value="${s.max_devices}"></div></div>
   <button class="btn sm" style="margin-top:10px" onclick="saveStudent('${id}')">Save changes</button>
   <div class="h2s">Premium access</div>
   ${paid.length?paid.map(x=>`<label class="chk"><input type="checkbox" ${(s.access||[]).includes(x.id)?'checked':''} onchange="grant('${id}','${x.id}',this.checked)"><span><b>${esc(x.title)}</b> <span class="mut sm">${esc(x.price_label)}</span></span></label>`).join(''):'<p class="mut sm">No paid series yet. Create one in "Series &amp; tests".</p>'}
   <div class="h2s">Account</div>
   <div class="mactions"><button class="btn soft sm" onclick="newCode('${id}')">New access code</button><button class="btn soft sm" onclick="resetDev('${id}')">Reset devices</button>
   <button class="btn warn sm" onclick="blockToggle('${id}',${blk?'false':'true'})">${blk?'Unblock':'Block'}</button><button class="btn danger sm" onclick="delStudent('${id}')">Delete</button></div>`,true);
}
async function saveStudent(id){
  const name=$('#mn').value.trim(),max=Math.min(10,Math.max(1,parseInt($('#md').value,10)||2));
  if(!name)return toast('Enter a name');
  const r=await A('student_update',{id,name,max_devices:max});
  if(r.ok){toast('Saved');await loadStudents()}else toast('Could not save');
}
async function grant(sid,ser,on){
  const r=await A('grant',{student_id:sid,series_id:ser,on});
  const s=ST.find(x=>x.id===sid);
  if(r.ok&&s){s.access=on?[...new Set([...(s.access||[]),ser])]:(s.access||[]).filter(x=>x!==ser);toast(on?'Access given':'Access removed');if($('#slist')){updStats();drawList()}}
}
async function newCode(id){
  const s=ST.find(x=>x.id===id);if(!s)return;
  if(!confirm(`Create a new access code for ${nameOf(s)}? The old code and all their devices will stop working.`))return;
  const r=await A('student_code',{id});if(!r.ok)return;
  await loadStudents();showCode(r.name,r.mobile,r.code,'New access code');
}
async function resetDev(id){const r=await A('student_devices_reset',{id});if(r.ok){toast('Devices reset');await loadStudents();manage(id)}}
async function blockToggle(id,b){const r=await A('student_block',{id,block:b});if(r.ok){toast(b?'Student blocked':'Student unblocked');await loadStudents();manage(id)}}
async function delStudent(id){
  const s=ST.find(x=>x.id===id);if(!s)return;
  if(!confirm(`Delete ${nameOf(s)} permanently? Their results will be deleted too.`))return;
  const r=await A('student_delete',{id});if(r.ok){closeModal();toast('Student deleted');loadStudents()}
}

/* ================= CONTENT ================= */
async function loadContent(){if(await loadCatalog()){await renderContent();const u=await usageHtml();const e=$('#usebox');if(e)e.innerHTML=u}}
function seriesChips(s){
  return `${s.is_free?'<span class="chip ok">FREE</span>':`<span class="chip warn">PAID${s.price_label?' · '+esc(s.price_label):''}</span>`}${s.active?'':'<span class="chip">Hidden</span>'}`;
}
async function renderContent(){
  $('#pn_content').innerHTML=`<div class="row" style="justify-content:space-between;margin-bottom:14px;gap:10px"><div><h2 style="font-size:20px">Series &amp; tests</h2><div class="mut sm">Series → folders → tests. Changes are live for students immediately.</div></div><button class="btn" onclick="seriesModal()">+ New series</button></div>`
   +'<div id="usebox"></div>'+(CA.series.length?CA.series.map(s=>{
      const folders=CA.folders.filter(f=>f.series_id===s.id),tests=CA.tests.filter(t=>t.series_id===s.id),root=tests.filter(t=>!t.folder_id);
      return `<div class="card acc ${OPEN[s.id]?'open':''}" id="acc_${s.id}" style="margin-bottom:12px"><div class="hd" onclick="toggleAcc('${s.id}')">${CHEV}<div class="grow"><b>${esc(s.title)}</b><div class="sm mut">${folders.length} folder${folders.length===1?'':'s'} · ${tests.length} test${tests.length===1?'':'s'}</div></div>${seriesChips(s)}</div>
       <div class="bd"><div class="row"><button class="btn ghost sm" onclick="seriesModal('${s.id}')">Edit series</button><button class="btn ghost sm" onclick="mediaModal('${s.id}')">Cover &amp; files${s.has_cover||(s.files||[]).length?' ✓':''}</button><button class="btn ghost sm" onclick="folderModal('${s.id}')">+ Folder</button><button class="btn sm" onclick="newTestIn('${s.id}')">+ New test</button></div>
       ${folders.map(f=>{const ft=tests.filter(t=>t.folder_id===f.id);return `<div class="fhead">${FOLDER}<span>${esc(f.title)}</span><span class="chip">${ft.length}</span>${f.active?'':'<span class="chip">Hidden</span>'}<span class="sp"></span><button class="btn ghost sm" onclick="folderModal('${s.id}','${f.id}')">Edit</button></div>${ft.map(testArow).join('')||'<div class="sm mut" style="padding:6px 2px">No tests in this folder.</div>'}`}).join('')}
       ${root.length?`<div class="fhead" style="color:var(--mut)">Tests without a folder</div>${root.map(testArow).join('')}`:''}
       ${!folders.length&&!root.length?'<div class="sm mut" style="padding:12px 2px">Nothing here yet. Add a folder or create a test.</div>':''}</div></div>`}).join('')
     :`<div class="card empty">No series yet. Create your first series, for example "NEET Test Series".</div>`);
}
function testArow(t){
  return `<div class="arow"><div class="grow"><b>${esc(t.title)}</b><div class="sm mut">${t.questions} questions · ${t.duration} min · +${t.correct}/−${t.wrong} · ${t.results} attempts</div>
   <div class="chips" style="margin-top:6px">${t.opens_at?`<span class="chip pri">Starts ${new Date(+t.opens_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span>`:''}${t.closes_at?`<span class="chip">Live ends ${new Date(+t.closes_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span>`:''}${t.result_at?`<span class="chip ${+t.result_at>Date.now()?'warn':'ok'}">Result ${new Date(+t.result_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span>`:''}${t.problems?`<span class="chip" style="background:var(--badSoft);color:var(--bad)">${t.problems} need attention</span>`:''}${t.reports?`<span class="chip warn">${t.reports} report${t.reports==1?'':'s'}</span>`:''}</div></div>
   ${t.active?'':'<span class="chip">Hidden</span>'}${t.free_preview?'<span class="chip pri">Free preview</span>':''}
   <button class="btn ghost sm" onclick="analytics('${t.id}')">Analytics</button><button class="btn ghost sm" onclick="testModal('${t.id}')">Details</button><button class="btn soft sm" onclick="editQuestions('${t.id}')">Questions</button></div>`;
}
function toggleAcc(id){OPEN[id]=!OPEN[id];$('#acc_'+id).classList.toggle('open',OPEN[id])}
function seriesModal(id){
  const s=id?CA.series.find(x=>x.id===id):{title:'',description:'',is_free:true,price_label:'',sort_order:0,active:true};
  modal(`<h2>${id?'Edit series':'New series'}</h2>
   <label class="l">Series name</label><input type="text" id="st" value="${esc(s.title)}" placeholder="NEET Test Series 2027">
   <label class="l">Description (optional)</label><textarea id="sd" style="min-height:70px">${esc(s.description)}</textarea>
   <div class="g2"><div><label class="l">Type</label><select id="sf" onchange="$('#spw').style.display=this.value==='0'?'':'none'"><option value="1" ${s.is_free?'selected':''}>Free for everyone</option><option value="0" ${s.is_free?'':'selected'}>Paid (you unlock per student)</option></select></div>
   <div id="spw" style="display:${s.is_free?'none':''}"><label class="l">Price label</label><input type="text" id="sp" value="${esc(s.price_label)}" placeholder="₹499"></div>
   <div><label class="l">Order</label><input type="number" id="so" value="${s.sort_order}"></div></div>
   <label class="chk"><input type="checkbox" id="sa" ${s.active?'checked':''}><span>Visible to students</span></label>
   <div class="row" style="margin-top:12px"><button class="btn" style="flex:1" onclick="saveSeries('${id||''}')">Save</button>${id?`<button class="btn danger" onclick="delSeries('${id}')">Delete</button>`:''}</div>`);
}
async function saveSeries(id){
  const r=await A('series_save',{id:id||null,title:$('#st').value,description:$('#sd').value,is_free:$('#sf').value==='1',price_label:$('#sp').value,sort_order:+$('#so').value||0,active:$('#sa').checked});
  if(!r.ok){toast(r.error==='title'?'Please enter a name':'Could not save');return}
  closeModal();toast('Saved');OPEN[r.id]=true;await loadContent();
}
async function delSeries(id){
  const s=CA.series.find(x=>x.id===id);
  if(!confirm(`Delete "${s.title}" with all its folders and tests? Students' past results are kept, but they will no longer be able to review these tests.`))return;
  const r=await A('series_delete',{id});if(r.ok){closeModal();toast('Series deleted');loadContent()}
}
function folderModal(sid,id){
  const f=id?CA.folders.find(x=>x.id===id):{title:'',sort_order:0,active:true};
  modal(`<h2>${id?'Edit folder':'New folder'}</h2><label class="l">Folder name</label><input type="text" id="ft" value="${esc(f.title)}" placeholder="Day 1">
   <div class="g2"><div><label class="l">Order</label><input type="number" id="fo" value="${f.sort_order}"></div></div>
   <label class="chk"><input type="checkbox" id="fa" ${f.active?'checked':''}><span>Visible to students</span></label>
   <div class="row" style="margin-top:12px"><button class="btn" style="flex:1" onclick="saveFolder('${sid}','${id||''}')">Save</button>${id?`<button class="btn danger" onclick="delFolder('${id}')">Delete</button>`:''}</div>
   ${id?'<p class="sm mut" style="margin:10px 0 0">Deleting a folder keeps its tests; they move to the series itself.</p>':''}`);
}
;(window.__p=window.__p||{})['admin1']=1;
