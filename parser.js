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
  const re=/(?:^|\s)(?:\(([A-Da-d1-4])\)|([A-Da-d])[\.\)])\s*/g;
  const ms=[];let m;
  while((m=re.exec(block))){
    const ch=m[1]||m[2];
    const v=/\d/.test(ch)?(+ch-1):ch.toLowerCase().charCodeAt(0)-97;
    ms.push({v,s:m.index,e:re.lastIndex});
  }
  let best=null;
  for(let i=0;i<ms.length;i++){
    if(ms[i].v!==0)continue;
    const seq=[ms[i]];let need=1;
    for(let j=i+1;j<ms.length&&need<4;j++){if(ms[j].v===need){seq.push(ms[j]);need++}}
    if(seq.length===4)best=seq;
  }
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
    return{q:r.q,options:r.o,answer:key[i+1]==null?null:key[i+1],explanation:'',sec:b.sec||'',gap:!!b.gap};
  });
  return{questions,keyFound:Object.keys(key).length};
}
const api={parse,parseKey,splitKey,splitOpts,sectionName};
if(typeof module!=='undefined')module.exports=api;else root.CBTParser=api;
})(this);
