const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM categorie_prodotto ORDER BY nome').all();
  res.json(rows.map(r => ({ id: r.id, nome: r.nome, aliquotaIvaId: r.aliquota_iva_id ?? null })));
});

router.post('/', (req, res) => {
  const { nome, aliquotaIvaId } = req.body;
  const result = db.prepare(
    'INSERT INTO categorie_prodotto (nome, aliquota_iva_id) VALUES (?, ?)'
  ).run(nome?.trim(), aliquotaIvaId ?? null);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nome, aliquotaIvaId } = req.body;
  db.prepare(
    'UPDATE categorie_prodotto SET nome=?, aliquota_iva_id=? WHERE id=?'
  ).run(nome?.trim(), aliquotaIvaId ?? null, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categorie_prodotto WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
