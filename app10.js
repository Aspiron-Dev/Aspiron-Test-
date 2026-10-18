/* ===== v21: swipeable leaderboard — Overall + one slide per test (student swipes, no auto-play) ===== */
const LBC={};let LBI=0;
const lbName=x=>esc(x.name||x.student||'Student');
const lbFirst=x=>esc(String(x.name||x.student||'Student').split(' ')[0]);
function lbTests(){
  const mine=new Map((CAT.results||[]).map(r=>[r.test_id,r.at]));
  return CAT.tests.filter(t=>!t.practice&&!isPrac(t.id)&&!t.locked&&!isWait(t)&&(mine.has(t.id)||t.attempts||t.opens_at))
    .sort((a,b)=>(mine.get(b.id)||b.opens_at||0)-(mine.get(a.id)||a.opens_at||0)).slice(0,8);
}
function lbPodium(top,me){
  const p=[top[1],top[0],top[2]];
  return `<div class="lbpod">${p.map((x,i)=>{if(!x)return '<div class="pd empty"></div>';const r=x.rank||(i===1?1:i===0?2:3);
    return `<div class="pd p${r} ${x.me||r===me?'me':''}"><div class="pav">${lbFirst(x)[0]||'?'}${r===1?'<i>👑</i>':''}</div><b>${lbFirst(x)}${x.me||r===me?' (you)':''}${x.cheat?'<span class="chtag">🚩 Cheating</span>':''}</b><span>${x.pct!=null?x.pct+'%':x.score}</span><div class="pst">${r}</div></div>`}).join('')}</div>`;
}
function lbRows(top,me,myLine){
  const rest=top.slice(3);
  return `${rest.length?`<div class="lbr">${rest.map((x,i)=>{const r=x.rank||i+4,m=x.me||r===me;return `<div class="lb ${m?'me':''}"><span class="n">${r}</span><span class="grow">${lbName(x)}${m?' (you)':''}${x.cheat?'<span class="chtag">🚩 Cheating</span>':''}</span><b>${x.pct!=null?x.pct+'%':x.score}</b></div>`}).join('')}</div>`:''}
   ${me&&me>top.length?`<div class="lbr"><div class="lb me lbmine"><span class="n">${me}</span><span class="grow">You</span><b>${myLine}</b></div></div>`:''}`;
}
function lbOverall(b){
  if(!b||!b.top||!b.top.length)return `<div class="lbs"><div class="lbsh"><div><span class="lbk">Overall</span><b>All tests</b></div></div><div class="lbem">${ic('trophy',28)}<p>Attempt a test to enter the leaderboard.</p></div></div>`;
  const tot=b.total||1,beat=b.my_rank?(tot>1?Math.round((tot-b.my_rank)*100/(tot-1)):100):null;
  return `<div class="lbs"><div class="lbsh"><div><span class="lbk">Overall</span><b>All tests · average score</b></div><span class="lbt">${tot} students</span></div>
   ${b.my_rank?`<div class="lbme"><div class="lbmr"><span>Your rank</span><b>#${b.my_rank}</b></div><div class="grow"><div class="sm">Ahead of <b>${beat}%</b> students</div><div class="bar"><i style="width:${beat}%"></i></div><div class="sm mut" style="margin-top:4px">Your avg ${b.my_pct}% · Topper ${b.top[0].pct}%</div></div></div>`:''}
   ${lbPodium(b.top,b.my_rank)}${lbRows(b.top.slice(0,10),b.my_rank,b.my_pct+'%')}</div>`;
}
function lbTest(t){
  const r=LBC[t.id],when=t.opens_at?new Date(t.opens_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'';
  const head=`<div class="lbsh"><div><span class="lbk">Test</span><b>${esc(t.title)}</b></div><span class="lbt">${when}</span></div>`;
  if(!r)return `<div class="lbs" data-lbt="${t.id}">${head}<div class="sk" style="height:110px;border-radius:16px;margin-top:10px"></div><div class="sk" style="height:40px;margin-top:10px"></div></div>`;
  if(!r.ok||!r.top||!r.top.length)return `<div class="lbs">${head}<div class="lbem">${ic('trophy',28)}<p>No ranks yet for this test.</p>${t.attempts?'':`<button class="btn sm" onclick="openTest('${t.id}')">Attempt now</button>`}</div></div>`;
  const solo=r.total<2;
  return `<div class="lbs">${head}
   ${r.my_rank?`<div class="lbme"><div class="lbmr"><span>Your rank</span><b>#${r.my_rank}</b></div><div class="grow"><div class="lbm4"><div><b>${r.my_score}</b><span>Your score</span></div><div><b>${solo?'–':r.percentile}</b><span>Percentile</span></div><div><b>${r.avg}</b><span>Class avg</span></div><div><b>${r.top_score}</b><span>Topper</span></div></div></div></div>`
     :`<div class="lbme na"><div class="grow sm">You have not attempted this test yet.</div><button class="btn sm" onclick="openTest('${t.id}')">Attempt</button></div>`}
   ${lbPodium(r.top,r.my_rank)}${lbRows(r.top.slice(0,10),r.my_rank,r.my_score)}
   <div class="sm mut" style="text-align:center;margin-top:8px">${r.total} student${r.total==1?'':'s'} attempted · best score per student</div></div>`;
}
function lbFull(b){
  if(typeof CAT==='undefined'||!CAT)return '';
  const T=lbTests(),n=T.length+1;LBI=Math.min(LBI,n-1);
  const tabs=[`<button class="${LBI===0?'on':''}" onclick="lbGo(0)">🏆 Overall</button>`,...T.map((t,i)=>`<button class="${LBI===i+1?'on':''}" onclick="lbGo(${i+1})">${esc(t.title)}</button>`)].join('');
  setTimeout(lbLoad,0);
  return `<div class="lbwrap"><div class="lbtabs" id="lbtabs">${tabs}</div>
   <div class="lbtrack" id="lbtrack" onscroll="lbScroll()"><div class="card lbslide">${lbOverall(b)}</div>${T.map(t=>`<div class="card lbslide" id="lbs-${t.id}">${lbTest(t)}</div>`).join('')}</div>
   ${n>1?`<div class="lbnav"><button class="iconbtn sm" aria-label="Previous" onclick="lbGo(LBI-1)">${ic('left',18)}</button><div class="lbdots">${Array.from({length:n},(_,i)=>`<i class="${i===LBI?'on':''}"></i>`).join('')}</div><button class="iconbtn sm" aria-label="Next" onclick="lbGo(LBI+1)">${ic('right',18)}</button></div><div class="sm mut lbhint">Swipe ← → to see every test's leaderboard</div>`:''}</div>`;
}
function lbGo(i){const t=$('#lbtrack');if(!t)return;const n=t.children.length;LBI=Math.max(0,Math.min(n-1,i));t.scrollTo({left:LBI*t.clientWidth,behavior:'smooth'});lbMark()}
function lbMark(){
  document.querySelectorAll('#lbtabs button').forEach((b,j)=>b.classList.toggle('on',j===LBI));
  document.querySelectorAll('.lbdots i').forEach((d,j)=>d.classList.toggle('on',j===LBI));
  const a=document.querySelector('#lbtabs .on');if(a){const p=a.parentNode;p.scrollTo({left:a.offsetLeft-p.clientWidth/2+a.clientWidth/2,behavior:'smooth'})}
  const t=$('#lbtrack');if(t){const s=t.children[LBI];if(s)t.style.height=s.offsetHeight+'px'}
}
let LBS=null;function lbScroll(){clearTimeout(LBS);LBS=setTimeout(()=>{const t=$('#lbtrack');if(!t)return;const i=Math.round(t.scrollLeft/Math.max(1,t.clientWidth));if(i!==LBI){LBI=i;lbMark()}},70)}
async function lbLoad(){
  const T=lbTests();lbMark();
  await Promise.all(T.map(async t=>{
    if(!LBC[t.id]){const r=await rpc('cbt_leaderboard',{p_test:t.id});LBC[t.id]=r&&r.ok?r:{ok:false}}
    const el=document.getElementById('lbs-'+t.id);if(el){el.innerHTML=lbTest(t);if(T.indexOf(t)+1===LBI)lbMark()}
  }));
  const t=$('#lbtrack');if(t&&LBI){t.scrollLeft=LBI*t.clientWidth}lbMark();
}
addEventListener('resize',()=>{const t=$('#lbtrack');if(t)t.scrollLeft=LBI*t.clientWidth;lbMark()});
/* refresh per-test ranks when the student comes back to Home */
{const _vh3=viewHome;viewHome=function(tab){if(tab==='dash')for(const k in LBC)if(LBC[k]&&Date.now()-(LBC[k]._t||(LBC[k]._t=Date.now()))>120000)delete LBC[k];return _vh3.apply(this,arguments)}}

/* ---------- Home: compact rank card → full leaderboard lives in Results ---------- */
function dashLb(b){
  const go=`HV='lb';location.hash='#/r'`;
  if(!b||!b.my_rank)return `<div class="card lbteaser" onclick="${go}"><div class="lbti">🏆</div><div class="grow"><b>Leaderboard</b><div class="sm mut">Attempt a test to get your rank in every test.</div></div>${ic('right',18)}</div>`;
  const tot=b.total||1,beat=tot>1?Math.round((tot-b.my_rank)*100/(tot-1)):100,t3=(b.top||[]).slice(0,3);
  return `<div class="card lbteaser" onclick="${go}"><div class="lbmr"><span>Rank</span><b>#${b.my_rank}</b></div>
   <div class="grow"><b>Ahead of ${beat}% students</b><div class="sm mut">of ${tot} · tap to see test-wise ranks</div>
   <div class="lbt3">${t3.map((x,i)=>`<span class="m${i+1}">${['🥇','🥈','🥉'][i]} ${lbFirst(x)}</span>`).join('')}</div></div>${ic('right',18)}</div>`;
}

/* ---------- Results page: summary + Leaderboard / By test / All attempts ---------- */
if(typeof HV!=='undefined')HV='lb';
{const _hl=histList;histList=function(R){
  const P=pstats(R),b=INS&&INS.b,last=R[0],lp=last?pct(last.score,last.max):0,prev=R[1]?pct(R[1].score,R[1].max):null;
  const vals=R.slice(0,10).reverse().map(x=>pct(x.score,x.max));
  const hero=`<div class="card rshero"><div class="rsk"><div><b>${R.length}</b><span>Attempts</span></div><div><b>${P.avg}%</b><span>Average</span></div><div><b>${P.best}%</b><span>Best</span></div><div><b>${b&&b.my_rank?'#'+b.my_rank:'–'}</b><span>Overall rank</span></div></div>
    <div class="rsl"><div><span class="sm mut">Latest</span> <b>${lp}%</b> ${prev==null?'':`<span class="dlt ${lp-prev>0?'g':lp-prev<0?'b':''}">${lp-prev>0?'▲':lp-prev<0?'▼':''} ${Math.abs(lp-prev)}%</span>`}<div class="sm mut">${esc(last?last.title:'')}</div></div>${vals.length>1?`<div class="rsspark">${spark(vals)}</div>`:''}</div></div>`;
  const seg=`<div class="seg hsseg rs3"><button class="${HV==='lb'?'on':''}" onclick="HV='lb';route()">🏆 Leaderboard</button><button class="${HV==='test'?'on':''}" onclick="HV='test';route()">By test</button><button class="${HV==='all'?'on':''}" onclick="HV='all';route()">All attempts</button></div>`;
  if(HV==='lb'){
    if(!b)setTimeout(async()=>{const r=await rpc('cbt_overall',{});if(r.ok){INS=INS||{t:Date.now(),a:null,b:null};INS.b=r;const e=$('#rlb');if(e){e.innerHTML=lbFull(r)}const k=document.querySelector('.rsk div:last-child b');if(k&&r.my_rank)k.textContent='#'+r.my_rank}},0);
    return hero+seg+`<div id="rlb" style="margin-top:12px">${lbFull(b||null)}</div>`;
  }
  const h=_hl(R).replace(/^<div class="seg hsseg">[\s\S]*?<\/div>/,'');
  if(HV==='test')setTimeout(rsRanks,0);
  return hero+seg+h;
}}
async function rsRanks(){
  const ids=[...new Set((CAT.results||[]).map(r=>r.test_id))].filter(id=>!isPrac(id)).slice(0,12);
  await Promise.all(ids.map(async id=>{if(!LBC[id]){const r=await rpc('cbt_leaderboard',{p_test:id});LBC[id]=r&&r.ok?r:{ok:false}}}));
  document.querySelectorAll('.hscard').forEach(c=>{
    const m=(c.getAttribute('onclick')||'').match(/#\/h\/([^']+)/);if(!m)return;
    const g=hAttempts(decodeURIComponent(m[1]));if(!g)return;const r=LBC[g.att[g.att.length-1].test_id];
    if(r&&r.ok&&r.my_rank&&!c.querySelector('.rkc')){const b=c.querySelector('.grow b');if(b)b.insertAdjacentHTML('afterend',`<span class="rkc ${r.my_rank<=3?'top':''}">${r.my_rank<=3?['🥇','🥈','🥉'][r.my_rank-1]:'🏆'} Rank ${r.my_rank}/${r.total}</span>`)}
  });
}
;(window.__p=window.__p||{})['app10']=1;
