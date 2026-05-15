const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/prodotto-varianti/:prodottoId
router.get('/:prodottoId', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM prodotto_varianti WHERE prodotto_id=? ORDER BY taglia, colore'
  ).all(req.params.prodottoId);
  res.json(rows.map(toDto));
});

// GET /api/prodotto-varianti/barcode/:barcode
// Returns { prodotto, variante } or 404
router.get('/barcode/:barcode', (req, res) => {
  const v = db.prepare('SELECT * FROM prodotto_varianti WHERE barcode=? LIMIT 1').get(req.params.barcode);
  if (v) {
    const p = db.prepare('SELECT * FROM prodotti WHERE id=?').get(v.prodotto_id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    return res.json({ prodotto: toProdottoDto(p), variante: toDto(v) });
  }
  // Also try product-level barcode
  const p = db.prepare('SELECT * FROM prodotti WHERE barcode=? LIMIT 1').get(req.params.barcode);
  if (p) return res.json({ prodotto: toProdottoDto(p), variante: null });
  res.status(404).json({ error: 'Not found' });
});

function toDto(r) {
  return {
    id: r.id, prodottoId: r.prodotto_id,
    taglia: r.taglia, colore: r.colore,
    quantita: r.quantita, barcode: r.barcode,
  };
}

function toProdottoDto(r) {
  return {
    id: r.id, nome: r.nome, categoria: r.categoria,
    prezzo: r.prezzo, quantita: r.quantita, iva: r.iva,
    unitaMisura: r.unita_misura, codice: r.codice,
    barcode: r.barcode || '', haVarianti: r.ha_varianti === 1,
  };
}

module.exports = router;
