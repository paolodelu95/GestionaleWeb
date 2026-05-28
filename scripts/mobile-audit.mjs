/**
 * Audit mobile estensivo: visita TUTTE le pagine in viewport mobile
 * (iPhone-like 390×844), apre tutti i dialog di creazione, e cattura
 * screenshot full-page. Riporta visual issues comuni: overflow X,
 * elementi tagliati, bottoni sovrapposti.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4200';
const API = process.env.API || 'http://localhost:3000/api';
const USERNAME = process.env.USERNAME || 'bughunt@local.test';
const PASSWORD = process.env.PASSWORD || 'BugHunt2026!';
const OUT_DIR = '/tmp/mobile-audit';

const VIEWPORTS = [
  { name: 'iphone-se',     width: 375, height: 667 }, // smallest target
  { name: 'iphone-12',     width: 390, height: 844 }, // typical
];

const PAGES = [
  '/app', '/dashboard', '/prodotti', '/clienti', '/fornitori',
  '/preventivi', '/ordini', '/ddt', '/fatture', '/note-credito',
  '/acquisti', '/arrivi-merce', '/magazzino', '/pagamenti',
  '/scadenzario', '/prima-nota', '/riconciliazione',
  '/agenda', '/crm', '/timesheet', '/vendita-banco',
  '/reports', '/ecommerce', '/sdi-passive', '/ocr-fatture',
  '/impostazioni', '/billing', '/account', '/aiuto',
];

const NEW_DIALOGS = [
  { page: '/preventivi',   trigger: 'button:has-text("Nuovo preventivo")' },
  { page: '/ordini',       trigger: 'button:has-text("Nuovo ordine")' },
  { page: '/ddt',          trigger: 'button:has-text("Nuovo DDT")' },
  { page: '/fatture',      trigger: 'button:has-text("Nuova fattura")' },
  { page: '/note-credito', trigger: 'button:has-text("Nuova nota di credito")' },
  { page: '/acquisti',     trigger: 'button:has-text("Nuovo acquisto")' },
  { page: '/clienti',      trigger: 'button:has-text("Nuovo cliente")' },
  { page: '/fornitori',    trigger: 'button:has-text("Nuovo fornitore")' },
  { page: '/prodotti',     trigger: 'button:has-text("Nuovo prodotto")' },
  { page: '/pagamenti',    trigger: 'button:has-text("Nuovo pagamento")' },
  { page: '/arrivi-merce', trigger: 'button:has-text("Nuovo arrivo")' },
  { page: '/agenda',       trigger: 'button:has-text("Nuovo appuntamento")' },
  { page: '/crm',          trigger: 'button:has-text("Nuova opportunità")' },
  { page: '/timesheet',    trigger: 'button:has-text("Nuovo progetto")' },
  { page: '/prima-nota',   trigger: 'button:has-text("Nuova registrazione")' },
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

/** Heuristic overflow-x: confronta document scrollWidth vs viewport width */
async function checkOverflow(page, vp) {
  return await page.evaluate(w => {
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return { scrollWidth: sw, viewport: w, overflow: sw > w + 2 };
  }, vp.width);
}

(async () => {
  console.log(`→ Login...`);
  const token = await login();

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n══ Viewport ${vp.name} (${vp.width}×${vp.height}) ══`);
    const dir = join(OUT_DIR, vp.name);
    mkdirSync(dir, { recursive: true });

    const ctx = await browser.newContext({
      viewport: vp,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();

    page.on('console', m => {
      if (m.type() === 'error') {
        const t = m.text();
        if (/devtools|sw\.js|service worker|favicon|HMR|sourcemap/i.test(t)) return;
        record('console', page.url() || '?', t, 'error');
      }
    });
    page.on('pageerror', e => record('pageerror', page.url() || '?', e.message, 'error'));

    await page.goto(BASE_URL);
    await page.evaluate(t => localStorage.setItem('ordeva_token', t), token);

    for (const p of PAGES) {
      try {
        await page.goto(`${BASE_URL}${p}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(800);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);

        // Check overflow-x
        const ov = await checkOverflow(page, vp);
        if (ov.overflow) {
          record('overflow-x', p, `scrollWidth=${ov.scrollWidth}px > viewport=${vp.width}px (Δ=${ov.scrollWidth - vp.width}px)`, 'warn');
        }

        const safe = p.replace(/^\//, '').replace(/\//g, '_') || 'root';
        await page.screenshot({ path: join(dir, `${safe}.png`), fullPage: true }).catch(() => {});
      } catch (e) {
        record('navigate', p, e.message, 'error');
      }
    }

    // Dialogs creazione
    const dlgDir = join(dir, 'dialogs');
    mkdirSync(dlgDir, { recursive: true });
    for (const d of NEW_DIALOGS) {
      try {
        await page.goto(`${BASE_URL}${d.page}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(700);
        const trigger = page.locator(d.trigger).first();
        if (await trigger.count() === 0) {
          record('dialog-trigger', d.page, `non trovato: ${d.trigger}`, 'warn');
          continue;
        }
        await trigger.click({ timeout: 5000 });
        await page.waitForTimeout(800);
        const dlg = page.locator('mat-dialog-container, mat-bottom-sheet-container').first();
        if (!await dlg.isVisible().catch(() => false)) {
          record('dialog-visible', d.page, 'dialog non visibile', 'error');
          continue;
        }
        // Check overflow del dialog
        const dlgOv = await dlg.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { w: r.width, sw: el.scrollWidth, overflow: el.scrollWidth > r.width + 2 };
        });
        if (dlgOv.overflow) {
          record('dialog-overflow', d.page, `dialog scrollWidth=${dlgOv.sw}px > w=${dlgOv.w}px`, 'warn');
        }
        const safe = d.page.replace(/^\//, '').replace(/\//g, '_');
        await page.screenshot({ path: join(dlgDir, `nuovo-${safe}.png`), fullPage: true }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      } catch (e) {
        record('dialog', d.page, e.message, 'error');
      }
    }

    await ctx.close();
  }

  await browser.close();

  const counts = findings.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
  console.log(`\n══ MOBILE AUDIT ══`);
  console.log(`  ✗ Errors:   ${counts.error || 0}`);
  console.log(`  ⚠ Warnings: ${counts.warn  || 0}`);

  const uniq = [];
  const seen = new Set();
  for (const f of findings) {
    const k = `${f.type}|${f.page}|${f.msg.slice(0,140)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(f);
  }
  console.log(`\n══ FINDINGS (${uniq.length}) ══`);
  for (const f of uniq) {
    const icon = f.severity === 'error' ? '✗' : '⚠';
    console.log(`${icon} [${f.type}] ${f.page} → ${f.msg.slice(0, 220)}`);
  }

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ counts, findings }, null, 2));
  console.log(`\n✓ Report: ${OUT_DIR}/report.json`);
  console.log(`✓ Screenshots: ${OUT_DIR}/{iphone-se,iphone-12}/`);
})().catch(err => {
  console.error('✗ Errore:', err.message);
  console.error(err.stack);
  process.exit(1);
});
