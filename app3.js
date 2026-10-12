async function flushPending(){
  if(!AUTH)return;
  // expired local progress -> submit
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('cbt_prog_'+AUTH.mobile+'_')){
        const p=LS.get(k,null);
        if(p&&p.ends&&p.ends<=Date.now()+(p.off||0)){addPend({tid:p.tid,cid:p.cid,ans:p.ans||{},title:p.title,ts:Date.now()});LS.del(k)}
      }
    }
  }catch(e){}
  for(const it of getPend()){
    const r=await rpc('cbt_submit',{p_test:it.tid,p_answers:it.ans,p_client_id:it.cid});
    if(r.ok||['no_session','not_found'].includes(r.error))delPend(it.cid);
    if(r.ok)toast('Your earlier test was submitted.');
  }
}


/* ---------- result / review ---------- */
async function openReview(id){
  loading('Loading your answers…');
  const r=await rpc('cbt_review',{p_result:id});
  if(!r.ok){if(authErr(r))return;toast('Could not load this result.');route();return}
  if(r.gone){toast('This test is no longer available for review.');route();return}
  if(!CAT)await loadCat(true);
  BM=BM||new Set();
  RV={result:r.result,review:r.review,filter:'all',sec:'*'};showResult();lb(r.result);
}
async function lb(res){
  if(!res.test_id)return;
  const r=await rpc('cbt_leaderboard',{p_test:res.test_id});
  const el=$('#lb');if(!el||!r.ok||!r.top||!r.top.length)return;
  el.innerHTML=`<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><b>${ic('trophy')} Leaderboard</b>${r.my_rank?`<span class="chip pri">Your rank #${r.my_rank} of ${r.total}</span>`:''}</div>
   ${r.top.map(x=>`<div class="lb ${x.me?'me':''}"><span class="n">${x.rank}</span><span style="flex:1">${esc(x.name)}${x.me?' (you)':''}</span><b>${x.score}</b></div>`).join('')}</div>`;
}
function setFilter(f){RV.filter=f;showResult()}
function setSecF(s){RV.sec=s;showResult()}
function doneResult(){RV=null;CAT=null;const h=RET&&RET!=='#/'?RET:'#/r';history.replaceState(null,'',h);route()}
function showResult(){
  document.body.classList.remove('intest');
  const rec=RV.result,f=RV.filter,Qs=RV.review,ans=rec.answers||{};
  const p=pct(rec.score,rec.max),col=ringCol(p),acc=rec.correct+rec.wrong?Math.round(rec.correct*100/(rec.correct+rec.wrong)):0;
  const all=Qs.map((q,i)=>{const a=ans[i]!=null?+ans[i]:null;return{q,i,a,st:q.answer==null||a==null?'s':(a===q.answer?'c':'w')}});
  const names=[];Qs.forEach(q=>{const s=q.sec||'';if(!names.includes(s))names.push(s)});
  const hasSec=names.some(x=>x);
  const cm=Qs.length?rec.max/Qs.length:0,wm=rec.wrong?(rec.correct*cm-rec.score)/rec.wrong:0;
  const secRows=hasSec?names.map(s=>{
    const it=all.filter(x=>(x.q.sec||'')===s),c=it.filter(x=>x.st==='c').length,w=it.filter(x=>x.st==='w').length,k=it.length-c-w;
    return `<tr><td><b>${esc(s||'General')}</b></td><td>${it.length}</td><td style="color:var(--ok)">${c}</td><td style="color:var(--bad)">${w}</td><td>${k}</td><td><b>${Math.round((c*cm-w*wm)*100)/100}</b>/${Math.round(it.length*cm*100)/100}</td></tr>`}).join(''):'';
  const sf=RV.sec||'*';
  const items=all.filter(x=>(f==='all'||x.st===f)&&(!hasSec||sf==='*'||(x.q.sec||'')===sf));
  const fb=(k,t)=>`<button class="${f===k?'on':''}" onclick="setFilter('${k}')">${t}</button>`;
  const sb=(k,t)=>`<button class="${sf===k?'on':''}" onclick="setSecF(${JSON.stringify(k).replace(/"/g,'&quot;')})">${esc(t)}</button>`;
  const tid=rec.test_id;
  setApp(`<div class="wrap"><div class="card rhero"><div class="mut sm">${esc(rec.title)}</div>
   <div class="ring">${ring(p,150,12,col)}<div class="c"><div><b>${rec.score}</b><span class="sm mut">out of ${rec.max}</span></div></div></div>
   <h2>${p>=75?'Excellent work! 🎉':p>=50?'Good effort 👍':'Keep practising 💪'}</h2><div class="mut sm" style="margin-top:4px">${p}% · Accuracy ${acc}% · Time ${fmt(rec.used)}${rec.late?' · Submitted late':''}</div>
   <div class="s4"><div><b style="color:var(--ok)">${rec.correct}</b><span>Correct</span></div><div><b style="color:var(--bad)">${rec.wrong}</b><span>Wrong</span></div><div><b>${rec.skipped}</b><span>Skipped</span></div><div><b>${Qs.length}</b><span>Total</span></div></div></div>
   ${hasSec?`<div class="card" style="margin-top:12px"><b>Section-wise performance</b><div class="scroll" style="margin-top:8px"><table class="tbl sm"><tr><th>Section</th><th>Qs</th><th>✓</th><th>✗</th><th>Skip</th><th>Marks</th></tr>${secRows}</table></div></div>`:''}
   <div id="lb"></div>
   <div class="sec-h"><div class="seg">${fb('all','All')}${fb('c','Correct')}${fb('w','Wrong')}${fb('s','Skipped')}</div><button class="btn ghost sm" onclick="doneResult()">Done</button></div>
   ${hasSec?`<div class="seg" style="margin-bottom:12px">${sb('*','All sections')}${names.map(s=>sb(s,s||'General')).join('')}</div>`:''}
   ${items.map(({q,i,a,st})=>`<div class="card rv"><div class="row" style="margin-bottom:8px"><b>Q${i+1}</b>${st==='c'?'<span class="chip ok">Correct</span>':st==='w'?'<span class="chip" style="background:var(--badSoft);color:var(--bad)">Wrong</span>':'<span class="chip">Skipped</span>'}${q.sec?`<span class="chip">${esc(q.sec)}</span>`:''}<span style="flex:1"></span>${tid?bmBtn(tid,i)+rpBtn(tid,i):''}</div>
    <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
    ${q.options.map((o,j)=>{if(!o&&!(q.oimg&&q.oimg[j]))return '';const isC=j===q.answer,isY=j===a;return `<div class="ro ${isC?'c':(isY?'w':'')}"><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}${imgTag(q.oimg&&q.oimg[j],'oi')}${isC||isY?`<span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${isC?'<span class="tag g" style="margin:0">Correct answer</span>':''}${isY&&!isC?'<span class="tag r" style="margin:0">Your answer</span>':''}${isY&&isC?'<span class="tag g" style="margin:0">Your answer</span>':''}</span>`:''}</span></div>`}).join('')}
    ${q.answer==null?'<div class="sm mut" style="margin-top:6px">No answer key was set for this question, so it is not marked.</div>':''}
    ${q.explanation||q.eimg?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''}</div>`).join('')||'<div class="card empty">Nothing to show here.</div>'}
   <div style="text-align:center;margin-top:8px"><button class="btn" onclick="doneResult()">Back to tests</button></div></div>`);
}


/* ---------- boot ---------- */
async function init(){
  updateTheme();updateHeader();
  if(getComputedStyle(document.documentElement).getPropertyValue('--cssv').trim()!=='5'){const b=document.createElement('div');b.className='cssbanner';b.textContent='Design is not fully updated. Please upload the new style.css to GitHub, then refresh.';b.style.cssText='position:fixed;left:12px;right:12px;top:12px;z-index:99;background:#c9780a;color:#fff;border-radius:14px;padding:12px 14px;font-weight:600';document.body.appendChild(b)}
  if(!cloud)return login();
  if(!AUTH)return login();
  loading('Loading…');
  await flushPending();
  // a test is still running on this device -> go straight back into it
  const rid=runningTest();
  if(rid){RET='#/';return startTest(rid)}
  route();
}
function runningTest(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('cbt_prog_'+AUTH.mobile+'_')){const p=LS.get(k,null);if(p&&p.tid)return p.tid}
    }
  }catch(e){}
  return null;
}
init();
;(window.__p=window.__p||{})['app3']=1;
