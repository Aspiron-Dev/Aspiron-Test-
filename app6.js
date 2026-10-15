/* ---------- exam countdown (each student sets their own; saved on this phone) ---------- */
const CDU=[['months','Months','Mo',30.44*864e5],['weeks','Weeks','Wk',7*864e5],['days','Days','Days',864e5],['hours','Hours','Hrs',36e5],['minutes','Minutes','Min',6e4],['seconds','Seconds','Sec',1e3]];
const cdKey=()=>'cbt_cd_'+AUTH.mobile;
let CDE=null,cdIv=null;
function cdGet(){
  const s=LS.get(cdKey(),null);
  if(!s||!s.name||!s.date||isNaN(new Date(s.date).getTime()))return null;
  if(!Array.isArray(s.units)||!s.units.length)s.units=['days','hours','minutes'];
  return s;
}
function cdCalc(c){
  const now=Date.now(),t=new Date(c.date).getTime(),diff=t-now,st=c.start||now,tot=t-st;
  const pc=tot>0?Math.max(0,Math.min(100,Math.round((now-st)/tot*100))):0;
  let rem=Math.max(0,diff);const parts=[];
  CDU.forEach(u=>{if(c.units.includes(u[0])){parts.push([Math.floor(rem/u[3]),u[2]]);rem%=u[3]}});
  return{diff,pc,parts};
}
function cdInner(c){
  const r=cdCalc(c),R=2*Math.PI*26;
  const body=r.diff<=0?`<div class="cdday">🎉 Exam day!</div>`:`<div class="cdu">${r.parts.map(p=>`<div><b>${String(p[0]).padStart(2,'0')}</b><span>${p[1]}</span></div>`).join('<i>:</i>')}</div>`;
  return `<div class="cdtop"><div class="grow"><div class="lbl">EXAM COUNTDOWN</div><h3>${esc(c.name)}</h3></div>
   <div class="cdring"><svg viewBox="0 0 64 64"><defs><linearGradient id="cdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--pri)"/><stop offset="1" style="stop-color:var(--pri2)"/></linearGradient></defs><circle cx="32" cy="32" r="26" fill="none" style="stroke:var(--surface2)" stroke-width="5"/><circle cx="32" cy="32" r="26" fill="none" stroke="url(#cdg)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${R.toFixed(1)}" stroke-dashoffset="${(R*(1-r.pc/100)).toFixed(1)}" transform="rotate(-90 32 32)"/></svg><span>${r.pc}%</span></div>
   <button class="btn ghost sm" onclick="cdEdit()">Edit</button></div>${body}`;
}
function cdCard(){
  const c=cdGet();
  if(!c)return `<div class="card mkcard cdc cdempty" onclick="cdEdit()"><span class="mki">${ic('calendar',22)}</span><div class="grow"><b>Exam countdown</b><div class="sm mut">Set your exam date and see how many days are left.</div></div><button class="btn soft sm">Set date</button></div>`;
  return `<div class="card cdc" id="cdbox">${cdInner(c)}</div>`;
}
function cdTick(){
  clearInterval(cdIv);cdIv=null;
  const c=cdGet();if(!c||!document.getElementById('cdbox'))return;
  const run=()=>{const b=document.getElementById('cdbox'),k=cdGet();if(!b||!k){clearInterval(cdIv);cdIv=null;return}b.innerHTML=cdInner(k)};
  cdIv=setInterval(run,c.units.includes('seconds')?1000:15000);
}
function cdChips(){return CDU.map(u=>{const on=CDE.units.includes(u[0]);return `<button class="look cdchip ${on?'on':''}" onclick="cdU('${u[0]}')">${u[1]}</button>`}).join('')}
function cdU(k){
  const i=CDE.units.indexOf(k);if(i>-1)CDE.units.splice(i,1);else CDE.units.push(k);
  const el=document.getElementById('cdch');if(el)el.innerHTML=cdChips();
}
function cdEdit(){
  const c=cdGet();CDE={units:c?c.units.slice():['days','hours','minutes']};
  const d=c?new Date(c.date):new Date(Date.now()+30*864e5),p=n=>String(n).padStart(2,'0');
  const v=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  modal(`<h2>Exam countdown</h2><p class="mut sm" style="margin:4px 0 12px">Only you can see this. It is saved on this phone.</p>
   <div class="sm mut" style="font-weight:600;margin-bottom:6px">Exam / event name</div>
   <input type="text" id="cdn" maxlength="30" placeholder="e.g. NEET 2027, JEE Mains" value="${esc(c?c.name:'')}" style="margin-bottom:12px">
   <div class="sm mut" style="font-weight:600;margin-bottom:6px">Date and time</div>
   <input type="datetime-local" id="cdd" value="${v}" style="margin-bottom:12px">
   <div class="sm mut" style="font-weight:600;margin-bottom:6px">Show these (pick any)</div>
   <div class="cdchips" id="cdch">${cdChips()}</div>
   <div class="row" style="margin-top:14px">${c?`<button class="btn danger" onclick="cdDel()">Remove</button>`:''}<button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" onclick="cdSave()">Save</button></div>`);
}
function cdSave(){
  const n=(document.getElementById('cdn').value||'').trim(),dv=document.getElementById('cdd').value;
  if(!n)return toast('Enter exam name');
  const t=new Date(dv).getTime();if(!dv||isNaN(t))return toast('Pick a date');
  if(!CDE.units.length)return toast('Pick at least one unit');
  const old=cdGet(),iso=new Date(t).toISOString();
  LS.set(cdKey(),{name:n,date:iso,start:old&&old.date===iso&&old.start?old.start:Date.now(),units:CDU.map(u=>u[0]).filter(k=>CDE.units.includes(k))});
  closeModal();cdRefresh();toast('Countdown saved');
}
function cdDel(){if(!confirm('Remove this countdown?'))return;LS.del(cdKey());closeModal();cdRefresh()}
function cdRefresh(){const el=document.querySelector('.cdc');if(el){el.outerHTML=cdCard();cdTick()}}

/* ---------- study tracker (weeks, subjects, tasks; saved on this phone) ---------- */
const TK_EM=['📘','⚡','🧪','📐','🌿','🧬','🌍','💻','📊','📖','🧠','🔬','📝','🎨','🔢','🗣️','⚖️','🏛️','💰','🎯'];
const TK_CO=['#10b981','#6366f1','#f59e0b','#ec4899','#14b8a6','#f97316','#8b5cf6','#06b6d4','#ef4444','#84cc16','#3b82f6','#a855f7'];
const trkKey=()=>'cbt_trk_'+AUTH.mobile;
let TK=null,TKS=-1,TKF='all',TKN=null,TKCB=null;
function trkLoad(){
  if(TK&&TK._m===AUTH.mobile)return TK;
  let d=LS.get(trkKey(),null);
  if(!d||!Array.isArray(d.weeks)||!d.weeks.length)d={cur:0,nid:1,weeks:[{id:'w1',label:'Week 1',subjects:[]}],goals:{}};
  d.cur=Math.min(Math.max(0,d.cur|0),d.weeks.length-1);d.nid=d.nid||1;d.goals=d.goals||{};d._m=AUTH.mobile;
  return TK=d;
}
function trkSave(){const c=Object.assign({},TK);delete c._m;LS.set(trkKey(),c)}
const trkId=()=>TK.nid++;
function trkStats(w){let d=0,t=0;w.subjects.forEach(s=>{t+=s.tasks.length;d+=s.tasks.filter(x=>x.done).length});return{done:d,total:t,pct:t?Math.round(d*100/t):0}}
const trkW=()=>trkLoad().weeks[TK.cur];
function trkMini(){
  const T=trkLoad(),w=T.weeks[T.cur],s=trkStats(w);
  return `<div class="card mkcard" onclick="location.hash='#/t'"><span class="mki">${ic('target',22)}</span><div class="grow"><b>Study tracker</b><div class="sm mut">${s.total?esc(w.label)+' · '+s.done+'/'+s.total+' tasks done ('+s.pct+'%)':'Plan your weekly subjects and tasks'}</div></div>${ic('right',18)}</div>`;
}
function viewTracker(){
  trkLoad();TKS=-1;TKF='all';
  setApp('<div class="wrap" id="trk"></div>');setNav('tr');trkRender();
}
function trkRender(){
  const el=document.getElementById('trk');if(!el)return;
  const y=window.scrollY;el.innerHTML=trkHtml();window.scrollTo(0,y);
  const a=el.querySelector('.tkweeks .on');if(a&&a.scrollIntoView)try{a.parentNode.scrollLeft=a.offsetLeft-a.parentNode.clientWidth/2+a.clientWidth/2}catch(e){}
}
function trkSuggest(w){
  const s=trkStats(w);if(!w.subjects.length||!s.total)return '';
  let low=null,lp=101;
  w.subjects.forEach(x=>{const t=x.tasks.length;if(!t)return;const p=Math.round(x.tasks.filter(k=>k.done).length*100/t);if(p<lp){lp=p;low=x}});
  let ic_='🎯',m=`${s.pct}% done. Focus on <b>${low?esc(low.emoji+' '+low.name):'pending tasks'}</b> next.`,cl='';
  if(s.pct===100){ic_='🏆';m=`Week complete! All ${s.total} tasks done. Great work!`;cl='ok'}
  else if(s.done===0){ic_='🚀';m=`${s.total} tasks are waiting. Start with <b>${esc(w.subjects[0].emoji+' '+w.subjects[0].name)}</b>.`}
  else if(low&&lp<30){ic_='⚠️';m=`<b>${esc(low.emoji+' '+low.name)}</b> needs attention. Only ${lp}% done.`;cl='warn'}
  else if(s.pct>=75){ic_='⚡';m=`Almost there! Only ${s.total-s.done} task${s.total-s.done>1?'s':''} left.`}
  return `<div class="tksug ${cl}"><span>${ic_}</span><div>${m}</div></div>`;
}
function trkTaskHtml(si,ti,t){
  return `<div class="tktask ${t.done?'dn':''}"><button class="tkck" onclick="trkTog(${si},${ti})" aria-label="Done">${t.done?'✓':''}</button><div class="tkt" onclick="trkEditTask(${si},${ti})">${esc(t.text)}</div><button class="tkx" onclick="trkDelTask(${si},${ti})" aria-label="Delete task">✕</button></div>`;
}
function trkHtml(){
  const T=trkLoad(),w=T.weeks[T.cur],st=trkStats(w),R=2*Math.PI*33;
  let o=`<div class="crumb"><a href="#/">${ic('back',14)} Home</a></div>
  <div class="row" style="justify-content:space-between;margin-bottom:14px"><h1 class="tkh">Study Tracker</h1><button class="btn ghost sm" onclick="trkMenu()">More</button></div>
  <div class="card tkhero"><div class="tkr"><div class="tkring"><svg viewBox="0 0 80 80" width="80" height="80" style="transform:rotate(-90deg)"><defs><linearGradient id="tkg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--pri)"/><stop offset="1" style="stop-color:var(--pri2)"/></linearGradient></defs><circle cx="40" cy="40" r="33" fill="none" style="stroke:var(--surface2)" stroke-width="7"/><circle cx="40" cy="40" r="33" fill="none" stroke="url(#tkg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${R.toFixed(1)}" stroke-dashoffset="${(R*(1-st.pct/100)).toFixed(1)}"/></svg><span>${st.pct}%</span></div>
   <div class="grow"><div class="tkwn" onclick="trkRename()">${esc(w.label)} ✎</div>
   <div class="tkst"><div><b>${st.done}</b><span>done</span></div><div><b>${st.total-st.done}</b><span>left</span></div><div><b>${st.total}</b><span>total</span></div></div></div></div>
   <div class="pbar"><i style="width:${st.pct}%"></i></div>
   <div class="tkact"><button onclick="trkGrowth()"><b>📊</b>Growth</button><button onclick="trkTargets()"><b>🎯</b>Targets</button><button onclick="trkWeeks()"><b>🗓️</b>Weeks</button><button onclick="trkAddWeek()"><b>＋</b>Week</button></div></div>`;
  o+=trkSuggest(w);
  o+=`<div class="tkweeks">${T.weeks.map((x,i)=>{const p=trkStats(x).pct;return `<div class="tkwk ${i===T.cur?'on':''}"><button onclick="trkSwitch(${i})">${esc(x.label)} <small>${p}%</small></button>${i>0?`<button class="tkwx" onclick="trkDelWeek(${i})" aria-label="Delete week">✕</button>`:''}</div>`}).join('')}</div>`;
  if(!w.subjects.length){
    o+=`<div class="card empty"><div style="font-size:30px;margin-bottom:6px">📚</div><h3 style="margin:0 0 4px;color:var(--tx)">Add your subjects</h3><p class="sm" style="margin:0 0 12px">Pick one to start, or add your own.</p>
     <div class="tkquick">${['Physics','Chemistry','Maths','Biology','English','Reasoning'].map(n=>`<button class="chip pri" onclick="trkQuick('${n}')">${n}</button>`).join('')}</div>
     <button class="btn" style="margin-top:12px" onclick="trkSubjModal()">＋ Add subject</button></div>`;
    return o;
  }
  o+=`<div class="tktabs"><button class="${TKS===-1?'on':''}" onclick="trkSel(-1)">All</button><div class="tksc">${w.subjects.map((s,i)=>`<button class="${TKS===i?'on':''}" onclick="trkSel(${i})">${esc(s.emoji)} ${esc(s.name)}</button>`).join('')}</div><button class="tkadd" onclick="trkSubjModal()">＋ Add</button></div>
   <div class="tkflt">${[['all','All'],['done','✓ Done'],['pending','⏳ Pending']].map(f=>`<button class="${TKF===f[0]?'on':''}" onclick="trkFlt('${f[0]}')">${f[1]}</button>`).join('')}</div>`;
  w.subjects.forEach((s,si)=>{
    if(TKS!==-1&&TKS!==si)return;
    const d=s.tasks.filter(x=>x.done).length,t=s.tasks.length,p=t?Math.round(d*100/t):0,goal=T.goals[s.id];
    const rows=s.tasks.map((x,ti)=>({x,ti})).filter(r=>TKF==='all'||(TKF==='done'?r.x.done:!r.x.done));
    o+=`<div class="card tksub" style="--sc:${s.color}"><div class="tksh"><span class="tkem">${esc(s.emoji)}</span><div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${d}/${t} done${goal?` · goal ${d}/${goal}`:''}</div></div><b class="tkp">${p}%</b><button class="tkx" onclick="trkDelSubj(${si})" aria-label="Remove subject">🗑</button></div>
     <div class="tkbar"><i style="width:${p}%"></i></div>
     ${rows.length?rows.map(r=>trkTaskHtml(si,r.ti,r.x)).join(''):`<div class="sm mut" style="padding:10px 2px">${t?'Nothing here for this filter.':'No tasks yet. Add your first one below.'}</div>`}
     <div class="tkaddrow"><input type="text" id="tn-${si}" maxlength="120" placeholder="Add a task…" onkeydown="if(event.key==='Enter')trkAddTask(${si})"><button class="btn sm" onclick="trkAddTask(${si})">Add</button></div></div>`;
  });
  return o;
}
/* tracker actions */
function trkSel(i){TKS=i;trkRender()}
function trkFlt(f){TKF=f;trkRender()}
function trkSwitch(i){if(i===TK.cur)return;TK.cur=i;TKS=-1;trkSave();trkRender()}
function trkAddWeek(){
  closeModal();
  const prev=trkW(),n=TK.weeks.length+1;
  TK.weeks.push({id:'w'+trkId(),label:'Week '+n,subjects:prev.subjects.map(s=>({id:s.id,name:s.name,emoji:s.emoji,color:s.color,tasks:[]}))});
  TK.cur=TK.weeks.length-1;TKS=-1;trkSave();trkRender();toast('Week '+n+' added');
}
function trkDelWeek(i){
  if(i<1||!confirm('Delete "'+TK.weeks[i].label+'" and all its tasks?'))return;
  TK.weeks.splice(i,1);if(TK.cur>=TK.weeks.length)TK.cur=TK.weeks.length-1;else if(TK.cur>i)TK.cur--;
  trkSave();closeModal();trkRender();
}
function trkResetWeek(){if(!confirm('Mark all tasks of this week as pending?'))return;trkW().subjects.forEach(s=>s.tasks.forEach(t=>t.done=false));trkSave();closeModal();trkRender()}
function trkResetAll(){if(!confirm('Delete ALL weeks, subjects and tasks? This cannot be undone.'))return;LS.del(trkKey());TK=null;trkLoad();TKS=-1;closeModal();trkRender();toast('Tracker reset')}
function trkAsk(title,val,cb,ph){
  TKCB=cb;
  modal(`<h2>${esc(title)}</h2><input type="text" id="tka" maxlength="120" value="${esc(val||'')}" placeholder="${esc(ph||'')}" style="margin:10px 0 14px" onkeydown="if(event.key==='Enter')trkAskOk()"><div class="row"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn" style="flex:1" onclick="trkAskOk()">Save</button></div>`);
  setTimeout(()=>{const i=document.getElementById('tka');if(i){i.focus();i.select()}},60);
}
function trkAskOk(){const v=((document.getElementById('tka')||{}).value||'').trim();if(!v)return;const cb=TKCB;TKCB=null;closeModal();if(cb)cb(v)}
function trkRename(){trkAsk('Rename week',trkW().label,v=>{trkW().label=v.slice(0,30);trkSave();trkRender()})}
function trkTog(si,ti){const t=trkW().subjects[si].tasks[ti];t.done=!t.done;trkSave();trkRender()}
function trkDelTask(si,ti){trkW().subjects[si].tasks.splice(ti,1);trkSave();trkRender()}
function trkEditTask(si,ti){trkAsk('Edit task',trkW().subjects[si].tasks[ti].text,v=>{trkW().subjects[si].tasks[ti].text=v;trkSave();trkRender()})}
function trkAddTask(si){
  const el=document.getElementById('tn-'+si),v=el?el.value.trim():'';if(!v)return;
  trkW().subjects[si].tasks.push({id:trkId(),text:v.slice(0,120),done:false});trkSave();trkRender();
  const n=document.getElementById('tn-'+si);if(n)n.focus();
}
function trkDelSubj(si){
  const s=trkW().subjects[si];
  if(!confirm('Remove "'+s.name+'" from this week? Its tasks in this week will be deleted.'))return;
  trkW().subjects.splice(si,1);TKS=-1;trkSave();trkRender();
}
function trkQuick(n){
  const i=trkW().subjects.length,e=['⚡','🧪','📐','🌿','📖','🧠'];
  const s={id:'s'+trkId(),name:n,emoji:e[i%e.length],color:TK_CO[i%TK_CO.length]};
  TK.weeks.forEach(w=>w.subjects.push({id:s.id,name:s.name,emoji:s.emoji,color:s.color,tasks:[]}));
  trkSave();trkRender();
}
/* add subject */
function trkSubjModal(){
  TKN={name:'',emoji:TK_EM[0],color:TK_CO[0],all:TK.weeks.length>1};
  trkSubjDraw();
}
function trkSubjDraw(){
  const n=TKN;
  modal(`<h2>Add subject</h2>
   <div class="tkprev" style="--sc:${n.color}"><span class="tkem">${esc(n.emoji)}</span><b>${esc(n.name||'Subject name')}</b></div>
   <input type="text" id="tsn" maxlength="24" placeholder="e.g. Biology, Physics" value="${esc(n.name)}" oninput="TKN.name=this.value;document.querySelector('.tkprev b').textContent=this.value||'Subject name'" style="margin:10px 0 12px">
   <div class="sm mut" style="font-weight:600;margin-bottom:6px">Icon</div>
   <div class="tkpick">${TK_EM.map(e=>`<button class="${e===n.emoji?'on':''}" onclick="TKN.emoji='${e}';trkSubjDraw()">${e}</button>`).join('')}</div>
   <div class="sm mut" style="font-weight:600;margin:12px 0 6px">Colour</div>
   <div class="tkpick">${TK_CO.map(c=>`<button class="${c===n.color?'on':''}" style="background:${c}" onclick="TKN.color='${c}';trkSubjDraw()"></button>`).join('')}</div>
   <label class="tkall" onclick="TKN.all=!TKN.all;trkSubjDraw()"><span class="tkoff ${n.all?'on':''}"><i></i></span><div><b>Apply to all weeks</b><div class="sm mut">Add this subject in every week</div></div></label>
   <div class="row" style="margin-top:14px"><button class="btn ghost" style="flex:1" onclick="TKN=null;closeModal()">Cancel</button><button class="btn" style="flex:1" onclick="trkSubjOk()">Add subject</button></div>`);
}
function trkSubjOk(){
  const n=TKN,nm=(n.name||'').trim();if(!nm)return toast('Enter a subject name');
  const id='s'+trkId(),mk=()=>({id,name:nm,emoji:n.emoji,color:n.color,tasks:[]});
  if(n.all)TK.weeks.forEach(w=>w.subjects.push(mk()));else trkW().subjects.push(mk());
  TKN=null;trkSave();closeModal();trkRender();toast('Subject added');
}
/* sheets: growth, targets, weeks, menu */
function trkGrowth(){
  const T=trkLoad(),W=T.weeks,bh=110,bw=Math.max(34,Math.floor(280/Math.max(W.length,1))),sw=W.length*bw+16;
  let bars='';
  W.forEach((w,i)=>{
    const p=trkStats(w).pct,h=Math.round(p/100*bh),x=8+i*bw+bw*.15,ww=bw*.7,on=i===T.cur;
    bars+=`<rect x="${x}" y="${bh-h}" width="${ww}" height="${Math.max(h,2)}" rx="5" style="fill:${on?'var(--pri)':'color-mix(in srgb,var(--pri) 32%,transparent)'}"/>${p?`<text x="${x+ww/2}" y="${bh-h-4}" text-anchor="middle" font-size="9" style="fill:var(--mut)">${p}%</text>`:''}<text x="${x+ww/2}" y="${bh+14}" text-anchor="middle" font-size="9" style="fill:var(--mut)">W${i+1}</text>`;
  });
  const cw=trkW(),best=W.reduce((b,w,i)=>trkStats(w).pct>trkStats(W[b]).pct?i:b,0);
  const avg=Math.round(W.reduce((a,w)=>a+trkStats(w).pct,0)/Math.max(W.length,1));
  const rows=cw.subjects.map(s=>{const d=s.tasks.filter(x=>x.done).length,t=s.tasks.length,p=t?Math.round(d*100/t):0;return `<div class="tkgr"><span class="tkem" style="--sc:${s.color}">${esc(s.emoji)}</span><div class="grow"><b>${esc(s.name)}</b><div class="tkbar" style="--sc:${s.color}"><i style="width:${p}%"></i></div></div><b style="color:${s.color}">${p}%</b><span class="sm mut">${d}/${t}</span></div>`}).join('');
  modal(`<h2>📊 Weekly growth</h2><div class="sm mut" style="margin:10px 0 4px;font-weight:600">Week-wise completion</div>
   <div style="overflow-x:auto"><svg viewBox="0 0 ${sw} ${bh+22}" style="min-width:${Math.min(sw,320)}px;width:100%;overflow:visible">${bars}</svg></div>
   <div class="sm mut" style="margin:12px 0 2px;font-weight:600">Subjects · ${esc(cw.label)}</div>${rows||'<div class="sm mut">No subjects yet.</div>'}
   <div class="tkgrid"><div><b>${W.length}</b><span>Weeks</span></div><div><b>${avg}%</b><span>Average</span></div><div><b>W${best+1}</b><span>Best week</span></div><div><b>${W.reduce((a,w)=>a+trkStats(w).total,0)}</b><span>Total tasks</span></div></div>
   <button class="btn block" style="margin-top:14px" onclick="closeModal()">Close</button>`);
}
function trkTargets(){
  const T=trkLoad(),w=trkW();
  const rows=w.subjects.map(s=>{const d=s.tasks.filter(x=>x.done).length,g=T.goals[s.id]||10,p=Math.min(100,Math.round(d*100/g));return `<div class="tkgl" style="--sc:${s.color}"><div class="row"><span class="tkem">${esc(s.emoji)}</span><b class="grow">${esc(s.name)}</b><input type="number" min="1" max="999" value="${g}" onchange="trkGoal('${s.id}',this.value)"><span class="sm mut">tasks</span></div><div class="row" style="margin-top:8px;flex-wrap:nowrap"><div class="tkbar grow"><i style="width:${p}%"></i></div><span class="sm" style="color:var(--sc);font-weight:700">${d}/${g}</span></div></div>`}).join('');
  modal(`<h2>🎯 Weekly targets</h2><p class="sm mut" style="margin:4px 0 12px">How many tasks do you want to finish in each subject? Done so far is counted for ${esc(w.label)}.</p>${rows||'<div class="sm mut">Add a subject first.</div>'}<button class="btn block" style="margin-top:14px" onclick="closeModal()">Done</button>`);
}
function trkGoal(id,v){TK.goals[id]=Math.max(1,Math.min(999,parseInt(v)||1));trkSave();trkRender()}
function trkWeeks(){
  const T=trkLoad();
  modal(`<h2>🗓️ All weeks</h2><div style="margin:10px 0">${T.weeks.map((w,i)=>{const s=trkStats(w);return `<div class="tkwr ${i===T.cur?'on':''}"><div class="grow" onclick="closeModal();trkSwitch(${i})"><b>${esc(w.label)}</b><div class="tkbar"><i style="width:${s.pct}%"></i></div></div><span class="sm mut">${s.done}/${s.total}</span>${i>0?`<button class="tkx" onclick="trkDelWeek(${i})">🗑</button>`:''}</div>`}).join('')}</div>
   <div class="row"><button class="btn ghost" style="flex:1" onclick="closeModal()">Close</button><button class="btn" style="flex:1" onclick="trkAddWeek()">＋ New week</button></div>`);
}
function trkMenu(){
  const it=(i,t,s,f,c)=>`<button class="tkmi ${c||''}" onclick="${f}"><span>${i}</span><div><b>${t}</b><div class="sm mut">${s}</div></div></button>`;
  modal(`<h2>⚙️ Tracker options</h2><div style="margin-top:10px">
   ${it('✏️','Rename this week','Change the week name',"closeModal();trkRename()")}
   ${it('＋','Add new week','Copies your subjects with empty tasks','trkAddWeek()')}
   ${it('↺','Reset this week','Mark all tasks as pending','trkResetWeek()','warn')}
   ${it('📚','Add subject','Optionally in all weeks',"closeModal();trkSubjModal()")}
   ${it('🎯','Set targets','Task goal for each subject',"closeModal();trkTargets()")}
   ${it('📊','Growth chart','Progress across all weeks',"closeModal();trkGrowth()")}
   ${it('🗑️','Reset everything','Delete all weeks, subjects and tasks','trkResetAll()','bad')}
  </div><button class="btn ghost block" style="margin-top:10px" onclick="closeModal()">Close</button>`);
}
init();
;(window.__p=window.__p||{})['app6']=1;
