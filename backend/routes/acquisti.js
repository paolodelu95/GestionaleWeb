const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, f.ragione_sociale as fornitore_nome, tp.nome as tipo_pagamento_nome
    FROM acquisti a
    LEFT JOIN fornitori f ON a.fornitore_id = f.id
    LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
    ORDER BY a.data_emissione DESC`).all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT a.*, f.ragione_sociale as fornitore_nome, tp.nome as tipo_pagamento_nome
    FROM acquisti a
    LEFT JOIN fornitori f ON a.fornitore_id = f.id
    LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
    WHERE a.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

router.post('/', (req, res) => {
  const a = req.body;
  const dup = db.prepare('SELECT id FROM acquisti WHERE numero=?').get(a.numero);
  if (dup) return res.status(409).json({ error: `Il numero ${a.numero} è già utilizzato da un altro documento` });
  const result = db.prepare(`INSERT INTO acquisti (numero,data_emissione,fornitore_id,tipo_pagamento_id,note,stato)
    VALUES (?,?,?,?,?,?)`)
    .run(a.numero, a.dataEmissione, a.fornitoreId || null, a.tipoPagamentoId || null, a.note || '', a.stato || 'RICEVUTA');
  if (a.righe?.length) saveRighe(result.lastInsertRowid, a.righe);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const a = req.body;
  const dup = db.prepare('SELECT id FROM acquisti WHERE numero=? AND id!=?').get(a.numero, req.params.id);
  if (dup) return res.status(409).json({ error: `Il numero ${a.numero} è già utilizzato da un altro documento` });
  db.prepare(`UPDATE acquisti SET numero=?,data_emissione=?,fornitore_id=?,tipo_pagamento_id=?,note=?,stato=? WHERE id=?`)
    .run(a.numero, a.dataEmissione, a.fornitoreId || null, a.tipoPagamentoId || null, a.note || '', a.stato, req.params.id);
  db.prepare('DELETE FROM acquisti_righe WHERE acquisto_id=?').run(req.params.id);
  if (a.righe?.length) saveRighe(req.params.id, a.righe);
  res.json({ success: true });
});

router.patch('/:id/stato', (req, res) => {
  db.prepare('UPDATE acquisti SET stato=? WHERE id=?').run(req.body.stato, req.params.id);
  res.json({ success: true });
});

router.get('/:id/print', (req, res) => {
  const row = db.prepare(`SELECT a.*, f.ragione_sociale as f_nome, f.via as f_via, f.cap as f_cap,
    f.citta as f_citta, f.provincia as f_provincia, f.p_iva as f_p_iva, f.email as f_email,
    tp.nome as tp_nome
    FROM acquisti a
    LEFT JOIN fornitori f ON a.fornitore_id = f.id
    LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
    WHERE a.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  dto.fornitore = { ragioneSociale: row.f_nome, via: row.f_via, cap: row.f_cap, citta: row.f_citta, provincia: row.f_provincia, pIva: row.f_p_iva, email: row.f_email };
  dto.tipoPagamentoNome = row.tp_nome || '';
  dto.pagamenti = db.prepare(`SELECT data_pagamento, importo, metodo, note FROM pagamenti WHERE acquisto_id=? ORDER BY data_pagamento`).all(row.id)
    .map(p => ({ dataPagamento: p.data_pagamento, importo: p.importo, metodo: p.metodo, note: p.note }));
  res.json(dto);
});

// ── Analisi magazzino: match codice fornitore → prodotto esistente ───
// Per ogni riga dell'acquisto restituisce lo stato:
//   matched     → prodotto già esistente con questo codice fornitore
//   unmatched   → nessun prodotto trovato (suggerimento: creare nuovo)
//   noCode      → la riga non ha codice fornitore (descrizione libera)
router.get('/:id/analisi-magazzino', (req, res) => {
  const id = Number(req.params.id);
  const acq = db.prepare('SELECT * FROM acquisti WHERE id=?').get(id);
  if (!acq) return res.status(404).json({ error: 'Acquisto non trovato' });
  const righe = db.prepare(`
    SELECT r.*, p.nome AS prodotto_nome_existing
    FROM acquisti_righe r
    LEFT JOIN prodotti p ON p.id = r.prodotto_id
    WHERE r.acquisto_id=?`).all(id);

  const analisi = righe.map(r => {
    // Se già collegata a prodotto, è matched
    if (r.prodotto_id) {
      return {
        rigaId: r.id,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzoAcquisto: r.prezzo,
        codiceFornitore: r.codice_fornitore || '',
        stato: 'matched',
        prodottoId: r.prodotto_id,
        prodottoNome: r.prodotto_nome_existing,
      };
    }
    // Cerca match per codice fornitore (descrizione spesso contiene il codice)
    const codice = (r.codice_fornitore || r.descrizione || '').trim();
    if (!codice) {
      return {
        rigaId: r.id,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzoAcquisto: r.prezzo,
        codiceFornitore: '',
        stato: 'noCode',
      };
    }
    const match = db.prepare(
      `SELECT id, nome, codice_fornitore FROM prodotti
       WHERE codice_fornitore != '' AND LOWER(codice_fornitore) = LOWER(?)`
    ).get(codice);
    if (match) {
      return {
        rigaId: r.id,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzoAcquisto: r.prezzo,
        codiceFornitore: match.codice_fornitore,
        stato: 'matched',
        prodottoId: match.id,
        prodottoNome: match.nome,
      };
    }
    return {
      rigaId: r.id,
      descrizione: r.descrizione,
      quantita: r.quantita,
      prezzoAcquisto: r.prezzo,
      codiceFornitore: codice,
      stato: 'unmatched',
      // Suggerimento per crearne uno nuovo
      nuovoProdotto: {
        nome: r.descrizione,
        codiceFornitore: codice,
        prezzoAcquisto: r.prezzo,
        prezzo: +(r.prezzo * 1.30).toFixed(2), // markup default 30%
        iva: r.iva || 22,
        unitaMisura: r.unita_misura || 'pz',
        quantita: 0,
        sogliaMinima: 0,
      },
    };
  });

  const totale = analisi.length;
  const matched = analisi.filter(a => a.stato === 'matched').length;
  const unmatched = analisi.filter(a => a.stato === 'unmatched').length;
  const noCode = analisi.filter(a => a.stato === 'noCode').length;
  res.json({ acquistoId: id, numero: acq.numero, totale, matched, unmatched, noCode, righe: analisi });
});

// ── Genera arrivo merce dall'acquisto in un colpo solo ──────────────
// body: {
//   autoCreaProdotti: bool (default false),
//   personalizzazioni: { [rigaId]: { prodottoId|null, nuovoProdotto?: {...} } }
// }
router.post('/:id/genera-arrivo-merce', (req, res) => {
  const id = Number(req.params.id);
  const acq = db.prepare('SELECT * FROM acquisti WHERE id=?').get(id);
  if (!acq) return res.status(404).json({ error: 'Acquisto non trovato' });
  const autoCrea = req.body?.autoCreaProdotti === true;
  const personalizzazioni = req.body?.personalizzazioni || {};

  const righeAcq = db.prepare(`
    SELECT r.*, p.codice_fornitore AS p_codice
    FROM acquisti_righe r
    LEFT JOIN prodotti p ON p.id = r.prodotto_id
    WHERE r.acquisto_id=?`).all(id);
  if (!righeAcq.length) return res.status(400).json({ error: 'Acquisto senza righe' });

  // Get next arrivo merce numero
  const { getNextNumero } = require('../utils/nextNumero');
  const tx = db.transaction(() => {
    const righeArrivo = [];
    const prodottiCreati = [];

    for (const r of righeAcq) {
      let prodottoId = r.prodotto_id;
      const custom = personalizzazioni[r.id];

      if (custom?.prodottoId) {
        prodottoId = custom.prodottoId;
      } else if (!prodottoId) {
        // Tenta match per codice fornitore
        const codice = (r.codice_fornitore || r.descrizione || '').trim();
        if (codice) {
          const match = db.prepare(
            `SELECT id FROM prodotti
             WHERE codice_fornitore != '' AND LOWER(codice_fornitore) = LOWER(?)`
          ).get(codice);
          if (match) prodottoId = match.id;
        }

        // Se ancora non c'è, crea nuovo se autoCrea o se c'è personalizzazione esplicita
        if (!prodottoId && (autoCrea || custom?.nuovoProdotto)) {
          const np = custom?.nuovoProdotto || {
            nome: r.descrizione,
            codiceFornitore: codice,
            prezzoAcquisto: r.prezzo,
            prezzo: +(r.prezzo * 1.30).toFixed(2),
            iva: r.iva || 22,
            unitaMisura: r.unita_misura || 'pz',
            quantita: 0,
            sogliaMinima: 0,
          };
          const ins = db.prepare(`
            INSERT INTO prodotti (nome, codice, codice_fornitore, prezzo, prezzo_acquisto, quantita, soglia_minima, unita_misura, iva, categoria, descrizione, fornitore_id_preferito)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(
              np.nome,
              np.codice || '',
              np.codiceFornitore || '',
              np.prezzo || 0,
              np.prezzoAcquisto ?? r.prezzo,
              np.quantita || 0,
              np.sogliaMinima || 0,
              np.unitaMisura || 'pz',
              np.iva || 22,
              np.categoria || '',
              np.descrizione || '',
              acq.fornitore_id || null,
            );
          prodottoId = ins.lastInsertRowid;
          prodottiCreati.push({ id: prodottoId, nome: np.nome, codiceFornitore: np.codiceFornitore });
        }
      }

      righeArrivo.push({
        prodottoId: prodottoId || null,
        descrizione: r.descrizione,
        codiceFornitore: r.codice_fornitore || '',
        quantita: r.quantita,
        unitaMisura: r.unita_misura || 'pz',
        prezzoAcquisto: r.prezzo,
      });
    }

    // Crea arrivo merce direttamente (non richiamo il router /arrivi-merce
    // per evitare reentry; replico la stessa logica di scrittura).
    const numero = getNextNumero('arrivi_merce', 'arrivi_merce');
    const today = new Date().toISOString().slice(0, 10);
    const fornitoreId = acq.fornitore_id || null;
    const arrivoIns = db.prepare(`
      INSERT INTO arrivi_merce (numero, data, fornitore_id, acquisto_id, numero_documento_fornitore, note, stato)
      VALUES (?,?,?,?,?,?,?)`)
      .run(numero, today, fornitoreId, id, acq.numero || '', 'Generato da acquisto', 'RICEVUTO');
    const arrivoId = arrivoIns.lastInsertRowid;

    const rigaIns = db.prepare(`INSERT INTO arrivi_merce_righe
      (arrivo_merce_id, prodotto_id, variante_id, descrizione, codice_fornitore,
       quantita, unita_misura, prezzo_acquisto, variante_taglia, variante_colore)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const qtyUp = db.prepare('UPDATE prodotti SET quantita = quantita + ? WHERE id=?');
    const movIns = db.prepare(`INSERT INTO movimenti_magazzino
      (data,prodotto_id,prodotto_nome,tipo,quantita,causale,documento_tipo,documento_id,documento_numero,
       cliente_id,cliente_nome,fornitore_id,fornitore_nome,note,variante_id,variante_taglia,variante_colore)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const fornitoreNome = fornitoreId
      ? db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(fornitoreId)?.ragione_sociale || ''
      : '';

    for (const r of righeArrivo) {
      rigaIns.run(
        arrivoId, r.prodottoId || null, null, r.descrizione,
        r.codiceFornitore, r.quantita, r.unitaMisura,
        r.prezzoAcquisto || 0, '', '',
      );
      if (r.prodottoId) {
        qtyUp.run(r.quantita, r.prodottoId);
        const pNome = db.prepare('SELECT nome FROM prodotti WHERE id=?').get(r.prodottoId)?.nome || r.descrizione;
        movIns.run(
          today, r.prodottoId, pNome,
          'CARICO', r.quantita,
          'ARRIVO_MERCE', 'ARRIVO_MERCE', arrivoId, numero,
          null, '', fornitoreId, fornitoreNome,
          'Generato da acquisto #' + id,
          null, '', '',
        );
      }
    }

    return { arrivoId, numero, prodottiCreati, righeTotali: righeArrivo.length };
  });

  try {
    const result = tx();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM pagamenti WHERE acquisto_id=?').run(id);
  db.prepare('UPDATE arrivi_merce SET acquisto_id=NULL WHERE acquisto_id=?').run(id);
  db.prepare('DELETE FROM acquisti WHERE id=?').run(id);
  res.json({ success: true });
});

function saveRighe(acquistoId, righe) {
  const stmt = db.prepare(`INSERT INTO acquisti_righe
    (acquisto_id, prodotto_id, codice_prodotto, descrizione, quantita, prezzo, sconto, iva, unita_misura, variante_id, variante_taglia, variante_colore, tipo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(acquistoId, r.prodottoId || null, r.codiceProdotto || '', r.descrizione, r.quantita, r.prezzo,
             r.sconto ?? 0, r.iva, r.unitaMisura || '',
             r.varianteId || null, r.varianteTaglia || '', r.varianteColore || '',
             r.tipo || 'PRODOTTO');
}

function getRighe(acquistoId) {
  const rows = db.prepare(`SELECT ar.*, p.nome as prodotto_nome
    FROM acquisti_righe ar LEFT JOIN prodotti p ON ar.prodotto_id = p.id
    WHERE ar.acquisto_id=?`).all(acquistoId);
  return rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome,
    codiceProdotto: r.codice_prodotto || '',
    descrizione: r.descrizione, quantita: r.quantita, unitaMisura: r.unita_misura,
    prezzo: r.prezzo, sconto: r.sconto ?? 0, iva: r.iva,
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    tipo: r.tipo || 'PRODOTTO'
  }));
}

function toDto(r) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100) * (1 + iva/100)), 0) as t FROM acquisti_righe WHERE acquisto_id=?`).get(r.id)?.t || 0;
  const imponibile = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100)), 0) as t FROM acquisti_righe WHERE acquisto_id=?`).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
    fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome,
    tipoPagamentoId: r.tipo_pagamento_id, tipoPagamentoNome: r.tipo_pagamento_nome,
    note: r.note, stato: r.stato, totale, imponibile
  };
}

module.exports = router;
