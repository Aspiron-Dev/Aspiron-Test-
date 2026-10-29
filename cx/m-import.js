/* =====================================================================
   Question import — paste text, PDF (text layer, OCR fallback), Word .docx (text + pictures), photo (OCR),
   old .json test file, answer key (text or file). Everything is read on this device; parsing uses window.CBTParser (parser.js).
   Libraries load only when an import needs them: lib/pdfjs-3.11.174, lib/jszip-3.10.1, lib/tesseract-5.1.1.
   API (used by m-builder.js):
     AX.importQuestions({source:'paste'|'pdf'|'docx'|'image'|'json', existing:n, lang:'hi', en:[English texts], noKey}) → Promise<{questions, mode:'append'|'replace', meta, json} | null>
       lang:'hi' = the हिंदी paper of a test: its own pasted text, Hindi OCR, Hindi numbering read, each question shown
       next to the English one of the same number (en); mode 'append' then means "fill only the empty Hindi". noKey hides the key box.
     AX.cropFromPdf({title, maxW}) → Promise<dataURL | null>     (crop a diagram from the last paper PDF, or a PDF picked now)
     AX.textEditor({title, hint, value, kind:'raw'|'key'}) → Promise<string | null>   (full-screen text editor; Esc = done)
     AX.compressDataUrl(src, maxWidth, quality) → Promise<dataURL | null>   (same rules as the old compressDataUrl)
     AX.readTextFile(file, note(text, pct)) → Promise<{text, images}>   (PDF / Word / photo / text file; used for explanations)
   ===================================================================== */
(function () {
'use strict';
const { h, raw, icon, join, ui: UI, fmt } = AX;
const LIB = { pdf: 'lib/pdfjs-3.11.174/pdf.min.js', worker: 'lib/pdfjs-3.11.174/pdf.worker.min.js', zip: 'lib/jszip-3.10.1/jszip.min.js', tess: 'lib/tesseract-5.1.1/tesseract.min.js' };
const L = 'ABCD';
// kept between imports in this tab, so closing the window never loses pasted text
const IM = { raw: '', key: '', images: [], fileName: '', pdfBuf: null, pdfDoc: null, pdfDocBuf: null, lang: AX.ls.get('cx_ocr_lang', 'eng') };
// the हिंदी paper keeps its own text (so the English paste never shows up there) and its own OCR language
const IMH = { raw: '', key: '', images: [], fileName: '', lang: AX.ls.get('cx_ocr_lang_hi', 'eng+hin') };
let ocrLang = null;   // set while the Hindi import is open
AX.imp = IM;

AX.css('import', `
.im-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.im-tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border-radius:14px;border:1px solid var(--line);background:var(--solid-2);color:var(--tx-2);font-weight:700;font-size:12.5px;text-align:center;transition:border-color var(--fast),color var(--fast)}
.im-tile:hover,.im-tile.on{border-color:var(--pri-line);color:var(--pri);background:var(--pri-soft)}
.im-tile .ax-ic{width:22px;height:22px}
@media (max-width:620px){.im-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
.im-dz{padding:16px;font-size:13px}
.im-en{margin:-2px 0 6px;padding:4px 8px;border-radius:8px;background:var(--solid-2);overflow-wrap:anywhere}
.im-st{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:14px;background:var(--solid-2);border:1px solid var(--line)}
.im-st.bad{background:var(--bad-soft);border-color:color-mix(in srgb,var(--bad) 35%,transparent)}
.im-st.ok{background:var(--ok-soft);border-color:color-mix(in srgb,var(--ok) 35%,transparent)}
.im-ta{font-family:var(--font-mono);font-size:13px;line-height:1.6}
.im-live{display:flex;gap:8px;flex-wrap:wrap;align-items:center;min-height:24px}
.im-help summary{cursor:pointer;font-weight:700;font-size:13px;color:var(--tx-2)}
.im-help ul{margin:8px 0 0;padding-left:18px;line-height:1.8;font-size:13px;color:var(--tx-2)}
.im-kp{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.im-kp div{padding:10px 12px;border-radius:12px;background:var(--solid-2);border:1px solid var(--line)}
.im-kp b{display:block;font-family:var(--font-display);font-size:24px;font-weight:600;line-height:1.1}
.im-kp span{font-size:11.5px;color:var(--mut);font-weight:700}
@media (max-width:620px){.im-kp{grid-template-columns:repeat(3,minmax(0,1fr))}}
.im-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.im-list .qcard{padding:12px}
.im-list .qcard.bad{border-color:color-mix(in srgb,var(--warn) 45%,var(--line))}
.im-list .op img,.im-list .qcard>div img{max-height:120px}
.im-crw{max-height:62vh;overflow:auto;border-radius:12px;border:1px solid var(--line);background:#fff}
.im-cri{position:relative;width:100%}
.im-cri canvas{width:100%;display:block}
.im-sel{position:absolute;border:2px solid var(--pri);background:color-mix(in srgb,var(--pri) 18%,transparent);border-radius:4px;pointer-events:none}
.te-ta{width:100%;height:min(62vh,640px);font-family:var(--font-mono);font-size:14px;line-height:1.65;resize:none}
@media (max-width:759px){.te-ta{height:58vh}}
`);

/* ---------- helpers ---------- */
function loadScript(src, test) {
  return new Promise((res, rej) => {
    if (test()) return res();
    const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load a helper library. Check your internet connection.'));
    document.head.appendChild(s);
  });
}
async function pdfOpen(buf) {
  try { await loadScript(LIB.pdf, () => window.pdfjsLib); } catch (e) { throw new Error('PDF reader could not load. Check your internet and reload.'); }
  if (!window.pdfjsLib) throw new Error('PDF reader could not load. Check your internet and reload.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.worker;
  return pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
}
async function pdfText(pdf, spaced, note) {
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    let last = null, cur = ''; const lines = [];
    for (const it of tc.items) {
      const y = Math.round(it.transform[5]);
      if (last !== null && Math.abs(y - last) > 3) { lines.push(cur); cur = ''; }
      cur += it.str + (spaced ? ' ' : ''); last = y;
    }
    lines.push(cur); out += lines.join('\n') + '\n';
    note(`Reading page ${p} of ${pdf.numPages}…`, Math.round(p * 100 / pdf.numPages));
  }
  return out;
}
async function ocrRun(count, getCanvas, note) {
  await loadScript(LIB.tess, () => window.Tesseract);
  note('Starting OCR (the first time downloads the language data, please wait)…', 2);
  let pct = 0, page = 1;
  const w = await Tesseract.createWorker(ocrLang || IM.lang || 'eng', 1, { logger: m => { if (m.status === 'recognizing text' && m.progress != null) { pct = Math.round(m.progress * 100); note(`OCR: reading page ${page} of ${count}… ${pct}%`, Math.round(((page - 1) + m.progress) * 100 / count)); } } });
  let out = '';
  try {
    for (let i = 1; i <= count; i++) {
      page = i; note(`OCR: reading page ${i} of ${count}…`, Math.round((i - 1) * 100 / count));
      const c = await getCanvas(i);
      const r = await w.recognize(c); out += r.data.text + '\n';
    }
  } finally { await w.terminate(); }
  return out;
}
function pdfOcr(pdf, note) {
  return ocrRun(pdf.numPages, async i => {
    const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 2.2 }), c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; return c;
  }, note);
}
const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ' };
const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'i': 'ᵢ', 'n': 'ₙ' };
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function docxRead(f) {
  await loadScript(LIB.zip, () => window.JSZip);
  const z = await JSZip.loadAsync(await f.arrayBuffer());
  const df = z.file('word/document.xml'); if (!df) throw new Error('This does not look like a Word (.docx) file. Old .doc files must be saved as .docx first.');
  const xml = await df.async('string');
  const rels = {}; const rf = z.file('word/_rels/document.xml.rels');
  if (rf) (await rf.async('string')).replace(/<Relationship\b[^>]*>/g, t => { const id = (t.match(/\bId="([^"]+)"/) || [])[1], tg = (t.match(/\bTarget="([^"]+)"/) || [])[1]; if (id && tg) rels[id] = tg; });
  const imgs = [], idx = {}, lines = [];
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  for (const p of paras) {
    let line = '', va = '';
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<m:t(?:\s[^>]*)?>([^<]*)<\/m:t>|<w:br\s*\/>|<w:tab\s*\/>|<a:blip\s[^>]*?r:embed="([^"]+)"|<v:imagedata\s[^>]*?r:id="([^"]+)"|<w:vertAlign\s+w:val="(superscript|subscript)"\s*\/>|<\/w:r>/g;
    let m;
    while ((m = re.exec(p))) {
      if (m[1] != null || m[2] != null) {
        let t = unxml(m[1] != null ? m[1] : m[2]);
        if (va === 'superscript') t = [...t].map(c => SUP[c] || c).join('');
        else if (va === 'subscript') t = [...t].map(c => SUB[c] || c).join('');
        line += t;
      } else if (m[0] === '</w:r>') va = '';
      else if (m[5]) va = m[5];
      else if (m[3] || m[4]) {
        const tg = rels[m[3] || m[4]];
        if (tg && /\.(png|jpe?g|gif|webp|bmp)$/i.test(tg)) {
          const path = tg.startsWith('/') ? tg.slice(1) : 'word/' + tg.replace(/^\.\//, '');
          if (!(path in idx)) {
            const ze = z.file(path);
            if (ze) { const ext = path.split('.').pop().toLowerCase(), mime = ext === 'jpg' ? 'jpeg' : ext; try { imgs.push('data:image/' + mime + ';base64,' + await ze.async('base64')); idx[path] = imgs.length - 1; } catch (e) { idx[path] = -1; } }
            else idx[path] = -1;
          }
          if (idx[path] >= 0) line += ` ⟦IMG:${idx[path]}⟧ `;
        }
      } else line += ' ';
    }
    lines.push(line);
  }
  return { text: lines.join('\n'), images: imgs };
}
// any file → {text, images?}; PDFs without a text layer are offered OCR
async function readAny(f, isKey, note) {
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf') || f.type === 'application/pdf') {
    const buf = await f.arrayBuffer();
    if (!isKey) { IM.pdfBuf = buf; IM.pdfDoc = null; }
    const pdf = await pdfOpen(buf);
    let t = await pdfText(pdf, isKey, note), scanned = false;
    if (t.replace(/\s/g, '').length < 40 * pdf.numPages) {
      scanned = true;
      if (await UI.confirm({ title: 'Read this PDF with OCR?', text: 'This PDF looks like a scanned image (no typed text found). Read it with OCR? This is free but can take a few minutes.', yes: 'Read with OCR', no: 'Not now' })) t = await pdfOcr(pdf, note);
    }
    return { text: t, pdf: true, scanned };
  }
  if (n.endsWith('.docx')) return isKey ? { text: (await docxRead(f)).text } : docxRead(f);
  if (n.endsWith('.doc')) throw new Error('Old .doc files are not supported. Open it in Word and "Save as" .docx, or save as PDF.');
  if (f.type.startsWith('image/')) {
    const url = URL.createObjectURL(f);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open this image')); i.src = url; });
    const sc = Math.min(2.5, 2400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc;
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return { text: await ocrRun(1, async () => c, note), ocr: true };
  }
  return { text: await f.text() };
}
// a solutions file for the Explanations tool → {text, images, ocr?, scanned?}; Word keeps its pictures (⟦IMG:n⟧ marks)
AX.readTextFile = async (f, note) => { const n = f.name.toLowerCase(); if (n.endsWith('.docx')) return docxRead(f); const r = await readAny(f, true, note); return Object.assign({ images: [] }, r); };
// width-limited JPEG; target ≤ 260,000 chars (quality steps down to .45, then a 70 % redraw at .6) — same as the old panel
function compressDataUrl(src, maxW, q) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      let w = im.naturalWidth, hh = im.naturalHeight; const sc = Math.min(1, maxW / Math.max(w, 1)); w = Math.max(1, Math.round(w * sc)); hh = Math.max(1, Math.round(hh * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = hh; const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(im, 0, 0, w, hh);
      let qq = q || 0.8, out = c.toDataURL('image/jpeg', qq);
      while (out.length > 260000 && qq > 0.45) { qq -= 0.1; out = c.toDataURL('image/jpeg', qq); }
      if (out.length > 260000) { const c2 = document.createElement('canvas'); c2.width = Math.round(w * 0.7); c2.height = Math.round(hh * 0.7); const x2 = c2.getContext('2d'); x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height); x2.drawImage(c, 0, 0, c2.width, c2.height); out = c2.toDataURL('image/jpeg', 0.6); }
      res(out);
    };
    im.onerror = () => res(null); im.src = src;
  });
}
AX.compressDataUrl = compressDataUrl;
const parser = () => window.CBTParser || window.parser || null;
function liveCounts(rawText, keyText) {
  const P = parser(); if (!P || !rawText.trim() || rawText.length > 400000) return null;
  try { const r = P.parse(rawText, keyText || ''); const qs = r.questions; return { n: qs.length, full: qs.filter(q => q.q && q.options.every(Boolean)).length, ans: qs.filter(q => q.answer != null).length, key: r.keyFound, r }; } catch (e) { return null; }
}

/* ---------- full-screen text editor (old admin11) ---------- */
AX.textEditor = (o = {}) => new Promise(res => {
  let done = false;
  const kind = o.kind || '';
  UI.modal({
    title: o.title || 'Edit text', sub: o.hint || '', size: 'xwide',
    body: h`<textarea class="inp te-ta" id="te" spellcheck="false" autocapitalize="off" autocomplete="off">${o.value || ''}</textarea><div class="xs mut mt8" id="te-st"></div>`,
    foot: h`<button class="btn ghost" data-act="discard">${icon('x', 15)} Discard changes</button><span class="sp"></span><span class="xs faint">Esc or Ctrl + Enter = Done</span><button class="btn pri" data-act="ok">${icon('check', 16)} Done</button>`,
    onClose() { if (!done) { done = true; res(document.getElementById('te') ? document.getElementById('te').value : null); } },
    onOpen(el, close) {
      const ta = el.querySelector('#te'), st = el.querySelector('#te-st');
      const stat = AX.u.debounce(() => {
        const v = ta.value; let x = `${v.split('\n').length} lines · ${v.length} characters`;
        const P = parser();
        try { if (P && kind === 'key') x = `${P.parseKey(v).count} answers found · ` + x; else if (P && kind === 'raw') { const c = liveCounts(v, o.keyText || ''); if (c) x = `${c.n} questions found${c.n ? ` (${c.full} with all 4 options)` : ''} · ` + x; } } catch (e) {}
        st.textContent = x;
      }, 300);
      ta.addEventListener('input', stat); stat();
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done = true; res(ta.value); close(true); } });
      AX.act(el, {
        ok() { done = true; res(ta.value); close(true); },
        async discard() { if (ta.value !== (o.value || '') && !(await UI.confirm({ title: 'Discard your changes?', yes: 'Discard', tone: 'danger' }))) return; done = true; res(null); close(true); }
      });
      setTimeout(() => { ta.focus(); try { ta.setSelectionRange(0, 0); ta.scrollTop = 0; } catch (e) {} }, 60);
    }
  });
});

/* ---------- crop a diagram from the PDF ---------- */
AX.cropFromPdf = async (o = {}) => {
  if (!IM.pdfBuf) {
    const ok = await UI.confirm({ title: 'Choose the question paper PDF', text: 'Pick the PDF that has the diagram. You can then draw a box around it.', yes: 'Choose PDF' });
    if (!ok) return null;
    const f = await AX.u.pickFile('.pdf,application/pdf'); if (!f) return null;
    IM.pdfBuf = await f.arrayBuffer(); IM.pdfDoc = null;
  }
  let doc;
  try { doc = IM.pdfDoc && IM.pdfDocBuf === IM.pdfBuf ? IM.pdfDoc : await pdfOpen(IM.pdfBuf); IM.pdfDoc = doc; IM.pdfDocBuf = IM.pdfBuf; }
  catch (e) { UI.toast('Could not open the PDF', { tone: 'bad' }); return null; }
  return new Promise(res => {
    let done = false, page = IM.cropPage || 1, sel = null, mode = 'sel';
    UI.modal({
      title: o.title || 'Crop a diagram', sub: 'Drag on the page to draw a box around the diagram. Use Move to scroll when zoomed.', size: 'xwide',
      body: h`<div class="row wrap" style="margin-bottom:10px"><button class="ibtn sm line" data-act="pg" data-d="-1" aria-label="Previous page">${icon('chevL', 16)}</button>
        <span class="sm">Page <input class="inp sm num" id="cp-n" type="number" min="1" max="${doc.numPages}" value="${page}" style="width:70px;display:inline-block"> of ${doc.numPages}</span>
        <button class="ibtn sm line" data-act="pg" data-d="1" aria-label="Next page">${icon('chevR', 16)}</button>
        <div class="seg" id="cp-m"><button type="button" class="on" data-v="sel">Select</button><button type="button" data-v="move">Move</button></div>
        <div class="seg" id="cp-z"><button type="button" class="on" data-v="100">Fit</button><button type="button" data-v="160">160%</button><button type="button" data-v="240">240%</button></div>
        <span class="grow"></span><button class="btn xs ghost" data-act="other">${icon('pdf', 13)} Other PDF</button></div>
        <div class="im-crw" id="cp-w"><div class="im-cri" id="cp-i"><canvas id="cp-c"></canvas><div class="im-sel hide" id="cp-s"></div></div></div>`,
      foot: h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="use">${icon('check', 16)} Use selected area</button>`,
      onClose() { if (!done) { done = true; res(null); } },
      onOpen(el, close) {
        const c = el.querySelector('#cp-c'), w = el.querySelector('#cp-w'), box = el.querySelector('#cp-s'), inner = el.querySelector('#cp-i');
        const draw = async () => { const pg = await doc.getPage(page), vp = pg.getViewport({ scale: 2 }); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; sel = null; box.classList.add('hide'); el.querySelector('#cp-n').value = page; IM.cropPage = page; };
        draw();
        w.style.touchAction = 'none';
        let st = null;
        const pos = e => { const r = c.getBoundingClientRect(); return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height), r }; };
        w.addEventListener('pointerdown', e => { if (mode !== 'sel') return; st = pos(e); try { w.setPointerCapture(e.pointerId); } catch (_) {} box.classList.remove('hide'); box.style.width = box.style.height = '0px'; });
        w.addEventListener('pointermove', e => { if (!st) return; const p = pos(e), x = Math.min(st.x, p.x), y = Math.min(st.y, p.y); Object.assign(box.style, { left: x + 'px', top: y + 'px', width: Math.abs(p.x - st.x) + 'px', height: Math.abs(p.y - st.y) + 'px' }); const k = c.width / p.r.width; sel = { x: x * k, y: y * k, w: Math.abs(p.x - st.x) * k, h: Math.abs(p.y - st.y) * k }; });
        w.addEventListener('pointerup', () => { st = null; });
        el.querySelector('#cp-n').addEventListener('change', e => { page = Math.min(doc.numPages, Math.max(1, +e.target.value || 1)); draw(); });
        const seg = (id, fn) => el.querySelector(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); });
        seg('#cp-m', v => { mode = v; w.style.touchAction = v === 'sel' ? 'none' : 'auto'; });
        seg('#cp-z', v => { inner.style.width = v + '%'; });
        AX.act(el, {
          pg(b) { page = Math.min(doc.numPages, Math.max(1, page + +b.dataset.d)); draw(); },
          async other() { const f = await AX.u.pickFile('.pdf,application/pdf'); if (!f) return; IM.pdfBuf = await f.arrayBuffer(); IM.cropPage = 1; done = true; close(true); res(await AX.cropFromPdf(o)); },
          async use(b) {
            if (!sel || sel.w < 10 || sel.h < 10) return UI.toast('Draw a box around the diagram first', { tone: 'warn' });
            await UI.busy(b, async () => {
              const t = document.createElement('canvas'); t.width = Math.round(sel.w); t.height = Math.round(sel.h);
              t.getContext('2d').drawImage(c, sel.x, sel.y, sel.w, sel.h, 0, 0, t.width, t.height);
              const d = await compressDataUrl(t.toDataURL('image/png'), o.maxW || 900, 0.82);
              done = true; res(d); close(true);
            });
          }
        });
      }
    });
  });
};

/* ---------- the import window ---------- */
AX.importQuestions = (o = {}) => new Promise(res => {
  const P = parser();
  if (!P) { UI.toast('The question reader (parser.js) did not load. Reload the page.', { tone: 'bad' }); return res(null); }
  const K = AX.qkit, HI = o.lang === 'hi', S = HI ? IMH : IM, EN = o.en || [];
  // Hindi: read Devanagari numbers, "प्रश्न 1", (अ)…(द) / (क)…(घ) options; the key is never asked here
  const prep = t => HI && P.normHi ? P.normHi(t) : t;
  const probs = q => HI ? K.problems(q).filter(x => x !== 'No correct answer set') : K.problems(q);
  if (HI) ocrLang = S.lang;
  let view = 'src', done = false, rev = null, mode = 'append', only = false, showAll = false, busy = false, hasPdfText = false, jsonData = null;
  const ACC = { pdf: '.pdf,application/pdf', docx: '.docx', image: 'image/*', json: '.json,application/json', any: '.pdf,.docx,.txt,.md,.json,image/*,application/pdf' };
  const srcHtml = () => h`<div class="col gap16">
      <div class="im-tiles">${join([['paste', 'fileText', 'Paste text'], ['pdf', 'pdf', 'PDF'], ['docx', 'doc', 'Word'], ['image', 'image', 'Photo · OCR'], ['json', 'db', 'Old .json']], ([k, ic, t]) => h`<button type="button" class="im-tile ${o.source === k ? 'on' : ''}" data-act="pick" data-k="${k}">${icon(ic)}<span>${t}</span></button>`)}</div>
      <div class="dropzone im-dz" id="im-dz" data-act="pick" data-k="any">${icon('upload', 18)} <b>Drop a file here</b> or tap to choose · PDF, Word (.docx), text, photo or old .json file</div>
      <div id="im-st" class="im-st hide" role="status"></div>
      <div class="fld"><div class="row"><label for="im-raw" class="grow">Question paper text</label><button type="button" class="btn xs ghost" data-act="expand" data-f="raw">${icon('external', 13)} Full screen</button><button type="button" class="btn xs ghost" data-act="clear">${icon('x', 13)} Clear</button></div>
        <textarea class="inp im-ta" id="im-raw" rows="11" spellcheck="false" ${HI ? raw('lang="hi"') : ''} placeholder="${HI ? 'हिंदी paper यहाँ paste करें, जैसे:\n\n1. कोशिका का ऊर्जा केंद्र कौन सा है?\n(अ) केंद्रक  (ब) माइटोकॉन्ड्रिया  (स) राइबोसोम  (द) लाइसोसोम\n\n2. …' : 'Paste the paper here, for example:\n\n1. Which of these is a scalar quantity?\n(A) Force  (B) Velocity  (C) Work  (D) Momentum\n\n2. …'}">${S.raw}</textarea></div>
      <div class="row wrap"><label class="xs mut" for="im-lang">OCR language (for photos and scans)</label><select class="inp sm" id="im-lang" style="width:auto">${HI ? h`<option value="eng+hin" ${S.lang === 'eng+hin' ? raw('selected') : ''}>Hindi + English</option><option value="hin" ${S.lang === 'hin' ? raw('selected') : ''}>Hindi only</option>` : h`<option value="eng" ${IM.lang === 'eng' ? raw('selected') : ''}>English</option><option value="eng+hin" ${IM.lang === 'eng+hin' ? raw('selected') : ''}>English + Hindi</option>`}</select>
        <button type="button" class="btn xs ${hasPdfText ? '' : 'hide'}" id="im-ocr" data-act="ocr">${icon('scan', 13)} Read this PDF with OCR instead</button></div>
      <div class="fld ${o.noKey || HI ? 'hide' : ''}"><div class="row"><label for="im-key" class="grow">Answer key <span class="faint">(only if it is separate)</span></label><button type="button" class="btn xs ghost" data-act="keyfile">${icon('upload', 13)} Key from a file</button><button type="button" class="btn xs ghost" data-act="expand" data-f="key">${icon('external', 13)} Full screen</button></div>
        <textarea class="inp im-ta" id="im-key" rows="3" spellcheck="false" placeholder="e.g. 1. B  2. D  3. A …  or 1-2, 2-4 …">${S.key}</textarea></div>
      <div class="im-live" id="im-live"></div>
      <details class="im-help"><summary>How should the text look?</summary><ul>
        <li>Each question starts with its number and a dot or bracket: <span class="mono">1.</span> <span class="mono">1)</span> <span class="mono">Q1.</span></li>
        <li>Options as <span class="mono">(A) (B) (C) (D)</span>, <span class="mono">A. B. C. D.</span>, <span class="mono">(1) (2) (3) (4)</span>${HI ? raw(', <span class="mono">(अ) (ब) (स) (द)</span> or <span class="mono">(क) (ख) (ग) (घ)</span>; Hindi numbers १ २ ३ work too') : ''}. Options like <span class="mono">1)</span> without brackets look like new questions.</li>
        <li>A heading line such as <i>Physics</i>, <i>Chemistry</i> or <i>Section A</i> starts a section (subject tab).</li>
        <li>An answer key after “Answer key” / “Answers” / “उत्तर कुंजी” with 10 or more answers is found by itself. Answers are matched by position.</li>
        <li>Assertion–Reason questions without options get the four standard options.</li></ul></details></div>`;
  const qMini = (q, i) => { const pr = probs(q); return h`<div class="qcard ${pr.length ? 'bad' : ''}" ${HI ? raw('lang="hi"') : ''}><div class="qn">${i + 1}</div><div class="grow">
      ${HI ? h`<div class="xs mut im-en">${EN[i] != null ? h`English ${i + 1}: ${String(EN[i] || '[image]').slice(0, 120)}` : h`<span style="color:var(--warn)">No English question ${i + 1} — this one is left out</span>`}</div>` : ''}
      <div class="bq-meta">${q.sec ? UI.pill(q.sec, 'info') : ''}${join(pr, p => UI.pill(K.short(p), 'warn'))}<span class="grow"></span><button class="ibtn sm" data-act="rmq" data-i="${i}" aria-label="Leave out question ${i + 1}" title="Leave this one out">${icon('x', 15)}</button></div>
      <div class="qt">${q.q || h`<span class="faint">${q.gap ? 'Question missing in the file' : 'No question text'}</span>`}</div>${q.img ? h`<img src="${q.img}" alt="">` : ''}
      <div class="opts">${join(q.options, (x, j) => h`<div class="op ${q.answer === j ? 'key' : ''}"><b>${L[j]}</b><span class="grow">${x || (q.oimg[j] ? '' : h`<span class="faint">empty</span>`)}${q.oimg[j] ? h`<img src="${q.oimg[j]}" alt="">` : ''}</span></div>`)}</div></div></div>`; };
  const revHtml = () => {
    const qs = rev.questions, nb = qs.filter(q => probs(q).length > 0).length, na = qs.filter(q => q.answer != null).length, ni = qs.reduce((a, q) => a + (q.img ? 1 : 0) + q.oimg.filter(Boolean).length + (q.eimg ? 1 : 0), 0);
    const list = qs.map((q, i) => i).filter(i => !only || probs(qs[i]).length > 0), cut = showAll ? list : list.slice(0, 40);
    return h`<div class="im-kp"><div><b>${qs.length}</b><span>Found</span></div><div><b style="color:var(--ok)">${qs.length - nb}</b><span>Complete</span></div><div><b style="color:${nb ? 'var(--warn)' : 'var(--ok)'}">${nb}</b><span>To check</span></div>${HI ? h`<div><b>${EN.length}</b><span>English</span></div>` : h`<div><b>${na}</b><span>With answer</span></div><div><b>${ni}</b><span>Images</span></div>`}</div>
      ${HI ? h`<div class="callout ${qs.length === EN.length ? 'ok' : 'warn'} mt12">${icon(qs.length === EN.length ? 'checkCircle' : 'alert')}<div class="sm">${qs.length === EN.length ? h`<b>${qs.length} हिंदी questions — same as the ${EN.length} English questions.</b> Check below that each one matches the English one of the same number.` : h`<b>${qs.length} हिंदी questions found, but the English paper has ${EN.length}.</b> Question numbers must match: check the Hindi paper (a missing number or a question split in two moves all the next ones).`}</div></div>`
        : rev.json ? h`<div class="callout info mt12">${icon('info')}<div class="sm">Old test file${rev.meta && rev.meta.title ? h` “<b>${rev.meta.title}</b>”` : ''}: its name, time and marks are filled in too.</div></div>`
        : rev.keyFound ? h`<div class="callout ok mt12">${icon('checkCircle')}<div class="sm">Answer key found: ${fmt.plural(rev.keyFound, 'answer')}.</div></div>` : h`<div class="callout warn mt12">${icon('info')}<div class="sm">No answer key found. You can add it later in Questions → Answer key.</div></div>`}
      ${rev.skipped ? h`<div class="callout warn mt12">${icon('image')}<div class="sm">${rev.skipped} extra picture(s) inside questions were left out — add them by hand.</div></div>` : ''}
      ${o.existing ? h`<div class="row wrap mt16"><span class="sm b">${HI ? fmt.plural(o.existing, 'question') + ' already have Hindi:' : 'This test already has ' + fmt.plural(o.existing, 'question') + ':'}</span><div class="seg" id="im-mode"><button type="button" class="${mode === 'append' ? 'on' : ''}" data-v="append">${HI ? 'Fill only the empty ones' : 'Add after them'}</button><button type="button" class="${mode === 'replace' ? 'on' : ''}" data-v="replace">${HI ? 'Replace all Hindi' : 'Replace them'}</button></div></div>` : ''}
      <div class="chips mt16"><button class="chip ${only ? '' : 'on'}" data-act="only" data-v="0">All<em>${qs.length}</em></button>${nb ? h`<button class="chip alert ${only ? 'on' : ''}" data-act="only" data-v="1">To check<em>${nb}</em></button>` : ''}</div>
      <div class="im-list">${list.length ? join(cut, i => qMini(qs[i], i)) : UI.empty({ icon: 'checkCircle', title: 'Nothing to check' })}</div>
      ${cut.length < list.length ? h`<div class="row mt12" style="justify-content:center"><button class="btn sm" data-act="all">Show all ${list.length}</button></div>` : ''}
      <p class="xs mut mt12">You can fix anything later in step 5 (Check & edit): tap a question to edit it.</p>`;
  };
  const m = UI.modal({
    title: HI ? 'हिंदी paper' : 'English paper', sub: HI ? 'The Hindi questions are matched to the English ones by number. You check them before they are added.' : 'Read on this device. You check the questions before they are added.', size: 'xwide', sticky: true,
    body: srcHtml(), foot: h`<span class="sp"></span>`,
    onClose() { ocrLang = null; if (!done) { done = true; res(null); } },
    onOpen(el, close, api) {
      const $ = s => el.querySelector(s);
      const status = (text, pct, tone) => {
        const s = $('#im-st'); if (!s) return;
        s.className = 'im-st ' + (tone || ''); s.classList.toggle('hide', !text);
        AX.set(s, h`<div class="row gap6">${tone === 'bad' ? icon('alert', 16) : tone === 'ok' ? icon('checkCircle', 16) : h`<span class="spin" style="color:var(--pri)"></span>`}<span class="sm grow">${text}</span></div>${pct != null && !tone ? h`<div class="progress"><i style="width:${pct}%"></i></div>` : ''}`);
      };
      const live = () => {
        const box = $('#im-live'); if (!box) return;
        S.raw = $('#im-raw').value; S.key = $('#im-key').value;
        const c = liveCounts(prep(S.raw), S.key);
        AX.set(box, c ? h`${UI.pill(fmt.plural(c.n, 'question') + ' found', c.n ? 'pri' : 'warn')}${c.n ? UI.pill(c.full + ' with all 4 options', c.full === c.n ? 'ok' : 'warn') : ''}${c.n && HI && EN.length ? UI.pill('English paper: ' + EN.length, c.n === EN.length ? 'ok' : 'warn') : ''}${c.n && !HI ? UI.pill(c.ans + ' with an answer', c.ans === c.n ? 'ok' : '') : ''}${S.key.trim() ? UI.pill(P.parseKey(S.key).count + ' answers in the key', 'info') : c.key ? UI.pill('Key found inside the text', 'info') : ''}`
          : S.raw.length > 400000 ? h`<span class="xs mut">Long text: questions are counted when you press Review.</span>` : h`<span class="xs mut">Paste or upload a paper to see the questions found.</span>`);
        foot();
      };
      const liveSoon = AX.u.debounce(live, 300);
      const foot = () => {
        if (view === 'src') {
          const c = liveCounts(prep(S.raw), S.key), n = c ? c.n : S.raw.trim() ? 1 : 0;
          api.foot(h`<span class="sp"></span><button class="btn ghost" data-close>Cancel</button><button class="btn pri" data-act="review" ${n && !busy ? '' : raw('disabled')}>Review ${c && c.n ? fmt.plural(c.n, 'question') : 'questions'} ${icon('arrowR', 16)}</button>`);
        } else {
          const n = rev.questions.length;
          api.foot(h`<button class="btn ghost" data-act="back">${icon('arrowL', 16)} Back</button><span class="sp"></span><button class="btn pri" data-act="add" ${n ? '' : raw('disabled')}>${icon('check', 16)} ${HI ? 'Add Hindi to ' + fmt.plural(Math.min(n, EN.length), 'question') : (mode === 'replace' ? 'Replace with ' : 'Add ') + fmt.plural(n, 'question')}</button>`);
        }
      };
      const wireSrc = () => {
        $('#im-raw').addEventListener('input', liveSoon); $('#im-key').addEventListener('input', liveSoon);
        $('#im-lang').addEventListener('change', e => { if (HI) { S.lang = ocrLang = e.target.value; AX.ls.set('cx_ocr_lang_hi', S.lang); } else { IM.lang = e.target.value; AX.ls.set('cx_ocr_lang', IM.lang); } });
        const dz = $('#im-dz');
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('over'));
        dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) readPaper(f); });
        live();
      };
      const toSrc = () => { view = 'src'; api.set(srcHtml()); wireSrc(); };
      const readPaper = async f => {
        if (busy) return;
        if (/\.json$/i.test(f.name) || f.type === 'application/json') return readJson(f);
        busy = true; foot(); hasPdfText = false; $('#im-ocr').classList.add('hide');
        status('Reading ' + f.name + '…', 0);
        try {
          const r = await readAny(f, false, (t, p) => status(t, p));
          S.raw = r.text; S.images = r.images || []; S.fileName = f.name;
          if (!el.isConnected) return;
          $('#im-raw').value = r.text;
          hasPdfText = !!(r.pdf && !r.scanned); $('#im-ocr').classList.toggle('hide', !hasPdfText);
          const c = liveCounts(prep(S.raw), S.key);
          status(r.text.trim() ? 'Done. ' + (c ? fmt.plural(c.n, 'question') + ' found. ' : '') + (r.ocr || r.scanned ? 'OCR can make mistakes, so please check the text. ' : 'Please check the text below. ') + (S.images.length ? S.images.length + ' picture(s) found in the Word file.' : '') : 'No text was found in this file. If it is a scan, try a clearer photo or paste the text.', null, r.text.trim() ? 'ok' : 'bad');
        } catch (err) { status('Could not read this file: ' + err.message, null, 'bad'); }
        finally { busy = false; live(); }
      };
      const readJson = async f => {
        try {
          const j = JSON.parse(await f.text()); const qs = Array.isArray(j) ? j : j.questions;
          if (!Array.isArray(qs) || !qs.length) throw new Error('no questions');
          jsonData = { questions: qs.map(K.normQ), meta: Array.isArray(j) ? {} : { title: j.title || '', duration: j.duration, correct: j.correct, wrong: j.wrong, lockBack: j.lockBack } };
          rev = { questions: jsonData.questions, keyFound: 0, json: true, meta: jsonData.meta };
          view = 'rev'; api.set(revHtml()); foot();
        } catch (e) { UI.toast('Could not read this file', { tone: 'bad' }); }
      };
      const buildRev = async () => {
        S.raw = $('#im-raw').value; S.key = $('#im-key').value;
        const r = P.parse(prep(S.raw), S.key);
        const qs = r.questions.map(K.normQ);
        let skipped = 0;
        if (S.images.length && /⟦IMG:\d+⟧/.test(S.raw)) {
          busy = true; foot(); status('Preparing the pictures from the Word file…', 10);
          const cache = {};
          const get = async k => cache[k] !== undefined ? cache[k] : (cache[k] = S.images[k] ? await compressDataUrl(S.images[k], 900, 0.8) : null);
          const take = async txt => { const ks = []; const t = String(txt).replace(/⟦IMG:(\d+)⟧/g, (_, k) => { ks.push(+k); return ' '; }).replace(/[ \t]{2,}/g, ' ').trim(); return { t, img: ks.length ? await get(ks[0]) : null, n: ks.length }; };
          for (let i = 0; i < qs.length; i++) {
            const q = qs[i], a = await take(q.q); q.q = a.t; if (a.img) q.img = a.img; skipped += Math.max(0, a.n - 1);
            for (let j = 0; j < 4; j++) { const x = await take(q.options[j]); q.options[j] = x.t; if (x.img) q.oimg[j] = x.img; }
            const e = await take(q.explanation); q.explanation = e.t; if (e.img) q.eimg = e.img;
            if (i % 10 === 0) status('Preparing the pictures from the Word file…', Math.round(i * 100 / qs.length));
          }
          busy = false;
        } else qs.forEach(q => { ['q', 'explanation'].forEach(k => { q[k] = q[k].replace(/⟦IMG:\d+⟧/g, ' ').replace(/[ \t]{2,}/g, ' ').trim(); }); q.options = q.options.map(x => x.replace(/⟦IMG:\d+⟧/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()); });
        if (!qs.length) { status('No questions found. Each question must start with its number, like “1.” or “Q1.”.', null, 'bad'); foot(); return; }
        rev = { questions: qs, keyFound: S.key.trim() ? P.parseKey(S.key).count : r.keyFound, skipped, meta: { title: S.fileName ? S.fileName.replace(/\.[a-z0-9]+$/i, '') : '' } };
        view = 'rev'; showAll = false; only = false; api.set(revHtml()); foot();
        el.querySelector('.m-b').scrollTop = 0;
      };
      el.addEventListener('click', e => { const b = e.target.closest('#im-mode button'); if (!b) return; mode = b.dataset.v; el.querySelectorAll('#im-mode button').forEach(x => x.classList.toggle('on', x === b)); foot(); });
      AX.act(el, {
        async pick(b) {
          const k = b.dataset.k;
          if (k === 'paste') { const t = $('#im-raw'); t.focus(); try { if (!t.value && navigator.clipboard && navigator.clipboard.readText) { const v = await navigator.clipboard.readText(); if (v && v.trim()) { t.value = v; live(); UI.toast('Pasted from the clipboard'); } } } catch (e) {} return; }
          const f = await AX.u.pickFile(ACC[k] || ACC.any); if (f) readPaper(f);
        },
        async keyfile() {
          const f = await AX.u.pickFile(ACC.any); if (!f) return;
          status('Reading the key…', 0);
          try { const r = await readAny(f, true, (t, p) => status(t, p)); const v = r.text.replace(/⟦IMG:\d+⟧/g, ''); $('#im-key').value = v; S.key = v; const n = P.parseKey(v).count; status(n ? `Done. Found ${n} answers in the key.` : 'No answers found. If this is a scan, try again with OCR or paste the key text.', null, n ? 'ok' : 'bad'); }
          catch (err) { status('Could not read this file: ' + err.message, null, 'bad'); }
          live();
        },
        async ocr() {
          if (!IM.pdfBuf || busy) return; busy = true; foot();
          try { status('Starting OCR…', 0); const pdf = await pdfOpen(IM.pdfBuf); const t = await pdfOcr(pdf, (x, p) => status(x, p)); S.raw = t; $('#im-raw').value = t; status('OCR finished. OCR can make mistakes, so please check the questions.', null, 'ok'); }
          catch (err) { status('OCR failed: ' + err.message, null, 'bad'); }
          finally { busy = false; live(); }
        },
        async expand(b) {
          const f = b.dataset.f, ta = $(f === 'raw' ? '#im-raw' : '#im-key');
          const v = await AX.textEditor({ title: f === 'raw' ? 'Question paper text' : 'Answer key', kind: f, keyText: $('#im-key').value,
            hint: f === 'raw' ? 'Fix or paste the paper here. Each question starts with its number (1. or Q1.), options as (1)…(4) or (A)…(D).' : 'One answer per number, e.g. 1. B  2. D  3. A  — or 1-2, 2-4 …', value: ta.value });
          if (v != null) { ta.value = v; live(); }
        },
        async clear() { if ($('#im-raw').value && !(await UI.confirm({ title: 'Clear the text?', yes: 'Clear', tone: 'danger' }))) return; $('#im-raw').value = ''; $('#im-key').value = ''; S.images = []; S.fileName = ''; status(''); live(); },
        async review(b) { if (busy) return; await UI.busy(b, buildRev); },
        back() { jsonData = null; toSrc(); },
        only(b) { only = b.dataset.v === '1'; api.set(revHtml()); },
        all() { showAll = true; api.set(revHtml()); },
        rmq(b) { rev.questions.splice(+b.dataset.i, 1); api.set(revHtml()); foot(); },
        add() {
          done = true;
          res({ questions: rev.questions, mode: o.existing ? mode : 'append', meta: rev.meta || {}, json: !!rev.json });
          if (!rev.json) { S.raw = ''; S.key = ''; S.images = []; }
          close(true);
        }
      });
      wireSrc();
      if (o.source && o.source !== 'paste') setTimeout(() => { const f = AX.u.pickFile(ACC[o.source] || ACC.any); f.then(x => { if (x && el.isConnected) readPaper(x); }); }, 0);
      else setTimeout(() => { if (!UI.isPhone()) $('#im-raw').focus(); }, 80);
    }
  });
  return m;
});
})();
