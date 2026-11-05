/* ===== app26: profile details + exam countdown are kept on the account =====
   Server: supabase_v56_student_keep.sql (cbt_keep get | save). Before it is run the app works as before: the details
   stay on this phone only and nothing here makes a request that fails twice.
   Why: the profile (photo, alternate phone, school, city, class, exam, about) and the exam countdown lived only in
   one browser's storage. Clearing site data, a full phone, or opening the site in another browser / on another phone
   showed an empty profile and no countdown.
   How: every save of cbt_pf_<mobile> / cbt_cd_<mobile> (all writers go through LS.set / LS.del) is sent to the account a
   moment later. After sign-in the account's copy fills what this phone is missing (this phone's own values win), and
   what only this phone has is sent up once, so existing profiles are backed up without the student doing anything.
   A countdown the student removes stays removed on their other phones. */
const KEEP={on:undefined,mob:null,q:null,tm:0,skip:0,busy:0};
const keepWhat=k=>AUTH?(k==='cbt_pf_'+AUTH.mobile?'pf':k==='cbt_cd_'+AUTH.mobile?'cd':''):'';
{const _s=LS.set,_d=LS.del;
  LS.set=function(k,v){const r=_s.call(this,k,v),w=keepWhat(k);if(w&&!KEEP.skip)keepQ(w,v);return r};
  LS.del=function(k){const r=_d.call(this,k),w=keepWhat(k);if(w&&!KEEP.skip)keepQ(w,null);return r};
}
function keepQ(w,v){
  if(KEEP.on===false||!AUTH)return;
  if(!KEEP.q||KEEP.q.m!==AUTH.mobile)KEEP.q={m:AUTH.mobile,d:{}};
  KEEP.q.d[w]=v;clearTimeout(KEEP.tm);KEEP.tm=setTimeout(()=>keepPush(0),1500);
}
async function keepPush(n){
  const q=KEEP.q;if(!q||!AUTH||q.m!==AUTH.mobile||KEEP.on===false||!Object.keys(q.d).length)return;
  KEEP.q=null;
  const r=await rpc('cbt_keep',{p_action:'save',p_data:q.d});
  if(r&&r.ok){KEEP.on=true;return}
  if(r&&r.error==='server'&&r.status===404){KEEP.on=false;return}
  if(r&&authErr(r))return;
  // network trouble: keep it and try again (newer changes made meanwhile win)
  if(n<3&&AUTH&&AUTH.mobile===q.m){KEEP.q=KEEP.q||{m:q.m,d:{}};for(const k in q.d)if(!(k in KEEP.q.d))KEEP.q.d[k]=q.d[k];clearTimeout(KEEP.tm);KEEP.tm=setTimeout(()=>keepPush(n+1),20000*(n+1))}
}
// text values the server keeps, the same way it cleans them
const KEEP_PF=['name','email','phone','school','city','cls','exam','about','photo'];
function keepNorm(o){const r={};if(o&&typeof o==='object')KEEP_PF.forEach(k=>{const v=typeof o[k]==='string'?o[k].trim():'';if(v)r[k]=v});return r}
const keepSame=(a,b)=>KEEP_PF.every(k=>(a[k]||'')===(b[k]||''));

async function keepPull(){
  if(!AUTH||KEEP.on===false||KEEP.busy||KEEP.mob===AUTH.mobile)return;
  const mob=AUTH.mobile;KEEP.busy=1;
  try{
    const r=await rpc('cbt_keep',{p_action:'get'});
    if(!AUTH||AUTH.mobile!==mob)return;
    if(!r||!r.ok){
      if(r&&r.error==='server'&&r.status===404)KEEP.on=false;
      else if(r&&authErr(r))return;
      return;                                   // network trouble: try again on the next page
    }
    KEEP.on=true;KEEP.mob=mob;
    const up={};let back=false;
    // profile: this phone's values win; the account fills the gaps; anything the account lacks is sent up
    const lp=keepNorm(pfGet()),sp=keepNorm(r.pf),mg=Object.assign({},sp,lp);
    if(!keepSame(mg,lp)){
      const full=Object.assign({},pfGet(),mg);
      KEEP.skip=1;try{LS.set('cbt_pf_'+mob,full)}finally{KEEP.skip=0}
      back=true;
    }
    if(!keepSame(mg,sp))up.pf=Object.assign({},pfGet(),mg);
    // countdown: this phone's own wins; missing here → restore; only here → send up, unless it was removed on purpose elsewhere
    const lc=cdGet();
    if(!lc){
      if(r.cd&&r.cd.name&&r.cd.date){KEEP.skip=1;try{LS.set('cbt_cd_'+mob,r.cd)}finally{KEEP.skip=0}back=true}
    }else if(!r.cd){
      if(r.cdgone){KEEP.skip=1;try{LS.del('cbt_cd_'+mob)}finally{KEEP.skip=0}back=true}
      else up.cd=lc;
    }
    if(Object.keys(up).length){const x=await rpc('cbt_keep',{p_action:'save',p_data:up});if(x&&x.error==='server'&&x.status===404)KEEP.on=false}
    if(back&&AUTH&&AUTH.mobile===mob){
      try{pfHdr()}catch(e){}
      try{if(typeof cdRefresh==='function')cdRefresh()}catch(e){}
      try{if((location.hash||'#/')==='#/'&&typeof route==='function'&&!INTEST)route()}catch(e){}
    }
  }catch(e){}finally{KEEP.busy=0}
}
// look once per page load (and again when a different student signs in)
{const _r=route0;route0=function(){if(AUTH&&!INTEST)setTimeout(keepPull,0);return _r.apply(this,arguments)}}

;(window.__p=window.__p||{})['app26']=1;
