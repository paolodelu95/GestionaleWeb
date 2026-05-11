const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM aliquote_iva ORDER BY valore').all();
  res.json(rows.map(r => ({ id: r.id, nome: r.nome, valore: r.valore, attiva: r.attiva === 1 })));
});

router.post('/', (req, res) => {
  const { nome, valore, attiva } = req.body;
  const result = db.prepare('INSERT INTO aliquote_iva (nome, valore, attiva) VALUES (?,?,?)').run(nome?.trim(), valore, attiva ? 1 : 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nome, valore, attiva } = req.body;
  db.prepare('UPDATE aliquote_iva SET nome=?, valore=?, attiva=? WHERE id=?').run(nome?.trim(), valore, attiva ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM aliquote_iva WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
