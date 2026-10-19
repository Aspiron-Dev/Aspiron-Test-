/* Store: chosen light / dark theme, and whether the student already gave their name + mobile.
   Runs in <head> before the page is drawn, so the wrong theme or the welcome screen never flashes. */
(function(){
  var d=document.documentElement;
  try{
    var t=localStorage.getItem('store_theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);
    var m=JSON.parse(localStorage.getItem('store_me')||'null');
    if(m&&String(m.name||'').trim().length>=2&&/^[6-9]\d{9}$/.test(m.mobile||''))d.classList.add('has-me');
  }catch(e){}
})();
