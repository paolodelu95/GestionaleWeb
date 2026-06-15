// Setup di primo avvio — solo edizione offline desktop.
// Espone il caricamento dei "dati demo" (anagrafiche + catalogo) per provare
// subito il gestionale senza inserire nulla a mano. È idempotente: popola solo
// se le tabelle sono vuote, così non sovrascrive mai dati reali dell'utente.
const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');

const PRODOTTI = [
  { nome: 'Carta A4 80g', categoria: 'Cancelleria', prezzo: 4.90, quantita: 150, soglia: 50, um: 'risma', codice: 'CAR001', iva: 22 },
  { nome: 'Penna Biro Blu', categoria: 'Cancelleria', prezzo: 0.50, quantita: 300, soglia: 100, um: 'pz', codice: 'PEN001', iva: 22 },
  { nome: 'Toner HP LaserJet', categoria: 'Informatica', prezzo: 89.00, quantita: 12, soglia: 5, um: 'pz', codice: 'TON001', iva: 22 },
  { nome: 'Cartuccia Inkjet Nera', categoria: 'Informatica', prezzo: 22.50, quantita: 8, soglia: 10, um: 'pz', codice: 'CAR002', iva: 22 },
  { nome: 'Scrivania Ufficio 140cm', categoria: 'Arredamento', prezzo: 249.00, quantita: 3, soglia: 1, um: 'pz', codice: 'SCR001', iva: 22 },
  { nome: 'Sedia Ergonomica', categoria: 'Arredamento', prezzo: 189.00, quantita: 6, soglia: 2, um: 'pz', codice: 'SED001', iva: 22 },
  { nome: 'Monitor 24" Full HD', categoria: 'Informatica', prezzo: 179.00, quantita: 5, soglia: 2, um: 'pz', codice: 'MON001', iva: 22 },
  { nome: 'Tastiera Wireless', categoria: 'Informatica', prezzo: 45.00, quantita: 14, soglia: 5, um: 'pz', codice: 'TAS001', iva: 22 },
  { nome: 'Mouse Ottico USB', categoria: 'Informatica', prezzo: 18.00, quantita: 20, soglia: 8, um: 'pz', codice: 'MOU001', iva: 22 },
  { nome: 'Raccoglitore A4 4 Anelli', categoria: 'Cancelleria', prezzo: 3.20, quantita: 4, soglia: 20, um: 'pz', codice: 'RAC001', iva: 22 },
];

const CLIENTI = [
  { rs: 'Alfa Srl', email: 'amministrazione@alfasrl.it', tel: '02 1234567', via: 'Via Roma 12', cap: '20121', citta: 'Milano', prov: 'MI', cf: 'ALFA00000000000', piva: 'IT01234567890' },
  { rs: 'Beta SpA', email: 'contabilita@betaspa.it', tel: '06 9876543', via: 'Corso Vittorio 88', cap: '00186', citta: 'Roma', prov: 'RM', cf: 'BETA00000000000', piva: 'IT09876543210' },
  { rs: 'Gamma Snc', email: 'info@gammasnc.it', tel: '011 5551234', via: 'Via Torino 5', cap: '10121', citta: 'Torino', prov: 'TO', cf: 'GAMM00000000000', piva: 'IT05551234567' },
  { rs: 'Delta Studio', email: 'studio@delta.it', tel: '051 3334444', via: 'Via Indipendenza 22', cap: '40121', citta: 'Bologna', prov: 'BO', cf: 'DELT00000000000', piva: 'IT03334444555' },
  { rs: 'Epsilon Srl', email: 'fatture@epsilon.it', tel: '055 7778888', via: 'Lungarno Corsini 10', cap: '50123', citta: 'Firenze', prov: 'FI', cf: 'EPSI00000000000', piva: 'IT07778888999' },
];

const FORNITORI = [
  { rs: 'Forniture Ufficio Nord Srl', email: 'ordini@funord.it', tel: '02 8889990', via: 'Via Bisceglie 45', cap: '20152', citta: 'Milano', prov: 'MI', piva: 'IT11112222333' },
  { rs: 'Tech Supply SpA', email: 'vendite@techsupply.it', tel: '049 6667778', via: 'Via Venezia 100', cap: '35121', citta: 'Padova', prov: 'PD', piva: 'IT44445555666' },
  { rs: 'MobiliOffice Srl', email: 'info@mobilioffice.it', tel: '039 2223334', via: 'Via Lecco 8', cap: '20900', citta: 'Monza', prov: 'MB', piva: 'IT77778888999' },
];

function count(table) {
  try { return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; } catch (_) { return 0; }
}

// GET /api/setup/status — il frontend lo usa per sapere se l'app è "vergine".
router.get('/status', (req, res) => {
  const az = db.prepare('SELECT ragione_sociale, p_iva FROM azienda WHERE id=1').get();
  res.json({
    aziendaConfigurata: !!(az && az.ragione_sociale && (az.p_iva || '').trim()),
    hasDati: count('prodotti') > 0 || count('clienti') > 0 || count('fornitori') > 0,
  });
});

// POST /api/setup/seed-demo — carica i dati demo (solo se non ci sono già dati).
router.post('/seed-demo', (req, res) => {
  if (count('prodotti') > 0 || count('clienti') > 0 || count('fornitori') > 0) {
    return res.status(409).json({ error: 'Ci sono già dei dati: i dati demo non sono stati caricati per non sovrascriverli.' });
  }

  const insP = db.prepare(`INSERT INTO prodotti (nome, categoria, prezzo, quantita, soglia_minima, unita_misura, codice, iva)
    VALUES (?,?,?,?,?,?,?,?)`);
  const insC = db.prepare(`INSERT INTO clienti (ragione_sociale, email, telefono, via, cap, citta, provincia, stato, codice_fiscale, p_iva)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insF = db.prepare(`INSERT INTO fornitori (ragione_sociale, email, telefono, via, cap, citta, provincia, stato, p_iva)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  const tx = db.transaction(() => {
    PRODOTTI.forEach(p => insP.run(p.nome, p.categoria, p.prezzo, p.quantita, p.soglia, p.um, p.codice, p.iva));
    CLIENTI.forEach(c => insC.run(c.rs, c.email, c.tel, c.via, c.cap, c.citta, c.prov, 'Italia', c.cf, c.piva));
    FORNITORI.forEach(f => insF.run(f.rs, f.email, f.tel, f.via, f.cap, f.citta, f.prov, 'Italia', f.piva));
  });
  tx();

  res.json({ success: true, prodotti: PRODOTTI.length, clienti: CLIENTI.length, fornitori: FORNITORI.length });
});

// ── Password opzionale d'accesso al programma ───────────────────────────────
function currentHash() {
  const row = db.prepare('SELECT app_password_hash FROM azienda WHERE id=1').get();
  return (row && row.app_password_hash) || '';
}

// GET /api/setup/password/status — il frontend sa se mostrare il blocco all'avvio.
router.get('/password/status', (req, res) => {
  res.json({ enabled: currentHash().length > 0 });
});

// POST /api/setup/password — imposta (o rimuove con password vuota) la password.
// Se ne esiste già una, richiede quella attuale in `current` per cambiarla.
router.post('/password', (req, res) => {
  const { password, current } = req.body || {};
  const existing = currentHash();
  if (existing) {
    if (!bcrypt.compareSync(String(current || ''), existing)) {
      return res.status(403).json({ error: 'Password attuale errata.' });
    }
  }
  const next = String(password || '');
  const hash = next ? bcrypt.hashSync(next, 10) : '';
  db.prepare('UPDATE azienda SET app_password_hash=? WHERE id=1').run(hash);
  res.json({ success: true, enabled: hash.length > 0 });
});

// POST /api/setup/unlock — verifica la password per sbloccare l'app.
router.post('/unlock', (req, res) => {
  const existing = currentHash();
  if (!existing) return res.json({ ok: true });           // nessuna password impostata
  const ok = bcrypt.compareSync(String((req.body && req.body.password) || ''), existing);
  res.json({ ok });
});

module.exports = router;
