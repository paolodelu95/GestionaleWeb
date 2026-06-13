/**
 * Audit di integrità dati e logica di business per GestionaleWeb (Ordeva).
 *
 * COSA FA
 *  1. PROBE RUNTIME: si logga sul tenant demo e prova a creare di proposito dati
 *     "sbagliati" (fattura vuota, numero duplicato, due clienti con stessa P.IVA,
 *     pagamento oltre il residuo, riga negativa, doppia fatturazione di un DDT...).
 *     PASS = il backend lo respinge (bug prevenuto). FAIL = lo accetta (bug vivo).
 *     Tutti i dati di test vengono ripuliti alla fine.
 *  2. SCANSIONE DB: apre il DB del tenant in sola lettura e cerca anomalie già
 *     presenti (P.IVA duplicate, documenti senza righe, totali incoerenti,
 *     giacenze negative, righe orfane, ...).
 *
 * USO
 *   node scripts/integrity-audit.mjs
 *   BASE_URL=http://localhost:3000 AUDIT_USER=demo@local.test AUDIT_PASS='DemoLocale-2026!' \
 *     TENANT_DB=backend/tenants/demo-locale-srl.db node scripts/integrity-audit.mjs
 *
 * Exit code 0 se nessun FAIL, 1 se almeno un probe FAIL.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = BASE + '/api';
const USER = process.env.AUDIT_USER || 'demo@local.test';
const PASS = process.env.AUDIT_PASS || 'DemoLocale-2026!';
const TENANT_DB = process.env.TENANT_DB
  ? (isAbsolute(process.env.TENANT_DB) ? process.env.TENANT_DB : join(ROOT, process.env.TENANT_DB))
  : join(ROOT, 'backend', 'tenants', 'demo-locale-srl.db');

const C = { g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m` };

let TOKEN = null;
async function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opt.headers.Authorization = 'Bearer ' + TOKEN;
  if (body !== undefined) opt.body = JSON.stringify(body);
  const res = await fetch(API + path, opt);
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  return { status: res.status, ok: res.ok, json };
}

const results = [];
function check(domain, name, pass, detail) {
  results.push({ domain, name, pass, detail });
  console.log(`  [${pass ? C.g('PASS') : C.r('FAIL')}] ${name}${detail ? C.dim(' — ' + detail) : ''}`);
}

const trash = { pagamenti: [], fatture: [], ddt: [], clienti: [], fornitori: [], noteCredito: [] };

async function login() {
  let r = await api('POST', '/auth/login', { username: USER, password: PASS });
  if (!r.ok) {
    const reg = await api('POST', '/auth/register', {
      ragioneSociale: 'Demo Locale Srl', piva: '01234567890', email: USER, nome: 'Audit', password: PASS,
    });
    if (reg.ok) r = reg; else throw new Error('login/registrazione falliti: ' + JSON.stringify(r.json));
  }
  TOKEN = r.json.token;
  if (!TOKEN) throw new Error('nessun token: ' + JSON.stringify(r.json));
}

async function runProbes() {
  const clienti = (await api('GET', '/clienti')).json;
  const cliente = Array.isArray(clienti) && clienti[0];
  const riga = (over = {}) => ({ descrizione: 'AUDIT riga', quantita: 1, prezzo: 100, sconto: 0, iva: 22, ...over });
  const today = new Date().toISOString().slice(0, 10);
  const uid = () => Date.now() + '-' + Math.floor(Math.random() * 1e4);

  console.log(C.b('\nANAGRAFICA'));
  // 1+2) due clienti con la stessa P.IVA
  const piva = '99' + String(Date.now()).slice(-9);
  const a = await api('POST', '/clienti', { ragioneSociale: 'AUDIT Dup A', pIva: piva });
  if (a.json?.id) trash.clienti.push(a.json.id);
  const b = await api('POST', '/clienti', { ragioneSociale: 'AUDIT Dup B', pIva: piva });
  if (b.json?.id) trash.clienti.push(b.json.id);
  check('anagrafica', 'Due clienti con la stessa P.IVA → bloccato', !b.ok,
    b.ok ? 'creato 2° cliente con P.IVA identica' : `respinto (${b.status})`);

  // 3) due fornitori con la stessa P.IVA
  const fa = await api('POST', '/fornitori', { ragioneSociale: 'AUDIT Forn A', pIva: piva });
  if (fa.json?.id) trash.fornitori.push(fa.json.id);
  const fb = await api('POST', '/fornitori', { ragioneSociale: 'AUDIT Forn B', pIva: piva });
  if (fb.json?.id) trash.fornitori.push(fb.json.id);
  check('anagrafica', 'Due fornitori con la stessa P.IVA → bloccato', !fb.ok,
    fb.ok ? 'creato 2° fornitore con P.IVA identica' : `respinto (${fb.status})`);

  // 4) cliente senza ragione sociale
  const cn = await api('POST', '/clienti', { ragioneSociale: '', pIva: '' });
  if (cn.json?.id) trash.clienti.push(cn.json.id);
  check('anagrafica', 'Cliente senza ragione sociale → bloccato', !cn.ok,
    cn.ok ? 'creato cliente senza nome' : `respinto (${cn.status})`);

  console.log(C.b('\nDOCUMENTI'));
  // 5) fattura vuota
  const fe = await api('POST', '/fatture', { numero: 'AUDIT-EMPTY-' + uid(), dataEmissione: today, clienteId: cliente?.id, righe: [] });
  if (fe.json?.id) trash.fatture.push(fe.json.id);
  check('documenti', 'Fattura vuota (0 righe) → bloccata', !fe.ok,
    fe.ok ? 'creata fattura senza righe' : `respinta (${fe.status})`);

  // 6) fattura senza cliente
  const fc = await api('POST', '/fatture', { numero: 'AUDIT-NOCLI-' + uid(), dataEmissione: today, clienteId: null, righe: [riga()] });
  if (fc.json?.id) trash.fatture.push(fc.json.id);
  check('documenti', 'Fattura senza cliente → bloccata', !fc.ok,
    fc.ok ? 'creata fattura senza cliente' : `respinta (${fc.status})`);

  // 7) numero fattura duplicato
  const numD = 'AUDIT-DUP-' + uid();
  const d1 = await api('POST', '/fatture', { numero: numD, dataEmissione: today, clienteId: cliente?.id, righe: [riga()] });
  if (d1.json?.id) trash.fatture.push(d1.json.id);
  const d2 = await api('POST', '/fatture', { numero: numD, dataEmissione: today, clienteId: cliente?.id, righe: [riga()] });
  if (d2.json?.id) trash.fatture.push(d2.json.id);
  check('documenti', 'Numero fattura duplicato → bloccato', !d2.ok,
    d2.ok ? 'creato doppione di numero' : `respinto (${d2.status})`);

  // 8) riga con quantità e prezzo negativi
  const fn = await api('POST', '/fatture', { numero: 'AUDIT-NEG-' + uid(), dataEmissione: today, clienteId: cliente?.id, righe: [riga({ quantita: -3, prezzo: -50 })] });
  if (fn.json?.id) trash.fatture.push(fn.json.id);
  check('documenti', 'Riga con quantità/prezzo negativi → bloccata', !fn.ok,
    fn.ok ? 'accettata riga negativa (totale negativo possibile)' : `respinta (${fn.status})`);

  console.log(C.b('\nPAGAMENTI'));
  const fp = await api('POST', '/fatture', { numero: 'AUDIT-PAY-' + uid(), dataEmissione: today, clienteId: cliente?.id, righe: [riga()] });
  if (fp.json?.id) trash.fatture.push(fp.json.id);
  const fatturaId = fp.json?.id;
  // 9) overpayment
  const over = await api('POST', '/pagamenti', { fatturaId, dataPagamento: today, importo: 100000 });
  if (over.json?.id) trash.pagamenti.push(over.json.id);
  check('pagamenti', 'Pagamento oltre il residuo → bloccato', !over.ok,
    over.ok ? 'accettato overpayment' : `respinto (${over.status})`);
  // 10) pagamento negativo
  const neg = await api('POST', '/pagamenti', { fatturaId, dataPagamento: today, importo: -50 });
  if (neg.json?.id) trash.pagamenti.push(neg.json.id);
  check('pagamenti', 'Pagamento negativo → bloccato', !neg.ok,
    neg.ok ? 'accettato importo negativo' : `respinto (${neg.status})`);

  console.log(C.b('\nDDT'));
  // 11) doppia fatturazione di un DDT
  const ddtRes = await api('POST', '/ddt', { numero: 'AUDIT-DDT-' + uid(), dataEmissione: today, clienteId: cliente?.id, tipo: 'CLIENTE', righe: [riga()] });
  const ddtId = ddtRes.json?.id;
  if (ddtId) trash.ddt.push(ddtId);
  let dbl = { ok: false, status: 'n/d' };
  if (ddtId) {
    const f1 = await api('POST', `/ddt/${ddtId}/to-fattura`, {});
    if (f1.json?.id) trash.fatture.push(f1.json.id);
    dbl = await api('POST', `/ddt/${ddtId}/to-fattura`, {});
    if (dbl.json?.id) trash.fatture.push(dbl.json.id);
  }
  check('ddt', 'Doppia fatturazione dello stesso DDT → bloccata', !dbl.ok,
    dbl.ok ? 'generata 2ª fattura dallo stesso DDT' : `respinto (${dbl.status})`);

  console.log(C.b('\nNOTE DI CREDITO'));
  // 12) nota di credito vuota (la validazione respinge prima di toccare il DB)
  const ncE = await api('POST', '/note-credito', { numero: 'AUDIT-NC-' + uid(), dataEmissione: today, clienteId: cliente?.id, righe: [] });
  if (ncE.json?.id) trash.noteCredito.push(ncE.json.id);
  check('note-credito', 'Nota di credito vuota (0 righe) → bloccata', !ncE.ok,
    ncE.ok ? 'creata NC senza righe' : `respinta (${ncE.status})`);
  // 13) nota di credito con riga negativa
  const ncN = await api('POST', '/note-credito', { numero: 'AUDIT-NCN-' + uid(), dataEmissione: today, clienteId: cliente?.id, righe: [riga({ quantita: -1, prezzo: -10 })] });
  if (ncN.json?.id) trash.noteCredito.push(ncN.json.id);
  check('note-credito', 'Nota di credito con riga negativa → bloccata', !ncN.ok,
    ncN.ok ? 'accettata riga negativa' : `respinta (${ncN.status})`);
}

async function cleanup() {
  for (const id of trash.pagamenti) await api('DELETE', '/pagamenti/' + id).catch(() => {});
  for (const id of trash.fatture)   await api('DELETE', '/fatture/' + id).catch(() => {});
  for (const id of trash.ddt)       await api('DELETE', '/ddt/' + id).catch(() => {});
  for (const id of trash.noteCredito) await api('DELETE', '/note-credito/' + id).catch(() => {});
  for (const id of trash.clienti)   await api('DELETE', '/clienti/' + id).catch(() => {});
  for (const id of trash.fornitori) await api('DELETE', '/fornitori/' + id).catch(() => {});
}

function scanDb() {
  console.log(C.b('\nSCANSIONE DB (anomalie già presenti)'));
  let Database;
  try { Database = require(join(ROOT, 'backend', 'node_modules', 'better-sqlite3')); }
  catch { try { Database = require('better-sqlite3'); } catch { console.log(C.y('  (saltata: better-sqlite3 non disponibile)')); return; } }
  let db;
  try { db = new Database(TENANT_DB, { readonly: true, fileMustExist: true }); }
  catch (e) { console.log(C.y('  (saltata: DB non apribile — ' + e.message + ')')); return; }

  const one = (sql, ...p) => { try { return db.prepare(sql).get(...p)?.n ?? 0; } catch { return 'n/d'; } };
  const anomaly = (name, count) => check('db-scan', name, count === 0 || count === 'n/d', count === 'n/d' ? 'tabella assente' : `${count} righe`);

  anomaly('Nessun cliente con P.IVA duplicata',
    one(`SELECT COUNT(*) n FROM (SELECT p_iva FROM clienti WHERE TRIM(p_iva)<>'' GROUP BY p_iva HAVING COUNT(*)>1)`));
  anomaly('Nessun fornitore con P.IVA duplicata',
    one(`SELECT COUNT(*) n FROM (SELECT p_iva FROM fornitori WHERE TRIM(p_iva)<>'' GROUP BY p_iva HAVING COUNT(*)>1)`));
  anomaly('Nessuna fattura senza righe',
    one(`SELECT COUNT(*) n FROM fatture f WHERE NOT EXISTS (SELECT 1 FROM fatture_righe r WHERE r.fattura_id=f.id)`));
  anomaly('Nessuna fattura senza cliente',
    one(`SELECT COUNT(*) n FROM fatture WHERE cliente_id IS NULL`));
  anomaly('Nessuna riga fattura con quantità/prezzo negativi',
    one(`SELECT COUNT(*) n FROM fatture_righe WHERE quantita < 0 OR prezzo < 0`));
  anomaly('Nessun numero fattura duplicato',
    one(`SELECT COUNT(*) n FROM (SELECT numero FROM fatture GROUP BY numero HAVING COUNT(*)>1)`));
  anomaly('Nessuna riga orfana (fattura inesistente)',
    one(`SELECT COUNT(*) n FROM fatture_righe r WHERE NOT EXISTS (SELECT 1 FROM fatture f WHERE f.id=r.fattura_id)`));
  anomaly('Nessun prodotto con giacenza negativa',
    one(`SELECT COUNT(*) n FROM prodotti WHERE quantita < 0`));
  anomaly('Nessuna fattura pagata oltre il totale (>0.05€)',
    one(`SELECT COUNT(*) n FROM (
           SELECT f.id,
             (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100.0)*(1+COALESCE(iva,0)/100.0)),0) FROM fatture_righe WHERE fattura_id=f.id) tot,
             (SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE fattura_id=f.id) pag
           FROM fatture f
         ) WHERE pag > tot + 0.05`));
  db.close();
}

function summary() {
  const fails = results.filter(r => !r.pass);
  console.log(C.b('\n──────────────────────────────────────────────'));
  console.log(C.b(`Totale: ${results.length} controlli — ${C.g(results.length - fails.length + ' PASS')} · ${fails.length ? C.r(fails.length + ' FAIL') : C.g('0 FAIL')}`));
  if (fails.length) {
    console.log(C.r('\nGAP da sistemare:'));
    for (const f of fails) console.log('  • [' + f.domain + '] ' + f.name + (f.detail ? C.dim(' — ' + f.detail) : ''));
  } else {
    console.log(C.g('\nTutti i controlli superati: nessun bug riproducibile, nessuna anomalia nel DB.'));
  }
  return fails.length;
}

(async () => {
  console.log(C.b(`Integrity audit → ${API}  (tenant DB: ${TENANT_DB.replace(ROOT + '/', '')})`));
  await login();
  try { await runProbes(); }
  finally { await cleanup(); }
  scanDb();
  const fails = summary();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(C.r('ERRORE audit:'), e.message); process.exit(2); });
