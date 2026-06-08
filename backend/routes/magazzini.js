// Magazzino avanzato: gestione depositi multipli, giacenze per deposito
// (con lotto/scadenza), trasferimenti tra depositi e alert scadenze.
const express = require('express');
const router = express.Router();
const db = require('../database');
const { adjGiacenza, magazzinoDefaultId } = require('../utils/stock');
const { audit } = require('../utils/audit');

function magDto(r) {
  return { id: r.id, codice: r.codice || '', nome: r.nome, indirizzo: r.indirizzo || '',
    predefinito: r.predefinito === 1, attivo: r.attivo === 1 };
}

// ── Depositi CRUD ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM magazzini ORDER BY predefinito DESC, nome').all();
  res.json(rows.map(magDto));
});

router.post('/', (req, res) => {
  const m = req.body || {};
  if (!m.nome?.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  const r = db.prepare('INSERT INTO magazzini (codice, nome, indirizzo, predefinito, attivo) VALUES (?,?,?,?,?)')
    .run(m.codice || '', m.nome.trim(), m.indirizzo || '', m.predefinito ? 1 : 0, m.attivo === false ? 0 : 1);
  if (m.predefinito) db.prepare('UPDATE magazzini SET predefinito=0 WHERE id!=?').run(r.lastInsertRowid);
  audit('magazzino', r.lastInsertRowid, 'CREATE', { nome: m.nome });
  res.json({ id: r.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const m = req.body || {};
  const cur = db.prepare('SELECT * FROM magazzini WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Deposito non trovato' });
  db.prepare('UPDATE magazzini SET codice=?, nome=?, indirizzo=?, attivo=? WHERE id=?')
    .run(m.codice ?? cur.codice, m.nome ?? cur.nome, m.indirizzo ?? cur.indirizzo,
         m.attivo !== undefined ? (m.attivo ? 1 : 0) : cur.attivo, req.params.id);
  // Il predefinito è esclusivo: impostarne uno azzera gli altri.
  if (m.predefinito) {
    db.prepare('UPDATE magazzini SET predefinito=0').run();
    db.prepare('UPDATE magazzini SET predefinito=1 WHERE id=?').run(req.params.id);
  }
  audit('magazzino', Number(req.params.id), 'UPDATE', { nome: m.nome });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM magazzini WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Deposito non trovato' });
  if (m.predefinito === 1) return res.status(400).json({ error: 'Non puoi eliminare il deposito predefinito' });
  const giac = db.prepare('SELECT COALESCE(SUM(ABS(quantita)),0) AS s FROM giacenze WHERE magazzino_id=?').get(req.params.id).s;
  if (giac > 0) return res.status(400).json({ error: 'Il deposito contiene giacenze: trasferiscile o azzerale prima.' });
  db.prepare('DELETE FROM magazzini WHERE id=?').run(req.params.id);
  audit('magazzino', Number(req.params.id), 'DELETE', { nome: m.nome });
  res.json({ success: true });
});

// ── Giacenze per deposito ────────────────────────────────────────────────────
// GET /giacenze?magazzinoId=&prodottoId=&soloDisponibili=1
router.get('/giacenze', (req, res) => {
  const where = ['1=1']; const params = [];
  if (req.query.magazzinoId) { where.push('g.magazzino_id=?'); params.push(req.query.magazzinoId); }
  if (req.query.prodottoId)  { where.push('g.prodotto_id=?');  params.push(req.query.prodottoId); }
  if (req.query.soloDisponibili === '1') where.push('g.quantita <> 0');
  const rows = db.prepare(`
    SELECT g.*, p.nome AS prodotto_nome, p.codice AS prodotto_codice, p.unita_misura,
           v.taglia AS variante_taglia, v.colore AS variante_colore, m.nome AS magazzino_nome
    FROM giacenze g
    JOIN prodotti p ON p.id = g.prodotto_id
    LEFT JOIN prodotto_varianti v ON v.id = g.variante_id
    JOIN magazzini m ON m.id = g.magazzino_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.nome, m.nome, g.scadenza`).all(...params);
  res.json(rows.map(r => ({
    id: r.id, prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome, prodottoCodice: r.prodotto_codice || '',
    unitaMisura: r.unita_misura || '', varianteId: r.variante_id,
    varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    magazzinoId: r.magazzino_id, magazzinoNome: r.magazzino_nome,
    lotto: r.lotto || '', scadenza: r.scadenza || '', quantita: r.quantita,
  })));
});

// GET /giacenze/prodotto/:id — ripartizione per deposito di un singolo prodotto
router.get('/giacenze/prodotto/:id', (req, res) => {
  const rows = db.prepare(`
    SELECT g.*, m.nome AS magazzino_nome, v.taglia AS variante_taglia, v.colore AS variante_colore
    FROM giacenze g JOIN magazzini m ON m.id=g.magazzino_id
    LEFT JOIN prodotto_varianti v ON v.id=g.variante_id
    WHERE g.prodotto_id=? AND g.quantita <> 0
    ORDER BY m.nome, g.scadenza`).all(req.params.id);
  res.json(rows.map(r => ({
    magazzinoId: r.magazzino_id, magazzinoNome: r.magazzino_nome,
    varianteId: r.variante_id, varianteTaglia: r.variante_taglia || '', varianteColore: r.variante_colore || '',
    lotto: r.lotto || '', scadenza: r.scadenza || '', quantita: r.quantita,
  })));
});

// ── Trasferimento tra depositi ───────────────────────────────────────────────
// POST /trasferimento { prodottoId, varianteId?, daMagazzinoId, aMagazzinoId, quantita, lotto?, scadenza?, note? }
router.post('/trasferimento', (req, res) => {
  const t = req.body || {};
  const prodottoId = Number(t.prodottoId);
  const da = Number(t.daMagazzinoId), a = Number(t.aMagazzinoId);
  const qty = Number(t.quantita);
  const varianteId = t.varianteId != null ? Number(t.varianteId) : null;
  const lotto = t.lotto || '', scadenza = t.scadenza || '';
  if (!prodottoId || !da || !a) return res.status(400).json({ error: 'Prodotto e depositi obbligatori' });
  if (da === a) return res.status(400).json({ error: 'I depositi di origine e destinazione coincidono' });
  if (!(qty > 0)) return res.status(400).json({ error: 'Quantità non valida' });

  const disp = db.prepare(`SELECT COALESCE(quantita,0) AS q FROM giacenze
    WHERE prodotto_id=? AND IFNULL(variante_id,0)=IFNULL(?,0) AND magazzino_id=? AND lotto=? AND scadenza=?`)
    .get(prodottoId, varianteId, da, lotto, scadenza)?.q || 0;
  if (disp < qty) return res.status(400).json({ error: `Giacenza insufficiente nel deposito di origine (disponibili ${disp}).` });

  const prod = db.prepare('SELECT nome FROM prodotti WHERE id=?').get(prodottoId);
  const tx = db.transaction(() => {
    adjGiacenza(prodottoId, varianteId, da, lotto, scadenza, -qty);
    adjGiacenza(prodottoId, varianteId, a, lotto, scadenza, +qty);
    // Un solo movimento TRASFERIMENTO (non altera il totale: lo storico lo ignora).
    db.prepare(`INSERT INTO movimenti_magazzino
      (data, prodotto_id, prodotto_nome, tipo, quantita, causale, note, variante_id,
       magazzino_id, magazzino_dest_id, lotto, scadenza)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(new Date().toISOString().slice(0, 10), prodottoId, prod?.nome || '',
           'TRASFERIMENTO', qty, 'TRASFERIMENTO', (t.note || '').toString().slice(0, 500),
           varianteId, da, a, lotto, scadenza);
  });
  tx();
  audit('magazzino', prodottoId, 'TRASFERIMENTO', { da, a, qty, lotto, scadenza });
  res.json({ success: true });
});

// ── Scadenze in arrivo (alert) ───────────────────────────────────────────────
// GET /scadenze?giorni=30 — lotti con scadenza entro N giorni (o già scaduti)
router.get('/scadenze', (req, res) => {
  const giorni = Math.min(Math.max(parseInt(String(req.query.giorni || '30'), 10), 0), 3650);
  const limite = new Date(Date.now() + giorni * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT g.*, p.nome AS prodotto_nome, p.unita_misura, m.nome AS magazzino_nome
    FROM giacenze g
    JOIN prodotti p ON p.id=g.prodotto_id
    JOIN magazzini m ON m.id=g.magazzino_id
    WHERE g.scadenza <> '' AND g.scadenza <= ? AND g.quantita > 0
    ORDER BY g.scadenza ASC`).all(limite);
  res.json(rows.map(r => ({
    prodottoId: r.prodotto_id, prodottoNome: r.prodotto_nome, unitaMisura: r.unita_misura || '',
    magazzinoId: r.magazzino_id, magazzinoNome: r.magazzino_nome,
    lotto: r.lotto || '', scadenza: r.scadenza, quantita: r.quantita,
  })));
});

module.exports = router;
