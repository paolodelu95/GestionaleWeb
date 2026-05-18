const express = require('express');
const router = express.Router();
const db = require('../database');

function toDto(r) {
  return {
    id: r.id,
    data: r.data,
    tipo: r.tipo,
    causale: r.causale,
    importo: r.importo,
    conto: r.conto,
    riferimentoTipo: r.riferimento_tipo || '',
    riferimentoId: r.riferimento_id || null,
    note: r.note || '',
    createdAt: r.created_at,
  };
}

// GET / — list all, optional ?mese=YYYY-MM filter, ordered by data DESC
router.get('/', (req, res) => {
  const { mese } = req.query;
  let where = '';
  const params = [];
  if (mese && /^\d{4}-\d{2}$/.test(mese)) {
    where = "WHERE strftime('%Y-%m', data) = ?";
    params.push(mese);
  }
  const rows = db.prepare(`SELECT * FROM prima_nota ${where} ORDER BY data DESC, id DESC`).all(...params);

  // Compute running balance (based on full filtered list)
  let saldo = 0;
  const entrate = rows.filter(r => r.tipo === 'ENTRATA').reduce((s, r) => s + r.importo, 0);
  const uscite  = rows.filter(r => r.tipo === 'USCITA').reduce((s, r) => s + r.importo, 0);
  saldo = entrate - uscite;

  res.json({
    entries: rows.map(toDto),
    totaleEntrate: entrate,
    totaleUscite: uscite,
    saldo,
  });
});

// POST / — create entry
router.post('/', (req, res) => {
  const { data, tipo, causale, importo, conto, riferimentoTipo, riferimentoId, note } = req.body;
  if (!data || !tipo || !causale || importo == null) {
    return res.status(400).json({ error: 'Campi obbligatori: data, tipo, causale, importo' });
  }
  if (!['ENTRATA', 'USCITA'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve essere ENTRATA o USCITA' });
  }
  if (Number(importo) <= 0) {
    return res.status(400).json({ error: 'importo deve essere maggiore di 0' });
  }
  const contoDB = conto && ['CASSA', 'BANCA'].includes(conto) ? conto : 'CASSA';
  const result = db.prepare(
    `INSERT INTO prima_nota (data, tipo, causale, importo, conto, riferimento_tipo, riferimento_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(data, tipo, causale, Number(importo), contoDB,
        riferimentoTipo || '', riferimentoId || null, note || '');
  const created = db.prepare('SELECT * FROM prima_nota WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(toDto(created));
});

// PUT /:id — update entry
router.put('/:id', (req, res) => {
  const { data, tipo, causale, importo, conto, riferimentoTipo, riferimentoId, note } = req.body;
  if (!data || !tipo || !causale || importo == null) {
    return res.status(400).json({ error: 'Campi obbligatori: data, tipo, causale, importo' });
  }
  if (!['ENTRATA', 'USCITA'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve essere ENTRATA o USCITA' });
  }
  if (Number(importo) <= 0) {
    return res.status(400).json({ error: 'importo deve essere maggiore di 0' });
  }
  const contoDB = conto && ['CASSA', 'BANCA'].includes(conto) ? conto : 'CASSA';
  const info = db.prepare(
    `UPDATE prima_nota SET data=?, tipo=?, causale=?, importo=?, conto=?, riferimento_tipo=?, riferimento_id=?, note=?
     WHERE id=?`
  ).run(data, tipo, causale, Number(importo), contoDB,
        riferimentoTipo || '', riferimentoId || null, note || '', req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Registrazione non trovata' });
  const updated = db.prepare('SELECT * FROM prima_nota WHERE id = ?').get(req.params.id);
  res.json(toDto(updated));
});

// DELETE /:id — delete entry
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM prima_nota WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Registrazione non trovata' });
  res.json({ success: true });
});

module.exports = router;
