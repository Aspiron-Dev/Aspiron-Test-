#!/usr/bin/env python3
"""Pre-renders the public SEO pages as plain static HTML (no JavaScript needed to read them).

    python3 scripts/build_seo_pages.py        (run from anywhere; writes into the repository)

Writes: about.html, neet.html, jee.html, cbse.html, cbt.html, test-series.html, cbt-test-store.html, faq.html, blog/index.html, blog/*.html,
hi/neet.html, hi/faq.html, 404.html and sitemap.xml. Edit the text below and run it again;
the date in UPDATED becomes "Last updated" and <lastmod>. Every title must be 50-60 characters and every
description 140-160 characters; the script stops if one is not.
Nothing here is loaded by the student app or the admin page.
"""
import html, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://aspironeducation.com"
BRAND = "Aspiron Education"
UPDATED = "2026-11-13"
UPDATED_EN = "13 November 2026"
UPDATED_HI = "13 नवंबर 2026"
WA = "https://wa.me/message/47QZ42AJBL4AE1"
TG = "https://t.me/Students_support_teams"
IG = "https://www.instagram.com/aspironeducation/"
WA_CH = "https://whatsapp.com/channel/0029VbE8vNvBvvsddM1RDV0u"
# Add YouTube / Facebook / X profile links here once they exist; they go into Organization "sameAs" and the footer.
SAME_AS = [IG, WA_CH, TG]
OG_IMG = SITE + "/og-image.jpg"
CSS = '<link rel="stylesheet" href="/legal.css?v=2">\n<link rel="stylesheet" href="/seo.css?v=1">'

e = html.escape


def org():
    return {"@type": "EducationalOrganization", "@id": SITE + "/#org", "name": BRAND, "alternateName": ["Aspiron", "Aspiron Edu"],
            "url": SITE + "/",
            "logo": {"@type": "ImageObject", "url": SITE + "/icon-512.png", "width": 512, "height": 512},
            "image": OG_IMG, "sameAs": SAME_AS,
            "description": "Online CBT test series platform for NEET, JEE and CBSE students: mock tests and previous year questions (PYQ), "
                           "with instant results, rank and analysis, in English and Hindi medium.",
            "contactPoint": [{"@type": "ContactPoint", "contactType": "customer support", "url": SITE + "/contact",
                              "availableLanguage": ["English", "Hindi"]}]}


def website():
    return {"@type": "WebSite", "@id": SITE + "/#site", "name": BRAND, "alternateName": ["Aspiron", "Aspiron Edu"],
            "url": SITE + "/", "publisher": {"@id": SITE + "/#org"}, "inLanguage": ["en-IN", "hi-IN"]}


def crumbs_ld(items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + u} for i, (n, u) in enumerate(items)]}


def faq_ld(faqs):
    return {"@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}


def course_ld(name, desc, url, exam, lang):
    return {"@type": "Course", "@id": SITE + url + "#course", "name": name, "description": desc, "url": SITE + url,
            "provider": {"@id": SITE + "/#org"}, "inLanguage": lang, "educationalLevel": "Class 11, Class 12 and droppers",
            "teaches": exam + " preparation through exam-style online mock tests",
            "hasCourseInstance": {"@type": "CourseInstance", "courseMode": "Online",
                                  "courseWorkload": "Full-length and chapter-wise timed tests"},
            "offers": {"@type": "Offer", "category": "Paid", "url": SITE + "/store", "availability": "https://schema.org/InStock"}}


def article_ld(title, desc, url, lang):
    return {"@type": "Article", "@id": SITE + url + "#article", "headline": title, "description": desc,
            "image": [OG_IMG], "datePublished": UPDATED, "dateModified": UPDATED, "inLanguage": lang,
            "mainEntityOfPage": SITE + url, "author": {"@type": "Organization", "name": BRAND, "url": SITE + "/"},
            "publisher": {"@id": SITE + "/#org"}}


def faq_html(faqs, heading):
    out = ['<div class="card faq" id="faq"><h2>%s</h2>' % e(heading)]
    for q, a in faqs:
        out.append("<details><summary>%s</summary><p>%s</p></details>" % (e(q), e(a)))
    out.append("</div>")
    return "\n".join(out)


def check(path, title, desc):
    t, d = len(title), len(desc)
    if not (50 <= t <= 60) or not (140 <= d <= 160):
        sys.exit("%s: title %d chars (want 50-60), description %d chars (want 140-160)" % (path, t, d))


def page(path, url, title, desc, h1, answer, body, crumbs, ld_extra, lang="en", alt=None, faqs=None, og_type="website"):
    """path: file to write; url: its clean address; alt: {'en': url, 'hi': url} for hreflang."""
    check(path, title, desc)
    hi = lang == "hi"
    graph = [org(), website(), crumbs_ld(crumbs)] + ld_extra
    if faqs:
        graph.append(faq_ld(faqs))
    hreflang = ""
    sw = ""
    if alt:
        hreflang = "\n".join('<link rel="alternate" hreflang="%s" href="%s%s">' % (k, SITE, v) for k, v in
                             (("en-IN", alt["en"]), ("hi-IN", alt["hi"]), ("x-default", alt["en"])))
        other = alt["en"] if hi else alt["hi"]
        sw = '<a class="langsw" href="%s" hreflang="%s" lang="%s">%s</a>' % (
            other, "en" if hi else "hi", "en" if hi else "hi", "English" if hi else "हिंदी")
    nav = (("/hi/neet", "NEET"), ("/jee", "JEE"), ("/cbse", "CBSE"), ("/test-series", "टेस्ट सीरीज़"), ("/store", "स्टोर"), ("/", "लॉगिन")) if hi else \
          (("/neet", "NEET"), ("/jee", "JEE"), ("/cbse", "CBSE"), ("/test-series", "Test Series"), ("/store", "Store"), ("/", "Login"))
    nav_html = "".join('<a class="lk" href="%s">%s</a>' % x for x in nav)
    crumb_html = "".join(
        ('<li><a href="%s">%s</a></li>' % (u, e(n))) if i < len(crumbs) - 1 else '<li aria-current="page">%s</li>' % e(n)
        for i, (n, u) in enumerate(crumbs))
    upd = ("अंतिम अपडेट: " + UPDATED_HI) if hi else ("Last updated: " + UPDATED_EN)
    foot_links = [("/about", "About Aspiron"), ("/neet", "Aspiron NEET"), ("/jee", "Aspiron JEE"), ("/cbse", "Aspiron CBSE"),
                  ("/cbt", "Aspiron CBT"), ("/test-series", "Test Series"), ("/cbt-test-store", "CBT Test Store"),
                  ("/faq", "FAQ"), ("/blog/", "Blog"), ("/hi/neet", "NEET टेस्ट सीरीज़ (हिंदी)"), ("/store", "Store"),
                  ("/privacy", "Privacy"), ("/terms", "Terms"), ("/refund", "Refund &amp; Delivery"), ("/contact", "Contact"),
                  (IG, "Instagram"), (WA_CH, "WhatsApp channel"), (TG, "Telegram")]
    foot = "".join(('<a href="%s"%s>%s</a>' % (u, ' rel="noopener" target="_blank"' if u.startswith("http") else "", n))
                   for u, n in foot_links)
    alt_loc = ('<meta property="og:locale:alternate" content="%s">' % ('en_IN' if hi else 'hi_IN')) if alt else ""
    ld = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":"))
    ld = ld.replace("</", "<\\/")
    doc = f"""<!doctype html>
<html lang="{'hi' if hi else 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'; upgrade-insecure-requests">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="{SITE}{url}">
{hreflang}
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{SITE}{url}">
<meta property="og:image" content="{OG_IMG}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{BRAND} – NEET &amp; JEE online CBT mock tests">
<meta property="og:locale" content="{'hi_IN' if hi else 'en_IN'}">
{alt_loc}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{OG_IMG}">
<meta name="theme-color" content="#f4f6fa">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script src="/store-theme.js?v=5"></script>
{CSS}
<script type="application/ld+json">{ld}</script>
</head>
<body>
<header class="top"><div class="top-in">
  <a class="brand" href="/"><img src="/icon-64.webp" width="28" height="28" alt="">{BRAND}</a><span class="sp"></span>
  {nav_html}{sw}
</div></header>
<main>
<ol class="crumbs" aria-label="Breadcrumb">{crumb_html}</ol>
<h1>{e(h1)}</h1>
<p class="upd"><time datetime="{UPDATED}">{upd}</time></p>
<div class="answer"><p>{answer}</p></div>
{body}
{faq_html(faqs, 'अक्सर पूछे जाने वाले सवाल' if hi else 'Frequently asked questions') if faqs else ''}
</main>
<footer class="pol">{foot}</footer>
</body>
</html>
"""
    doc = "\n".join(l for l in doc.split("\n") if l.strip() != "") + "\n"
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(doc)
    return url


CTA_EN = ('<div class="cta"><a class="btn pri" href="/store">See test series &amp; price</a>'
          '<a class="btn sec" href="/">Open the student app</a></div>')
CTA_HI = ('<div class="cta"><a class="btn pri" href="/store">टेस्ट सीरीज़ और कीमत देखें</a>'
          '<a class="btn sec" href="/">स्टूडेंट ऐप खोलें</a></div>')

FEATURES_EN = """<ul>
<li><b>Real exam screen (CBT):</b> timer, question palette, mark for review and section switching, like a computer-based exam.</li>
<li><b>Instant result:</b> score, accuracy, rank among all students who took the test, and a subject-wise and chapter-wise analysis.</li>
<li><b>Solutions for every question,</b> plus a list of your mistakes and saved questions to revise later.</li>
<li><b>Previous year questions (PYQ)</b> and a question bank for chapter-wise practice.</li>
<li><b>English and हिंदी medium:</b> where a series offers both, every student gets the tests in the medium they choose.</li>
<li><b>Works on any phone or computer,</b> and can be installed like an app. Live tests send a phone notification.</li>
</ul>"""

# ---------------------------------------------------------------- NEET test series (English)
NEET_FAQ = [
    ("Is the Aspiron NEET test series based on the latest NTA pattern?",
     "Yes. Full-length tests follow the NEET (UG) pattern: 180 questions from Physics, Chemistry, Botany and Zoology, 720 marks, +4 for a correct answer and −1 for a wrong one, in 3 hours."),
    ("Is the test series available in Hindi medium?",
     "Yes, for series marked English + हिंदी medium. You choose your medium once and every test opens in that language."),
    ("Can I take the NEET mock tests on my phone?",
     "Yes. The tests run in the browser on any Android phone, iPhone or computer, and the app can be installed on the home screen. No separate download is needed."),
    ("When do I get my result and rank?",
     "Right after you submit, you see your score, accuracy, all-India rank among Aspiron students, and solutions with a subject-wise and chapter-wise analysis."),
    ("How do I buy the NEET test series?",
     "Open the Store, pick the series, and pay with UPI. Access is added to your student account after the payment is checked. Details are in the Refund & Delivery policy."),
]
neet_body = f"""<div class="card">
<h2>What you get in the NEET test series</h2>
{FEATURES_EN}
{CTA_EN}
</div>
<div class="card">
<h2>NEET exam pattern the tests follow</h2>
<p>Full-length tests follow the pattern of NEET (UG) 2025 as published by the National Testing Agency (NTA). Always check the latest information bulletin on <a href="https://neet.nta.nic.in/" rel="noopener" target="_blank">neet.nta.nic.in</a>.</p>
<div class="tbl"><table>
<thead><tr><th>Subject</th><th>Questions</th><th>Marks</th></tr></thead>
<tbody><tr><td>Physics</td><td>45</td><td>180</td></tr><tr><td>Chemistry</td><td>45</td><td>180</td></tr>
<tr><td>Botany</td><td>45</td><td>180</td></tr><tr><td>Zoology</td><td>45</td><td>180</td></tr>
<tr><th>Total</th><th>180</th><th>720</th></tr></tbody></table></div>
<p>Marking: +4 for a correct answer, −1 for a wrong answer, 0 if left blank. Time: 3 hours (180 minutes).</p>
<h3>How to use the tests well</h3>
<p>Take one full test a week in the same 3-hour slot as the real exam, then spend as long again on the analysis. Read the guide <a href="/blog/how-to-use-neet-mock-tests">how to use NEET mock tests</a> and the <a href="/blog/neet-exam-pattern">NEET exam pattern and marking scheme</a>.</p>
</div>"""

# ---------------------------------------------------------------- JEE test series
JEE_FAQ = [
    ("Does the Aspiron JEE test series follow the JEE Main pattern?",
     "Yes. Full-length tests follow JEE Main: 75 questions, 25 each from Physics, Chemistry and Mathematics (20 MCQ + 5 numerical), 300 marks, in 3 hours."),
    ("Is there negative marking in the JEE mock tests?",
     "Yes, as in JEE Main: +4 for a correct answer and −1 for a wrong answer, for both MCQ and numerical questions. Unanswered questions get 0."),
    ("Is JEE Main a computer-based test?",
     "Yes. JEE Main is held as a computer-based test (CBT), so practising on an exam-style screen with a timer and question palette helps you manage time."),
    ("Can I see solutions after the test?",
     "Yes. After you submit you get your score, rank, solutions for every question and a subject-wise and chapter-wise analysis."),
    ("How do I buy the JEE test series?",
     "Open the Store, choose JEE as your course, pick a series and pay with UPI. Access is added to your account after the payment is checked."),
]
jee_body = f"""<div class="card">
<h2>What you get in the JEE test series</h2>
{FEATURES_EN}
{CTA_EN}
</div>
<div class="card">
<h2>JEE Main pattern the tests follow</h2>
<p>Full-length tests follow the JEE Main 2025 pattern published by NTA. Check the latest bulletin on <a href="https://jeemain.nta.nic.in/" rel="noopener" target="_blank">jeemain.nta.nic.in</a>.</p>
<div class="tbl"><table>
<thead><tr><th>Subject</th><th>MCQ</th><th>Numerical</th><th>Marks</th></tr></thead>
<tbody><tr><td>Physics</td><td>20</td><td>5</td><td>100</td></tr><tr><td>Chemistry</td><td>20</td><td>5</td><td>100</td></tr>
<tr><td>Mathematics</td><td>20</td><td>5</td><td>100</td></tr><tr><th>Total</th><th>60</th><th>15</th><th>300</th></tr></tbody></table></div>
<p>Marking: +4 correct, −1 wrong (MCQ and numerical), 0 unanswered. Time: 3 hours, on a computer.</p>
</div>"""

# ---------------------------------------------------------------- FAQ (English)
FAQ_EN = [
    ("What is Aspiron Education?",
     "Aspiron Education is an online platform for NEET and JEE preparation. It offers exam-style CBT mock tests, test series, previous year questions (PYQ) and a question bank, with instant results, rank and analysis."),
    ("What is a CBT mock test?",
     "A CBT (computer-based test) mock test is a timed practice exam on a screen that looks and works like the real exam: timer, question palette, mark for review and instant submission."),
    ("Is Aspiron good for NEET preparation?",
     "Aspiron is built for NEET practice: full-length tests in the NEET pattern (180 questions, 720 marks, +4/−1), chapter-wise tests, PYQ and a detailed analysis of every attempt so you know what to revise."),
    ("Are tests available in Hindi?",
     "Yes. Series marked English + हिंदी medium give each student the tests in the medium they choose."),
    ("Do I need to download an app?",
     "No. Aspiron works in the browser on any phone or computer. You can also install it on your home screen like an app and get notifications for live tests."),
    ("How do I pay?",
     "Pay with UPI on the Store. After the payment is checked, the test series is added to your student account."),
    ("Is there a refund?",
     "Test series are digital products and are not refundable. If you bought the wrong series by mistake, contact support; the Refund & Delivery policy explains when it can be moved."),
    ("On how many devices can I use my account?",
     "One account works on at most two devices, so that your tests and results stay your own."),
    ("How do I contact support?",
     "Message us on WhatsApp or Telegram from your registered mobile number. The links are on the Contact page."),
]
faq_body = f"""<div class="card">
<h2>Start here</h2>
<p>New to Aspiron? See <a href="/about">About Aspiron Education</a>, the <a href="/neet">NEET test series</a>, the <a href="/jee">JEE test series</a> or <a href="/test-series">all test series</a>, then open the <a href="/store">Store</a> to see what each series contains and its price. Policies: <a href="/refund">Refund &amp; Delivery</a>, <a href="/privacy">Privacy</a>, <a href="/terms">Terms</a>.</p>
</div>"""

# ---------------------------------------------------------------- Blog articles
POSTS = [
    dict(slug="neet-exam-pattern",
         title="NEET Exam Pattern & Marking Scheme Explained Simply",
         desc="NEET (UG) pattern in one place: 180 questions, 720 marks, +4/−1 marking, 3 hours, subject-wise split, and how to plan your attempt for more marks.",
         h1="NEET exam pattern and marking scheme",
         answer="NEET (UG) has <b>180 compulsory questions</b> (Physics 45, Chemistry 45, Botany 45, Zoology 45) for <b>720 marks</b> in <b>3 hours</b>. A correct answer gets <b>+4</b>, a wrong answer <b>−1</b> and a blank 0. It is a pen-and-paper (OMR) exam conducted by NTA.",
         body="""<div class="card">
<h2>Subject-wise split</h2>
<div class="tbl"><table><thead><tr><th>Subject</th><th>Questions</th><th>Marks</th></tr></thead>
<tbody><tr><td>Physics</td><td>45</td><td>180</td></tr><tr><td>Chemistry</td><td>45</td><td>180</td></tr><tr><td>Botany</td><td>45</td><td>180</td></tr><tr><td>Zoology</td><td>45</td><td>180</td></tr><tr><th>Total</th><th>180</th><th>720</th></tr></tbody></table></div>
<p>This is the NEET (UG) 2025 pattern, when NTA removed the optional Section B and made all 180 questions compulsory. Confirm the pattern for your year in the official bulletin on <a href="https://neet.nta.nic.in/" rel="noopener" target="_blank">neet.nta.nic.in</a>.</p>
<h2>What the marking means for you</h2>
<p>A wrong answer costs 1 mark, so blind guessing adds risk. A guess is worth taking when you can rule out at least one or two options with confidence. Biology is half the paper (360 marks), so it decides most ranks; Physics usually takes the most time per question.</p>
<h2>Plan your 180 minutes</h2>
<ul><li>Biology first (about 60–70 minutes), then Chemistry, then Physics.</li><li>Do one quick round of every question you are sure of, then return to the rest.</li><li>Keep the last 10 minutes to check the OMR bubbles.</li></ul>
<p>Practise this plan in a full-length <a href="/neet">NEET mock test</a> before the exam, not on exam day.</p>
</div>""",
         faqs=[("How many questions are there in NEET?", "180 questions, all compulsory: 45 each from Physics, Chemistry, Botany and Zoology."),
               ("What is the total mark of NEET?", "720 marks: 180 questions × 4 marks."),
               ("Is there negative marking in NEET?", "Yes. Each wrong answer costs 1 mark. Unanswered questions get 0."),
               ("Is NEET a computer-based exam?", "No. NEET (UG) is a pen-and-paper exam on an OMR sheet. Online mock tests are still useful to build speed and accuracy.")]),
    dict(slug="how-to-use-neet-mock-tests",
         title="How to Use NEET Mock Tests to Improve Your Score Fast",
         desc="A simple method for NEET mock tests: when to start, how many to take, how to analyse each one, and how to turn your mistakes into marks before the exam.",
         h1="How to use NEET mock tests to improve your score",
         answer="Take <b>one full-length mock test a week</b> in the same 3-hour slot as NEET, then spend <b>as much time on analysis</b> as on the test. Write every mistake into a list, revise those topics, and re-check them in the next test. In the last two months, move to two or three tests a week.",
         body="""<div class="card">
<h2>1. When to start</h2>
<p>Start chapter-wise tests as soon as you finish a chapter, and full-length tests once most of the syllabus is done once. Waiting until "everything is perfect" leaves too little time to fix weak areas.</p>
<h2>2. Take the test like the real exam</h2>
<ul><li>Same time of day as NEET, 3 hours, no breaks, phone notifications off.</li><li>Follow your section order and time plan every time.</li></ul>
<h2>3. Analyse every test</h2>
<ul><li>Sort mistakes into three groups: did not know, silly error, ran out of time.</li><li>Read the solution for every wrong and guessed question.</li><li>Look at the chapter-wise analysis and pick the two weakest chapters for the week.</li></ul>
<h2>4. Track progress, not one score</h2>
<p>Scores go up and down with paper difficulty. Your rank among other students and your accuracy over five or six tests show the real trend.</p>
<p>Aspiron's <a href="/neet">NEET test series</a> gives an instant result, rank, solutions and a mistakes list after every test, so this method takes less effort.</p>
</div>""",
         faqs=[("How many mock tests should I take before NEET?", "One full test a week for most of the year and two or three a week in the last two months is a common plan; the analysis matters more than the number."),
               ("Are online mock tests useful if NEET is on paper?", "Yes. They train speed, time management and accuracy under a timer; practise filling an OMR sheet separately before the exam."),
               ("What should I do after a mock test?", "Read every solution, write your mistakes into a list, revise those topics, and check them again in the next test.")]),
    dict(slug="neet-pyq-strategy",
         title="NEET PYQ Strategy: How to Use Previous Year Questions",
         desc="How to practise NEET previous year questions (PYQ): which years to solve, chapter-wise versus full papers, and how PYQ show the topics NTA asks most often.",
         h1="NEET PYQ strategy: using previous year questions",
         answer="Solve <b>at least the last 10 years of NEET questions chapter-wise</b> as you finish each chapter, then attempt <b>the last 3–5 papers as full timed tests</b>. PYQ show which NCERT lines and topics are asked again and again, so mark them in your NCERT book.",
         body="""<div class="card">
<h2>Why PYQ matter</h2>
<p>NEET questions are based on the NCERT syllabus, and many concepts come back in a new form. Previous year questions show the level, the wording and the topics that carry the most marks.</p>
<h2>A simple PYQ plan</h2>
<ul><li><b>During the syllabus:</b> after each chapter, solve its PYQ from the last 10 years.</li><li><b>Mark NCERT:</b> highlight each line a question came from.</li><li><b>Last 2–3 months:</b> attempt the most recent papers as full 3-hour tests.</li><li><b>Re-solve wrong ones</b> after two weeks without looking at the answer.</li></ul>
<h2>Where to practise</h2>
<p>The Aspiron student app has PYQ and a question bank by chapter, with solutions, alongside the <a href="/neet">NEET test series</a>.</p>
</div>""",
         faqs=[("How many years of NEET PYQ should I solve?", "At least the last 10 years chapter-wise; more if time allows. Solve the most recent 3–5 papers as full timed tests."),
               ("Are PYQ enough for NEET?", "No. PYQ show the pattern and important topics, but you also need NCERT reading and regular full-length mock tests.")]),
]

# ---------------------------------------------------------------- Hindi pages
NEET_FAQ_HI = [
    ("क्या Aspiron की NEET टेस्ट सीरीज़ नए NTA पैटर्न पर है?",
     "हाँ। फुल टेस्ट NEET (UG) पैटर्न पर हैं: फिजिक्स, केमिस्ट्री, बॉटनी और ज़ूलॉजी से 180 सवाल, 720 अंक, सही पर +4 और गलत पर −1, समय 3 घंटे।"),
    ("क्या टेस्ट हिंदी माध्यम में मिलते हैं?",
     "हाँ, जिन सीरीज़ पर English + हिंदी माध्यम लिखा है, उनमें आप एक बार माध्यम चुनते हैं और हर टेस्ट उसी भाषा में खुलता है।"),
    ("क्या मोबाइल पर टेस्ट दे सकते हैं?",
     "हाँ। टेस्ट किसी भी Android फ़ोन, iPhone या कंप्यूटर के ब्राउज़र में चलते हैं, और ऐप को होम स्क्रीन पर इंस्टॉल भी कर सकते हैं।"),
    ("रिज़ल्ट और रैंक कब मिलती है?",
     "टेस्ट सबमिट करते ही आपको स्कोर, सटीकता, रैंक, हर सवाल का हल और विषय व अध्याय के हिसाब से विश्लेषण मिलता है।"),
    ("टेस्ट सीरीज़ कैसे खरीदें?",
     "स्टोर खोलें, सीरीज़ चुनें और UPI से भुगतान करें। भुगतान जाँचने के बाद सीरीज़ आपके अकाउंट में जुड़ जाती है।"),
]
neet_body_hi = f"""<div class="card">
<h2>NEET टेस्ट सीरीज़ में क्या मिलता है</h2>
<ul>
<li><b>असली परीक्षा जैसी स्क्रीन (CBT):</b> टाइमर, प्रश्न पैलेट, मार्क फॉर रिव्यू।</li>
<li><b>तुरंत रिज़ल्ट:</b> स्कोर, सटीकता, सभी छात्रों में रैंक और अध्याय के हिसाब से विश्लेषण।</li>
<li><b>हर सवाल का हल,</b> साथ में आपकी गलतियों और सेव किए सवालों की सूची।</li>
<li><b>पिछले वर्षों के प्रश्न (PYQ)</b> और अध्याय के हिसाब से प्रश्न बैंक।</li>
<li><b>English और हिंदी माध्यम</b> (जिन सीरीज़ में दोनों हैं)।</li>
<li><b>हर फ़ोन और कंप्यूटर पर चलता है,</b> ऐप की तरह इंस्टॉल भी होता है।</li>
</ul>
{CTA_HI}
</div>
<div class="card">
<h2>NEET परीक्षा पैटर्न</h2>
<p>फुल टेस्ट NTA के NEET (UG) 2025 पैटर्न पर हैं। नई जानकारी के लिए <a href="https://neet.nta.nic.in/" rel="noopener" target="_blank">neet.nta.nic.in</a> देखें।</p>
<div class="tbl"><table>
<thead><tr><th>विषय</th><th>प्रश्न</th><th>अंक</th></tr></thead>
<tbody><tr><td>फिजिक्स</td><td>45</td><td>180</td></tr><tr><td>केमिस्ट्री</td><td>45</td><td>180</td></tr>
<tr><td>बॉटनी</td><td>45</td><td>180</td></tr><tr><td>ज़ूलॉजी</td><td>45</td><td>180</td></tr>
<tr><th>कुल</th><th>180</th><th>720</th></tr></tbody></table></div>
<p>अंकन: सही उत्तर +4, गलत उत्तर −1, खाली छोड़ने पर 0। समय: 3 घंटे।</p>
</div>"""

FAQ_HI = [
    ("Aspiron Education क्या है?",
     "Aspiron Education NEET और JEE की तैयारी के लिए एक ऑनलाइन प्लेटफ़ॉर्म है, जिसमें परीक्षा जैसे CBT मॉक टेस्ट, टेस्ट सीरीज़, PYQ और प्रश्न बैंक हैं, साथ में तुरंत रिज़ल्ट, रैंक और विश्लेषण।"),
    ("CBT मॉक टेस्ट क्या होता है?",
     "CBT (कंप्यूटर आधारित टेस्ट) मॉक टेस्ट एक समयबद्ध अभ्यास परीक्षा है, जिसकी स्क्रीन असली परीक्षा जैसी होती है: टाइमर, प्रश्न पैलेट और मार्क फॉर रिव्यू।"),
    ("क्या टेस्ट हिंदी में मिलते हैं?",
     "हाँ। जिन सीरीज़ पर English + हिंदी माध्यम लिखा है, उनमें हर छात्र को उसके चुने माध्यम में टेस्ट मिलते हैं।"),
    ("क्या ऐप डाउनलोड करना ज़रूरी है?",
     "नहीं। Aspiron किसी भी फ़ोन या कंप्यूटर के ब्राउज़र में चलता है। चाहें तो इसे होम स्क्रीन पर ऐप की तरह इंस्टॉल कर सकते हैं।"),
    ("भुगतान कैसे करें?",
     "स्टोर पर UPI से भुगतान करें। भुगतान जाँचने के बाद टेस्ट सीरीज़ आपके अकाउंट में जुड़ जाती है।"),
    ("क्या रिफंड मिलता है?",
     "टेस्ट सीरीज़ डिजिटल प्रोडक्ट है, इसलिए रिफंड नहीं होता। गलत सीरीज़ खरीद ली हो तो सपोर्ट से संपर्क करें।"),
    ("सपोर्ट से कैसे बात करें?",
     "अपने रजिस्टर्ड मोबाइल नंबर से WhatsApp या Telegram पर मैसेज करें। लिंक Contact पेज पर हैं।"),
]

# ---------------------------------------------------------------- build
urls = []
H = ("Home", "/")
H_HI = ("होम", "/")
TS = ("Test Series", "/test-series")

urls.append(page("neet.html", "/neet",
    "Aspiron NEET Test Series 2027 – Online CBT Mock Tests",
    "Aspiron NEET test series: full-length CBT mock tests in the NTA pattern, instant result with rank and analysis, PYQ, and English or Hindi medium on any phone.",
    "Aspiron NEET test series: online CBT mock tests",
    "Aspiron's NEET test series gives you <b>full-length and chapter-wise online mock tests in the NTA pattern</b> (180 questions, 720 marks, +4/−1), with an <b>instant result, all-India rank among Aspiron students and a detailed analysis</b>. Tests work on any phone, in English or हिंदी medium.",
    neet_body, [H, TS, ("Aspiron NEET", "/neet")],
    [course_ld("NEET Test Series – Online CBT Mock Tests",
               "Full-length and chapter-wise NEET (UG) mock tests in the NTA pattern with instant result, rank, solutions and analysis.",
               "/neet", "NEET (UG)", ["en", "hi"])],
    alt={"en": "/neet", "hi": "/hi/neet"}, faqs=NEET_FAQ))

urls.append(page("jee.html", "/jee",
    "Aspiron JEE Main Test Series – Online CBT Mock Tests",
    "Aspiron JEE Main test series: computer-based mock tests in the NTA pattern, 75 questions and 300 marks, instant score, rank, solutions and chapter analysis.",
    "Aspiron JEE Main test series: online CBT mock tests",
    "Aspiron's JEE test series gives you <b>computer-based mock tests in the JEE Main pattern</b> (75 questions, 300 marks, +4/−1) on an exam-style screen, with an <b>instant score, rank, solutions and a chapter-wise analysis</b> after every test.",
    jee_body, [H, TS, ("Aspiron JEE", "/jee")],
    [course_ld("JEE Main Test Series – Online CBT Mock Tests",
               "Full-length and chapter-wise JEE Main mock tests on an exam-style CBT screen with instant score, rank, solutions and analysis.",
               "/jee", "JEE Main", ["en"])], faqs=JEE_FAQ))

urls.append(page("faq.html", "/faq",
    "FAQ – NEET & JEE Mock Tests, Payment, Hindi | Aspiron",
    "Answers to common questions about Aspiron Education: CBT mock tests, NEET and JEE test series, Hindi medium, UPI payment, refunds, devices and support.",
    "Frequently asked questions",
    "Aspiron Education is an <b>online platform for NEET and JEE mock tests</b>. You buy a test series on the Store with UPI, take exam-style tests on any phone or computer, and get an <b>instant result, rank and analysis</b>. Tests are in English or हिंदी medium where the series offers both.",
    faq_body, [H, ("FAQ", "/faq")], [], alt={"en": "/faq", "hi": "/hi/faq"}, faqs=FAQ_EN))

post_list = "".join('<li><a href="/blog/%s"><b>%s</b><span>%s</span></a></li>' % (p["slug"], e(p["h1"]), e(p["desc"])) for p in POSTS)
urls.append(page("blog/index.html", "/blog/",
    "NEET & JEE Preparation Blog – Tips and Exam Guides | Aspiron",
    "Simple NEET and JEE preparation guides from Aspiron Education: exam pattern, marking scheme, how to use mock tests, and how to practise previous year questions.",
    "NEET and JEE preparation blog",
    "Short, practical guides for NEET and JEE students: the <b>exam pattern and marking</b>, <b>how to use mock tests</b> to raise your score, and <b>how to practise previous year questions (PYQ)</b>.",
    '<ul class="posts">%s</ul>' % post_list, [H, ("Blog", "/blog/")],
    [{"@type": "Blog", "@id": SITE + "/blog/#blog", "name": BRAND + " Blog", "url": SITE + "/blog/",
      "publisher": {"@id": SITE + "/#org"}, "inLanguage": "en-IN",
      "blogPost": [{"@id": SITE + "/blog/" + p["slug"] + "#article"} for p in POSTS]}]))

for p in POSTS:
    url = "/blog/" + p["slug"]
    fig = ('<figure class="fig"><picture><source srcset="/og-image.webp" type="image/webp">'
           '<img src="/og-image.jpg" width="1200" height="630" loading="lazy" decoding="async" '
           'alt="Aspiron Education NEET and JEE online CBT mock tests"></picture></figure>')
    body = p["body"] + fig + '<div class="card"><h2>Practise with Aspiron</h2>' + CTA_EN + "</div>"
    urls.append(page("blog/%s.html" % p["slug"], url, p["title"], p["desc"], p["h1"], p["answer"], body,
                     [H, ("Blog", "/blog/"), (p["h1"], url)], [article_ld(p["title"], p["desc"], url, "en-IN")],
                     faqs=p["faqs"], og_type="article"))

urls.append(page("hi/neet.html", "/hi/neet",
    "NEET टेस्ट सीरीज़ 2027 हिंदी में – ऑनलाइन मॉक टेस्ट Aspiron",
    "Aspiron की NEET टेस्ट सीरीज़: NTA पैटर्न पर ऑनलाइन CBT मॉक टेस्ट, हिंदी माध्यम, तुरंत रिज़ल्ट, रैंक, हर सवाल का हल और विश्लेषण, किसी भी मोबाइल पर, PYQ के साथ।",
    "NEET टेस्ट सीरीज़: हिंदी माध्यम में ऑनलाइन मॉक टेस्ट",
    "Aspiron की NEET टेस्ट सीरीज़ में <b>NTA पैटर्न पर फुल और अध्याय-वार ऑनलाइन मॉक टेस्ट</b> हैं (180 सवाल, 720 अंक, +4/−1)। टेस्ट <b>हिंदी या English माध्यम</b> में, किसी भी फ़ोन पर, और सबमिट करते ही <b>रिज़ल्ट, रैंक और विश्लेषण</b> मिलता है।",
    neet_body_hi, [H_HI, ("NEET टेस्ट सीरीज़", "/hi/neet")],
    [course_ld("NEET टेस्ट सीरीज़ – हिंदी माध्यम ऑनलाइन मॉक टेस्ट",
               "NTA पैटर्न पर NEET (UG) के फुल और अध्याय-वार ऑनलाइन मॉक टेस्ट, हिंदी माध्यम में, तुरंत रिज़ल्ट और रैंक के साथ।",
               "/hi/neet", "NEET (UG)", ["hi", "en"])],
    lang="hi", alt={"en": "/neet", "hi": "/hi/neet"}, faqs=NEET_FAQ_HI))

urls.append(page("hi/faq.html", "/hi/faq",
    "अक्सर पूछे जाने वाले सवाल – NEET, JEE मॉक टेस्ट | Aspiron",
    "Aspiron Education के बारे में आम सवालों के जवाब: CBT मॉक टेस्ट, NEET और JEE टेस्ट सीरीज़, हिंदी माध्यम, UPI भुगतान, रिफंड नियम और सपोर्ट से संपर्क कैसे करें।",
    "अक्सर पूछे जाने वाले सवाल",
    "Aspiron Education <b>NEET और JEE के ऑनलाइन मॉक टेस्ट</b> का प्लेटफ़ॉर्म है। स्टोर पर UPI से टेस्ट सीरीज़ खरीदें, किसी भी फ़ोन या कंप्यूटर पर परीक्षा जैसे टेस्ट दें, और तुरंत <b>रिज़ल्ट, रैंक और विश्लेषण</b> पाएँ।",
    '<div class="card"><p>शुरुआत करें: <a href="/hi/neet">NEET टेस्ट सीरीज़ (हिंदी)</a> देखें, फिर <a href="/store">स्टोर</a> में हर सीरीज़ और उसकी कीमत देखें।</p></div>',
    [H_HI, ("सवाल-जवाब", "/hi/faq")], [], lang="hi", alt={"en": "/faq", "hi": "/hi/faq"}, faqs=FAQ_HI))

# ---------------------------------------------------------------- brand pages: about, CBSE, CBT, test series, store guide
MEDIUM = "Tests are for both English medium and हिंदी medium students: where a series offers both, you pick your medium once and every test opens in it."

CBSE_FAQ = [
    ("Does Aspiron Education have tests for CBSE students?",
     "Aspiron's chapter-wise tests are NCERT-based, so CBSE Class 11 and 12 Physics, Chemistry, Biology and Maths students can use them for practice. The Store shows which series are open right now."),
    ("Are Aspiron tests based on NCERT?",
     "Yes. Questions are tagged as NCERT based, previous year (PYQ) or extra, and tests follow the Class 11 and 12 chapters of the NCERT books that CBSE uses."),
    ("Is Aspiron linked to CBSE?",
     "No. Aspiron Education is an independent platform and is not linked to CBSE, NCERT or NTA. Board names are used only to describe the syllabus."),
    ("Can I take the tests in Hindi medium?",
     "Yes, in series marked English + हिंदी medium. You choose your medium once and every test opens in that language."),
]
urls.append(page("cbse.html", "/cbse",
    "Aspiron CBSE Tests – Class 11 & 12 NCERT Chapter Tests",
    "Aspiron Education for CBSE Class 11 and 12: NCERT-based chapter-wise online tests in Physics, Chemistry, Biology and Maths with instant result and solutions.",
    "Aspiron CBSE: NCERT chapter tests for Class 11 and 12",
    "Aspiron Education's online tests are <b>NCERT-based and chapter-wise</b>, so <b>CBSE Class 11 and 12</b> science students can practise Physics, Chemistry, Biology and Maths on an exam-style screen and get an <b>instant result with solutions</b>. " + MEDIUM,
    f"""<div class="card">
<h2>How CBSE students use Aspiron</h2>
<ul>
<li><b>Chapter-wise tests</b> after you finish each NCERT chapter in school or coaching.</li>
<li><b>Instant result</b> with solutions, so you see which NCERT topics to read again.</li>
<li><b>One preparation for boards and entrance exams:</b> the same NCERT chapters are the base of NEET and JEE.</li>
<li><b>English and हिंदी medium</b> in series that offer both.</li>
</ul>
<p>The series that are open right now, and what each one contains, are listed on the <a href="/store">Store</a>. For entrance exams see <a href="/neet">Aspiron NEET</a> and <a href="/jee">Aspiron JEE</a>.</p>
{CTA_EN}
</div>""", [H, TS, ("Aspiron CBSE", "/cbse")],
    [course_ld("Aspiron CBSE Class 11 & 12 NCERT Chapter Tests",
               "NCERT-based chapter-wise online tests for CBSE Class 11 and 12 Physics, Chemistry, Biology and Maths with instant result and solutions.",
               "/cbse", "CBSE Class 11 and 12 (NCERT)", ["en", "hi"])], faqs=CBSE_FAQ))

CBT_FAQ = [
    ("What is Aspiron CBT?",
     "Aspiron CBT is the computer-based test platform of Aspiron Education. Students take timed NEET, JEE and NCERT chapter tests on a real exam-style screen and get an instant result, rank and analysis."),
    ("What does CBT mean?",
     "CBT means computer-based test: an exam taken on a screen with a timer, a question palette and mark for review, instead of on paper."),
    ("Does Aspiron CBT work on a mobile phone?",
     "Yes. It runs in the browser on any Android phone, iPhone or computer, and can be installed on the home screen like an app."),
    ("Is Aspiron CBT in Hindi and English?",
     "Yes. Series marked English + हिंदी medium show every test in the medium the student chooses."),
    ("NEET is on paper. Why practise on CBT?",
     "A CBT mock gives you a strict timer, an instant result, your rank and a chapter-wise analysis, which paper practice at home cannot. Practise OMR filling separately."),
]
urls.append(page("cbt.html", "/cbt",
    "Aspiron CBT – Online Computer-Based Test Platform, India",
    "Aspiron CBT is Aspiron Education's online computer-based test platform for NEET and JEE: exam-style screen, timer, instant result, rank and full analysis.",
    "Aspiron CBT: online computer-based test platform",
    "<b>Aspiron CBT</b> is the online computer-based test platform of Aspiron Education. You take <b>timed NEET, JEE and NCERT chapter tests on a real exam-style screen</b> and get an <b>instant result, rank and analysis</b>. " + MEDIUM,
    f"""<div class="card">
<h2>What the Aspiron CBT screen has</h2>
<ul>
<li><b>Timer and question palette</b> showing answered, not answered and marked-for-review questions.</li>
<li><b>Section switching</b> between subjects, like the real exam.</li>
<li><b>Live tests</b> at a fixed time with a phone notification, and practice tests any time.</li>
<li><b>Result in seconds:</b> score, accuracy, rank, time spent per question and solutions.</li>
<li><b>After the test:</b> mistakes list, saved questions, PYQ and question bank.</li>
</ul>
{CTA_EN}
</div>
<div class="card">
<h2>Tests on the platform</h2>
<p><a href="/neet">Aspiron NEET test series</a> · <a href="/jee">Aspiron JEE test series</a> · <a href="/cbse">Aspiron CBSE / NCERT chapter tests</a> · <a href="/test-series">all test series</a> · <a href="/cbt-test-store">CBT test store</a></p>
</div>""", [H, ("Aspiron CBT", "/cbt")],
    [{"@type": "WebApplication", "@id": SITE + "/cbt#app", "name": "Aspiron CBT", "url": SITE + "/",
      "applicationCategory": "EducationalApplication", "operatingSystem": "Android, iOS, Windows, macOS (web browser)",
      "inLanguage": ["en", "hi"], "publisher": {"@id": SITE + "/#org"},
      "description": "Computer-based test platform for NEET and JEE mock tests with instant result, rank and analysis."}],
    faqs=CBT_FAQ))

TS_FAQ = [
    ("Which test series does Aspiron Education offer?",
     "Aspiron offers online CBT test series for NEET (UG) and JEE Main, with NCERT-based chapter tests that CBSE Class 11 and 12 students can also use. The Store lists the series open right now."),
    ("Is the Aspiron test series online or offline?",
     "Online. Every test is taken on the Aspiron CBT screen on a phone or computer, and the result comes instantly."),
    ("Is the Aspiron test series for Hindi medium students too?",
     "Yes. Aspiron is for both English medium and Hindi medium students; series marked English + हिंदी medium give each student the tests in their own medium."),
    ("How do I join an Aspiron test series?",
     "Open the Store, enter your name and mobile number, choose NEET or JEE, pick a series and pay with UPI. The series is then added to your student account."),
]
urls.append(page("test-series.html", "/test-series",
    "Aspiron Test Series Platform – NEET, JEE & CBSE Tests",
    "Aspiron Education test series platform: online CBT test series for NEET and JEE, NCERT chapter tests for CBSE, instant result, rank, English and Hindi medium.",
    "Aspiron test series platform: NEET, JEE and CBSE",
    "The <b>Aspiron test series platform</b> gives <b>online CBT test series for NEET and JEE</b> and NCERT-based chapter tests for CBSE Class 11 and 12, with an <b>instant result, rank and analysis</b> after every test. " + MEDIUM,
    f"""<ul class="posts">
<li><a href="/neet"><b>Aspiron NEET test series</b><span>Full-length and chapter-wise mock tests in the NTA pattern: 180 questions, 720 marks.</span></a></li>
<li><a href="/jee"><b>Aspiron JEE Main test series</b><span>Computer-based mock tests in the JEE Main pattern: 75 questions, 300 marks.</span></a></li>
<li><a href="/cbse"><b>Aspiron CBSE / NCERT chapter tests</b><span>NCERT-based chapter-wise practice for Class 11 and 12 science students.</span></a></li>
<li><a href="/cbt"><b>Aspiron CBT platform</b><span>The exam-style test screen: timer, palette, instant result, rank and analysis.</span></a></li>
<li><a href="/cbt-test-store"><b>Aspiron CBT test store</b><span>How to see what is inside each series, its price, and buy with UPI.</span></a></li>
</ul>
<div class="card"><h2>Every Aspiron test series includes</h2>
{FEATURES_EN}
{CTA_EN}
</div>""", [H, TS],
    [{"@type": "ItemList", "@id": SITE + "/test-series#list", "name": "Aspiron Education test series",
      "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "url": SITE + u} for i, (n, u) in enumerate(
          [("Aspiron NEET test series", "/neet"), ("Aspiron JEE Main test series", "/jee"), ("Aspiron CBSE / NCERT chapter tests", "/cbse")])]}],
    faqs=TS_FAQ))

STORE_FAQ = [
    ("What is the Aspiron CBT test store?",
     "It is the online store of Aspiron Education at aspironeducation.com/store, where students see every NEET and JEE test series, the tests inside it, its medium and price, and buy it with UPI."),
    ("How do I buy a test series on the Aspiron store?",
     "Open the Store, enter your name and mobile number once, choose NEET or JEE, open a series and pay with UPI. Then enter the payer name and UTR number so the payment can be checked."),
    ("When do I get access after paying?",
     "After the payment is checked, the series is unlocked on your mobile number and you get a message. The Refund & Delivery policy gives the details."),
    ("Is payment on the Aspiron store safe?",
     "You pay by UPI from your own UPI app; Aspiron never asks for your UPI PIN, card number or OTP."),
    ("Can I get a refund?",
     "Test series are digital products and are not refundable. If you bought the wrong series by mistake, contact support to ask for it to be moved."),
]
urls.append(page("cbt-test-store.html", "/cbt-test-store",
    "Aspiron CBT Test Store – Buy NEET & JEE Test Series",
    "Aspiron CBT test store: see every Aspiron Education NEET and JEE test series, the tests inside, English or Hindi medium and price, then buy safely with UPI.",
    "Aspiron CBT test store: buy NEET and JEE test series",
    "The <b>Aspiron CBT test store</b> is where you <b>see every Aspiron NEET and JEE test series</b>, what is inside it and its price, and <b>buy it with UPI</b>. After the payment is checked, the series is unlocked on your mobile number. " + MEDIUM,
    """<div class="card">
<h2>How buying works</h2>
<ul>
<li><b>1.</b> Open the <a href="/store">Store</a> and enter your name, mobile number and course (NEET or JEE) once.</li>
<li><b>2.</b> Open a series to see its tests, schedule, medium, reviews and price.</li>
<li><b>3.</b> Pay with any UPI app, then enter the payer name and UTR number.</li>
<li><b>4.</b> When the payment is checked, the series opens in the student app on your number.</li>
</ul>
<div class="cta"><a class="btn pri" href="/store">Open the store</a><a class="btn sec" href="/refund">Refund &amp; Delivery policy</a></div>
</div>
<div class="card"><h2>What you can buy</h2>
<p><a href="/neet">Aspiron NEET test series</a> · <a href="/jee">Aspiron JEE test series</a> · <a href="/test-series">all test series</a>. Coupons, the wallet and Refer &amp; earn are applied on the Store at checkout.</p>
</div>""", [H, TS, ("CBT Test Store", "/cbt-test-store")],
    [{"@type": "WebPage", "@id": SITE + "/cbt-test-store#page", "name": "Aspiron CBT test store", "url": SITE + "/cbt-test-store",
      "isPartOf": {"@id": SITE + "/#site"}, "about": {"@id": SITE + "/#org"}, "significantLink": SITE + "/store"}],
    faqs=STORE_FAQ))

ABOUT_FAQ = [
    ("What is Aspiron Education?",
     "Aspiron Education is an Indian online test series platform for NEET, JEE and CBSE students. Students take exam-style CBT mock tests and get an instant result, rank and analysis."),
    ("Is Aspiron Edu the same as Aspiron Education?",
     "Yes. Aspiron, Aspiron Edu and Aspiron Education are the same platform. The official website is aspironeducation.com."),
    ("What is the official website of Aspiron Education?",
     "https://aspironeducation.com is the only official website. The student app opens on the home page and the store is at aspironeducation.com/store."),
    ("Is Aspiron Education for Hindi medium or English medium?",
     "Both. Series marked English + हिंदी medium give every student the tests in the medium they choose."),
    ("How can I contact Aspiron Education?",
     "On WhatsApp or Telegram from the Contact page. Aspiron also posts updates on its WhatsApp channel, Telegram and Instagram."),
]
urls.insert(0, page("about.html", "/about",
    "About Aspiron Education (Aspiron Edu) – NEET, JEE, CBSE",
    "Aspiron Education (Aspiron Edu) is an online CBT test series platform for NEET, JEE and CBSE students in English and Hindi medium. Official site and contacts.",
    "About Aspiron Education",
    "<b>Aspiron Education</b> (also called Aspiron or Aspiron Edu) is an <b>online CBT test series platform for NEET, JEE and CBSE students</b> in India. Its official website is <b>aspironeducation.com</b>. " + MEDIUM,
    f"""<div class="card">
<h2>What Aspiron Education does</h2>
<p>Aspiron helps students practise the way the exam is taken: timed tests on an exam-style screen, then an instant result, rank among other students, solutions and a chapter-wise analysis that shows what to revise.</p>
<ul>
<li><a href="/neet">Aspiron NEET test series</a></li>
<li><a href="/jee">Aspiron JEE Main test series</a></li>
<li><a href="/cbse">Aspiron CBSE / NCERT chapter tests</a></li>
<li><a href="/cbt">Aspiron CBT platform</a> and the <a href="/cbt-test-store">Aspiron CBT test store</a></li>
</ul>
<h2>Official links</h2>
<ul>
<li>Website and student app: <a href="/">aspironeducation.com</a></li>
<li>Store: <a href="/store">aspironeducation.com/store</a></li>
<li>WhatsApp channel: <a href="{WA_CH}" rel="noopener" target="_blank">Aspiron Education on WhatsApp</a></li>
<li>Telegram: <a href="{TG}" rel="noopener" target="_blank">Aspiron student support</a></li>
<li>Instagram: <a href="{IG}" rel="noopener" target="_blank">@aspironeducation</a></li>
<li>Support: <a href="/contact">Contact page</a></li>
</ul>
<p class="small">Aspiron Education is an independent platform. It is not linked to NTA, NCERT, CBSE or any exam authority.</p>
{CTA_EN}
</div>""", [H, ("About", "/about")],
    [{"@type": "AboutPage", "@id": SITE + "/about#page", "name": "About Aspiron Education", "url": SITE + "/about",
      "isPartOf": {"@id": SITE + "/#site"}, "mainEntity": {"@id": SITE + "/#org"}}],
    faqs=ABOUT_FAQ))

# ---------------------------------------------------------------- old addresses (published for a short time) point to the new ones
for old, new in (("neet-test-series", "/neet"), ("jee-test-series", "/jee"), ("hi/neet-test-series", "/hi/neet")):
    with open(os.path.join(ROOT, old + ".html"), "w", encoding="utf-8") as f:
        f.write('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n<meta name="robots" content="noindex,follow">\n'
                '<link rel="canonical" href="%s%s">\n<meta http-equiv="refresh" content="0; url=%s">\n<title>Moved</title></head>\n'
                '<body><p><a href="%s">This page has moved.</a></p></body></html>\n' % (SITE, new, new, new))

# ---------------------------------------------------------------- sitemap (all indexable public pages)
ALTS = {"/neet": "/hi/neet", "/faq": "/hi/faq"}
ALTS.update({v: k for k, v in list(ALTS.items())})
pages = [("/", "1.0", "weekly"), ("/store", "0.9", "weekly")] + [(u, "0.8", "monthly") for u in urls] + \
        [("/contact", "0.5", "monthly"), ("/privacy", "0.3", "yearly"), ("/terms", "0.3", "yearly"), ("/refund", "0.3", "yearly")]
sm = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
for u, pr, cf in pages:
    sm.append("  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>" % (SITE, u, UPDATED, cf, pr))
    if u in ALTS:
        en, hi = (u, ALTS[u]) if not u.startswith("/hi/") else (ALTS[u], u)
        for lang, href in (("en-IN", en), ("hi-IN", hi), ("x-default", en)):
            sm.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s%s"/>' % (lang, SITE, href))
    sm.append("  </url>")
sm.append("</urlset>")
with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
    f.write("\n".join(sm) + "\n")
print("wrote %d pages + sitemap.xml" % len(urls))
