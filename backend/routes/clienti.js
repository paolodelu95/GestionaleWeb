const express = require('express');
const router = express.Router();
const db = require('../database');
const { applicaGemelloDaCliente, scollegaGemelloCliente } = require('../utils/anagraficaGemello');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT MAX(f.data_emissione) FROM fatture f WHERE f.cliente_id = c.id) AS ultimo_acquisto,
      (SELECT COALESCE(SUM(fr.quantita * fr.prezzo * (1 - COALESCE(fr.sconto,0)/100) * (1 + fr.iva/100)), 0)
         FROM fatture f
         LEFT JOIN fatture_righe fr ON fr.fattura_id = f.id
         WHERE f.cliente_id = c.id
           AND f.stato != 'ANNULLATA'
           AND f.data_emissione >= date('now','start of year')) AS fatturato_anno,
      (SELECT COUNT(*) FROM fatture f
         LEFT JOIN tipi_pagamento tp ON tp.id = f.tipo_pagamento_id
         WHERE f.cliente_id = c.id
           AND f.stato NOT IN ('PAGATA','ANNULLATA','STORNATA')
           AND date(f.data_emissione, '+' || COALESCE(tp.giorni_scadenza,30) || ' days') < date('now')) AS fatture_insolute
    FROM clienti c
    ORDER BY c.ragione_sociale
  `).all();
  res.json(rows.map(r => ({
    ...toDto(r),
    ultimoAcquisto: r.ultimo_acquisto || null,
    fatturatoAnno: +(r.fatturato_anno || 0),
    fattureInsolute: r.fatture_insolute || 0,
  })));
});

router.get('/count', (req, res) => {
  const r = db.prepare('SELECT COUNT(*) as count FROM clienti').get();
  res.json(r.count);
});

router.get('/check-piva', (req, res) => {
  const { piva, excludeId } = req.query;
  if (!piva) return res.json({ exists: false });
  const clean = normalizePiva(String(piva));
  if (!/^\d{11}$/.test(clean)) return res.json({ exists: false });
  // Cerca sia con che senza prefisso "IT" per compatibilità con dati esistenti
  const row = excludeId
    ? db.prepare('SELECT id FROM clienti WHERE (p_iva=? OR p_iva=?) AND id!=?').get(clean, 'IT' + clean, Number(excludeId))
    : db.prepare('SELECT id FROM clienti WHERE p_iva=? OR p_iva=?').get(clean, 'IT' + clean);
  res.json({ exists: !!row, id: row?.id });
});

router.post('/', (req, res) => {
  const c = req.body;
  if (!c.ragioneSociale?.trim()) return res.status(400).json({ error: 'La ragione sociale è obbligatoria' });
  const piva = normalizePiva(c.pIva);
  if (piva) {
    const esiste = db.prepare('SELECT id FROM clienti WHERE p_iva=? OR p_iva=?').get(piva, 'IT' + piva);
    if (esiste) return res.status(409).json({ error: `Esiste già un cliente con la P.IVA ${piva}`, duplicateId: esiste.id });
  }
  const result = db.prepare(`INSERT INTO clienti
    (ragione_sociale, email, telefono, cellulare, via, cap, citta, provincia, stato, codice_fiscale, p_iva, sdi, pec, tipo_pagamento_id, listino_id, tipo_soggetto, cig, cup, aliquota_iva_id, anche_fornitore)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(c.ragioneSociale, c.email, c.telefono, c.cellulare || '', c.via, c.cap, c.citta, c.provincia, c.stato, c.codiceFiscale, piva, c.sdi || '', c.pec || '', c.tipoPagamentoId || null, c.listinoId || null, c.tipoSoggetto || 'PRIVATO', c.cig || '', c.cup || '', c.aliquotaIvaId || null, c.ancheFornitore ? 1 : 0);
  applicaGemelloDaCliente(result.lastInsertRowid);
  res.json({ id: result.lastInsertRowid });
});

router.post('/import', (req, res) => {
  const records = Array.isArray(req.body) ? req.body : [];
  let created = 0, updated = 0, skipped = 0;
  for (const c of records) {
    if (!c.ragioneSociale?.trim()) { skipped++; continue; }
    const piva = normalizePiva(c.pIva);
    let existing = null;
    if (piva && /^\d{11}$/.test(piva))
      existing = db.prepare('SELECT * FROM clienti WHERE p_iva=? OR p_iva=?').get(piva, 'IT'+piva);
    if (!existing)
      existing = db.prepare('SELECT * FROM clienti WHERE LOWER(TRIM(ragione_sociale))=?').get(c.ragioneSociale.toLowerCase().trim());
    if (existing) {
      const patch = {};
      if (!existing.email && c.email)                   patch.email = c.email;
      if (!existing.telefono && c.telefono)             patch.telefono = c.telefono;
      if (!existing.cellulare && c.cellulare)           patch.cellulare = c.cellulare;
      if (!existing.via && c.via)                       patch.via = c.via;
      if (!existing.cap && c.cap)                       patch.cap = c.cap;
      if (!existing.citta && c.citta)                   patch.citta = c.citta;
      if (!existing.provincia && c.provincia)           patch.provincia = c.provincia;
      if (!existing.codice_fiscale && c.codiceFiscale)  patch.codice_fiscale = c.codiceFiscale;
      if (!existing.p_iva && piva)                      patch.p_iva = piva;
      if (!existing.sdi && c.sdi)                       patch.sdi = c.sdi;
      if (!existing.pec && c.pec)                       patch.pec = c.pec;
      if (Object.keys(patch).length > 0) {
        const sets = Object.keys(patch).map(k => `${k}=?`).join(', ');
        db.prepare(`UPDATE clienti SET ${sets} WHERE id=?`).run(...Object.values(patch), existing.id);
        updated++;
      } else { skipped++; }
    } else {
      db.prepare(`INSERT INTO clienti (ragione_sociale,email,telefono,cellulare,via,cap,citta,provincia,stato,codice_fiscale,p_iva,sdi,pec) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(c.ragioneSociale.trim(), c.email||'', c.telefono||'', c.cellulare||'', c.via||'', c.cap||'', c.citta||'', c.provincia||'', c.stato||'Italia', c.codiceFiscale||'', piva||'', c.sdi||'', c.pec||'');
      created++;
    }
  }
  res.json({ created, updated, skipped });
});

router.put('/:id', (req, res) => {
  const c = req.body;
  if (!c.ragioneSociale?.trim()) return res.status(400).json({ error: 'La ragione sociale è obbligatoria' });
  const piva = normalizePiva(c.pIva);
  if (piva) {
    const esiste = db.prepare('SELECT id FROM clienti WHERE (p_iva=? OR p_iva=?) AND id!=?').get(piva, 'IT' + piva, req.params.id);
    if (esiste) return res.status(409).json({ error: `Esiste già un altro cliente con la P.IVA ${piva}`, duplicateId: esiste.id });
  }
  db.prepare(`UPDATE clienti SET ragione_sociale=?, email=?, telefono=?, cellulare=?, via=?, cap=?,
    citta=?, provincia=?, stato=?, codice_fiscale=?, p_iva=?, sdi=?, pec=?, tipo_pagamento_id=?, listino_id=?,
    tipo_soggetto=?, cig=?, cup=?, aliquota_iva_id=?, anche_fornitore=? WHERE id=?`)
    .run(c.ragioneSociale, c.email, c.telefono, c.cellulare || '', c.via, c.cap, c.citta, c.provincia, c.stato, c.codiceFiscale, piva, c.sdi || '', c.pec || '', c.tipoPagamentoId || null, c.listinoId || null, c.tipoSoggetto || 'PRIVATO', c.cig || '', c.cup || '', c.aliquotaIvaId || null, c.ancheFornitore ? 1 : 0, req.params.id);
  applicaGemelloDaCliente(Number(req.params.id));
  res.json({ success: true });
});

// Suggerimenti: prodotti piu venduti a questo cliente negli ultimi 12 mesi
// GET /api/clienti/:id — dettaglio singolo cliente (per app mobile / integrazioni)
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID non valido' });
  const row = db.prepare('SELECT * FROM clienti WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Cliente non trovato' });
  res.json(toDto(row));
});

router.get('/:id/top-prodotti', (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '5'), 10), 1), 20);
  const rows = db.prepare(`
    SELECT p.id, p.nome, p.codice, p.prezzo, p.iva, p.unita_misura,
           COUNT(*) as occorrenze,
           SUM(fr.quantita) as quantita_totale,
           MAX(f.data_emissione) as ultima_vendita
    FROM fatture_righe fr
    JOIN fatture f ON f.id = fr.fattura_id
    JOIN prodotti p ON p.id = fr.prodotto_id
    WHERE f.cliente_id = ?
      AND f.stato != 'ANNULLATA'
      AND f.data_emissione >= date('now','-12 months')
      AND fr.prodotto_id IS NOT NULL
    GROUP BY p.id
    ORDER BY occorrenze DESC, ultima_vendita DESC
    LIMIT ?
  `).all(req.params.id, limit);
  res.json(rows.map(r => ({
    id: r.id, nome: r.nome, codice: r.codice, prezzo: r.prezzo, iva: r.iva,
    unitaMisura: r.unita_misura, occorrenze: r.occorrenze,
    quantitaTotale: r.quantita_totale, ultimaVendita: r.ultima_vendita,
  })));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const fatture     = db.prepare('SELECT COUNT(*) as n FROM fatture WHERE cliente_id=?').get(id).n;
  const ddt         = db.prepare('SELECT COUNT(*) as n FROM ddt WHERE cliente_id=?').get(id).n;
  const preventivi  = db.prepare('SELECT COUNT(*) as n FROM preventivi WHERE cliente_id=?').get(id).n;
  const ordini      = db.prepare('SELECT COUNT(*) as n FROM ordini WHERE cliente_id=?').get(id).n;
  const noteCredito = db.prepare('SELECT COUNT(*) as n FROM note_credito WHERE cliente_id=?').get(id).n;

  if (fatture + ddt + preventivi + ordini + noteCredito > 0) {
    return res.status(409).json({ error: 'cliente_ha_documenti', counts: { fatture, ddt, preventivi, ordini, noteCredito } });
  }

  scollegaGemelloCliente(id);
  db.prepare('DELETE FROM clienti WHERE id=?').run(id);
  res.json({ success: true });
});

// ── Indirizzi cliente ─────────────────────────────────────────────────────────

router.get('/:id/indirizzi', (req, res) => {
  const rows = db.prepare('SELECT * FROM clienti_indirizzi WHERE cliente_id=? ORDER BY id').all(req.params.id);
  res.json(rows.map(r => ({
    id: r.id, clienteId: r.cliente_id, nome: r.nome,
    via: r.via, cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato,
  })));
});

router.post('/:id/indirizzi', (req, res) => {
  const a = req.body;
  const result = db.prepare(
    'INSERT INTO clienti_indirizzi (cliente_id, nome, via, cap, citta, provincia, stato) VALUES (?,?,?,?,?,?,?)'
  ).run(req.params.id, a.nome || 'Sede', a.via || '', a.cap || '', a.citta || '', a.provincia || '', a.stato || 'Italia');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:clienteId/indirizzi/:id', (req, res) => {
  const a = req.body;
  db.prepare(
    'UPDATE clienti_indirizzi SET nome=?, via=?, cap=?, citta=?, provincia=?, stato=? WHERE id=? AND cliente_id=?'
  ).run(a.nome || 'Sede', a.via || '', a.cap || '', a.citta || '', a.provincia || '', a.stato || 'Italia', req.params.id, req.params.clienteId);
  res.json({ success: true });
});

router.delete('/:clienteId/indirizzi/:id', (req, res) => {
  db.prepare('UPDATE ddt SET destinazione_id=NULL WHERE destinazione_id=?').run(req.params.id);
  db.prepare('DELETE FROM clienti_indirizzi WHERE id=? AND cliente_id=?').run(req.params.id, req.params.clienteId);
  res.json({ success: true });
});

router.get('/:id/fatture-insolute', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT f.id, f.numero, f.data_emissione, f.stato,
        COALESCE((
          SELECT SUM(fr.quantita * fr.prezzo * (1 - COALESCE(fr.sconto, 0) / 100.0) * (1 + fr.iva / 100.0))
          FROM fatture_righe fr WHERE fr.fattura_id = f.id
        ), 0) AS totale
      FROM fatture f
      WHERE f.cliente_id = ? AND f.stato NOT IN ('PAGATA', 'ANNULLATA', 'STORNATA')
      ORDER BY f.data_emissione DESC
    `).all(req.params.id);
    res.json(rows.map(r => ({
      id: r.id,
      numero: r.numero,
      dataEmissione: r.data_emissione,
      totale: r.totale,
      stato: r.stato,
    })));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizePiva(piva) {
  if (!piva) return piva;
  let v = String(piva).replace(/\s/g, '').toUpperCase();
  if (v.startsWith('IT')) v = v.slice(2);
  return v;
}

function toDto(r) {
  return {
    id: r.id, ragioneSociale: r.ragione_sociale, email: r.email, telefono: r.telefono, cellulare: r.cellulare,
    via: r.via, cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato,
    codiceFiscale: r.codice_fiscale, pIva: r.p_iva, sdi: r.sdi, pec: r.pec,
    tipoPagamentoId: r.tipo_pagamento_id, listinoId: r.listino_id,
    tipoSoggetto: r.tipo_soggetto || 'PRIVATO',
    cig: r.cig || '',
    cup: r.cup || '',
    aliquotaIvaId: r.aliquota_iva_id || null,
    ancheFornitore: r.anche_fornitore === 1,
    fornitoreCollegatoId: r.fornitore_collegato_id || null,
  };
}

module.exports = router;
