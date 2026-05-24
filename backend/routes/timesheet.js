// Timesheet / Commesse — scaffold operativo.
// Fornisce CRUD per progetti e voci timesheet. La generazione fattura da
// timesheet è prevista in fase successiva (TODO).

const express = require('express');
const router = express.Router();
const db = require('../database');

function projDto(r) {
  return {
    id: r.id, nome: r.nome, descrizione: r.descrizione, clienteId: r.cliente_id,
    clienteNome: r.cliente_nome || '', stato: r.stato,
    dataInizio: r.data_inizio, dataFine: r.data_fine,
    budget: r.budget, tariffaOraria: r.tariffa_oraria, note: r.note,
    createdAt: r.created_at,
    oreTotali: r.ore_totali || 0,
    oreFatturate: r.ore_fatturate || 0,
  };
}

router.get('/progetti', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.ragione_sociale AS cliente_nome,
           COALESCE((SELECT SUM(ore) FROM timesheet_voci WHERE progetto_id=p.id), 0) AS ore_totali,
           COALESCE((SELECT SUM(ore) FROM timesheet_voci WHERE progetto_id=p.id AND fatturata=1), 0) AS ore_fatturate
    FROM progetti p
    LEFT JOIN clienti c ON c.id=p.cliente_id
    ORDER BY p.data_inizio DESC, p.id DESC`).all();
  res.json(rows.map(projDto));
});

router.post('/progetti', (req, res) => {
  const p = req.body || {};
  const r = db.prepare(`INSERT INTO progetti
    (nome, descrizione, cliente_id, stato, data_inizio, data_fine, budget, tariffa_oraria, note)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    p.nome, p.descrizione || '', p.clienteId || null, p.stato || 'APERTO',
    p.dataInizio || '', p.dataFine || '', p.budget || 0, p.tariffaOraria || 0, p.note || '');
  res.json({ id: r.lastInsertRowid });
});

router.put('/progetti/:id', (req, res) => {
  const p = req.body || {};
  db.prepare(`UPDATE progetti SET
    nome=?, descrizione=?, cliente_id=?, stato=?, data_inizio=?, data_fine=?,
    budget=?, tariffa_oraria=?, note=? WHERE id=?`).run(
    p.nome, p.descrizione || '', p.clienteId || null, p.stato || 'APERTO',
    p.dataInizio || '', p.dataFine || '', p.budget || 0, p.tariffaOraria || 0,
    p.note || '', req.params.id);
  res.json({ success: true });
});

router.delete('/progetti/:id', (req, res) => {
  db.prepare('DELETE FROM progetti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Voci timesheet ───────────────────────────────────────────────────────────
router.get('/voci', (req, res) => {
  const progetto = req.query.progettoId ? parseInt(req.query.progettoId) : null;
  const sql = `SELECT v.*, p.nome AS progetto_nome FROM timesheet_voci v
               LEFT JOIN progetti p ON p.id=v.progetto_id
               ${progetto ? 'WHERE v.progetto_id=?' : ''}
               ORDER BY v.data DESC, v.id DESC`;
  const rows = progetto ? db.prepare(sql).all(progetto) : db.prepare(sql).all();
  res.json(rows.map(v => ({
    id: v.id, progettoId: v.progetto_id, progettoNome: v.progetto_nome || '',
    data: v.data, ore: v.ore, descrizione: v.descrizione, utente: v.utente,
    fatturata: v.fatturata === 1, fatturaId: v.fattura_id, createdAt: v.created_at,
  })));
});

router.post('/voci', (req, res) => {
  const v = req.body || {};
  if (!v.progettoId || !v.data || !v.ore) return res.status(400).json({ error: 'progettoId, data, ore obbligatori' });
  const r = db.prepare(`INSERT INTO timesheet_voci
    (progetto_id, data, ore, descrizione, utente) VALUES (?,?,?,?,?)`).run(
    v.progettoId, v.data, v.ore, v.descrizione || '', v.utente || (req.user?.username || ''));
  res.json({ id: r.lastInsertRowid });
});

router.put('/voci/:id', (req, res) => {
  const v = req.body || {};
  db.prepare(`UPDATE timesheet_voci SET data=?, ore=?, descrizione=?, utente=? WHERE id=?`)
    .run(v.data, v.ore, v.descrizione || '', v.utente || '', req.params.id);
  res.json({ success: true });
});

router.delete('/voci/:id', (req, res) => {
  db.prepare('DELETE FROM timesheet_voci WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// TODO: POST /progetti/:id/fattura — genera fattura da voci non fatturate
// raggruppate per progetto, applicando tariffa_oraria * ore. Riservato a fase 3.

module.exports = router;
