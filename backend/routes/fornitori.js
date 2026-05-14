const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM fornitori ORDER BY ragione_sociale').all();
  res.json(rows.map(r => toDto(r)));
});

router.post('/', (req, res) => {
  const f = req.body;
  const result = db.prepare(`INSERT INTO fornitori
    (ragione_sociale, email, telefono, via, cap, citta, provincia, stato, p_iva, sdi, pec)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(f.ragioneSociale, f.email, f.telefono, f.via, f.cap, f.citta, f.provincia, f.stato, f.pIva, f.sdi || '', f.pec || '');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const f = req.body;
  db.prepare(`UPDATE fornitori SET ragione_sociale=?, email=?, telefono=?, via=?, cap=?,
    citta=?, provincia=?, stato=?, p_iva=?, sdi=?, pec=? WHERE id=?`)
    .run(f.ragioneSociale, f.email, f.telefono, f.via, f.cap, f.citta, f.provincia, f.stato, f.pIva, f.sdi || '', f.pec || '', req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fornitori WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function toDto(r) {
  return {
    id: r.id, ragioneSociale: r.ragione_sociale, email: r.email, telefono: r.telefono,
    via: r.via, cap: r.cap, citta: r.citta, provincia: r.provincia, stato: r.stato, pIva: r.p_iva, sdi: r.sdi, pec: r.pec
  };
}

module.exports = router;
