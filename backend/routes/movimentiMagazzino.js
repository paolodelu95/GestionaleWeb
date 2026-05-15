const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const { prodottoId, clienteId, tipo, causale, anno, mese, dataFrom, dataTo } = req.query;

  let sql = `
    SELECT m.id, m.data, m.prodotto_id, m.tipo, m.quantita, m.causale,
           m.documento_tipo, m.documento_id, m.documento_numero,
           m.cliente_id, m.fornitore_id, m.note,
           m.variante_taglia, m.variante_colore,
           COALESCE(p.nome, m.prodotto_nome)    AS prodotto_nome,
           COALESCE(c.ragione_sociale, m.cliente_nome)   AS cliente_nome,
           COALESCE(f.ragione_sociale, m.fornitore_nome) AS fornitore_nome
    FROM movimenti_magazzino m
    LEFT JOIN prodotti  p ON m.prodotto_id  = p.id
    LEFT JOIN clienti   c ON m.cliente_id   = c.id
    LEFT JOIN fornitori f ON m.fornitore_id = f.id
    WHERE 1=1`;
  const params = [];

  if (prodottoId) { sql += ' AND m.prodotto_id=?';                       params.push(prodottoId); }
  if (clienteId)  { sql += ' AND m.cliente_id=?';                        params.push(clienteId); }
  if (tipo)       { sql += ' AND m.tipo=?';                              params.push(tipo); }
  if (causale)    { sql += ' AND m.causale=?';                           params.push(causale); }
  if (anno)       { sql += " AND strftime('%Y', m.data)=?";              params.push(String(anno)); }
  if (mese)       { sql += " AND strftime('%m', m.data)=?";              params.push(String(mese).padStart(2, '0')); }
  if (dataFrom)   { sql += ' AND m.data >= ?';                           params.push(dataFrom); }
  if (dataTo)     { sql += ' AND m.data <= ?';                           params.push(dataTo); }

  sql += ' ORDER BY m.data DESC, m.id DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => ({
    id: r.id, data: r.data,
    prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    tipo: r.tipo, quantita: r.quantita, causale: r.causale,
    documentoTipo: r.documento_tipo, documentoId: r.documento_id, documentoNumero: r.documento_numero,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome,
    note: r.note,
    varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
  })));
});

// Giacenza storica: quantità di ogni prodotto a una data passata
// Algoritmo: giacenza_attuale + scarichi_dopo_data - carichi_dopo_data
router.get('/storico', (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ error: 'Parametro data richiesto (YYYY-MM-DD)' });

  const rows = db.prepare(`
    SELECT
      p.id, p.nome, p.categoria, p.unita_misura, p.soglia_minima,
      ROUND(
        p.quantita
        + COALESCE(SUM(CASE WHEN m.tipo='SCARICO' AND m.data > ? THEN m.quantita ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN m.tipo='CARICO'  AND m.data > ? THEN m.quantita ELSE 0 END), 0)
      , 4) AS quantita_storica
    FROM prodotti p
    LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
    GROUP BY p.id
    ORDER BY p.nome
  `).all(data, data);

  res.json(rows.map(r => ({
    id: r.id, nome: r.nome, categoria: r.categoria,
    unitaMisura: r.unita_misura, sogliaMinima: r.soglia_minima,
    quantita: r.quantita_storica,
  })));
});

module.exports = router;
