/* app29: the landing page (home page before sign-in) and the "Get the app" pop-up.
   - Shown to everyone who is not signed in, before the sign-in screen: top bar (menu · logo · Login / Register),
     banners (Admin → Banners, public cbt_banners), hero, why Aspiron, exams, Test Store (public cbt_store), how to get
     the access code, features, Get the app, footer with social links and policies, a support button.
   - Login / Register opens the usual sign-in (app28). The ✕ on the sign-in screen (and the phone's Back) comes back here.
   - The sign-in screen shows at once (no landing) when the student comes back from Google, has a link to open
     (cbt_after) or a sign-in message to read.
   - "Get the app" pop-up: once per visit in a browser tab (never in the installed app): Install App / Continue on Web.
   Theme: the tokens of login.css (graphite + gold, light / dark), styles in landing.css. */
IC.menu=IC.menu||'<path d="M4 7h16M4 12h16M4 17h16"/>';
IC.headset=IC.headset||'<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="3" y="14" width="4" height="6" rx="2"/><rect x="17" y="14" width="4" height="6" rx="2"/><path d="M19 20a3 3 0 01-3 3h-3"/>';
IC.install=IC.install||'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>';
IC.bag=IC.bag||'<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>';
IC.shield=IC.shield||'<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>';
IC.bolt='<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>';
IC.lang='<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 4-3 8-7 9"/><path d="M13 21l4-9 4 9M14.5 18h5"/>';
IC.chart='<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>';
IC.note='<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5M9 8h3"/>';
IC.bookmark='<path d="M6 3h12v18l-6-4-6 4z"/>';
IC.wand='<path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20l10-10"/>';
IC.pulse='<path d="M3 12h4l3-8 4 16 3-8h4"/>';
IC.phone=IC.phone||'<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18.5h2"/>';
IC.mail=IC.mail||'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>';
IC.qa='<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01"/>';

let LPGO=false,LPBAN=null,LPST=null,LPI=0,LPT=null,LPHOLD=0;
const lpStd=()=>typeof isStandalone==='function'&&!!isStandalone();
const lpIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const lpRM=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.lite==='1';
const lpMark=(c)=>`<svg class="${c||''}" viewBox="285 335 510 465" aria-hidden="true"><use href="#bSw"/><use href="#bA"/><use href="#bCap"/><use href="#bArc"/><use href="#bTas"/><use href="#bSt"/></svg>`;
const lpWord=()=>`<svg class="lp-wm" viewBox="63 821 954.5 130.7" aria-hidden="true"><use href="#bWord"/></svg>`;
const lpLogo=()=>`<span class="lp-logo" aria-label="Aspiron Education">${lpMark('lp-mk')}<span class="lp-lt">${lpWord()}<i>EDUCATION</i></span></span>`;
const lpMoney=n=>'₹'+Number(n||0).toLocaleString('en-IN');

/* Should the landing page show instead of the sign-in screen? */
function lpWanted(mode){
  if(mode||LPGO||!cloud||AUTH)return false;
  try{const s=typeof sbGet==='function'&&sbGet();if(s&&(s.at||s.err))return false}catch(e){}   // back from Google / an email link
  if(LS.get('cbt_after',null))return false;   // a link to open after sign-in
  if(typeof LOGINERR!=='undefined'&&LOGINERR)return false;   // "please sign in again" and similar
  return true;
}
{const _lg=login;login=function(mode){
  if(lpWanted(mode))return lpShow();
  const r=_lg.apply(this,arguments);
  lpCloseBtn();
  return r;
}}
// the ✕ on the sign-in screen: back to the landing page
function lpCloseBtn(){
  const a=$('#app .au3');if(!a||a.querySelector('.au3-x'))return;
  a.insertAdjacentHTML('afterbegin',`<button class="au3-x" onclick="lpHome()" aria-label="Close and go to the home page">${ic('x',20)}</button>`);
}
function lpHome(){LPGO=false;if(history.state&&history.state.lp==='login'){history.back();return}lpShow()}
// Login / Register: the sign-in screen (the phone's Back comes back here)
function lpLogin(mode){
  lpMenu(false);lpAppClose();
  LPGO=true;
  try{history.pushState({lp:'login'},'',location.pathname+location.search)}catch(e){}
  login(mode||'');
}
addEventListener('popstate',()=>{
  if(AUTH||INTEST)return;
  if($('#app .au3')&&!(history.state&&history.state.lp==='login')){LPGO=false;lpShow()}
});

/* ---------- the page ---------- */
function lpShow(){
  INTEST=false;document.body.classList.remove('intest','v3on','v3old');
  if(typeof updateHeader==='function')updateHeader();
  setApp(lpHtml());
  if(typeof webSync==='function')webSync();
  const sc=$('#lp');
  if(sc){sc.addEventListener('scroll',lpScroll,{passive:true});lpScroll()}
  if(!$('#v3font')){const f=document.createElement('link');f.id='v3font';f.rel='stylesheet';f.href='https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap';document.head.appendChild(f)}
  lpBanners();lpStore().then(lpReviews);
  if(typeof socialLoad==='function')socialLoad();
  lpAppMaybe();
}
function lpHtml(){
  const year=new Date().getFullYear();
  const stat=(i,b,s)=>`<div class="lp-stat"><span class="lp-si">${ic(i,22)}</span><b>${b}</b><span>${s}</span></div>`;
  const exam=(k,t,s,chips,href)=>`<a class="lp-exam ${k}" href="${href}"><div><h3>${t}</h3><p>${s}</p><div class="lp-chips">${chips.map(c=>`<span>${c}</span>`).join('')}</div><span class="lp-go">Explore ${ic('right',16)}</span></div><i class="lp-ex-ic" aria-hidden="true">${k==='neet'?'🩺':k==='jee'?'⚙️':'📘'}</i></a>`;
  const step=(n,t,s)=>`<li><i>${n}</i><div><b>${t}</b><span>${s}</span></div></li>`;
  const feat=(i,t,s)=>`<div class="lp-feat"><span class="lp-fi">${ic(i,20)}</span><b>${t}</b><span>${s}</span></div>`;
  const fl=(t,list)=>`<div class="lp-fcol"><h4>${t}</h4>${list.map(([a,h])=>`<a href="${h}">${a}</a>`).join('')}</div>`;
  return `<div class="lp" id="lp">
  <header class="lp-top"><div class="lp-top-in">
    <button class="lp-ib" onclick="lpMenu(true)" aria-label="Open menu">${ic('menu',24)}</button>
    <button class="lp-home" onclick="lpTop()">${lpLogo()}</button>
    <nav class="lp-nav" aria-label="Main"><a href="store">Test Store</a><a href="neet">NEET</a><a href="jee">JEE</a><button onclick="lpGo('lp-how')">How it works</button><button onclick="lpGo('lp-app')">Get the App</button></nav>
    <button class="lp-login" onclick="lpLogin()">Login / Register</button>
  </div><i class="lp-prog" id="lpProg"></i></header>

  <section class="lp-ban" aria-label="Offers"><div class="lp-bt" id="lpBt">${lpSlides()}</div><div class="lp-dots" id="lpDots"></div></section>

  <section class="lp-hero">
    <i class="lp-orb o1"></i><i class="lp-orb o2"></i>
    <p class="lp-kick">${ic('shield',15)} NEET · JEE · CBSE</p>
    <h1>India's <span class="lp-gold">trusted &amp; affordable</span> CBT Test Series</h1>
    <p class="lp-sub">Practise on a real exam screen, get your All-India rank after every test and see exactly where you lose marks.</p>
    <div class="lp-cta"><button class="lp-btn pri" onclick="lpLogin()">Get Started ${ic('right',18)}</button><a class="lp-btn sec" href="store">${ic('bag',18)} Buy a Test Series</a></div>
    <div class="lp-talk" aria-hidden="true">
      <div class="lp-av s">${lpMark()}</div>
      <div class="lp-bub q">What is Aspiron?</div>
      <div class="lp-bub a">Real exam practice for NEET &amp; JEE, with your rank and a full analysis after every test.</div>
    </div>
  </section>

  <section class="lp-stats">${stat('play','Live CBT tests','Real exam-style screen')}${stat('trophy','All-India rank','After every test')}${stat('chart','Deep analysis','Subject &amp; chapter wise')}${stat('lang','English + हिंदी','Both mediums')}</section>

  <section class="lp-sec"><h2 class="lp-h">Exam categories</h2><p class="lp-p">Choose the exam you are preparing for.</p>
    <div class="lp-exams">
      ${exam('neet','NEET','Full syllabus, part tests and PYQ for medical aspirants.',['Physics','Chemistry','Biology'],'neet')}
      ${exam('jee','JEE','JEE Main pattern tests with real marking and rank.',['Physics','Chemistry','Maths'],'jee')}
      ${exam('cbse','CBSE Boards','Board-style practice for Class 11 &amp; 12.',['Class 11','Class 12'],'cbse')}
    </div>
    <a class="lp-more" href="test-series">View all test series ${ic('right',16)}</a>
  </section>

  <section class="lp-sec lp-store" id="lp-store"><div class="lp-shd"><div><h2 class="lp-h l">Test Store</h2><p class="lp-p l">Buy a test series to get your access code.</p></div><a class="lp-link" href="store">See all ${ic('right',16)}</a></div>
    <div class="lp-items" id="lpItems">${lpItemsSkel()}</div>
  </section>

  <section class="lp-sec" id="lp-how"><h2 class="lp-h">How to start</h2><p class="lp-p">Sign-in works with a personal access code. Here is how you get it.</p>
    <ol class="lp-steps">
      ${step(1,'Buy a test series','Pick your series in the Test Store and pay by UPI.')}
      ${step(2,'Verify your payment','Send the payment screenshot on Telegram or WhatsApp. The Store shows you how.')}
      ${step(3,'Get your access code','Our team checks the payment and sends your personal code.')}
      ${step(4,'Sign in','Enter your mobile number and the access code. That is it.')}
    </ol>
    <div class="lp-cta c"><a class="lp-btn pri" href="store">${ic('bag',18)} Go to Test Store</a><button class="lp-btn sec" onclick="lpLogin('code')">${ic('key',18)} I have my code</button></div>
  </section>

  <section class="lp-sec"><h2 class="lp-h">Everything you need to score more</h2>
    <div class="lp-feats">
      ${feat('play','Real exam screen','The same CBT layout, timer and marking as the real exam.')}
      ${feat('trophy','Results &amp; ranks','All-India rank and percentile after every test.')}
      ${feat('note','Mistake Notebook','Every wrong answer saved for revision.')}
      ${feat('target','PYQ Analysis','Chapter-wise previous year questions.')}
      ${feat('book','Question Bank','Practise by subject and chapter.')}
      ${feat('wand','Test Generator','Make your own test in seconds.')}
      ${feat('pulse','Study Tracker','Track your daily progress.')}
      ${feat('bookmark','Saved Questions','Keep the questions you want to see again.')}
    </div>
  </section>

  <section class="lp-sec lp-appsec" id="lp-app">
    <div class="lp-appcard">
      <div class="lp-apptx"><h2>Get the Aspiron App</h2><p>Opens in one tap from your home screen, works on Android, iPhone and computer. Installs straight from this website, no Play Store needed.</p>
        <div class="lp-cta l">${lpStd()?`<span class="lp-okline">${ic('check',18)} You are using the app</span>`:`<button class="lp-btn gold" onclick="lpInstall(this)">${ic('install',18)} Install App</button>`}<button class="lp-btn ghost" onclick="lpLogin()">Continue on Web</button></div>
        <p class="lp-ih" id="lpIH" hidden></p></div>
      ${lpPhones()}
    </div>
  </section>

  <section class="lp-sec lp-rev" id="lp-rev" hidden><h2 class="lp-h">What students say</h2><p class="lp-p">Reviews from students who took our test series.</p>
    <div class="lp-rsum" id="lpRsum"></div><div class="lp-revs" id="lpRevs"></div>
    <a class="lp-more" href="store#/reviews">Read all reviews ${ic('right',16)}</a>
  </section>

  <section class="lp-sec lp-fd" id="lp-founder"><div class="lp-fdc">
    <span class="lp-fda" aria-hidden="true">SJ</span>
    <div><p class="lp-fdk">Founder</p><h2>Sanjay Joshi</h2><p class="lp-fdt">Founder, Aspiron Education</p></div>
  </div></section>

  <section class="lp-sec lp-join"><h2 class="lp-h">Join the Aspiron family today</h2><p class="lp-p">Follow us for free tips, test alerts and updates.</p>
    <div class="lp-soc" data-lpsoc>${typeof socialLinksHTML==='function'?socialLinksHTML():''}</div>
    <button class="lp-btn pri" onclick="lpLogin()">Get Started ${ic('right',18)}</button>
  </section>

  <footer class="lp-foot">
    <div class="lp-fb">${lpLogo()}<p>Online CBT test series for NEET, JEE and CBSE students: real exam practice, instant results, All-India rank and a full analysis, in English and Hindi medium.</p></div>
    <div class="lp-fcols">
      ${fl('Company',[['About Us','about'],['Contact Us','contact'],['FAQ','faq'],['Blog','blog/']])}
      ${fl('Popular exams',[['NEET','neet'],['JEE','jee'],['CBSE','cbse'],['CBT Test Series','cbt']])}
      ${fl('Quick links',[['Test Store','store'],['All Test Series','test-series'],['हिंदी: NEET','hi/neet'],['CBT Test Store','cbt-test-store']])}
      ${fl('Policies',[['Terms &amp; Conditions','terms'],['Privacy Policy','privacy'],['Refund Policy','refund']])}
    </div>
    <div class="lp-copy">© ${year} Aspiron Education · Founded by Sanjay Joshi. All rights reserved.</div>
  </footer>
  <button class="lp-fab" onclick="lpHelp()" aria-label="Chat with support">${ic('headset',26)}</button>
  </div>`;
}
function lpTop(){const s=$('#lp');if(s)s.scrollTo({top:0,behavior:lpRM()?'auto':'smooth'})}
function lpGo(id){lpMenu(false);const s=$('#lp'),e=document.getElementById(id);if(s&&e)s.scrollTo({top:e.offsetTop-70,behavior:lpRM()?'auto':'smooth'})}
function lpScroll(){
  const s=$('#lp'),p=$('#lpProg');if(!s||!p)return;
  const m=s.scrollHeight-s.clientHeight;p.style.transform=`scaleX(${m>0?Math.min(1,s.scrollTop/m):0})`;
  s.classList.toggle('scrolled',s.scrollTop>4);
}
function lpHelp(){
  if(typeof supportSheet==='function')return supportSheet('Hi, I want to know about the test series.');
  if(CFG.SUPPORT_URL)open(CFG.SUPPORT_URL,'_blank','noopener');
}

/* ---------- menu (slides in from the left, ✕ to close) ---------- */
function lpMenu(on){
  const old=$('#lpMenu');
  if(!on){if(old){old.classList.add('out');setTimeout(()=>old.remove(),lpRM()?0:220)}return}
  if(old)return;
  const it=(i,t,a)=>`<${a.href?`a href="${a.href}"`:`button onclick="${a.f}"`} class="lp-mi">${ic(i,20)}<span>${t}</span>${ic('right',16)}</${a.href?'a':'button'}>`;
  const dark=document.documentElement.dataset.theme==='dark';
  const d=document.createElement('div');d.id='lpMenu';d.className='lp-menu';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','Menu');
  d.innerHTML=`<div class="lp-mbg" onclick="lpMenu(false)"></div><div class="lp-mp">
    <div class="lp-mh">${lpLogo()}<button class="lp-ib" onclick="lpMenu(false)" aria-label="Close menu">${ic('x',24)}</button></div>
    <nav class="lp-ml">
      ${it('bag','Test Store',{href:'store'})}
      ${it('file','All Test Series',{href:'test-series'})}
      ${it('target','NEET',{href:'neet'})}
      ${it('flag','JEE',{href:'jee'})}
      ${it('book','CBSE Boards',{href:'cbse'})}
      ${it('key','How to get access',{f:"lpGo('lp-how')"})}
      ${lpStd()?'':it('install','Get the App',{f:'lpMenu(false);lpAppShow(1)'})}
      ${it('qa','FAQ',{href:'faq'})}
      ${it('info','About Us',{href:'about'})}
      ${it('msg','Contact Us',{f:'lpMenu(false);lpHelp()'})}
      ${it(dark?'sun':'moon',dark?'Light mode':'Dark mode',{f:'lpTheme()'})}
    </nav>
    <div class="lp-mf"><button class="lp-btn pri" onclick="lpLogin()">Login / Register</button></div>
  </div>`;
  ($('#app .lp')||document.body).appendChild(d);
  const k=e=>{if(e.key==='Escape'){lpMenu(false);removeEventListener('keydown',k)}};addEventListener('keydown',k);
}
function lpTheme(){
  const h=document.documentElement,t=h.dataset.theme==='dark'?'light':'dark';
  h.dataset.theme=t;delete h.dataset.oled;LS.set('cbt_theme',t);
  if(typeof syncTheme==='function')syncTheme();
  lpMenu(false);
}

/* ---------- banners (Admin → Banners) ---------- */
function lpDefSlides(){return [
  {title:'All-India CBT Test Series',text:'Real NEET & JEE pattern · All-India rank · Detailed analysis',label:'Explore tests',link:'store',c:'a'},
  {title:'English + हिंदी medium',text:'Every test in the language you study in',label:'See test series',link:'test-series',c:'b'},
  {title:'Need help choosing?',text:'Chat with our team on Telegram or WhatsApp',label:'Chat with us',link:'#help',c:'c'}]}
function lpSlides(){
  const L=LPBAN&&LPBAN.length?LPBAN:(LS.get('cbt_promo',null)||[]).length?LS.get('cbt_promo',[]):lpDefSlides();
  return L.map((x,i)=>{
    const raw=String(x.link||'');let on='';
    if(/^https?:\/\//i.test(raw))on=`href="${esc(raw)}" target="_blank" rel="noopener noreferrer"`;
    else if(raw==='#help')on=`role="button" tabindex="0" onclick="lpHelp()"`;
    else if(/^#\//.test(raw))on=`role="button" tabindex="0" onclick="lpLogin()"`;   // a page of the app: sign in first
    else if(/^[a-z0-9][a-z0-9/_-]*$/i.test(raw))on=`href="${esc(raw)}"`;
    const inner=x.img&&/^data:image\/|^https:\/\//.test(x.img)?`<img src="${esc(x.img)}" alt="${esc(x.title||'')}" loading="${i?'lazy':'eager'}" draggable="false">`
      :`<div class="lp-bx ${x.c||'abc'[i%3]}"><div><b>${esc(x.title||'')}</b>${x.text?`<span>${esc(x.text)}</span>`:''}${on?`<em>${esc(x.label||'Open')} →</em>`:''}</div>${lpMark('lp-bm')}</div>`;
    return on?`<a class="lp-bs" ${on}>${inner}</a>`:`<div class="lp-bs">${inner}</div>`;
  }).join('');
}
async function lpBanners(){
  lpBanWire();
  if(LPBAN)return;
  try{const r=await rpc('cbt_banners',{},true);if(r&&r.ok){LPBAN=r.items||[];LS.set('cbt_promo',LPBAN);const t=$('#lpBt');if(t&&LPBAN.length){t.innerHTML=lpSlides();t.scrollLeft=0;LPI=0;lpBanWire()}}}catch(e){}
}
function lpBanWire(){
  const t=$('#lpBt'),d=$('#lpDots');if(!t||!d)return;
  const n=t.children.length;
  d.innerHTML=n>1?Array.from({length:n},(_,i)=>`<button class="${i===LPI?'on':''}" aria-label="Slide ${i+1}" onclick="lpBanGo(${i})"></button>`).join(''):'';
  if(!t.dataset.w){t.dataset.w=1;let s;
    t.addEventListener('scroll',()=>{clearTimeout(s);s=setTimeout(()=>{LPI=Math.round(t.scrollLeft/Math.max(1,t.clientWidth));lpDots()},80)},{passive:true});
    ['touchstart','mouseenter'].forEach(e=>t.addEventListener(e,()=>LPHOLD=1,{passive:true}));
    ['touchend','mouseleave'].forEach(e=>t.addEventListener(e,()=>LPHOLD=0,{passive:true}));}
  clearInterval(LPT);
  LPT=setInterval(()=>{const t=$('#lpBt');if(!t){clearInterval(LPT);return}if(LPHOLD||document.hidden||t.children.length<2||$('#lpApp'))return;lpBanGo(LPI+1)},4000);
}
function lpBanGo(i){const t=$('#lpBt');if(!t)return;const n=t.children.length;LPI=(i+n)%n;t.scrollTo({left:LPI*t.clientWidth,behavior:lpRM()?'auto':'smooth'});lpDots()}
function lpDots(){document.querySelectorAll('#lpDots button').forEach((b,j)=>b.classList.toggle('on',j===LPI))}

/* ---------- Test Store (public list) ---------- */
function lpItemsSkel(){return Array.from({length:2},()=>`<div class="lp-item sk"><i></i><b></b><span></span></div>`).join('')}
async function lpStore(){
  if(!LPST){
    try{const r=await rpc('cbt_store',{},true);LPST=r&&r.ok?(r.items||[]):[]}catch(e){LPST=[]}
  }
  const box=$('#lpItems');if(!box)return;
  const L=LPST.slice(0,6);
  if(!L.length){box.innerHTML=`<div class="lp-empty">${ic('bag',26)}<b>New test series are coming soon</b><span>Open the Test Store to see what is available.</span><a class="lp-btn sec" href="store">Open Test Store</a></div>`;return}
  box.innerHTML=L.map(x=>{
    const img=x.image&&/^https:\/\/|^data:image\//.test(x.image)?`<img src="${esc(x.image)}" alt="" loading="lazy">`:`<div class="lp-ph">${lpMark()}<span>${esc(String(x.course||'').toUpperCase()||'TEST SERIES')}</span></div>`;
    const off=x.mrp&&x.price&&+x.mrp>+x.price?Math.round((1-x.price/x.mrp)*100):0;
    const cta=x.buy_on?'Buy now':x.prebook?'Pre-book':'Coming soon';
    const feats=(Array.isArray(x.features)?x.features:[]).slice(0,3);
    return `<a class="lp-item" href="store#x=${encodeURIComponent(x.id)}">
      <div class="lp-im">${img}${x.badge?`<em>${esc(x.badge)}</em>`:''}</div>
      <div class="lp-ib2"><b>${esc(x.title||'Test series')}</b>${x.subtitle?`<span class="lp-isub">${esc(x.subtitle)}</span>`:''}
      ${feats.length?`<ul>${feats.map(f=>`<li>${ic('check',14)}${esc(typeof f==='string'?f:(f&&f.t)||'')}</li>`).join('')}</ul>`:''}
      <div class="lp-pr">${x.price!=null?`<strong>${x.price>0?lpMoney(x.price):'Free'}</strong>`:''}${off?`<s>${lpMoney(x.mrp)}</s><i>${off}% off</i>`:''}</div>
      <span class="lp-buy${x.buy_on||x.prebook?'':' soon'}">${cta} ${ic('right',15)}</span></div></a>`;
  }).join('');
}

/* ---------- Get the app ---------- */
function lpPhones(){
  return `<div class="lp-phones" aria-hidden="true">
    <div class="lp-ph1 l"><div class="lp-scr"><i class="t"></i><div class="lp-rk"><span>🥇</span><span>🥈</span><span>🥉</span></div><i class="r"></i><i class="r s"></i><i class="r"></i></div></div>
    <div class="lp-ph1 c"><div class="lp-scr"><div class="lp-mh2">${lpMark()}<b>ASPIRON</b></div><div class="lp-card2"><b>NEET 2027</b><span>Full syllabus test · Live</span><em>Start test</em></div><i class="r"></i><i class="r s"></i><div class="lp-bars"><i style="height:40%"></i><i style="height:70%"></i><i style="height:55%"></i><i style="height:90%"></i></div></div></div>
    <div class="lp-ph1 r"><div class="lp-scr"><i class="t"></i><div class="lp-ring"><b>82%</b></div><i class="r"></i><i class="r s"></i></div></div>
  </div>`;
}
function lpAppMaybe(){
  if(lpStd())return;
  let seen=false;try{seen=sessionStorage.getItem('cbt_lpapp')==='1'}catch(e){}
  if(seen)return;
  setTimeout(()=>{if($('#app .lp')&&!AUTH&&!$('#lpApp')&&!$('#lpMenu')&&!document.querySelector('#layer .modal'))lpAppShow()},1200);
}
function lpAppShow(force){
  if(lpStd()||$('#lpApp'))return;
  try{sessionStorage.setItem('cbt_lpapp','1')}catch(e){}
  const d=document.createElement('div');d.id='lpApp';d.className='lp-pop';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','Get the Aspiron app');
  d.innerHTML=`<div class="lp-pbg" onclick="lpAppClose()"></div><div class="lp-ps">
    <div class="lp-phd"><button class="lp-px" onclick="lpAppClose()" aria-label="Close">${ic('x',20)}</button>
      <div class="lp-pm">${lpMark()}</div><h2>Learn better on the <span>Aspiron App</span></h2><p>Faster, full screen, and test alerts on your phone.</p></div>
    ${lpPhones()}
    <div class="lp-pft"><button class="lp-btn pri" onclick="lpInstall(this)">${ic('install',18)} Install App</button>
    <p class="lp-ih" id="lpIH2" hidden></p>
    <button class="lp-btn txt" onclick="lpAppClose()">Continue on Web</button></div>
  </div>`;
  ($('#app .lp')||document.body).appendChild(d);
  const k=e=>{if(e.key==='Escape'){lpAppClose();removeEventListener('keydown',k)}};addEventListener('keydown',k);
}
function lpAppClose(){const d=$('#lpApp');if(!d)return;d.classList.add('out');setTimeout(()=>d.remove(),lpRM()?0:240)}
async function lpInstall(btn){
  const hint=(btn&&btn.closest('.lp-ps')?$('#lpIH2'):$('#lpIH'));
  if(typeof DIP!=='undefined'&&DIP){
    try{DIP.prompt();const c=await DIP.userChoice;DIP=null;if(c&&c.outcome==='accepted'){lpAppClose();toast('Installing the app…');return}}catch(e){DIP=null}
    return;
  }
  if(!hint)return;
  hint.hidden=false;
  hint.innerHTML=lpIOS()
    ?`On iPhone: tap <b>Share</b> ${ic('download',15)} at the bottom of Safari, then <b>Add to Home Screen</b>.`
    :`Open your browser menu <b>⋮</b>, then tap <b>Install app</b> or <b>Add to Home screen</b>.`;
}

/* ---------- reviews (public cbt_store_reviews): shown on the page and given to Google as structured data ---------- */
async function lpReviews(){
  let r;try{r=await rpc('cbt_store_reviews',{},true)}catch(e){return}
  if(!r||!r.ok||!Array.isArray(r.items))return;
  const byId={};(LPST||[]).forEach(x=>byId[x.id]=x);
  const items=r.items.filter(x=>x&&x.count>0&&byId[x.id]);
  let n=0,sum=0;const all=[];
  items.forEach(x=>{n+=+x.count;sum+=(+x.avg||0)*x.count;(x.list||[]).forEach(v=>all.push(Object.assign({series:byId[x.id].title},v)))});
  const sec=$('#lp-rev');if(!sec||!n||!all.length)return;
  const avg=Math.round(sum/n*10)/10;
  const star=k=>`<span class="lp-stars" aria-label="${k} out of 5">${[1,2,3,4,5].map(i=>`<i class="${i<=Math.round(k)?'on':''}">★</i>`).join('')}</span>`;
  $('#lpRsum').innerHTML=`<b>${avg.toFixed(1)}</b><div>${star(avg)}<span>Based on ${n} review${n>1?'s':''}</span></div>`;
  const pick=all.filter(v=>String(v.body||'').trim()).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.rating-a.rating||b.at-a.at).slice(0,6);
  $('#lpRevs').innerHTML=pick.map(v=>{const nm=String(v.name||'Student').trim()||'Student',b=String(v.body||'').trim();
    return `<article class="lp-rv"><div class="lp-rvh"><span class="lp-rva">${/^data:image\//.test(v.photo||'')?`<img src="${esc(v.photo)}" alt="">`:esc(nm[0].toUpperCase())}</span><div><b>${esc(nm)}</b><span>${esc(v.series||'')}</span></div>${star(+v.rating||0)}</div>
     <p>${esc(b.length>260?b.slice(0,257)+'…':b)}</p></article>`}).join('');
  sec.hidden=false;
  // structured data: each series with reviews as a Course with its rating
  try{
    const ld={'@context':'https://schema.org','@graph':items.map(x=>{const it=byId[x.id];return {'@type':'Course',name:String(it.title||'Test series'),
      description:String(it.subtitle||it.title||'Online CBT test series'),url:location.origin+'/store#x='+x.id,
      provider:{'@type':'EducationalOrganization',name:'Aspiron Education',url:location.origin+'/',founder:{'@type':'Person',name:'Sanjay Joshi'}},
      aggregateRating:{'@type':'AggregateRating',ratingValue:+x.avg,reviewCount:+x.count,bestRating:5,worstRating:1},
      review:(x.list||[]).filter(v=>String(v.body||'').trim()).slice(0,3).map(v=>({'@type':'Review',reviewRating:{'@type':'Rating',ratingValue:+v.rating,bestRating:5},
        author:{'@type':'Person',name:String(v.name||'Student').slice(0,60)},reviewBody:String(v.body).slice(0,500)}))}})};
    let el=document.getElementById('lpLd');if(!el){el=document.createElement('script');el.type='application/ld+json';el.id='lpLd';document.head.appendChild(el)}
    el.textContent=JSON.stringify(ld).replace(/</g,'\\u003c');
  }catch(e){}
}

;(window.__p=window.__p||{})['app29']=2;
