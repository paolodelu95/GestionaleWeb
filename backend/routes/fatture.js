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
  dto.ddtIds = getDdtIds(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const f = req.body;
  const ddtIds = f.ddtIds?.length ? f.ddtIds : (f.ddtId ? [f.ddtId] : []);
  const result = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato, tipo_pagamento_id)
    VALUES (?,?,?,?,?,?,?)`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, ddtIds[0] || null, f.note, f.stato || 'BOZZA', f.tipoPagamentoId || null);
  const fatturaId = result.lastInsertRowid;
  if (f.righe?.length) {
    saveRighe(fatturaId, f.righe);
    if (!ddtIds.length) {
      const cliente = f.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(f.clienteId) : null;
      aggiornaQuantita(f.righe, -1, {
        data: f.dataEmissione, causale: 'FATTURA', documentoTipo: 'FATTURA',
        documentoId: fatturaId, documentoNumero: f.numero,
        clienteId: f.clienteId || null, clienteNome: cliente?.ragione_sociale || ''
      });
    }
  }
  if (ddtIds.length) saveDdtLinks(fatturaId, ddtIds);
  creaPagamentoImmediato(fatturaId);
  res.json({ id: fatturaId });
});

router.put('/:id', (req, res) => {
  const f = req.body;
  const ddtIds = f.ddtIds?.length ? f.ddtIds : (f.ddtId ? [f.ddtId] : []);
  const vecchiDdtIds = getDdtIds(req.params.id);
  const vecchieRighe = getRighe(req.params.id);
  if (vecchieRighe.length && !vecchiDdtIds.length) {
    const oldF = db.prepare('SELECT numero, cliente_id FROM fatture WHERE id=?').get(req.params.id);
    const oldCliente = oldF?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(oldF.cliente_id) : null;
    aggiornaQuantita(vecchieRighe, +1, {
      causale: 'STORNO', documentoTipo: 'FATTURA', documentoId: req.params.id,
      documentoNumero: oldF?.numero || '', clienteId: oldF?.cliente_id || null, clienteNome: oldCliente?.ragione_sociale || ''
    });
  }
  db.prepare(`UPDATE fatture SET numero=?, data_emissione=?, cliente_id=?, ddt_id=?, note=?, stato=?, tipo_pagamento_id=? WHERE id=?`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, ddtIds[0] || null, f.note, f.stato, f.tipoPagamentoId || null, req.params.id);
  db.prepare('DELETE FROM fatture_righe WHERE fattura_id=?').run(req.params.id);
  if (f.righe?.length) {
    saveRighe(req.params.id, f.righe);
    if (!ddtIds.length) {
      const cliente = f.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(f.clienteId) : null;
      aggiornaQuantita(f.righe, -1, {
        data: f.dataEmissione, causale: 'FATTURA', documentoTipo: 'FATTURA',
        documentoId: req.params.id, documentoNumero: f.numero,
        clienteId: f.clienteId || null, clienteNome: cliente?.ragione_sociale || ''
      });
    }
  }
  saveDdtLinks(req.params.id, ddtIds);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const ddtIds = getDdtIds(req.params.id);
  if (!ddtIds.length) {
    const righe = getRighe(req.params.id);
    if (righe.length) {
      const fattura = db.prepare('SELECT numero, cliente_id FROM fatture WHERE id=?').get(req.params.id);
      const cliente = fattura?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(fattura.cliente_id) : null;
      aggiornaQuantita(righe, +1, {
        causale: 'ELIMINAZIONE', documentoTipo: 'FATTURA', documentoId: req.params.id,
        documentoNumero: fattura?.numero || '', clienteId: fattura?.cliente_id || null, clienteNome: cliente?.ragione_sociale || ''
      });
    }
  }
  db.prepare('DELETE FROM fatture WHERE id=?').run(req.params.id);
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

function saveDdtLinks(fatturaId, ddtIds) {
  db.prepare('DELETE FROM fatture_ddt WHERE fattura_id=?').run(fatturaId);
  const stmt = db.prepare('INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id) VALUES (?,?)');
  for (const id of ddtIds) stmt.run(fatturaId, id);
}

function getDdtIds(fatturaId) {
  return db.prepare('SELECT ddt_id FROM fatture_ddt WHERE fattura_id=?')
    .all(fatturaId).map(r => r.ddt_id);
}

function saveRighe(fatturaId, righe) {
  const stmt = db.prepare(`INSERT INTO fatture_righe
    (fattura_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(fatturaId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO');
}

function getRighe(fatturaId) {
  const rows = db.prepare(`SELECT fr.*, p.nome as prodotto_nome
    FROM fatture_righe fr LEFT JOIN prodotti p ON fr.prodotto_id = p.id
    WHERE fr.fattura_id=?`).all(fatturaId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva,
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    tipo: r.tipo || 'PRODOTTO'
  }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM fatture_righe WHERE fattura_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM fatture_righe WHERE fattura_id=?`).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    ddtId: r.ddt_id, note: r.note, stato: r.stato, totale, imponibile,
    tipoPagamentoId: r.tipo_pagamento_id
  };
}

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`
    SELECT f.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
           c.citta as c_citta, c.provincia as c_provincia, c.stato as c_stato,
           c.p_iva as c_p_iva, c.codice_fiscale as c_cod_fiscale,
           c.email as c_email, c.telefono as c_telefono, c.pec as c_pec, c.sdi as c_sdi,
           tp.nome as tp_nome
    FROM fatture f
    LEFT JOIN clienti c ON f.cliente_id = c.id
    LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
    WHERE f.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  dto.cliente = {
    ragioneSociale: row.c_nome, via: row.c_via, cap: row.c_cap,
    citta: row.c_citta, provincia: row.c_provincia, stato: row.c_stato,
    pIva: row.c_p_iva, codFiscale: row.c_cod_fiscale,
    email: row.c_email, telefono: row.c_telefono, pec: row.c_pec, sdi: row.c_sdi,
  };
  dto.tipoPagamentoNome = row.tp_nome || '';
  dto.pagamenti = db.prepare(
    'SELECT data_pagamento, importo, metodo, note FROM pagamenti WHERE fattura_id=? ORDER BY data_pagamento'
  ).all(row.id).map(p => ({ dataPagamento: p.data_pagamento, importo: p.importo, metodo: p.metodo, note: p.note }));
  res.json(dto);
});

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
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t
    FROM fatture_righe WHERE fattura_id=?`).get(fatturaId)?.t || 0;
  if (totale <= 0) return;
  db.prepare(`INSERT INTO pagamenti (fattura_id, data_pagamento, importo, metodo, note, tipo, tipo_pagamento_id, conto)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(fatturaId, fattura.data_emissione, totale, tp.nome, 'Pagamento automatico', 'ENTRATA', tp.id, tp.conto);
  db.prepare("UPDATE fatture SET stato='PAGATA' WHERE id=?").run(fatturaId);
}

module.exports = router;
