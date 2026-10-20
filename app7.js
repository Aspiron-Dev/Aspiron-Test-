/* ===== v18: advanced Mistake notebook + Saved questions, shared revision (quiz) mode ===== */
IC.search=IC.search||'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>';
IC.note='<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4M8 9h8M8 13h5"/>';
IC.bolt='<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>';
IC.shuffle='<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>';
const qKey=it=>it.test_id+':'+it.qidx;

/* ---- personal notes + tags (saved on this phone) ---- */
const ntKey=()=>'cbt_qn_'+AUTH.mobile,tgKey=()=>'cbt_bt_'+AUTH.mobile;
const noteGet=k=>(LS.get(ntKey(),{})[k]||'');
const tagGet=k=>(LS.get(tgKey(),{})[k]||'');
const TAGS={imp:['⭐','Important'],rev:['🔁','Revise'],dbt:['❓','Doubt']};
function noteHtml(k){const n=noteGet(k);return n?`<div class="qnote" onclick="noteEdit('${k}')"><b>${ic('note',14)} My note</b><div>${esc(n)}</div></div>`:''}
function noteEdit(k){
  modal(`<h2>${ic('note',20)} My note</h2><p class="sm mut" style="margin:4px 0 10px">Write a trick, formula or reason you got it wrong. Saved on this phone.</p>
   <textarea id="qnt" maxlength="600" style="min-height:110px" placeholder="e.g. Remember: unit of k is s⁻¹ for first order">${esc(noteGet(k))}</textarea>
   <div class="row" style="margin-top:14px">${noteGet(k)?`<button class="btn ghost" style="flex:1" onclick="noteSave('${k}',1)">Delete</button>`:`<button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button>`}<button class="btn" style="flex:1" onclick="noteSave('${k}')">Save note</button></div>`);
  setTimeout(()=>{const t=$('#qnt');if(t)t.focus()},80);
}
function noteSave(k,del){
  const o=LS.get(ntKey(),{}),v=del?'':($('#qnt').value||'').trim();
  if(v)o[k]=v;else delete o[k];LS.set(ntKey(),o);closeModal();
  document.querySelectorAll(`[data-nk="${k}"]`).forEach(e=>e.innerHTML=noteHtml(k));
  document.querySelectorAll(`[data-nb="${k}"]`).forEach(e=>e.classList.toggle('on',!!v));
  toast(v?'Note saved':'Note removed');
}
const noteBtn=k=>`<button class="iconbtn sm ${noteGet(k)?'on':''}" data-nb="${k}" aria-label="My note" title="My note" onclick="noteEdit('${k}')">${ic('note',16)}</button>`;

/* ---- revision counter for today ---- */
const dayStr=()=>new Date().toDateString();
function rvToday(add){const o=LS.get('cbt_rvd',{});if(o.d!==dayStr()){o.d=dayStr();o.n=0}if(add){o.n+=add;LS.set('cbt_rvd',o);const e=document.querySelector('#rvtd');if(e)e.textContent=o.n}return o.n}

/* ================= Mistake notebook ================= */
let MKQ='';
function mkHead(){
  const c=MK.counts,tot=c.wrong+c.skipped,all=tot+c.mastered,mp=all?Math.round(c.mastered*100/all):0,td=rvToday();
  const kb=(k,t,n)=>`<button class="${MK.kind===k?'on':''}" onclick="mkKind('${k}')">${t}${n!=null?` <small>${n}</small>`:''}</button>`;
  const sb=(k,t)=>`<button class="chip ${MK.sec===k?'pri':''}" onclick="mkSec(${JSON.stringify(k).replace(/"/g,'&quot;')})">${esc(t)}</button>`;
  return `<div class="card nbhero"><div class="nbring">${ring(mp,86,8,'#fff')}<span><b>${mp}%</b><small>mastered</small></span></div>
   <div class="grow"><div class="sm" style="opacity:.85">Mistake notebook</div><div class="nbbig">${tot} <span>to revise</span></div>
   <div class="nbst"><span>✗ ${c.wrong} wrong</span><span>– ${c.skipped} skipped</span><span>✓ ${c.mastered} mastered</span></div></div></div>
   <div class="nbact"><button class="btn block" ${tot?'':'disabled'} onclick="mkSession()">${ic('bolt')} Start revision quiz</button>
   <div class="nbtd">${ic('target',16)}<span><b id="rvtd">${td}</b> revised today</span></div></div>
   <div class="seg nbseg">${kb('all','All',tot)}${kb('wrong','Wrong',c.wrong)}${kb('skipped','Skipped',c.skipped)}</div>
   ${c.secs.length>1?`<div class="chiprow">${sb('','All subjects')}${c.secs.map(s=>sb(s.sec,s.sec+' · '+s.n)).join('')}</div>`:''}
   <div class="qsearch">${ic('search',17)}<input id="mkq" type="search" placeholder="Search in your mistakes…" value="${esc(MKQ)}" oninput="MKQ=this.value;const l=$('#mklist');if(l)l.innerHTML=mkList()"></div>`;
}
const qMatch=(it,s)=>!s||[it.q,it.title,it.sec,...(it.options||[]),noteGet(qKey(it))].join(' ').toLowerCase().includes(s.toLowerCase());
function mkList(){
  const c=MK.counts;
  if(!MK.items.length)return `<div class="card empty">${ic('check',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">${c.wrong+c.skipped?'Nothing here':'All clear! 🎉'}</h3><p class="sm">${c.wrong+c.skipped?'No questions match this filter.':'Questions you get wrong or skip in tests will collect here for revision.'}</p></div>`;
  const l=MK.items.filter(it=>qMatch(it,MKQ));
  return (l.length?l.map(mkCard).join(''):`<div class="card empty"><p class="sm">No loaded question matches “${esc(MKQ)}”.</p></div>`)+(MK.more?`<div style="text-align:center;margin-top:8px"><button class="btn ghost" onclick="mkMore()">Load more</button></div>`:'');
}
function mkCard(it){
  const n=it._n,S=MK.st[n]||{},rev=S.pick!=null||S.show,q=it,k=qKey(it);
  return `<div class="card rv mkc qx" id="mk${n}"><div class="qxh"><span class="qno">Q${it.qidx+1}</span>${it.kind==='wrong'?`<span class="chip bad">✗ You chose ${L[it.mine]}</span>`:'<span class="chip">– Skipped</span>'}<span style="flex:1"></span>${noteBtn(k)}${bmBtn(it.test_id,it.qidx)}${rpBtn(it.test_id,it.qidx)}</div>
   <div class="qsrc">${ic('file',13)} ${esc(it.title)}${it.sec&&it.sec!=='General'?` · <b>${esc(it.sec)}</b>`:''}</div>
   <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
   ${q.options.map((o,j)=>{if(!o&&!(q.oimg&&q.oimg[j]))return '';const cls=rev?(j===q.answer?'c':(j===S.pick?'w':(it.kind==='wrong'&&j===it.mine?'was':''))):'';return `<div class="ro pick ${cls}" ${rev?'':`onclick="mkPick(${n},${j})"`}><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}${imgTag(q.oimg&&q.oimg[j],'oi')}</span>${rev&&j===q.answer?'<span class="tag g">Correct</span>':''}</div>`}).join('')}
   ${rev?`${S.pick!=null?`<div class="fb ${S.pick===q.answer?'g':'b'}">${S.pick===q.answer?'Correct! 🎉 You got it this time.':'Not quite — correct answer is '+L[q.answer]}</div>`:''}${q.explanation||q.eimg?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''}
   <div data-nk="${k}">${noteHtml(k)}</div>
   <div class="row" style="margin-top:12px"><button class="btn sm" style="flex:1" onclick="mkDone(${n})">${ic('check')} Mastered — remove</button><button class="btn ghost sm" style="flex:1" onclick="mkReset(${n})">Try again</button></div>`
   :`<div data-nk="${k}">${noteHtml(k)}</div><div class="row" style="margin-top:10px"><span class="sm mut" style="flex:1">Tap an option to practise</span><button class="btn ghost sm" onclick="mkShow(${n})">${ic('eye',15)} Show answer</button></div>`}</div>`;
}
{const _p=mkPick;mkPick=function(n,j){_p(n,j);rvToday(1)}}
async function mkSession(){
  toast('Preparing your revision quiz…');
  const r=await rpc('cbt_mistakes',{p_offset:0,p_limit:50,p_kind:MK.kind,p_sec:MK.sec});
  const l=(r.ok?r.items:MK.items).filter(x=>x.answer!=null);
  if(!l.length){toast('No questions to revise');return}
  rsStart(l,'mk','Mistake revision');
}

/* ================= Saved questions ================= */
let BVR=null;const BV={q:'',tag:'all',st:{}};
const bmPrac=()=>LS.get('cbt_bm_prac',0)===1;
function bmRender(r){
  BVR=r;
  setApp(`<div class="wrap">${tabsHtml('bm')}<div id="bmh">${bmHead()}</div><div id="bmbody">${bmBody()}</div></div>`);setNav('bm');
}
function bmHead(){
  const it=BVR.items,tests=new Set(it.map(x=>x.test_id)).size,sol=it.filter(x=>x.solved&&x.answer!=null).length;
  const T=LS.get(tgKey(),{}),cnt=t=>it.filter(x=>T[qKey(x)]===t).length;
  const tb=(k,t)=>`<button class="chip ${BV.tag===k?'pri':''}" onclick="BV.tag='${k}';bmRefresh()">${t}</button>`;
  return `<div class="card nbhero sv"><div class="svic">${ic('bmark',30)}</div><div class="grow"><div class="sm" style="opacity:.85">Saved questions</div><div class="nbbig">${it.length} <span>saved</span></div>
   <div class="nbst"><span>${tests} test${tests==1?'':'s'}</span><span>⭐ ${cnt('imp')}</span><span>🔁 ${cnt('rev')}</span><span>❓ ${cnt('dbt')}</span></div></div></div>
   ${it.length?`<div class="nbact"><button class="btn block" ${sol?'':'disabled'} onclick="bmSession()">${ic('bolt')} Practise saved (${sol})</button>
   <button class="nbtd tgl" onclick="LS.set('cbt_bm_prac',bmPrac()?0:1);BV.st={};bmRefresh()"><span class="tkoff ${bmPrac()?'on':''}"><i></i></span><span>Hide answers</span></button></div>
   <div class="chiprow">${tb('all','All')}${Object.keys(TAGS).map(k=>tb(k,TAGS[k][0]+' '+TAGS[k][1])).join('')}${tb('none','Untagged')}</div>
   <div class="qsearch">${ic('search',17)}<input type="search" placeholder="Search saved questions…" value="${esc(BV.q)}" oninput="BV.q=this.value;const b=$('#bmbody');if(b)b.innerHTML=bmBody()"></div>`:''}`;
}
function bmRefresh(){const h=$('#bmh'),b=$('#bmbody');if(h)h.innerHTML=bmHead();if(b)b.innerHTML=bmBody()}
function bmBody(){
  if(!BVR.items.length)return `<div class="card empty">${ic('bmark',30)}<h3 style="margin:10px 0 4px;color:var(--tx)">No saved questions yet</h3><p class="sm">Tap the ★ on any question during a test or review to save it here.</p></div>`;
  const T=LS.get(tgKey(),{});
  const l=BVR.items.filter(x=>{const t=T[qKey(x)]||'';return (BV.tag==='all'||(BV.tag==='none'?!t:t===BV.tag))&&qMatch(x,BV.q)});
  if(!l.length)return `<div class="card empty"><p class="sm">No saved question matches this filter.</p></div>`;
  const g={};l.forEach(x=>{(g[x.test_id]=g[x.test_id]||{title:x.title,items:[]}).items.push(x)});
  return Object.keys(g).map(tid=>`<details class="bmg" open><summary>${ic('file',18)}<span class="grow">${esc(g[tid].title)}</span><span class="n">${g[tid].items.length}</span>${ic('right',16)}</summary>${g[tid].items.map(bmCard).join('')}</details>`).join('');
}
function bmCard(q){
  const tid=q.test_id,k=qKey(q),S=BV.st[k]||{},ans=q.solved&&q.answer!=null,hide=ans&&bmPrac()&&S.pick==null&&!S.show,rev=ans&&!hide,tg=tagGet(k);
  return `<div class="card rv qx" data-bmcard="${k}"><div class="qxh"><span class="qno">Q${q.qidx+1}</span>${tg?`<span class="chip pri">${TAGS[tg][0]} ${TAGS[tg][1]}</span>`:''}<span style="flex:1"></span>${noteBtn(k)}${q.solved?rpBtn(tid,q.qidx):''}<button class="iconbtn sm on bmb" onclick="bmRemove('${tid}',${q.qidx})" aria-label="Remove from saved">${ic('star',17)}</button></div>
   <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
   ${q.options.map((op,j)=>{if(!op&&!(q.oimg&&q.oimg[j]))return '';const cls=rev?(j===q.answer?'c':(j===S.pick?'w':'')):'';return `<div class="ro ${hide?'pick':''} ${cls}" ${hide?`onclick="bmPick('${k}',${j})"`:''}><span class="k">${L[j]}</span><span style="flex:1">${esc(op)}${imgTag(q.oimg&&q.oimg[j],'oi')}</span>${rev&&j===q.answer?'<span class="tag g">Correct</span>':''}</div>`}).join('')}
   ${S.pick!=null?`<div class="fb ${S.pick===q.answer?'g':'b'}">${S.pick===q.answer?'Correct! 🎉':'Not quite — correct answer is '+L[q.answer]}</div>`:''}
   ${hide?`<div class="row" style="margin-top:6px"><span class="sm mut" style="flex:1">Tap an option to practise</span><button class="btn ghost sm" onclick="BV.st['${k}']={show:1};bmUp('${k}')">${ic('eye',15)} Show answer</button></div>`:''}
   ${rev&&(q.explanation||q.eimg)?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''}
   ${q.solved?'':`<div class="sm mut" style="margin-top:6px">${ic('lock',13)} ${q.hidden&&q.result_at?'The correct answer appears here after '+esc(fmtWhen(q.result_at))+'.':'The correct answer appears here after you attempt this test.'}</div>`}
   <div data-nk="${k}">${noteHtml(k)}</div>
   <div class="tgrow">${Object.keys(TAGS).map(t=>`<button class="tgb ${tg===t?'on':''}" onclick="bmTag('${k}','${t}')">${TAGS[t][0]} ${TAGS[t][1]}</button>`).join('')}</div></div>`;
}
const bmFind=k=>BVR.items.find(x=>qKey(x)===k);
function bmUp(k){const q=bmFind(k),e=document.querySelector(`[data-bmcard="${k}"]`);if(q&&e)e.outerHTML=bmCard(q)}
function bmPick(k,j){BV.st[k]={pick:j};if(navigator.vibrate)navigator.vibrate(8);rvToday(1);bmUp(k)}
function bmTag(k,t){const o=LS.get(tgKey(),{});if(o[k]===t)delete o[k];else o[k]=t;LS.set(tgKey(),o);bmUp(k);const h=$('#bmh');if(h){const v=h.querySelector('input')?.value;h.innerHTML=bmHead()}}
async function bmRemove(tid,i){
  const k=tid+':'+i,e=document.querySelector(`[data-bmcard="${k}"]`);if(e)e.classList.add('mkc','out');
  await toggleBM(tid,i,true);
  if(!BM.has(k)){BVR.items=BVR.items.filter(x=>qKey(x)!==k);BMC=BVR;setTimeout(bmRefresh,250);toast('Removed from saved')}
  else if(e)e.classList.remove('out');
}
function bmSession(){
  const T=LS.get(tgKey(),{});
  const l=BVR.items.filter(x=>x.solved&&x.answer!=null&&(BV.tag==='all'||(BV.tag==='none'?!T[qKey(x)]:T[qKey(x)]===BV.tag))&&qMatch(x,BV.q));
  if(!l.length){toast('No solved saved questions in this filter');return}
  rsStart(l,'bm','Saved questions practice');
}

/* ================= Revision quiz (full screen) ================= */
let RS=null;
function rsStart(list,src,title){
  const l=[...list];for(let i=l.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[l[i],l[j]]=[l[j],l[i]]}
  RS={l:l.slice(0,30),i:0,pick:{},src,title};rsDraw();
}
function rsDraw(){
  const n=RS.l.length;
  if(RS.i>=n)return rsEnd();
  const q=RS.l[RS.i],p=RS.pick[RS.i],done=p!=null,ok=Object.keys(RS.pick).filter(i=>RS.pick[i]===RS.l[i].answer).length;
  $('#layer').innerHTML=`<div class="rsx"><div class="rstop"><button class="iconbtn" onclick="rsClose()" aria-label="Close">${ic('x',20)}</button>
   <div class="grow"><b>${esc(RS.title)}</b><div class="sm mut">Question ${RS.i+1} of ${n} · ✓ ${ok}</div></div></div>
   <div class="rsbar"><i style="width:${Math.round(RS.i*100/n)}%"></i></div>
   <div class="rsbody"><div class="qsrc">${ic('file',13)} ${esc(q.title||'')} · Q${q.qidx+1}</div>
    <div class="qt">${esc(q.q)}</div>${imgTag(q.img)}
    ${q.options.map((o,j)=>{if(!o&&!(q.oimg&&q.oimg[j]))return '';const cls=done?(j===q.answer?'c':(j===p?'w':'')):'';return `<div class="ro pick ${cls}" ${done?'':`onclick="rsPick(${j})"`}><span class="k">${L[j]}</span><span style="flex:1">${esc(o)}${imgTag(q.oimg&&q.oimg[j],'oi')}</span></div>`}).join('')}
    ${done?`<div class="fb ${p===q.answer?'g':'b'}">${p===q.answer?'Correct! 🎉':'Wrong — correct answer is '+L[q.answer]}</div>${q.explanation||q.eimg?`<div class="exp"><b>Explanation:</b> ${esc(q.explanation||'')}${imgTag(q.eimg)}</div>`:''}<div data-nk="${qKey(q)}">${noteHtml(qKey(q))}</div>`:''}</div>
   <div class="rsfoot">${done?`<button class="btn block" onclick="RS.i++;rsDraw()">${RS.i+1<n?'Next question →':'See result'}</button>`:`<button class="btn ghost block" onclick="RS.i++;rsDraw()">Skip</button>`}</div></div>`;
  const b=document.querySelector('.rsbody');if(b)b.scrollTop=0;
}
function rsPick(j){RS.pick[RS.i]=j;rvToday(1);if(navigator.vibrate)navigator.vibrate(j===RS.l[RS.i].answer?10:[20,40,20]);rsDraw()}
function rsEnd(){
  const at=Object.keys(RS.pick).map(Number),ok=at.filter(i=>RS.pick[i]===RS.l[i].answer),pc=at.length?Math.round(ok.length*100/at.length):0;
  RS.ok=ok.map(i=>RS.l[i]);
  $('#layer').innerHTML=`<div class="rsx"><div class="rstop"><button class="iconbtn" onclick="rsClose()" aria-label="Close">${ic('x',20)}</button><div class="grow"><b>${esc(RS.title)}</b></div></div>
   <div class="rsbody rsend"><div class="nbring big">${ring(pc,140,11,ringCol(pc))}<span><b>${pc}%</b><small>score</small></span></div>
   <h2 style="margin:16px 0 4px">${pc>=80?'Excellent! 🔥':pc>=50?'Good progress 👍':'Keep practising 💪'}</h2>
   <p class="mut sm" style="margin:0 0 16px">${at.length} attempted · ${ok.length} correct · ${at.length-ok.length} wrong · ${RS.l.length-at.length} skipped</p>
   ${RS.src==='mk'&&ok.length?`<button class="btn block" id="rsm" onclick="rsMaster()">${ic('check')} Mark ${ok.length} correct as mastered</button>`:''}
   <button class="btn ghost block" style="margin-top:10px" onclick="rsStart(RS.l,RS.src,RS.title)">${ic('shuffle')} Practise again</button>
   <button class="btn ghost block" style="margin-top:10px" onclick="rsClose()">Done</button></div></div>`;
}
async function rsMaster(){
  const b=$('#rsm');if(b){b.disabled=true;b.textContent='Saving…'}
  let n=0;for(const it of RS.ok){const r=await rpc('cbt_mistake_done',{p_test:it.test_id,p_qidx:it.qidx,p_on:true});if(r.ok)n++}
  MKC=null;INS=null;toast(n+' marked as mastered ✓');rsClose();
}
function rsClose(){closeModal();const src=RS&&RS.src;RS=null;if(src==='mk'&&location.hash==='#/m'&&!MKC){MK=null;viewMistakes()}}
;(window.__p=window.__p||{})['app7']=1;
