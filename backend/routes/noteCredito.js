const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT n.*, c.ragione_sociale as cliente_nome
    FROM note_credito n LEFT JOIN clienti c ON n.cliente_id = c.id
    ORDER BY n.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT n.*, c.ragione_sociale as cliente_nome
    FROM note_credito n LEFT JOIN clienti c ON n.cliente_id = c.id WHERE n.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const n = req.body;
  const result = db.prepare(`INSERT INTO note_credito (numero, data_emissione, cliente_id, fattura_id, note, stato)
    VALUES (?,?,?,?,?,?)`)
    .run(n.numero, n.dataEmissione, n.clienteId || null, n.fatturaId || null, n.note, n.stato || 'BOZZA');
  if (n.righe?.length) saveRighe(result.lastInsertRowid, n.righe);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const n = req.body;
  db.prepare(`UPDATE note_credito SET numero=?, data_emissione=?, cliente_id=?, fattura_id=?, note=?, stato=? WHERE id=?`)
    .run(n.numero, n.dataEmissione, n.clienteId || null, n.fatturaId || null, n.note, n.stato, req.params.id);
  db.prepare('DELETE FROM note_credito_righe WHERE nota_credito_id=?').run(req.params.id);
  if (n.righe?.length) saveRighe(req.params.id, n.righe);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM note_credito WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function saveRighe(ncId, righe) {
  const stmt = db.prepare(`INSERT INTO note_credito_righe (nota_credito_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const r of righe) stmt.run(ncId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo, r.sconto ?? 0, r.iva, r.unitaMisura || '');
}

function getRighe(ncId) {
  return db.prepare(`SELECT r.*, p.nome as prodotto_nome FROM note_credito_righe r
    LEFT JOIN prodotti p ON r.prodotto_id = p.id WHERE r.nota_credito_id=?`).all(ncId)
    .map(r => ({ id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
      descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
      prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM note_credito_righe WHERE nota_credito_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM note_credito_righe WHERE nota_credito_id=?`).get(r.id)?.t || 0;
  return { id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    fatturaId: r.fattura_id, note: r.note, stato: r.stato, totale, imponibile };
}

router.patch('/:id/stato', (req, res) => {
  db.prepare('UPDATE note_credito SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  res.json({ success: true });
});

module.exports = router;
