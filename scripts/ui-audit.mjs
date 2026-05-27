/**
 * UI Audit interattivo: usa davvero il programma con Playwright.
 *
 * Uso: vedi commenti README, env vars BASE_URL, API, USERNAME, PASSWORD.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4200';
const API = process.env.API || 'http://localhost:3000/api';
const USERNAME = process.env.USERNAME || 'bughunt@local.test';
const PASSWORD = process.env.PASSWORD || 'BugHunt2026!';

const issues = [];
const warns = [];
const ok = [];
function fail(t, d) { issues.push({ test: t, detail: d }); console.log(`✗ [${t}] ${d}`); }
function warn(t, d) { warns.push({ test: t, detail: d }); console.log(`⚠ [${t}] ${d}`); }
function pass(t) { ok.push(t); console.log(`✓ ${t}`); }

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
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, ok: r.ok, data };
}

async function openEditFromKebab(page, rowText) {
  // chiudi eventuali overlay
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(150);

  // Usa la search box (mat-form-field con label "Cerca...") per ridurre la lista
  const searchField = page.locator('mat-form-field.search-field input').first();
  if (await searchField.count() > 0) {
    await searchField.fill(rowText);
    await page.waitForTimeout(700);
  }

  let row = page.locator('tr', { hasText: rowText }).first();
  if (await row.count() === 0) {
    // Fallback: usa il paginator per scorrere
    await page.locator('button[aria-label*="ext page"], button.mat-mdc-paginator-navigation-last').first().click().catch(() => {});
    await page.waitForTimeout(400);
    row = page.locator('tr', { hasText: rowText }).first();
    if (await row.count() === 0) throw new Error(`Riga "${rowText}" non trovata in lista`);
  }
  const kebab = row.locator('button[title="Azioni"]').first();
  if (await kebab.count() === 0) throw new Error(`Kebab non trovato per riga "${rowText}"`);
  await kebab.click();
  await page.waitForTimeout(400);
  // Trova voce Modifica
  const modItem = page.locator('button[mat-menu-item]:has-text("Modifica")').first();
  if (await modItem.count() === 0) {
    // fallback: prova "Apri" o "Modifica fattura"
    const fall = page.locator('button[mat-menu-item]:has(mat-icon:text("edit"))').first();
    if (await fall.count() === 0) throw new Error('Voce Modifica non trovata nel kebab');
    await fall.click();
  } else {
    await modItem.click();
  }
  await page.waitForTimeout(600);
}

(async () => {
  console.log('→ Login...');
  const token = await login();
  pass('login OK');

  console.log('→ Ripristino lock=ON in azienda (idempotente)...');
  const azienda = await api(token, 'GET', '/azienda');
  if (azienda.ok) {
    const updated = { ...azienda.data, lockDocumentiDefault: true };
    const r = await api(token, 'PUT', '/azienda', updated);
    if (!r.ok) console.log(`  ⚠ Reset azienda: ${r.status} ${JSON.stringify(r.data).slice(0,200)}`);
    else console.log('  ✓ lock=ON');
  }

  console.log('→ Seed dati...');
  const cliente = await api(token, 'POST', '/clienti', {
    ragioneSociale: 'Cliente UI Test',
    email: 'cliente@uitest.it',
    indirizzo: 'Via Test 1', cap: '00100', citta: 'Roma', provincia: 'RM', stato: 'Italia',
  });
  if (!cliente.ok && cliente.status !== 409) {
    // se non c'è errore di duplicato
  }

  // Pulisci e ricrea (per evitare conflitti numerazione)
  const cId = cliente.ok ? cliente.data.id : (await api(token, 'GET', '/clienti')).data[0]?.id;

  const prodA = await api(token, 'POST', '/prodotti', {
    nome: 'Prodotto A UI', codice: 'PAUI', prezzo: 10, quantita: 100, soglia: 10,
    unitaMisura: 'pz', iva: 22, categoria: 'Test',
  });
  const prodB = await api(token, 'POST', '/prodotti', {
    nome: 'Prodotto B UI', codice: 'PBUI', prezzo: 20, quantita: 100, soglia: 10,
    unitaMisura: 'pz', iva: 22, categoria: 'Test',
  });

  const tag = `T${Date.now().toString().slice(-6)}`; // tag univoco per la run

  // 2 fatture pregresse con prezzi diversi (per popolare prezzi recenti del Prodotto A)
  await api(token, 'POST', '/fatture', {
    clienteId: cId, numero: `UIA-${tag}`, dataEmissione: '2026-01-01',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'Prodotto A', quantita: 1, prezzo: 11, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  await api(token, 'POST', '/fatture', {
    clienteId: cId, numero: `UIB-${tag}`, dataEmissione: '2026-02-01',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'Prodotto A', quantita: 1, prezzo: 12, sconto: 5, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  // 1 fattura per Prodotto B (per popolare prezzi recenti di B)
  await api(token, 'POST', '/fatture', {
    clienteId: cId, numero: `UIC-${tag}`, dataEmissione: '2026-02-15',
    righe: [{ prodottoId: prodB.data.id, descrizione: 'Prodotto B', quantita: 1, prezzo: 21, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });

  const target = await api(token, 'POST', '/fatture', {
    clienteId: cId, numero: `TARGET-${tag}`, dataEmissione: '2026-03-01',
    righe: [
      { prodottoId: prodA.data.id, descrizione: 'Prodotto A', quantita: 1, prezzo: 5, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' },
      { prodottoId: prodB.data.id, descrizione: 'Prodotto B', quantita: 1, prezzo: 7, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' },
    ],
  });
  if (!target.ok) throw new Error(`seed target: ${target.status} ${JSON.stringify(target.data)}`);
  pass(`seed OK (target=TARGET-${tag} id=${target.data.id})`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text();
      if (/devtools|sw\.js|service worker|favicon/i.test(t)) return;
      consoleErrors.push(t);
    }
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(BASE_URL);
  await page.evaluate(t => localStorage.setItem('ordeva_token', t), token);
  await page.goto(`${BASE_URL}/fatture`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  // ── TEST 1: lock attivo aprendo fattura salvata ──────────────────────
  console.log('\n══ Test 1: lock attivo aprendo fattura salvata ══');
  try {
    await openEditFromKebab(page, `TARGET-${tag}`);
  } catch (e) {
    fail('test1:open-dialog', e.message);
    await page.screenshot({ path: '/tmp/ui-debug-1.png' });
    await browser.close();
    process.exit(1);
  }
  const dlg = page.locator('mat-dialog-container').last();
  if (!await dlg.isVisible().catch(() => false)) {
    fail('test1:dialog-visible', 'Dialog non visibile');
  } else {
    pass('test1:dialog aperto');

    // chip "Bloccato"
    const chipCount = await dlg.locator('.dialog-lock-chip').count();
    if (chipCount === 0) fail('test1:chip', 'Chip "Bloccato" non trovato');
    else pass('test1:chip "Bloccato" presente');

    // lucchetto
    const lockBtn = dlg.locator('.dialog-lock-btn');
    if (await lockBtn.count() === 0) fail('test1:lock-btn', 'Pulsante lucchetto mancante');
    else pass('test1:pulsante lucchetto presente');

    // icon = lock
    const iconText = (await dlg.locator('.dialog-lock-btn mat-icon').textContent().catch(() => '')).trim();
    if (iconText !== 'lock') fail('test1:icon', `Icona = "${iconText}" (atteso "lock")`);
    else pass('test1:icona "lock"');

    // Salva disabilitato
    const salva = page.locator('mat-dialog-actions button:has-text("Salva")').last();
    const dis = await salva.getAttribute('disabled');
    if (dis === null) fail('test1:save-disabled', 'Salva NON è disabled mentre il doc è bloccato');
    else pass('test1:Salva disabilitato');

    // Click su input → snackbar
    const inputs = dlg.locator('input:not([type="checkbox"]):not([type="hidden"])');
    if (await inputs.count() > 0) {
      await inputs.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      const snack = page.locator('simple-snack-bar, mat-snack-bar-container, .mat-mdc-snack-bar-container');
      if (await snack.count() === 0) warn('test1:snackbar', 'Snackbar non appare al click su campo bloccato');
      else pass('test1:snackbar appare');
    }

    // ── TEST 2: unlock ────────────────────────────────────────────────
    console.log('\n══ Test 2: unlock ══');
    await lockBtn.click();
    await page.waitForTimeout(400);

    if (await dlg.locator('.dialog-lock-chip').count() > 0) fail('test2:chip-removed', 'Chip ancora presente dopo unlock');
    else pass('test2:chip rimosso');

    const iconAfter = (await dlg.locator('.dialog-lock-btn mat-icon').textContent().catch(() => '')).trim();
    if (iconAfter !== 'lock_open') fail('test2:icon-open', `Icona = "${iconAfter}" (atteso "lock_open")`);
    else pass('test2:icona "lock_open"');

    const salvaAfter = await page.locator('mat-dialog-actions button:has-text("Salva")').last().getAttribute('disabled');
    if (salvaAfter !== null) fail('test2:save-enabled', 'Salva ancora disabled dopo unlock');
    else pass('test2:Salva abilitato');

    // ── TEST 3: prezzi recenti - regressione shadowing $index ─────────
    console.log('\n══ Test 3: prezzi recenti ══');
    const histBtns = dlg.locator('button[title*="Prezzi recenti"]');
    const histCount = await histBtns.count();
    if (histCount < 2) {
      warn('test3:hist-buttons', `Bottoni history < 2 (trovati ${histCount}); test skippato (manca prezzo recente per uno dei prodotti)`);
    } else {
      // Capisco le righe del documento
      const rows = dlg.locator('tbody tr').filter({ hasNot: page.locator('.riga-nota') });
      const r1Inputs = rows.nth(0).locator('input[type="number"]');
      const r2Inputs = rows.nth(1).locator('input[type="number"]');
      // Prezzo (la 2ª colonna numerica è prezzo? Nelle template: q.ta, prezzo, ...)
      // Per sicurezza, leggo il valore di tutti gli input numerici della riga
      const dumpRow = async (row, label) => {
        const ins = row.locator('input[type="number"]');
        const n = await ins.count();
        const vals = [];
        for (let i = 0; i < n; i++) vals.push(await ins.nth(i).inputValue().catch(() => ''));
        console.log(`  ${label}: ${vals.join(' | ')}`);
        return vals;
      };
      const beforeR1 = await dumpRow(rows.nth(0), 'r1 prima');
      const beforeR2 = await dumpRow(rows.nth(1), 'r2 prima');

      // Clicca history su riga 2 (Prodotto B)
      await histBtns.nth(1).click();
      await page.waitForTimeout(500);
      const items = page.locator('.mat-mdc-menu-panel button[mat-menu-item]');
      const itemCount = await items.count();
      console.log(`  menu items: ${itemCount}`);
      if (itemCount === 0) {
        warn('test3:no-items', 'Menu prezzi recenti riga 2 vuoto');
        await page.keyboard.press('Escape');
      } else {
        // Preferisco l'ultimo item, che è il più "vecchio" e quindi probabilmente diverso dal prezzo corrente
        await items.last().click();
        await page.waitForTimeout(500);
        const afterR1 = await dumpRow(rows.nth(0), 'r1 dopo');
        const afterR2 = await dumpRow(rows.nth(1), 'r2 dopo');

        // Confronto: r1 deve essere uguale
        if (JSON.stringify(beforeR1) !== JSON.stringify(afterR1)) {
          fail('test3:wrong-row-changed',
            `Cliccando menu r2, è cambiato r1! before=${beforeR1.join('|')} after=${afterR1.join('|')} — BUG SHADOWING $index regredito`);
        } else {
          pass('test3:r1 invariata dopo click menu r2');
        }
        if (JSON.stringify(beforeR2) === JSON.stringify(afterR2)) {
          warn('test3:r2-unchanged', `r2 non è cambiata; menu item potrebbe non aver fatto nulla`);
        } else {
          pass(`test3:r2 cambiata correttamente`);
        }
      }
    }

    // ── TEST 4: Info dialog ─────────────────────────────────────────
    console.log('\n══ Test 4: DocInfo dialog ══');
    // chiudo dialog edit
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
    if (await dlg.isVisible().catch(() => false)) {
      await page.locator('mat-dialog-actions button:has-text("Annulla")').last().click().catch(() => {});
      await page.waitForTimeout(400);
    }

    // Apri kebab → Info
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(150);
    const row2 = page.locator('tr', { hasText: `TARGET-${tag}` }).first();
    await row2.locator('button[title="Azioni"]').first().click();
    await page.waitForTimeout(300);
    const infoItem = page.locator('button[mat-menu-item]:has-text("Info"), button[mat-menu-item]:has-text("Scheda")').first();
    if (await infoItem.count() === 0) {
      warn('test4:info-item', 'Voce Info/Scheda non trovata nel kebab');
    } else {
      await infoItem.click();
      await page.waitForTimeout(500);
      const infoDlg = page.locator('mat-dialog-container').last();
      const hasNetto = await infoDlg.locator('th:has-text("Imponibile")').count();
      const hasIvato = await infoDlg.locator('th:has-text("Ivato")').count();
      const hasIva = await infoDlg.locator('th:has-text("IVA")').count();
      if (hasNetto === 0) fail('test4:col-imponibile', 'Colonna Imponibile mancante');
      else pass('test4:col Imponibile presente');
      if (hasIvato === 0) fail('test4:col-ivato', 'Colonna Ivato mancante');
      else pass('test4:col Ivato presente');
      if (hasIva === 0) warn('test4:col-iva', 'Colonna IVA mancante');
      else pass('test4:col IVA presente');

      const hasRiep = await infoDlg.locator(':text("RIEPILOGO IMPORTI")').count();
      if (hasRiep === 0) warn('test4:riepilogo', 'Card "RIEPILOGO IMPORTI" mancante');
      else pass('test4:card riepilogo presente');

      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  // ── TEST 5: Settings toggle lock ──────────────────────────────────
  console.log('\n══ Test 5: Settings toggle lock ══');
  await page.goto(`${BASE_URL}/impostazioni`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.locator('div[role="tab"]:has-text("Avanzate")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  const toggle = page.locator('mat-slide-toggle:has-text("Blocca i documenti salvati")');
  if (await toggle.count() === 0) fail('test5:toggle', 'Toggle "Blocca i documenti salvati" non trovato nel tab Avanzate');
  else pass('test5:toggle presente nel tab Avanzate');

  // ── TEST 6: Lifecycle magazzino — fattura scala, cancellazione reintegra ──
  console.log('\n══ Test 6: lifecycle magazzino ══');
  const qtaPrima = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
  console.log(`  Prodotto A qta iniziale: ${qtaPrima}`);
  const fLife = await api(token, 'POST', '/fatture', {
    clienteId: cId, numero: `LIFE-${tag}`, dataEmissione: '2026-03-15',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'Prodotto A', quantita: 3, prezzo: 10, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  if (!fLife.ok) fail('test6:create', `POST fattura: ${fLife.status} ${JSON.stringify(fLife.data).slice(0,200)}`);
  else {
    const qtaDopoFatt = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
    console.log(`  Qta dopo fatt (+3 scaricati): ${qtaDopoFatt}`);
    if (qtaDopoFatt === qtaPrima - 3) pass('test6:scarico magazzino su POST fattura');
    else fail('test6:scarico-no', `Qta non scalata: ${qtaPrima} → ${qtaDopoFatt} (atteso ${qtaPrima - 3})`);

    // Cancella
    const del = await api(token, 'DELETE', `/fatture/${fLife.data.id}`);
    if (!del.ok) warn('test6:delete', `DELETE fattura: ${del.status} ${JSON.stringify(del.data).slice(0,200)}`);
    else {
      const qtaDopoDel = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
      console.log(`  Qta dopo delete (+3 reintegrati): ${qtaDopoDel}`);
      if (qtaDopoDel === qtaPrima) pass('test6:reintegro magazzino su DELETE fattura');
      else fail('test6:reintegro-no', `Qta non reintegrata: ${qtaDopoFatt} → ${qtaDopoDel} (atteso ${qtaPrima})`);
    }
  }

  // ── TEST 6b: Duplica fattura scala di nuovo magazzino ──
  console.log('\n══ Test 6b: duplica fattura scala magazzino ══');
  const qta6b0 = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
  const fDup = await api(token, 'POST', '/fatture', {
    clienteId: cId, numero: `DUP-${tag}`, dataEmissione: '2026-03-16',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'Prodotto A', quantita: 2, prezzo: 10, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  if (!fDup.ok) { warn('test6b:create', `${fDup.status}`); }
  else {
    const qta6b1 = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
    if (qta6b1 !== qta6b0 - 2) warn('test6b:scarico', `${qta6b0} → ${qta6b1} (atteso ${qta6b0 - 2})`);
    const full = (await api(token, 'GET', `/fatture/${fDup.data.id}`)).data;
    // Simula duplicazione: stessa righe ma nuovo numero
    const dup = await api(token, 'POST', '/fatture', {
      clienteId: cId, numero: `DUP2-${tag}`, dataEmissione: '2026-03-17',
      righe: full.righe.map(r => ({ ...r, id: undefined })),
    });
    if (!dup.ok) fail('test6b:dup', `POST duplica fattura: ${dup.status}`);
    else {
      const qta6b2 = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
      if (qta6b2 === qta6b1 - 2) pass('test6b:duplica fattura scarica magazzino');
      else fail('test6b:dup-scarico-no', `Qta dopo duplica = ${qta6b2} (atteso ${qta6b1 - 2})`);
    }
  }

  // ── TEST 7: Nota di credito reintegra magazzino ──
  console.log('\n══ Test 7: nota di credito reintegra ══');
  const qtaPre = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
  const fNc = await api(token, 'POST', '/fatture', {
    clienteId: cId, numero: `NC-${tag}`, dataEmissione: '2026-03-20',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'A', quantita: 2, prezzo: 10, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  if (!fNc.ok) warn('test7:create-fatt', `${fNc.status}`);
  else {
    const qtaDopoFat = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
    if (qtaDopoFat !== qtaPre - 2) warn('test7:scarico-pre', `Qta ${qtaDopoFat} (atteso ${qtaPre - 2})`);
    const nc = await api(token, 'POST', '/note-credito', {
      clienteId: cId, numero: `NC1-${tag}`, dataEmissione: '2026-03-21', fatturaId: fNc.data.id,
      righe: [{ prodottoId: prodA.data.id, descrizione: 'A', quantita: 2, prezzo: 10, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
    });
    if (!nc.ok) fail('test7:create-nc', `POST nota credito: ${nc.status} ${JSON.stringify(nc.data).slice(0,200)}`);
    else {
      const qtaDopoNc = (await api(token, 'GET', `/prodotti/${prodA.data.id}`)).data?.quantita;
      if (qtaDopoNc === qtaPre) pass(`test7:nota di credito reintegra magazzino (${qtaDopoFat} → ${qtaDopoNc})`);
      else fail('test7:no-reintegro', `Qta dopo NC = ${qtaDopoNc} (atteso ${qtaPre})`);
    }
  }

  // ── TEST 8: Lock applicato anche su altri tipi di documento (DDT, preventivo) ──
  console.log('\n══ Test 8: lock su DDT e preventivo ══');
  const dDdt = await api(token, 'POST', '/ddt', {
    clienteId: cId, numero: `DDTL-${tag}`, dataEmissione: '2026-03-22',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'A', quantita: 1, prezzo: 5, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  if (!dDdt.ok) { warn('test8:create-ddt', `${dDdt.status}`); }
  else {
    await page.goto(`${BASE_URL}/ddt`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    try {
      await openEditFromKebab(page, `DDTL-${tag}`);
      const dlg2 = page.locator('mat-dialog-container').last();
      const chip = await dlg2.locator('.dialog-lock-chip').count();
      if (chip === 0) fail('test8:ddt-chip', 'Chip "Bloccato" assente su DDT salvato');
      else pass('test8:DDT chip lock presente');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) {
      fail('test8:ddt-open', e.message);
    }
  }

  const dPre = await api(token, 'POST', '/preventivi', {
    clienteId: cId, numero: `PREL-${tag}`, dataEmissione: '2026-03-22',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'A', quantita: 1, prezzo: 5, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  if (!dPre.ok) { warn('test8:create-pre', `${dPre.status}`); }
  else {
    await page.goto(`${BASE_URL}/preventivi`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    try {
      await openEditFromKebab(page, `PREL-${tag}`);
      const dlg3 = page.locator('mat-dialog-container').last();
      const chip = await dlg3.locator('.dialog-lock-chip').count();
      if (chip === 0) fail('test8:pre-chip', 'Chip "Bloccato" assente su preventivo salvato');
      else pass('test8:Preventivo chip lock presente');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) {
      fail('test8:pre-open', e.message);
    }
  }

  // Note credito, ordini, acquisti
  const dNcL = await api(token, 'POST', '/note-credito', {
    clienteId: cId, numero: `NCL-${tag}`, dataEmissione: '2026-03-22',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'A', quantita: 1, prezzo: 5, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  if (dNcL.ok) {
    await page.goto(`${BASE_URL}/note-credito`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    try {
      await openEditFromKebab(page, `NCL-${tag}`);
      const dlgN = page.locator('mat-dialog-container').last();
      const chip = await dlgN.locator('.dialog-lock-chip').count();
      if (chip === 0) fail('test8:nc-chip', 'Chip "Bloccato" assente su nota credito');
      else pass('test8:NC chip lock presente');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) { warn('test8:nc-open', e.message); }
  }

  const dOrd = await api(token, 'POST', '/ordini', {
    clienteId: cId, numero: `ORDL-${tag}`, dataOrdine: '2026-03-22', tipo: 'CLIENTE',
    righe: [{ prodottoId: prodA.data.id, descrizione: 'A', quantita: 1, prezzo: 5, sconto: 0, iva: 22, unitaMisura: 'pz', tipo: 'PRODOTTO' }],
  });
  if (dOrd.ok) {
    await page.goto(`${BASE_URL}/ordini`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    try {
      await openEditFromKebab(page, `ORDL-${tag}`);
      const dlgO = page.locator('mat-dialog-container').last();
      const chip = await dlgO.locator('.dialog-lock-chip').count();
      if (chip === 0) fail('test8:ord-chip', 'Chip "Bloccato" assente su ordine');
      else pass('test8:Ordine chip lock presente');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) { warn('test8:ord-open', e.message); }
  }

  // ── TEST 9: Disabilita lock da Settings → documento NON è bloccato ──
  console.log('\n══ Test 9: disabilita lock da settings → no chip ══');
  await page.goto(`${BASE_URL}/impostazioni`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700);
  await page.locator('div[role="tab"]:has-text("Avanzate")').first().click().catch(() => {});
  await page.waitForTimeout(400);
  const toggleSlide = page.locator('mat-slide-toggle:has-text("Blocca i documenti salvati")').first();
  // controlla stato
  const isChecked = await toggleSlide.evaluate(el => {
    return el.classList.contains('mat-mdc-slide-toggle-checked');
  }).catch(() => true);
  console.log(`  toggle checked: ${isChecked}`);
  // se è ON, lo metto OFF
  if (isChecked) {
    await toggleSlide.click();
    await page.waitForTimeout(300);
    // Salva
    const saveBtn = page.locator('button:has-text("Salva")').first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(600);
    }
    // Riapri una fattura
    await page.goto(`${BASE_URL}/fatture`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    try {
      await openEditFromKebab(page, `TARGET-${tag}`);
      const dlgT = page.locator('mat-dialog-container').last();
      const chip = await dlgT.locator('.dialog-lock-chip').count();
      if (chip > 0) fail('test9:chip-shown', 'Chip "Bloccato" presente nonostante toggle OFF');
      else pass('test9:lock disattivato → no chip in dialog');
      // Il pulsante lucchetto è sempre presente: con lock OFF apre sbloccato,
      // ma l'utente può comunque bloccare manualmente. Non lo segnalo come issue.
      const lockBtnCount = await dlgT.locator('.dialog-lock-btn').count();
      if (lockBtnCount > 0) pass('test9:pulsante lucchetto disponibile per blocco manuale');
      const salvaState = await page.locator('mat-dialog-actions button:has-text("Salva")').last().getAttribute('disabled');
      if (salvaState !== null) fail('test9:save-disabled', 'Salva disabled con lock OFF');
      else pass('test9:Salva abilitato con lock OFF');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) {
      fail('test9:open', e.message);
    }
  }

  // ── TEST 10: Riattiva il lock prima di chiudere (per non lasciare stato sporco) ──
  console.log('\n══ Test 10: ripristina lock ON ══');
  await page.goto(`${BASE_URL}/impostazioni`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700);
  await page.locator('div[role="tab"]:has-text("Avanzate")').first().click().catch(() => {});
  await page.waitForTimeout(400);
  const toggle10 = page.locator('mat-slide-toggle:has-text("Blocca i documenti salvati")').first();
  const checked10 = await toggle10.evaluate(el => el.classList.contains('mat-mdc-slide-toggle-checked')).catch(() => true);
  if (!checked10) {
    await toggle10.click();
    await page.waitForTimeout(300);
    const saveBtn = page.locator('button:has-text("Salva")').first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(500);
    }
    pass('test10:lock riattivato in settings');
  } else {
    pass('test10:lock già attivo');
  }

  // ── Screenshot dell'info dialog migliorato ──
  console.log('\n══ Screenshot info dialog ══');
  try {
    await page.goto(`${BASE_URL}/fatture`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    const row = page.locator('tr', { hasText: `TARGET-${tag}` }).first();
    await row.locator('button[title="Azioni"]').first().click();
    await page.waitForTimeout(300);
    const info = page.locator('button[mat-menu-item]:has-text("Info"), button[mat-menu-item]:has-text("Scheda")').first();
    if (await info.count() > 0) {
      await info.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: '/tmp/info-dialog-after.png', fullPage: false });
      console.log('  → screenshot /tmp/info-dialog-after.png');
    }
  } catch (e) { console.log('  ⚠ Screenshot fallito:', e.message); }

  await browser.close();

  // Filtra rumore prevedibile (es. 404 noti, devtools)
  const realErrors = consoleErrors.filter(e =>
    !/HMR|devtools|Failed to fetch \w+\.js\.map|sourcemap|favicon|service worker|sw\.js/i.test(e)
  );
  if (realErrors.length > 0) {
    console.log('\n══ CONSOLE ERRORS DURANTE I TEST ══');
    realErrors.slice(0, 20).forEach(e => console.log(`  ✗ ${e.slice(0, 250)}`));
    realErrors.forEach(e => warn('console-error', e.slice(0, 200)));
  } else {
    pass('console:nessun errore rilevato nei test interattivi');
  }

  console.log(`\n══ RESULT ══`);
  console.log(`  ✓ Pass: ${ok.length}`);
  console.log(`  ⚠ Warn: ${warns.length}`);
  console.log(`  ✗ Fail: ${issues.length}`);
  if (issues.length) {
    console.log('\nFAIL:');
    issues.forEach(i => console.log(`  ✗ [${i.test}] ${i.detail}`));
  }
  if (warns.length) {
    console.log('\nWARN:');
    warns.forEach(w => console.log(`  ⚠ [${w.test}] ${w.detail}`));
  }
  process.exit(issues.length > 0 ? 1 : 0);
})().catch(err => {
  console.error('✗ Errore audit:', err.message);
  console.error(err.stack);
  process.exit(2);
});
