const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM prodotti ORDER BY nome').all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/sotto-soglia', (req, res) => {
  const rows = db.prepare('SELECT * FROM prodotti WHERE quantita < soglia_minima ORDER BY nome').all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/count', (req, res) => {
  const r = db.prepare('SELECT COUNT(*) as count FROM prodotti').get();
  res.json(r.count);
});

router.get('/valore', (req, res) => {
  const r = db.prepare('SELECT SUM(prezzo * quantita) as valore FROM prodotti').get();
  res.json(r.valore || 0);
});

router.post('/', (req, res) => {
  const p = req.body;
  const result = db.prepare(`INSERT INTO prodotti
    (nome, categoria, descrizione, prezzo, quantita, soglia_minima, unita_misura, codice, iva)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(p.nome, p.categoria, p.descrizione, p.prezzo, p.quantita, p.sogliaMinima, p.unitaMisura, p.codice, p.iva);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE prodotti SET nome=?, categoria=?, descrizione=?, prezzo=?, quantita=?,
    soglia_minima=?, unita_misura=?, codice=?, iva=? WHERE id=?`)
    .run(p.nome, p.categoria, p.descrizione, p.prezzo, p.quantita, p.sogliaMinima, p.unitaMisura, p.codice, p.iva, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM prodotti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function toDto(r) {
  return {
    id: r.id, nome: r.nome, categoria: r.categoria, descrizione: r.descrizione,
    prezzo: r.prezzo, quantita: r.quantita, sogliaMinima: r.soglia_minima,
    unitaMisura: r.unita_misura, codice: r.codice, iva: r.iva
  };
}

module.exports = router;
