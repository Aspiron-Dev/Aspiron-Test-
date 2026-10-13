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
function parse(text,keyText){
  text=text.replace(/\r/g,'');
  const sp=splitKey(text);
  const kt=keyText&&keyText.trim()?keyText:sp.k;
  const key=parseKey(kt).map;
  const lines=sp.q.split('\n');
  const blocks=[];let cur=null;
  const qre=/^\s*(?:Q\.?\s*)?(\d{1,3})\s*[\.\)]\s*(.*)$/i;
  for(const ln of lines){
    const m=ln.match(qre);
    if(m&&+m[1]===blocks.length+1){cur=[m[2]];blocks.push(cur)}
    else if(cur)cur.push(ln);
  }
  const questions=blocks.map((b,i)=>{
    const r=splitOpts(b.join('\n'));
    return{q:r.q,options:r.o,answer:key[i+1]==null?null:key[i+1],explanation:''};
  });
  return{questions,keyFound:Object.keys(key).length};
}
const api={parse,parseKey,splitKey,splitOpts};
if(typeof module!=='undefined')module.exports=api;else root.CBTParser=api;
})(this);
