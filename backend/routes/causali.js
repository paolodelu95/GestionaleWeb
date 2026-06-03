const express = require('express');
const router = express.Router();
const db = require('../database');

// Causali pagamento: lista gestibile in Impostazioni, usata nel dialog Pagamenti.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM causali_pagamento ORDER BY ordine, nome').all();
  res.json(rows.map(r => ({ id: r.id, nome: r.nome, ordine: r.ordine ?? 0, attivo: r.attivo !== 0 })));
});

router.post('/', (req, res) => {
  const nome = (req.body?.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome causale mancante' });
  try {
    const max = db.prepare('SELECT COALESCE(MAX(ordine),0) AS m FROM causali_pagamento').get().m;
    const result = db.prepare('INSERT INTO causali_pagamento (nome, ordine) VALUES (?, ?)').run(nome, max + 1);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Causale già esistente' });
  }
});

router.put('/:id', (req, res) => {
  const nome = (req.body?.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome causale mancante' });
  db.prepare('UPDATE causali_pagamento SET nome=? WHERE id=?').run(nome, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM causali_pagamento WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
