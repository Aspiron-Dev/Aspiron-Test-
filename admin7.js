/* ================= v10 admin: installable admin app + Insights (advanced analytics & student follow-up) ================= */

/* ---------- admin app (separate icon, opens only the admin panel) ---------- */
let ADIP=null;
const admStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if('serviceWorker' in navigator&&/^https?:/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();ADIP=e;admInstUi()});
window.addEventListener('appinstalled',()=>{ADIP=null;admInstUi();toast('Admin app installed ✓')});
function admInstUi(){
  const show=!admStandalone();
  document.querySelectorAll('[data-ainst]').forEach(b=>b.style.display=show?'':'none');
}
async function installAdmin(){
  if(admStandalone()){toast('You are already using the admin app');return}
  if(ADIP){const p=ADIP;ADIP=null;p.prompt();try{const c=await p.userChoice;if(c&&c.outcome==='accepted')toast('Installing…')}catch(e){}return}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  modal(`<h2>📲 Install the admin app</h2><p class="sm mut" style="margin:4px 0 12px">It gets its own icon on your phone and opens straight into this panel. Students never see it.</p>
   <ol class="sm" style="padding-left:18px;line-height:1.8;margin:0 0 12px">${ios?'<li>Open this page in <b>Safari</b></li><li>Tap <b>Share</b> (square with arrow)</li><li>Tap <b>Add to Home Screen</b> → <b>Add</b></li>':'<li>Open this page in <b>Chrome</b></li><li>Tap <b>⋮</b> (top right)</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b></li>'}</ol>
   <p class="sm mut" style="margin:0 0 12px">🔒 Your password is still needed every time you open it, and it is forgotten when the app is closed.</p>
   <button class="btn block" onclick="closeModal()">Got it</button>`);
}

/* ---------- navigation: Insights page + install entry ---------- */
AI.insights='<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/><circle cx="20" cy="8" r="1.5"/>';
AI.install='<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>';
NAVX.splice(1,0,['insights','Insights']);
XTRA.push('insights');TTL.insights='Insights';
{const _t=tab;tab=async function(t){const r=await _t(t);if(t==='insights')return loadInsights();return r}}
{const _nh=navHtml;navHtml=function(){return _nh().replace('<div class="sfoot">',`<div class="sfoot"><button class="sni" data-ainst onclick="installAdmin()">${ai('install',19)}<span>Install admin app</span></button>`)}}
{const _m=openMore;openMore=function(){_m();const g=document.querySelector('#layer .mgrid2');if(!g)return;
  if(!g.querySelector('[data-in]'))g.insertAdjacentHTML('afterbegin',`<button class="mitem" data-in onclick="closeModal();tab('insights')">${ai('insights',20)}<span>Insights</span><em class="nb"></em></button>`);
  if(!g.querySelector('[data-ainst]'))g.insertAdjacentHTML('beforeend',`<button class="mitem" data-ainst onclick="closeModal();installAdmin()">${ai('install',20)}<span>Install admin app</span><em class="nb"></em></button>`);
  admInstUi()}}
setTimeout(admInstUi,1500);

/* ---------- Insights ---------- */
let IN={st:[],rs:[],range:30,q:''};
const pctOf=x=>x.max?Math.round(x.score*100/x.max):0;
const dayK=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()};
async function loadInsights(){
  const p=$('#pn_insights');if(!p)return;
  if(!p.querySelector('#inbody'))p.innerHTML=`<div class="phead"><div><h1>Insights</h1><p class="sm mut">How your students are doing — activity, scores, who needs a push and who is topping.</p></div></div><div id="inbody">${askel()}</div>`;
  const [s,r]=await Promise.all([A('students'),A('results',{})]);
  if(!s.ok||!r.ok){$('#inbody').innerHTML=`<div class="card empty"><b>Could not load</b><p class="sm">Check your internet and try again.</p><button class="btn" onclick="loadInsights()">Try again</button></div>`;return}
  IN.st=s.students||[];IN.rs=r.results||[];if(s.students){ST=s.students;try{badge()}catch(e){}}
  inDraw();
}
function inStats(){
  const now=Date.now(),D=864e5,since=now-IN.range*D;
  const st=IN.st.filter(x=>x.status!=='pending'),act=st.filter(x=>x.status!=='blocked');
  const R=IN.rs.filter(x=>x.at>=since);
  const by={};IN.rs.forEach(x=>{(by[x.mobile]=by[x.mobile]||{mobile:x.mobile,name:x.student,list:[]}).list.push(x)});
  const people=Object.values(by).map(o=>{const ps=o.list.map(pctOf);o.n=ps.length;o.avg=Math.round(ps.reduce((a,b)=>a+b,0)/ps.length);o.best=Math.max(...ps);o.last=Math.max(...o.list.map(x=>x.at));
    const srt=[...o.list].sort((a,b)=>a.at-b.at);o.trend=srt.length>1?pctOf(srt[srt.length-1])-pctOf(srt[0]):0;return o});
  const days=[];for(let i=IN.range-1;i>=0;i--){const d=new Date(now-i*D);days.push({k:dayK(d),l:d.getDate(),m:d.toLocaleDateString('en-IN',{month:'short'}),n:0})}
  const dm={};days.forEach(d=>dm[d.k]=d);R.forEach(x=>{const d=dm[dayK(x.at)];if(d)d.n++});
  const dist=Array(10).fill(0);R.forEach(x=>dist[Math.min(9,Math.floor(pctOf(x)/10))]++);
  const tests={};R.forEach(x=>{const t=tests[x.title]=tests[x.title]||{title:x.title,ps:[],stu:new Set()};t.ps.push(pctOf(x));t.stu.add(x.mobile)});
  const tl=Object.values(tests).map(t=>({title:t.title,n:t.ps.length,stu:t.stu.size,avg:Math.round(t.ps.reduce((a,b)=>a+b,0)/t.ps.length),hi:Math.max(...t.ps),lo:Math.min(...t.ps)})).sort((a,b)=>b.n-a.n);
  const seen=d=>act.filter(x=>x.last_seen&&now-x.last_seen<d*D).length;
  const attempted=new Set(R.map(x=>x.mobile)).size;
  return{st,act,R,people,days,dist,tl,today:IN.rs.filter(x=>dayK(x.at)===dayK(now)).length,activeToday:seen(1),active7:seen(7),
    avg:R.length?Math.round(R.map(pctOf).reduce((a,b)=>a+b,0)/R.length):null,attempted,
    inactive:act.filter(x=>!x.last_seen||now-x.last_seen>7*D).sort((a,b)=>(b.last_seen||0)-(a.last_seen||0)),
    never:act.filter(x=>!x.attempts),
    weak:people.filter(p=>p.n>=2&&p.avg<35).sort((a,b)=>a.avg-b.avg),
    top:people.filter(p=>p.n>=1).sort((a,b)=>b.avg-a.avg||b.n-a.n).slice(0,10),
    rising:people.filter(p=>p.n>=2&&p.trend>=10).sort((a,b)=>b.trend-a.trend).slice(0,5)};
}
function inDraw(){
  const S=inStats(),b=$('#inbody');if(!b)return;
  const box=(n,l,c,suf)=>`<div class="sbox"><b ${c?`style="color:${c}"`:''}>${n==null?'–':n}${n==null?'':suf||''}</b><span>${l}</span></div>`;
  const mx=Math.max(1,...S.days.map(d=>d.n)),dmx=Math.max(1,...S.dist);
  const rng=k=>`<button class="${IN.range===k?'on':''}" onclick="IN.range=${k};inDraw()">${k} days</button>`;
  const step=Math.ceil(S.days.length/10);
  b.innerHTML=`<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px"><div class="seg inseg">${rng(7)}${rng(30)}${rng(90)}</div>
    <div class="row" style="gap:8px"><button class="btn ghost sm" onclick="loadInsights()">${ai('reset',14)} Refresh</button><button class="btn soft sm" onclick="inCsv()">${ai('dl',14)} Report CSV</button></div></div>
   <div class="sstats in8">${box(S.act.length,'Students')}${box(S.activeToday,'Active today','var(--ok)')}${box(S.active7,'Active 7 days')}${box(S.today,'Attempts today')}${box(S.R.length,`Attempts (${IN.range}d)`)}${box(S.attempted,'Students tested')}${box(S.avg,'Average score','','%')}${box(S.act.length?Math.round(S.attempted*100/S.act.length):0,'Participation','','%')}</div>
   <div class="h2s">Daily attempts <span class="n">last ${IN.range} days</span></div>
   <div class="card"><div class="inbars">${S.days.map((d,i)=>`<div title="${d.l} ${d.m}: ${d.n}"><i class="${d.n?'':'z'}" style="height:${d.n?Math.max(6,d.n/mx*100):2}%"></i><span>${i%step===0||i===S.days.length-1?d.l:''}</span></div>`).join('')}</div></div>
   <div class="ingrid">
    <div><div class="h2s">Score distribution</div><div class="card"><div class="inbars dist">${S.dist.map((n,i)=>`<div title="${i*10}-${i*10+10}%: ${n}"><b>${n||''}</b><i class="${n?'':'z'} c${i<4?'b':i<6?'w':'g'}" style="height:${n?Math.max(6,n/dmx*100):2}%"></i><span>${i*10}</span></div>`).join('')}</div><div class="sm mut" style="text-align:center;margin-top:4px">% score bands · ${S.R.length} attempts</div></div></div>
    <div><div class="h2s">🏆 Top students</div><div class="card inlist">${S.top.length?S.top.map((p,i)=>inRow(p,`<span class="rk r${i+1}">${i+1}</span>`,`<b>${p.avg}%</b><span class="sm mut">${p.n} test${p.n>1?'s':''}</span>`)).join(''):'<div class="sm mut">No attempts yet.</div>'}</div></div>
   </div>
   ${S.rising.length?`<div class="h2s">📈 Improving fast</div><div class="card inlist">${S.rising.map(p=>inRow(p,'<span class="rk up">▲</span>',`<b style="color:var(--ok)">+${p.trend}%</b><span class="sm mut">now ${pctOf([...p.list].sort((a,b)=>b.at-a.at)[0])}%</span>`,`Great progress ${p.name.split(' ')[0]}! Your score went up by ${p.trend}%. Keep it up 💪`)).join('')}</div>`:''}
   <div class="h2s">⚠️ Needs attention <span class="n">${S.weak.length+S.inactive.length+S.never.length}</span></div>
   <div class="card">
    <div class="seg inseg2">${[['weak','Low scores',S.weak.length],['inactive','Inactive 7+ days',S.inactive.length],['never','Never attempted',S.never.length]].map(x=>`<button class="${(IN.att||'weak')===x[0]?'on':''}" onclick="IN.att='${x[0]}';inDraw()">${x[1]} <b>${x[2]}</b></button>`).join('')}</div>
    <div class="inlist" style="margin-top:8px">${inAttn(S)}</div></div>
   <div class="h2s">Test-wise performance <span class="n">${S.tl.length}</span></div>
   ${S.tl.length?`<div class="card scroll" style="padding:0"><table class="tbl"><thead><tr><th>Test</th><th>Attempts</th><th>Students</th><th>Avg</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>${S.tl.map(t=>`<tr><td><b>${esc(t.title)}</b><div class="inmini"><i style="width:${t.avg}%;background:${t.avg>=60?'var(--ok)':t.avg>=35?'var(--warn)':'var(--bad)'}"></i></div></td><td>${t.n}</td><td>${t.stu}</td><td><b>${t.avg}%</b></td><td>${t.hi}%</td><td>${t.lo}%</td></tr>`).join('')}</tbody></table></div>`:'<div class="card empty sm">No attempts in this period.</div>'}
   <div class="h2s">🔎 Look up a student</div>
   <div class="card"><input type="search" placeholder="Name or mobile number" value="${esc(IN.q)}" oninput="IN.q=this.value;inFind()" style="width:100%"><div id="infind" class="inlist" style="margin-top:8px">${inFindHtml()}</div></div>`;
}
function inRow(p,lead,end,wa){
  return `<div class="inr" onclick="inStudent('${esc(p.mobile)}')">${lead}<div class="grow"><b>${esc(p.name)}</b><div class="sm mut">${esc(p.mobile)}</div></div><div class="inend">${end}</div>${wa?`<a class="btn soft sm" onclick="event.stopPropagation()" target="_blank" rel="noopener" href="${waTo(p.mobile,wa)}">${ai('wa',14)}</a>`:''}</div>`;
}
function inAttn(S){
  const k=IN.att||'weak',site=siteUrl();
  if(k==='weak')return S.weak.length?S.weak.map(p=>inRow(p,`<span class="rk bad">${p.avg}%</span>`,`<span class="sm mut">${p.n} tests · best ${p.best}%</span>`,`Hi ${p.name.split(' ')[0]}, I saw your recent tests. Don't worry — revise your Mistake Notebook and attempt again. Message me if you need help 🙂 ${site}`)).join('')
    +inBulk(S.weak.map(p=>p.mobile)):'<div class="sm mut" style="padding:8px 2px">Nobody is below 35% average (2+ tests). 🎉</div>';
  const L=k==='inactive'?S.inactive:S.never;
  const msg=s=>k==='inactive'?`Hi ${s.name.split(' ')[0]}, we missed you! New tests are waiting for you. Open ${site} and keep your streak going 🔥`:`Hi ${s.name.split(' ')[0]}, your access is ready but you haven't taken a test yet. Start your first test today: ${site}`;
  return L.length?L.slice(0,50).map(s=>`<div class="inr" onclick="inStudent('${esc(s.mobile)}')"><span class="rk">${esc((s.name||'?')[0].toUpperCase())}</span><div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)} · ${k==='inactive'?'seen '+(s.last_seen?ago(s.last_seen):'never'):'joined '+(s.created?ago(s.created):'')}</div></div><a class="btn soft sm" onclick="event.stopPropagation()" target="_blank" rel="noopener" href="${waTo(s.mobile,msg(s))}">${ai('wa',14)}</a></div>`).join('')
    +(L.length>50?`<div class="sm mut" style="padding:6px 2px">+${L.length-50} more</div>`:'')+inBulk(L.map(s=>s.mobile))
    :`<div class="sm mut" style="padding:8px 2px">${k==='inactive'?'Everyone was active in the last 7 days. 🎉':'Everyone has attempted at least one test. 🎉'}</div>`;
}
function inBulk(list){return list.length>1?`<div class="row" style="margin-top:10px;gap:8px"><button class="btn ghost sm" onclick='copyText(${JSON.stringify(list.join(", "))})'>Copy ${list.length} numbers</button><span class="sm mut">Paste into a WhatsApp broadcast list</span></div>`:''}
function inFindHtml(){
  const q=IN.q.trim().toLowerCase();if(q.length<2)return '<div class="sm mut">Type at least 2 letters or digits.</div>';
  const l=IN.st.filter(s=>(s.name||'').toLowerCase().includes(q)||String(s.mobile).includes(q)).slice(0,12);
  return l.length?l.map(s=>`<div class="inr" onclick="inStudent('${esc(s.mobile)}')"><span class="rk">${esc((s.name||'?')[0].toUpperCase())}</span><div class="grow"><b>${esc(s.name)}</b><div class="sm mut">${esc(s.mobile)} · ${s.attempts||0} tests · ${s.status==='blocked'?'<span style="color:var(--bad)">blocked</span>':s.status==='pending'?'pending':'seen '+(s.last_seen?ago(s.last_seen):'never')}</div></div>${ai('right',16)}</div>`).join(''):'<div class="sm mut">No student found.</div>';
}
function inFind(){const e=$('#infind');if(e)e.innerHTML=inFindHtml()}
function inStudent(mobile){
  const s=IN.st.find(x=>String(x.mobile)===String(mobile))||{name:'Student',mobile};
  const L=IN.rs.filter(x=>String(x.mobile)===String(mobile)).sort((a,b)=>a.at-b.at),ps=L.map(pctOf);
  const avg=ps.length?Math.round(ps.reduce((a,b)=>a+b,0)/ps.length):null;
  const rank=avg==null?null:inStats().people.filter(p=>p.avg>avg).length+1;
  const w=280,h=70,pts=ps.map((v,i)=>[ps.length<2?w/2:i*w/(ps.length-1),h-6-v/100*(h-12)]);
  const line=ps.length>1?`<svg viewBox="0 0 ${w} ${h}" class="inspark" preserveAspectRatio="none"><polyline fill="none" stroke="var(--pri)" stroke-width="2.5" vector-effect="non-scaling-stroke" points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/></svg>`:'';
  modal(`<div class="mhead"><h2>${esc(s.name)}</h2><button class="iconbtn" onclick="closeModal()" aria-label="Close">${ai('x',18)}</button></div>
   <div class="sm mut">${esc(s.mobile)} · ${s.status==='blocked'?'<b style="color:var(--bad)">Blocked</b>':s.status==='pending'?'Pending approval':'Active'} · seen ${s.last_seen?ago(s.last_seen):'never'}${s.devices!=null?` · ${s.devices}/${s.max_devices} devices`:''}</div>
   <div class="sstats" style="margin:14px 0">${[['Tests',L.length],['Average',avg==null?'–':avg+'%'],['Best',ps.length?Math.max(...ps)+'%':'–'],['Rank',rank?'#'+rank:'–']].map(x=>`<div class="sbox"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('')}</div>
   ${line?`<div class="sm mut" style="margin-bottom:4px">Score trend</div>${line}`:''}
   <div class="inlist" style="margin-top:10px;max-height:240px;overflow:auto">${L.length?[...L].reverse().map(x=>`<div class="inr"><div class="grow"><b>${esc(x.title)}</b><div class="sm mut">${new Date(x.at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} · ✓${x.correct} ✗${x.wrong} · ${Math.round((x.used||0)/60)} min</div></div><b>${pctOf(x)}%</b></div>`).join(''):'<div class="sm mut">No tests yet.</div>'}</div>
   <div class="row" style="margin-top:14px;gap:8px"><a class="btn soft" style="flex:1;text-decoration:none" target="_blank" rel="noopener" href="${waTo(s.mobile,`Hi ${(s.name||'').split(' ')[0]}, `)}">${ai('wa',16)} WhatsApp</a><a class="btn ghost" style="flex:1;text-decoration:none" href="tel:${esc(s.mobile)}">📞 Call</a></div>`,true);
}
function inCsv(){
  const S=inStats();
  dl(`insights-${IN.range}days.csv`,[['Name','Mobile','Tests','Average %','Best %','Change %','Last test'],...S.people.sort((a,b)=>b.avg-a.avg).map(p=>[p.name,p.mobile,p.n,p.avg,p.best,p.trend,new Date(p.last).toLocaleDateString('en-IN')])]);
}
;(window.__p=window.__p||{})['admin7']=1;
