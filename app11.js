/* ===== v22: PYQ Analysis — exam → subject → chapter → year-wise, topic-wise and repeated questions ===== */
IC.pyq='<path d="M4 19V5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M14 3v5h5M8 17v-3M12 17v-6M16 17v-4"/>';
const PQ={exam:'NEET',sub:LS.get('cbt_pq_sub','bio'),sum:null,sumT:0,ch:{},f:{t:'',y:'',rep:0},open:{},sort:'ncert'};
const pqYear=p=>+((String(p).match(/(20\d\d)/)||[])[1]||0);
const pqYears=()=>{const s=new Set((PYQ_SYL[PQ.exam].papers||[]).map(pqYear));(PQ.sum||[]).forEach(r=>s.add(r[3]));return [...s].filter(Boolean).sort((a,b)=>a-b)};
async function pqSummary(force){
  if(PQ.sum&&!force&&Date.now()-PQ.sumT<300000)return PQ.sum;
  if(!PQ.sum)PQ.sum=LS.get('cbt_pq_sum_'+PQ.exam,null);
  const r=await rpc('cbt_pyq_summary',{p_exam:PQ.exam});
  if(r&&r.ok){PQ.sum=r.rows||[];PQ.sumT=Date.now();LS.set('cbt_pq_sum_'+PQ.exam,PQ.sum)}else if(!PQ.sum)PQ.sum=[];
  PQ.err=r&&!r.ok&&r.status===404;
  return PQ.sum;
}
function pqAgg(){
  const A={sub:{},ch:{},papers:new Set()};
  (PQ.sum||[]).forEach(([s,c,t,y,p,n])=>{
    A.papers.add(p);A.sub[s]=(A.sub[s]||0)+n;
    const o=A.ch[c]=A.ch[c]||{n:0,y:{},t:{},p:new Set()};o.n+=n;o.y[y]=(o.y[y]||0)+n;o.t[t||'Other']=(o.t[t||'Other']||0)+n;o.p.add(p);
  });return A;
}
const pqSubj=()=>PYQ_SYL[PQ.exam].subjects.find(s=>s.id===PQ.sub)||PYQ_SYL[PQ.exam].subjects[0];
const pqChap=id=>{for(const s of PYQ_SYL[PQ.exam].subjects)for(const c of s.chapters)if(c.id===id)return{s,c};return null};
function pqMini(o,Y){const mx=Math.max(1,...Y.map(y=>o&&o.y[y]||0));return `<div class="pqmini">${Y.map(y=>{const n=o&&o.y[y]||0;return `<i style="height:${n?Math.max(18,n/mx*100):6}%" class="${n?'':'z'}"></i>`}).join('')}</div>`}
function pqHead(back,title,sub){return `<div class="crumb"><a href="${back}">${ic('back',14)} ${back==='#/'?'Home':'Back'}</a></div><div class="pqh"><div class="pqhi">${ic('pyq',24)}</div><div class="grow"><h1>${title}</h1>${sub?`<div class="sm mut">${sub}</div>`:''}</div></div>`}

/* ---------- 1. choose exam ---------- */
function pqHome(){
  const E=PYQ_SYL;
  setApp(`<div class="wrap pq">${pqHead('#/','PYQ Analysis','Previous year questions — chapter wise, topic wise and year wise')}
   <div class="pqhero card"><b>Study what is actually asked 🎯</b><p class="sm">See which chapters and topics come most often, how many questions came every year, and which questions keep repeating.</p></div>
   <div class="h2s">Choose your exam</div>
   <div class="pqex">${Object.keys(E).map(k=>`<button class="card pqe ${E[k].soon?'soon':''}" ${E[k].soon?'':`onclick="location.hash='#/pyq/${k}'"`}><b>${esc(E[k].name)}</b><span>${E[k].soon?'Coming soon':'Physics · Chemistry · Biology'}</span>${E[k].soon?'':ic('right',18)}</button>`).join('')}</div></div>`);
  setNav('');
}

/* ---------- 2. subject + chapter list ---------- */
async function pqExam(){
  const draw=()=>{
    const A=pqAgg(),S=pqSubj(),Y=pqYears(),E=PYQ_SYL[PQ.exam];
    const chs=S.chapters.map(c=>({c,o:A.ch[c.id]}));
    const tots=chs.map(x=>x.o?x.o.n:0).filter(Boolean).sort((a,b)=>b-a),hi=tots[Math.floor(tots.length*.25)]||1,lo=tots[Math.floor(tots.length*.7)]||0;
    const w=n=>!n?'':n>=hi?'<span class="pqw h">High</span>':n>lo?'<span class="pqw m">Medium</span>':'<span class="pqw l">Low</span>';
    const row=({c,o})=>`<button class="pqrow" onclick="location.hash='#/pyq/${PQ.exam}/${c.id}'"><div class="grow"><b>${esc(c.name)}</b><div class="sm mut">${o?`${o.n} Qs · ${Object.keys(o.y).length} yr${Object.keys(o.y).length>1?'s':''} · ${o.p.size} paper${o.p.size>1?'s':''}`:'No questions added yet'}${c.old?' · <span class="pqold">not in current syllabus</span>':''}</div></div>${w(o&&o.n)}${pqMini(o,Y.slice(-10))}${ic('right',16)}</button>`;
    const grp=cls=>{let l=chs.filter(x=>x.c.cls===cls);if(PQ.sort==='most')l=[...l].sort((a,b)=>(b.o?b.o.n:0)-(a.o?a.o.n:0));return `<div class="h2s">Class ${cls} <span class="n">${l.length} chapters</span></div><div class="card pqlist">${l.map(row).join('')}</div>`};
    const top=chs.filter(x=>x.o).sort((a,b)=>b.o.n-a.o.n).slice(0,6),tmx=Math.max(1,...top.map(x=>x.o.n));
    setApp(`<div class="wrap pq">${pqHead('#/pyq',esc(E.name)+' PYQ',`${A.papers.size} paper${A.papers.size==1?'':'s'} analysed · ${(PQ.sum||[]).reduce((a,r)=>a+r[5],0)} questions`)}
     <div class="pqsub">${E.subjects.map(s=>`<button class="${s.id===PQ.sub?'on':''}" onclick="PQ.sub='${s.id}';LS.set('cbt_pq_sub','${s.id}');pqExam()">${s.id==='phy'?'⚡':s.id==='chem'?'🧪':'🧬'} ${s.name}<small>${A.sub[s.id]||0} Qs</small></button>`).join('')}</div>
     ${PQ.err?`<div class="card empty sm">PYQ data is being set up. Please check back soon.</div>`:''}
     ${top.length?`<div class="h2s">🔥 Most asked chapters</div><div class="card pqtop">${top.map(x=>`<div class="pqbar" onclick="location.hash='#/pyq/${PQ.exam}/${x.c.id}'"><span>${esc(x.c.name)}</span><div><i style="width:${x.o.n/tmx*100}%"></i></div><b>${x.o.n}</b></div>`).join('')}</div>`
       :`<div class="card pqnote">📚 Question data for ${esc(S.name)} is being added paper by paper. The chapter list below is ready — numbers will appear as papers are added.</div>`}
     <div class="row" style="justify-content:space-between;margin-top:6px"><span class="sm mut">Tap a chapter for full analysis</span><div class="seg pqsort"><button class="${PQ.sort==='ncert'?'on':''}" onclick="PQ.sort='ncert';pqExam()">NCERT order</button><button class="${PQ.sort==='most'?'on':''}" onclick="PQ.sort='most';pqExam()">Most asked</button></div></div>
     ${grp(11)}${grp(12)}</div>`);
    setNav('');
  };
  if(PQ.sum)draw();else setApp(`<div class="wrap">${[1,2,3].map(()=>`<div class="card"><div class="sk" style="width:55%"></div><div class="sk" style="width:90%;margin-top:12px"></div></div>`).join('')}</div>`);
  await pqSummary();if(/^#\/pyq\/[^/]+$/.test(location.hash))draw();
}

/* ---------- 3. chapter analysis ---------- */
async function pqChapter(cid){
  const X=pqChap(cid);if(!X){location.hash='#/pyq/'+PQ.exam;return}
  PQ.sub=X.s.id;if(PQ.cid!==cid){PQ.cid=cid;PQ.f={t:'',y:'',rep:0};PQ.open={};PQ.lim=20}
  if(!PQ.ch[cid])setApp(`<div class="wrap pq">${pqHead('#/pyq/'+PQ.exam,esc(X.c.name),'Loading…')}<div class="card"><div class="sk" style="height:140px"></div></div></div>`);
  if(!PQ.sum)pqSummary();
  if(!PQ.ch[cid]){const r=await rpc('cbt_pyq_chapter',{p_exam:PQ.exam,p_chapter:cid});PQ.ch[cid]=r&&r.ok?r.items||[]:[]}
  if(location.hash!=='#/pyq/'+PQ.exam+'/'+cid)return;
  pqDrawCh(X);
}
function pqDrawCh(X){
  const L=PQ.ch[X.c.id]||[],Y=pqYears(),c=X.c;
  const by={};L.forEach(q=>by[q.y]=(by[q.y]||0)+1);const ymx=Math.max(1,...Object.values(by));
  const tp={};c.topics.forEach(t=>tp[t.name]=0);L.forEach(q=>tp[q.t||'Other']=(tp[q.t||'Other']||0)+1);
  const tl=Object.entries(tp).sort((a,b)=>b[1]-a[1]),tmx=Math.max(1,...tl.map(x=>x[1]));
  const rep=L.filter(q=>q.rep&&q.rep.length>1),repKeys=new Set(rep.map(q=>q.k));
  const yrs=Object.keys(by).map(Number),last=yrs.length?Math.max(...yrs):null,papers=new Set(L.map(q=>q.p)).size;
  const f=PQ.f,shown=L.filter(q=>(!f.t||(q.t||'Other')===f.t)&&(!f.y||q.y==f.y)&&(!f.rep||(q.rep&&q.rep.length>1)));
  const col=['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6'];
  setApp(`<div class="wrap pq">${pqHead('#/pyq/'+PQ.exam,esc(c.name),`Class ${c.cls} · ${esc(X.s.name)}${c.old?' · not in current NEET syllabus':''}`)}
   ${L.length?`<div class="pqk"><div><b>${L.length}</b><span>Questions</span></div><div><b>${papers?(L.length/papers).toFixed(1):0}</b><span>Avg / paper</span></div><div><b>${yrs.length}</b><span>Years asked</span></div><div><b>${repKeys.size}</b><span>Repeated</span></div></div>
   <div class="h2s">📅 Year-wise questions ${last?`<span class="n">last asked ${last}</span>`:''}</div>
   <div class="card"><div class="pqyr">${Y.map(y=>`<div class="${f.y==y?'on':''}" onclick="PQ.lim=20;PQ.f.y=PQ.f.y==${y}?'':${y};pqDrawCh(pqChap('${c.id}'))" title="${y}: ${by[y]||0} Qs"><b>${by[y]||''}</b><i class="${by[y]?'':'z'}" style="height:${by[y]?Math.max(8,by[y]/ymx*100):3}%"></i><span>'${String(y).slice(2)}</span></div>`).join('')}</div><div class="sm mut" style="text-align:center;margin-top:6px">Tap a year to see only its questions</div></div>
   <div class="h2s">🧩 Topic-wise weightage</div>
   <div class="card pqtp">${tl.map(([n,v],i)=>`<div class="pqtr ${f.t===n?'on':''}" onclick="PQ.f.t=PQ.f.t===${JSON.stringify(n).replace(/"/g,'&quot;')}?'':${JSON.stringify(n).replace(/"/g,'&quot;')};pqDrawCh(pqChap('${c.id}'))"><div class="row" style="justify-content:space-between"><span>${esc(n)}</span><b>${v} <small>${L.length?Math.round(v*100/L.length):0}%</small></b></div><div class="pqtb"><i style="width:${v/tmx*100}%;background:${col[i%col.length]}"></i></div></div>`).join('')}</div>
   <div class="h2s">📝 Questions <span class="n">${shown.length}</span></div>
   <div class="chiprow">${[['','All topics'],...tl.filter(x=>x[1]).map(x=>[x[0],x[0]])].map(([k,t])=>`<button class="chip ${f.t===k?'pri':''}" onclick="PQ.f.t=${JSON.stringify(k).replace(/"/g,'&quot;')};pqDrawCh(pqChap('${c.id}'))">${esc(t)}</button>`).join('')}</div>
   <div class="row pqfl"><select onchange="PQ.f.y=this.value;pqDrawCh(pqChap('${c.id}'))"><option value="">All years</option>${[...yrs].sort((a,b)=>b-a).map(y=>`<option ${f.y==y?'selected':''}>${y}</option>`).join('')}</select>
    <button class="chip ${f.rep?'pri':''}" onclick="PQ.f.rep=PQ.f.rep?0:1;pqDrawCh(pqChap('${c.id}'))">🔁 Repeated only (${rep.length})</button></div>
   ${shown.length?shown.slice(0,PQ.lim||20).map(pqCard).join('')+(shown.length>(PQ.lim||20)?`<div style="text-align:center"><button class="btn ghost" onclick="PQ.lim=(PQ.lim||20)+20;pqDrawCh(pqChap(PQ.cid))">Load more (${shown.length-(PQ.lim||20)} left)</button></div>`:''):`<div class="card empty sm">No questions for this filter.</div>`}`
   :`<div class="card pqnote">📚 Questions for this chapter have not been added yet. Topics of this chapter:</div><div class="card pqtp">${c.topics.map(t=>`<div class="pqtr"><span>${esc(t.name)}</span></div>`).join('')}</div>`}
  </div>`);
  setNav('');
}
function pqCard(q){
  const op=PQ.open[q.id],reps=(q.rep||[]).filter(Boolean),r=reps.length>1;
  return `<div class="card pqq ${r?'rep':''}"><div class="pqqh"><span class="chip pri">${esc(q.p)}${q.n?' · Q'+q.n:''}</span>${q.t?`<span class="chip">${esc(q.t)}</span>`:''}${r?`<span class="chip rp" title="${esc(reps.join(', '))}">🔁 Asked ${reps.length}×</span>`:''}</div>
   ${r?`<div class="sm pqrp">Also asked in: ${reps.filter(p=>p!==q.p).map(p=>`<b>${esc(p)}</b>`).join(', ')}</div>`:''}
   <div class="qt">${esc(q.q)}</div>${q.img?'<div class="sm mut">📷 This question has a diagram — see the original paper.</div>':''}
   ${(q.o||[]).map((o,j)=>o?`<div class="ro ${op&&j===q.a?'c':''}"><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}</span>${op&&j===q.a?'<span class="tag g">Correct</span>':''}</div>`:'').join('')}
   ${op?(q.e?`<div class="exp"><b>Explanation:</b> ${esc(q.e)}</div>`:''):`<button class="btn ghost sm" onclick="PQ.open['${q.id}']=1;pqDrawCh(pqChap(PQ.cid))">${ic('eye',15)} Show answer</button>`}</div>`;
}

/* ---------- routing + menu ---------- */
{const _r0=route0;route0=async function(){
  const h=location.hash||'';let m;
  if(/^#\/pyq/.test(h)&&AUTH){
    if((m=h.match(/^#\/pyq\/([A-Z0-9]+)\/([\w-]+)$/))){PQ.exam=m[1];return pqChapter(m[2])}
    if((m=h.match(/^#\/pyq\/([A-Z0-9]+)$/))&&PYQ_SYL[m[1]]&&!PYQ_SYL[m[1]].soon){PQ.exam=m[1];return pqExam()}
    return pqHome();
  }
  return _r0.apply(this,arguments);
}}
{const _om=openMenu;openMenu=function(){_om();const b=[...document.querySelectorAll('#layer .dri')].find(x=>/Test History/.test(x.textContent));
  if(b&&!document.getElementById('dripyq'))b.insertAdjacentHTML('afterend',`<button class="dri" id="dripyq" onclick="closeModal();location.hash='#/pyq'">${ic('pyq',22)}<span>PYQ Analysis</span><em class="drnew">NEW</em></button>`)}}
;(window.__p=window.__p||{})['app11']=1;
