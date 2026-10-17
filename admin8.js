/* ================= v11 admin: smarter Students page ================= */
let SPF=null,SPFL=false;
const D1=864e5,sNow=()=>Date.now();
const seenCls=s=>!s.last_seen?'never':sNow()-s.last_seen<15*60e3?'live':sNow()-s.last_seen<D1?'today':sNow()-s.last_seen<7*D1?'week':'old';
async function stuPerf(){
  if(SPF||SPFL)return SPF;SPFL=true;
  const r=await A('results',{});SPFL=false;if(!r.ok)return null;
  const m={};(r.results||[]).forEach(x=>{const p=x.max?Math.round(x.score*100/x.max):0,o=m[x.mobile]=m[x.mobile]||{n:0,sum:0,best:0,last:0,lt:''};o.n++;o.sum+=p;o.best=Math.max(o.best,p);if(x.at>o.last){o.last=x.at;o.lt=x.title;o.lp=p}});
  Object.values(m).forEach(o=>o.avg=Math.round(o.sum/o.n));SPF=m;return m;
}
const perfOf=s=>SPF&&SPF[s.mobile];

/* stats: 6 tiles */
function statsHtml(){
  const act=ST.filter(s=>s.status!=='pending'),now=sNow();
  const box=(n,l,c,k)=>`<div class="sbox" ${k?`onclick="SF.s='${k}';drawList()" style="cursor:pointer"`:''}><b style="${c?'color:'+c:''}">${n}</b><span>${l}</span></div>`;
  return box(act.length,'Students','','all')+box(act.filter(s=>s.last_seen&&now-s.last_seen<D1).length,'Active today','var(--ok)','today')+box(act.filter(s=>s.last_seen&&now-s.last_seen<7*D1).length,'Active 7 days','','active')
    +box(act.filter(isPaid).length,'Paid','var(--ok)','paid')+box(act.filter(s=>s.status!=='blocked'&&(!s.last_seen||now-s.last_seen>7*D1)).length,'Inactive 7d+','var(--warn)','inactive')+box(act.filter(s=>s.status==='blocked').length,'Blocked','var(--bad)','blocked');
}
const SEGS=[['all','All'],['today','Active today'],['active','Active 7d'],['inactive','Inactive'],['new','New'],['paid','Paid'],['free','Free'],['blocked','Blocked']];
function segTest(k,s){
  const now=sNow();
  return k==='all'||(k==='paid'?isPaid(s):k==='free'?!isPaid(s):k==='blocked'?s.status==='blocked':k==='today'?s.last_seen&&now-s.last_seen<D1:k==='active'?s.last_seen&&now-s.last_seen<7*D1
    :k==='inactive'?s.status!=='blocked'&&(!s.last_seen||now-s.last_seen>7*D1):k==='new'?s.created&&now-s.created<7*D1:true);
}
function shownStudents(){
  const q=SF.q.toLowerCase().trim();
  let l=ST.filter(s=>s.status!=='pending'&&(!q||s.name.toLowerCase().includes(q)||s.mobile.includes(q))&&segTest(SF.s,s));
  if(SF.b!=='all')l=l.filter(s=>(s.access||[]).includes(SF.b));
  const o=SF.o,pa=s=>{const p=perfOf(s);return p?p.avg:-1};
  l.sort((a,b)=>o==='name'?a.name.localeCompare(b.name):o==='seen'?(b.last_seen||0)-(a.last_seen||0):o==='tests'?b.attempts-a.attempts:o==='hi'?pa(b)-pa(a):o==='lo'?(pa(a)<0?999:pa(a))-(pa(b)<0?999:pa(b)):b.created-a.created);
  return l;
}
function drawList(){
  const all=ST.filter(s=>s.status!=='pending'),ps=paidSer();
  const sg=$('#sseg');if(sg)sg.innerHTML=SEGS.map(([k,t])=>{const n=all.filter(s=>segTest(k,s)).length;return k!=='all'&&!n&&SF.s!==k?'':`<button class="${SF.s===k?'on':''}" onclick="SF.s='${k}';drawList()">${t} <span class="mut">${n}</span></button>`}).join('');
  const st=$('#sstats');if(st)st.innerHTML=statsHtml();
  const l=shownStudents(),site=stuLink();
  const cnt=$('#scount');if(cnt)cnt.textContent=`${l.length} shown`;
  $('#slist').innerHTML=l.length?l.map(s=>{
    const pd=isPaid(s),n=ps.filter(x=>(s.access||[]).includes(x.id)).length,sc=seenCls(s),p=perfOf(s),nw=s.created&&sNow()-s.created<7*D1;
    return `<div class="card srow3 ${s.status==='blocked'?'blk':''} ${SEL.has(s.id)?'sel':''}"><label class="selbox"><input type="checkbox" ${SEL.has(s.id)?'checked':''} onchange="selTog('${s.id}',this.checked)"></label>
     <div class="av3 ${pd?'avp':''}" onclick="manage('${s.id}')">${esc(s.name[0].toUpperCase())}<i class="dot ${sc}"></i></div>
     <div class="grow" onclick="manage('${s.id}')"><div class="nm"><b>${esc(s.name)}</b>${pd?`<span class="tg paid">PAID${ps.length>1?' · '+n:''}</span>`:'<span class="tg">FREE</span>'}${nw?'<span class="tg new">NEW</span>':''}${s.status==='blocked'?'<span class="tg bad">BLOCKED</span>':''}</div>
      <div class="sm mut s3m"><span>${esc(s.mobile)}</span><span class="seen ${sc}">${sc==='live'?'● online now':sc==='never'?'never opened':'seen '+ago(s.last_seen)}</span><span>${s.attempts} test${s.attempts==1?'':'s'}</span><span>📱 ${s.devices}/${s.max_devices}</span></div>
      ${p?`<div class="s3p"><div class="bar3"><i style="width:${p.avg}%;background:${p.avg>=60?'var(--ok)':p.avg>=35?'var(--warn)':'var(--bad)'}"></i></div><span>avg <b>${p.avg}%</b> · best ${p.best}%</span></div>`:''}</div>
     <div class="s3f">${ps.length?`<div class="accs">${ps.map(x=>{const on=(s.access||[]).includes(x.id);return `<button class="accchip ${on?'on':''}" onclick="toggleStuAcc('${s.id}','${x.id}')" title="${on?'Tap to remove access':'Tap to give access'}">${on?'✓':'+'} ${esc(x.title)}</button>`}).join('')}</div>`:'<span></span>'}
      <div class="s3a"><a class="iconbtn sm" title="WhatsApp" target="_blank" rel="noopener" href="${waTo(s.mobile,`Hi ${s.name.split(' ')[0]}, `)}" onclick="event.stopPropagation()">${ai('wa',16)}</a><button class="btn ghost sm" onclick="manage('${s.id}')">Manage</button></div></div></div>`}).join('')
   :`<div class="card empty">${ST.length?'No students match.':'No students yet. Add students or share the site link so they can request access.'}</div>`;
  $('#bulkbar').innerHTML=SEL.size?`<div class="bulkbar"><b>${SEL.size} selected</b>${ps.length?`<select id="bsr">${ps.map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join('')}</select><button class="btn sm" onclick="bulkAcc(true)">Give access</button><button class="btn warn sm" onclick="bulkAcc(false)">Remove</button>`:''}
    <button class="btn soft sm" onclick="selCopy()">Copy numbers</button><button class="btn soft sm" onclick="selCsv()">CSV</button><button class="btn ghost sm" onclick="SEL.clear();drawList()">Clear</button></div>`:'';
}
function selCopy(){const l=ST.filter(s=>SEL.has(s.id)).map(s=>s.mobile);copyText(l.join(', '))}
function selCsv(){const l=ST.filter(s=>SEL.has(s.id));dl('selected-students.csv',[['Name','Mobile','Status','Tests','Average %','Last seen'],...l.map(s=>{const p=perfOf(s);return [s.name,s.mobile,s.status,s.attempts,p?p.avg:'',s.last_seen?new Date(s.last_seen).toLocaleString('en-IN'):'never']})])}

{const _rs=renderStudents;renderStudents=function(){
  _rs();
  const so=$('#so');if(so&&!so.querySelector('[value="hi"]')){so.insertAdjacentHTML('beforeend','<option value="hi">Highest score</option><option value="lo">Lowest score</option>');so.value=SF.o}
  const st=$('#sstats');if(st)st.classList.add('st6');
  const sg=$('#sseg');if(sg){sg.classList.add('sseg3');sg.insertAdjacentHTML('afterend','<div class="sm mut" id="scount" style="margin:8px 2px 0"></div>')}
  const pend=ST.filter(s=>s.status==='pending');
  const h=document.querySelector('#pn_students .h2s');
  if(pend.length>1&&h&&!document.getElementById('apall'))h.insertAdjacentHTML('beforeend',`<button class="btn sm" id="apall" style="margin-left:auto" onclick="approveAll()">Approve all ${pend.length}</button>`);
  drawList();
  if(!SPF)stuPerf().then(()=>{if($('#slist'))drawList()});
}}
async function approveAll(){
  const pend=ST.filter(s=>s.status==='pending');if(!pend.length)return;
  if(!confirm(`Approve all ${pend.length} requests? Each student gets an access code — you can see and share codes from Manage → New access code.`))return;
  const b=$('#apall');if(b){b.disabled=true;b.textContent='Approving…'}
  let n=0;for(const s of pend){const r=await A('student_approve',{id:s.id});if(r.ok)n++}
  toast(`${n} student${n==1?'':'s'} approved`);await loadStudents();
}

/* Manage popup: performance + quick contact */
{const _mg=manage;manage=function(id){
  _mg(id);
  const s=ST.find(x=>x.id===id),box=document.querySelector('#layer .box');if(!s||!box)return;
  const p=perfOf(s),sc=seenCls(s),site=stuLink();
  box.querySelector('.sm.mut')?.insertAdjacentHTML('afterend',`<div class="mgp">
    <div class="sstats" style="margin:12px 0 4px">${[['Tests',p?p.n:s.attempts||0],['Average',p?p.avg+'%':'–'],['Best',p?p.best+'%':'–'],['Seen',sc==='live'?'now':sc==='never'?'never':ago(s.last_seen)]].map(x=>`<div class="sbox"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('')}</div>
    ${p?`<div class="sm mut" style="margin-bottom:8px">Last test: <b style="color:var(--tx)">${esc(p.lt)}</b> · ${p.lp}% · ${ago(p.last)}</div>`:''}
    <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn soft sm" target="_blank" rel="noopener" href="${waTo(s.mobile,`Hi ${s.name.split(' ')[0]}, `)}">${ai('wa',14)} WhatsApp</a><a class="btn soft sm" href="tel:${esc(s.mobile)}">📞 Call</a>
     <a class="btn soft sm" target="_blank" rel="noopener" href="${waTo(s.mobile,`Hi ${s.name.split(' ')[0]}, a new test is waiting for you. Open ${site} and attempt it today. All the best! 💪`)}">🔔 Remind to study</a>
     <button class="btn ghost sm" onclick="copyText('${esc(s.mobile)}')">Copy number</button></div></div>`);
}}
;(window.__p=window.__p||{})['admin8']=1;
