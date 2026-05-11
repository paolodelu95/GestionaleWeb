const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM unita_misura ORDER BY nome').all());
});

router.post('/', (req, res) => {
  const { nome, simbolo } = req.body;
  const result = db.prepare('INSERT INTO unita_misura (nome, simbolo) VALUES (?,?)').run(nome?.trim(), simbolo?.trim() || nome?.trim());
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nome, simbolo } = req.body;
  db.prepare('UPDATE unita_misura SET nome=?, simbolo=? WHERE id=?').run(nome?.trim(), simbolo?.trim() || nome?.trim(), req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM unita_misura WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
