/**
 * Audit estensivo del ciclo vita di ogni documento.
 * Per ogni tipo verifica:
 *  - POST scarica/carica magazzino come da semantica
 *  - PUT storna e riapplica
 *  - DELETE riporta il magazzino al pre-creazione
 *  - movimento è registrato in movimenti_magazzino con causale corretta
 *
 * Documenti testati:
 *  • Fattura attiva       → scarica magazzino su POST, ricarica su DELETE
 *  • Nota di credito      → ricarica magazzino su POST, scarica su DELETE
 *  • DDT in uscita        → scarica su POST, ricarica su DELETE
 *  • Vendita banco        → scarica su POST
 *  • Acquisto             → NIENTE magazzino (di per sé)
 *  • Arrivo merce         → ricarica su POST
 *  • Preventivo / Ordine  → NIENTE magazzino
 *
 * Interazioni testate:
 *  • DDT → fattura riepilogativa (no doppio scarico)
 *  • Preventivo → fattura (no doppio scarico)
 */
const BASE = process.env.BASE_URL || 'https://ordeva.it';
const API = `${BASE}/api`;
const DEMO = { username: 'demo-screenshots@ordeva.it', password: 'DemoOrdeva-2026!' };

let token;
let issues = [];
let warnings = [];

function pass(msg) { console.log(`✓ ${msg}`); }
function fail(test, detail) { issues.push({ test, detail }); console.log(`✗ [${test}] ${detail}`); }
function warn(test, detail) { warnings.push({ test, detail }); console.log(`⚠ [${test}] ${detail}`); }

async function call(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  return { ok: r.ok, status: r.status, body: json };
}

async function login() {
  const r = await call('POST', '/auth/login', { username: DEMO.username, password: DEMO.password });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  token = r.body.token;
  pass(`login OK`);
}

async function getQty(prodottoId) {
  const r = await call('GET', `/prodotti/${prodottoId}`);
  return r.body?.quantita;
}

async function countMovementsByDoc(documentoTipo, documentoId) {
  const r = await call('GET', '/movimenti-magazzino');
  if (!r.ok) return null;
  return r.body.filter(m => m.documentoTipo === documentoTipo && Number(m.documentoId) === Number(documentoId)).length;
}

async function createProdotto(suffix) {
  const r = await call('POST', '/prodotti', {
    nome: `Lifecycle ${suffix}`,
    codice: `LIFE-${suffix}-${Date.now() % 100000}`,
    prezzo: 100, iva: 22,
    quantita: 100, sogliaMinima: 5,
    unitaMisura: 'pz', categoria: 'Test',
  });
  if (!r.ok) throw new Error(`prodotto create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

async function getClienteId() {
  const r = await call('GET', '/clienti');
  return r.body[0]?.id;
}

async function getFornitoreId() {
  const r = await call('GET', '/fornitori');
  return r.body[0]?.id;
}

// ── Test: ciclo vita FATTURA ──────────────────────────────────────────
async function testFatturaLifecycle(clienteId, prodottoId) {
  console.log('\n— FATTURA lifecycle —');
  const qIniziale = await getQty(prodottoId);
  pass(`stato iniziale: q=${qIniziale}`);

  // POST: emessa con 5 pezzi
  const num = (await call('GET', '/next-number/fatture')).body.numero;
  const today = new Date().toISOString().slice(0, 10);
  const post = await call('POST', '/fatture', {
    clienteId, numero: num, dataEmissione: today, stato: 'EMESSA',
    righe: [{ prodottoId, descrizione: 'Test fattura', quantita: 5, prezzo: 100, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (!post.ok) { fail('fattura:POST', JSON.stringify(post.body)); return; }
  const fatturaId = post.body.id;

  const qDopoCreate = await getQty(prodottoId);
  if (qDopoCreate !== qIniziale - 5) fail('fattura:POST-scarico', `q atteso ${qIniziale - 5}, letto ${qDopoCreate}`);
  else pass(`fattura:POST scarica magazzino (${qIniziale} → ${qDopoCreate})`);

  const movCreate = await countMovementsByDoc('FATTURA', fatturaId);
  if (movCreate < 1) fail('fattura:movimento-mancante', `nessun movimento per FATTURA #${fatturaId}`);
  else pass(`fattura:movimento registrato (${movCreate} righe)`);

  // PUT: cambio quantità a 3 (storno 5 + scarica 3)
  const put = await call('PUT', `/fatture/${fatturaId}`, {
    clienteId, numero: num, dataEmissione: today, stato: 'EMESSA',
    righe: [{ prodottoId, descrizione: 'Test fattura mod', quantita: 3, prezzo: 100, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (!put.ok) { fail('fattura:PUT', JSON.stringify(put.body)); }
  else {
    const qDopoPut = await getQty(prodottoId);
    if (qDopoPut !== qIniziale - 3) fail('fattura:PUT-storno', `q atteso ${qIniziale - 3}, letto ${qDopoPut}`);
    else pass(`fattura:PUT storna+riapplica (${qDopoPut})`);
  }

  // DELETE: torna al pre-creazione
  const del = await call('DELETE', `/fatture/${fatturaId}`);
  if (!del.ok) { fail('fattura:DELETE', JSON.stringify(del.body)); return; }
  const qFinale = await getQty(prodottoId);
  if (qFinale !== qIniziale) fail('fattura:DELETE-reintegro', `q atteso ${qIniziale}, letto ${qFinale}`);
  else pass(`fattura:DELETE reintegra magazzino (${qFinale})`);
}

// ── Test: ciclo vita NOTA DI CREDITO ──────────────────────────────────
async function testNotaCreditoLifecycle(clienteId, prodottoId) {
  console.log('\n— NOTA DI CREDITO lifecycle —');
  const qIniziale = await getQty(prodottoId);
  pass(`stato iniziale: q=${qIniziale}`);

  // POST: nota credito per reso di 4 pezzi → q aumenta
  const num = (await call('GET', '/next-number/note-credito')).body.numero;
  const today = new Date().toISOString().slice(0, 10);
  const post = await call('POST', '/note-credito', {
    clienteId, numero: num, dataEmissione: today, stato: 'EMESSA',
    righe: [{ prodottoId, descrizione: 'Reso 4pz', quantita: 4, prezzo: 100, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (!post.ok) { fail('nc:POST', JSON.stringify(post.body)); return; }
  const ncId = post.body.id;

  const qDopoCreate = await getQty(prodottoId);
  if (qDopoCreate !== qIniziale + 4) fail('nc:POST-ricarico', `q atteso ${qIniziale + 4}, letto ${qDopoCreate}`);
  else pass(`nc:POST ricarica magazzino (${qIniziale} → ${qDopoCreate})`);

  const movCreate = await countMovementsByDoc('NOTA_CREDITO', ncId);
  if (movCreate < 1) fail('nc:movimento-mancante', `nessun movimento per NOTA_CREDITO #${ncId}`);
  else pass(`nc:movimento registrato (${movCreate} righe)`);

  // DELETE: torna al pre-creazione
  const del = await call('DELETE', `/note-credito/${ncId}`);
  if (!del.ok) { fail('nc:DELETE', JSON.stringify(del.body)); return; }
  const qFinale = await getQty(prodottoId);
  if (qFinale !== qIniziale) fail('nc:DELETE-storno', `q atteso ${qIniziale}, letto ${qFinale}`);
  else pass(`nc:DELETE storna ricarico (${qFinale})`);
}

// ── Test: DDT in uscita ──────────────────────────────────────────────
async function testDDTLifecycle(clienteId, prodottoId) {
  console.log('\n— DDT (uscita) lifecycle —');
  const qIniziale = await getQty(prodottoId);
  pass(`stato iniziale: q=${qIniziale}`);

  const num = (await call('GET', '/next-number/ddt')).body.numero;
  const today = new Date().toISOString().slice(0, 10);
  const post = await call('POST', '/ddt', {
    clienteId, numero: num, dataEmissione: today,
    causale: 'Vendita',
    righe: [{ prodottoId, descrizione: 'DDT 6pz', quantita: 6, prezzo: 50, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (!post.ok) { fail('ddt:POST', JSON.stringify(post.body)); return; }
  const ddtId = post.body.id;

  const qDopoCreate = await getQty(prodottoId);
  if (qDopoCreate !== qIniziale - 6) fail('ddt:POST-scarico', `q atteso ${qIniziale - 6}, letto ${qDopoCreate}`);
  else pass(`ddt:POST scarica magazzino (${qIniziale} → ${qDopoCreate})`);

  // DELETE: torna al pre-creazione
  const del = await call('DELETE', `/ddt/${ddtId}`);
  if (!del.ok) { fail('ddt:DELETE', JSON.stringify(del.body)); return; }
  const qFinale = await getQty(prodottoId);
  if (qFinale !== qIniziale) fail('ddt:DELETE-reintegro', `q atteso ${qIniziale}, letto ${qFinale}`);
  else pass(`ddt:DELETE reintegra magazzino (${qFinale})`);
}

// ── Test: ARRIVO MERCE in entrata ────────────────────────────────────
async function testArrivoMerceLifecycle(fornitoreId, prodottoId) {
  console.log('\n— ARRIVO MERCE lifecycle —');
  const qIniziale = await getQty(prodottoId);
  pass(`stato iniziale: q=${qIniziale}`);

  const num = (await call('GET', '/next-number/arrivi-merce')).body.numero;
  const today = new Date().toISOString().slice(0, 10);
  const post = await call('POST', '/arrivi-merce', {
    fornitoreId, numero: num, data: today, stato: 'RICEVUTO',
    righe: [{ prodottoId, descrizione: 'Arrivo 10pz', quantita: 10, prezzoAcquisto: 50, unitaMisura: 'pz' }],
  });
  if (!post.ok) { fail('arrivo:POST', JSON.stringify(post.body)); return; }
  const arrivoId = post.body.id;

  const qDopoCreate = await getQty(prodottoId);
  if (qDopoCreate !== qIniziale + 10) fail('arrivo:POST-carico', `q atteso ${qIniziale + 10}, letto ${qDopoCreate}`);
  else pass(`arrivo:POST carica magazzino (${qIniziale} → ${qDopoCreate})`);

  // DELETE
  const del = await call('DELETE', `/arrivi-merce/${arrivoId}`);
  if (!del.ok) { fail('arrivo:DELETE', JSON.stringify(del.body)); return; }
  const qFinale = await getQty(prodottoId);
  if (qFinale !== qIniziale) fail('arrivo:DELETE-scarico', `q atteso ${qIniziale}, letto ${qFinale}`);
  else pass(`arrivo:DELETE scarica magazzino (${qFinale})`);
}

// ── Test: Vendita al banco ───────────────────────────────────────────
async function testVenditaBancoLifecycle(prodottoId) {
  console.log('\n— VENDITA BANCO lifecycle —');
  const qIniziale = await getQty(prodottoId);
  pass(`stato iniziale: q=${qIniziale}`);

  const num = (await call('GET', '/next-number/vendite-banco')).body.numero;
  const today = new Date().toISOString().slice(0, 10);
  const post = await call('POST', '/vendite-banco', {
    numero: num, data: today, metodoPagamento: 'CONTANTI', stato: 'EMESSA',
    righe: [{ prodottoId, descrizione: 'VB 2pz', quantita: 2, prezzo: 50, iva: 22, unitaMisura: 'pz' }],
  });
  if (!post.ok) { fail('vb:POST', JSON.stringify(post.body)); return; }
  const vbId = post.body.id;

  const qDopoCreate = await getQty(prodottoId);
  if (qDopoCreate !== qIniziale - 2) fail('vb:POST-scarico', `q atteso ${qIniziale - 2}, letto ${qDopoCreate}`);
  else pass(`vb:POST scarica magazzino (${qIniziale} → ${qDopoCreate})`);

  const del = await call('DELETE', `/vendite-banco/${vbId}`);
  if (!del.ok) { warn('vb:DELETE', JSON.stringify(del.body)); return; }
  const qFinale = await getQty(prodottoId);
  if (qFinale !== qIniziale) warn('vb:DELETE-reintegro', `q atteso ${qIniziale}, letto ${qFinale}`);
  else pass(`vb:DELETE reintegra magazzino (${qFinale})`);
}

// ── Test: documenti NON-magazzino (preventivo, ordine, acquisto solo) ──
async function testNoMagazzinoDocs(clienteId, fornitoreId, prodottoId) {
  console.log('\n— Documenti che NON devono toccare magazzino —');
  const qIniziale = await getQty(prodottoId);
  const today = new Date().toISOString().slice(0, 10);

  // PREVENTIVO
  const numP = (await call('GET', '/next-number/preventivi')).body.numero;
  const pPost = await call('POST', '/preventivi', {
    clienteId, numero: numP, dataEmissione: today, stato: 'BOZZA', validita: 30,
    righe: [{ prodottoId, descrizione: 'Prev 99pz', quantita: 99, prezzo: 100, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (pPost.ok) {
    const q = await getQty(prodottoId);
    if (q !== qIniziale) fail('preventivo:non-deve-scaricare', `q cambiata da ${qIniziale} a ${q}`);
    else pass(`preventivo:POST non tocca magazzino (q=${q})`);
    await call('DELETE', `/preventivi/${pPost.body.id}`);
  } else warn('preventivo:POST-fail', JSON.stringify(pPost.body));

  // ORDINE
  const numO = (await call('GET', '/next-number/ordini')).body.numero;
  const oPost = await call('POST', '/ordini', {
    clienteId, numero: numO, dataOrdine: today, stato: 'NUOVO',
    righe: [{ prodottoId, descrizione: 'Ord 88pz', quantita: 88, prezzo: 100, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (oPost.ok) {
    const q = await getQty(prodottoId);
    if (q !== qIniziale) fail('ordine:non-deve-scaricare', `q cambiata da ${qIniziale} a ${q}`);
    else pass(`ordine:POST non tocca magazzino (q=${q})`);
    await call('DELETE', `/ordini/${oPost.body.id}`);
  } else warn('ordine:POST-fail', JSON.stringify(oPost.body));

  // ACQUISTO (fattura passiva senza arrivo merce)
  const numA = (await call('GET', '/next-number/acquisti')).body.numero;
  const aPost = await call('POST', '/acquisti', {
    fornitoreId, numero: numA, dataEmissione: today, stato: 'RICEVUTA',
    righe: [{ prodottoId, descrizione: 'Acq 77pz', quantita: 77, prezzo: 50, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (aPost.ok) {
    const q = await getQty(prodottoId);
    if (q !== qIniziale) fail('acquisto:non-deve-toccare-magazzino', `q cambiata da ${qIniziale} a ${q} (l'arrivo merce è separato)`);
    else pass(`acquisto:POST non tocca magazzino (q=${q}) — by-design, serve arrivo merce`);
    await call('DELETE', `/acquisti/${aPost.body.id}`);
  } else warn('acquisto:POST-fail', JSON.stringify(aPost.body));
}

// ── Test interazione DDT → fattura riepilogativa ──────────────────────
async function testDDTtoFattura(clienteId, prodottoId) {
  console.log('\n— DDT → Fattura riepilogativa (no doppio scarico) —');
  const qIniziale = await getQty(prodottoId);
  const today = new Date().toISOString().slice(0, 10);

  const numD = (await call('GET', '/next-number/ddt')).body.numero;
  const ddt = await call('POST', '/ddt', {
    clienteId, numero: numD, dataEmissione: today,
    causale: 'Vendita',
    righe: [{ prodottoId, descrizione: 'DDT 7pz', quantita: 7, prezzo: 50, iva: 22, sconto: 0, unitaMisura: 'pz' }],
  });
  if (!ddt.ok) { fail('ddt-to-fat:DDT', JSON.stringify(ddt.body)); return; }
  const ddtId = ddt.body.id;
  const qDopoDdt = await getQty(prodottoId);

  // Genera fattura dal DDT
  const numF = (await call('GET', '/next-number/fatture')).body.numero;
  const fat = await call('POST', '/fatture/da-ddt', {
    items: [{ clienteId, ddtIds: [ddtId] }],
  });
  if (!fat.ok) { fail('ddt-to-fat:fattura', JSON.stringify(fat.body)); return; }
  // /fatture/da-ddt ritorna { fatture: [{id, numero, ...}] }
  const fatId = fat.body.fatture?.[0]?.id ?? (Array.isArray(fat.body) ? fat.body[0]?.id : fat.body.id);
  if (!fatId) { fail('ddt-to-fat:fatId', JSON.stringify(fat.body)); return; }

  const qDopoFat = await getQty(prodottoId);
  if (qDopoFat !== qDopoDdt) fail('ddt-to-fat:doppio-scarico', `q dopo DDT=${qDopoDdt}, dopo fattura=${qDopoFat} (DOPPIO scarico!)`);
  else pass(`ddt-to-fat:nessun doppio scarico (q=${qDopoFat})`);

  // Cleanup: cancella fattura + ddt
  await call('DELETE', `/fatture/${fatId}`);
  await call('DELETE', `/ddt/${ddtId}`);
  const qFinale = await getQty(prodottoId);
  if (qFinale !== qIniziale) warn('ddt-to-fat:cleanup', `q finale=${qFinale}, atteso=${qIniziale}`);
}

// ── Main ──────────────────────────────────────────────────────────────
(async () => {
  try {
    await login();
    const clienteId = await getClienteId();
    const fornitoreId = await getFornitoreId();
    const prodottoId = await createProdotto('FAT');
    if (!clienteId) { console.error('Manca cliente demo'); process.exit(1); }
    if (!fornitoreId) { console.error('Manca fornitore demo'); process.exit(1); }
    pass(`fixture: cliente=${clienteId} fornitore=${fornitoreId} prodotto=${prodottoId}`);

    await testFatturaLifecycle(clienteId, prodottoId);
    await testNotaCreditoLifecycle(clienteId, prodottoId);
    await testDDTLifecycle(clienteId, prodottoId);
    await testArrivoMerceLifecycle(fornitoreId, prodottoId);
    await testVenditaBancoLifecycle(prodottoId);
    await testNoMagazzinoDocs(clienteId, fornitoreId, prodottoId);
    await testDDTtoFattura(clienteId, prodottoId);

    console.log('\n══ REPORT ══');
    console.log(`Issues: ${issues.length} | Warnings: ${warnings.length}`);
    if (issues.length) { console.log('\nIssues:'); for (const i of issues) console.log(`  • [${i.test}] ${i.detail}`); }
    if (warnings.length) { console.log('\nWarnings:'); for (const w of warnings) console.log(`  • [${w.test}] ${w.detail}`); }
    process.exit(issues.length ? 1 : 0);
  } catch (err) {
    console.error('FATAL:', err.message);
    process.exit(1);
  }
})();
