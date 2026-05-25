// Timesheet / Commesse — scaffold operativo.
// Fornisce CRUD per progetti e voci timesheet. La generazione fattura da
// timesheet è prevista in fase successiva (TODO).

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireRole } = require('../middleware/auth');

const MANAGE_PROGETTI = requireRole('SUPERADMIN', 'OWNER', 'ADMIN', 'COMMERCIALE');
const FATTURABILE     = requireRole('SUPERADMIN', 'OWNER', 'ADMIN', 'COMMERCIALE', 'CONTABILE');

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

router.post('/progetti', MANAGE_PROGETTI, (req, res) => {
  const p = req.body || {};
  const r = db.prepare(`INSERT INTO progetti
    (nome, descrizione, cliente_id, stato, data_inizio, data_fine, budget, tariffa_oraria, note)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    p.nome, p.descrizione || '', p.clienteId || null, p.stato || 'APERTO',
    p.dataInizio || '', p.dataFine || '', p.budget || 0, p.tariffaOraria || 0, p.note || '');
  res.json({ id: r.lastInsertRowid });
});

router.put('/progetti/:id', MANAGE_PROGETTI, (req, res) => {
  const p = req.body || {};
  db.prepare(`UPDATE progetti SET
    nome=?, descrizione=?, cliente_id=?, stato=?, data_inizio=?, data_fine=?,
    budget=?, tariffa_oraria=?, note=? WHERE id=?`).run(
    p.nome, p.descrizione || '', p.clienteId || null, p.stato || 'APERTO',
    p.dataInizio || '', p.dataFine || '', p.budget || 0, p.tariffaOraria || 0,
    p.note || '', req.params.id);
  res.json({ success: true });
});

router.delete('/progetti/:id', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), (req, res) => {
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

// POST /progetti/:id/fattura — genera fattura da voci non fatturate del progetto.
// Crea una fattura in stato EMESSA con una riga "Ore lavorate (NN h x €/h = €...)"
// e marca le voci come fatturate.
const { getNextNumero } = require('../utils/nextNumero');
router.post('/progetti/:id/fattura', FATTURABILE, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const progetto = db.prepare('SELECT * FROM progetti WHERE id=?').get(id);
  if (!progetto) return res.status(404).json({ error: 'Progetto non trovato' });
  if (!progetto.cliente_id) return res.status(400).json({ error: 'Progetto senza cliente: impossibile fatturare' });
  if (!progetto.tariffa_oraria || progetto.tariffa_oraria <= 0) {
    return res.status(400).json({ error: 'Tariffa oraria non impostata sul progetto' });
  }
  const voci = db.prepare(
    `SELECT id, data, ore, descrizione FROM timesheet_voci WHERE progetto_id=? AND fatturata=0 ORDER BY data`
  ).all(id);
  if (!voci.length) return res.status(400).json({ error: 'Nessuna voce da fatturare' });

  const oreTotali = voci.reduce((s, v) => s + v.ore, 0);
  const importo   = +(oreTotali * progetto.tariffa_oraria).toFixed(2);
  const oggi      = new Date().toISOString().slice(0, 10);

  // IVA: prende l'aliquota dal cliente (aliquota_iva_id), altrimenti la predefinita
  // azienda, altrimenti 22.
  const ivaCliente = db.prepare(`
    SELECT ai.valore FROM clienti c
    LEFT JOIN aliquote_iva ai ON ai.id = c.aliquota_iva_id
    WHERE c.id=?`).get(progetto.cliente_id)?.valore;
  const ivaPred = db.prepare("SELECT valore FROM aliquote_iva WHERE predefinito=1 LIMIT 1").get()?.valore;
  const ivaCalcolata = (ivaCliente != null && ivaCliente !== '') ? Number(ivaCliente)
                      : (ivaPred != null ? Number(ivaPred) : 22);
  const ivaDefault = Number.isFinite(ivaCalcolata) ? ivaCalcolata : 22;

  const descrizione = `Prestazioni progetto "${progetto.nome}" — ${oreTotali} h x ${progetto.tariffa_oraria.toFixed(2)} €/h`;

  const tx = db.transaction(() => {
    const numero = getNextNumero('fatture', 'fatture');
    const r = db.prepare(`INSERT INTO fatture
      (numero, data_emissione, cliente_id, note, stato)
      VALUES (?,?,?,?,?)`).run(numero, oggi, progetto.cliente_id,
        `Fattura automatica da timesheet: progetto "${progetto.nome}"`, 'EMESSA');
    const fatturaId = r.lastInsertRowid;

    db.prepare(`INSERT INTO fatture_righe
      (fattura_id, descrizione, quantita, prezzo, iva, unita_misura, tipo)
      VALUES (?,?,?,?,?,?,?)`).run(
      fatturaId, descrizione, oreTotali, progetto.tariffa_oraria, ivaDefault, 'h', 'PRODOTTO');

    const upd = db.prepare('UPDATE timesheet_voci SET fatturata=1, fattura_id=? WHERE id=?');
    for (const v of voci) upd.run(fatturaId, v.id);

    return { fatturaId, numero };
  });

  try {
    const { fatturaId, numero: num } = tx();
    res.json({
      fatturaId, numero: num,
      voci: voci.length, oreTotali, importo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
