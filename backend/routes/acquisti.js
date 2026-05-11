const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, f.ragione_sociale as fornitore_nome, tp.nome as tipo_pagamento_nome
    FROM acquisti a
    LEFT JOIN fornitori f ON a.fornitore_id = f.id
    LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
    ORDER BY a.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT a.*, f.ragione_sociale as fornitore_nome, tp.nome as tipo_pagamento_nome
    FROM acquisti a
    LEFT JOIN fornitori f ON a.fornitore_id = f.id
    LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
    WHERE a.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const a = req.body;
  const result = db.prepare(`INSERT INTO acquisti (numero,data_emissione,fornitore_id,tipo_pagamento_id,note,stato)
    VALUES (?,?,?,?,?,?)`)
    .run(a.numero, a.dataEmissione, a.fornitoreId || null, a.tipoPagamentoId || null, a.note || '', a.stato || 'RICEVUTA');
  if (a.righe?.length) saveRighe(result.lastInsertRowid, a.righe);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const a = req.body;
  db.prepare(`UPDATE acquisti SET numero=?,data_emissione=?,fornitore_id=?,tipo_pagamento_id=?,note=?,stato=? WHERE id=?`)
    .run(a.numero, a.dataEmissione, a.fornitoreId || null, a.tipoPagamentoId || null, a.note || '', a.stato, req.params.id);
  db.prepare('DELETE FROM acquisti_righe WHERE acquisto_id=?').run(req.params.id);
  if (a.righe?.length) saveRighe(req.params.id, a.righe);
  res.json({ success: true });
});

router.patch('/:id/stato', (req, res) => {
  db.prepare('UPDATE acquisti SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM acquisti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function saveRighe(acquistoId, righe) {
  const stmt = db.prepare(`INSERT INTO acquisti_righe (acquisto_id,prodotto_id,descrizione,quantita,prezzo,iva,unita_misura)
    VALUES (?,?,?,?,?,?,?)`);
  for (const r of righe) stmt.run(acquistoId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo, r.iva, r.unitaMisura || '');
}

function getRighe(acquistoId) {
  const rows = db.prepare(`SELECT ar.*, p.nome as prodotto_nome
    FROM acquisti_righe ar LEFT JOIN prodotti p ON ar.prodotto_id = p.id
    WHERE ar.acquisto_id=?`).all(acquistoId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura, prezzo: r.prezzo, iva: r.iva
  }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 + iva/100)), 0) as t FROM acquisti_righe WHERE acquisto_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo), 0) as t FROM acquisti_righe WHERE acquisto_id=?`).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome,
    tipoPagamentoId: r.tipo_pagamento_id, tipoPagamentoNome: r.tipo_pagamento_nome,
    note: r.note, stato: r.stato, totale, imponibile
  };
}

module.exports = router;
