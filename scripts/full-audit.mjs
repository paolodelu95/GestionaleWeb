/**
 * Audit completo: visita ogni pagina del menu, apre il dialog "Nuovo X"
 * per ogni tipo documento, controlla che non ci siano errori console,
 * salva screenshots in /tmp/full-audit/{viewport}/{path}.png.
 *
 * Uso: BASE_URL=http://localhost:4200 API=http://localhost:3000/api node scripts/full-audit.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4200';
const API = process.env.API || 'http://localhost:3000/api';
const USERNAME = process.env.USERNAME || 'bughunt@local.test';
const PASSWORD = process.env.PASSWORD || 'BugHunt2026!';
const OUT_DIR = '/tmp/full-audit';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
  { name: 'dark',    width: 1440, height: 900, theme: 'dark' },
];

// ── Inventario delle pagine ────────────────────────────────────────────
const PAGES = [
  { path: '/app',            label: 'Home' },
  { path: '/dashboard',      label: 'Dashboard' },
  { path: '/prodotti',       label: 'Prodotti' },
  { path: '/clienti',        label: 'Clienti' },
  { path: '/fornitori',      label: 'Fornitori' },
  { path: '/preventivi',     label: 'Preventivi' },
  { path: '/ordini',         label: 'Ordini' },
  { path: '/ddt',            label: 'DDT' },
  { path: '/fatture',        label: 'Fatture' },
  { path: '/note-credito',   label: 'Note credito' },
  { path: '/acquisti',       label: 'Acquisti' },
  { path: '/arrivi-merce',   label: 'Arrivi merce' },
  { path: '/magazzino',      label: 'Magazzino' },
  { path: '/pagamenti',      label: 'Pagamenti' },
  { path: '/scadenzario',    label: 'Scadenzario' },
  { path: '/prima-nota',     label: 'Prima nota' },
  { path: '/riconciliazione',label: 'Riconciliazione' },
  { path: '/agenda',         label: 'Agenda' },
  { path: '/crm',            label: 'CRM' },
  { path: '/timesheet',      label: 'Timesheet' },
  { path: '/vendita-banco',  label: 'Vendita banco' },
  { path: '/reports',        label: 'Report' },
  { path: '/ecommerce',      label: 'E-commerce' },
  { path: '/sdi-passive',    label: 'SDI passive' },
  { path: '/ocr-fatture',    label: 'OCR fatture' },
  { path: '/impostazioni',   label: 'Impostazioni' },
  { path: '/billing',        label: 'Billing' },
  { path: '/aiuto',          label: 'Aiuto' },
];

// Dialog "Nuovo X" da aprire: selettore del bottone trigger
const NEW_DIALOGS = [
  { page: '/preventivi',   trigger: 'button:has-text("Nuovo Preventivo"), button:has-text("Nuovo preventivo")' },
  { page: '/ordini',       trigger: 'button:has-text("Nuovo Ordine"), button:has-text("Nuovo ordine")' },
  { page: '/ddt',          trigger: 'button:has-text("Nuovo DDT"), button:has-text("Nuovo Ddt")' },
  { page: '/fatture',      trigger: 'button:has-text("Nuova Fattura"), button:has-text("Nuova fattura")' },
  { page: '/note-credito', trigger: 'button:has-text("Nuova Nota"), button:has-text("Nuova nota")' },
  { page: '/acquisti',     trigger: 'button:has-text("Nuovo Acquisto"), button:has-text("Nuovo acquisto")' },
  { page: '/clienti',      trigger: 'button:has-text("Nuovo cliente")' },
  { page: '/fornitori',    trigger: 'button:has-text("Nuovo fornitore")' },
  { page: '/prodotti',     trigger: 'button:has-text("Nuovo prodotto")' },
];

const findings = [];
function record(type, page, msg, severity = 'info') {
  findings.push({ type, page, msg, severity });
  const icon = severity === 'error' ? '✗' : severity === 'warn' ? '⚠' : '·';
  console.log(`${icon} [${type}] ${page}: ${msg.slice(0, 240)}`);
}

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login: ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

async function api(token, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json().catch(() => null) : null };
}

(async () => {
  console.log(`→ Login...`);
  const token = await login();
  console.log(`  ✓ token`);

  // Reset lock state
  const az = await api(token, 'GET', '/azienda');
  if (az.ok) await api(token, 'PUT', '/azienda', { ...az.data, lockDocumentiDefault: true });

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n══ Viewport ${vp.name} (${vp.width}×${vp.height}) ══`);
    const dir = join(OUT_DIR, vp.name);
    mkdirSync(dir, { recursive: true });

    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();

    // Cattura console errors / pageerrors / 4xx-5xx network
    page.on('console', m => {
      if (m.type() === 'error') {
        const t = m.text();
        if (/devtools|sw\.js|service worker|favicon|HMR|sourcemap/i.test(t)) return;
        record('console', page.url() || '?', t, 'error');
      }
    });
    page.on('pageerror', e => record('pageerror', page.url() || '?', e.message, 'error'));
    page.on('response', resp => {
      const url = resp.url();
      const status = resp.status();
      if (!url.includes('/api/')) return;
      if (status >= 400 && status < 500 && !/\/auth\/(login|forgot|verify)/.test(url)) {
        // 401 da non-auth è ok per pagine pre-login
        if (status === 401 && url.endsWith('/auth/login')) return;
        record('http', url.replace(API, ''), `${status}`, status >= 500 ? 'error' : 'warn');
      } else if (status >= 500) {
        record('http5xx', url.replace(API, ''), `${status}`, 'error');
      }
    });

    // Inject token + theme
    await page.goto(BASE_URL);
    await page.evaluate(args => {
      localStorage.setItem('ordeva_token', args.token);
      if (args.theme === 'dark') localStorage.setItem('dark-mode', '1');
      else localStorage.removeItem('dark-mode');
    }, { token, theme: vp.theme });

    // ── Visit each page ────────────────────────────────────────────
    for (const p of PAGES) {
      try {
        await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(800);
        // chiudi eventuali snackbar / dialog rimasti aperti
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
        const safe = p.path.replace(/^\//, '').replace(/\//g, '_') || 'root';
        await page.screenshot({ path: join(dir, `${safe}.png`), fullPage: false }).catch(() => {});
      } catch (e) {
        record('navigate-fail', p.path, e.message, 'error');
      }
    }

    // ── Open "Nuovo X" dialogs (solo desktop, mobile copre tabella) ──
    if (vp.name === 'desktop') {
      const dlgDir = join(dir, 'dialogs');
      mkdirSync(dlgDir, { recursive: true });
      for (const d of NEW_DIALOGS) {
        try {
          await page.goto(`${BASE_URL}${d.page}`, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(700);
          const trigger = page.locator(d.trigger).first();
          if (await trigger.count() === 0) {
            record('new-dialog', d.page, `trigger non trovato: ${d.trigger}`, 'warn');
            continue;
          }
          await trigger.click({ timeout: 5000 });
          await page.waitForTimeout(800);
          const dlg = page.locator('mat-dialog-container').first();
          if (!await dlg.isVisible().catch(() => false)) {
            record('new-dialog', d.page, 'dialog non visibile', 'error');
            continue;
          }
          const safe = d.page.replace(/^\//, '').replace(/\//g, '_');
          await page.screenshot({ path: join(dlgDir, `nuovo-${safe}.png`), fullPage: false }).catch(() => {});
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        } catch (e) {
          record('new-dialog', d.page, e.message, 'error');
        }
      }
    }

    await ctx.close();
  }

  await browser.close();

  // ── Report ─────────────────────────────────────────────────────
  const counts = findings.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
  console.log(`\n══ AUDIT ══`);
  console.log(`  ✗ Errors:   ${counts.error || 0}`);
  console.log(`  ⚠ Warnings: ${counts.warn  || 0}`);
  console.log(`  · Info:     ${counts.info  || 0}`);

  // Aggregate dedupe
  const seen = new Set();
  const uniq = [];
  for (const f of findings) {
    const k = `${f.type}|${f.msg.slice(0, 140)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(f);
  }
  console.log(`\n══ UNIQUE FINDINGS (${uniq.length}) ══`);
  for (const f of uniq) {
    const icon = f.severity === 'error' ? '✗' : f.severity === 'warn' ? '⚠' : '·';
    console.log(`${icon} [${f.type}] ${f.page} → ${f.msg.slice(0, 220)}`);
  }

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ counts, findings }, null, 2));
  console.log(`\n✓ Report: ${OUT_DIR}/report.json`);
  console.log(`✓ Screenshots: ${OUT_DIR}/{desktop,mobile}/`);
})().catch(err => {
  console.error('✗ Errore:', err.message);
  process.exit(1);
});
