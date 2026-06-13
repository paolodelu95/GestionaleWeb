/**
 * UX/UI AUDIT — verifica esperienza d'uso completa in ambiente demo (Ordeva).
 *
 * COSA VERIFICA, su un tenant demo con dati FITTIZI (prodotti, clienti,
 * fornitori, documenti) già presenti:
 *
 *   1. RESPONSIVE — ogni pagina viene aperta su tre device reali:
 *        • mobile   (iPhone 375×667, il target più stretto)
 *        • tablet   (iPad 768×1024)
 *        • desktop  (1280×800)
 *      e poi su "wide" (1920) solo per screenshot.
 *
 *   2. BUG VISIVI — euristiche DOM eseguite in pagina:
 *        • overflow-x  → la pagina scrolla in orizzontale (grave su mobile)
 *        • clip        → un elemento sborda oltre il viewport
 *        • overlap     → due controlli interattivi si sovrappongono
 *        • broken-img  → immagini/icone che non caricano
 *        • empty-page  → la rotta non ha renderizzato contenuto utile
 *
 *   3. USABILITÀ ("agevole") —
 *        • tap-target  → bottoni/link < 44px (min WCAG, token --tap-min) su touch
 *        • tiny-font   → testo < 12px
 *        • low-contrast→ testo con rapporto di contrasto < 4.5:1
 *        • scroll-lock → contenuto principale non scrollabile mentre deborda
 *
 *   4. STILE UNIFICATO — confronto coi DESIGN TOKEN letti a runtime da :root:
 *        • off-palette → un bottone/azione primaria usa un colore che non
 *                        appartiene alla palette Ordeva (--primary, --brand-*,
 *                        --success/--warning/--danger/--info/--purple…)
 *        • font-mix    → un elemento usa un font diverso da quello base (Inter)
 *      Inoltre raccoglie il set di colori/azioni usati per farne un riepilogo.
 *
 *   5. DATI DEMO — verifica che le liste (clienti, fornitori, prodotti,
 *      fatture, …) mostrino effettivamente righe fittizie; se una lista è
 *      vuota lo segnala (no-demo-data).
 *
 *   6. CRUD — apre i dialog "Nuovo …" e li ri-controlla (overflow, tap-target)
 *      perché è lì che si concentra l'uso reale.
 *
 * OUTPUT
 *   • scripts/audit-output/ux/{mobile,tablet,desktop,wide}/<pagina>.png
 *   • scripts/audit-output/ux/report.json   (tutti i finding strutturati)
 *   • scripts/audit-output/ux/report.md     (riepilogo leggibile)
 *   • riepilogo a console con conteggi per severità e per categoria
 *
 * USO
 *   node scripts/ux-audit.mjs                          # tenant demo di produzione
 *   BASE_URL=http://localhost:4200 API=http://localhost:3000/api \
 *     UX_USER=demo@local.test UX_PASS='DemoLocale-2026!' \
 *     node scripts/ux-audit.mjs                         # ambiente locale
 *
 * Exit code 0 se nessun finding "error", 1 altrimenti.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'audit-output', 'ux');

const BASE_URL = process.env.BASE_URL || 'https://ordeva.it';
const API = process.env.API || `${BASE_URL}/api`;
const USER = process.env.UX_USER || 'demo-screenshots@ordeva.it';
const PASS = process.env.UX_PASS || 'DemoOrdeva-2026!';
const TOKEN_KEY = process.env.TOKEN_KEY || 'ordeva_token';

const C = {
  g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`, c: s => `\x1b[36m${s}\x1b[0m`,
};

// Tre device che contano (PC / tablet / mobile) + wide per soli screenshot.
const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 667,  touch: true,  audit: true },
  { name: 'tablet',  width: 768,  height: 1024, touch: true,  audit: true },
  { name: 'desktop', width: 1280, height: 800,  touch: false, audit: true },
  { name: 'wide',    width: 1920, height: 1080, touch: false, audit: false },
];

// Pagine principali dell'app (le rotte sotto la shell autenticata).
const PAGES = [
  { path: '/app',           name: 'home' },
  { path: '/dashboard',     name: 'dashboard' },
  { path: '/clienti',       name: 'clienti',     list: true },
  { path: '/fornitori',     name: 'fornitori',   list: true },
  { path: '/prodotti',      name: 'prodotti',    list: true },
  { path: '/preventivi',    name: 'preventivi',  list: true },
  { path: '/ordini',        name: 'ordini',      list: true },
  { path: '/ddt',           name: 'ddt',         list: true },
  { path: '/fatture',       name: 'fatture',     list: true },
  { path: '/note-credito',  name: 'note-credito' },
  { path: '/acquisti',      name: 'acquisti' },
  { path: '/arrivi-merce',  name: 'arrivi-merce' },
  { path: '/magazzino',     name: 'magazzino' },
  { path: '/pagamenti',     name: 'pagamenti' },
  { path: '/scadenzario',   name: 'scadenzario' },
  { path: '/prima-nota',    name: 'prima-nota' },
  { path: '/riconciliazione', name: 'riconciliazione' },
  { path: '/agenda',        name: 'agenda' },
  { path: '/crm',           name: 'crm' },
  { path: '/timesheet',     name: 'timesheet' },
  { path: '/vendita-banco', name: 'vendita-banco' },
  { path: '/report',        name: 'report' },
  { path: '/storico',       name: 'storico' },
  { path: '/impostazioni',  name: 'impostazioni' },
  { path: '/aiuto',         name: 'aiuto' },
  { path: '/compliance',    name: 'compliance' },
];

// Dialog di creazione: l'uso reale dell'app passa quasi sempre da qui.
const NEW_DIALOGS = [
  { path: '/clienti',      trigger: 'Nuovo cliente' },
  { path: '/fornitori',    trigger: 'Nuovo fornitore' },
  { path: '/prodotti',     trigger: 'Nuovo prodotto' },
  { path: '/preventivi',   trigger: 'Nuovo preventivo' },
  { path: '/ddt',          trigger: 'Nuovo DDT' },
  { path: '/fatture',      trigger: 'Nuova fattura' },
];

const findings = [];
const counts = { error: 0, warn: 0, info: 0 };
function record(f) {
  findings.push(f);
  counts[f.severity] = (counts[f.severity] || 0) + 1;
  const icon = f.severity === 'error' ? C.r('✗') : f.severity === 'warn' ? C.y('⚠') : C.dim('·');
  console.log(`  ${icon} [${f.viewport}/${f.type}] ${f.page}: ${String(f.msg).slice(0, 160)}`);
}

async function loginAndGetToken() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!r.ok) throw new Error(`login fallito ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  if (!d.token) throw new Error('login: nessun token nella risposta');
  return d.token;
}

/**
 * La funzione che gira DENTRO la pagina: legge i design token, scandisce il
 * DOM visibile e ritorna una lista di finding grezzi. Niente dipendenze esterne.
 */
const IN_PAGE_AUDIT = `(opts) => {
  const { touch, vw, vh } = opts;
  const out = [];
  const css = getComputedStyle(document.documentElement);
  const tok = n => (css.getPropertyValue(n) || '').trim();

  // ── helper colore ──────────────────────────────────────────────
  function toRgb(s) {
    if (!s) return null;
    const m = s.match(/rgba?\\(([^)]+)\\)/i);
    if (m) { const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; }
    const h = s.trim().match(/^#([0-9a-f]{6})$/i);
    if (h) { const n = parseInt(h[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
    const h3 = s.trim().match(/^#([0-9a-f]{3})$/i);
    if (h3) { const c = h3[1].split('').map(x => parseInt(x + x, 16)); return { r: c[0], g: c[1], b: c[2], a: 1 }; }
    return null;
  }
  const dist = (a, b) => Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
  function lum(c) {
    const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4; };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  const contrast = (a, b) => { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1,L2), lo = Math.min(L1,L2); return (hi+0.05)/(lo+0.05); };

  // Palette ammessa, letta dai TOKEN reali (così resta sincronizzata col tema).
  const PALETTE = [
    '--primary','--primary-hover','--primary-active','--brand-teal','--brand-mid','--brand-dark',
    '--success','--success-on','--warning','--warning-on','--danger','--danger-on',
    '--info','--info-on','--purple','--purple-on',
  ].map(tok).map(toRgb).filter(Boolean);
  // colori "neutri" sempre leciti (superfici, testo, bordi, trasparente)
  const NEUTRAL = ['#ffffff','#000000', tok('--bg-surface'), tok('--bg-page'), tok('--bg-subtle'),
    tok('--text-primary'), tok('--text-secondary'), tok('--border'), tok('--brand-dark')]
    .map(toRgb).filter(Boolean);
  function nearPalette(c) {
    if (!c || c.a < 0.5) return true;                 // trasparente: ok
    if (PALETTE.some(p => dist(c, p) <= 36)) return true;
    if (NEUTRAL.some(p => dist(c, p) <= 24)) return true;
    // grigi neutri (r≈g≈b)
    const spread = Math.max(c.r,c.g,c.b) - Math.min(c.r,c.g,c.b);
    if (spread <= 12) return true;
    return false;
  }

  const tapMin = parseInt(tok('--tap-min')) || 44;
  const baseFont = (css.fontFamily || '').toLowerCase();

  // Scope: SOLO il contenuto della pagina renderizzata, escludendo la "chrome"
  // persistente (sidebar, topbar, banner, overlay cookie). Così ogni rotta
  // riporta i propri problemi e non si ripetono 26 volte quelli della shell.
  const CHROME = '.sidenav, .topbar, mat-toolbar, .pwa-banner, .search-dropdown, [class*="cookie"], .cdk-overlay-container';
  const ROOT = document.querySelector('.content-area') || document.querySelector('main') || document.body;
  const isChrome = el => !!(el.closest && el.closest(CHROME));
  // Un elemento "icona" (mat-icon / material-icons): il suo testo è una ligature,
  // va ignorato per font-size e font-family (è il font delle icone, non testo reale).
  const isIcon = el => !!(el.matches && el.matches('mat-icon, .material-icons, .mat-icon, [class*="material-icons"]'));
  const onlyIcon = el => {
    if (isIcon(el)) return true;
    const t = (el.textContent || '').trim();
    return el.querySelector && el.querySelector('mat-icon, .material-icons') && /^[a-z][a-z_]+$/.test(t);
  };

  function visible(el) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  // Ritorna il bg opaco sotto l'elemento. null se incontra un gradiente
  // (background-image) → in quel caso il contrasto non è calcolabile, si salta.
  function bgOf(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradiente: skip
      const c = toRgb(cs.backgroundColor);
      if (c && c.a >= 0.5) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  const cap = (arr, n) => arr.slice(0, n);
  const push = (type, msg, sel) => out.push({ type, msg, sel });

  // True se l'elemento vive dentro un contenitore che scrolla in orizzontale
  // (tab Material, kanban, wrapper di tabella): il "debordo" è voluto, non un bug.
  function inScrollX(el) {
    let n = el.parentElement;
    while (n && n.nodeType === 1) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      if (n === ROOT) break;
      n = n.parentElement;
    }
    return false;
  }

  // ── 1. overflow-x della pagina ─────────────────────────────────
  const de = document.documentElement;
  const scrollW = Math.max(de.scrollWidth, document.body.scrollWidth);
  if (scrollW > vw + 2) {
    push('overflow-x', 'la pagina scrolla in orizzontale: scrollWidth=' + scrollW + ' > viewport=' + vw);
  }

  // ── 2. elementi che debordano oltre il viewport (clip) ─────────
  const all = Array.from(ROOT.querySelectorAll('*'));
  const seenClip = new Set();
  let clip = [];
  for (const el of all) {
    if (isChrome(el) || !visible(el)) continue;
    if (inScrollX(el)) continue;                  // scroll orizzontale voluto (tab/kanban/tabella)
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right > vw + 4 && r.width < vw * 1.5) {
      const key = el.tagName + '.' + (el.className || '').toString().slice(0, 30);
      if (seenClip.has(key)) continue;
      seenClip.add(key);
      clip.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,40), right: Math.round(r.right) });
    }
  }
  for (const c of cap(clip, 6)) push('clip', 'elemento <' + c.tag + ' class="' + c.cls + '"> sborda a x=' + c.right + ' (vw=' + vw + ')');

  // ── 3. controlli interattivi: tap-target, font, contrasto, palette ──
  const interactive = Array.from(ROOT.querySelectorAll(
    'button, a[href], [role="button"], input, select, textarea, .btn, .btn-primary, mat-checkbox, mat-slide-toggle'
  )).filter(el => visible(el) && !isChrome(el));

  let smallTap = [], tinyFont = [], lowContrast = [], offPalette = [], fontMix = [];
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // tap target (solo su touch e solo per controlli "veri")
    if (touch) {
      const isInlineLink = el.tagName === 'A' && s.display.includes('inline');
      // l'<input> dentro una mat-form-field non è la superficie tap: lo è il campo.
      const ty = (el.getAttribute && (el.getAttribute('type') || 'text') || 'text').toLowerCase();
      const skipTap = isInlineLink
        || (el.tagName === 'INPUT' && (['hidden','checkbox','radio','file','range'].includes(ty) || el.closest('.mat-mdc-form-field, mat-form-field')));
      if (!skipTap && (r.height < tapMin - 6 || r.width < 24) && r.height > 0) {
        smallTap.push({ t: el.tagName.toLowerCase(), txt: (el.textContent||'').trim().slice(0,24), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    // font size (escludi le icone: la loro "ligature" non è testo)
    const fs = parseFloat(s.fontSize);
    if (fs && fs < 12 && !onlyIcon(el) && (el.textContent||'').trim().length > 1) {
      tinyFont.push({ txt: (el.textContent||'').trim().slice(0,24), fs });
    }
    // palette dei bottoni "pieni" (azioni primarie)
    const bg = toRgb(s.backgroundColor);
    if (bg && bg.a >= 0.6 && (el.matches('button, .btn, .btn-primary, [mat-flat-button], [mat-raised-button]'))) {
      if (!nearPalette(bg)) offPalette.push({ t: el.tagName.toLowerCase(), txt: (el.textContent||'').trim().slice(0,24), bg: 'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')' });
    }
    // font-family fuori standard (le icone usano apposta il font Material)
    const ff = (s.fontFamily||'').toLowerCase();
    if (ff && baseFont && !onlyIcon(el) && (el.textContent||'').trim().length >= 2
        && !ff.includes('inter') && !ff.includes('material') && !ff.includes('roboto') && !ff.includes('monospace') && !ff.includes('sans-serif')) {
      fontMix.push({ txt: (el.textContent||'').trim().slice(0,20), ff: ff.slice(0,40) });
    }
  }
  // contrasto su testo significativo
  const textEls = Array.from(ROOT.querySelectorAll('p, span, a, button, label, h1, h2, h3, h4, td, th, li, .btn')).filter(el => {
    if (isChrome(el) || isIcon(el) || !visible(el)) return false;
    const t = (el.textContent||'').trim();
    if (t.length < 3) return false;
    // solo nodi foglia testuali
    return Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 2);
  });
  const seenCt = new Set();
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const fg = toRgb(s.color);
    if (!fg || fg.a < 0.5) continue;
    const bg = bgOf(el);
    if (!bg) continue;                 // sfondo con gradiente: contrasto non calcolabile
    const ratio = contrast(fg, bg);
    const fs = parseFloat(s.fontSize) || 14;
    const bold = (parseInt(s.fontWeight) || 400) >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const min = large ? 3 : 4.5;
    if (ratio < min - 0.05) {
      const key = s.color + '|' + Math.round(ratio*10);
      if (seenCt.has(key)) continue;
      seenCt.add(key);
      lowContrast.push({ txt: (el.textContent||'').trim().slice(0,24), ratio: ratio.toFixed(2), fg: s.color });
    }
  }

  for (const x of cap(smallTap, 8)) push('tap-target', 'controllo "' + x.txt + '" (' + x.t + ') troppo piccolo: ' + x.w + '×' + x.h + 'px (min ' + tapMin + ')');
  for (const x of cap(tinyFont, 6)) push('tiny-font', 'testo "' + x.txt + '" con font-size ' + x.fs + 'px (<12)');
  for (const x of cap(lowContrast, 6)) push('low-contrast', 'testo "' + x.txt + '" contrasto ' + x.ratio + ':1 (' + x.fg + ')');
  for (const x of cap(offPalette, 6)) push('off-palette', 'azione "' + x.txt + '" usa colore fuori palette: ' + x.bg);
  for (const x of cap(fontMix, 4)) push('font-mix', 'testo "' + x.txt + '" usa font non standard: ' + x.ff);

  // ── 4. overlap di controlli interattivi ────────────────────────
  let overlaps = 0;
  for (let i = 0; i < interactive.length && overlaps < 4; i++) {
    const a = interactive[i].getBoundingClientRect();
    if (a.width < 8 || a.height < 8) continue;
    for (let j = i + 1; j < interactive.length; j++) {
      if (interactive[j].contains(interactive[i]) || interactive[i].contains(interactive[j])) continue;
      const b = interactive[j].getBoundingClientRect();
      const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const area = ox * oy;
      const minA = Math.min(a.width*a.height, b.width*b.height);
      if (area > minA * 0.5 && minA > 200) {
        push('overlap', 'due controlli si sovrappongono ("' + (interactive[i].textContent||'').trim().slice(0,16) + '" / "' + (interactive[j].textContent||'').trim().slice(0,16) + '")');
        overlaps++; break;
      }
    }
  }

  // ── 5. immagini rotte ──────────────────────────────────────────
  let broken = [];
  for (const img of Array.from(document.images)) {
    if (img.complete && img.naturalWidth === 0 && img.src) broken.push(img.src.slice(0, 80));
  }
  for (const b of cap(broken, 4)) push('broken-img', 'immagine non caricata: ' + b);

  // ── 6. pagina vuota / non renderizzata ─────────────────────────
  const main = document.querySelector('main, .page, router-outlet + *');
  const txtLen = (document.body.innerText || '').trim().length;
  if (txtLen < 40) push('empty-page', 'la pagina sembra vuota (testo visibile: ' + txtLen + ' char)');

  // ── riepilogo informativo (non un problema) ───────────────────
  const palBtns = {};
  for (const el of interactive) {
    if (!el.matches('button, .btn, .btn-primary, [mat-flat-button], [mat-raised-button]')) continue;
    const bg = toRgb(getComputedStyle(el).backgroundColor);
    if (bg && bg.a >= 0.6) { const k = 'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')'; palBtns[k] = (palBtns[k]||0)+1; }
  }

  return { findings: out, info: { interactive: interactive.length, btnColors: palBtns, textVisible: txtLen } };
}`;

async function auditPage(page, vp, pg) {
  try {
    await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'networkidle', timeout: 25000 });
  } catch {
    try { await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
    catch (e) { record({ severity: 'error', viewport: vp.name, type: 'navigate-fail', page: pg.path, msg: e.message }); return; }
  }
  await page.waitForTimeout(1300);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);

  // Screenshot full-page
  const dir = join(OUT_DIR, vp.name);
  await page.screenshot({ path: join(dir, `${pg.name}.png`), fullPage: true })
    .catch(e => record({ severity: 'info', viewport: vp.name, type: 'screenshot', page: pg.path, msg: e.message }));

  if (!vp.audit) return; // "wide": solo screenshot

  // Conteggio righe per le liste (verifica dati demo fittizi)
  if (pg.list) {
    const rows = await page.evaluate(() => {
      const sel = document.querySelectorAll('table tbody tr, mat-row, .m-card, [role="row"]');
      return Array.from(sel).filter(r => (r.textContent||'').trim().length > 0).length;
    }).catch(() => null);
    if (rows != null && rows === 0) {
      record({ severity: 'warn', viewport: vp.name, type: 'no-demo-data', page: pg.path, msg: 'lista vuota: nessun dato fittizio mostrato' });
    }
  }

  const auditArg = JSON.stringify({ touch: vp.touch, vw: vp.width, vh: vp.height });
  const res = await page.evaluate(`(${IN_PAGE_AUDIT})(${auditArg})`).catch(e => ({ findings: [{ type: 'audit-error', msg: e.message }], info: {} }));
  for (const f of res.findings || []) {
    const sev = ['overflow-x', 'empty-page', 'navigate-fail', 'audit-error'].includes(f.type) ? 'error'
      : ['clip', 'tap-target', 'overlap', 'off-palette', 'broken-img', 'low-contrast'].includes(f.type) ? 'warn'
      : 'info';
    record({ severity: sev, viewport: vp.name, type: f.type, page: pg.path, msg: f.msg });
  }
}

async function auditDialogs(page, vp) {
  if (!vp.audit) return;
  for (const d of NEW_DIALOGS) {
    try {
      await page.goto(`${BASE_URL}${d.path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(900);
      const btn = page.locator(`button:has-text("${d.trigger}")`).first();
      if (!(await btn.count())) continue;
      await btn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(900);
      const dialog = page.locator('mat-dialog-container, .cdk-overlay-pane').first();
      if (!(await dialog.count())) continue;

      // overflow/clip dentro al dialog
      const r = await dialog.evaluate((el, vw) => {
        const b = el.getBoundingClientRect();
        const sc = el.scrollWidth;
        const small = Array.from(el.querySelectorAll('button, input, select, [role="button"]'))
          .map(c => c.getBoundingClientRect()).filter(x => x.height > 0 && x.height < 34).length;
        return { right: Math.round(b.right), width: Math.round(b.width), scrollW: sc, vw, small };
      }, vp.width).catch(() => null);
      if (r) {
        if (r.right > vp.width + 4 || r.scrollW > r.width + 6) {
          record({ severity: 'warn', viewport: vp.name, type: 'dialog-overflow', page: d.path, msg: `dialog "${d.trigger}" deborda (right=${r.right}, scrollW=${r.scrollW}, vw=${r.vw})` });
        }
        if (vp.touch && r.small > 0) {
          record({ severity: 'warn', viewport: vp.name, type: 'dialog-tap', page: d.path, msg: `dialog "${d.trigger}": ${r.small} controlli < 34px d'altezza` });
        }
      }
      const dir = join(OUT_DIR, vp.name);
      await page.screenshot({ path: join(dir, `dialog-${d.path.replace(/\//g,'')}.png`), fullPage: false }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
    } catch (e) {
      record({ severity: 'info', viewport: vp.name, type: 'dialog-skip', page: d.path, msg: e.message });
    }
  }
}

(async () => {
  console.log(C.b('\n══ UX/UI AUDIT — ' + BASE_URL + ' ══'));
  console.log(C.dim('  utente demo: ' + USER));

  console.log('→ Login tenant demo…');
  const token = await loginAndGetToken();
  console.log('  ' + C.g('✓') + ' token OK');

  mkdirSync(OUT_DIR, { recursive: true });
  for (const vp of VIEWPORTS) mkdirSync(join(OUT_DIR, vp.name), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(C.c(`\n→ Viewport "${vp.name}" (${vp.width}×${vp.height}${vp.touch ? ', touch' : ''})${vp.audit ? '' : ' — solo screenshot'}`));
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      hasTouch: vp.touch,
      isMobile: vp.name === 'mobile',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    // console / http error capture (solo nei viewport auditati)
    if (vp.audit) {
      page.on('pageerror', err => record({ severity: 'error', viewport: vp.name, type: 'pageerror', page: page.url().replace(BASE_URL, ''), msg: err.message }));
      page.on('console', msg => {
        if (msg.type() !== 'error') return;
        const t = msg.text();
        if (/devtools|service worker|sw\.js|chrome-extension|favicon|cdn-cgi|ResizeObserver/i.test(t)) return;
        record({ severity: 'error', viewport: vp.name, type: 'console-error', page: page.url().replace(BASE_URL, ''), msg: t });
      });
      page.on('response', resp => {
        if (!resp.url().includes('/api/')) return;
        if (resp.status() >= 400) record({ severity: 'error', viewport: vp.name, type: 'http-error', page: page.url().replace(BASE_URL, ''), msg: `${resp.status()} ${resp.url().replace(BASE_URL, '')}` });
      });
    }

    await page.goto(BASE_URL).catch(() => {});
    await page.evaluate(([k, t]) => {
      localStorage.setItem(k, t);
      // Consenso cookie già dato → niente banner che copre il contenuto e falsa i controlli.
      localStorage.setItem('ordeva_cookie_consent', JSON.stringify({
        version: 1, timestamp: new Date().toISOString(),
        necessari: true, preferenze: true, statistiche: true, marketing: true,
      }));
    }, [TOKEN_KEY, token]);

    for (const pg of PAGES) await auditPage(page, vp, pg);
    await auditDialogs(page, vp);

    await context.close();
  }

  await browser.close();

  // ── report ────────────────────────────────────────────────────
  const byType = {};
  const byViewport = {};
  for (const f of findings) {
    byType[f.type] = (byType[f.type] || 0) + 1;
    byViewport[f.viewport] = byViewport[f.viewport] || { error: 0, warn: 0, info: 0 };
    byViewport[f.viewport][f.severity]++;
  }
  const report = {
    runAt: new Date().toISOString(),
    base: BASE_URL,
    user: USER,
    pages: PAGES.length,
    viewports: VIEWPORTS.map(v => v.name),
    totals: counts,
    byType,
    byViewport,
    findings,
  };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  // markdown
  let md = `# UX/UI Audit — Ordeva\n\n`;
  md += `- **Quando:** ${report.runAt}\n- **Ambiente:** ${BASE_URL} (utente demo \`${USER}\`)\n`;
  md += `- **Pagine:** ${PAGES.length} · **Viewport:** ${report.viewports.join(', ')}\n`;
  md += `- **Totali:** ${C ? '' : ''}🔴 ${counts.error} error · 🟡 ${counts.warn} warn · ⚪ ${counts.info} info\n\n`;
  md += `## Per categoria\n\n| Categoria | N |\n|---|---|\n`;
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) md += `| ${t} | ${n} |\n`;
  md += `\n## Per viewport\n\n| Viewport | error | warn | info |\n|---|---|---|---|\n`;
  for (const [v, c] of Object.entries(byViewport)) md += `| ${v} | ${c.error} | ${c.warn} | ${c.info} |\n`;
  const errs = findings.filter(f => f.severity === 'error');
  const warns = findings.filter(f => f.severity === 'warn');
  if (errs.length) {
    md += `\n## 🔴 Error\n\n`;
    for (const f of errs) md += `- **[${f.viewport}] ${f.page}** \`${f.type}\` — ${f.msg}\n`;
  }
  if (warns.length) {
    md += `\n## 🟡 Warn\n\n`;
    for (const f of warns.slice(0, 120)) md += `- **[${f.viewport}] ${f.page}** \`${f.type}\` — ${f.msg}\n`;
    if (warns.length > 120) md += `\n_… e altri ${warns.length - 120} warn (vedi report.json)._\n`;
  }
  writeFileSync(join(OUT_DIR, 'report.md'), md);

  // console summary
  console.log(C.b('\n══ RIEPILOGO ══'));
  console.log(`  🔴 error: ${counts.error}   🟡 warn: ${counts.warn}   ⚪ info: ${counts.info}`);
  console.log('  per categoria:');
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`    ${t}: ${n}`);
  console.log(`\n  ${C.g('✓')} report.json + report.md in ${OUT_DIR}`);
  console.log(`  ${C.g('✓')} screenshot in ${OUT_DIR}/{mobile,tablet,desktop,wide}/`);

  process.exit(counts.error > 0 ? 1 : 0);
})().catch(err => {
  console.error(C.r('✗ Errore audit UX:'), err.message);
  process.exit(1);
});
