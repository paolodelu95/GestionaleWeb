const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM note_rapide ORDER BY ordine, id').all();
  res.json(rows.map(r => ({ id: r.id, testo: r.testo, ordine: r.ordine })));
});

router.post('/', (req, res) => {
  const { testo, ordine } = req.body;
  if (!testo?.trim()) return res.status(400).json({ error: 'testo richiesto' });
  const result = db.prepare('INSERT INTO note_rapide (testo, ordine) VALUES (?,?)').run(testo.trim(), ordine ?? 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { testo, ordine } = req.body;
  if (!testo?.trim()) return res.status(400).json({ error: 'testo richiesto' });
  db.prepare('UPDATE note_rapide SET testo=?, ordine=? WHERE id=?').run(testo.trim(), ordine ?? 0, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM note_rapide WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
