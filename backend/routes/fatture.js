const express = require('express');
const router = express.Router();
const db = require('../database');
const { getNextNumero } = require('../utils/nextNumero');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, c.ragione_sociale as cliente_nome
    FROM fatture f LEFT JOIN clienti c ON f.cliente_id = c.id
    ORDER BY f.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.post('/da-ddt', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length)
    return res.status(400).json({ error: 'items richiesto' });

  const stmtLink = db.prepare('INSERT OR IGNORE INTO fatture_ddt (fattura_id, ddt_id) VALUES (?,?)');
  const stmtRiga = db.prepare(`INSERT INTO fatture_righe
    (fattura_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, codice_iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const createFatture = db.transaction(() => {
    const created = [];
    for (const item of items) {
      const { clienteId, ddtIds, tipoPagamentoId } = item;
      if (!Array.isArray(ddtIds) || !ddtIds.length) continue;

      // Verifica DDT validi per questo cliente
      const ddts = ddtIds.map(id => db.prepare('SELECT * FROM ddt WHERE id=?').get(id)).filter(Boolean);
      if (!ddts.length) continue;

      const numero = getNextNumero('fatture', 'fatture');
      const oggi = new Date().toISOString().split('T')[0];
      const ddtNums = ddts.map(d => d.numero).join(', ');
      const cliente = clienteId
        ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(clienteId)
        : null;
      const result = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato, tipo_pagamento_id)
        VALUES (?,?,?,?,?,?,?)`)
        .run(numero, oggi, clienteId || null, ddts[0].id, `Da DDT: ${ddtNums}`, 'EMESSA', tipoPagamentoId || null);
      const fatturaId = result.lastInsertRowid;

      for (const ddt of ddts) {
        stmtLink.run(fatturaId, ddt.id);
        const [y, m, d] = ddt.data_emissione.split('T')[0].split('-');
        stmtRiga.run(fatturaId, null, `Riferimento DDT n. ${ddt.numero} del ${d}/${m}/${y}`,
          0, 0, 0, 0, '', '', null, '', '', 'NOTA');
        for (const r of getDdtRighe(ddt.id))
          stmtRiga.run(fatturaId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
            r.sconto ?? 0, r.iva, r.codiceIva || '', r.unitaMisura || '',
            r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
            r.tipo || 'PRODOTTO');
      }
      creaPagamentoImmediato(fatturaId);
      created.push({ id: fatturaId, numero, clienteNome: cliente?.ragione_sociale || '', ddtNums });
    }
    return created;
  });

  const fatture = createFatture();
  res.json({ fatture });
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
  dto.riferimenti = getRiferimenti(row.id);
  res.json(dto);
});

const createFatturaTx = db.transaction((f, ddtIds) => {
  const result = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato, tipo_pagamento_id)
    VALUES (?,?,?,?,?,?,?)`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, ddtIds[0] || null, f.note, f.stato || 'EMESSA', f.tipoPagamentoId || null);
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
  if (f.riferimenti?.length) saveRiferimenti(fatturaId, f.riferimenti);
  creaPagamentoImmediato(fatturaId);
  return fatturaId;
});

router.post('/', (req, res) => {
  const f = req.body;
  const ddtIds = f.ddtIds?.length ? f.ddtIds : (f.ddtId ? [f.ddtId] : []);
  try {
    const id = createFatturaTx(f, ddtIds);
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const updateFatturaTx = db.transaction((id, f, ddtIds) => {
  const vecchiDdtIds = getDdtIds(id);
  const vecchieRighe = getRighe(id);
  if (vecchieRighe.length && !vecchiDdtIds.length) {
    const oldF = db.prepare('SELECT numero, cliente_id FROM fatture WHERE id=?').get(id);
    const oldCliente = oldF?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(oldF.cliente_id) : null;
    aggiornaQuantita(vecchieRighe, +1, {
      causale: 'STORNO', documentoTipo: 'FATTURA', documentoId: id,
      documentoNumero: oldF?.numero || '', clienteId: oldF?.cliente_id || null, clienteNome: oldCliente?.ragione_sociale || ''
    });
  }
  db.prepare(`UPDATE fatture SET numero=?, data_emissione=?, cliente_id=?, ddt_id=?, note=?, stato=?, tipo_pagamento_id=? WHERE id=?`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, ddtIds[0] || null, f.note, f.stato, f.tipoPagamentoId || null, id);
  db.prepare('DELETE FROM fatture_righe WHERE fattura_id=?').run(id);
  if (f.righe?.length) {
    saveRighe(id, f.righe);
    if (!ddtIds.length) {
      const cliente = f.clienteId ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(f.clienteId) : null;
      aggiornaQuantita(f.righe, -1, {
        data: f.dataEmissione, causale: 'FATTURA', documentoTipo: 'FATTURA',
        documentoId: id, documentoNumero: f.numero,
        clienteId: f.clienteId || null, clienteNome: cliente?.ragione_sociale || ''
      });
    }
  }
  saveDdtLinks(id, ddtIds);
  saveRiferimenti(id, f.riferimenti || []);
});

router.put('/:id', (req, res) => {
  const f = req.body;
  const ddtIds = f.ddtIds?.length ? f.ddtIds : (f.ddtId ? [f.ddtId] : []);
  try {
    updateFatturaTx(req.params.id, f, ddtIds);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const deleteFatturaTx = db.transaction((id) => {
  const ddtIds = getDdtIds(id);
  if (!ddtIds.length) {
    const righe = getRighe(id);
    if (righe.length) {
      const fattura = db.prepare('SELECT numero, cliente_id FROM fatture WHERE id=?').get(id);
      const cliente = fattura?.cliente_id ? db.prepare('SELECT ragione_sociale FROM clienti WHERE id=?').get(fattura.cliente_id) : null;
      aggiornaQuantita(righe, +1, {
        causale: 'ELIMINAZIONE', documentoTipo: 'FATTURA', documentoId: id,
        documentoNumero: fattura?.numero || '', clienteId: fattura?.cliente_id || null, clienteNome: cliente?.ragione_sociale || ''
      });
    }
  }
  db.prepare('DELETE FROM pagamenti WHERE fattura_id=?').run(id);
  db.prepare('UPDATE note_credito SET fattura_id=NULL WHERE fattura_id=?').run(id);
  db.prepare('DELETE FROM fatture WHERE id=?').run(id);
});

router.delete('/:id', (req, res) => {
  try {
    deleteFatturaTx(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
    (fattura_id, prodotto_id, descrizione, quantita, prezzo, sconto, iva, codice_iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(fatturaId, r.prodottoId || null, r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.codiceIva || '',
             r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO');
}

function getDdtRighe(ddtId) {
  const rows = db.prepare(`SELECT dr.*, p.nome as prodotto_nome
    FROM ddt_righe dr LEFT JOIN prodotti p ON dr.prodotto_id = p.id
    WHERE dr.ddt_id=?`).all(ddtId);
  return rows.map(r => ({
    prodottoId: r.prodotto_id, descrizione: r.descrizione,
    quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva, codiceIva: r.codice_iva || '',
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    tipo: r.tipo || 'PRODOTTO'
  }));
}

function getRighe(fatturaId) {
  const rows = db.prepare(`SELECT fr.*, p.nome as prodotto_nome
    FROM fatture_righe fr LEFT JOIN prodotti p ON fr.prodotto_id = p.id
    WHERE fr.fattura_id=?`).all(fatturaId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva, codiceIva: r.codice_iva || '',
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    tipo: r.tipo || 'PRODOTTO'
  }));
}

function saveRiferimenti(fatturaId, riferimenti) {
  db.prepare('DELETE FROM fatture_riferimenti WHERE fattura_id=?').run(fatturaId);
  if (!riferimenti?.length) return;
  const stmt = db.prepare(`INSERT INTO fatture_riferimenti
    (fattura_id, tipo, numero, data, cig, cup, commessa, ordine) VALUES (?,?,?,?,?,?,?,?)`);
  riferimenti.forEach((r, i) =>
    stmt.run(fatturaId, r.tipo || 'ORDINE_ACQUISTO', r.numero || '', r.data || '', r.cig || '', r.cup || '', r.commessa || '', i));
}

function getRiferimenti(fatturaId) {
  return db.prepare('SELECT * FROM fatture_riferimenti WHERE fattura_id=? ORDER BY ordine, id')
    .all(fatturaId)
    .map(r => ({ id: r.id, tipo: r.tipo, numero: r.numero, data: r.data || '', cig: r.cig || '', cup: r.cup || '', commessa: r.commessa || '' }));
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
  dto.riferimenti = getRiferimenti(row.id);
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
