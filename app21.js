/* app21: Library (#/lib), Notes & PDFs (#/notes), PDF button on tests, study tools.
   PDF links come from the server (supabase_v51_test_pdf.sql, cbt_test_pdfs) only for tests the student can open.
   Before that SQL is run, the call fails quietly and no PDF button shows. */
IC.bag='<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>';
IC.calc='<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>';
IC.timer='<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>';
IC.pdf='<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M8 15h1.5a1.5 1.5 0 000-3H8v5M13 12v5h1a2 2 0 002-2v-1a2 2 0 00-2-2z"/>';
IC.layers='<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';

let PDFS=null,PDFAT=0,pdfBusy=null;
const idOk=i=>/^[A-Za-z0-9_-]{1,64}$/.test(String(i));
const pdfOk=u=>typeof u==='string'&&u.length<=500&&/^https:\/\/(drive|docs)\.google\.com\/[A-Za-z0-9/_?=&%.#~+-]+$/.test(u);
function loadPdfs(force){
  if(!AUTH)return Promise.resolve({});
  if(PDFS&&!force&&Date.now()-PDFAT<300000)return Promise.resolve(PDFS);
  if(pdfBusy)return pdfBusy;
  pdfBusy=rpc('cbt_test_pdfs',{}).then(r=>{
    const o={};
    if(r&&r.ok&&r.items)for(const k in r.items){const x=r.items[k];if(idOk(k)&&x&&pdfOk(x.url))o[k]={url:x.url,label:String(x.label||'')}}
    PDFS=o;PDFAT=Date.now();return o;
  }).catch(()=>(PDFS=PDFS||{})).finally(()=>{pdfBusy=null});
  return pdfBusy;
}
function openPdf(id){
  const p=PDFS&&PDFS[id];if(!p||!pdfOk(p.url))return toast('PDF not available');
  const w=window.open(p.url,'_blank','noopener,noreferrer');if(w)w.opener=null;
}
/* PDF button next to a test that has notes */
if(typeof testRow==='function'){
  const _tr=testRow;
  testRow=function(t){
    const h=_tr(t),p=PDFS&&PDFS[t.id];
    if(!p)return h;
    return h.replace('<div class="acts">',`<div class="acts"><button class="btn soft sm pdfb" onclick="openPdf('${esc(String(t.id))}')">${ic('pdf')} PDF</button>`);
  };
}
/* fetch links in the background; re-draw a test list once they arrive */
function pdfWarm(){
  if(PDFS||!AUTH)return;
  loadPdfs().then(o=>{if(Object.keys(o).length&&!INTEST&&/^#\/(s|f|notes|lib)\b/.test(location.hash||''))route()});
}

/* ---------- Library ---------- */
function libTile(go,icon,t,s,n){
  return `<button class="card libt" onclick="${go}"><span class="libi">${ic(icon,22)}</span><span class="grow"><b>${t}</b><small>${s}</small></span>${n?`<span class="libn">${n}</span>`:''}${ic('right',18)}</button>`;
}
function viewLibrary(){
  const nNotes=PDFS?Object.keys(PDFS).length:0,hasPyq=typeof pqHead==='function';
  setApp(`<div class="wrap lib">
   <div class="libh"><div class="eyebrow">Your study space</div><h1>Library</h1><p class="mut">Revise, keep notes and use tools. Everything in one place.</p></div>
   <div class="h2s">Revise</div>
   <div class="libg">
    ${libTile("location.hash='#/m'",'notebook','Mistakes','Questions you got wrong')}
    ${libTile("location.hash='#/b'",'star','Saved','Questions you bookmarked',BM&&BM.size?BM.size:'')}
    ${hasPyq?libTile("location.hash='#/pyq'",'pyq','Previous year papers','Chapter-wise PYQ'):''}
   </div>
   <div class="h2s">Study material</div>
   <div class="libg">
    ${libTile("location.hash='#/notes'",'pdf','Notes & PDFs','Notes for your tests',nNotes||'')}
    ${libTile("location.hash='#/n'",'bell','Notices','Updates from your teachers')}
   </div>
   <div class="h2s">Progress</div>
   <div class="libg">
    ${libTile("location.hash='#/t'",'pulse','Tracker','Your syllabus and daily progress')}
    ${libTile("location.hash='#/r'",'trophy','Results','Scores, ranks and analysis')}
   </div>
   <div class="h2s">Tools</div>
   <div class="libg">
    ${libTile('toolMarks()','calc','Marks calculator','NEET / JEE score from right and wrong')}
    ${libTile('toolTimer()','timer','Focus timer','25 or 50 minute study sessions')}
   </div>
   <a class="card libstore" href="store.html">${ic('bag',22)}<span class="grow"><b>Get more test series</b><small>Open the store</small></span>${ic('right',18)}</a>
  </div>`);
  pdfWarm();
}
async function viewNotes(){
  setApp(`<div class="wrap lib"><div class="crumb"><a href="#/lib">${ic('left',16)} Library</a></div><h1 style="margin:6px 0 14px">Notes & PDFs</h1><div class="card"><div class="sk" style="height:60px"></div></div></div>`);
  const o=await loadPdfs(true);if(location.hash!=='#/notes')return;
  const T=(CAT&&CAT.tests||[]).filter(t=>o[t.id]);
  const by=new Map();for(const t of T){const k=t.series_id;if(!by.has(k))by.set(k,[]);by.get(k).push(t)}
  const sname=id=>{const s=(CAT.series||[]).find(x=>x.id===id);return s?s.title:'Tests'};
  setApp(`<div class="wrap lib"><div class="crumb"><a href="#/lib">${ic('left',16)} Library</a></div><h1 style="margin:6px 0 14px">Notes & PDFs</h1>
   ${T.length?[...by].map(([sid,ts])=>`<div class="h2s">${esc(sname(sid))}</div><div class="libg">${ts.map(t=>`<button class="card libt" onclick="openPdf('${esc(String(t.id))}')"><span class="libi">${ic('pdf',22)}</span><span class="grow"><b>${esc(o[t.id].label||t.title)}</b><small>${esc(t.title)} · opens in Google Drive</small></span>${ic('right',18)}</button>`).join('')}</div>`).join('')
   :`<div class="card empty">${ic('pdf',30)}<h3 style="margin:10px 0 4px">No notes yet</h3><p class="sm mut">When your teacher adds a PDF to a test, it shows here and next to the test.</p></div>`}
  </div>`);
}

/* ---------- tools (work offline, nothing is sent) ---------- */
function toolMarks(){
  sheet(`<h2 class="sht">Marks calculator</h2><div class="shl"></div>
   <div class="seg" id="mkx" style="margin-bottom:12px"><button class="on" data-p="4,1">NEET / JEE (+4 −1)</button><button data-p="1,0">+1, no minus</button></div>
   <div class="tlg"><label class="pfl">Correct</label><input class="pfi" id="mk_c" type="number" inputmode="numeric" min="0" value="0"></div>
   <div class="tlg"><label class="pfl">Wrong</label><input class="pfi" id="mk_w" type="number" inputmode="numeric" min="0" value="0"></div>
   <div class="tlr"><span class="mut">Score</span><b id="mk_s">0</b></div>`,'marks');
  const L=document.querySelector('#layer');let P=[4,1];
  const up=()=>{const c=Math.max(0,parseInt(L.querySelector('#mk_c').value,10)||0),w=Math.max(0,parseInt(L.querySelector('#mk_w').value,10)||0);L.querySelector('#mk_s').textContent=String(c*P[0]-w*P[1])};
  L.querySelectorAll('#mkx button').forEach(b=>b.onclick=()=>{L.querySelectorAll('#mkx button').forEach(x=>x.classList.toggle('on',x===b));P=b.dataset.p.split(',').map(Number);up()});
  L.querySelectorAll('input').forEach(i=>i.oninput=up);
}
let TMR=null;
function toolTimer(){
  sheet(`<h2 class="sht">Focus timer</h2><div class="shl"></div>
   <div class="seg" id="tmx" style="margin-bottom:14px"><button class="on" data-m="25">25 min</button><button data-m="50">50 min</button><button data-m="5">5 min break</button></div>
   <div class="tlt" id="tm_v">25:00</div>
   <div class="row" style="gap:10px;margin-top:14px"><button class="btn" style="flex:1" id="tm_go">${ic('play')} Start</button><button class="btn ghost" style="flex:1" id="tm_rs">Reset</button></div>
   <p class="sm mut" style="margin:12px 0 0">Keep this open while you study.</p>`,'timer');
  const L=document.querySelector('#layer');let len=25*60,left=len,end=0;
  const show=()=>{const v=L.querySelector('#tm_v');if(v)v.textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0')};
  const stop=()=>{clearInterval(TMR);TMR=null;const g=L.querySelector('#tm_go');if(g)g.innerHTML=ic('play')+' Start'};
  stop();
  L.querySelector('#tm_go').onclick=()=>{
    if(TMR){stop();return}
    end=Date.now()+left*1000;L.querySelector('#tm_go').innerHTML='Pause';
    TMR=setInterval(()=>{if(!document.querySelector('#layer .bsheet[data-id="timer"]')){clearInterval(TMR);TMR=null;return}
      left=Math.max(0,Math.round((end-Date.now())/1000));show();if(!left){stop();toast('Time up! Take a break.');try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}}},250);
  };
  L.querySelector('#tm_rs').onclick=()=>{stop();left=len;show()};
  L.querySelectorAll('#tmx button').forEach(b=>b.onclick=()=>{stop();L.querySelectorAll('#tmx button').forEach(x=>x.classList.toggle('on',x===b));len=left=+b.dataset.m*60;show()});
}

/* routes */
{
  const _r0=route0;
  route0=async function(){
    const h=location.hash||'#/';
    if(h==='#/lib'||h==='#/notes'){
      if(!CAT){skelPage();if(!(await loadCat()))return}
      return h==='#/lib'?viewLibrary():viewNotes();
    }
    const r=await _r0.apply(this,arguments);
    pdfWarm();
    return r;
  };
}

;(window.__p=window.__p||{})['app21']=1;
