/* Store: chosen light / dark theme, whether the student already gave their name + mobile, and their course
   (NEET / JEE). Runs in <head> before the page is drawn, so the wrong theme, course or the welcome screen never flashes. */
(function(){
  var d=document.documentElement;
  try{
    var t=localStorage.getItem('store_theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);
    var m=JSON.parse(localStorage.getItem('store_me')||'null');
    if(m&&String(m.name||'').trim().length>=2&&/^[6-9]\d{9}$/.test(m.mobile||''))d.classList.add('has-me');
    if(m&&(m.course==='neet'||m.course==='jee'))d.setAttribute('data-course',m.course);
    // inside the student app (Store tab): no own top bar, the app's light / dark theme
    if(/[?&]embed=1/.test(location.search)&&window.top!==window.self){d.classList.add('embed');var a=JSON.parse(localStorage.getItem('cbt_theme')||'null');if(a)d.setAttribute('data-theme',a==='light'?'light':'dark')}
  }catch(e){}
})();
