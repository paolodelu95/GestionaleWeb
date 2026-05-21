const express = require('express');
const router = express.Router();
const db = require('../database');
const { audit } = require('../utils/audit');

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT p.*, c.ragione_sociale as cliente_nome
    FROM preventivi p LEFT JOIN clienti c ON p.cliente_id = c.id
    ORDER BY p.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT p.*, c.ragione_sociale as cliente_nome
    FROM preventivi p LEFT JOIN clienti c ON p.cliente_id = c.id WHERE p.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const p = req.body;
  const result = db.prepare(`INSERT INTO preventivi (numero, data_emissione, cliente_id, validita, stato, note)
    VALUES (?,?,?,?,?,?)`)
    .run(p.numero, p.dataEmissione, p.clienteId || null, p.validita || 30, p.stato || 'BOZZA', p.note);
  if (p.righe?.length) saveRighe(result.lastInsertRowid, p.righe);
  audit('preventivo', result.lastInsertRowid, 'CREATE', { numero: p.numero, clienteId: p.clienteId, stato: p.stato || 'BOZZA', numRighe: p.righe?.length || 0 });
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const p = req.body;
  const before = db.prepare('SELECT numero, data_emissione, cliente_id, stato, validita, note FROM preventivi WHERE id=?').get(req.params.id);
  db.prepare(`UPDATE preventivi SET numero=?, data_emissione=?, cliente_id=?, validita=?, stato=?, note=? WHERE id=?`)
    .run(p.numero, p.dataEmissione, p.clienteId || null, p.validita, p.stato, p.note, req.params.id);
  db.prepare('DELETE FROM preventivi_righe WHERE preventivo_id=?').run(req.params.id);
  if (p.righe?.length) saveRighe(req.params.id, p.righe);
  audit('preventivo', Number(req.params.id), 'UPDATE', { before, after: { numero: p.numero, dataEmissione: p.dataEmissione, clienteId: p.clienteId, stato: p.stato, numRighe: p.righe?.length || 0 } });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const snapshot = db.prepare('SELECT numero, cliente_id, stato, data_emissione FROM preventivi WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM preventivi WHERE id=?').run(req.params.id);
  audit('preventivo', Number(req.params.id), 'DELETE', snapshot || {});
  res.json({ success: true });
});

function saveRighe(prevId, righe) {
  const stmt = db.prepare(`INSERT INTO preventivi_righe
    (preventivo_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(prevId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO');
}

function getRighe(prevId) {
  return db.prepare(`SELECT r.*, p.nome as prodotto_nome FROM preventivi_righe r
    LEFT JOIN prodotti p ON r.prodotto_id = p.id WHERE r.preventivo_id=?`).all(prevId)
    .map(r => ({ id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
      descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
      prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva,
      varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
      tipo: r.tipo || 'PRODOTTO' }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM preventivi_righe WHERE preventivo_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM preventivi_righe WHERE preventivo_id=?`).get(r.id)?.t || 0;
  return { id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    validita: r.validita, stato: r.stato, note: r.note, totale, imponibile };
}

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`SELECT p.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
    c.citta as c_citta, c.provincia as c_provincia, c.p_iva as c_p_iva, c.email as c_email, c.telefono as c_telefono
    FROM preventivi p LEFT JOIN clienti c ON p.cliente_id = c.id WHERE p.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  dto.cliente = { ragioneSociale: row.c_nome, via: row.c_via, cap: row.c_cap, citta: row.c_citta, provincia: row.c_provincia, pIva: row.c_p_iva, email: row.c_email, telefono: row.c_telefono };
  res.json(dto);
});

router.patch('/:id/stato', (req, res) => {
  const before = db.prepare('SELECT stato FROM preventivi WHERE id=?').get(req.params.id);
  db.prepare('UPDATE preventivi SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  audit('preventivo', Number(req.params.id), 'UPDATE', { before, after: { stato: req.body.stato } });
  res.json({ success: true });
});

// ── POST /:id/to-ddt – converti preventivo in DDT ────────────────────────────
router.post('/:id/to-ddt', (req, res) => {
  const prev = db.prepare('SELECT * FROM preventivi WHERE id=?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Preventivo non trovato' });
  const righe = getRighe(prev.id);
  const count = db.prepare('SELECT COUNT(*) as n FROM ddt').get();
  const numero = String(count.n + 1);
  const data = new Date().toISOString().split('T')[0];
  const result = db.prepare(`
    INSERT INTO ddt (numero, data_emissione, cliente_id, causale, stato, preventivo_id)
    VALUES (?,?,?,?,?,?)`)
    .run(numero, data, prev.cliente_id, `Da preventivo n. ${prev.numero}`, 'BOZZA', prev.id);
  const ddtId = result.lastInsertRowid;
  const stmt = db.prepare(`INSERT INTO ddt_righe
    (ddt_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(ddtId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '', r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '');
  db.prepare('UPDATE preventivi SET stato=? WHERE id=?').run('CONFERMATO', prev.id);
  res.json({ id: ddtId, numero });
});

// ── POST /:id/to-ordine – converti preventivo in ordine cliente ───────────────
router.post('/:id/to-ordine', (req, res) => {
  const prev = db.prepare('SELECT * FROM preventivi WHERE id=?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Preventivo non trovato' });
  const righe = getRighe(prev.id);
  const count = db.prepare('SELECT COUNT(*) as n FROM ordini').get();
  const numero = String(count.n + 1);
  const data = new Date().toISOString().split('T')[0];
  const result = db.prepare(`
    INSERT INTO ordini (numero, data_ordine, cliente_id, tipo, stato, note, preventivo_id)
    VALUES (?,?,?,?,?,?,?)`)
    .run(numero, data, prev.cliente_id, 'CLIENTE', 'APERTO', `Da preventivo n. ${prev.numero}`, prev.id);
  const ordineId = result.lastInsertRowid;
  const stmt = db.prepare(`INSERT INTO ordini_righe
    (ordine_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(ordineId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '', r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '');
  db.prepare('UPDATE preventivi SET stato=? WHERE id=?').run('CONFERMATO', prev.id);
  res.json({ id: ordineId, numero });
});

module.exports = router;
