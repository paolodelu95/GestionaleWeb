const express = require('express');
const router = express.Router();
const db = require('../database');

const toDto = r => ({
  id: r.id, nome: r.nome,
  predefinitoPer: r.predefinito_per || '',
  attivo: r.attivo === 1,
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM conti_acquisto ORDER BY nome').all();
  res.json(rows.map(toDto));
});

router.post('/', (req, res) => {
  const { nome, predefinitoPer, attivo } = req.body;
  const result = db.prepare('INSERT INTO conti_acquisto (nome, predefinito_per, attivo) VALUES (?,?,?)')
    .run(nome?.trim(), predefinitoPer||'', attivo!==false?1:0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { nome, predefinitoPer, attivo } = req.body;
  db.prepare('UPDATE conti_acquisto SET nome=?, predefinito_per=?, attivo=? WHERE id=?')
    .run(nome?.trim(), predefinitoPer||'', attivo?1:0, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM conti_acquisto WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
