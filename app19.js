/* ===== v19: English / हिंदी medium in the same test series + a clearer instructions page =====
   Server: supabase_v41_medium.sql — cbt_lang get | set (the student's medium per series), cbt_start gives the
   questions in ONE language, fixed for the whole attempt (a resumed attempt keeps it), and the result, answer key,
   mistakes and saved questions come in that language.
   Before v41 is run, cbt_lang is missing: everything here hides itself and the app works in English as before. */

IC.globe='<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>';
IC.shield='<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>';
RPC_RETRY.add('cbt_lang');

/* ---------- my medium ---------- */
let MED={ok:false,media:{},hi:new Set(),bi:new Set()};
async function medLoad(){
  const r=await rpc('cbt_lang',{p_action:'get',p_data:{}});
  if(r&&r.ok)MED={ok:true,media:r.media||{},hi:new Set((r.hi||[]).map(String)),bi:new Set((r.bi||[]).map(String))};
  else if(r&&r.error!=='network'&&r.error!=='server')MED={ok:false,media:{},hi:new Set(),bi:new Set()};
  return MED;
}
{const _lc=loadCat;loadCat=async function(silent){const x=await Promise.all([_lc(silent),medLoad().catch(()=>null)]);return x[0]}}
const medOf=sid=>MED.media[sid]||MED.media.default||null;          // 'en' | 'hi' | null (not chosen yet)
const serBi=sid=>MED.ok&&MED.bi.has(String(sid));                   // the series offers Hindi
const testHi=id=>MED.ok&&MED.hi.has(String(id));                     // this test can be given in Hindi
const langFor=t=>medOf(t.series_id)==='hi'&&testHi(t.id)?'hi':'en';   // what a new attempt of t gets
const LNAME={en:'English',hi:'हिंदी'};
async function medSet(sid,lang){
  const r=await rpc('cbt_lang',{p_action:'set',p_data:{k:sid,lang}});
  if(r&&r.ok){MED.media[sid]=lang;if(!MED.media.default)MED.media.default=lang;return true}
  if(!authErr(r))toast(r&&r.error==='network'?'No internet. Please try again.':'Could not save. Please try again.');
  return false;
}

/* ---------- series page: medium card ---------- */
function medCard(s){
  if(!serBi(s.id))return '';
  const m=medOf(s.id);
  if(!m)return `<div class="card mdc pick"><div class="mdh">${ic('globe',20)}<div><b>Choose your medium · अपना माध्यम चुनें</b><div class="sm mut">Tests in this series come in English or Hindi. You get every question in the medium you choose.</div></div></div>
    <div class="mdo"><button class="mdb" onclick="medChoose('${s.id}','en')"><span class="mdl">A</span><b>English</b><small>Questions in English</small></button><button class="mdb" onclick="medChoose('${s.id}','hi')"><span class="mdl">अ</span><b>हिंदी</b><small>प्रश्न हिंदी में</small></button></div></div>`;
  return `<div class="card mdc"><div class="mdh">${ic('globe',20)}<div class="grow"><span class="sm mut">${m==='hi'?'आपका माध्यम':'Your medium'}</span><b class="mdn">${LNAME[m]}</b></div><button class="btn ghost sm" onclick="medSheet('${s.id}')">${ic('edit',14)} Change</button></div>
    <div class="sm mut" style="margin-top:6px">${m==='hi'?'जिन टेस्ट में हिंदी उपलब्ध है, वे पूरे हिंदी में आएँगे। चल रहा टेस्ट अपनी भाषा नहीं बदलता।':'Every test comes in English. A test that is already running keeps its language.'}</div></div>`;
}
{const _vs=viewSeries;viewSeries=function(id){
  const r=_vs.apply(this,arguments);
  const s=CAT&&CAT.series.find(x=>x.id===id),hd=document.querySelector('#app .sv3');
  if(s&&hd)hd.insertAdjacentHTML('afterend',medCard(s));
  return r;
}}
function medSheet(sid,then){
  const m=medOf(sid);
  sheet(`<h2 class="sht">Medium · माध्यम</h2><div class="shl"></div>
   <p class="sm mut" style="margin:0 0 12px">The tests you start from now on come in this language. A test you have already started keeps its language until you submit it.</p>
   <div class="mdo"><button class="mdb ${m==='en'?'on':''}" onclick="medChoose('${sid}','en',${then?`'${then}'`:'null'})"><span class="mdl">A</span><b>English</b><small>Questions in English</small></button>
   <button class="mdb ${m==='hi'?'on':''}" onclick="medChoose('${sid}','hi',${then?`'${then}'`:'null'})"><span class="mdl">अ</span><b>हिंदी</b><small>प्रश्न हिंदी में</small></button></div>`,'medium');
}
async function medChoose(sid,lang,then){
  document.querySelectorAll('.mdb').forEach(b=>b.disabled=true);
  const ok=await medSet(sid,lang);
  document.querySelectorAll('.mdb').forEach(b=>b.disabled=false);
  if(!ok)return;
  closeModal();
  toast(lang==='hi'?'माध्यम: हिंदी ✓':'Medium: English ✓');
  if(then){const t=CAT.tests.find(x=>x.id===then);if(t)return instr(t,CAT.series.find(x=>x.id===t.series_id)||{})}
  if(!INTEST)route();
}

/* ---------- instructions page (before the start) ---------- */
const TX={
 en:{read:'Read before you start',q:'Questions',min:'Minutes',max:'Max marks',mark:'Marking scheme',right:'Correct',wrongA:'Wrong',skip:'Not answered',
  med:'Medium',medAll:'All questions will be in English.',medHiAll:'All questions will be in Hindi.',onlyEn:'This test is available only in English. All questions will be in English.',
  lockMed:'The medium is fixed when you start. It does not change during the test, even if you refresh or come back later.',change:'Change',choose:'Choose your medium to continue',
  timer:'Timer',timerT:'The countdown at the top right <b>never pauses</b> — not even if you refresh or close the app. Your answers are saved online as you go; when the time ends the test is submitted with them automatically.',
  pal:'Question palette',palT:'Shows the status of every question. Tap a number to jump to it.',
  btn:'Buttons',btnT:'<b>Save &amp; Next</b> saves your answer and moves ahead · <b>Mark &amp; Next</b> flags it to revisit · <b>Clear</b> removes your answer.',
  star:'Tap <b>★</b> to save a question for revision and <b>⚑</b> to report a mistake in it.',
  back:'You <b>cannot go back</b> to earlier questions once you move ahead.',free:'You can move freely between questions and change answers any time before you submit.',
  prac:'<b>Practice mode:</b> the correct answer and solution show right after you pick an option. A checked answer cannot be changed.',
  stay:'Stay on this screen',stayT:'Do not switch apps, open another tab or lock the phone during the test. Each time you leave you get a warning, and the timer keeps running.',
  rules:'Live test',nav:'Moving between questions',live1:'Live till',live2:'no new start after that.',res:'Your <b>result, rank and answer key</b> show after',first:'Only your <b>first attempt</b> counts for the rank.',
  nv:'Not visited',na:'Not answered',an:'Answered',mk:'Marked',am:'Answered & marked (counts)',
  decl:'I have read all the instructions. I will stay on this screen and I am ready to begin.',start:'Start test now',startP:'Start practice',opens:'Opens in',closed:'Closed',result:'result'},
 hi:{read:'शुरू करने से पहले पढ़ें',q:'प्रश्न',min:'मिनट',max:'अधिकतम अंक',mark:'अंक योजना',right:'सही उत्तर',wrongA:'गलत उत्तर',skip:'उत्तर नहीं दिया',
  med:'माध्यम',medAll:'सभी प्रश्न अंग्रेज़ी में होंगे।',medHiAll:'सभी प्रश्न हिंदी में होंगे।',onlyEn:'यह टेस्ट अभी केवल अंग्रेज़ी (English) में उपलब्ध है। सभी प्रश्न अंग्रेज़ी में आएँगे।',
  lockMed:'टेस्ट शुरू होते ही माध्यम तय हो जाता है। टेस्ट के बीच में भाषा नहीं बदलेगी — refresh करने या बाद में लौटने पर भी नहीं।',change:'बदलें',choose:'आगे बढ़ने के लिए अपना माध्यम चुनें',
  timer:'टाइमर',timerT:'ऊपर दाईं ओर का टाइमर <b>कभी नहीं रुकता</b> — पेज refresh करने या ऐप बंद करने पर भी नहीं। आपके उत्तर साथ-साथ online सेव होते रहते हैं; समय खत्म होने पर टेस्ट अपने आप submit हो जाता है।',
  pal:'प्रश्न पैलेट',palT:'हर प्रश्न की स्थिति दिखाता है। किसी भी नंबर पर टैप करके उस प्रश्न पर जाएँ।',
  btn:'बटन',btnT:'<b>Save &amp; Next</b> उत्तर सेव करके आगे बढ़ता है · <b>Mark &amp; Next</b> प्रश्न को दोबारा देखने के लिए चिह्नित करता है · <b>Clear</b> उत्तर हटाता है।',
  star:'<b>★</b> से प्रश्न को revision के लिए सेव करें और <b>⚑</b> से प्रश्न में गलती की रिपोर्ट करें।',
  back:'आगे बढ़ने के बाद आप <b>पिछले प्रश्नों पर वापस नहीं जा सकते</b>।',free:'Submit करने से पहले आप किसी भी प्रश्न पर जा सकते हैं और उत्तर बदल सकते हैं।',
  prac:'<b>Practice mode:</b> विकल्प चुनते ही सही उत्तर और हल दिख जाएगा। जाँचा गया उत्तर बदला नहीं जा सकता।',
  stay:'इसी स्क्रीन पर रहें',stayT:'टेस्ट के दौरान दूसरा ऐप या टैब न खोलें और फोन लॉक न करें। हर बार बाहर जाने पर चेतावनी मिलेगी और टाइमर चलता रहेगा।',
  rules:'लाइव टेस्ट',nav:'प्रश्नों के बीच जाना',live1:'लाइव',live2:'तक; उसके बाद नया attempt शुरू नहीं होगा।',res:'आपका <b>रिज़ल्ट, रैंक और उत्तर कुंजी</b> इसके बाद दिखेगी:',first:'रैंक में केवल आपका <b>पहला attempt</b> गिना जाएगा।',
  nv:'नहीं देखा',na:'उत्तर नहीं दिया',an:'उत्तर दिया',mk:'चिह्नित',am:'उत्तर दिया व चिह्नित (गिना जाएगा)',
  decl:'मैंने सभी निर्देश पढ़ लिए हैं। मैं इसी स्क्रीन पर रहूँगा/रहूँगी और टेस्ट शुरू करने के लिए तैयार हूँ।',start:'टेस्ट शुरू करें',startP:'Practice शुरू करें',opens:'खुलेगा',closed:'बंद',result:'रिज़ल्ट'}
};
function instr(t,s){
  s=s||{};
  const wait=isWait(t),closed=isClosed(t),bi=serBi(t.series_id)||testHi(t.id),m=medOf(t.series_id),need=bi&&!m;
  const L=langFor(t),X=TX[m==='hi'?'hi':'en'],mx=Math.round(t.questions*t.correct*100)/100;
  const off=need||wait||closed;
  let medBox;
  if(!bi)medBox=`<div class="im-med en"><span class="im-mi">A</span><div class="grow"><span class="im-k">${X.med}</span><b>English</b><div class="sm mut">${X.medAll}</div></div></div>`;
  else if(need)medBox=`<div class="im-med pick"><div class="im-k" style="margin-bottom:8px">${ic('globe',15)} Choose your medium · अपना माध्यम चुनें</div>
    <div class="mdo"><button class="mdb" onclick="medChoose('${t.series_id}','en','${t.id}')"><span class="mdl">A</span><b>English</b><small>All questions in English</small></button><button class="mdb" onclick="medChoose('${t.series_id}','hi','${t.id}')"><span class="mdl">अ</span><b>हिंदी</b><small>सभी प्रश्न हिंदी में</small></button></div></div>`;
  else if(m==='hi'&&L==='en')medBox=`<div class="im-med warn"><span class="im-mi">A</span><div class="grow"><span class="im-k">${X.med}: हिंदी</span><b>English only · केवल अंग्रेज़ी</b><div class="sm">${TX.hi.onlyEn}</div></div><button class="btn ghost sm" onclick="medSheet('${t.series_id}','${t.id}')">${X.change}</button></div>`;
  else medBox=`<div class="im-med ${L}"><span class="im-mi">${L==='hi'?'अ':'A'}</span><div class="grow"><span class="im-k">${X.med}</span><b>${LNAME[L]}</b><div class="sm mut">${L==='hi'?X.medHiAll:X.medAll}</div></div><button class="btn ghost sm" onclick="medSheet('${t.series_id}','${t.id}')">${X.change}</button></div>`;
  const li=(icn,title,txt)=>`<div class="im-li"><span class="im-ic">${ic(icn,17)}</span><div><b>${title}</b><div class="sm">${txt}</div></div></div>`;
  const live=(t.closes_at||t.result_at)&&!t.practice?li('calendar',X.rules,`${t.closes_at?`${X.live1} <b>${esc(fmtWhen(t.closes_at))}</b> ${X.live2} `:''}${t.result_at?`${X.res} <b>${esc(fmtWhen(t.result_at))}</b>. `:''}${X.first}`):'';
  setApp(`<div class="wrap"><div class="ins im" ${m==='hi'?'lang="hi"':''}><button class="btn ghost sm" onclick="route()">${ic('back')} Back</button>
  <div class="im-hero"><div class="im-hl"><span class="im-s">${esc(s.title||'')}</span><h1>${esc(t.title)}</h1>
    <div class="im-ch">${t.practice?'<span class="chip ok">Practice</span>':''}${t.lock_back?`<span class="chip warn">${ic('lock',12)} No going back</span>`:''}${bi&&m?`<span class="chip pri">${ic('globe',12)} ${LNAME[L]}</span>`:''}</div></div>
   <div class="im-st"><div><b>${t.questions}</b><span>${X.q}</span></div><div><b>${t.duration}</b><span>${X.min}</span></div><div><b>${mx}</b><span>${X.max}</span></div></div></div>
  ${medBox}
  ${bi&&!need?`<div class="im-lock">${ic('shield',16)}<span>${X.lockMed}</span></div>`:''}
  <div class="im-sec"><h3>${X.mark}</h3><div class="im-mk"><div class="g"><b>+${t.correct}</b><span>${X.right}</span></div><div class="b"><b>${t.wrong?'−'+t.wrong:'0'}</b><span>${X.wrongA}</span></div><div><b>0</b><span>${X.skip}</span></div></div></div>
  <div class="im-sec"><h3>${X.read}</h3>
   ${li('clock',X.timer,X.timerT)}
   ${live}
   ${li('grid',X.pal,`${X.palT}<div class="lg-row im-lg"><span><i class="lg nv">1</i>${X.nv}</span><span><i class="lg na">2</i>${X.na}</span><span><i class="lg ans">3</i>${X.an}</span><span><i class="lg mark">4</i>${X.mk}</span><span><i class="lg mans">5</i>${X.am}</span></div>`)}
   ${li('check',X.btn,X.btnT+' '+X.star)}
   ${t.practice?li('check','Practice',X.prac):''}
   ${li(t.lock_back?'lock':'info',X.nav,t.lock_back?X.back:X.free)}
  </div>
  <div class="stayw">${ic('info',18)}<span><b>${X.stay}.</b> ${X.stayT}</span></div>
  <div class="im-go"><label class="chk decl"><input type="checkbox" id="dc" ${need?'disabled':''} onchange="$('#sb').disabled=!this.checked||${off?'true':'false'}"><span class="sm">${need?TX.en.choose+' · '+TX.hi.choose:X.decl}</span></label>
  <button class="btn block" id="sb" disabled onclick="startTest('${t.id}')">${wait?`${ic('clock')} ${X.opens} <span data-op="${t.opens_at}">--:--</span>`:closed?`${ic('lock')} ${X.closed}${t.result_at?' · '+X.result+' '+esc(fmtWhen(t.result_at)):''}`:`${ic('play')} ${t.practice?X.startP:X.start}${bi&&m?' · '+LNAME[L]:''}`}</button></div></div></div>`);
}

/* ---------- during the test: the language is shown and never changes ---------- */
{const _st=startTest;startTest=async function(id){
  const t=CAT&&CAT.tests.find(x=>x.id===id);
  // a series that offers Hindi and no medium chosen yet: ask first (a test already running is resumed as it is)
  if(t&&serBi(t.series_id)&&!medOf(t.series_id)&&!getProg(id)&&!t.in_progress)return instr(t,CAT.series.find(x=>x.id===t.series_id)||{});
  const r=await _st.apply(this,arguments);
  if(INTEST&&T&&P){if(!P.lang){P.lang=T.lang||'en';saveProg()}}
  return r;
}}
{const _dr=draw;draw=function(){
  const r=_dr.apply(this,arguments);
  if(T&&T.lang==='hi'){
    const b=document.querySelector('.cbtbar .tb-title');if(b&&!b.querySelector('.lgb'))b.insertAdjacentHTML('beforeend',' <span class="lgb">हिंदी</span>');
    const q=document.querySelector('.qcard');if(q)q.setAttribute('lang','hi');
  }
  return r;
}}
{const _lw=leaveWarn;leaveWarn=function(){
  if(!(T&&T.lang==='hi'&&INTEST&&P))return _lw.apply(this,arguments);
  const n=P.leaves=(P.leaves||0)+1;saveProg();
  modal(`<div class="lvw" lang="hi"><div class="lvwi">${ic('info',24)}</div><h2>कृपया इसी स्क्रीन पर रहें</h2>
    <p>यह चेतावनी ${n} है। टेस्ट चलते समय आप स्क्रीन से बाहर गए। दूसरा ऐप या टैब खोलना या फोन लॉक करना मना है, और टाइमर चलता रहता है।</p>
    <button class="btn block" onclick="closeModal()">समझ गया, जारी रखें</button></div>`);
}}

/* ---------- result: which medium the attempt was in ---------- */
{const _sr=showResult;showResult=function(){
  const r=_sr.apply(this,arguments);
  const l=RV&&RV.result&&RV.result.lang;
  if(l==='hi'||(l==='en'&&RV.result.test_id&&serBi((CAT&&CAT.tests.find(x=>x.id===RV.result.test_id)||{}).series_id))){
    const h=document.querySelector('#app .rhero .mut.sm');if(h&&!h.querySelector('.lgb'))h.insertAdjacentHTML('beforeend',` · <span class="lgb">${ic('globe',12)} ${LNAME[l]}</span>`);
  }
  if(l==='hi'){const b=document.getElementById('rbody');if(b)b.setAttribute('lang','hi')}
  return r;
}}

/* ---------- styles ---------- */
document.head.insertAdjacentHTML('beforeend',`<style>
.mdc{margin-top:12px;padding:14px 16px}.mdc .mdh{display:flex;gap:12px;align-items:center}.mdc .mdh>svg{color:var(--pri);flex:none}
.mdc .mdn{display:block;font-size:18px}.mdc.pick{border:1.5px solid var(--pri);background:linear-gradient(180deg,var(--priSoft),var(--surface) 70%)}
.mdo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.mdb{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:14px;border-radius:14px;border:1.5px solid var(--bd);background:var(--surface);color:var(--tx);text-align:left;cursor:pointer;font:inherit;transition:border-color .15s,transform .15s}
.mdb:hover{border-color:var(--pri);transform:translateY(-1px)}.mdb.on{border-color:var(--pri);background:var(--priSoft)}.mdb:disabled{opacity:.6}
.mdb b{font-size:16px}.mdb small{color:var(--mut);font-size:12.5px}
.mdl{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--grad);color:#fff;font-weight:800;font-size:16px;margin-bottom:6px}
.lgb{display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:999px;background:var(--priSoft);color:var(--pri);font-size:11.5px;font-weight:700;vertical-align:middle}
.ins.im{max-width:680px}
.im-hero{margin-top:14px;border-radius:20px;padding:20px;background:var(--grad);color:#fff;box-shadow:0 14px 34px var(--glow)}
.im-hero h1{font-size:23px;margin:4px 0 0;line-height:1.25;color:#fff}.im-s{font-size:12.5px;opacity:.85;font-weight:600}
.im-ch{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.im-ch .chip{background:rgba(255,255,255,.2);color:#fff;border:0}
.im-st{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}
.im-st div{background:rgba(255,255,255,.16);border-radius:14px;padding:10px;text-align:center}.im-st b{display:block;font-size:21px}.im-st span{font-size:12px;opacity:.9}
.im-med{display:flex;gap:12px;align-items:center;margin-top:14px;padding:14px;border-radius:16px;border:1.5px solid var(--bd);background:var(--surface)}
.im-med b{display:block;font-size:17px}.im-k{font-size:12px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;display:flex;gap:6px;align-items:center}
.im-med.hi,.im-med.en{border-color:color-mix(in srgb,var(--ok) 45%,var(--bd))}.im-med.warn{border-color:var(--warn);background:var(--warnSoft)}
.im-med.pick{display:block;border-color:var(--pri);background:var(--priSoft)}
.im-mi{width:40px;height:40px;flex:none;border-radius:12px;display:grid;place-items:center;background:var(--grad);color:#fff;font-weight:800;font-size:18px}
.im-lock{display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:13px;color:var(--mut)}.im-lock svg{color:var(--ok);flex:none;margin-top:2px}
.im-sec{margin-top:16px;padding:16px;border-radius:16px;background:var(--surface);border:1px solid var(--bd)}
.im-sec h3{font-size:15px;margin:0 0 10px}
.im-mk{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.im-mk div{border-radius:12px;padding:10px;text-align:center;background:var(--surface2)}
.im-mk b{display:block;font-size:20px}.im-mk span{font-size:12px;color:var(--mut)}.im-mk .g{background:var(--okSoft)}.im-mk .g b{color:var(--ok)}.im-mk .b{background:var(--badSoft)}.im-mk .b b{color:var(--bad)}
.im-li{display:flex;gap:12px;padding:11px 0;border-top:1px dashed var(--bd)}.im-li:first-of-type{border-top:0;padding-top:2px}
.im-li b{font-size:14px}.im-ic{width:32px;height:32px;flex:none;border-radius:10px;display:grid;place-items:center;background:var(--priSoft);color:var(--pri)}
.im-lg{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px}.im-lg span{display:inline-flex;align-items:center;gap:5px;font-size:12.5px}
.im .stayw{margin-top:14px}
.im-go{position:sticky;bottom:0;margin:14px -4px 0;padding:12px 4px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,transparent,var(--bg) 22%)}
.im-go .decl{margin:0 0 10px}
@media (max-width:420px){.im-hero{padding:16px}.im-hero h1{font-size:20px}.im-st b{font-size:18px}.mdo{gap:8px}.mdb{padding:12px}}
</style>`);
;(window.__p=window.__p||{})['app19']=1;
