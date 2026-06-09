const express = require('express');
const router = express.Router();
const db = require('../database');
const { getNextNumero } = require('../utils/nextNumero');
const { audit } = require('../utils/audit');
const { calcolaTotaliFiscali, fiscFromRow } = require('../utils/fiscale');
const { applicaRigheStock } = require('../utils/stock');

// Colonne e valori dei campi fiscali (ritenuta / cassa / bollo) per INSERT/UPDATE.
const FISC_COLS = ['ritenuta_aliquota', 'ritenuta_causale', 'ritenuta_tipo', 'ritenuta_su_cassa',
  'cassa_tipo', 'cassa_aliquota', 'cassa_iva', 'bollo'];
function fiscValues(f) {
  return [
    Number(f.ritenutaAliquota) || 0, f.ritenutaCausale || '', f.ritenutaTipo || '',
    f.ritenutaSuCassa ? 1 : 0, f.cassaTipo || '', Number(f.cassaAliquota) || 0,
    Number(f.cassaIva) || 0, f.bollo ? 1 : 0,
  ];
}

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

const createFatturaTxBody = (f, ddtIds) => {
  const result = db.prepare(`INSERT INTO fatture (numero, data_emissione, cliente_id, ddt_id, note, stato, tipo_pagamento_id, ${FISC_COLS.join(', ')})
    VALUES (?,?,?,?,?,?,?,${FISC_COLS.map(() => '?').join(',')})`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, ddtIds[0] || null, f.note, f.stato || 'EMESSA', f.tipoPagamentoId || null, ...fiscValues(f));
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
  audit('fattura', fatturaId, 'CREATE', { numero: f.numero, clienteId: f.clienteId || null, stato: f.stato || 'EMESSA', numRighe: f.righe?.length || 0 });
  return fatturaId;
};

router.post('/', (req, res) => {
  const f = req.body;
  const dup = db.prepare('SELECT id FROM fatture WHERE numero=?').get(f.numero);
  if (dup) return res.status(409).json({ error: `Il numero ${f.numero} è già utilizzato da un altro documento` });
  const ddtIds = f.ddtIds?.length ? f.ddtIds : (f.ddtId ? [f.ddtId] : []);
  try {
    const id = db.transaction(createFatturaTxBody)(f, ddtIds);
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const updateFatturaTxBody = (id, f, ddtIds) => {
  const before = db.prepare('SELECT numero, data_emissione, cliente_id, note, stato FROM fatture WHERE id=?').get(id);
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
  db.prepare(`UPDATE fatture SET numero=?, data_emissione=?, cliente_id=?, ddt_id=?, note=?, stato=?, tipo_pagamento_id=?, ${FISC_COLS.map(c => c + '=?').join(', ')} WHERE id=?`)
    .run(f.numero, f.dataEmissione, f.clienteId || null, ddtIds[0] || null, f.note, f.stato, f.tipoPagamentoId || null, ...fiscValues(f), id);
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
  // Se in modifica viene impostato un metodo immediato (es. POS) e non era ancora
  // stato registrato, crea ora l'incasso automatico (idempotente).
  if (!ddtIds.length) creaPagamentoImmediato(id);
  audit('fattura', id, 'UPDATE', { before, after: { numero: f.numero, dataEmissione: f.dataEmissione, clienteId: f.clienteId, stato: f.stato, numRighe: f.righe?.length || 0 } });
};

router.put('/:id', (req, res) => {
  const f = req.body;
  const dup = db.prepare('SELECT id FROM fatture WHERE numero=? AND id!=?').get(f.numero, req.params.id);
  if (dup) return res.status(409).json({ error: `Il numero ${f.numero} è già utilizzato da un altro documento` });
  const ddtIds = f.ddtIds?.length ? f.ddtIds : (f.ddtId ? [f.ddtId] : []);
  try {
    db.transaction(updateFatturaTxBody)(req.params.id, f, ddtIds);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const deleteFatturaTxBody = (id) => {
  const snapshot = db.prepare('SELECT numero, data_emissione, cliente_id, stato, note FROM fatture WHERE id=?').get(id);
  if (!snapshot) return;
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
  audit('fattura', id, 'DELETE', snapshot || {});
};

router.delete('/:id', (req, res) => {
  try {
    db.transaction(deleteFatturaTxBody)(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Movimentazione scorte centralizzata (vedi utils/stock.js): aggiorna giacenze
// per deposito + totali + registro. Mantiene la stessa firma del vecchio helper.
const aggiornaQuantita = applicaRigheStock;

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
    (fattura_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo, sconto, iva, codice_iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo, scarica_magazzino)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(fatturaId, r.prodottoId || null, r.codiceProdotto || '', r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.codiceIva || '',
             r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO', r.scaricaMagazzino === false ? 0 : 1);
}

function getDdtRighe(ddtId) {
  const rows = db.prepare(`SELECT dr.*, p.nome as prodotto_nome
    FROM ddt_righe dr LEFT JOIN prodotti p ON dr.prodotto_id = p.id
    WHERE dr.ddt_id=?`).all(ddtId);
  return rows.map(r => ({
    prodottoId: r.prodotto_id, codiceProdotto: r.codice_prodotto || '', descrizione: r.descrizione,
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
    codiceProdotto: r.codice_prodotto || '',
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva, codiceIva: r.codice_iva || '',
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    tipo: r.tipo || 'PRODOTTO',
    scaricaMagazzino: r.scarica_magazzino !== 0
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
  const righe = db.prepare('SELECT quantita, prezzo, sconto, iva FROM fatture_righe WHERE fattura_id=?').all(r.id);
  const fisc = fiscFromRow(r);
  const t = calcolaTotaliFiscali(righe, fisc);
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    ddtId: r.ddt_id, note: r.note, stato: r.stato,
    imponibile: t.imponibile, totale: t.totale,
    tipoPagamentoId: r.tipo_pagamento_id,
    // Parametri fiscali (per il form) + importi calcolati (per stampa/elenco)
    ritenutaAliquota: fisc.ritenutaAliquota, ritenutaCausale: fisc.ritenutaCausale,
    ritenutaTipo: fisc.ritenutaTipo, ritenutaSuCassa: fisc.ritenutaSuCassa,
    cassaTipo: fisc.cassaTipo, cassaAliquota: fisc.cassaAliquota, cassaIva: fisc.cassaIva,
    bollo: fisc.bollo,
    cassaImporto: t.cassaImporto, iva: t.iva, ritenutaImporto: t.ritenutaImporto,
    bolloImporto: t.bolloImporto, nettoAPagare: t.nettoAPagare,
    statoSdi: r.stato_sdi || '', dataInvioSdi: r.data_invio_sdi || '',
    idTrasmissioneSdi: r.id_trasmissione_sdi || ''
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
  const tx = db.transaction(() => {
    const before = db.prepare('SELECT stato FROM fatture WHERE id=?').get(req.params.id);
    db.prepare('UPDATE fatture SET stato=? WHERE id=?').run(stato, req.params.id);
    if (stato === 'EMESSA') {
      creaPagamentoImmediato(req.params.id);
    }
    return before;
  });
  const before = tx();
  audit('fattura', Number(req.params.id), 'UPDATE', { before, after: { stato } });
  res.json({ success: true });
});

// PATCH /:id/stato-sdi — aggiorna manualmente lo stato della notifica SDI.
// Utile per registrare l'esito ricevuto dall'intermediario (RC consegnata,
// NS scartata, NE accettata/rifiutata, MC mancata consegna, ecc.) quando non
// è attivo il polling automatico da provider.
const STATI_SDI_VALIDI = new Set([
  '', 'NON_INVIATA', 'INVIATA', 'CONSEGNATA', 'MANCATA_CONSEGNA',
  'SCARTATA', 'ACCETTATA', 'RIFIUTATA', 'DECORRENZA_TERMINI', 'NON_RECAPITABILE',
]);
router.patch('/:id/stato-sdi', (req, res) => {
  const { statoSdi, dataInvioSdi, idTrasmissioneSdi } = req.body || {};
  const nuovo = String(statoSdi || '').toUpperCase();
  if (!STATI_SDI_VALIDI.has(nuovo)) {
    return res.status(400).json({ error: `Stato SDI non valido: ${statoSdi}` });
  }
  const f = db.prepare('SELECT stato_sdi, data_invio_sdi, id_trasmissione_sdi FROM fatture WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Fattura non trovata' });
  const before = { statoSdi: f.stato_sdi || '', dataInvioSdi: f.data_invio_sdi || '', idTrasmissioneSdi: f.id_trasmissione_sdi || '' };
  // Se viene impostato uno stato "inviato" e manca la data invio, la valorizza a oggi.
  const dataInvio = dataInvioSdi != null ? dataInvioSdi
    : (nuovo && nuovo !== 'NON_INVIATA' && !f.data_invio_sdi ? new Date().toISOString().slice(0, 10) : f.data_invio_sdi || '');
  const idTrasm = idTrasmissioneSdi != null ? idTrasmissioneSdi : (f.id_trasmissione_sdi || '');
  db.prepare('UPDATE fatture SET stato_sdi=?, data_invio_sdi=?, id_trasmissione_sdi=? WHERE id=?')
    .run(nuovo === 'NON_INVIATA' ? '' : nuovo, dataInvio, idTrasm, req.params.id);
  audit('fattura', Number(req.params.id), 'UPDATE', { before, after: { statoSdi: nuovo, dataInvioSdi: dataInvio, idTrasmissioneSdi: idTrasm } });
  res.json({ success: true });
});

function creaPagamentoImmediato(fatturaId) {
  const fattura = db.prepare('SELECT * FROM fatture WHERE id=?').get(fatturaId);
  if (!fattura?.tipo_pagamento_id) return;
  const tp = db.prepare('SELECT * FROM tipi_pagamento WHERE id=?').get(fattura.tipo_pagamento_id);
  if (tp?.immediato !== 1) return;
  // Idempotente: se l'incasso automatico esiste già (es. ri-salvataggio in modifica)
  // non lo duplichiamo.
  const esiste = db.prepare(
    "SELECT 1 FROM pagamenti WHERE fattura_id=? AND tipo='ENTRATA' AND note='Pagamento automatico'"
  ).get(fatturaId);
  if (esiste) return;
  // Si incassa il NETTO A PAGARE (totale documento meno l'eventuale ritenuta d'acconto).
  const righe = db.prepare('SELECT quantita, prezzo, sconto, iva FROM fatture_righe WHERE fattura_id=?').all(fatturaId);
  const totale = calcolaTotaliFiscali(righe, fiscFromRow(fattura)).nettoAPagare;
  if (totale <= 0) return;
  db.prepare(`INSERT INTO pagamenti (fattura_id, data_pagamento, importo, metodo, note, tipo, tipo_pagamento_id, conto)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(fatturaId, fattura.data_emissione, totale, tp.nome, 'Pagamento automatico', 'ENTRATA', tp.id, tp.conto);
  db.prepare("UPDATE fatture SET stato='PAGATA' WHERE id=?").run(fatturaId);
}

module.exports = router;
