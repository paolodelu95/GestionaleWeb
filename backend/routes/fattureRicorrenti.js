const express = require('express');
const router = express.Router();
const db = require('../database');

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDto(r) {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    clienteNome: r.cliente_nome || '',
    descrizione: r.descrizione,
    frequenza: r.frequenza,
    giornoEmissione: r.giorno_emissione,
    prossimaEmissione: r.prossima_emissione,
    attiva: r.attiva === 1 || r.attiva === true,
    righe: JSON.parse(r.righe || '[]'),
    tipoPagamentoId: r.tipo_pagamento_id || null,
    note: r.note || '',
    createdAt: r.created_at,
  };
}

/** Advance prossima_emissione by one frequenza period */
function nextEmissione(prossimaEmissione, frequenza, giornoEmissione) {
  const giorno = Math.min(Math.max(parseInt(giornoEmissione) || 1, 1), 28);
  const d = new Date(prossimaEmissione + 'T00:00:00Z');
  const monthMap = { MENSILE: 1, BIMESTRALE: 2, TRIMESTRALE: 3, SEMESTRALE: 6, ANNUALE: 12 };
  const months = monthMap[frequenza] || 1;
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(giorno);
  return d.toISOString().substring(0, 10);
}

const { getNextNumero } = require('../utils/nextNumero');
function getNextFatturaNumero() {
  return getNextNumero('fatture', 'fatture');
}

/** Emit a real fattura from a ricorrente template row (transactional) */
function emettiFattura(r) {
  const righe = JSON.parse(r.righe || '[]');
  const today = new Date().toISOString().substring(0, 10);

  const tx = db.transaction(() => {
    const numero = getNextFatturaNumero();
    const result = db.prepare(
      `INSERT INTO fatture (numero, data_emissione, cliente_id, note, stato, tipo_pagamento_id)
       VALUES (?,?,?,?,?,?)`
    ).run(numero, today, r.cliente_id, r.note || '', 'EMESSA', r.tipo_pagamento_id || null);

    const fatturaId = result.lastInsertRowid;
    const insertRiga = db.prepare(
      `INSERT INTO fatture_righe (fattura_id, prodotto_id, descrizione, quantita, prezzo, iva, sconto, unita_misura)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    for (const riga of righe) {
      insertRiga.run(
        fatturaId,
        riga.prodottoId || null,
        riga.descrizione || '',
        riga.quantita ?? 1,
        riga.prezzo ?? 0,
        riga.iva ?? 22,
        riga.sconto ?? 0,
        riga.unitaMisura || ''
      );
    }

    const nuovaProssima = nextEmissione(r.prossima_emissione, r.frequenza, r.giorno_emissione);
    db.prepare('UPDATE fatture_ricorrenti SET prossima_emissione=? WHERE id=?').run(nuovaProssima, r.id);

    return { fatturaId, numero, nuovaProssima };
  });

  return tx();
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT fr.*, c.ragione_sociale as cliente_nome
    FROM fatture_ricorrenti fr
    LEFT JOIN clienti c ON fr.cliente_id = c.id
    ORDER BY fr.prossima_emissione ASC
  `).all();
  res.json(rows.map(toDto));
});

router.post('/', (req, res) => {
  const f = req.body;
  if (!f.clienteId || !f.descrizione || !f.frequenza || !f.prossimaEmissione) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }
  const righe = JSON.stringify(f.righe || []);
  const result = db.prepare(
    `INSERT INTO fatture_ricorrenti
       (cliente_id, descrizione, frequenza, giorno_emissione, prossima_emissione, attiva, righe, tipo_pagamento_id, note)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    f.clienteId,
    f.descrizione,
    f.frequenza,
    f.giornoEmissione || 1,
    f.prossimaEmissione,
    f.attiva !== false ? 1 : 0,
    righe,
    f.tipoPagamentoId || null,
    f.note || ''
  );
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const f = req.body;
  const righe = JSON.stringify(f.righe || []);
  db.prepare(
    `UPDATE fatture_ricorrenti
     SET cliente_id=?, descrizione=?, frequenza=?, giorno_emissione=?, prossima_emissione=?,
         attiva=?, righe=?, tipo_pagamento_id=?, note=?
     WHERE id=?`
  ).run(
    f.clienteId,
    f.descrizione,
    f.frequenza,
    f.giornoEmissione || 1,
    f.prossimaEmissione,
    f.attiva !== false ? 1 : 0,
    righe,
    f.tipoPagamentoId || null,
    f.note || '',
    req.params.id
  );
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fatture_ricorrenti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.post('/:id/emetti', (req, res) => {
  const r = db.prepare('SELECT * FROM fatture_ricorrenti WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Non trovato' });
  try {
    const { fatturaId, numero, nuovaProssima } = emettiFattura(r);
    res.json({ id: fatturaId, numero, nuovaProssima });
  } catch (err) {
    console.error('[FattureRicorrenti] Errore emissione:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, emettiFattura };
