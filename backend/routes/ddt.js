const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, c.ragione_sociale as cliente_nome,
           f.id as fattura_id, f.numero as fattura_numero
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    LEFT JOIN fatture f ON f.ddt_id = d.id
    ORDER BY d.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, c.ragione_sociale as cliente_nome
    FROM ddt d LEFT JOIN clienti c ON d.cliente_id = c.id
    WHERE d.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const d = req.body;
  const result = db.prepare(`INSERT INTO ddt (numero, data_emissione, cliente_id, causale, note, stato)
    VALUES (?,?,?,?,?,?)`)
    .run(d.numero, d.dataEmissione, d.clienteId || null, d.causale, d.note, d.stato || 'BOZZA');
  if (d.righe?.length) saveRighe(result.lastInsertRowid, d.righe);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const d = req.body;
  db.prepare(`UPDATE ddt SET numero=?, data_emissione=?, cliente_id=?, causale=?, note=?, stato=? WHERE id=?`)
    .run(d.numero, d.dataEmissione, d.clienteId || null, d.causale, d.note, d.stato, req.params.id);
  db.prepare('DELETE FROM ddt_righe WHERE ddt_id=?').run(req.params.id);
  if (d.righe?.length) saveRighe(req.params.id, d.righe);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM ddt WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function saveRighe(ddtId, righe) {
  const stmt = db.prepare(`INSERT INTO ddt_righe (ddt_id, prodotto_id, descrizione, quantita, prezzo, iva, unita_misura)
    VALUES (?,?,?,?,?,?,?)`);
  for (const r of righe) stmt.run(ddtId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo, r.iva, r.unitaMisura || '');
}

function getRighe(ddtId) {
  const rows = db.prepare(`SELECT dr.*, p.nome as prodotto_nome
    FROM ddt_righe dr LEFT JOIN prodotti p ON dr.prodotto_id = p.id
    WHERE dr.ddt_id=?`).all(ddtId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura, prezzo: r.prezzo, iva: r.iva
  }));
}

router.patch('/:id/stato', (req, res) => {
  db.prepare('UPDATE ddt SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  res.json({ success: true });
});

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 + iva/100)), 0) as t FROM ddt_righe WHERE ddt_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo), 0) as t FROM ddt_righe WHERE ddt_id=?`).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    causale: r.causale, note: r.note, stato: r.stato,
    fatturaId: r.fattura_id || null, fatturaNumero: r.fattura_numero || null,
    totale, imponibile,
  };
}

module.exports = router;
