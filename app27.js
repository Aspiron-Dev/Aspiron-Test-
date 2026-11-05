/* app27: website layout + grouped menu.
   - html.web: the page is open in a browser tab (not the installed app).
   - Browser on a big screen (a computer, or Chrome's "Desktop site" on a phone, 900 px and wider): a fixed side menu
     (#wside) instead of the 3-line button and the bottom tabs, home in two columns, and a footer with the policy links.
   - Phone in a normal browser tab and the installed app keep the app look.
   - The 3-line menu (phone) uses the same groups with headings.
   - Terms, Privacy and Refund are on the website only: the installed app's menu does not list them. */
const WEB_BIG=matchMedia('(min-width:900px)');
const webTab=()=>!isStandalone();
if(webTab())document.documentElement.classList.add('web');
IC.receipt='<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>';
IC.doc='<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>';

// [icon, label, target, new?]: target '#/..' or 'page.html' = a link; {f:'code()'} = runs that code
function webGroups(){
  const g=[
    ['Study',[['home','Home','#/'],['file','Test Series','#/series'],['book','Library','#/lib'],['pyq','PYQ Analysis','#/pyq',1],['bank','Question Bank','#/qb',1],['wand','Test Generator','#/gen',1]]],
    ['My progress',[['trophy','Results & Ranks','#/r'],['notebook','Mistake Notebook','#/m'],['bmark','Saved Questions','#/b'],['pulse','Study Tracker','#/t']]],
    ['Explore',[['bag','Store','store'],['gift','Refer & Earn','#/refer'],['bell','Notifications','#/n'],['calendar','Exam Countdown',{f:'cdEdit()'}]]],
    ['Help & settings',[['sun','Theme Settings',{f:'openLook()'}],['gear','Settings',{f:'openSettings()'}],['info','About Us',{f:'openAbout()'}],['mail','Contact Us',{f:'supportSheet()'}]]]
  ];
  if(webTab())g.push(['Policies',[['doc','Terms & Conditions','terms'],['shield','Privacy Policy','privacy'],['receipt','Refund Policy','refund']]]);
  return g;
}
// which menu entry the current page belongs to
function webCur(){
  const h=(location.hash||'#/').replace(/\?.*$/,'');
  if(h==='#'||h==='#/'||h==='')return '#/';
  if(/^#\/(s|f)\//.test(h))return '#/series';
  if(/^#\/h\//.test(h))return '#/r';
  if(/^#\/(pyq|qb|gen)(\/|$)/.test(h))return h.match(/^#\/(pyq|qb|gen)/)[0];
  if(h==='#/notes')return '#/lib';
  return h;
}
function webItems(cls,close){
  const cur=webCur(),sz=cls==='dri'?22:19;
  return webGroups().map(([hd,list])=>`<div class="wgh">${esc(hd)}</div>`+list.map(([i,t,to,nw])=>{
    const inner=`${ic(i,sz)}<span>${esc(t)}</span>${nw?'<em class="drnew">NEW</em>':''}`;
    if(typeof to==='string'){
      const on=to===cur;
      return `<a class="${cls}${on?' on':''}" href="${to}"${on?' aria-current="page"':''}${close?' onclick="closeModal()"':''}>${inner}</a>`;
    }
    return `<button class="${cls}" onclick="${close?'closeModal();':''}${to.f}">${inner}</button>`;
  }).join('')).join('')+`<div class="sbd"></div><button class="${cls} out" onclick="${close?'closeModal();':''}signOut()">${ic('logout',sz)}<span>Logout</span></button>`;
}

/* phone: the 3-line menu keeps its profile top and gets the grouped list */
{const _om=openMenu;openMenu=function(){
  _om.apply(this,arguments);
  const l=document.querySelector('#layer .drl');if(l)l.innerHTML=webItems('dri',true);
}}

/* big screen in a browser: fixed side menu */
function webSide(){
  const on=webTab()&&WEB_BIG.matches&&!!AUTH;
  document.body.classList.toggle('wside',on);
  let s=document.getElementById('wside');
  if(!on){if(s)s.remove();return}
  if(!s){s=document.createElement('aside');s.id='wside';s.setAttribute('aria-label','Menu');document.body.appendChild(s)}
  const nm=(typeof pfName==='function'&&pfName())||AUTH.name||'',o=typeof pfGet==='function'?pfGet():{};
  const sub=[o.exam,o.cls].filter(Boolean).join(' · ')||'View profile';
  s.innerHTML=`<a class="wsb" href="#/" aria-label="Aspiron Education home"><img src="icon-192.png" alt="" width="34" height="34"><span><b>Aspiron</b><i>Education</i></span></a>
   <button class="wsme" onclick="openProfile()"><span class="wsav">${pfInner(nm)}</span><span class="grow"><b>${esc(nm||'My profile')}</b><i>${esc(sub)}</i></span>${ic('right',16)}</button>
   <nav class="wsl">${webItems('wsi',false)}</nav>`;
}
/* footer with the policy links: website only (big screen, or the sign-in page) */
function webFoot(){
  let f=document.getElementById('wfoot');
  if(!webTab()){if(f)f.remove();return}
  if(!f){f=document.createElement('footer');f.id='wfoot';f.className='wfoot';const a=document.getElementById('app');a.parentNode.insertBefore(f,a.nextSibling)}
  f.innerHTML=`<div class="wf-in"><span>© ${new Date().getFullYear()} Aspiron Education</span><nav aria-label="Policies"><a href="store">Store</a><a href="contact">Contact Us</a><a href="terms">Terms &amp; Conditions</a><a href="privacy">Privacy Policy</a><a href="refund">Refund Policy</a></nav>${(typeof socialLinksHTML==='function'&&socialLinksHTML())?`<nav aria-label="Follow us">${socialLinksHTML()}</nav>`:''}</div>`;
}
function webSync(){try{webSide();webFoot();document.body.classList.toggle('wout',!AUTH)}catch(e){}}
{const _uh=updateHeader;updateHeader=function(){const r=_uh.apply(this,arguments);webSync();return r}}
{const _rt=route;route=async function(){const r=await _rt.apply(this,arguments);webSync();return r}}
{const _lg=login;login=function(){const r=_lg.apply(this,arguments);webSync();return r}}
addEventListener('hashchange',()=>setTimeout(webSync,0));
WEB_BIG.addEventListener&&WEB_BIG.addEventListener('change',webSync);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',webSync,{once:true});else webSync();
;(window.__p=window.__p||{})['app27']=1;
