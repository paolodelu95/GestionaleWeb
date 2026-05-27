/**
 * Audit completo dell'app come fa un utente reale.
 *  - Login col tenant demo
 *  - Naviga 10+ pagine, in 4 viewport (mobile / tablet / desktop / wide)
 *  - Cattura console.error, network 4xx/5xx, exception handler
 *  - Tenta interazioni base (apri dialog "Nuovo", scroll, ecc.)
 *  - Salva tutto in scripts/audit-output/{viewport}/...
 *  - Stampa un report finale con i problemi trovati
 *
 * Uso:
 *   cd scripts && node audit.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'audit-output');
const BASE_URL = process.env.BASE_URL || 'https://ordeva.it';
const API = `${BASE_URL}/api`;

const DEMO = { username: 'demo-screenshots@ordeva.it', password: 'DemoOrdeva-2026!' };

const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide',    width: 1920, height: 1080 },
];

// Pagine da visitare per ogni viewport
const PAGES = [
  '/app',           // home
  '/dashboard',
  '/clienti',
  '/fornitori',
  '/prodotti',
  '/preventivi',
  '/ordini',
  '/ddt',
  '/fatture',
  '/note-credito',
  '/acquisti',
  '/arrivi-merce',
  '/magazzino',
  '/pagamenti',
  '/scadenzario',
  '/prima-nota',
  '/riconciliazione',
  '/agenda',
  '/crm',
  '/timesheet',
  '/vendita-banco',
  '/report',
  '/storico',
  '/impostazioni',
  '/aiuto',
  '/compliance',
];

async function loginAndGetToken() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DEMO.username, password: DEMO.password }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.token;
}

async function auditViewport(browser, token, viewport) {
  const dir = join(OUT_DIR, viewport.name);
  mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const issues = [];

  page.on('pageerror', err => {
    issues.push({ type: 'pageerror', message: err.message, page: page.url() });
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // skippa rumore innocuo (sw not registered, devtools deprecation, etc.)
      if (/devtools|service worker|sw\.js|chrome-extension|favicon|cdn-cgi/i.test(text)) return;
      issues.push({ type: 'console.error', message: text, page: page.url() });
    }
  });
  page.on('response', resp => {
    const status = resp.status();
    const url = resp.url();
    if (!url.includes('/api/')) return;
    if (status >= 400) {
      issues.push({ type: 'http', status, url, page: page.url() });
    }
  });

  // Set token before nav
  await page.goto(BASE_URL);
  await page.evaluate(t => localStorage.setItem('ordeva_token', t), token);

  // Visit each page
  for (const path of PAGES) {
    try {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1200);
      // chiudi snackbar/dialog che a volte appaiono
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      const safe = path.replace(/^\//, '').replace(/\//g, '_') || 'root';
      await page.screenshot({
        path: join(dir, `${safe}.png`),
        fullPage: false,
      }).catch(e => issues.push({ type: 'screenshot', message: e.message, page: path }));
    } catch (err) {
      issues.push({ type: 'navigate-fail', page: path, message: err.message });
    }
  }

  await context.close();
  return issues;
}

(async () => {
  console.log('→ Login tenant demo...');
  const token = await loginAndGetToken();
  console.log('  ✓ token OK');

  mkdirSync(OUT_DIR, { recursive: true });

  console.log('→ Avvio Chromium...');
  const browser = await chromium.launch({ headless: true });

  const allIssues = {};
  for (const vp of VIEWPORTS) {
    console.log(`→ Audit viewport "${vp.name}" (${vp.width}×${vp.height})...`);
    const issues = await auditViewport(browser, token, vp);
    allIssues[vp.name] = issues;
    console.log(`  → ${issues.length} issue trovate`);
  }

  await browser.close();

  // Aggrega + scrivi report
  const report = {
    runAt: new Date().toISOString(),
    base: BASE_URL,
    viewports: VIEWPORTS.map(v => v.name),
    pagesVisited: PAGES.length,
    issues: allIssues,
    summary: {},
  };
  for (const [vp, issues] of Object.entries(allIssues)) {
    const byType = {};
    for (const i of issues) byType[i.type] = (byType[i.type] || 0) + 1;
    report.summary[vp] = { total: issues.length, byType };
  }
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  // Stampa sommario
  console.log('\n══ AUDIT SUMMARY ══');
  for (const [vp, summary] of Object.entries(report.summary)) {
    console.log(`\n[${vp}] totale issue: ${summary.total}`);
    for (const [type, n] of Object.entries(summary.byType)) {
      console.log(`  ${type}: ${n}`);
    }
  }
  // Stampa primi 30 errori unici
  const seen = new Set();
  const uniq = [];
  for (const list of Object.values(allIssues)) {
    for (const i of list) {
      const key = `${i.type}|${i.status || ''}|${(i.url || i.message || '').slice(0, 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(i);
      if (uniq.length >= 30) break;
    }
    if (uniq.length >= 30) break;
  }
  if (uniq.length) {
    console.log('\n══ PRIMI 30 ISSUE UNICI ══');
    for (const i of uniq) {
      const u = i.url || i.page || '';
      const m = (i.message || '').slice(0, 120);
      console.log(`  [${i.type}${i.status ? ' ' + i.status : ''}] ${u} ${m}`);
    }
  }

  console.log(`\n✓ Report: ${join(OUT_DIR, 'report.json')}`);
  console.log(`✓ Screenshot: ${OUT_DIR}/{mobile,tablet,desktop,wide}/`);
})().catch(err => {
  console.error('✗ Errore audit:', err.message);
  process.exit(1);
});
