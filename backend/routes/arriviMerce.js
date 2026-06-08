const express = require('express');
const router = express.Router();
const db = require('../database');
const { applicaRigheStock } = require('../utils/stock');

// ── GET / – elenco arrivi merce ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT am.*, f.ragione_sociale as fornitore_nome
    FROM arrivi_merce am
    LEFT JOIN fornitori f ON am.fornitore_id = f.id
    ORDER BY am.data DESC, am.id DESC`).all();
  res.json(rows.map(toDto));
});

// ── GET /:id – dettaglio con righe ──────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT am.*, f.ragione_sociale as fornitore_nome
    FROM arrivi_merce am
    LEFT JOIN fornitori f ON am.fornitore_id = f.id
    WHERE am.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const dto = toDto(row);
  dto.righe = getRighe(row.id);
  res.json(dto);
});

// ── POST / – crea arrivo merce e aggiorna magazzino ─────────────────────────
router.post('/', (req, res) => {
  const d = req.body;
  const dup = db.prepare('SELECT id FROM arrivi_merce WHERE numero=?').get(d.numero);
  if (dup) return res.status(409).json({ error: `Il numero ${d.numero} è già utilizzato da un altro documento` });
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO arrivi_merce (numero, data, fornitore_id, acquisto_id, numero_documento_fornitore, note, stato)
      VALUES (?,?,?,?,?,?,?)`)
      .run(
        d.numero, d.data, d.fornitoreId || null, d.acquistoId || null,
        d.numeroDocumentoFornitore || '', d.note || '', d.stato || 'RICEVUTO'
      );
    const arrivoId = result.lastInsertRowid;
    if (d.righe?.length) {
      saveRighe(arrivoId, d.righe);
      if (d.stato === 'RICEVUTO') {
        const forn = d.fornitoreId ? db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(d.fornitoreId) : null;
        aggiornaQuantita(d.righe, +1, {
          data: d.data, causale: 'ARRIVO_MERCE', documentoTipo: 'ARRIVO_MERCE',
          documentoId: arrivoId, documentoNumero: d.numero,
          fornitoreId: d.fornitoreId || null, fornitoreNome: forn?.ragione_sociale || ''
        });
      }
    }
    return arrivoId;
  });
  const arrivoId = tx();
  res.json({ id: arrivoId });
});

// ── PUT /:id – aggiorna (storno + ricarico) ──────────────────────────────────
router.put('/:id', (req, res) => {
  const d = req.body;
  const dup = db.prepare('SELECT id FROM arrivi_merce WHERE numero=? AND id!=?').get(d.numero, req.params.id);
  if (dup) return res.status(409).json({ error: `Il numero ${d.numero} è già utilizzato da un altro documento` });
  const tx = db.transaction(() => {
    const old = db.prepare('SELECT numero, fornitore_id, stato FROM arrivi_merce WHERE id=?').get(req.params.id);
    const vecchieRighe = getRighe(req.params.id);

    if (vecchieRighe.length && old?.stato === 'RICEVUTO') {
      const oldForn = old.fornitore_id ? db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(old.fornitore_id) : null;
      aggiornaQuantita(vecchieRighe, -1, {
        causale: 'STORNO', documentoTipo: 'ARRIVO_MERCE',
        documentoId: req.params.id, documentoNumero: old?.numero || '',
        fornitoreId: old?.fornitore_id || null, fornitoreNome: oldForn?.ragione_sociale || ''
      });
    }

    db.prepare(`
      UPDATE arrivi_merce SET numero=?, data=?, fornitore_id=?, acquisto_id=?,
        numero_documento_fornitore=?, note=?, stato=? WHERE id=?`)
      .run(
        d.numero, d.data, d.fornitoreId || null, d.acquistoId || null,
        d.numeroDocumentoFornitore || '', d.note || '', d.stato, req.params.id
      );

    db.prepare('DELETE FROM arrivi_merce_righe WHERE arrivo_merce_id=?').run(req.params.id);
    if (d.righe?.length) {
      saveRighe(req.params.id, d.righe);
      if (d.stato === 'RICEVUTO') {
        const forn = d.fornitoreId ? db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(d.fornitoreId) : null;
        aggiornaQuantita(d.righe, +1, {
          data: d.data, causale: 'ARRIVO_MERCE', documentoTipo: 'ARRIVO_MERCE',
          documentoId: req.params.id, documentoNumero: d.numero,
          fornitoreId: d.fornitoreId || null, fornitoreNome: forn?.ragione_sociale || ''
        });
      }
    }
  });
  tx();
  res.json({ success: true });
});

// ── PATCH /:id/stato ─────────────────────────────────────────────────────────
router.patch('/:id/stato', (req, res) => {
  const { stato } = req.body;
  const tx = db.transaction(() => {
    const old = db.prepare('SELECT stato, numero, fornitore_id FROM arrivi_merce WHERE id=?').get(req.params.id);
    const righe = getRighe(req.params.id);
    const forn = old?.fornitore_id ? db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(old.fornitore_id) : null;
    const ctx = {
      documentoTipo: 'ARRIVO_MERCE', documentoId: req.params.id,
      documentoNumero: old?.numero || '', fornitoreId: old?.fornitore_id || null,
      fornitoreNome: forn?.ragione_sociale || ''
    };

    if (stato === 'RICEVUTO' && old?.stato !== 'RICEVUTO') {
      aggiornaQuantita(righe, +1, { ...ctx, causale: 'ARRIVO_MERCE', data: new Date().toISOString().split('T')[0] });
    } else if (stato === 'ANNULLATO' && old?.stato === 'RICEVUTO') {
      aggiornaQuantita(righe, -1, { ...ctx, causale: 'ANNULLAMENTO' });
    }
    db.prepare('UPDATE arrivi_merce SET stato=? WHERE id=?').run(stato, req.params.id);
  });
  tx();
  res.json({ success: true });
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const tx = db.transaction(() => {
    const arrivo = db.prepare('SELECT stato, numero, fornitore_id FROM arrivi_merce WHERE id=?').get(req.params.id);
    if (arrivo?.stato === 'RICEVUTO') {
      const righe = getRighe(req.params.id);
      if (righe.length) {
        const forn = arrivo.fornitore_id ? db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(arrivo.fornitore_id) : null;
        aggiornaQuantita(righe, -1, {
          causale: 'ELIMINAZIONE', documentoTipo: 'ARRIVO_MERCE',
          documentoId: req.params.id, documentoNumero: arrivo?.numero || '',
          fornitoreId: arrivo?.fornitore_id || null, fornitoreNome: forn?.ragione_sociale || ''
        });
      }
    }
    db.prepare('DELETE FROM arrivi_merce_righe WHERE arrivo_merce_id=?').run(req.params.id);
    db.prepare('DELETE FROM arrivi_merce WHERE id=?').run(req.params.id);
  });
  tx();
  res.json({ success: true });
});

// ── POST /from-acquisto/:acquistoId – importa da fattura acquisto ─────────────
router.post('/from-acquisto/:acquistoId', (req, res) => {
  const acq = db.prepare(`
    SELECT a.*, f.ragione_sociale as fornitore_nome
    FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id = f.id
    WHERE a.id=?`).get(req.params.acquistoId);
  if (!acq) return res.status(404).json({ error: 'Acquisto non trovato' });

  const righeAcq = db.prepare(`
    SELECT ar.*, p.nome as prodotto_nome, p.unita_misura, p.codice_fornitore
    FROM acquisti_righe ar LEFT JOIN prodotti p ON ar.prodotto_id = p.id
    WHERE ar.acquisto_id=?`).all(req.params.acquistoId);

  // Per ogni riga senza prodotto_id, tenta match per codice_fornitore
  const righeArrivo = righeAcq.map(r => {
    let prodottoId = r.prodotto_id;
    let prodottoNome = r.prodotto_nome;
    let unitaMisura = r.unita_misura || '';
    let codiceFornitore = r.codice_fornitore || '';

    if (!prodottoId && r.descrizione) {
      const match = db.prepare(
        `SELECT id, nome, unita_misura, codice_fornitore FROM prodotti
         WHERE codice_fornitore != '' AND LOWER(codice_fornitore) = LOWER(?)`
      ).get(r.descrizione.trim());
      if (match) {
        prodottoId = match.id;
        prodottoNome = match.nome;
        unitaMisura = match.unita_misura || unitaMisura;
        codiceFornitore = match.codice_fornitore || '';
      }
    }

    return {
      prodottoId: prodottoId || null,
      prodottoNome: prodottoNome || '',
      variante_id: r.variante_id || null,
      descrizione: r.descrizione || '',
      codiceFornitore,
      quantita: r.quantita,
      unitaMisura: unitaMisura || r.unita_misura || '',
      prezzoAcquisto: r.prezzo || 0,
      varianteTaglia: r.variante_taglia || '',
      varianteColore: r.variante_colore || '',
    };
  });

  res.json({
    fornitoreId: acq.fornitore_id,
    fornitoreNome: acq.fornitore_nome,
    acquistoId: acq.id,
    numeroDocumentoFornitore: acq.numero,
    data: acq.data_emissione,
    note: acq.note || '',
    righe: righeArrivo,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Movimentazione scorte centralizzata (utils/stock.js). Le righe possono
// portare magazzinoId/lotto/scadenza (deposito di destinazione del carico).
const aggiornaQuantita = applicaRigheStock;

function saveRighe(arrivoId, righe) {
  const stmt = db.prepare(`INSERT INTO arrivi_merce_righe
    (arrivo_merce_id, prodotto_id, variante_id, descrizione, codice_fornitore,
     quantita, unita_misura, prezzo_acquisto, variante_taglia, variante_colore)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const r of righe)
    stmt.run(
      arrivoId, r.prodottoId || null, r.varianteId || null,
      r.descrizione || '', r.codiceFornitore || '',
      r.quantita, r.unitaMisura || '', r.prezzoAcquisto || 0,
      r.varianteTaglia || '', r.varianteColore || ''
    );
}

function getRighe(arrivoId) {
  const rows = db.prepare(`
    SELECT amr.*, p.nome as prodotto_nome
    FROM arrivi_merce_righe amr
    LEFT JOIN prodotti p ON amr.prodotto_id = p.id
    WHERE amr.arrivo_merce_id=?`).all(arrivoId);
  return rows.map(r => ({
    id: r.id,
    prodottoId: r.prodotto_id,
    prodottoNome: r.prodotto_nome || '',
    varianteId: r.variante_id,
    descrizione: r.descrizione,
    codiceFornitore: r.codice_fornitore || '',
    quantita: r.quantita,
    unitaMisura: r.unita_misura || '',
    prezzoAcquisto: r.prezzo_acquisto || 0,
    varianteTaglia: r.variante_taglia || '',
    varianteColore: r.variante_colore || '',
  }));
}

function toDto(r) {
  const totale = db.prepare(
    `SELECT COALESCE(SUM(quantita * prezzo_acquisto), 0) as t FROM arrivi_merce_righe WHERE arrivo_merce_id=?`
  ).get(r.id)?.t || 0;
  return {
    id: r.id, numero: r.numero, data: r.data,
    fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome,
    acquistoId: r.acquisto_id,
    numeroDocumentoFornitore: r.numero_documento_fornitore || '',
    note: r.note, stato: r.stato, totale,
  };
}

module.exports = router;
