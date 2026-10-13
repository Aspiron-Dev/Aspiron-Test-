async function saveFolder(sid,id){
  const r=await A('folder_save',{id:id||null,series_id:sid,title:$('#ft').value,sort_order:+$('#fo').value||0,active:$('#fa').checked});
  if(!r.ok){toast(r.error==='title'?'Please enter a name':'Could not save');return}
  closeModal();toast('Saved');OPEN[sid]=true;await loadContent();
}
async function delFolder(id){
  if(!confirm('Delete this folder? Its tests will stay in the series.'))return;
  const r=await A('folder_delete',{id});if(r.ok){closeModal();toast('Folder deleted');loadContent()}
}
function folderOpts(sid,sel){
  return '<option value="">No folder</option>'+CA.folders.filter(f=>f.series_id===sid).map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.title)}</option>`).join('');
}
function testModal(id){
  const t=CA.tests.find(x=>x.id===id);
  modal(`<h2>Test details</h2>
   <label class="l">Test name</label><input type="text" id="tt" value="${esc(t.title)}">
   <div class="g2"><div><label class="l">Series</label><select id="ts" onchange="$('#tfl').innerHTML=CA.folders.filter(f=>f.series_id===this.value).map(f=>'<option value=&quot;'+esc(f.title)+'&quot;>').join('')">${CA.series.map(s=>`<option value="${s.id}" ${s.id===t.series_id?'selected':''}>${esc(s.title)}</option>`).join('')}</select></div>
   <div><label class="l">Folder (type or pick)</label><input type="text" id="tf" list="tfl" value="${esc((CA.folders.find(f=>f.id===t.folder_id)||{}).title||'')}" autocomplete="off"><datalist id="tfl">${CA.folders.filter(f=>f.series_id===t.series_id).map(f=>`<option value="${esc(f.title)}">`).join('')}</datalist></div>
   <div><label class="l">Minutes</label><input type="number" id="td" value="${t.duration}"></div><div><label class="l">Order</label><input type="number" id="to" value="${t.sort_order}"></div>
   <div><label class="l">Marks per correct</label><input type="number" step="0.25" id="tc" value="${t.correct}"></div><div><label class="l">Negative marks</label><input type="number" step="0.25" id="tw" value="${t.wrong}"></div></div>
   <label class="l">Test starts at (empty = open now)</label><input type="datetime-local" id="tos" value="${toLocal(t.opens_at)}">
   <label class="chk"><input type="checkbox" id="tl" ${t.lock_back?'checked':''}><span>Don't allow going back to previous questions</span></label>
   <label class="chk"><input type="checkbox" id="tp" ${t.free_preview?'checked':''}><span>Free preview (open even if the series is paid)</span></label>
   <label class="chk"><input type="checkbox" id="tpr" ${PRAC.has(t.id)?'checked':''}><span>Practice mode (instant answer + explanation after each question)</span></label>
   <label class="chk"><input type="checkbox" id="ta" ${t.active?'checked':''}><span>Visible to students</span></label>
   <div class="row" style="margin-top:12px"><button class="btn" style="flex:1" onclick="saveTestMeta('${id}')">Save</button><button class="btn danger" onclick="delTest('${id}')">Delete</button></div>
   <p class="sm mut" style="margin:10px 0 0">${t.results} past attempt${t.results===1?'':'s'}. To change the questions, use the "Questions" button.</p>`,true);
}
async function saveTestMeta(id){
  let fid=null;
  try{fid=await resolveFolder($('#ts').value,$('#tf').value)}catch(e){return toast(e.message)}
  const r=await A('test_save',{id,series_id:$('#ts').value,folder_id:fid,opens_at:fromLocal($('#tos').value),title:$('#tt').value,duration:+$('#td').value,correct:+$('#tc').value,wrong:+$('#tw').value,
    sort_order:+$('#to').value||0,lock_back:$('#tl').checked,free_preview:$('#tp').checked,active:$('#ta').checked});
  if(!r.ok){toast(r.error==='title'?'Please enter a name':'Could not save');return}
  await setPrac(id,$('#tpr').checked);
  closeModal();toast('Saved');await loadContent();
}
async function delTest(id){
  const t=CA.tests.find(x=>x.id===id);
  if(!confirm(`Delete "${t.title}"? Students' past scores are kept, but they can no longer review the questions.`))return;
  const r=await A('test_delete',{id});if(r.ok){closeModal();toast('Test deleted');loadContent()}
}
function newTestIn(sid){tab('create').then(()=>{newTest();$('#ps').value=sid;onSeries()})}

/* ================= CREATE ================= */
let PDFBUF=null,V={only:false,page:0},S=[],CR=null;
const PAGE=20,JSZIP_URL='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',TESS_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const emptyQ=()=>({q:'',options:['','','',''],answer:null,explanation:'',sec:'',img:null,oimg:[null,null,null,null],eimg:null});
const normQ=q=>({q:q.q||'',options:[0,1,2,3].map(i=>(q.options&&q.options[i])||''),answer:Number.isInteger(q.answer)?q.answer:null,explanation:q.explanation||'',
  sec:q.sec||'',img:q.img||null,oimg:[0,1,2,3].map(i=>(q.oimg&&q.oimg[i])||null),eimg:q.eimg||null,gap:!!q.gap});
function buildCreate(){
  $('#pn_create').innerHTML=`
  <div id="editbar"></div>
  <div class="card"><h3>1. Question paper</h3>
   <p class="mut sm" style="margin:4px 0 12px">Upload a <b>PDF, Word (.docx), text (.txt) file or a photo</b> of the paper. It is read inside your browser. Scanned PDFs and photos are read with OCR (free, slower).</p>
   <input type="file" id="paper" accept=".pdf,.docx,.txt,.md,image/*,application/pdf"><p class="mut sm" id="pst"></p>
   <div class="row" style="margin-top:6px"><span class="sm mut">OCR language:</span><select id="olang" style="max-width:200px"><option value="eng">English</option><option value="eng+hin">English + Hindi</option></select><button class="btn ghost sm" id="ocrbtn" style="display:none" onclick="forceOcr()">Read this PDF with OCR</button></div>
   <label class="l">Extracted text (you can fix it or paste text directly)</label><textarea id="raw" style="min-height:130px"></textarea>
   <label class="l">Answer key file (only if the key is a separate file: PDF, Word, text or photo)</label>
   <input type="file" id="keyf" accept=".pdf,.docx,.txt,.md,image/*,application/pdf"><p class="mut sm" id="kst"></p>
   <label class="l">Answer key text (filled automatically, or paste it) e.g. 1. B &nbsp; 2. D &nbsp; 3. A</label><textarea id="key" style="min-height:80px"></textarea>
   <div class="row" style="margin-top:12px"><button class="btn" onclick="doParse()">Build questions</button>
   <label class="btn soft" style="cursor:pointer">Import old test file (.json)<input type="file" id="jf" accept=".json,application/json" style="display:none"></label></div></div>
  <div class="card" style="margin-top:14px"><h3>2. Test details</h3><div class="g2">
   <div><label class="l">Test name</label><input type="text" id="title" placeholder="NEET Mock Test 1"></div>
   <div><label class="l">Duration (min)</label><input type="number" id="dur" value="180"></div>
   <div><label class="l">Marks per correct</label><input type="number" step="0.25" id="pm" value="4"></div>
   <div><label class="l">Negative marks</label><input type="number" step="0.25" id="nm" value="1"></div></div>
   <label class="l">Test starts at (optional)</label><input type="datetime-local" id="opens"><p class="mut sm" style="margin:6px 0 0">Students cannot start the test before this time. Leave empty to open it immediately. Time is as per this phone.</p>
   <label class="chk"><input type="checkbox" id="lock"><span>Don't allow going back to previous questions</span></label>
   <label class="chk"><input type="checkbox" id="prev"><span>Free preview (open even if the series is paid)</span></label>
   <label class="chk"><input type="checkbox" id="prac"><span>Practice mode: show the correct answer and explanation right after each question</span></label></div>
  <div class="card" style="margin-top:14px"><h3>3. Subjects / sections</h3>
   <p class="mut sm" style="margin:4px 0 10px">Optional. For tests like NEET, students see Physics / Chemistry / Botany / Zoology tabs. Subject headings in the paper are detected automatically; or set them here.</p>
   <div id="secs"></div>
   <div class="row" style="margin-top:10px"><button class="btn ghost sm" onclick="presetSec('neet')">NEET preset</button><button class="btn ghost sm" onclick="presetSec('jee')">JEE preset</button><button class="btn ghost sm" onclick="addSec()">+ Add section</button><button class="btn soft sm" onclick="applySec()">Apply to questions</button><button class="btn ghost sm" onclick="clearSec()">No sections</button></div></div>
  <div class="card" style="margin-top:14px"><h3>4. Where should it appear?</h3><div class="g2">
   <div><label class="l">Series</label><select id="ps" onchange="onSeries()"></select></div>
   <div><label class="l">Folder (type a name or pick)</label><input type="text" id="pf" list="fl" placeholder="e.g. Day 1" autocomplete="off"><datalist id="fl"></datalist></div></div>
   <p class="mut sm" style="margin:10px 0 0">Type any folder name. If it does not exist yet it is created automatically. Leave empty for no folder. No series yet? Create one in the "Series &amp; tests" tab first.</p></div>
  <div id="sum" class="mut" style="margin:16px 0 8px;font-weight:600"></div><div id="probs"></div><div id="list"></div>
  <div class="card" id="outbox" style="display:none;margin-top:14px"><h3>5. Publish</h3>
   <p class="mut sm" style="margin:4px 0 12px">Students will see the test immediately (or at the start time you set).</p>
   <div class="row"><button class="btn" id="pubbtn" onclick="publish()">Publish test</button><button class="btn ghost" onclick="newTest()">Start over</button></div><p class="sm mut" id="pubst"></p></div>`;
  syncSelects();renderSecs();
}
function syncSelects(){
  const ps=$('#ps');if(!ps)return;const cur=ps.value;
  ps.innerHTML='<option value="">Choose a series…</option>'+CA.series.map(s=>`<option value="${s.id}">${esc(s.title)}${s.is_free?'':' (paid)'}</option>`).join('');
  if(cur&&CA.series.some(s=>s.id===cur))ps.value=cur;
  onSeries();
}
function onSeries(){
  const sid=$('#ps').value;
  $('#fl').innerHTML=CA.folders.filter(f=>f.series_id===sid).map(f=>`<option value="${esc(f.title)}">`).join('');
}
const toLocal=ms=>{if(!ms)return '';const d=new Date(+ms),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
const fromLocal=v=>v?new Date(v).getTime():null;
async function resolveFolder(sid,name){
  name=(name||'').trim();if(!name)return null;
  const f=CA.folders.find(x=>x.series_id===sid&&x.title.trim().toLowerCase()===name.toLowerCase());
  if(f)return f.id;
  const r=await A('folder_save',{series_id:sid,title:name});
  if(!r.ok)throw new Error('Could not create the folder');
  return r.id;
}
function newTest(){
  Q=[];S=[];EDIT=null;PDFBUF=null;V={only:false,page:0};
  for(const id of ['raw','key','title','pf','opens'])$('#'+id).value='';
  for(const id of ['paper','keyf','jf'])$('#'+id).value='';
  $('#pst').textContent='';$('#kst').textContent='';$('#dur').value=180;$('#pm').value=4;$('#nm').value=1;$('#lock').checked=false;$('#prev').checked=false;$('#prac').checked=false;
  $('#sum').textContent='';$('#list').innerHTML='';$('#probs').innerHTML='';$('#outbox').style.display='none';$('#editbar').innerHTML='';$('#pubbtn').textContent='Publish test';$('#ocrbtn').style.display='none';
  renderSecs();
}

/* ---- reading files ---- */
function loadScript(src,test){
  return new Promise((res,rej)=>{
    if(test())return res();
    const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Could not load a helper library. Check your internet connection.'));document.head.appendChild(s);
  });
}
async function pdfOpen(buf){
  if(!window.pdfjsLib)throw new Error('PDF reader could not load. Check your internet and reload.');
  return pdfjsLib.getDocument({data:buf.slice(0)}).promise;
}
async function pdfText(pdf,spaced,note){
  let out='';
  for(let p=1;p<=pdf.numPages;p++){
    const tc=await (await pdf.getPage(p)).getTextContent();
    let last=null,cur='',lines=[];
    for(const it of tc.items){
      const y=Math.round(it.transform[5]);
      if(last!==null&&Math.abs(y-last)>3){lines.push(cur);cur=''}
      cur+=it.str+(spaced?' ':'');last=y;
    }
    lines.push(cur);out+=lines.join('\n')+'\n';
    note.textContent=`Reading page ${p} of ${pdf.numPages}…`;
  }
  return out;
}
async function ocrRun(count,getCanvas,note){
  await loadScript(TESS_URL,()=>window.Tesseract);
  note.textContent='Starting OCR (first time downloads the language data, please wait)…';
  const w=await Tesseract.createWorker($('#olang').value,1,{logger:m=>{if(m.status==='recognizing text'&&m.progress!=null)note.dataset.p=Math.round(m.progress*100)}});
  let out='';
  try{
    for(let i=1;i<=count;i++){
      note.textContent=`OCR: reading page ${i} of ${count}… ${note.dataset.p?note.dataset.p+'%':''}`;
      const c=await getCanvas(i);
      const r=await w.recognize(c);out+=r.data.text+'\n';
    }
  }finally{await w.terminate()}
  return out;
}
async function pdfOcr(pdf,note){
  return ocrRun(pdf.numPages,async i=>{
    const pg=await pdf.getPage(i),vp=pg.getViewport({scale:2.2}),c=document.createElement('canvas');
    c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c;
  },note);
}
const SUP={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','−':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ'};
const SUB={'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','−':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','o':'ₒ','x':'ₓ','i':'ᵢ','n':'ₙ'};
const unxml=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
async function docxRead(f){
  await loadScript(JSZIP_URL,()=>window.JSZip);
  const z=await JSZip.loadAsync(await f.arrayBuffer());
  const df=z.file('word/document.xml');if(!df)throw new Error('This does not look like a Word (.docx) file. Old .doc files must be saved as .docx first.');
  const xml=await df.async('string');
  const rels={};const rf=z.file('word/_rels/document.xml.rels');
  if(rf)(await rf.async('string')).replace(/<Relationship\b[^>]*>/g,t=>{const id=(t.match(/\bId="([^"]+)"/)||[])[1],tg=(t.match(/\bTarget="([^"]+)"/)||[])[1];if(id&&tg)rels[id]=tg});
  const imgs=[],idx={};
  const paras=xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g)||[];
  const lines=[];
  for(const p of paras){
    let line='',va='';
    const re=/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<m:t(?:\s[^>]*)?>([^<]*)<\/m:t>|<w:br\s*\/>|<w:tab\s*\/>|<a:blip\s[^>]*?r:embed="([^"]+)"|<v:imagedata\s[^>]*?r:id="([^"]+)"|<w:vertAlign\s+w:val="(superscript|subscript)"\s*\/>|<\/w:r>/g;
    let m;
    while((m=re.exec(p))){
      if(m[1]!=null||m[2]!=null){
        let t=unxml(m[1]!=null?m[1]:m[2]);
        if(va==='superscript')t=[...t].map(c=>SUP[c]||c).join('');
        else if(va==='subscript')t=[...t].map(c=>SUB[c]||c).join('');
        line+=t;
      }else if(m[0]==='</w:r>'){va=''}
      else if(m[5]){va=m[5]}
      else if(m[3]||m[4]){
        const tg=rels[m[3]||m[4]];
        if(tg&&/\.(png|jpe?g|gif|webp|bmp)$/i.test(tg)){
          const path=tg.startsWith('/')?tg.slice(1):'word/'+tg.replace(/^\.\//,'');
          if(!(path in idx)){
            const ze=z.file(path);
            if(ze){const ext=path.split('.').pop().toLowerCase();const mime=ext==='jpg'?'jpeg':ext;
              try{imgs.push('data:image/'+mime+';base64,'+await ze.async('base64'));idx[path]=imgs.length-1}catch(e){idx[path]=-1}}
            else idx[path]=-1;
          }
          if(idx[path]>=0)line+=` ⟦IMG:${idx[path]}⟧ `;
        }
      }
      else line+=' ';
    }
    lines.push(line);
  }
  return{text:lines.join('\n'),images:imgs};
}
async function readAny(f,note,isKey){
  const n=f.name.toLowerCase();
  if(n.endsWith('.pdf')||f.type==='application/pdf'){
    const buf=await f.arrayBuffer();
    if(!isKey)PDFBUF=buf;
    const pdf=await pdfOpen(buf);
    let t=await pdfText(pdf,isKey,note);
    const chars=t.replace(/\s/g,'').length;
    if(chars<40*pdf.numPages){
      if(confirm('This PDF looks like a scanned image (no typed text found). Read it with OCR? This is free but can take a few minutes.'))t=await pdfOcr(pdf,note);
    }else if(!isKey)$('#ocrbtn').style.display='';
    return{text:t};
  }
  if(n.endsWith('.docx'))return isKey?{text:(await docxRead(f)).text}:docxRead(f);
  if(n.endsWith('.doc'))throw new Error('Old .doc files are not supported. Open it in Word and "Save as" .docx, or save as PDF.');
  if(f.type.startsWith('image/')){
    const url=URL.createObjectURL(f);
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Could not open this image'));i.src=url});
    const scale=Math.min(2.5,2400/Math.max(img.width,img.height));
    const c=document.createElement('canvas');c.width=img.width*scale;c.height=img.height*scale;const cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,c.width,c.height);cx.drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(url);
    return{text:await ocrRun(1,async()=>c,note)};
  }
  return{text:await f.text()};
}
async function forceOcr(){
  if(!PDFBUF)return;const note=$('#pst');
  try{note.textContent='Starting OCR…';const pdf=await pdfOpen(PDFBUF);$('#raw').value=await pdfOcr(pdf,note);note.textContent='OCR finished. OCR can make mistakes, so please check the questions below.';doParse()}
  catch(e){note.textContent='OCR failed: '+e.message}
}
document.addEventListener('change',async e=>{
  const id=e.target.id;
  if(id==='jf')return importJson(e.target.files[0]);
  if(id!=='paper'&&id!=='keyf')return;
  const f=e.target.files[0];if(!f)return;
  const note=$(id==='paper'?'#pst':'#kst');note.textContent='Reading file…';delete note.dataset.p;
  try{
    if(id==='paper'){
      PDFBUF=null;$('#ocrbtn').style.display='none';
      const r=await readAny(f,note,false);
      $('#raw').value=r.text;RAWIMG=r.images||[];
      if(!$('#title').value)$('#title').value=f.name.replace(/\.[a-z0-9]+$/i,'');
      note.textContent='Done. Please check the text below.';
    }else{
      const r=await readAny(f,note,true);
      $('#key').value=r.text.replace(/⟦IMG:\d+⟧/g,'');
      const n=CBTParser.parseKey($('#key').value).count;
      note.textContent=n?`Done. Found ${n} answers in the key.`:'No answers found. If this is a scan, try again with OCR or paste the key text.';
    }
    if($('#raw').value.trim())await doParse();
  }catch(err){note.textContent='Could not read this file: '+err.message}
  e.target.value='';
});
let RAWIMG=[];
async function importJson(f){
  if(!f)return;
  try{
    const j=JSON.parse(await f.text());
    const qs=Array.isArray(j)?j:j.questions;
    if(!Array.isArray(qs)||!qs.length)throw new Error('no questions');
    Q=qs.map(normQ);S=deriveSections();
    if(!Array.isArray(j)){
      $('#title').value=j.title||'';if(j.duration)$('#dur').value=j.duration;
      if(j.correct!=null)$('#pm').value=j.correct;if(j.wrong!=null)$('#nm').value=j.wrong;$('#lock').checked=!!j.lockBack;
    }
    V={only:false,page:0};render();renderSecs();toast(Q.length+' questions imported');
  }catch(e){toast('Could not read this file')}
  $('#jf').value='';
}
async function doParse(){
  const r=CBTParser.parse($('#raw').value,$('#key').value);
  Q=r.questions.map(normQ);
  // images found inside a Word file
  if(RAWIMG.length){
    const cache={};
    const get=async k=>cache[k]||(cache[k]=await compressDataUrl(RAWIMG[k],900,.8));
    const take=async(txt)=>{const ks=[];const t=String(txt).replace(/⟦IMG:(\d+)⟧/g,(_,k)=>{ks.push(+k);return ' '}).replace(/[ \t]{2,}/g,' ').trim();return{t,img:ks.length?await get(ks[0]):null,n:ks.length}};
    let extra=0;
    for(const q of Q){
      const a=await take(q.q);q.q=a.t;if(a.img)q.img=a.img;extra+=Math.max(0,a.n-1);
      for(let j=0;j<4;j++){const o=await take(q.options[j]);q.options[j]=o.t;if(o.img)q.oimg[j]=o.img}
      const e=await take(q.explanation);q.explanation=e.t;if(e.img)q.eimg=e.img;
    }
    const total=Q.reduce((a,q)=>a+(q.img?1:0)+q.oimg.filter(Boolean).length,0);
    if(total)toast(total+' images picked up from the Word file');
    if(extra)toast(extra+' extra image(s) in questions were skipped; add them by hand');
  }
  S=deriveSections();V={only:false,page:0};render();renderSecs();
}

/* ---- images ---- */
function compressDataUrl(src,maxW,q){
  return new Promise(res=>{
    const im=new Image();
    im.onload=()=>{
      let w=im.naturalWidth,h=im.naturalHeight;const sc=Math.min(1,maxW/Math.max(w,1));w=Math.round(w*sc);h=Math.round(h*sc);
      const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,w,h);cx.drawImage(im,0,0,w,h);
      let out=c.toDataURL('image/jpeg',q||.8),qq=q||.8,mw=w;
      while(out.length>260000&&qq>.45){qq-=.1;out=c.toDataURL('image/jpeg',qq)}
      if(out.length>260000){const c2=document.createElement('canvas');c2.width=Math.round(w*.7);c2.height=Math.round(h*.7);c2.getContext('2d').drawImage(c,0,0,c2.width,c2.height);out=c2.toDataURL('image/jpeg',.6)}
      res(out);
    };
    im.onerror=()=>res(null);im.src=src;
  });
}
const fileToUrl=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej();r.readAsDataURL(f)});
const getImg=(q,t)=>t==='q'?q.img:t==='e'?q.eimg:q.oimg[t];
function setImg(q,t,v){if(t==='q')q.img=v;else if(t==='e')q.eimg=v;else q.oimg[t]=v}
async function pickImg(inp,i,t){
  const f=inp.files[0];if(!f)return;
  try{const d=await compressDataUrl(await fileToUrl(f),t==='q'||t==='e'?900:520,.8);if(!d)throw 0;setImg(Q[i],t,d);redrawCard(i)}catch(e){toast('Could not use this image')}
}
function rmImg(i,t){setImg(Q[i],t,null);redrawCard(i)}
function imgCtl(i,t,label){
  const v=getImg(Q[i],t);
  return `<div class="imgctl">${v?`<img src="${v}" class="thumb"><button class="btn ghost sm" onclick="rmImg(${i},${typeof t==='string'?`'${t}'`:t})">Remove image</button>`
   :`<label class="btn ghost sm" style="cursor:pointer">📷 ${label}<input type="file" accept="image/*" style="display:none" onchange="pickImg(this,${i},${typeof t==='string'?`'${t}'`:t})"></label>${PDFBUF?`<button class="btn soft sm" onclick="openCrop(${i},${typeof t==='string'?`'${t}'`:t})">✂ Crop from PDF</button>`:''}`}</div>`;
}
async function openCrop(i,t){
  if(!PDFBUF)return toast('Load the question paper PDF first');
  try{
    CR={doc:CR&&CR.doc&&CR.buf===PDFBUF?CR.doc:await pdfOpen(PDFBUF),buf:PDFBUF,page:(CR&&CR.page)||1,i,t,sel:null,mode:true};
  }catch(e){return toast('Could not open the PDF')}
  modal(`<h2>Crop diagram for Q${i+1}${typeof t==='number'?' · option '+'ABCD'[t]:t==='e'?' · explanation':''}</h2>
   <div class="row" style="margin:8px 0"><button class="btn ghost sm" onclick="cropPage(-1)">‹</button><span class="sm">Page <input type="number" id="cpn" value="${CR.page}" min="1" max="${CR.doc.numPages}" style="width:70px;display:inline-block;padding:6px" onchange="cropPage(0,+this.value)"> of ${CR.doc.numPages}</span><button class="btn ghost sm" onclick="cropPage(1)">›</button>
   <button class="btn soft sm" id="cmode" onclick="cropMode()">Mode: Select</button><select id="czoom" onchange="cropZoom()" style="width:auto"><option value="100">Fit</option><option value="160">Zoom 160%</option><option value="240">Zoom 240%</option></select></div>
   <div id="crw" class="cropwrap"><div id="cri" style="position:relative;display:inline-block;width:100%"><canvas id="crc" style="width:100%;display:block"></canvas><div id="crs" class="cropsel" style="display:none"></div></div></div>
   <p class="sm mut" style="margin:8px 0">Drag on the page to draw a box around the diagram. Use "Mode: Move" to scroll when zoomed.</p>
   <div class="row"><button class="btn" style="flex:1" onclick="cropUse()">Use selected area</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`,true);
  cropDraw();cropEvents();
}
async function cropDraw(){
  const pg=await CR.doc.getPage(CR.page),vp=pg.getViewport({scale:2}),c=$('#crc');
  c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;CR.sel=null;$('#crs').style.display='none';
}
function cropPage(d,v){const n=Math.min(CR.doc.numPages,Math.max(1,v||CR.page+d));CR.page=n;$('#cpn').value=n;cropDraw()}
function cropMode(){CR.mode=!CR.mode;$('#cmode').textContent='Mode: '+(CR.mode?'Select':'Move');$('#crw').style.touchAction=CR.mode?'none':'auto'}
function cropZoom(){$('#cri').style.width=$('#czoom').value+'%'}
function cropEvents(){
  const w=$('#crw'),c=$('#crc'),box=$('#crs');w.style.touchAction='none';let st=null;
  const pos=e=>{const r=c.getBoundingClientRect();return{x:Math.min(Math.max(e.clientX-r.left,0),r.width),y:Math.min(Math.max(e.clientY-r.top,0),r.height),r}};
  w.onpointerdown=e=>{if(!CR.mode)return;st=pos(e);w.setPointerCapture(e.pointerId);box.style.display='block'};
  w.onpointermove=e=>{if(!st)return;const p=pos(e),x=Math.min(st.x,p.x),y=Math.min(st.y,p.y);
    box.style.left=x+'px';box.style.top=y+'px';box.style.width=Math.abs(p.x-st.x)+'px';box.style.height=Math.abs(p.y-st.y)+'px';
    const k=c.width/p.r.width;CR.sel={x:x*k,y:y*k,w:Math.abs(p.x-st.x)*k,h:Math.abs(p.y-st.y)*k}};
  w.onpointerup=()=>{st=null};
}
async function cropUse(){
  const s=CR.sel;if(!s||s.w<10||s.h<10)return toast('Draw a box around the diagram first');
  const c=document.createElement('canvas');c.width=Math.round(s.w);c.height=Math.round(s.h);
  c.getContext('2d').drawImage($('#crc'),s.x,s.y,s.w,s.h,0,0,c.width,c.height);
  const d=await compressDataUrl(c.toDataURL('image/png'),CR.t==='q'||CR.t==='e'?900:520,.82);
  setImg(Q[CR.i],CR.t,d);const i=CR.i;closeModal();redrawCard(i);toast('Image added');
}

/* ---- sections ---- */
function deriveSections(){
  const out=[];Q.forEach(q=>{const s=q.sec||'';const l=out[out.length-1];if(l&&l.name===s)l.count++;else out.push({name:s,count:1})});
  return out.some(x=>x.name)?out.map(x=>({name:x.name||'General',count:x.count})):[];
}
function renderSecs(){
  const tot=S.reduce((a,x)=>a+(+x.count||0),0);
  $('#secs').innerHTML=S.length?S.map((s,i)=>`<div class="row" style="margin-bottom:8px"><input type="text" value="${esc(s.name)}" placeholder="Section name" style="flex:2;min-width:130px" oninput="S[${i}].name=this.value"><input type="number" min="0" value="${s.count}" style="flex:1;min-width:80px" oninput="S[${i}].count=+this.value;secSum()"><span class="sm mut">questions</span><button class="iconbtn sm" onclick="S.splice(${i},1);renderSecs()">✕</button></div>`).join('')
    +`<div class="sm mut" id="ssum">Total ${tot} of ${Q.length} questions</div>`:'<div class="sm mut">No sections. The test will show all questions together.</div>';
}
;(window.__p=window.__p||{})['admin2']=1;
