const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, c.ragione_sociale as cliente_nome
    FROM fatture f LEFT JOIN clienti c ON f.cliente_id = c.id
    ORDER BY f.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT f.*, c.ragione_sociale as cliente_nome
    FROM fatture f LEFT JOIN clienti c ON f.cliente_id = c.id
    WHERE f.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const f = req.body;
  const result = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato, tipo_pagamento_id)
    VALUES (?,?,?,?,?,?,?)`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, f.ddtId || null, f.note, f.stato || 'BOZZA', f.tipoPagamentoId || null);
  const fatturaId = result.lastInsertRowid;
  if (f.righe?.length) saveRighe(fatturaId, f.righe);
  creaPagamentoImmediato(fatturaId);
  res.json({ id: fatturaId });
});

router.put('/:id', (req, res) => {
  const f = req.body;
  db.prepare(`UPDATE fatture SET numero=?, data_emissione=?, cliente_id=?, ddt_id=?, note=?, stato=?, tipo_pagamento_id=? WHERE id=?`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, f.ddtId || null, f.note, f.stato, f.tipoPagamentoId || null, req.params.id);
  db.prepare('DELETE FROM fatture_righe WHERE fattura_id=?').run(req.params.id);
  if (f.righe?.length) saveRighe(req.params.id, f.righe);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fatture WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function saveRighe(fatturaId, righe) {
  const stmt = db.prepare(`INSERT INTO fatture_righe (fattura_id, prodotto_id, descrizione, quantita, prezzo, iva, unita_misura)
    VALUES (?,?,?,?,?,?,?)`);
  for (const r of righe) stmt.run(fatturaId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo, r.iva, r.unitaMisura || '');
}

function getRighe(fatturaId) {
  const rows = db.prepare(`SELECT fr.*, p.nome as prodotto_nome
    FROM fatture_righe fr LEFT JOIN prodotti p ON fr.prodotto_id = p.id
    WHERE fr.fattura_id=?`).all(fatturaId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura, prezzo: r.prezzo, iva: r.iva
  }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 + iva/100)), 0) as t FROM fatture_righe WHERE fattura_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo), 0) as t FROM fatture_righe WHERE fattura_id=?`).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    ddtId: r.ddt_id, note: r.note, stato: r.stato, totale, imponibile,
    tipoPagamentoId: r.tipo_pagamento_id
  };
}

router.patch('/:id/stato', (req, res) => {
  const { stato } = req.body;
  db.prepare('UPDATE fatture SET stato=? WHERE id=?').run(stato, req.params.id);
  if (stato === 'EMESSA') {
    creaPagamentoImmediato(req.params.id);
  }
  res.json({ success: true });
});

function creaPagamentoImmediato(fatturaId) {
  const fattura = db.prepare('SELECT * FROM fatture WHERE id=?').get(fatturaId);
  if (!fattura?.tipo_pagamento_id) return;
  const tp = db.prepare('SELECT * FROM tipi_pagamento WHERE id=?').get(fattura.tipo_pagamento_id);
  if (tp?.immediato !== 1) return;
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 + iva/100)), 0) as t
    FROM fatture_righe WHERE fattura_id=?`).get(fatturaId)?.t || 0;
  if (totale <= 0) return;
  db.prepare(`INSERT INTO pagamenti (fattura_id, data_pagamento, importo, metodo, note, tipo, tipo_pagamento_id, conto)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(fatturaId, fattura.data_emissione, totale, tp.nome, 'Pagamento automatico', 'ENTRATA', tp.id, tp.conto);
  db.prepare("UPDATE fatture SET stato='PAGATA' WHERE id=?").run(fatturaId);
}

module.exports = router;
