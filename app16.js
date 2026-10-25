/* ===== v16: cleaner Home (no dashboard / graphs), up-next card, compact mistake & saved cards, tidy series cards =====
   Bottom navigation stays as it is. Percentage circles and charts are hidden by the v16 CSS in index.html. */

/* ---------- HOME: no dashboard graphs ---------- */
dashPerf=()=>'';
{const _lh=liveHtml;liveHtml=function(){const h=_lh();return h||upNext()}}
function upNext(){
  const ok=t=>CAT.series.some(s=>s.id===t.series_id&&(s.is_free||s.unlocked));
  const nxt=CAT.tests.filter(t=>!t.locked&&!t.attempts&&!t.in_progress&&!isWait(t)&&!isClosed(t)&&ok(t))[0];
  const up=CAT.tests.filter(t=>isWait(t)&&ok(t)).sort((a,b)=>a.opens_at-b.opens_at)[0];
  const t=nxt||up;if(!t)return '';
  const s=CAT.series.find(x=>x.id===t.series_id)||{};
  return `<div class="card hero5"><div class="h5k"><span class="h5b">${nxt?'UP NEXT':'UPCOMING'}</span><span>${nxt?'Ready to start':'Opens '+esc(fmtWhen(t.opens_at))}</span></div>
   <b class="h5t">${esc(t.title)}</b><div class="h5m">${esc(s.title||'')}${s.title?' · ':''}${t.questions} questions · ${t.duration} min</div>
   ${nxt?`<button class="btn h5go" onclick="openTest('${t.id}')">${ic('play',16)} Start test</button>`:`<button class="btn h5go" onclick="location.hash='#/s/${t.series_id}'">${ic('calendar',16)} View schedule</button>`}</div>`;
}
/* study tracker on Home: a plain progress bar instead of the % circle */
dashTracker=function(){
  const T=trkLoad(),w=T.weeks[T.cur],s=trkStats(w);
  return `<div class="h2s">${ic('pulse',20)} Study tracker <span class="n">${esc(w.label)}</span></div>
  <div class="card hstk" onclick="location.hash='#/t'"><div class="grow"><b>${s.total?`${s.done} of ${s.total} tasks done`:'Plan your week'}</b>
   <div class="sm mut">${s.total?(s.total-s.done?`${s.total-s.done} task${s.total-s.done>1?'s':''} left this week`:'Week complete! 🏆'):'Add subjects and daily tasks, tick them off here.'}</div>
   ${s.total?`<div class="pbar"><i style="width:${s.pct}%"></i></div>`:''}</div>${ic('right',18)}</div>`;
};

/* ---------- TESTS: price badge next to the title, not over the banner ---------- */
{const _sc=seriesCard;seriesCard=function(s){
  const t=tag(s),h3=`<h3>${esc(s.title)}</h3>`;
  return _sc(s).replace(t,'').replace(h3,`<div class="sc2tt">${h3}${t}</div>`);
}}

/* ---------- MISTAKES + SAVED: short cards, tap to open options and explanation ---------- */
const VX=new Set();
function vxWrap(h,k){return h.replace(/^<div class="card rv/,`<div data-vx="${k}" onclick="vxTap(event,this)" class="${VX.has(k)?'vxo':'vxc'} card rv`).replace('<span style="flex:1"></span>',`<span style="flex:1"></span><span class="vxch">${ic('right',16)}</span>`)}
{const _c=mkCard;mkCard=function(it){return vxWrap(_c(it),'m'+qKey(it))}}
{const _c=bmCard;bmCard=function(q){return vxWrap(_c(q),'b'+qKey(q))}}
function vxTap(e,el){
  if(e.target.closest('button,a,input,textarea,.ro.pick,.qnote,.qi'))return;
  const k=el.dataset.vx;
  if(el.classList.contains('vxc')){VX.add(k);el.classList.remove('vxc');el.classList.add('vxo','vxa')}
  else if(e.target.closest('.qxh,.qsrc,.qt')){VX.delete(k);el.classList.remove('vxo','vxa');el.classList.add('vxc')}
}

;(window.__p=window.__p||{})['app16']=1;
