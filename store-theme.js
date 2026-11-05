/* never inside another site's frame (clickjacking) */
/* clean address: /store.html shows as /store, /terms.html as /terms (never the file name) */
try{var _p=location.pathname,_n=_p.replace(/\.html$/,'');if(_n!==_p)history.replaceState(history.state,'',_n+location.search+location.hash)}catch(e){}
if(window.top!==window.self){try{window.top.location.replace(window.location.href)}catch(e){}document.documentElement.style.display='none'};
/* Store: light / dark theme (the saved choice, else the phone's setting), whether the student already gave their name +
   mobile, and their course (NEET / JEE). Runs in <head> before the page is drawn, so the wrong theme, course or the
   welcome screen never flashes. */
(function(){
  var d=document.documentElement,t='';
  try{
    t=localStorage.getItem('store_theme')||'';
    var m=JSON.parse(localStorage.getItem('store_me')||'null');
    if(m&&String(m.name||'').trim().length>=2&&/^[6-9]\d{9}$/.test(m.mobile||''))d.classList.add('has-me');
    if(m&&(m.course==='neet'||m.course==='jee'))d.setAttribute('data-course',m.course);
  }catch(e){}
  if(t!=='light'&&t!=='dark')t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  d.setAttribute('data-theme',t);
})();
