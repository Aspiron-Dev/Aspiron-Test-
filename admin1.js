
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
if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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
const siteUrl=()=>location.href.replace(/[#?].*$/,'').replace(/admin\.html$/,'');

/* ---------- api ---------- */
let PW='';try{PW=sessionStorage.getItem('adm_pw')||''}catch(e){}
async function A(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:'server'};
    const j=await r.json();
    if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);
    return j;
  }catch(e){toast('No internet connection');return{ok:false,error:'network'}}
}

/* ---------- gate ---------- */
function gate(err){
  $('#gear').style.display='none';closeModal();
  if(!cloud){$('#root').innerHTML=`<div class="card empty"><b>Not connected.</b><p class="sm">Fill in config.js with your Supabase URL and key.</p></div>`;return}
  const msg=err==='invalid'?'Wrong password.':err==='locked'?'Too many wrong attempts. Try again in 15 minutes.':'';
  $('#root').innerHTML=`<div class="card login" style="max-width:400px;margin:6vh auto 0"><h2>Admin sign in</h2><p class="mut sm" style="margin:4px 0 0">Enter your admin password.</p>
   ${err==='not_set'?`<div class="banner"><div class="t sm"><b>Admin password is not set yet.</b><br>In Supabase open <b>SQL Editor → New query</b>, type <b>select cbt_private.set_admin_password('your-password');</b> with your own password (min 8 characters), and press Run.</div></div>`:''}
   <label class="l">Password</label><input type="password" id="pw" autocomplete="current-password" onkeydown="if(event.key==='Enter')unlock()">
   <div class="sm err" style="min-height:22px;margin-top:6px">${msg}</div>
   <button class="btn block" onclick="unlock()">Sign in</button></div>`;
}
async function unlock(){
  PW=$('#pw').value;if(!PW)return;
  const r=await A('ping');
  if(r.ok){try{sessionStorage.setItem('adm_pw',PW)}catch(e){}shell()}
}

/* ---------- shell ---------- */
let ST=[],CA={series:[],folders:[],tests:[]},Q=[],EDIT=null,CUR='students',OPEN={},SF={q:'',s:'all'},RP=[],RF='open';
function shell(){
  $('#gear').style.display='';
  $('#root').innerHTML=`<div class="atabs">
    <button id="tb_students" onclick="tab('students')">Students <span class="cnt" id="pc" style="display:none"></span></button>
    <button id="tb_content" onclick="tab('content')">Series &amp; tests</button>
    <button id="tb_create" onclick="tab('create')">Create test</button>
    <button id="tb_results" onclick="tab('results')">Results</button>
    <button id="tb_reports" onclick="tab('reports')">Reports <span class="cnt" id="rc" style="display:none"></span></button></div>
   <div class="pane" id="pn_students"></div><div class="pane" id="pn_content"></div><div class="pane" id="pn_create"></div><div class="pane" id="pn_results"></div><div class="pane" id="pn_reports"></div>`;
  buildCreate();
  tab('students');
  A('reports').then(r=>{if(r.ok){RP=r.reports;repBadge()}});
}
async function tab(t){
  CUR=t;
  for(const k of ['students','content','create','results','reports']){$('#tb_'+k).classList.toggle('on',k===t);$('#pn_'+k).classList.toggle('on',k===t)}
  if(t==='students')await loadStudents();
  if(t==='content')await loadContent();
  if(t==='create'){await loadCatalog();syncSelects()}
  if(t==='results')await loadResults();
  if(t==='reports')await loadReports();
}
async function loadCatalog(){const r=await A('catalog');if(r.ok)CA={series:r.series,folders:r.folders,tests:r.tests};return r.ok}

/* ================= STUDENTS ================= */
async function loadStudents(){
  const [r]=await Promise.all([A('students'),loadCatalog()]);
  if(!r.ok)return;ST=r.students;renderStudents();
}
function badge(){
  const n=ST.filter(s=>s.status==='pending').length,e=$('#pc');
  if(e){e.style.display=n?'':'none';e.textContent=n}
}
function renderStudents(){
  badge();
  const pend=ST.filter(s=>s.status==='pending');
  const cnt={all:ST.length,approved:ST.filter(s=>s.status==='approved').length,blocked:ST.filter(s=>s.status==='blocked').length};
  $('#pn_students').innerHTML=`
   ${pend.length?`<div class="h2s" style="margin-top:0">Approval requests <span class="n">${pend.length}</span></div>${pend.map(s=>`<div class="card srow reqcard"><div class="av">${esc(s.name[0].toUpperCase())}</div><div class="grow"><b>${esc(s.name)}</b><span class="sm mut">${esc(s.mobile)} · requested ${ago(s.created)}</span></div>
     <button class="btn sm" onclick="approve('${s.id}')">Approve</button><button class="btn ghost sm" onclick="reject('${s.id}')">Reject</button></div>`).join('')}`:''}
   <div class="row" style="margin:${pend.length?'22px':'0'} 0 12px;gap:10px"><div style="flex:1;min-width:180px"><input type="search" id="sq" placeholder="Search name or mobile" value="${esc(SF.q)}" oninput="SF.q=this.value;drawList()"></div>
     <select id="ss" style="max-width:160px" onchange="SF.s=this.value;drawList()"><option value="all">All (${cnt.all})</option><option value="approved">Approved (${cnt.approved})</option><option value="blocked">Blocked (${cnt.blocked})</option></select>
     <button class="btn" onclick="addModal()">+ Add student</button></div>
   <div id="slist"></div>`;
  $('#ss').value=SF.s;drawList();
}
function drawList(){
  const q=SF.q.toLowerCase();
  const l=ST.filter(s=>s.status!=='pending'&&(SF.s==='all'||s.status===SF.s)&&(!q||s.name.toLowerCase().includes(q)||s.mobile.includes(q)));
  $('#slist').innerHTML=l.length?l.map(s=>`<div class="card srow"><div class="av">${esc(s.name[0].toUpperCase())}</div>
    <div class="grow"><b>${esc(s.name)}</b><span class="sm mut">${esc(s.mobile)} · ${s.devices}/${s.max_devices} devices · ${s.attempts} tests · seen ${ago(s.last_seen)}</span></div>
    ${s.status==='blocked'?'<span class="chip" style="background:var(--badSoft);color:var(--bad)">Blocked</span>':'<span class="chip ok">Active</span>'}
    <button class="btn ghost sm" onclick="manage('${s.id}')">Manage</button></div>`).join(''):`<div class="card empty">${ST.length?'No students match.':'No students yet. Add students or share the site link so they can request access.'}</div>`;
}
function codeMsg(name,mobile,code){
  return `Hi ${name}, your access to ${CFG.SITE_NAME||'the test series'} is approved.\n\nWebsite: ${siteUrl()}\nMobile: ${mobile}\nAccess code: ${code}\n\nPlease keep this code private. It works on up to 2 devices.`;
}
function showCode(name,mobile,code,title){
  const msg=codeMsg(name,mobile,code);
  window._cm=msg;
  const wa='https://wa.me/'+(mobile.length===10?'91':'')+mobile+'?text='+encodeURIComponent(msg);
  modal(`<h2>${esc(title||'Access code ready')}</h2><div class="sm mut">${esc(name)} · ${esc(mobile)}</div>
   <div class="big-code">${esc(code.slice(0,4)+'-'+code.slice(4))}</div>
   <p class="sm mut" style="margin:0 0 12px">Save or send this code now. For safety it is stored only in scrambled form, so it cannot be shown again. If it is lost, create a new code.</p>
   <div class="row"><a class="btn" style="flex:1;text-decoration:none" href="${wa}" target="_blank" rel="noopener">Send on WhatsApp</a><button class="btn soft" style="flex:1" onclick="copyText(window._cm)">Copy message</button></div>
   <button class="btn ghost block" style="margin-top:10px" onclick="closeModal()">Done</button>`);
}
async function approve(id){
  const r=await A('student_approve',{id});
  if(!r.ok){toast('Could not approve');return}
  await loadStudents();showCode(r.name,r.mobile,r.code,'Approved ✓');
}
async function reject(id){
  const s=ST.find(x=>x.id===id);if(!confirm(`Reject and remove the request from ${s.name}?`))return;
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
  const paid=CA.series.filter(x=>!x.is_free);
  modal(`<div class="row" style="justify-content:space-between"><h2>${esc(s.name)}</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <div class="sm mut">${esc(s.mobile)} · ${s.status==='blocked'?'Blocked':'Active'} · ${s.devices}/${s.max_devices} devices in use · ${s.attempts} tests taken</div>
   <div class="g2" style="margin-top:6px"><div><label class="l">Name</label><input type="text" id="mn" value="${esc(s.name)}"></div><div><label class="l">Max devices</label><input type="number" id="md" min="1" max="10" value="${s.max_devices}"></div></div>
   <button class="btn sm" style="margin-top:10px" onclick="saveStudent('${id}')">Save changes</button>
   <div class="h2s" style="margin-top:22px">Premium access</div>
   ${paid.length?paid.map(x=>`<label class="chk"><input type="checkbox" ${s.access.includes(x.id)?'checked':''} onchange="grant('${id}','${x.id}',this.checked)"><span><b>${esc(x.title)}</b> <span class="mut sm">${esc(x.price_label)}</span></span></label>`).join(''):'<p class="mut sm">No paid series yet. Create one in "Series &amp; tests".</p>'}
   <div class="h2s" style="margin-top:22px">Account</div>
   <div class="row"><button class="btn soft sm" onclick="newCode('${id}')">New access code</button><button class="btn soft sm" onclick="resetDev('${id}')">Reset devices</button>
   <button class="btn warn sm" onclick="blockToggle('${id}',${s.status==='blocked'?'false':'true'})">${s.status==='blocked'?'Unblock':'Block'}</button><button class="btn danger sm" onclick="delStudent('${id}')">Delete</button></div>`,true);
}
async function saveStudent(id){
  const r=await A('student_update',{id,name:$('#mn').value,max_devices:+$('#md').value||2});
  if(r.ok){toast('Saved');await loadStudents()}
}
async function grant(sid,ser,on){
  const r=await A('grant',{student_id:sid,series_id:ser,on});
  const s=ST.find(x=>x.id===sid);
  if(r.ok&&s){s.access=on?[...new Set([...s.access,ser])]:s.access.filter(x=>x!==ser);toast(on?'Access given':'Access removed')}
}
async function newCode(id){
  const s=ST.find(x=>x.id===id);
  if(!confirm(`Create a new access code for ${s.name}? The old code and all their devices will stop working.`))return;
  const r=await A('student_code',{id});if(!r.ok)return;
  await loadStudents();showCode(r.name,r.mobile,r.code,'New access code');
}
async function resetDev(id){const r=await A('student_devices_reset',{id});if(r.ok){toast('Devices reset');await loadStudents();manage(id)}}
async function blockToggle(id,b){const r=await A('student_block',{id,block:b});if(r.ok){toast(b?'Student blocked':'Student unblocked');await loadStudents();manage(id)}}
async function delStudent(id){
  const s=ST.find(x=>x.id===id);
  if(!confirm(`Delete ${s.name} permanently? Their results will be deleted too.`))return;
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
   <div class="chips" style="margin-top:6px">${t.opens_at?`<span class="chip pri">Starts ${new Date(+t.opens_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span>`:''}${t.problems?`<span class="chip" style="background:var(--badSoft);color:var(--bad)">${t.problems} need attention</span>`:''}${t.reports?`<span class="chip warn">${t.reports} report${t.reports==1?'':'s'}</span>`:''}</div></div>
   ${t.active?'':'<span class="chip">Hidden</span>'}${t.free_preview?'<span class="chip pri">Free preview</span>':''}
   <button class="btn ghost sm" onclick="testModal('${t.id}')">Details</button><button class="btn soft sm" onclick="editQuestions('${t.id}')">Questions</button></div>`;
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
async function saveFolder(sid,id){
  const r=await A('folder_save',{id:id||null,series_id:sid,title:$('#ft').value,sort_order:+$('#fo').value||0,active:$('#fa').checked});
  if(!r.ok){toast(r.error==='title'?'Please enter a name':'Could not save');return}
  closeModal();toast('Saved');OPEN[sid]=true;await loadContent();
}
async function delFolder(id){
  if(!confirm('Delete this folder? Its tests will stay in the series.'))return;
  const r=await A('folder_delete',{id});if(r.ok){closeModal();toast('Folder deleted');loadContent()}
}
function folderOpts(sid,sel){
  return '<option value="">No folder</option>'+CA.folders.filter(f=>f.series_id===sid).map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.title)}</option>`).join('');
}
function testModal(id){
  const t=CA.tests.find(x=>x.id===id);
  modal(`<h2>Test details</h2>
   <label class="l">Test name</label><input type="text" id="tt" value="${esc(t.title)}">
   <div class="g2"><div><label class="l">Series</label><select id="ts" onchange="$('#tfl').innerHTML=CA.folders.filter(f=>f.series_id===this.value).map(f=>'<option value=&quot;'+esc(f.title)+'&quot;>').join('')">${CA.series.map(s=>`<option value="${s.id}" ${s.id===t.series_id?'selected':''}>${esc(s.title)}</option>`).join('')}</select></div>
   <div><label class="l">Folder (type or pick)</label><input type="text" id="tf" list="tfl" value="${esc((CA.folders.find(f=>f.id===t.folder_id)||{}).title||'')}" autocomplete="off"><datalist id="tfl">${CA.folders.filter(f=>f.series_id===t.series_id).map(f=>`<option value="${esc(f.title)}">`).join('')}</datalist></div>
   <div><label class="l">Minutes</label><input type="number" id="td" value="${t.duration}"></div><div><label class="l">Order</label><input type="number" id="to" value="${t.sort_order}"></div>
   <div><label class="l">Marks per correct</label><input type="number" step="0.25" id="tc" value="${t.correct}"></div><div><label class="l">Negative marks</label><input type="number" step="0.25" id="tw" value="${t.wrong}"></div></div>
   <label class="l">Test starts at (empty = open now)</label><input type="datetime-local" id="tos" value="${toLocal(t.opens_at)}">
   <label class="chk"><input type="checkbox" id="tl" ${t.lock_back?'checked':''}><span>Don't allow going back to previous questions</span></label>
   <label class="chk"><input type="checkbox" id="tp" ${t.free_preview?'checked':''}><span>Free preview (open even if the series is paid)</span></label>
   <label class="chk"><input type="checkbox" id="ta" ${t.active?'checked':''}><span>Visible to students</span></label>
   <div class="row" style="margin-top:12px"><button class="btn" style="flex:1" onclick="saveTestMeta('${id}')">Save</button><button class="btn danger" onclick="delTest('${id}')">Delete</button></div>
   <p class="sm mut" style="margin:10px 0 0">${t.results} past attempt${t.results===1?'':'s'}. To change the questions, use the "Questions" button.</p>`,true);
}
async function saveTestMeta(id){
  let fid=null;
  try{fid=await resolveFolder($('#ts').value,$('#tf').value)}catch(e){return toast(e.message)}
  const r=await A('test_save',{id,series_id:$('#ts').value,folder_id:fid,opens_at:fromLocal($('#tos').value),title:$('#tt').value,duration:+$('#td').value,correct:+$('#tc').value,wrong:+$('#tw').value,
    sort_order:+$('#to').value||0,lock_back:$('#tl').checked,free_preview:$('#tp').checked,active:$('#ta').checked});
  if(!r.ok){toast(r.error==='title'?'Please enter a name':'Could not save');return}
  closeModal();toast('Saved');await loadContent();
}
;(window.__p=window.__p||{})['admin1']=1;
