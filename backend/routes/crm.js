const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireRole } = require('../middleware/auth');

const MANAGE_PIPELINE = requireRole('SUPERADMIN', 'OWNER', 'ADMIN', 'COMMERCIALE');

// ── Stages (colonne Kanban) ──────────────────────────────────────────────────
router.get('/stages', (req, res) => {
  const rows = db.prepare('SELECT * FROM crm_stage ORDER BY ordine, id').all();
  res.json(rows.map(r => ({ ...r, vinto: r.vinto === 1, perso: r.perso === 1 })));
});

router.post('/stages', MANAGE_PIPELINE, (req, res) => {
  const s = req.body || {};
  const r = db.prepare(
    `INSERT INTO crm_stage (nome, ordine, colore, vinto, perso) VALUES (?,?,?,?,?)`
  ).run(s.nome, s.ordine ?? 0, s.colore || '#6366f1', s.vinto ? 1 : 0, s.perso ? 1 : 0);
  res.json({ id: r.lastInsertRowid });
});

router.put('/stages/:id', MANAGE_PIPELINE, (req, res) => {
  const s = req.body || {};
  db.prepare(
    `UPDATE crm_stage SET nome=?, ordine=?, colore=?, vinto=?, perso=? WHERE id=?`
  ).run(s.nome, s.ordine ?? 0, s.colore || '#6366f1', s.vinto ? 1 : 0, s.perso ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/stages/:id', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), (req, res) => {
  db.prepare('UPDATE crm_opportunita SET stage_id=NULL WHERE stage_id=?').run(req.params.id);
  db.prepare('DELETE FROM crm_stage WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Opportunità ──────────────────────────────────────────────────────────────
function toDto(r) {
  return {
    id: r.id, titolo: r.titolo, clienteId: r.cliente_id, clienteNome: r.cliente_nome || '',
    contatto: r.contatto, email: r.email, telefono: r.telefono,
    stageId: r.stage_id, stageName: r.stage_nome || '', stageColor: r.stage_colore || '#6366f1',
    valore: r.valore, probabilita: r.probabilita, dataPrevista: r.data_prevista,
    assegnatario: r.assegnatario, note: r.note, ordine: r.ordine,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

router.get('/opportunita', (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, c.ragione_sociale AS cliente_nome,
           s.nome AS stage_nome, s.colore AS stage_colore
    FROM crm_opportunita o
    LEFT JOIN clienti c ON c.id = o.cliente_id
    LEFT JOIN crm_stage s ON s.id = o.stage_id
    ORDER BY o.ordine, o.updated_at DESC`).all();
  res.json(rows.map(toDto));
});

router.post('/opportunita', MANAGE_PIPELINE, (req, res) => {
  const o = req.body || {};
  const r = db.prepare(`INSERT INTO crm_opportunita
    (titolo, cliente_id, contatto, email, telefono, stage_id, valore, probabilita,
     data_prevista, assegnatario, note, ordine)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    o.titolo, o.clienteId || null, o.contatto || '', o.email || '', o.telefono || '',
    o.stageId || null, o.valore || 0, o.probabilita ?? 50,
    o.dataPrevista || '', o.assegnatario || '', o.note || '', o.ordine || 0);
  res.json({ id: r.lastInsertRowid });
});

router.put('/opportunita/:id', MANAGE_PIPELINE, (req, res) => {
  const o = req.body || {};
  db.prepare(`UPDATE crm_opportunita SET
      titolo=?, cliente_id=?, contatto=?, email=?, telefono=?, stage_id=?,
      valore=?, probabilita=?, data_prevista=?, assegnatario=?, note=?, ordine=?,
      updated_at=datetime('now')
    WHERE id=?`).run(
    o.titolo, o.clienteId || null, o.contatto || '', o.email || '', o.telefono || '',
    o.stageId || null, o.valore || 0, o.probabilita ?? 50,
    o.dataPrevista || '', o.assegnatario || '', o.note || '', o.ordine || 0, req.params.id);
  res.json({ success: true });
});

// Sposta opportunità in un'altra colonna (drag&drop Kanban)
router.patch('/opportunita/:id/stage', MANAGE_PIPELINE, (req, res) => {
  const { stageId, ordine } = req.body || {};
  db.prepare(`UPDATE crm_opportunita SET stage_id=?, ordine=?, updated_at=datetime('now') WHERE id=?`)
    .run(stageId || null, ordine ?? 0, req.params.id);
  res.json({ success: true });
});

router.delete('/opportunita/:id', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), (req, res) => {
  db.prepare('DELETE FROM crm_opportunita WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Attività ─────────────────────────────────────────────────────────────────
router.get('/opportunita/:id/attivita', (req, res) => {
  const rows = db.prepare('SELECT * FROM crm_attivita WHERE opportunita_id=? ORDER BY data_pianificata DESC, id DESC')
    .all(req.params.id);
  res.json(rows.map(r => ({ ...r, completata: r.completata === 1 })));
});

router.post('/opportunita/:id/attivita', (req, res) => {
  const a = req.body || {};
  const r = db.prepare(`INSERT INTO crm_attivita
    (opportunita_id, tipo, titolo, descrizione, data_pianificata, data_completamento, completata)
    VALUES (?,?,?,?,?,?,?)`).run(
    req.params.id, a.tipo, a.titolo, a.descrizione || '',
    a.dataPianificata || null, a.dataCompletamento || null,
    a.completata ? 1 : 0);
  res.json({ id: r.lastInsertRowid });
});

router.patch('/attivita/:id', (req, res) => {
  const a = req.body || {};
  const cur = db.prepare('SELECT * FROM crm_attivita WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Non trovata' });
  db.prepare(`UPDATE crm_attivita SET
      titolo=?, descrizione=?, data_pianificata=?, data_completamento=?, completata=? WHERE id=?`).run(
    a.titolo ?? cur.titolo, a.descrizione ?? cur.descrizione,
    a.dataPianificata ?? cur.data_pianificata, a.dataCompletamento ?? cur.data_completamento,
    a.completata !== undefined ? (a.completata ? 1 : 0) : cur.completata,
    req.params.id);
  res.json({ success: true });
});

router.delete('/attivita/:id', (req, res) => {
  db.prepare('DELETE FROM crm_attivita WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
