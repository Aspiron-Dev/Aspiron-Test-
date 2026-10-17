/* ================= v13 admin: PYQ Bank — import past papers, auto-tag chapter & topic ================= */
async function APQ(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin_pyq',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:r.status===404?'missing':'server'};
    const j=await r.json();if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);return j;
  }catch(e){return{ok:false,error:'network'}}
}
AI.pyq='<path d="M4 19V5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M14 3v5h5M8 17v-3M12 17v-6M16 17v-4"/>';
NAVX.splice(NAVX.findIndex(x=>x[0]==='create')+1,0,['pyq','PYQ Bank']);
XTRA.push('pyq');TTL.pyq='PYQ Bank';
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='pyq')return loadPyq();return r}}
{const _m=openMore;openMore=function(){_m();const g=document.querySelector('#layer .mgrid2');if(g&&!g.querySelector('[data-pq]'))g.insertAdjacentHTML('afterbegin',`<button class="mitem" data-pq onclick="closeModal();tab('pyq')">${ai('pyq',20)}<span>PYQ Bank</span><em class="nb"></em></button>`)}}

let PQA={exam:'NEET',papers:[],rows:null,src:null,paper:'',year:''};
const pqS=()=>PYQ_SYL[PQA.exam];
const pqChOpts=(sub,sel)=>{const S=pqS().subjects.find(s=>s.id===sub);if(!S)return '';return [11,12].map(c=>`<optgroup label="Class ${c}">${S.chapters.filter(x=>x.cls===c).map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.name)}${x.old?' (old)':''}</option>`).join('')}</optgroup>`).join('')};
const pqTpOpts=(sub,ch,sel)=>{const S=pqS().subjects.find(s=>s.id===sub),C=S&&S.chapters.find(x=>x.id===ch);return (C?C.topics:[]).map(t=>`<option ${t.name===sel?'selected':''}>${esc(t.name)}</option>`).join('')};
async function loadPyq(){
  const p=$('#pn_pyq');if(!p)return;
  p.innerHTML=`<div class="phead"><div><h1>PYQ Bank</h1><p class="sm mut">Add past NEET papers here. Students see chapter-wise, topic-wise and year-wise analysis in <b>PYQ Analysis</b>, and which questions repeat.</p></div></div><div id="pqbody">${askel()}</div>`;
  const r=await APQ('papers',{exam:PQA.exam});
  if(!r.ok){$('#pqbody').innerHTML=`<div class="card empty"><b>${r.error==='missing'?'One-time setup needed':'Could not load'}</b><p class="sm">${r.error==='missing'?'Open Supabase → SQL Editor, paste <b>supabase_v11_pyq.sql</b> and press Run once. Then refresh.':'Check your internet and try again.'}</p></div>`;return}
  PQA.papers=r.items||[];PQA.total=r.total||0;pqDraw();
}
function pqDraw(){
  const b=$('#pqbody');if(!b)return;const S=pqS(),have=new Set(PQA.papers.map(x=>x.paper));
  if(!CA.tests.length)loadCatalog().then(()=>{const s=$('#pqtest');if(s)s.innerHTML=pqTestOpts()});
  b.innerHTML=`<div class="sstats" style="grid-template-columns:repeat(3,1fr)"><div class="sbox"><b>${PQA.total}</b><span>Questions</span></div><div class="sbox"><b>${PQA.papers.length}</b><span>Papers added</span></div><div class="sbox"><b>${S.papers.length-S.papers.filter(p=>have.has(p)).length}</b><span>Papers left</span></div></div>
   <div id="pqready"></div>
   <div class="h2s">➕ Add a paper from a test</div>
   <div class="card"><p class="sm mut" style="margin-top:0">1) Create the paper as a normal test first (Create test → upload the PDF), or pick one you already have. 2) Choose it here with its exam name. 3) Check the auto-tagged chapters and save.</p>
    <div class="g2"><div><label class="l">Test with the paper's questions</label><select id="pqtest">${pqTestOpts()}</select></div>
     <div><label class="l">Which paper is it?</label><select id="pqpaper" onchange="if(this.value==='__c'){const v=prompt('Paper name, e.g. NEET 2026');if(v){const o=document.createElement('option');o.textContent=v;o.selected=true;this.prepend(o)}}">${S.papers.slice().reverse().map(p=>`<option ${have.has(p)?'disabled':''}>${p}${have.has(p)?' ✓':''}</option>`).join('')}<option value="__c">Other…</option></select></div></div>
    <button class="btn" style="margin-top:12px" onclick="pqLoadTest()">Load &amp; auto-tag questions</button></div>
   <div id="pqprev"></div>
   <div class="h2s">📚 Papers in the bank <span class="n">${PQA.papers.length}</span></div>
   ${PQA.papers.length?`<div class="card scroll" style="padding:0"><table class="tbl"><thead><tr><th>Paper</th><th>Year</th><th>Questions</th><th>Subjects</th><th></th></tr></thead><tbody>${PQA.papers.map(x=>`<tr><td><b>${esc(x.paper)}</b></td><td>${x.year}</td><td>${x.n}</td><td>${(x.subjects||[]).map(s=>({phy:'Phy',chem:'Chem',bio:'Bio'})[s]||s).join(', ')}</td>
     <td style="white-space:nowrap"><button class="btn ghost sm" onclick="pqBrowse(${JSON.stringify(x.paper).replace(/"/g,'&quot;')})">Check tags</button> <button class="btn danger sm" onclick="pqDelPaper(${JSON.stringify(x.paper).replace(/"/g,'&quot;')})">Delete</button></td></tr>`).join('')}</tbody></table></div>`
     :'<div class="card empty sm">No papers yet. Add the first one above.</div>'}
   <div id="pqbrowse"></div>`;
  pqReady();
}
// Ready-made papers shipped with the site (pyq-data/*.json): questions, checked answers and our own explanations.
async function pqReady(){
  const box=$('#pqready');if(!box)return;let L;
  try{L=await(await fetch('pyq-data/index.json',{cache:'no-cache'})).json()}catch(_){box.innerHTML='';return}
  L=(L||[]).filter(x=>(x.exam||'NEET')===PQA.exam);if(!L.length){box.innerHTML='';return}
  const have=new Set(PQA.papers.map(x=>x.paper)),left=L.filter(x=>!have.has(x.paper)).length;
  box.innerHTML=`<div class="h2s">📦 Ready-made papers <span class="n">${L.length}</span></div><div class="card" style="padding:4px 14px">${L.map((x,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;${i?'border-top:1px solid var(--bd)':''}"><div style="flex:1;min-width:0"><b>${esc(x.paper)}</b><div class="sm mut">${x.n} questions · answers checked · own explanations</div></div>${have.has(x.paper)?'<span class="sm mut" style="white-space:nowrap">✓ In bank</span>':`<button class="btn sm" style="flex:none" onclick="pqImport('${esc(x.file)}',this)">Add</button>`}</div>`).join('')}</div>${left>1?`<button class="btn ghost sm" style="margin-top:8px" onclick="pqImportAll(this)">Add all ${left} papers</button>`:''}`;
  PQA.ready=L;
}
async function pqImport(f,b,quiet){
  if(!/^[a-z0-9-]+\.json$/.test(f))return false;if(b){b.disabled=true;b.textContent='Loading…'}
  let d;try{d=await(await fetch('pyq-data/'+f,{cache:'no-cache'})).json()}catch(_){d=null}
  if(!d||!Array.isArray(d.items)){if(b){b.disabled=false;b.textContent='Add to bank'}toast('Could not load '+f);return false}
  if(PQA.papers.some(x=>x.paper===d.paper)){toast(d.paper+' is already in the bank');return true}
  const items=d.items.map(x=>({...x,rkey:pyqKey(x.q)}));let n=0;
  for(let i=0;i<items.length;i+=100){if(b)b.textContent=`Saving… ${Math.min(i+100,items.length)}/${items.length}`;const r=await APQ('bulk',{exam:d.exam||PQA.exam,items:items.slice(i,i+100)});if(!r.ok){if(b){b.disabled=false;b.textContent='Try again'}toast('Could not save — '+(r.error||'error'));return false}n+=r.added||0}
  PQA.papers.push({paper:d.paper});if(!quiet){toast(`✓ ${n} questions added from ${d.paper}`);loadPyq()}return true;
}
async function pqImportAll(b){
  const L=(PQA.ready||[]).filter(x=>!PQA.papers.some(p=>p.paper===x.paper));b.disabled=true;
  for(let i=0;i<L.length;i++){b.textContent=`Adding ${L[i].paper} (${i+1}/${L.length})…`;if(!await pqImport(L[i].file,null,1)){b.disabled=false;b.textContent='Try again';return loadPyq()}}
  toast(`✓ ${L.length} papers added`);loadPyq();
}
const pqTestOpts=()=>`<option value="">Select a test…</option>`+CA.tests.map(t=>`<option value="${t.id}">${esc(t.title)} (${t.questions||'?'} Q)</option>`).join('');
async function pqLoadTest(){
  const id=$('#pqtest').value,paper=$('#pqpaper').value;
  if(!id)return toast('Select the test first');if(!paper||paper==='__c')return toast('Choose which paper it is');
  const year=+((paper.match(/(20\d\d)/)||[])[1]||0);if(!year)return toast('Paper name must contain the year, e.g. NEET 2024');
  const box=$('#pqprev');box.innerHTML=askel();
  const r=await A('test_get',{id});if(!r.ok||!r.test){box.innerHTML='';return toast('Could not load the test')}
  const Q=(r.test.data||[]).filter(q=>q&&(q.q||q.img));
  PQA.paper=paper;PQA.year=year;
  PQA.rows=Q.map((q,i)=>{const hint=pyqSubjOf(q.sec),t=pyqTag(PQA.exam,[q.q,...(q.options||[]),q.explanation].join(' '),hint)||{};
    const sub=t.subject||hint||'bio';return{qno:i+1,q:q.q||'',options:(q.options||[]).slice(0,4),answer:q.answer,explanation:q.explanation||'',has_img:!!(q.img||(q.oimg||[]).some(Boolean)),
      subject:sub,chapter:t.chapter||'',topic:t.topic||'',sure:(t.score||0)>=2&&(!hint||t.subject===hint)}});
  pqPrev();
}
function pqPrev(){
  const R=PQA.rows,box=$('#pqprev');if(!box||!R)return;
  const unsure=R.filter(r=>!r.sure||!r.chapter).length;
  box.innerHTML=`<div class="card pqprev"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><div><b>${esc(PQA.paper)}</b> · ${R.length} questions</div><div class="row" style="gap:8px"><span class="chip ${unsure?'warn':'ok'}">${R.length-unsure} auto-tagged · ${unsure} to check</span><button class="btn ghost sm" onclick="PQA.only=!PQA.only;pqPrev()">${PQA.only?'Show all':'Show only to check'}</button></div></div>
   <div class="pqrows">${R.map((r,i)=>PQA.only&&r.sure&&r.chapter?'':`<div class="pqr ${r.sure&&r.chapter?'':'chk'}"><div class="pqn">${r.qno}</div><div class="grow"><div class="sm pqtx">${esc(r.q).slice(0,220)}${r.q.length>220?'…':''}</div>
     <div class="pqsel"><select onchange="pqSet(${i},'subject',this.value)">${pqS().subjects.map(s=>`<option value="${s.id}" ${s.id===r.subject?'selected':''}>${s.name}</option>`).join('')}</select>
     <select onchange="pqSet(${i},'chapter',this.value)"><option value="">— chapter —</option>${pqChOpts(r.subject,r.chapter)}</select>
     <select onchange="pqSet(${i},'topic',this.value)"><option value="">— topic —</option>${pqTpOpts(r.subject,r.chapter,r.topic)}</select></div></div></div>`).join('')}</div>
   <div class="row" style="margin-top:12px;gap:8px"><button class="btn" id="pqsave" onclick="pqSave()">Save ${R.length} questions to the PYQ bank</button><button class="btn ghost" onclick="PQA.rows=null;$('#pqprev').innerHTML=''">Cancel</button></div></div>`;
}
function pqSet(i,k,v){const r=PQA.rows[i];r[k]=v;r.sure=true;if(k==='subject'){r.chapter='';r.topic=''}if(k==='chapter'){const S=pqS().subjects.find(s=>s.id===r.subject),C=S&&S.chapters.find(c=>c.id===v);r.topic=C&&C.topics[0]?C.topics[0].name:''}pqPrev()}
async function pqSave(){
  const R=PQA.rows;if(!R)return;const miss=R.filter(r=>!r.chapter).length;
  if(miss&&!confirm(`${miss} question${miss>1?'s have':' has'} no chapter and will be skipped. Continue?`))return;
  const items=R.filter(r=>r.chapter).map(r=>({subject:r.subject,chapter:r.chapter,topic:r.topic,year:PQA.year,paper:PQA.paper,qno:r.qno,q:r.q,options:r.options,answer:r.answer,explanation:r.explanation,has_img:r.has_img,rkey:pyqKey(r.q)}));
  const b=$('#pqsave');b.disabled=true;let n=0;
  for(let i=0;i<items.length;i+=100){b.textContent=`Saving… ${Math.min(i+100,items.length)}/${items.length}`;const r=await APQ('bulk',{exam:PQA.exam,items:items.slice(i,i+100)});if(!r.ok){b.disabled=false;b.textContent='Try again';return toast('Could not save — '+(r.error||'error'))}n+=r.added||0}
  toast(`✓ ${n} questions added from ${PQA.paper}`);PQA.rows=null;loadPyq();
}
async function pqDelPaper(p){if(!confirm(`Delete all questions of "${p}" from the PYQ bank?`))return;const r=await APQ('delete_paper',{exam:PQA.exam,paper:p});if(r.ok){toast('Deleted');loadPyq()}else toast('Could not delete')}
async function pqBrowse(p){
  const box=$('#pqbrowse');box.innerHTML=askel();
  const r=await APQ('list',{exam:PQA.exam,paper:p});if(!r.ok){box.innerHTML='';return toast('Could not load')}
  PQA.list=r.items||[];
  box.innerHTML=`<div class="h2s">${esc(p)} · check tags <span class="n">${PQA.list.length}</span></div><div class="card pqrows">${PQA.list.map((x,i)=>`<div class="pqr"><div class="pqn">${x.qno||''}</div><div class="grow"><div class="sm pqtx">${esc(x.q).slice(0,200)}</div>
    <div class="pqsel"><select onchange="pqUpd(${i},'subject',this.value)">${pqS().subjects.map(s=>`<option value="${s.id}" ${s.id===x.subject?'selected':''}>${s.name}</option>`).join('')}</select>
    <select onchange="pqUpd(${i},'chapter',this.value)">${pqChOpts(x.subject,x.chapter)}</select><select onchange="pqUpd(${i},'topic',this.value)"><option value="">—</option>${pqTpOpts(x.subject,x.chapter,x.topic)}</select>
    <button class="btn ghost sm" onclick="pqDelQ(${i})">✕</button></div></div></div>`).join('')}</div>`;
  box.scrollIntoView({behavior:'smooth'});
}
async function pqUpd(i,k,v){const x=PQA.list[i];x[k]=v;if(k==='chapter'){const S=pqS().subjects.find(s=>s.id===x.subject),C=S&&S.chapters.find(c=>c.id===v);x.topic=C&&C.topics[0]?C.topics[0].name:''}
  const r=await APQ('update',{id:x.id,subject:x.subject,chapter:x.chapter||'',topic:x.topic||''});toast(r.ok?'Saved':'Could not save')}
async function pqDelQ(i){const x=PQA.list[i];if(!confirm('Delete this question from the bank?'))return;const r=await APQ('delete',{id:x.id});if(r.ok){PQA.list.splice(i,1);toast('Deleted');pqBrowse(x.paper)}}
;(window.__p=window.__p||{})['admin10']=1;
