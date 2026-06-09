const express = require('express');
const router = express.Router();
const db = require('../database');
const { audit } = require('../utils/audit');
const { getNextNumero } = require('../utils/nextNumero');

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT o.*, c.ragione_sociale as cliente_nome, f.ragione_sociale as fornitore_nome,
    a.numero as acquisto_numero
    FROM ordini o
    LEFT JOIN clienti c ON o.cliente_id = c.id
    LEFT JOIN fornitori f ON o.fornitore_id = f.id
    LEFT JOIN acquisti a ON o.acquisto_id = a.id
    ${req.query.tipo ? "WHERE o.tipo = @tipo" : ''}
    ORDER BY o.data_ordine DESC`).all(req.query.tipo ? { tipo: req.query.tipo } : {});
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
  const dup = db.prepare('SELECT id FROM ordini WHERE numero=?').get(o.numero);
  if (dup) return res.status(409).json({ error: `Il numero ${o.numero} è già utilizzato da un altro documento` });
  const result = db.prepare(`INSERT INTO ordini (numero, data_ordine, cliente_id, fornitore_id, tipo, stato, note, acquisto_id)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(o.numero, o.dataOrdine, o.clienteId || null, o.fornitoreId || null, o.tipo || 'CLIENTE', o.stato || 'APERTO', o.note, o.acquistoId || null);
  if (o.righe?.length) saveRighe(result.lastInsertRowid, o.righe);
  audit('ordine', result.lastInsertRowid, 'CREATE', { numero: o.numero, tipo: o.tipo, clienteId: o.clienteId, fornitoreId: o.fornitoreId, stato: o.stato || 'APERTO', numRighe: o.righe?.length || 0 });
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const o = req.body;
  const dup = db.prepare('SELECT id FROM ordini WHERE numero=? AND id!=?').get(o.numero, req.params.id);
  if (dup) return res.status(409).json({ error: `Il numero ${o.numero} è già utilizzato da un altro documento` });
  const before = db.prepare('SELECT numero, data_ordine, cliente_id, fornitore_id, tipo, stato FROM ordini WHERE id=?').get(req.params.id);
  db.prepare(`UPDATE ordini SET numero=?, data_ordine=?, cliente_id=?, fornitore_id=?, tipo=?, stato=?, note=? WHERE id=?`)
    .run(o.numero, o.dataOrdine, o.clienteId || null, o.fornitoreId || null, o.tipo, o.stato, o.note, req.params.id);
  db.prepare('DELETE FROM ordini_righe WHERE ordine_id=?').run(req.params.id);
  if (o.righe?.length) saveRighe(req.params.id, o.righe);
  audit('ordine', Number(req.params.id), 'UPDATE', { before, after: { numero: o.numero, dataOrdine: o.dataOrdine, clienteId: o.clienteId, fornitoreId: o.fornitoreId, tipo: o.tipo, stato: o.stato, numRighe: o.righe?.length || 0 } });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const snapshot = db.prepare('SELECT numero, cliente_id, fornitore_id, tipo, stato, data_ordine FROM ordini WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM ordini WHERE id=?').run(req.params.id);
  audit('ordine', Number(req.params.id), 'DELETE', snapshot || {});
  res.json({ success: true });
});

function saveRighe(ordineId, righe) {
  const stmt = db.prepare(`INSERT INTO ordini_righe
    (ordine_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo, codice_fornitore)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(ordineId, r.prodottoId || null, r.codiceProdotto || '', r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO', r.codiceFornitore || '');
}

function getRighe(ordineId) {
  return db.prepare(`SELECT r.*, p.nome as prodotto_nome FROM ordini_righe r
    LEFT JOIN prodotti p ON r.prodotto_id = p.id WHERE r.ordine_id=?`).all(ordineId)
    .map(r => ({ id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
      codiceProdotto: r.codice_prodotto || '',
      descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
      prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva,
      varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
      tipo: r.tipo || 'PRODOTTO', codiceFornitore: r.codice_fornitore || '' }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM ordini_righe WHERE ordine_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM ordini_righe WHERE ordine_id=?`).get(r.id)?.t || 0;
  return { id: r.id, numero: r.numero, dataOrdine: r.data_ordine,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome,
    acquistoId: r.acquisto_id || null, acquistoNumero: r.acquisto_numero || null,
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
  const before = db.prepare('SELECT stato FROM ordini WHERE id=?').get(req.params.id);
  db.prepare('UPDATE ordini SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  audit('ordine', Number(req.params.id), 'UPDATE', { before, after: { stato: req.body.stato } });
  res.json({ success: true });
});

// Collega / scollega una fattura ricevuta (acquisto) all'ordine fornitore.
router.patch('/:id/acquisto', (req, res) => {
  const acquistoId = req.body?.acquistoId || null;
  db.prepare('UPDATE ordini SET acquisto_id=? WHERE id=?').run(acquistoId, req.params.id);
  res.json({ success: true });
});

// ── POST /:id/to-ddt – converti ordine cliente in DDT ────────────────────────
router.post('/:id/to-ddt', (req, res) => {
  const ordine = db.prepare('SELECT * FROM ordini WHERE id=?').get(req.params.id);
  if (!ordine) return res.status(404).json({ error: 'Ordine non trovato' });
  if (ordine.tipo !== 'CLIENTE') return res.status(400).json({ error: 'Solo gli ordini cliente possono essere convertiti in DDT' });
  const righe = getRighe(ordine.id);
  try {
    const out = db.transaction(() => {
      // Numerazione coerente (prefisso/anno) tramite getNextNumero, non COUNT(*)+1
      // che ignorava i prefissi e poteva collidere dopo le cancellazioni.
      const numero = getNextNumero('ddt', 'ddt');
      const data = new Date().toISOString().split('T')[0];
      const result = db.prepare(`
        INSERT INTO ddt (numero, data_emissione, cliente_id, causale, stato)
        VALUES (?,?,?,?,?)`)
        .run(numero, data, ordine.cliente_id, `Da ordine n. ${ordine.numero}`, 'EMESSO');
      const ddtId = result.lastInsertRowid;
      const stmt = db.prepare(`INSERT INTO ddt_righe
        (ddt_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      for (const r of righe)
        stmt.run(ddtId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
                 r.sconto ?? 0, r.iva, r.unitaMisura || '', r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '');
      db.prepare('UPDATE ordini SET stato=? WHERE id=?').run('EVASO', ordine.id);
      return { id: ddtId, numero };
    })();
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
