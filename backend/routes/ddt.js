const express = require('express');
const router = express.Router();
const db = require('../database');
const { checkRiordino } = require('../utils/riordino');
const { audit } = require('../utils/audit');
const { getNextNumero } = require('../utils/nextNumero');
const { applicaRigheStock } = require('../utils/stock');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, c.ragione_sociale as cliente_nome, fo.ragione_sociale as fornitore_nome,
           f.id as fattura_id, f.numero as fattura_numero
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    LEFT JOIN fornitori fo ON d.fornitore_id = fo.id
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
      AND COALESCE(d.tipo,'CLIENTE') = 'CLIENTE'
      AND NOT EXISTS (SELECT 1 FROM fatture f WHERE f.ddt_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM fatture_ddt fd WHERE fd.ddt_id = d.id)
    ORDER BY d.cliente_id, d.data_emissione`).all();
  res.json(rows.map(r => ({ ...toDto(r), clienteTipoPagamentoId: r.cliente_tipo_pagamento_id || null })));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, c.ragione_sociale as cliente_nome, fo.ragione_sociale as fornitore_nome
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    LEFT JOIN fornitori fo ON d.fornitore_id = fo.id
    WHERE d.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const d = req.body;
  const dup = db.prepare('SELECT id FROM ddt WHERE numero=?').get(d.numero);
  if (dup) return res.status(409).json({ error: `Il numero ${d.numero} è già utilizzato da un altro documento` });
  const isForn = d.tipo === 'FORNITORE';
  const clienteId = isForn ? null : (d.clienteId || null);
  const fornitoreId = isForn ? (d.fornitoreId || null) : null;
  const result = db.prepare(`
    INSERT INTO ddt (numero, data_emissione, tipo, cliente_id, fornitore_id, causale, note, stato,
      data_ora_inizio_trasporto, aspetto_beni, porto, numero_colli, peso_lordo,
      incaricato_trasporto, vettore, destinazione_diversa, note_trasporto, destinazione_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      d.numero, d.dataEmissione, isForn ? 'FORNITORE' : 'CLIENTE', clienteId, fornitoreId,
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
    aggiornaQuantita(d.righe, -1, {
      data: d.dataEmissione, causale: 'DDT', documentoTipo: 'DDT',
      documentoId: ddtId, documentoNumero: d.numero,
      clienteId, clienteNome: controparteNome(d)
    });
    checkRiordino(d.righe.map(r => r.prodottoId).filter(Boolean));
  }
  audit('ddt', ddtId, 'CREATE', { numero: d.numero, tipo: isForn ? 'FORNITORE' : 'CLIENTE', clienteId, fornitoreId, stato: d.stato || 'EMESSO', numRighe: d.righe?.length || 0 });
  res.json({ id: ddtId });
});

router.put('/:id', (req, res) => {
  const d = req.body;
  const dup = db.prepare('SELECT id FROM ddt WHERE numero=? AND id!=?').get(d.numero, req.params.id);
  if (dup) return res.status(409).json({ error: `Il numero ${d.numero} è già utilizzato da un altro documento` });
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
  const isForn = d.tipo === 'FORNITORE';
  const clienteId = isForn ? null : (d.clienteId || null);
  const fornitoreId = isForn ? (d.fornitoreId || null) : null;
  db.prepare(`
    UPDATE ddt SET numero=?, data_emissione=?, tipo=?, cliente_id=?, fornitore_id=?, causale=?, note=?, stato=?,
      data_ora_inizio_trasporto=?, aspetto_beni=?, porto=?, numero_colli=?, peso_lordo=?,
      incaricato_trasporto=?, vettore=?, destinazione_diversa=?, note_trasporto=?, destinazione_id=?
    WHERE id=?`)
    .run(
      d.numero, d.dataEmissione, isForn ? 'FORNITORE' : 'CLIENTE', clienteId, fornitoreId,
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
    aggiornaQuantita(d.righe, -1, {
      data: d.dataEmissione, causale: 'DDT', documentoTipo: 'DDT',
      documentoId: req.params.id, documentoNumero: d.numero,
      clienteId, clienteNome: controparteNome(d)
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

// Movimentazione scorte centralizzata (utils/stock.js).
const aggiornaQuantita = applicaRigheStock;

// Nome della controparte (cliente o fornitore) dal body, per l'etichetta del movimento.
function controparteNome(d) {
  if (d.tipo === 'FORNITORE') {
    const f = d.fornitoreId ? db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(d.fornitoreId) : null;
    return f?.ragione_sociale || '';
  }
  const c = d.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(d.clienteId) : null;
  return c?.ragione_sociale || '';
}

function saveRighe(ddtId, righe) {
  const stmt = db.prepare(`INSERT INTO ddt_righe
    (ddt_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo, sconto, iva, codice_iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo, scarica_magazzino)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(ddtId, r.prodottoId || null, r.codiceProdotto || '', r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.codiceIva || '', r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO', r.scaricaMagazzino === false ? 0 : 1);
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
    tipo: r.tipo || 'PRODOTTO',
    scaricaMagazzino: r.scarica_magazzino !== 0
  }));
}

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
           c.citta as c_citta, c.provincia as c_provincia, c.stato as c_stato,
           c.p_iva as c_p_iva, c.codice_fiscale as c_cod_fiscale,
           c.email as c_email, c.telefono as c_telefono,
           fo.ragione_sociale as f_nome, fo.via as f_via, fo.cap as f_cap,
           fo.citta as f_citta, fo.provincia as f_provincia, fo.stato as f_stato,
           fo.p_iva as f_p_iva, fo.email as f_email, fo.telefono as f_telefono
    FROM ddt d
    LEFT JOIN clienti c ON d.cliente_id = c.id
    LEFT JOIN fornitori fo ON d.fornitore_id = fo.id
    WHERE d.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  // Per un reso a fornitore il destinatario in stampa è il fornitore.
  dto.cliente = (dto.tipo === 'FORNITORE')
    ? {
        ragioneSociale: row.f_nome, via: row.f_via, cap: row.f_cap,
        citta: row.f_citta, provincia: row.f_provincia, stato: row.f_stato,
        pIva: row.f_p_iva, codFiscale: '',
        email: row.f_email, telefono: row.f_telefono,
      }
    : {
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
  if (!ddt) return res.status(404).json({ error: 'Documento di trasporto non trovato' });
  if ((ddt.tipo || 'CLIENTE') === 'FORNITORE') return res.status(400).json({ error: 'Un documento di trasporto verso un fornitore (reso) non può essere convertito in fattura' });
  const existing = db.prepare('SELECT id, numero FROM fatture WHERE ddt_id=?').get(req.params.id);
  if (existing) return res.status(409).json({ error: `Documento di trasporto già collegato alla fattura n. ${existing.numero}` });
  try {
    const out = db.transaction(() => {
      const righe = getRighe(ddt.id);
      // Numerazione coerente (prefisso/anno) tramite getNextNumero, non COUNT(*)+1
      // che ignorava i prefissi e poteva collidere dopo le cancellazioni.
      const numero = getNextNumero('fatture', 'fatture');
      const data = new Date().toISOString().split('T')[0];
      const result = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato)
        VALUES (?,?,?,?,?,?)`)
        .run(numero, data, ddt.cliente_id, ddt.id, `Da documento di trasporto n. ${ddt.numero}`, 'EMESSA');
      const fatturaId = result.lastInsertRowid;
      db.prepare('INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id) VALUES (?,?)').run(fatturaId, ddt.id);
      const stmt = db.prepare(`INSERT INTO fatture_righe
        (fattura_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      for (const r of righe)
        stmt.run(fatturaId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
                 r.sconto ?? 0, r.iva, r.unitaMisura || '', r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '');
      return { id: fatturaId, numero };
    })();
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
  const tipo = r.tipo || 'CLIENTE';
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    tipo,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    fornitoreId: r.fornitore_id || null, fornitoreNome: r.fornitore_nome || null,
    controparteNome: tipo === 'FORNITORE' ? (r.fornitore_nome || '') : (r.cliente_nome || ''),
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
