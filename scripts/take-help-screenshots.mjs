/**
 * Script che:
 *  1. Registra (o riusa) un tenant DEMO su ordeva.it via API pubblica
 *  2. Popola con dati interamente inventati via API
 *  3. Usa Playwright per loggarsi e screenshottare le sezioni principali
 *  4. Salva i PNG in frontend/public/help-shots/
 *
 * Nessun dato reale viene mai toccato: il tenant demo è isolato.
 *
 * Uso:
 *   cd scripts && npm install && npx playwright install chromium && node take-help-screenshots.mjs
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = join(__dirname, '..', 'frontend', 'public', 'help-shots');
const BASE_URL = process.env.BASE_URL || 'https://ordeva.it';
const API      = `${BASE_URL}/api`;

// Credenziali tenant demo. La password ha 16 char misti.
const DEMO = {
  ragioneSociale: 'Demo Ordeva (screenshots)',
  piva: '01234567890',
  email: 'demo-screenshots@ordeva.it',
  nome: 'Demo User',
  password: 'DemoOrdeva-2026!',
};

mkdirSync(OUT_DIR, { recursive: true });

async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.error || json.raw || txt}`);
  }
  return json;
}

async function registerOrLogin() {
  console.log('→ Tentativo register tenant demo...');
  try {
    const r = await api('POST', '/auth/register', DEMO);
    console.log('  ✓ Tenant creato:', r.tenant?.slug);
    return r.token;
  } catch (e) {
    if (/già registrata|Email già/.test(e.message)) {
      console.log('  ↪ Tenant già esistente, faccio login...');
      const r = await api('POST', '/auth/login', { username: DEMO.email, password: DEMO.password });
      return r.token;
    }
    throw e;
  }
}

async function seedDemoData(token) {
  console.log('→ Popolazione dati demo (idempotente, granulare)...');
  const me = await api('GET', '/me', null, token);
  console.log('  ✓ Loggato come', me.username, 'tenant', me.tenant);

  // ── Clienti (granulare) ─────────────────────────────────────────────
  let clienti = await api('GET', '/clienti', null, token);
  let c1 = clienti.find(c => /Mario Rossi/i.test(c.ragioneSociale));
  let c2 = clienti.find(c => /ACME/i.test(c.ragioneSociale));
  if (!c1) {
    c1 = await api('POST', '/clienti', {
      ragioneSociale: 'Mario Rossi SRL',
      pIva: '01234567891', codiceFiscale: 'RSSMRA80A01H501Z',
      email: 'mario.rossi@esempio.it', telefono: '+39 02 1234567',
      via: 'Via Roma 12', cap: '20100', citta: 'Milano', provincia: 'MI', stato: 'Italia',
    }, token);
  }
  if (!c2) {
    c2 = await api('POST', '/clienti', {
      ragioneSociale: 'ACME SpA',
      pIva: '01234567892',
      email: 'info@acme-demo.it', telefono: '+39 06 9876543',
      via: 'Corso Vittorio 88', cap: '00100', citta: 'Roma', provincia: 'RM', stato: 'Italia',
    }, token);
  }
  if (!clienti.find(c => /Bianchi/i.test(c.ragioneSociale))) {
    await api('POST', '/clienti', {
      ragioneSociale: 'Bianchi & Co.',
      pIva: '01234567893',
      email: 'contatti@bianchi-demo.it',
      via: 'Piazza Garibaldi 3', cap: '10100', citta: 'Torino', provincia: 'TO', stato: 'Italia',
    }, token);
  }
  console.log('  ✓ 3 clienti demo presenti');

  // ── Fornitori (granulare) ───────────────────────────────────────────
  const fornitori = await api('GET', '/fornitori', null, token);
  if (!fornitori.find(f => /Tessuti/i.test(f.ragioneSociale))) {
    await api('POST', '/fornitori', {
      ragioneSociale: 'Fornitore Tessuti SRL',
      pIva: '01234567894', email: 'ordini@tessuti-demo.it',
      via: 'Via Tessuti 5', cap: '50100', citta: 'Firenze', provincia: 'FI',
    }, token);
  }
  if (!fornitori.find(f => /Pellami/i.test(f.ragioneSociale))) {
    await api('POST', '/fornitori', {
      ragioneSociale: 'Pellami Italia SpA',
      pIva: '01234567895',
    }, token);
  }
  console.log('  ✓ 2 fornitori demo presenti');

  // ── Prodotti (granulare) ────────────────────────────────────────────
  const existingProds = await api('GET', '/prodotti', null, token);
  const prods = [
    { nome: 'Polo cotone L',    codice: 'POLO-L-01',  prezzo: 19.90, quantita: 24, sogliaMinima: 10, iva: 22 },
    { nome: 'T-shirt basic M',  codice: 'TSH-M-02',   prezzo:  9.90, quantita:  2, sogliaMinima: 10, iva: 22 },
    { nome: 'Felpa pile XL',    codice: 'FLP-XL-03',  prezzo: 34.90, quantita: 15, sogliaMinima:  5, iva: 22 },
    { nome: 'Cappellino brand', codice: 'CAP-01',     prezzo:  7.50, quantita:  0, sogliaMinima: 20, iva: 22 },
    { nome: 'Calzini cotone',   codice: 'CLZ-01',     prezzo:  4.50, quantita: 80, sogliaMinima: 30, iva: 22 },
  ];
  for (const p of prods) {
    if (existingProds.find(e => e.codice === p.codice)) continue;
    await api('POST', '/prodotti', { ...p, unitaMisura: 'pz', categoria: 'Abbigliamento', descrizione: '' }, token);
  }
  console.log(`  ✓ ${prods.length} prodotti demo presenti`);

  // ── Fatture (granulare) ─────────────────────────────────────────────
  const existingFatture = await api('GET', '/fatture', null, token);
  try {
    if (!existingFatture.find(f => f.numero === '2026/0042')) {
      await api('POST', '/fatture', {
        clienteId: c1.id,
        numero: '2026/0042',
        dataEmissione: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
        stato: 'EMESSA',
        note: 'Demo screenshot',
        righe: [
          { descrizione: 'Consulenza tecnica', quantita: 8, prezzo: 50, iva: 22, sconto: 0, unitaMisura: 'h' },
          { descrizione: 'Sopralluogo + report', quantita: 1, prezzo: 80, iva: 22, sconto: 0, unitaMisura: 'pz' },
        ],
      }, token);
    }
    if (!existingFatture.find(f => f.numero === '2026/0043')) {
      await api('POST', '/fatture', {
        clienteId: c2.id,
        numero: '2026/0043',
        dataEmissione: new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10),
        stato: 'EMESSA',
        righe: [
          { descrizione: 'Polo cotone L', quantita: 12, prezzo: 19.90, iva: 22, sconto: 5, unitaMisura: 'pz' },
          { descrizione: 'Calzini cotone', quantita: 30, prezzo: 4.50, iva: 22, sconto: 0, unitaMisura: 'pz' },
        ],
      }, token);
    }
    console.log('  ✓ 2 fatture demo emesse');
  } catch (e) {
    console.log('  ⚠ Errore fatture:', e.message.slice(0, 100));
  }

  // ── Appuntamenti agenda (granulare) ──────────────────────
  try {
    const today = new Date(); today.setMonth(today.getMonth() - 1);
    const future = new Date(); future.setMonth(future.getMonth() + 2);
    const existingApps = await api(
      'GET',
      `/agenda/appuntamenti?dataDa=${today.toISOString().slice(0,10)}&dataA=${future.toISOString().slice(0,10)}`,
      null, token,
    );
    if (!existingApps.find(a => /Mario Rossi/i.test(a.titolo))) {
      const tomorrow = new Date(Date.now() + 86400000);
      await api('POST', '/agenda/appuntamenti', {
        titolo: 'Incontro Mario Rossi SRL',
        inizio: new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString(),
        fine:   new Date(tomorrow.setHours(11, 30, 0, 0)).toISOString(),
        clienteId: c1.id, luogo: 'Sede cliente',
        colore: '#11769b', stato: 'PIANIFICATO',
      }, token);
    }
    if (!existingApps.find(a => /Demo prodotto/i.test(a.titolo))) {
      const dayAfter = new Date(Date.now() + 2 * 86400000);
      await api('POST', '/agenda/appuntamenti', {
        titolo: 'Demo prodotto ACME',
        inizio: new Date(dayAfter.setHours(15, 0, 0, 0)).toISOString(),
        fine:   new Date(dayAfter.setHours(16, 0, 0, 0)).toISOString(),
        clienteId: c2.id,
        colore: '#15a4a2', stato: 'PIANIFICATO',
      }, token);
    }
    if (!existingApps.find(a => /Riunione team/i.test(a.titolo))) {
      const inDays = new Date(Date.now() + 4 * 86400000);
      await api('POST', '/agenda/appuntamenti', {
        titolo: 'Riunione team commerciale',
        inizio: new Date(inDays.setHours(9, 30, 0, 0)).toISOString(),
        fine:   new Date(inDays.setHours(10, 30, 0, 0)).toISOString(),
        colore: '#0891b2', stato: 'PIANIFICATO',
      }, token);
    }
    console.log('  ✓ Appuntamenti demo presenti');
  } catch (e) {
    console.log('  ⚠ Errore agenda:', e.message.slice(0, 100));
  }

  // ── CRM stage + opportunità (granulare) ─────────────────────────────
  try {
    let stagesNow = await api('GET', '/crm/stages', null, token);
    const sLead = stagesNow.find(s => /lead/i.test(s.nome));
    const sQua  = stagesNow.find(s => /qualif/i.test(s.nome));
    // Backend potrebbe usare nomi diversi (es. "Proposta"); cerco col best-match
    const sOff  = stagesNow.find(s => /offerta|proposta/i.test(s.nome));
    const sWon  = stagesNow.find(s => /vinto/i.test(s.nome) || s.vinto);
    const opp = await api('GET', '/crm/opportunita', null, token);
    if (sLead && !opp.find(o => /Bianchi/i.test(o.titolo))) {
      await api('POST', '/crm/opportunita', { titolo: 'Bianchi & Co.', clienteId: c1.id, stageId: sLead.id, valore: 4500, probabilita: 30 }, token);
    }
    if (sQua && !opp.find(o => /ACME/i.test(o.titolo))) {
      await api('POST', '/crm/opportunita', { titolo: 'ACME SpA',      clienteId: c2.id, stageId: sQua.id,  valore: 15000, probabilita: 60 }, token);
    }
    if (sOff && !opp.find(o => /Rossi SRL/i.test(o.titolo))) {
      await api('POST', '/crm/opportunita', { titolo: 'Rossi SRL',     clienteId: c1.id, stageId: sOff.id,  valore: 6200, probabilita: 75 }, token);
    }
    if (sWon && !opp.find(o => /Tech4U/i.test(o.titolo))) {
      await api('POST', '/crm/opportunita', { titolo: 'Tech4U SAS',                       stageId: sWon.id,  valore: 9500, probabilita: 100 }, token);
    }
    console.log('  ✓ Pipeline CRM presente');
  } catch (e) {
    console.log('  ⚠ Errore CRM:', e.message.slice(0, 100));
  }

  console.log('→ Seed completato.');
}

async function shoot(page, route, file, opts = {}) {
  console.log(`  · screenshot ${route} → ${file}`);
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(opts.delay || 1200);
  // chiudi eventuali snackbar/dialog non desiderati
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT_DIR, file),
    fullPage: false,
    ...opts.screenshotOpts,
  });
}

async function takeScreenshots(token) {
  console.log('→ Lancio Chromium headless...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Inserisci il token nel localStorage prima di navigare nell'app
  await page.goto(BASE_URL);
  await page.evaluate((t) => {
    localStorage.setItem('ordeva_token', t);
  }, token);

  await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. Home dashboard (tile)
  await shoot(page, '/app', 'home.png');
  // 2. Dashboard KPI
  await shoot(page, '/dashboard', 'dashboard.png', { delay: 2000 });
  // 3. Magazzino
  await shoot(page, '/prodotti', 'prodotti.png');
  // 4. Fatture lista
  await shoot(page, '/fatture', 'fatture.png');
  // 5. Agenda
  await shoot(page, '/agenda', 'agenda.png', { delay: 1800 });
  // 6. CRM
  await shoot(page, '/crm', 'crm.png');
  // 7. Scadenzario
  await shoot(page, '/scadenzario', 'scadenzario.png');

  await browser.close();
  console.log('→ Screenshot salvati in', OUT_DIR);
}

(async () => {
  try {
    const token = await registerOrLogin();
    await seedDemoData(token);
    await takeScreenshots(token);
    console.log('\n✓ Fatto. Controlla frontend/public/help-shots/');
  } catch (err) {
    console.error('\n✗ Errore:', err.message);
    process.exit(1);
  }
})();
