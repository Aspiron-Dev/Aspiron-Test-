/* ================= v6: overview, analytics, notice, duplicate, exports ================= */
async function A2(action,data){
  try{
    const r=await fetch(API+'/rest/v1/rpc/cbt_admin2',{method:'POST',headers:{apikey:CFG.SUPABASE_KEY,Authorization:'Bearer '+CFG.SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_pw:PW,p_action:action,p_data:data||{}})});
    if(!r.ok)return{ok:false,error:'server'};
    const j=await r.json();
    if(!j.ok&&['invalid','locked','not_set'].includes(j.error))gate(j.error);
    return j;
  }catch(e){toast('No internet connection');return{ok:false,error:'network'}}
}
const askel=()=>`<div class="skp"><div class="sk" style="height:96px;border-radius:18px"></div><div class="skr"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>${[1,2].map(()=>`<div class="card"><div class="sk" style="width:50%"></div><div class="sk" style="width:90%;margin-top:12px"></div><div class="sk" style="width:65%;margin-top:10px"></div></div>`).join('')}</div>`;
function countUp(root){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  (root||document).querySelectorAll('[data-cu]').forEach(el=>{
    const m=String(el.textContent).match(/^(-?\d+(?:\.\d+)?)(.*)$/);if(!m)return;
    const to=parseFloat(m[1]),suf=m[2],dec=(m[1].split('.')[1]||'').length,t0=performance.now();
    const step=n=>{const k=Math.min(1,(n-t0)/800),e=1-Math.pow(1-k,3);if(k<1){el.textContent=(to*e).toFixed(dec)+suf;requestAnimationFrame(step)}else el.textContent=m[1]+suf};
    requestAnimationFrame(step);
  });
}
const fs=t=>{t=Math.round(t||0);return t<60?t+'s':Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s'};
function dl(name,lines){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+lines.join('\n')],{type:'text/csv'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800);
}
const cq=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';

/* ---- overview ---- */
let OV=null;
async function loadOverview(){
  const r=await A2('overview',{});
  const el=$('#pn_overview');if(!el)return;
  if(!r.ok){el.innerHTML=`<div class="card empty"><b>Overview needs the v6 SQL update.</b><p class="sm">Run supabase_v6_update.sql in Supabase SQL Editor once, then refresh. Everything else keeps working.</p></div>`;return}
  OV=r;
  const hr=new Date().getHours(),gr=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const mx=Math.max(1,...r.days.map(x=>x.n));
  const box=(n,l,c,suf)=>`<div class="sbox"><b ${c?`style="color:${c}"`:''} data-cu="${n==null?0:n}">${n==null?'–':n}${suf||''}</b><span>${l}</span></div>`;
  const att=[];
  if(r.pending)att.push(`<div class="attn" onclick="tab('students')"><span class="dot warn"></span><div class="grow"><b>${r.pending} approval request${r.pending==1?'':'s'}</b><div class="sm mut">Students waiting to join</div></div><span class="chev2">›</span></div>`);
  if(r.reports)att.push(`<div class="attn" onclick="tab('reports')"><span class="dot bad"></span><div class="grow"><b>${r.reports} open report${r.reports==1?'':'s'}</b><div class="sm mut">Students flagged a question</div></div><span class="chev2">›</span></div>`);
  if(r.inactive)att.push(`<div class="attn" onclick="tab('students')"><span class="dot"></span><div class="grow"><b>${r.inactive} student${r.inactive==1?'':'s'} not seen for 7 days</b><div class="sm mut">Maybe send a reminder</div></div><span class="chev2">›</span></div>`);
  const n=r.notice||{on:false,text:''};
  el.innerHTML=`<div class="ovhero"><div><div class="sm" style="opacity:.85">${gr}</div><h2>Your test series</h2><div class="sm" style="opacity:.85;margin-top:2px">${r.students} students · ${r.tests} tests · ${r.attempts} attempts</div></div></div>
   <div class="qa"><button class="btn sm" onclick="addModal()">+ Add student</button><button class="btn ghost sm" onclick="tab('create')">+ Create test</button><button class="btn ghost sm" onclick="exportStudents()">Students CSV</button><button class="btn ghost sm" onclick="tab('results')">Results</button></div>
   <div class="sstats ov6">${box(r.students,'Students')}${box(r.active7,'Active (7 days)','var(--ok)')}${box(r.today,'Attempts today')}${box(r.week,'Attempts (7 days)')}${box(r.avg_pct,'Average score','',r.avg_pct==null?'':'%')}${box(r.pending,'Pending',r.pending?'var(--warn)':'')}</div>
   ${att.length?`<div class="h2s">Needs attention</div><div class="card" style="padding:6px 14px">${att.join('')}</div>`:''}
   <div class="h2s">Attempts, last 7 days</div><div class="card"><div class="wk">${r.days.map(d=>`<div><i class="${d.n?'':'z'}" style="height:${d.n?Math.max(10,d.n/mx*100):0}%"></i><b>${d.n}</b>${d.d}</div>`).join('')}</div></div>
   <div class="h2s">Most attempted tests</div>${r.top.length?`<div class="card" style="padding:6px 14px">${r.top.map(t=>`<div class="attn" onclick="analytics('${t.id}')"><div class="grow"><b>${esc(t.title)}</b><div class="sm mut">${t.students} students · ${t.attempts} attempts · avg ${t.avg_pct==null?'–':t.avg_pct+'%'}</div></div><span class="btn soft sm">Analytics</span></div>`).join('')}</div>`:`<div class="card empty">No attempts yet.</div>`}
   <div class="h2s">Announcement banner</div><div class="card"><p class="sm mut" style="margin:0 0 8px">One line shown at the top of every student's Home, for example: "Aaj 2 baje Test 5".</p>
    <textarea id="nt" maxlength="300" placeholder="Write an announcement…" style="min-height:64px">${esc(n.text||'')}</textarea>
    <label class="chk" style="margin-top:8px"><input type="checkbox" id="non" ${n.on?'checked':''}><span>Show to students</span></label>
    <div class="row" style="margin-top:10px"><button class="btn" onclick="saveNotice()">Save announcement</button>${n.text?`<button class="btn ghost" onclick="$('#nt').value='';$('#non').checked=false;saveNotice()">Clear</button>`:''}</div></div>`;
  countUp(el);
}
async function saveNotice(){
  const r=await A2('notice_set',{text:$('#nt').value,on:$('#non').checked&&!!$('#nt').value.trim()});
  toast(r.ok?($('#non').checked?'Announcement is live':'Saved (hidden)'):'Needs the v6 SQL update');
}

/* ---- test analytics ---- */
let AN=null,ANS='no';
async function analytics(id){
  modal(`<div class="skp">${askel()}</div>`,true);
  const r=await A2('analytics',{id});
  if(!r.ok){closeModal();toast(r.error==='not_found'?'Test not found':'Analytics needs the v6 SQL update');return}
  AN={id,r};ANS='no';drawAnalytics();
}
function drawAnalytics(){
  const {id,r}=AN;
  if(!r.students)return modal(`<h2>${esc(r.title)}</h2><div class="card empty" style="box-shadow:none">Nobody has attempted this test yet.</div><button class="btn ghost block" onclick="closeModal()">Close</button>`,true);
  const qs=r.questions.slice();
  if(ANS==='hard')qs.sort((a,b)=>(a.answered?a.correct/a.answered:2)-(b.answered?b.correct/b.answered:2));
  const sus=r.questions.filter(q=>q.suspect);
  const L='ABCD';
  const tile=(n,l)=>`<div><b>${n}</b><span>${l}</span></div>`;
  modal(`<div class="row" style="justify-content:space-between;gap:10px"><h2 style="font-size:19px">${esc(r.title)}</h2><button class="iconbtn sm" onclick="closeModal()" aria-label="Close">✕</button></div>
   <div class="tiles6">${tile(r.students,'Students')}${tile(r.avg_pct==null?'–':r.avg_pct+'%','Average')}${tile(r.high+'/'+r.max,'Highest')}${tile(r.low,'Lowest')}${tile(fs(r.avg_time),'Avg time')}${tile(r.attempts,'Attempts')}</div>
   ${sus.length?`<div class="alertc"><b>⚠ ${sus.length} question${sus.length==1?'':'s'} may have a wrong answer key</b><div class="sm">Most students picked the same other option. Check: ${sus.map(q=>`<a href="#" onclick="event.preventDefault();closeModal();editQuestions('${id}',${q.i})">Q${q.i+1}</a>`).join(', ')}</div></div>`:''}
   <div class="row" style="margin:14px 0 8px;gap:8px;justify-content:space-between"><div class="seg"><button class="${ANS==='no'?'on':''}" onclick="ANS='no';drawAnalytics()">By number</button><button class="${ANS==='hard'?'on':''}" onclick="ANS='hard';drawAnalytics()">Hardest first</button></div><button class="btn soft sm" onclick="exportAnalytics()">Download CSV</button></div>
   ${qs.map(q=>{const p=q.answered?Math.round(q.correct*100/q.answered):0,mxo=Math.max(1,...q.opts);return `<div class="aq ${q.suspect?'sus':''}"><div class="row" style="gap:8px;align-items:flex-start"><b class="qn">Q${q.i+1}</b><div class="grow"><div class="qt2">${esc(q.q)||'(image question)'}</div>
     <div class="sm mut">${q.sec?esc(q.sec)+' · ':''}${q.answered}/${q.total} answered${q.avg_t?' · avg '+fs(q.avg_t):''}</div></div><span class="chip ${p>=60?'ok':p>=30?'warn':''}" ${p<30?'style="background:var(--badSoft);color:var(--bad)"':''}>${p}% correct</span></div>
     <div class="obars">${q.opts.map((n,j)=>`<div class="ob ${q.key===j?'key':''}"><span>${L[j]}</span><div><i style="width:${n/mxo*100}%"></i></div><b>${n}</b></div>`).join('')}</div>
     <div style="text-align:right"><button class="btn ghost sm" onclick="closeModal();editQuestions('${id}',${q.i})">Open question</button></div></div>`}).join('')}
   <div class="h2s" style="font-size:16px">Top students</div><div class="card" style="padding:4px 14px;box-shadow:none;background:var(--surface2)">${r.rows.slice(0,10).map(x=>`<div class="lbr"><span class="n">${x.rank}</span><span class="grow">${esc(x.name)}</span><b>${x.score}</b><span class="mut sm">/${x.max}</span></div>`).join('')}</div>`,true);
}
function exportAnalytics(){
  const r=AN.r;
  const l=[['Rank','Name','Mobile','Score','Max','Correct','Wrong','Skipped','Time(sec)','Attempts'].map(cq).join(',')].concat(r.rows.map(x=>[x.rank,x.name,x.mobile,x.score,x.max,x.correct,x.wrong,x.skipped,x.used,x.attempts].map(cq).join(',')));
  l.push('');l.push(['Question','Text','Subject','Answered','Correct','% correct','A','B','C','D','Key'].map(cq).join(','));
  r.questions.forEach(q=>l.push([q.i+1,q.q,q.sec,q.answered,q.correct,q.answered?Math.round(q.correct*100/q.answered):0,...q.opts,q.key==null?'':'ABCD'[q.key]].map(cq).join(',')));
  dl((r.title||'test').replace(/[^\w]+/g,'_')+'_analytics.csv',l);
}

/* ---- duplicate / move ---- */
function dupModal(id){
  const t=CA.tests.find(x=>x.id===id);if(!t)return;
  modal(`<h2>Duplicate test</h2><p class="mut sm" style="margin:4px 0 0">Makes a copy with all questions. The copy is <b>hidden</b> until you show it, so you can edit it first. To <b>move</b> a test, open its Details and change the series.</p>
   <label class="l">Name of the copy</label><input type="text" id="dn" value="${esc(t.title)} (copy)">
   <label class="l">Put the copy in series</label><select id="ds">${CA.series.map(s=>`<option value="${s.id}" ${s.id===t.series_id?'selected':''}>${esc(s.title)}</option>`).join('')}</select>
   <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" id="dgo" onclick="dupGo('${id}')">Create copy</button></div>`);
}
async function dupGo(id){
  const b=$('#dgo');b.disabled=true;b.textContent='Copying…';
  const r=await A2('duplicate',{id,title:$('#dn').value,series_id:$('#ds').value});
  if(!r.ok){b.disabled=false;b.textContent='Create copy';return toast(r.error==='unknown'||r.error==='server'?'Needs the v6 SQL update':'Could not copy')}
  closeModal();toast('Copy created (hidden)');await loadContent();
}

/* ---- students CSV ---- */
async function exportStudents(){
  const r=await A2('students_export',{});
  if(!r.ok)return toast('Needs the v6 SQL update');
  const l=[['Name','Mobile','Status','Batches / paid series','Tests taken','Attempts','Average %','Joined','Last seen'].map(cq).join(',')].concat(r.rows.map(x=>[x.name,x.mobile,x.status,x.batches,x.tests,x.attempts,x.avg_pct==null?'':x.avg_pct,x.joined,x.last_seen].map(cq).join(',')));
  dl('students.csv',l);toast('Students CSV downloaded');
}
;(window.__p=window.__p||{})['admin4']=1;
