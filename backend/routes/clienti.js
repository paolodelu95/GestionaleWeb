const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM clienti ORDER BY ragione_sociale').all();
  res.json(rows.map(r => toDto(r)));
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
  const result = db.prepare(`INSERT INTO clienti
    (ragione_sociale, email, telefono, via, cap, citta, provincia, stato, codice_fiscale, p_iva, sdi, pec, tipo_pagamento_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(c.ragioneSociale, c.email, c.telefono, c.via, c.cap, c.citta, c.provincia, c.stato, c.codiceFiscale, normalizePiva(c.pIva), c.sdi || '', c.pec || '', c.tipoPagamentoId || null);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const c = req.body;
  db.prepare(`UPDATE clienti SET ragione_sociale=?, email=?, telefono=?, via=?, cap=?,
    citta=?, provincia=?, stato=?, codice_fiscale=?, p_iva=?, sdi=?, pec=?, tipo_pagamento_id=? WHERE id=?`)
    .run(c.ragioneSociale, c.email, c.telefono, c.via, c.cap, c.citta, c.provincia, c.stato, c.codiceFiscale, normalizePiva(c.pIva), c.sdi || '', c.pec || '', c.tipoPagamentoId || null, req.params.id);
  res.json({ success: true });
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

  db.prepare('DELETE FROM clienti WHERE id=?').run(id);
  res.json({ success: true });
});

function normalizePiva(piva) {
  if (!piva) return piva;
  let v = String(piva).replace(/\s/g, '').toUpperCase();
  if (v.startsWith('IT')) v = v.slice(2);
  return v;
}

function toDto(r) {
  return {
    id: r.id, ragioneSociale: r.ragione_sociale, email: r.email, telefono: r.telefono,
    via: r.via, cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato,
    codiceFiscale: r.codice_fiscale, pIva: r.p_iva, sdi: r.sdi, pec: r.pec, tipoPagamentoId: r.tipo_pagamento_id
  };
}

module.exports = router;
