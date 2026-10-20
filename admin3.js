function secSum(){const e=$('#ssum');if(e)e.textContent=`Total ${S.reduce((a,x)=>a+(+x.count||0),0)} of ${Q.length} questions`}
function presetSec(k){S=k==='neet'?[{name:'Physics',count:45},{name:'Chemistry',count:45},{name:'Botany',count:45},{name:'Zoology',count:45}]:[{name:'Physics',count:30},{name:'Chemistry',count:30},{name:'Mathematics',count:30}];renderSecs()}
function addSec(){S.push({name:'',count:0});renderSecs()}
function clearSec(){S=[];Q.forEach(q=>q.sec='');renderSecs();render()}
function applySec(){
  if(!Q.length)return toast('Build the questions first');
  let i=0;
  for(const s of S){const n=Math.max(0,+s.count||0);for(let k=0;k<n&&i<Q.length;k++)Q[i++].sec=(s.name||'').trim()}
  if(i<Q.length){const last=S.length?(S[S.length-1].name||'').trim():'';for(;i<Q.length;i++)Q[i].sec=last}
  toast('Sections applied');render();
}

/* ---- question list ---- */
function problems(q){
  const p=[];
  if(q.gap&&!q.q&&!q.img)p.push('Question missing in the file');
  else if(!q.q.trim()&&!q.img)p.push('Question text is empty');
  q.options.forEach((o,j)=>{if(!o.trim()&&!q.oimg[j])p.push('Option '+'ABCD'[j]+' is empty')});
  if(q.answer==null)p.push('No correct answer set');
  return p;
}
const bad=q=>problems(q).length>0;
function summary(){
  const bl=[];Q.forEach((q,i)=>{if(bad(q))bl.push(i)});
  $('#sum').innerHTML=`${Q.length} questions · ${bl.length?`<span class="err">${bl.length} need attention</span>`:'<span class="okc">all look complete</span>'}`;
  $('#probs').innerHTML=bl.length?`<div class="card" style="border-color:var(--bad)"><div class="row" style="justify-content:space-between"><b>Questions with problems</b>
    <label class="chk" style="padding:0"><input type="checkbox" ${V.only?'checked':''} onchange="V.only=this.checked;V.page=0;render()"><span class="sm">Show only these</span></label></div>
    <div class="plist">${bl.map(i=>`<button class="pchip" onclick="jumpQ(${i})" title="${esc(problems(Q[i]).join(', '))}">Q${i+1}<small>${esc(problems(Q[i])[0].replace('Question ','').replace('is empty','empty').replace('No correct answer set','no answer'))}</small></button>`).join('')}</div></div>`:'';
}
function visible(){const a=[];Q.forEach((q,i)=>{if(!V.only||bad(q))a.push(i)});return a}
function cardHtml(i){
  const q=Q[i],pr=problems(q),names=S.map(s=>s.name||'General');
  return `<div class="card qed ${pr.length?'miss':''}" id="qc${i}" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><b>Question ${i+1}</b>
    <span class="row" style="gap:6px">${pr.map(p=>`<span class="chip" style="background:var(--badSoft);color:var(--bad)">${esc(p)}</span>`).join('')}<button class="btn danger sm" onclick="delQ(${i})">Delete</button></span></div>
    <textarea oninput="Q[${i}].q=this.value;touch(${i})" style="margin-top:8px">${esc(q.q)}</textarea>${imgCtl(i,'q','Add diagram')}
    ${q.options.map((o,j)=>`<label class="l">Option ${'ABCD'[j]}</label><input type="text" value="${esc(o)}" oninput="Q[${i}].options[${j}]=this.value;touch(${i})">${imgCtl(i,j,'Option image')}`).join('')}
    <div class="g2"><div><label class="l">Correct answer</label><select onchange="Q[${i}].answer=this.value===''?null:+this.value;touch(${i})"><option value="">Select…</option>${[0,1,2,3].map(j=>`<option value="${j}" ${q.answer===j?'selected':''}>${'ABCD'[j]}</option>`).join('')}</select></div>
    ${names.length?`<div><label class="l">Section</label><select onchange="Q[${i}].sec=this.value">${['',...names].map(n=>`<option value="${esc(n)}" ${(q.sec||'')===n?'selected':''}>${n||'—'}</option>`).join('')}</select></div>`:''}</div>
    <label class="l">Explanation (optional)</label><input type="text" value="${esc(q.explanation)}" oninput="Q[${i}].explanation=this.value">${imgCtl(i,'e','Explanation image')}</div>`;
}
function redrawCard(i){const e=$('#qc'+i);if(e){const t=document.createElement('div');t.innerHTML=cardHtml(i);e.replaceWith(t.firstElementChild)}summary()}
function touch(i){
  const e=$('#qc'+i);if(!e)return;const pr=problems(Q[i]);e.classList.toggle('miss',pr.length>0);
  const tags=e.querySelector('.row .row');if(tags){const btn=tags.querySelector('button');tags.innerHTML=pr.map(p=>`<span class="chip" style="background:var(--badSoft);color:var(--bad)">${esc(p)}</span>`).join('');tags.appendChild(btn)}
  summary();
}
function render(){
  summary();
  const vis=visible(),pages=Math.max(1,Math.ceil(vis.length/PAGE));if(V.page>=pages)V.page=pages-1;
  const sl=vis.slice(V.page*PAGE,V.page*PAGE+PAGE);
  const nav=pages>1?`<div class="row pnav" style="justify-content:center;margin:10px 0"><button class="btn ghost sm" ${V.page?'':'disabled'} onclick="V.page--;render();window.scrollTo(0,$('#sum').offsetTop)">‹ Prev</button><span class="sm">Page ${V.page+1} of ${pages} · ${vis.length} questions</span><button class="btn ghost sm" ${V.page<pages-1?'':'disabled'} onclick="V.page++;render();window.scrollTo(0,$('#sum').offsetTop)">Next ›</button></div>`:'';
  $('#list').innerHTML=nav+sl.map(cardHtml).join('')+nav+`<button class="btn soft" onclick="addQ()">+ Add a question</button>`;
  $('#outbox').style.display=Q.length?'block':'none';
}
function jumpQ(i){
  if(V.only){V.page=Math.floor(visible().indexOf(i)/PAGE)}else V.page=Math.floor(i/PAGE);
  render();const e=$('#qc'+i);if(e){e.scrollIntoView({behavior:'smooth',block:'start'});e.classList.add('flash');setTimeout(()=>e.classList.remove('flash'),2000)}
}
function delQ(i){if(!confirm('Delete question '+(i+1)+'?'))return;Q.splice(i,1);render()}
function addQ(){Q.push(emptyQ());V.only=false;V.page=Math.floor((Q.length-1)/PAGE);render()}

/* ---- publish (in small parts, so large tests with images work) ---- */
const rnd=()=>Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b=>b.toString(16).padStart(2,'0')).join('');
const outQ=q=>({q:q.q,options:q.options,answer:q.answer,explanation:q.explanation,sec:q.sec||'',img:q.img||null,oimg:q.oimg,eimg:q.eimg||null});
async function publish(){
  if(!Q.length)return toast('No questions yet');
  const title=$('#title').value.trim(),sid=$('#ps').value;
  if(!title)return toast('Please enter a test name');
  if(!sid)return toast('Please choose a series');
  const n=Q.filter(bad).length;
  if(n&&!confirm(`${n} question(s) have problems (missing answer or option). Publish anyway?`))return;
  const lw=liveCheck(fromLocal($('#opens').value),fromLocal($('#closes').value),fromLocal($('#resat').value),+$('#dur').value||180,$('#prac').checked);
  if(lw===null)return;if(lw)return toast(lw);
  const b=$('#pubbtn'),st=$('#pubst');b.disabled=true;b.textContent='Publishing…';
  try{
    const fid=await resolveFolder(sid,$('#pf').value);
    const token=rnd();let batch=[],size=0,part=0;
    let sent=0;
    const flush=async()=>{if(!batch.length)return;
      const r=await A('test_stage',{token,n:part,questions:batch});if(!r.ok)throw new Error('upload failed ('+(r.error||'')+')');part++;sent+=batch.length;st.textContent=`Uploading… ${sent} of ${Q.length}`;batch=[];size=0};
    for(const q of Q){const o=outQ(q),len=JSON.stringify(o).length;if(batch.length&&(size+len>450000||batch.length>=40))await flush();batch.push(o);size+=len}
    await flush();
    const m=EDIT&&EDIT.meta||{};
    const r=await A('test_save',{id:EDIT?EDIT.id:null,series_id:sid,folder_id:fid,title,duration:+$('#dur').value||180,correct:+$('#pm').value,wrong:+$('#nm').value,
      lock_back:$('#lock').checked,free_preview:$('#prev').checked,active:m.active!==false,sort_order:m.sort_order||0,opens_at:fromLocal($('#opens').value),closes_at:fromLocal($('#closes').value),result_at:fromLocal($('#resat').value),stage_token:token,count:Q.length});
    if(!r.ok)throw new Error(r.error==='incomplete'?'upload was incomplete, please try again':r.error==='questions'?'add at least one question':r.error==='result_before_close'?'result time must be after the live end time':(r.detail||r.error));
    await setPrac(r.id,$('#prac').checked);
    EDIT={id:r.id,meta:m};st.textContent='';
    $('#editbar').innerHTML=`<div class="banner"><div class="t"><b>Published ✓</b><div class="sm mut">"${esc(title)}" is live${$('#opens').value?' and will open at the time you set':''}. You can keep editing and press Update.</div></div></div>`;
    $('#pubbtn').textContent='Update test';toast('Published ✓');
    await loadCatalog();syncSelects();$('#ps').value=sid;onSeries();
  }catch(err){toast('Could not publish: '+err.message);st.textContent='Failed: '+err.message}
  finally{b.disabled=false;b.textContent=EDIT?'Update test':'Publish test'}
}
async function editQuestions(id,qi){
  const r=await A('test_get',{id});if(!r.ok||!r.test)return toast('Could not load the test');
  const t=r.test;
  Q=(t.data||[]).map(normQ);S=deriveSections();RAWIMG=[];PDFBUF=null;V={only:false,page:0};
  EDIT={id:t.id,meta:{active:t.active,sort_order:t.sort_order}};
  await tab('create');
  $('#title').value=t.title;$('#dur').value=t.duration;$('#pm').value=t.correct_marks;$('#nm').value=t.wrong_marks;$('#lock').checked=!!t.lock_back;$('#prev').checked=!!t.free_preview;$('#prac').checked=PRAC.has(t.id);$('#opens').value=toLocal(t.opens_at);$('#closes').value=toLocal(t.closes_at);$('#resat').value=toLocal(t.result_at);
  $('#ps').value=t.series_id;onSeries();const f=CA.folders.find(x=>x.id===t.folder_id);$('#pf').value=f?f.title:'';
  $('#editbar').innerHTML=`<div class="banner"><div class="t"><b>Editing: ${esc(t.title)}</b><div class="sm mut">Change anything below, then press Update test at the bottom.</div></div><button class="btn ghost sm" onclick="newTest()">Cancel</button></div>`;
  $('#pubbtn').textContent='Update test';render();renderSecs();
  if(qi!=null)jumpQ(qi);else window.scrollTo(0,0);
}

/* ================= RESULTS ================= */
let RS=[];
async function loadResults(){
  $('#pn_results').innerHTML='<div class="card empty">Loading results…</div>';
  const [r]=await Promise.all([A('results',{}),loadCatalog()]);if(!r.ok)return;
  RS=r.results;
  const titles=[...new Set(RS.map(x=>x.title))];
  $('#pn_results').innerHTML=`<div class="row" style="margin-bottom:12px;gap:10px"><input type="search" id="rq" placeholder="Search student or mobile" style="flex:1;min-width:170px" oninput="drawRes()">
   <select id="rt" style="max-width:240px" onchange="drawRes()"><option value="">All tests</option>${titles.map(t=>`<option>${esc(t)}</option>`).join('')}</select><button class="btn soft" onclick="csv()">Export CSV</button></div><div id="rtb"></div>`;
  drawRes();
}
function resFiltered(){
  const q=($('#rq').value||'').toLowerCase(),t=$('#rt').value;
  return RS.filter(x=>(!t||x.title===t)&&(!q||x.student.toLowerCase().includes(q)||x.mobile.includes(q)));
}
function drawRes(){
  const f=resFiltered();
  $('#rtb').innerHTML=f.length?`<div class="card scroll" style="padding:0"><table class="tbl"><thead><tr><th>Student</th><th>Mobile</th><th>Test</th><th>Score</th><th>%</th><th>✓</th><th>✗</th><th>Skipped</th><th>Time</th><th>Date</th><th></th></tr></thead><tbody>${f.map(x=>`<tr><td><b>${esc(x.student)}</b></td><td>${esc(x.mobile)}</td><td>${esc(x.title)}</td><td>${x.score}/${x.max}</td><td>${x.max?Math.max(0,Math.round(x.score*100/x.max)):0}%</td><td>${x.correct}</td><td>${x.wrong}</td><td>${x.skipped}</td><td>${Math.round(x.used/60)} min${x.late?' (late)':''}</td><td>${new Date(x.at).toLocaleString('en-IN')}</td><td><button class="btn ghost sm" onclick="delRes('${x.id}')">✕</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="card empty">No results yet.</div>';
}
async function delRes(id){
  if(!confirm('Delete this result? The student will be able to attempt the test again with a fresh score.'))return;
  const r=await A('result_delete',{id});if(r.ok){RS=RS.filter(x=>x.id!==id);drawRes();toast('Deleted')}
}
function csv(){
  const f=resFiltered(),q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const lines=[['Name','Mobile','Test','Score','Max','Correct','Wrong','Skipped','Time(sec)','Late','Date'].map(q).join(',')].concat(f.map(x=>[x.student,x.mobile,x.title,x.score,x.max,x.correct,x.wrong,x.skipped,x.used,x.late?'yes':'',new Date(x.at).toLocaleString('en-IN')].map(q).join(',')));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+lines.join('\n')],{type:'text/csv'}));a.download='results.csv';document.body.appendChild(a);a.click();a.remove();
}

/* ================= COVER & FILES ================= */
function mediaModal(sid){
  const s=CA.series.find(x=>x.id===sid);if(!s)return;
  modal(`<div class="row" style="justify-content:space-between"><h2>${esc(s.title)}</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>
   <div class="h2s" style="margin-top:14px">Cover photo</div>
   <p class="sm mut" style="margin:0 0 8px">Shown on the series card for students. A wide photo works best. It is compressed automatically.</p>
   <div class="row"><label class="btn soft" style="cursor:pointer">📷 ${s.has_cover?'Change photo':'Upload photo'}<input type="file" accept="image/*" style="display:none" onchange="uploadCover('${sid}',this)"></label>${s.has_cover?`<button class="btn ghost" onclick="removeCover('${sid}')">Remove</button><span class="chip ok">Cover set</span>`:''}</div>
   <div class="h2s" style="margin-top:22px">Syllabus / schedule files</div>
   <p class="sm mut" style="margin:0 0 8px">Upload a PDF or image (up to 6 MB). Students can open it from the series page.</p>
   ${(s.files||[]).map(f=>`<div class="arow"><div class="grow"><b>${esc(f.title)}</b><div class="sm mut">${esc(f.kind)} · ${(f.size/1024).toFixed(0)} KB</div></div><button class="btn danger sm" onclick="delFile('${sid}','${f.id}')">Delete</button></div>`).join('')}
   <label class="l">File name shown to students</label><input type="text" id="fti" placeholder="e.g. Full syllabus">
   <label class="l">Type</label><select id="fk"><option value="syllabus">Syllabus</option><option value="schedule">Schedule</option><option value="notes">Notes</option></select>
   <input type="file" id="ffile" accept="application/pdf,image/*" style="margin-top:10px"><div class="sm" id="fst" style="min-height:22px;margin-top:6px"></div>
   <button class="btn block" onclick="uploadFile('${sid}')">Upload file</button>`,true);
}
async function uploadCover(sid,inp){
  const f=inp.files[0];if(!f)return;
  try{
    const d=await compressDataUrl(await fileToUrl(f),900,.78);if(!d)throw new Error('image');
    const r=await A('series_cover',{id:sid,cover:d});if(!r.ok)throw new Error(r.error);
    toast('Cover saved');await loadCatalog();renderContent();mediaModal(sid);
  }catch(e){toast('Could not save the photo')}
}
async function removeCover(sid){const r=await A('series_cover',{id:sid,cover:''});if(r.ok){toast('Cover removed');await loadCatalog();renderContent();mediaModal(sid)}}
async function delFile(sid,id){
  if(!confirm('Delete this file?'))return;
  const r=await A('file_delete',{id});if(r.ok){await loadCatalog();renderContent();mediaModal(sid)}
}
async function uploadFile(sid){
  const f=$('#ffile').files[0],st=$('#fst');
  if(!f){st.textContent='Please choose a file.';return}
  if(f.size>6*1024*1024){st.textContent='This file is larger than 6 MB. Please compress it first.';return}
  const mime=f.type==='application/pdf'?'application/pdf':/^image\/(jpeg|png|webp)$/.test(f.type)?f.type:'';
  if(!mime){st.textContent='Only PDF, JPG, PNG or WebP files are allowed.';return}
  try{
    const b64=(await fileToUrl(f)).split(',')[1],CH=300000,n=Math.ceil(b64.length/CH);let id=null;
    for(let k=0;k<n;k++){
      st.textContent=`Uploading… ${Math.round(k*100/n)}%`;
      const r=await A('file_put',{id,series_id:sid,title:$('#fti').value||f.name.replace(/\.[a-z0-9]+$/i,''),kind:$('#fk').value,name:f.name,mime,size:f.size,n:k,data:b64.slice(k*CH,(k+1)*CH),last:k===n-1});
      if(!r.ok)throw new Error(r.error==='too_big'?'file too big':r.error);
      id=r.id;
    }
    toast('File uploaded');await loadCatalog();renderContent();mediaModal(sid);
  }catch(e){st.textContent='Upload failed: '+e.message}
}

/* ================= REPORTS ================= */
const RK={wrong_answer:'Answer looks wrong',wrong_question:'Question wrong / unclear',missing_option:'Option missing / incorrect',bad_image:'Image problem',other:'Other'};
function repBadge(){const n=RP.filter(x=>x.status==='open').length,e=$('#rc');if(e){e.style.display=n?'':'none';e.textContent=n}}
async function loadReports(){
  $('#pn_reports').innerHTML='<div class="card empty">Loading…</div>';
  const [r,b]=await Promise.all([A('reports'),A('bookmark_stats')]);if(!r.ok)return;
  RP=r.reports;repBadge();window.BMS=b.ok?b.items:[];drawReports();
}
function drawReports(){
  const l=RP.filter(x=>RF==='all'||x.status===RF);
  $('#pn_reports').innerHTML=`<div class="row" style="justify-content:space-between;margin-bottom:12px"><div><h2 style="font-size:20px">Student reports</h2><div class="mut sm">Problems students found in questions or answers.</div></div>
   <select id="rfs" style="max-width:170px" onchange="RF=this.value;drawReports()"><option value="open" ${RF==='open'?'selected':''}>Open (${RP.filter(x=>x.status==='open').length})</option><option value="resolved" ${RF==='resolved'?'selected':''}>Resolved</option><option value="rejected" ${RF==='rejected'?'selected':''}>Rejected</option><option value="all" ${RF==='all'?'selected':''}>All (${RP.length})</option></select></div>
   ${l.length?l.map(x=>`<div class="card" style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><b>${esc(x.title)} · Q${(+x.qidx||0)+1}</b><span class="chip ${x.status==='open'?'warn':x.status==='resolved'?'ok':''}">${esc(x.status)}</span></div>
     <div class="sm mut" style="margin:4px 0">${esc(x.student)} (${esc(x.mobile)}) · ${ago(x.at)} · <b style="color:var(--tx)">${esc(RK[x.kind]||x.kind)}</b></div>
     ${x.note?`<div class="exp" style="margin:6px 0">${esc(x.note)}</div>`:''}
     <div class="sm" style="margin:6px 0;white-space:pre-wrap">${esc(x.q)||'<i>(question has no text)</i>'}</div><div class="sm mut">Current answer key: <b>${x.answer==null?'not set':'ABCD'[x.answer]}</b></div>
     <div class="row" style="margin-top:10px">${x.test_id?`<button class="btn soft sm" onclick="editQuestions(${esc(JSON.stringify(String(x.test_id)))},${+x.qidx||0})">Open question</button>`:''}
     ${x.status!=='resolved'?`<button class="btn sm" onclick="repSet('${x.id}','resolved')">Mark resolved</button>`:''}${x.status==='open'?`<button class="btn ghost sm" onclick="repSet('${x.id}','rejected')">Reject</button>`:''}<button class="btn ghost sm" onclick="repDel('${x.id}')">Delete</button></div></div>`).join('')
   :'<div class="card empty">No reports here.</div>'}
   <div class="h2s">Most bookmarked questions</div>
   ${(window.BMS||[]).length?`<div class="card">${BMS.map(x=>`<div class="rrow" style="padding:6px 0"><div class="chip pri" style="min-width:34px;justify-content:center">${x.count}★</div><div class="grow"><b>${esc(x.title)} · Q${(+x.qidx||0)+1}</b><span class="sm mut" style="white-space:normal">${esc(x.q)||'(image question)'}</span><span class="sm mut">${esc((x.students||[]).join(', '))}</span></div>${x.test_id?`<button class="btn ghost sm" onclick="editQuestions(${esc(JSON.stringify(String(x.test_id)))},${+x.qidx||0})">Open</button>`:''}</div>`).join('')}</div>`:'<div class="card empty">Nobody has bookmarked a question yet.</div>'}`;
}
async function repSet(id,status){const r=await A('report_status',{id,status});if(r.ok){const x=RP.find(y=>y.id===id);if(x)x.status=status;repBadge();drawReports()}}
async function repDel(id){if(!confirm('Delete this report?'))return;const r=await A('report_delete',{id});if(r.ok){RP=RP.filter(y=>y.id!==id);repBadge();drawReports()}}

/* ================= STORAGE METER ================= */
const mb=b=>b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toFixed(b>10485760?0:1)+' MB';
async function usageHtml(){
  const u=await A('usage');if(!u.ok)return '';
  const p=Math.min(100,Math.round(u.db_bytes*100/u.limit_bytes)),col=p>=85?'var(--bad)':p>=65?'var(--warn)':'var(--ok)';
  return `<div class="card" style="margin-bottom:14px"><div class="row" style="justify-content:space-between"><b>Storage used</b><span class="sm mut">${mb(u.db_bytes)} of 500 MB free limit</span></div>
   <div class="bar" style="margin:8px 0"><i style="width:${p}%;background:${col}"></i></div>
   <div class="sm mut">Tests ≈ ${mb(u.tests_bytes)} · Files ≈ ${mb(u.files_bytes)} · Covers ≈ ${mb(u.covers_bytes)} · Results ≈ ${mb(u.results_bytes)}<br>${u.students} students · ${u.tests} tests · ${u.results} results</div>
   ${p>=65?`<div class="sm" style="margin-top:8px;color:${col}"><b>Getting full.</b> Download Results CSV, then delete old results or tests you no longer need.</div>`:''}</div>`;
}

/* ================= SETTINGS ================= */
async function settings(){
  const us=await usageHtml();
  modal(`<div class="row" style="justify-content:space-between"><h2>Settings</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">✕</button></div>${us}
   <label class="l">Student website link</label><div class="row"><input type="text" readonly value="${esc(siteUrl())}" style="flex:1" onclick="this.select()"><button class="btn soft sm" onclick="copyText('${esc(siteUrl())}')">Copy</button></div>
   <div class="h2s" style="margin-top:22px">Change admin password</div>
   <label class="l">New password (min 8 characters)</label><input type="password" id="np" autocomplete="new-password">
   <div id="ner" class="sm err" style="min-height:22px;margin-top:6px"></div>
   <button class="btn block" onclick="changePw()">Change password</button>
   <button class="btn ghost block" style="margin-top:14px" onclick="signOutAdmin()">Sign out</button>`,true);
}
async function changePw(){
  const np=$('#np').value;if(np.length<8){$('#ner').textContent='Password must be at least 8 characters.';return}
  const r=await A('set_password',{new_pw:np});
  if(r.ok){PW=np;try{sessionStorage.setItem('adm_pw',np)}catch(e){}closeModal();toast('Password changed')}
  else $('#ner').textContent='Could not change the password.';
}
function signOutAdmin(){PW='';try{sessionStorage.removeItem('adm_pw')}catch(e){}closeModal();gate()}

/* ---------- boot ----------
   The password check starts at once, but the panel is drawn only after every admin*.js has loaded:
   drawing it from here (mid-page) sometimes showed the old layout before admin5+ replaced it. */
(function(){
  const ping=cloud&&PW?A('ping'):null;
  const go=async function(){
    if(!cloud)return gate();
    if(!ping)return gate();
    const r=await ping;
    if(r.ok)shell();else if(!['invalid','locked','not_set'].includes(r.error))gate();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go,{once:true});else go();
})();
;(window.__p=window.__p||{})['admin3']=1;
