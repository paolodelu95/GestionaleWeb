const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT o.*, c.ragione_sociale as cliente_nome, f.ragione_sociale as fornitore_nome
    FROM ordini o
    LEFT JOIN clienti c ON o.cliente_id = c.id
    LEFT JOIN fornitori f ON o.fornitore_id = f.id
    ORDER BY o.data_ordine DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/count-aperti', (req, res) => {
  const r = db.prepare("SELECT COUNT(*) as count FROM ordini WHERE stato='APERTO'").get();
  res.json(r.count);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT o.*, c.ragione_sociale as cliente_nome, f.ragione_sociale as fornitore_nome
    FROM ordini o LEFT JOIN clienti c ON o.cliente_id = c.id LEFT JOIN fornitori f ON o.fornitore_id = f.id
    WHERE o.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const o = req.body;
  const result = db.prepare(`INSERT INTO ordini (numero, data_ordine, cliente_id, fornitore_id, tipo, stato, note)
    VALUES (?,?,?,?,?,?,?)`)
    .run(o.numero, o.dataOrdine, o.clienteId || null, o.fornitoreId || null, o.tipo || 'CLIENTE', o.stato || 'APERTO', o.note);
  if (o.righe?.length) saveRighe(result.lastInsertRowid, o.righe);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const o = req.body;
  db.prepare(`UPDATE ordini SET numero=?, data_ordine=?, cliente_id=?, fornitore_id=?, tipo=?, stato=?, note=? WHERE id=?`)
    .run(o.numero, o.dataOrdine, o.clienteId || null, o.fornitoreId || null, o.tipo, o.stato, o.note, req.params.id);
  db.prepare('DELETE FROM ordini_righe WHERE ordine_id=?').run(req.params.id);
  if (o.righe?.length) saveRighe(req.params.id, o.righe);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM ordini WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function saveRighe(ordineId, righe) {
  const stmt = db.prepare(`INSERT INTO ordini_righe (ordine_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura) VALUES (?,?,?,?,?,?,?,?)`);
  for (const r of righe) stmt.run(ordineId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo, r.sconto ?? 0, r.iva, r.unitaMisura || '');
}

function getRighe(ordineId) {
  return db.prepare(`SELECT r.*, p.nome as prodotto_nome FROM ordini_righe r
    LEFT JOIN prodotti p ON r.prodotto_id = p.id WHERE r.ordine_id=?`).all(ordineId)
    .map(r => ({ id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
      descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
      prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM ordini_righe WHERE ordine_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM ordini_righe WHERE ordine_id=?`).get(r.id)?.t || 0;
  return { id: r.id, numero: r.numero, dataOrdine: r.data_ordine,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome,
    tipo: r.tipo, stato: r.stato, note: r.note, totale, imponibile };
}

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`SELECT o.*,
    c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap, c.citta as c_citta, c.provincia as c_provincia, c.p_iva as c_p_iva,
    f.ragione_sociale as f_nome, f.via as f_via, f.cap as f_cap, f.citta as f_citta, f.provincia as f_provincia, f.p_iva as f_p_iva
    FROM ordini o
    LEFT JOIN clienti c ON o.cliente_id = c.id
    LEFT JOIN fornitori f ON o.fornitore_id = f.id
    WHERE o.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  dto.cliente = { ragioneSociale: row.c_nome, via: row.c_via, cap: row.c_cap, citta: row.c_citta, provincia: row.c_provincia, pIva: row.c_p_iva };
  dto.fornitore = { ragioneSociale: row.f_nome, via: row.f_via, cap: row.f_cap, citta: row.f_citta, provincia: row.f_provincia, pIva: row.f_p_iva };
  res.json(dto);
});

router.patch('/:id/stato', (req, res) => {
  db.prepare('UPDATE ordini SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  res.json({ success: true });
});

module.exports = router;
