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
    (nome, categoria, descrizione, prezzo, quantita, soglia_minima, unita_misura, codice, codice_fornitore, iva, barcode, ha_varianti)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.nome, p.categoria, p.descrizione, p.prezzo, p.quantita ?? 0,
         p.sogliaMinima ?? 0, p.unitaMisura, p.codice, p.codiceFornitore || '',
         p.iva, p.barcode || '', p.haVarianti ? 1 : 0);
  const id = result.lastInsertRowid;
  if (p.haVarianti && p.varianti?.length) {
    saveVarianti(id, p.varianti);
    syncQuantita(id);
  }
  res.json({ id });
});

router.put('/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE prodotti SET nome=?, categoria=?, descrizione=?, prezzo=?,
    quantita=?, soglia_minima=?, unita_misura=?, codice=?, codice_fornitore=?, iva=?, barcode=?, ha_varianti=? WHERE id=?`)
    .run(p.nome, p.categoria, p.descrizione, p.prezzo, p.quantita ?? 0,
         p.sogliaMinima ?? 0, p.unitaMisura, p.codice, p.codiceFornitore || '',
         p.iva, p.barcode || '', p.haVarianti ? 1 : 0, req.params.id);
  if (p.haVarianti) {
    db.prepare('DELETE FROM prodotto_varianti WHERE prodotto_id=?').run(req.params.id);
    if (p.varianti?.length) saveVarianti(req.params.id, p.varianti);
    syncQuantita(req.params.id);
  } else {
    db.prepare('DELETE FROM prodotto_varianti WHERE prodotto_id=?').run(req.params.id);
  }
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM prodotti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function saveVarianti(prodottoId, varianti) {
  const stmt = db.prepare(
    `INSERT INTO prodotto_varianti (prodotto_id, taglia, colore, quantita, barcode)
     VALUES (?,?,?,?,?)`
  );
  for (const v of varianti) {
    stmt.run(prodottoId, v.taglia || '', v.colore || '', v.quantita ?? 0, v.barcode || '');
  }
}

function syncQuantita(prodottoId) {
  const r = db.prepare('SELECT COALESCE(SUM(quantita),0) as tot FROM prodotto_varianti WHERE prodotto_id=?').get(prodottoId);
  db.prepare('UPDATE prodotti SET quantita=? WHERE id=?').run(r.tot, prodottoId);
}

function toDto(r) {
  const dto = {
    id: r.id, nome: r.nome, categoria: r.categoria, descrizione: r.descrizione,
    prezzo: r.prezzo, quantita: r.quantita, sogliaMinima: r.soglia_minima,
    unitaMisura: r.unita_misura, codice: r.codice, codiceFornitore: r.codice_fornitore || '',
    iva: r.iva, barcode: r.barcode || '', haVarianti: r.ha_varianti === 1,
  };
  if (r.ha_varianti === 1) {
    dto.varianti = db.prepare(
      'SELECT id, taglia, colore, quantita, barcode FROM prodotto_varianti WHERE prodotto_id=? ORDER BY taglia, colore'
    ).all(r.id);
  }
  return dto;
}

module.exports = router;
