const express = require('express');
const router = express.Router();
const db = require('../database');
const { audit } = require('../utils/audit');
const { calcolaTotaliFiscali, fiscFromRow } = require('../utils/fiscale');

const FISC_COLS = ['ritenuta_aliquota', 'ritenuta_causale', 'ritenuta_tipo', 'ritenuta_su_cassa',
  'cassa_tipo', 'cassa_aliquota', 'cassa_iva', 'bollo'];
function fiscValues(n) {
  return [
    Number(n.ritenutaAliquota) || 0, n.ritenutaCausale || '', n.ritenutaTipo || '',
    n.ritenutaSuCassa ? 1 : 0, n.cassaTipo || '', Number(n.cassaAliquota) || 0,
    Number(n.cassaIva) || 0, n.bollo ? 1 : 0,
  ];
}

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

// Helper magazzino: una nota di credito tipicamente RIENTRA merce
// (delta +1: la merce torna dal cliente al magazzino del fornitore).
// L'eliminazione/storno della nota di credito SCARICA di nuovo (delta -1).
function aggiornaQuantita(righe, delta, ctx = {}) {
  const stmtQ = db.prepare('UPDATE prodotti SET quantita = quantita + ? WHERE id = ?');
  const stmtV = db.prepare('UPDATE prodotto_varianti SET quantita = quantita + ? WHERE id = ?');
  const stmtM = db.prepare(`INSERT INTO movimenti_magazzino
    (data,prodotto_id,prodotto_nome,tipo,quantita,causale,documento_tipo,documento_id,documento_numero,cliente_id,cliente_nome,note,variante_id,variante_taglia,variante_colore)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const oggi = new Date().toISOString().split('T')[0];
  for (const r of righe) {
    if (!r.prodottoId) continue;
    const qty = +r.quantita || 0;
    if (!qty) continue;
    stmtQ.run(delta * qty, r.prodottoId);
    if (r.varianteId) stmtV.run(delta * qty, r.varianteId);
    const prod = db.prepare('SELECT nome FROM prodotti WHERE id=?').get(r.prodottoId);
    stmtM.run(
      ctx.data || oggi, r.prodottoId, prod?.nome || r.descrizione || '',
      delta > 0 ? 'CARICO' : 'SCARICO', Math.abs(delta * qty),
      ctx.causale || '', ctx.documentoTipo || 'NOTA_CREDITO',
      ctx.documentoId || null, ctx.documentoNumero || '',
      ctx.clienteId || null, ctx.clienteNome || '',
      ctx.note || '',
      r.varianteId || null, r.varianteTaglia || '', r.varianteColore || ''
    );
  }
}

router.post('/', (req, res) => {
  const n = req.body;
  const dup = db.prepare('SELECT id FROM note_credito WHERE numero=?').get(n.numero);
  if (dup) return res.status(409).json({ error: `Il numero ${n.numero} è già utilizzato da un altro documento` });
  try {
    const id = db.transaction(() => {
      const result = db.prepare(`INSERT INTO note_credito (numero, data_emissione, cliente_id, fattura_id, note, stato, ${FISC_COLS.join(', ')})
        VALUES (?,?,?,?,?,?,${FISC_COLS.map(() => '?').join(',')})`)
        .run(n.numero, n.dataEmissione, n.clienteId || null, n.fatturaId || null, n.note, n.stato || 'EMESSA', ...fiscValues(n));
      const id = result.lastInsertRowid;
      if (n.righe?.length) {
        saveRighe(id, n.righe);
        // Reso merce: la quantità torna nel magazzino
        const cliente = n.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(n.clienteId) : null;
        aggiornaQuantita(n.righe, +1, {
          data: n.dataEmissione, causale: 'NOTA_CREDITO',
          documentoTipo: 'NOTA_CREDITO', documentoId: id, documentoNumero: n.numero,
          clienteId: n.clienteId || null, clienteNome: cliente?.ragione_sociale || '',
        });
      }
      // La fattura collegata passa a STORNATA.
      if (n.fatturaId) db.prepare("UPDATE fatture SET stato='STORNATA' WHERE id=?").run(n.fatturaId);
      return id;
    })();
    audit('nota_credito', id, 'CREATE', { numero: n.numero, clienteId: n.clienteId, fatturaId: n.fatturaId, stato: n.stato || 'EMESSA', numRighe: n.righe?.length || 0 });
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const n = req.body;
  const dup = db.prepare('SELECT id FROM note_credito WHERE numero=? AND id!=?').get(n.numero, req.params.id);
  if (dup) return res.status(409).json({ error: `Il numero ${n.numero} è già utilizzato da un altro documento` });
  try {
    const before = db.transaction(() => {
      const before = db.prepare('SELECT numero, data_emissione, cliente_id, fattura_id, stato FROM note_credito WHERE id=?').get(req.params.id);
      // Storno righe vecchie dal magazzino (delta -1: la merce esce di nuovo)
      const vecchieRighe = getRighe(req.params.id);
      if (vecchieRighe.length) {
        const oldNC = db.prepare('SELECT numero, cliente_id FROM note_credito WHERE id=?').get(req.params.id);
        const oldCliente = oldNC?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(oldNC.cliente_id) : null;
        aggiornaQuantita(vecchieRighe, -1, {
          causale: 'STORNO', documentoTipo: 'NOTA_CREDITO',
          documentoId: Number(req.params.id), documentoNumero: oldNC?.numero || '',
          clienteId: oldNC?.cliente_id || null, clienteNome: oldCliente?.ragione_sociale || '',
        });
      }
      db.prepare(`UPDATE note_credito SET numero=?, data_emissione=?, cliente_id=?, fattura_id=?, note=?, stato=?, ${FISC_COLS.map(c => c + '=?').join(', ')} WHERE id=?`)
        .run(n.numero, n.dataEmissione, n.clienteId || null, n.fatturaId || null, n.note, n.stato, ...fiscValues(n), req.params.id);
      db.prepare('DELETE FROM note_credito_righe WHERE nota_credito_id=?').run(req.params.id);
      if (n.righe?.length) {
        saveRighe(req.params.id, n.righe);
        // Applica le nuove righe (delta +1)
        const cliente = n.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(n.clienteId) : null;
        aggiornaQuantita(n.righe, +1, {
          data: n.dataEmissione, causale: 'NOTA_CREDITO',
          documentoTipo: 'NOTA_CREDITO', documentoId: Number(req.params.id), documentoNumero: n.numero,
          clienteId: n.clienteId || null, clienteNome: cliente?.ragione_sociale || '',
        });
      }
      // Aggiorna lo stato delle fatture coinvolte: la vecchia esce da STORNATA se
      // non ha più note collegate, la nuova passa a STORNATA.
      if (before?.fattura_id && before.fattura_id !== (n.fatturaId || null)) ricalcolaStatoFattura(before.fattura_id);
      if (n.fatturaId) db.prepare("UPDATE fatture SET stato='STORNATA' WHERE id=?").run(n.fatturaId);
      return before;
    })();
    audit('nota_credito', Number(req.params.id), 'UPDATE', { before, after: { numero: n.numero, dataEmissione: n.dataEmissione, clienteId: n.clienteId, fatturaId: n.fatturaId, stato: n.stato, numRighe: n.righe?.length || 0 } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const snapshot = db.transaction(() => {
      const snapshot = db.prepare('SELECT numero, cliente_id, fattura_id, stato, data_emissione FROM note_credito WHERE id=?').get(req.params.id);
      // Storno: la nota di credito scompare, la merce esce di nuovo dal magazzino
      const righe = getRighe(req.params.id);
      if (righe.length) {
        const oldNC = db.prepare('SELECT numero, cliente_id FROM note_credito WHERE id=?').get(req.params.id);
        const oldCliente = oldNC?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(oldNC.cliente_id) : null;
        aggiornaQuantita(righe, -1, {
          causale: 'ELIMINAZIONE', documentoTipo: 'NOTA_CREDITO',
          documentoId: Number(req.params.id), documentoNumero: oldNC?.numero || '',
          clienteId: oldNC?.cliente_id || null, clienteNome: oldCliente?.ragione_sociale || '',
        });
      }
      db.prepare('DELETE FROM note_credito WHERE id=?').run(req.params.id);
      // Se era collegata a una fattura, ricalcola lo stato (esce da STORNATA se
      // non restano altre note di credito collegate).
      if (snapshot?.fattura_id) ricalcolaStatoFattura(snapshot.fattura_id);
      return snapshot;
    })();
    audit('nota_credito', Number(req.params.id), 'DELETE', snapshot || {});
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function saveRighe(ncId, righe) {
  const stmt = db.prepare(`INSERT INTO note_credito_righe
    (nota_credito_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(ncId, r.prodottoId || null, r.codiceProdotto || '', r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO');
}

function getRighe(ncId) {
  return db.prepare(`SELECT r.*, p.nome as prodotto_nome FROM note_credito_righe r
    LEFT JOIN prodotti p ON r.prodotto_id = p.id WHERE r.nota_credito_id=?`).all(ncId)
    .map(r => ({ id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
      codiceProdotto: r.codice_prodotto || '',
      descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
      prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva,
      varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
      tipo: r.tipo || 'PRODOTTO' }));
}

/** Ricalcola lo stato della fattura collegata dopo la rimozione/spostamento di una NC. */
function ricalcolaStatoFattura(fatturaId) {
  if (!fatturaId) return;
  // Se restano altre note di credito collegate, la fattura resta STORNATA.
  const altre = db.prepare('SELECT COUNT(*) AS n FROM note_credito WHERE fattura_id=?').get(fatturaId).n;
  if (altre > 0) { db.prepare("UPDATE fatture SET stato='STORNATA' WHERE id=?").run(fatturaId); return; }
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100.0)*(1+COALESCE(iva,0)/100.0)),0) AS t FROM fatture_righe WHERE fattura_id=?`).get(fatturaId)?.t || 0;
  const pagato = db.prepare('SELECT COALESCE(SUM(importo),0) AS t FROM pagamenti WHERE fattura_id=?').get(fatturaId)?.t || 0;
  const stato = pagato >= totale && totale > 0 ? 'PAGATA' : 'EMESSA';
  db.prepare('UPDATE fatture SET stato=? WHERE id=?').run(stato, fatturaId);
}

function toDto(r) {
  const righe = db.prepare('SELECT quantita, prezzo, sconto, iva FROM note_credito_righe WHERE nota_credito_id=?').all(r.id);
  const fisc = fiscFromRow(r);
  const t = calcolaTotaliFiscali(righe, fisc);
  return { id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    fatturaId: r.fattura_id, note: r.note, stato: r.stato,
    imponibile: t.imponibile, totale: t.totale,
    ritenutaAliquota: fisc.ritenutaAliquota, ritenutaCausale: fisc.ritenutaCausale,
    ritenutaTipo: fisc.ritenutaTipo, ritenutaSuCassa: fisc.ritenutaSuCassa,
    cassaTipo: fisc.cassaTipo, cassaAliquota: fisc.cassaAliquota, cassaIva: fisc.cassaIva,
    bollo: fisc.bollo,
    cassaImporto: t.cassaImporto, iva: t.iva, ritenutaImporto: t.ritenutaImporto,
    bolloImporto: t.bolloImporto, nettoAPagare: t.nettoAPagare };
}

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`SELECT n.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
    c.citta as c_citta, c.provincia as c_provincia, c.p_iva as c_p_iva,
    f.numero as fattura_numero
    FROM note_credito n
    LEFT JOIN clienti c ON n.cliente_id = c.id
    LEFT JOIN fatture f ON n.fattura_id = f.id
    WHERE n.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  dto.cliente = { ragioneSociale: row.c_nome, via: row.c_via, cap: row.c_cap, citta: row.c_citta, provincia: row.c_provincia, pIva: row.c_p_iva };
  dto.fatturaNumeroColl = row.fattura_numero || '';
  res.json(dto);
});

router.patch('/:id/stato', (req, res) => {
  const before = db.prepare('SELECT stato FROM note_credito WHERE id=?').get(req.params.id);
  db.prepare('UPDATE note_credito SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  audit('nota_credito', Number(req.params.id), 'UPDATE', { before, after: { stato: req.body.stato } });
  res.json({ success: true });
});

module.exports = router;
