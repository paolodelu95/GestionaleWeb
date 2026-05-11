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

router.post('/', (req, res) => {
  const c = req.body;
  const result = db.prepare(`INSERT INTO clienti
    (ragione_sociale, email, telefono, via, cap, citta, provincia, stato, codice_fiscale, p_iva)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(c.ragioneSociale, c.email, c.telefono, c.via, c.cap, c.citta, c.provincia, c.stato, c.codiceFiscale, c.pIva);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const c = req.body;
  db.prepare(`UPDATE clienti SET ragione_sociale=?, email=?, telefono=?, via=?, cap=?,
    citta=?, provincia=?, stato=?, codice_fiscale=?, p_iva=? WHERE id=?`)
    .run(c.ragioneSociale, c.email, c.telefono, c.via, c.cap, c.citta, c.provincia, c.stato, c.codiceFiscale, c.pIva, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM clienti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function toDto(r) {
  return {
    id: r.id, ragioneSociale: r.ragione_sociale, email: r.email, telefono: r.telefono,
    via: r.via, cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato,
    codiceFiscale: r.codice_fiscale, pIva: r.p_iva
  };
}

module.exports = router;
