// PDF text -> questions parser (works in browser and in node for testing)
(function(root){
function splitKey(t){
  const re=/(answer\s*key|answers|उत्तर\s*कुंजी|उत्तर\s*तालिका)/gi;
  const ms=[];let m;
  while((m=re.exec(t)))ms.push(m.index);
  for(let i=ms.length-1;i>=0;i--){
    const tail=t.slice(ms[i]);
    if(parseKey(tail).count>=10)return{q:t.slice(0,ms[i]),k:tail};
  }
  return{q:t,k:''};
}
function parseKey(t){
  const re=/(\d{1,3})\s*[\.\-–:\)]*\s*\(?\s*([A-Da-d1-4])\s*\)?(?=\s|$|,|;)/g;
  const map={};let m,count=0;
  while((m=re.exec(t))){
    const n=+m[1],c=m[2];
    const v=/\d/.test(c)?(+c-1):c.toLowerCase().charCodeAt(0)-97;
    if(map[n]==null){map[n]=v;count++}
  }
  return{map,count};
}
function splitOpts(block){
  // marker must follow a space/line start; trailing spaces are not eaten, so "of (A)\n(2)" still finds (2)
  const re=/(?:\(([A-Da-d1-4])\)|([A-Da-d])[\.\)])/g;
  const ms=[];let m;
  while((m=re.exec(block))){
    if(m.index&&!/\s/.test(block[m.index-1]))continue;
    const ch=m[1]||m[2],pre=block.slice(0,m.index);
    const v=/\d/.test(ch)?(+ch-1):ch.toLowerCase().charCodeAt(0)-97;
    let e=re.lastIndex;while(e<block.length&&/[ \t]/.test(block[e]))e++;
    // ls = marker starts a line (or follows a wide gap, as in 2-column options)
    ms.push({v,s:m.index,e,d:/\d/.test(ch),ls:/(^|\n)[ \t]*$/.test(pre)||/\S {2,}$/.test(pre)});
  }
  // every A,B,C,D (or 1-4) run of one style; "Assertion (A)" / "Both (A) and (R)" make extra runs
  const runs=[];
  for(let i=0;i<ms.length;i++){
    if(ms[i].v!==0)continue;
    const seq=[ms[i]];let need=1;
    for(let j=i+1;j<ms.length&&need<4;j++){if(ms[j].v===need&&ms[j].d===ms[i].d){seq.push(ms[j]);need++}}
    if(seq.length===4)runs.push(seq);
  }
  // a later run wins (options come after "match the following" lists), unless it starts inside
  // the earlier run's options and fewer of its markers start a line (A-R statements)
  let best=null;const sc=r=>r.filter(x=>x.ls).length;
  for(const r of runs){if(!best||r[0].s>best[3].s||sc(r)>=sc(best))best=r}
  if(!best)return{q:block.trim(),o:['','','','']};
  const q=block.slice(0,best[0].s).trim();
  const o=best.map((x,k)=>block.slice(x.e,k<3?best[k+1].s:undefined).replace(/\s*\n\s*/g,' ').trim());
  return{q,o};
}
const SUBJ=/^\s*(?:section\s*[-:]?\s*[A-Za-z0-9]+\s*[-:–—(\[]*\s*)?(physics|chemistry|botany|zoology|biology|mathematics|maths|math|english|hindi|reasoning|general\s*knowledge|general\s*awareness|gk|history|geography|polity|economics|science|computer|physical\s*chemistry|organic\s*chemistry|inorganic\s*chemistry|भौतिक\s*विज्ञान|रसायन\s*विज्ञान|जीव\s*विज्ञान|गणित)\s*[)\]]?\s*(?:[-:–—(\[]?\s*(?:section\s*[A-Za-z0-9]+)?\s*[)\]]?)?\s*$/i;
const cap=s=>s.toLowerCase().replace(/\s+/g,' ').trim().replace(/\b([a-z])/g,c=>c.toUpperCase());
function sectionName(ln){
  const t=ln.trim();
  if(!t||t.length>45||/^\d/.test(t))return null;
  const m=t.match(SUBJ);
  if(m)return cap(m[1]);
  const g=t.match(/^section\s*[-:]?\s*([A-Za-z0-9]+)\s*$/i);
  return g?'Section '+g[1].toUpperCase():null;
}
const AR=['Both Assertion (A) and Reason (R) are true and R is the correct explanation of A','Both Assertion (A) and Reason (R) are true but R is not the correct explanation of A','Assertion (A) is true but Reason (R) is false','Assertion (A) is false but Reason (R) is true'];
function parse(text,keyText){
  text=text.replace(/\r/g,'');
  const sp=splitKey(text);
  const kt=keyText&&keyText.trim()?keyText:sp.k;
  const key=parseKey(kt).map;
  const lines=sp.q.split('\n');
  const blocks=[];let cur=null,sec='';
  const qre=/^\s*(?:Q\.?\s*)?(\d{1,3})\s*[\.\)]\s*(.*)$/i;
  for(const ln of lines){
    const m=ln.match(qre);
    const n=m?+m[1]:0;
    const next=blocks.length+1;
    // accept the expected number, or a small jump (a missing question -> placeholder)
    if(m&&n>=next&&n<=next+3&&(n===next||/^[A-Za-z(ऀ-ॿ\[]/.test(m[2]||'')||m[2]==='')){
      for(let k=next;k<n;k++)blocks.push({lines:[''],sec,gap:true});
      cur={lines:[m[2]],sec};blocks.push(cur);
    }else{
      const sn=sectionName(ln);
      if(sn){sec=sn;if(cur===null)continue;cur=null;continue}
      if(cur)cur.lines.push(ln);
    }
  }
  const questions=blocks.map((b,i)=>{
    const r=splitOpts(b.lines.join('\n'));
    // Assertion–Reason printed without options: use the standard four
    if(!r.o.some(Boolean)&&/assertion/i.test(r.q)&&/reason/i.test(r.q))r.o=AR.slice();
    return{q:r.q,options:r.o,answer:key[i+1]==null?null:key[i+1],explanation:'',sec:b.sec||'',gap:!!b.gap};
  });
  return{questions,keyFound:Object.keys(key).length};
}
// explanations / solutions text -> {map:{n:text}, ans:{n:0-3}, count}
// each starts at a line "12." / "Q12)" / "Sol. 12:" / "Explanation 12 -" …; numbers must go up by 1–3, so a list
// "1. … 2. …" inside an explanation is kept as part of it. "(B)" or "Ans: B" right after the number is read as the answer.
function parseExplain(t){
  t=String(t||'').replace(/\r/g,'');
  const re=/^\s*(?:(?:Q(?:ues(?:tion)?)?|Sol(?:ution)?|S|Exp(?:lanation)?|Hint|Ans(?:wer)?)\s*\.?\s*(?:no\.?\s*)?)?(\d{1,3})\s*[\.\):\-–]\s*(.*)$/i;
  const blocks=[];let cur=null,last=0;
  for(const ln of t.split('\n')){
    const m=ln.match(re);const n=m?+m[1]:0;
    if(m&&n>last&&(last===0?n<=3:n<=last+3)){cur={n,lines:[m[2]]};blocks.push(cur);last=n;continue}
    if(cur)cur.lines.push(ln);
  }
  const map={},ans={};let count=0;
  for(const b of blocks){
    let x=b.lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
    const a=x.match(/^(?:(?:correct\s*)?(?:ans(?:wer)?|key|option)\s*(?:is)?\s*[:.\-–]?\s*\(?\s*([A-Da-d1-4])\s*\)?|\(\s*([A-Da-d1-4])\s*\))(?=[\s.,:;\-–)]|$)[\s.,:;\-–)]*/i);
    if(a){const c=a[1]||a[2];ans[b.n]=/\d/.test(c)?+c-1:c.toLowerCase().charCodeAt(0)-97;if(!/^correct/i.test(a[0]))x=x.slice(a[0].length).trim()}
    x=x.replace(/^(?:sol(?:ution)?|exp(?:lanation)?|hint)\s*[:.\-–]\s*/i,'').trim();
    if(x||ans[b.n]!=null){map[b.n]=x;count++}
  }
  return{map,ans,count};
}
const api={parse,parseKey,splitKey,splitOpts,sectionName,parseExplain};
if(typeof module!=='undefined')module.exports=api;else root.CBTParser=api;
})(this);
