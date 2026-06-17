const express = require('express');
const router = express.Router();
const db = require('../database');

// Bacheca post-it: un singolo blob JSON per tenant (incluso nei backup).

router.get('/', (req, res) => {
  const row = db.prepare('SELECT dati FROM lavagna WHERE id = 1').get();
  let board = { note: [] };
  if (row?.dati) { try { board = JSON.parse(row.dati); } catch (_) {} }
  res.json(board);
});

router.put('/', (req, res) => {
  const dati = JSON.stringify(req.body ?? {});
  db.prepare(`INSERT INTO lavagna (id, dati) VALUES (1, ?)
              ON CONFLICT(id) DO UPDATE SET dati = excluded.dati`).run(dati);
  res.json({ success: true });
});

module.exports = router;
