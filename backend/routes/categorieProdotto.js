const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM categorie_prodotto ORDER BY nome').all());
});

router.post('/', (req, res) => {
  const result = db.prepare('INSERT INTO categorie_prodotto (nome) VALUES (?)').run(req.body.nome?.trim());
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  db.prepare('UPDATE categorie_prodotto SET nome=? WHERE id=?').run(req.body.nome?.trim(), req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categorie_prodotto WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
