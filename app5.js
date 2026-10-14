async function retryPend(){
  const b=document.querySelector('.pendc .btn');if(b){b.disabled=true;b.textContent='Sending…'}
  await flushPending();CAT=null;route();
}
let flushing=false;
async function autoFlush(){
  if(flushing||!AUTH||INTEST||!getPend().length)return;
  flushing=true;try{await flushPending();if(!INTEST&&(location.hash===''||location.hash==='#/'||location.hash==='#/r')){CAT=null;route()}}finally{flushing=false}
}
window.addEventListener('online',()=>{netPill();setTimeout(autoFlush,800)});
window.addEventListener('offline',netPill);
function remindMe(id){
  const t=CAT.tests.find(x=>x.id===id);if(!t||!t.opens_at)return;
  const when=fmtWhen(t.opens_at),link=location.href.split('#')[0];
  const msg=`Reminder: "${t.title}" starts ${when}. Open: ${link}`;
  modal(`<h2>Remind me</h2><p class="mut sm" style="margin:4px 0 14px">${esc(t.title)} · ${esc(when)}</p>
   <button class="btn block" onclick="addCal('${id}')">${ic('calendar')} Add to phone calendar (alarm)</button>
   <a class="btn soft block" style="margin-top:10px;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${ic('msg')} Send reminder on WhatsApp</a>
   <button class="btn ghost block" style="margin-top:10px" onclick="closeModal()">Close</button>`);
}
function addCal(id){
  const t=CAT.tests.find(x=>x.id===id);if(!t)return;
  const z=ms=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CBT//EN','BEGIN:VEVENT','UID:'+id+'@cbt','DTSTAMP:'+z(Date.now()),'DTSTART:'+z(t.opens_at),'DTEND:'+z(t.opens_at+(t.duration||60)*60000),
    'SUMMARY:'+String(t.title).replace(/[\r\n,;]/g,' '),'DESCRIPTION:Test starts now. Open '+location.href.split('#')[0],'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:Test starts in 15 minutes','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='test-reminder.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
  closeModal();toast('Open the downloaded file to add the reminder');
}
/* PWA */
let DIP=null;
function syncTheme(){try{const m=document.querySelector('meta[name=theme-color]');if(m)m.content=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#1d6fe8'}catch(e){}}
const isStandalone=()=>matchMedia('(display-mode:standalone)').matches||navigator.standalone;
function showInstall(ios){
  if(isStandalone()||LS.get('cbt_noinst',0)||document.querySelector('.instbar'))return;
  const d=document.createElement('div');d.className='instbar';
  d.innerHTML=`<span class="mki">${ic('install',20)}</span><div class="grow"><b>Install this app</b><div class="sm mut">${ios?'Tap Share, then “Add to Home Screen”':'Open it like an app from your home screen'}</div></div>${ios?'':'<button class="btn sm" id="instgo">Install</button>'}<button class="iconbtn sm" id="instx" aria-label="Close">${ic('x',16)}</button>`;
  document.body.appendChild(d);
  $('#instx').onclick=()=>{LS.set('cbt_noinst',1);d.remove()};
  const g=$('#instgo');if(g)g.onclick=async()=>{if(!DIP)return;DIP.prompt();try{await DIP.userChoice}catch(e){}DIP=null;d.remove()};
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();DIP=e;setTimeout(()=>{if(!INTEST)showInstall(false)},4000)});
window.addEventListener('appinstalled',()=>{const d=document.querySelector('.instbar');if(d)d.remove()});
if(/iphone|ipad|ipod/i.test(navigator.userAgent)&&!isStandalone())setTimeout(()=>{if(!INTEST&&AUTH)showInstall(true)},6000);
window.addEventListener('offline',()=>toast('You are offline'));
window.addEventListener('online',()=>toast('Back online'));
if('serviceWorker' in navigator&&/^https?:/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
init();
;(window.__p=window.__p||{})['app5']=1;
