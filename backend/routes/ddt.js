const express = require('express');
const router = express.Router();
const db = require('../database');
const { checkRiordino } = require('../utils/riordino');
const { audit } = require('../utils/audit');

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

router.get('/non-fatturati', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, c.ragione_sociale as cliente_nome,
           c.tipo_pagamento_id as cliente_tipo_pagamento_id
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    WHERE d.stato != 'ANNULLATO'
      AND NOT EXISTS (SELECT 1 FROM fatture f WHERE f.ddt_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM fatture_ddt fd WHERE fd.ddt_id = d.id)
    ORDER BY d.cliente_id, d.data_emissione`).all();
  res.json(rows.map(r => ({ ...toDto(r), clienteTipoPagamentoId: r.cliente_tipo_pagamento_id || null })));
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
  const result = db.prepare(`
    INSERT INTO ddt (numero, data_emissione, cliente_id, causale, note, stato,
      data_ora_inizio_trasporto, aspetto_beni, porto, numero_colli, peso_lordo,
      incaricato_trasporto, vettore, destinazione_diversa, note_trasporto, destinazione_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      d.numero, d.dataEmissione, d.clienteId || null,
      d.causaleTrasporto || '', d.note || '', d.stato || 'EMESSO',
      d.dataOraInizioTrasporto || '', d.aspettoBeni || '',
      d.porto || 'Franco', d.numeroColli || 0, d.pesoLordo || 0,
      d.incaricatoTrasporto || 'Mittente', d.vettore || '',
      d.destinazioneDiversa || '', d.noteTrasporto || '',
      d.destinazioneId || null
    );
  const ddtId = result.lastInsertRowid;
  if (d.righe?.length) {
    saveRighe(ddtId, d.righe);
    const cliente = d.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(d.clienteId) : null;
    aggiornaQuantita(d.righe, -1, {
      data: d.dataEmissione, causale: 'DDT', documentoTipo: 'DDT',
      documentoId: ddtId, documentoNumero: d.numero,
      clienteId: d.clienteId || null, clienteNome: cliente?.ragione_sociale || ''
    });
    checkRiordino(d.righe.map(r => r.prodottoId).filter(Boolean));
  }
  audit('ddt', ddtId, 'CREATE', { numero: d.numero, clienteId: d.clienteId, stato: d.stato || 'EMESSO', numRighe: d.righe?.length || 0 });
  res.json({ id: ddtId });
});

router.put('/:id', (req, res) => {
  const d = req.body;
  const old = db.prepare('SELECT numero, cliente_id FROM ddt WHERE id=?').get(req.params.id);
  const before = db.prepare('SELECT numero, data_emissione, cliente_id, stato FROM ddt WHERE id=?').get(req.params.id);
  const vecchieRighe = getRighe(req.params.id);
  if (vecchieRighe.length) {
    const oldCliente = old?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(old.cliente_id) : null;
    aggiornaQuantita(vecchieRighe, +1, {
      causale: 'STORNO', documentoTipo: 'DDT', documentoId: req.params.id,
      documentoNumero: old?.numero || '', clienteId: old?.cliente_id || null, clienteNome: oldCliente?.ragione_sociale || ''
    });
  }
  db.prepare(`
    UPDATE ddt SET numero=?, data_emissione=?, cliente_id=?, causale=?, note=?, stato=?,
      data_ora_inizio_trasporto=?, aspetto_beni=?, porto=?, numero_colli=?, peso_lordo=?,
      incaricato_trasporto=?, vettore=?, destinazione_diversa=?, note_trasporto=?, destinazione_id=?
    WHERE id=?`)
    .run(
      d.numero, d.dataEmissione, d.clienteId || null,
      d.causaleTrasporto || '', d.note || '', d.stato,
      d.dataOraInizioTrasporto || '', d.aspettoBeni || '',
      d.porto || 'Franco', d.numeroColli || 0, d.pesoLordo || 0,
      d.incaricatoTrasporto || 'Mittente', d.vettore || '',
      d.destinazioneDiversa || '', d.noteTrasporto || '',
      d.destinazioneId || null,
      req.params.id
    );
  db.prepare('DELETE FROM ddt_righe WHERE ddt_id=?').run(req.params.id);
  if (d.righe?.length) {
    saveRighe(req.params.id, d.righe);
    const cliente = d.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(d.clienteId) : null;
    aggiornaQuantita(d.righe, -1, {
      data: d.dataEmissione, causale: 'DDT', documentoTipo: 'DDT',
      documentoId: req.params.id, documentoNumero: d.numero,
      clienteId: d.clienteId || null, clienteNome: cliente?.ragione_sociale || ''
    });
  }
  audit('ddt', Number(req.params.id), 'UPDATE', { before, after: { numero: d.numero, dataEmissione: d.dataEmissione, clienteId: d.clienteId, stato: d.stato, numRighe: d.righe?.length || 0 } });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const ddt = db.prepare('SELECT stato, numero, cliente_id FROM ddt WHERE id=?').get(req.params.id);
  if (ddt?.stato !== 'ANNULLATO') {
    const righe = getRighe(req.params.id);
    if (righe.length) {
      const cliente = ddt?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(ddt.cliente_id) : null;
      aggiornaQuantita(righe, +1, {
        causale: 'ELIMINAZIONE', documentoTipo: 'DDT', documentoId: req.params.id,
        documentoNumero: ddt?.numero || '', clienteId: ddt?.cliente_id || null, clienteNome: cliente?.ragione_sociale || ''
      });
    }
  }
  db.prepare('UPDATE fatture SET ddt_id = NULL WHERE ddt_id=?').run(req.params.id);
  db.prepare('DELETE FROM fatture_ddt WHERE ddt_id=?').run(req.params.id);
  db.prepare('DELETE FROM ddt_righe WHERE ddt_id=?').run(req.params.id);
  db.prepare('DELETE FROM ddt WHERE id=?').run(req.params.id);
  audit('ddt', Number(req.params.id), 'DELETE', { numero: ddt?.numero, stato: ddt?.stato, clienteId: ddt?.cliente_id });
  res.json({ success: true });
});

function aggiornaQuantita(righe, delta, ctx = {}) {
  const stmtQ = db.prepare('UPDATE prodotti SET quantita = quantita + ? WHERE id = ?');
  const stmtV = db.prepare('UPDATE prodotto_varianti SET quantita = quantita + ? WHERE id = ?');
  const stmtM = db.prepare(`INSERT INTO movimenti_magazzino
    (data,prodotto_id,prodotto_nome,tipo,quantita,causale,documento_tipo,documento_id,documento_numero,cliente_id,cliente_nome,fornitore_id,fornitore_nome,note,variante_id,variante_taglia,variante_colore)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const oggi = new Date().toISOString().split('T')[0];
  for (const r of righe) {
    if (!r.prodottoId) continue;
    stmtQ.run(delta * r.quantita, r.prodottoId);
    if (r.varianteId) stmtV.run(delta * r.quantita, r.varianteId);
    const prod = db.prepare('SELECT nome FROM prodotti WHERE id=?').get(r.prodottoId);
    stmtM.run(
      ctx.data || oggi, r.prodottoId, prod?.nome || r.descrizione || '',
      delta > 0 ? 'CARICO' : 'SCARICO', Math.abs(delta * r.quantita),
      ctx.causale || '', ctx.documentoTipo || '', ctx.documentoId || null,
      ctx.documentoNumero || '', ctx.clienteId || null, ctx.clienteNome || '',
      ctx.fornitoreId || null, ctx.fornitoreNome || '', ctx.note || '',
      r.varianteId || null, r.varianteTaglia || '', r.varianteColore || ''
    );
  }
}

function saveRighe(ddtId, righe) {
  const stmt = db.prepare(`INSERT INTO ddt_righe
    (ddt_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo, sconto, iva, codice_iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(ddtId, r.prodottoId || null, r.codiceProdotto || '', r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.codiceIva || '', r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO');
}

function getRighe(ddtId) {
  const rows = db.prepare(`SELECT dr.*, p.nome as prodotto_nome
    FROM ddt_righe dr LEFT JOIN prodotti p ON dr.prodotto_id = p.id
    WHERE dr.ddt_id=?`).all(ddtId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    codiceProdotto: r.codice_prodotto || '',
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva, codiceIva: r.codice_iva || '',
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    tipo: r.tipo || 'PRODOTTO'
  }));
}

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
           c.citta as c_citta, c.provincia as c_provincia, c.stato as c_stato,
           c.p_iva as c_p_iva, c.codice_fiscale as c_cod_fiscale,
           c.email as c_email, c.telefono as c_telefono
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    WHERE d.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  dto.cliente = {
    ragioneSociale: row.c_nome, via: row.c_via, cap: row.c_cap,
    citta: row.c_citta, provincia: row.c_provincia, stato: row.c_stato,
    pIva: row.c_p_iva, codFiscale: row.c_cod_fiscale,
    email: row.c_email, telefono: row.c_telefono,
  };
  res.json(dto);
});

// ── POST /:id/to-fattura – converti DDT in fattura ───────────────────────────
router.post('/:id/to-fattura', (req, res) => {
  const ddt = db.prepare('SELECT * FROM ddt WHERE id=?').get(req.params.id);
  if (!ddt) return res.status(404).json({ error: 'DDT non trovato' });
  const existing = db.prepare('SELECT id, numero FROM fatture WHERE ddt_id=?').get(req.params.id);
  if (existing) return res.status(409).json({ error: `DDT già collegato alla fattura n. ${existing.numero}` });
  const righe = getRighe(ddt.id);
  const count = db.prepare('SELECT COUNT(*) as n FROM fatture').get();
  const numero = String(count.n + 1);
  const data = new Date().toISOString().split('T')[0];
  const result = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato)
    VALUES (?,?,?,?,?,?)`)
    .run(numero, data, ddt.cliente_id, ddt.id, `Da DDT n. ${ddt.numero}`, 'EMESSA');
  const fatturaId = result.lastInsertRowid;
  db.prepare('INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id) VALUES (?,?)').run(fatturaId, ddt.id);
  const stmt = db.prepare(`INSERT INTO fatture_righe
    (fattura_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(fatturaId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '', r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '');
  res.json({ id: fatturaId, numero });
});

router.patch('/:id/stato', (req, res) => {
  const { stato } = req.body;
  const vecchio = db.prepare('SELECT stato, numero, cliente_id FROM ddt WHERE id=?').get(req.params.id);
  const righe = getRighe(req.params.id);
  const cliente = vecchio?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(vecchio.cliente_id) : null;
  const ctx = { documentoTipo: 'DDT', documentoId: req.params.id, documentoNumero: vecchio?.numero || '', clienteId: vecchio?.cliente_id || null, clienteNome: cliente?.ragione_sociale || '' };
  if (stato === 'ANNULLATO' && vecchio?.stato !== 'ANNULLATO') {
    aggiornaQuantita(righe, +1, { ...ctx, causale: 'ANNULLAMENTO' });
  } else if (vecchio?.stato === 'ANNULLATO' && stato !== 'ANNULLATO') {
    aggiornaQuantita(righe, -1, { ...ctx, causale: 'RIATTIVAZIONE' });
  }
  db.prepare('UPDATE ddt SET stato=? WHERE id=?').run(stato, req.params.id);
  audit('ddt', Number(req.params.id), 'UPDATE', { before: { stato: vecchio?.stato }, after: { stato } });
  res.json({ success: true });
});

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM ddt_righe WHERE ddt_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM ddt_righe WHERE ddt_id=?`).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    causaleTrasporto: r.causale || '',
    note: r.note, stato: r.stato,
    fatturaId: r.fattura_id || null, fatturaNumero: r.fattura_numero || null,
    totale, imponibile,
    dataOraInizioTrasporto: r.data_ora_inizio_trasporto || '',
    aspettoBeni: r.aspetto_beni || '',
    porto: r.porto || 'Franco',
    numeroColli: r.numero_colli || 0,
    pesoLordo: r.peso_lordo || 0,
    incaricatoTrasporto: r.incaricato_trasporto || 'Mittente',
    vettore: r.vettore || '',
    destinazioneDiversa: r.destinazione_diversa || '',
    noteTrasporto: r.note_trasporto || '',
    destinazioneId: r.destinazione_id || null,
  };
}

module.exports = router;
