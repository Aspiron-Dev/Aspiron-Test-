/* ===== Create test: full-page editor for the paper text, answer key and question text ===== */
// Tap a box → it opens full screen like a notepad. "Done" puts the text back (and runs the box's own oninput).
let FE=null;
function feName(t){
  if(t.id==='raw')return ['Question paper text','Fix or paste the paper here. Each question starts with its number (1. or Q1.), options as (1)…(4) or (A)…(D).'];
  if(t.id==='key')return ['Answer key','One answer per number, e.g. 1. B  2. D  3. A  — or 1-2, 2-4 …'];
  const c=t.closest('.qed'),b=c&&c.querySelector('b');return [(b?b.textContent:'Question')+' text',''];
}
function feOpen(t){
  if(FE)return;const [title,hint]=feName(t);
  const w=document.createElement('div');w.id='fed';
  w.innerHTML=`<div class="fehd"><button class="btn ghost sm" id="fex" title="Cancel">✕</button><div class="grow"><b>${esc(title)}</b><div class="sm mut" id="fest"></div></div><button class="btn sm" id="feok">Done</button></div>
   ${hint?`<div class="sm mut fehint">${esc(hint)}</div>`:''}<textarea id="fet" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>`;
  document.body.appendChild(w);document.body.classList.add('feon');
  const a=w.querySelector('#fet');a.value=t.value;FE={t,a,old:t.value};
  a.addEventListener('input',feStat);a.addEventListener('keydown',e=>{if(e.key==='Escape')feClose(true);if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))feClose(true)});
  w.querySelector('#feok').onclick=()=>feClose(true);
  w.querySelector('#fex').onclick=()=>{if(a.value!==FE.old&&!confirm('Discard your changes?'))return;feClose(false)};
  feStat();setTimeout(()=>{a.focus();try{a.setSelectionRange(t.selectionStart||0,t.selectionStart||0)}catch(_){}},30);
}
let feT=null;
function feStat(){
  clearTimeout(feT);feT=setTimeout(()=>{
    if(!FE)return;const v=FE.a.value,s=$('#fest');if(!s)return;
    let x=`${v.split('\n').length} lines · ${v.length} characters`;
    try{
      if(FE.t.id==='key')x=`${CBTParser.parseKey(v).count} answers found · `+x;
      else if(FE.t.id==='raw'&&v.length<400000){const r=CBTParser.parse(v,($('#key')||{}).value||'');const n=r.questions.length,ok=r.questions.filter(q=>q.q&&q.options.every(Boolean)).length;x=`${n} questions found${n?` (${ok} with all 4 options)`:''} · `+x}
    }catch(_){}
    s.textContent=x;
  },300);
}
function feClose(save){
  if(!FE)return;const {t,a}=FE;FE=null;
  if(save&&t.value!==a.value){t.value=a.value;t.dispatchEvent(new Event('input',{bubbles:true}))}
  const w=$('#fed');if(w)w.remove();document.body.classList.remove('feon');t.blur();
}
document.addEventListener('click',e=>{
  const t=e.target;if(FE||!t||t.tagName!=='TEXTAREA')return;
  if(t.id==='raw'||t.id==='key'||t.closest('.qed'))feOpen(t);
});
;(window.__p=window.__p||{})['admin11']=1;
