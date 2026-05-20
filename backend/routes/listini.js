const express = require('express');
const router = express.Router();
const db = require('../database');

// ── Helpers ──────────────────────────────────────────────────────────────────
const toDto = (r) => r && ({
  id: r.id,
  nome: r.nome,
  descrizione: r.descrizione || '',
  scontoDefault: r.sconto_default || 0,
  attivo: !!r.attivo,
  createdAt: r.created_at,
});

const prezzoDto = (r) => r && ({
  id: r.id,
  listinoId: r.listino_id,
  prodottoId: r.prodotto_id,
  prezzo: r.prezzo,
  sconto: r.sconto,
  prodottoNome: r.prodotto_nome,
  prodottoCodice: r.prodotto_codice,
  prodottoPrezzoBase: r.prodotto_prezzo_base,
  prodottoIva: r.prodotto_iva,
});

// ── LISTINI CRUD ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, COUNT(lp.id) AS prezzi_count
    FROM listini l
    LEFT JOIN listini_prezzi lp ON lp.listino_id = l.id
    GROUP BY l.id
    ORDER BY l.nome
  `).all();
  res.json(rows.map(r => ({ ...toDto(r), prezziCount: r.prezzi_count })));
});

router.get('/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM listini WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Listino non trovato' });
  res.json(toDto(r));
});

router.post('/', (req, res) => {
  const { nome, descrizione, scontoDefault, attivo } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    const result = db.prepare(`
      INSERT INTO listini (nome, descrizione, sconto_default, attivo)
      VALUES (?, ?, ?, ?)
    `).run(nome.trim(), descrizione || '', +scontoDefault || 0, attivo === false ? 0 : 1);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Esiste già un listino con questo nome' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { nome, descrizione, scontoDefault, attivo } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    db.prepare(`
      UPDATE listini SET nome=?, descrizione=?, sconto_default=?, attivo=?
      WHERE id=?
    `).run(nome.trim(), descrizione || '', +scontoDefault || 0, attivo === false ? 0 : 1, req.params.id);
    res.json({ success: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Esiste già un listino con questo nome' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  // Unset any cliente.listino_id referencing this listino
  db.prepare('UPDATE clienti SET listino_id=NULL WHERE listino_id=?').run(req.params.id);
  db.prepare('DELETE FROM listini WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── LISTINI PREZZI (prezzi/sconti per prodotto in un listino) ─────────────────
router.get('/:id/prezzi', (req, res) => {
  const rows = db.prepare(`
    SELECT lp.*,
           p.nome   AS prodotto_nome,
           p.codice AS prodotto_codice,
           p.prezzo AS prodotto_prezzo_base,
           p.iva    AS prodotto_iva
    FROM listini_prezzi lp
    JOIN prodotti p ON p.id = lp.prodotto_id
    WHERE lp.listino_id=?
    ORDER BY p.nome
  `).all(req.params.id);
  res.json(rows.map(prezzoDto));
});

router.post('/:id/prezzi', (req, res) => {
  const { prodottoId, prezzo, sconto } = req.body || {};
  if (!prodottoId) return res.status(400).json({ error: 'prodottoId obbligatorio' });
  try {
    const result = db.prepare(`
      INSERT INTO listini_prezzi (listino_id, prodotto_id, prezzo, sconto)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(listino_id, prodotto_id) DO UPDATE SET
        prezzo=excluded.prezzo, sconto=excluded.sconto
    `).run(
      req.params.id,
      prodottoId,
      prezzo == null || prezzo === '' ? null : +prezzo,
      sconto == null || sconto === '' ? null : +sconto,
    );
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/prezzi/:prezzoId', (req, res) => {
  const { prezzo, sconto } = req.body || {};
  db.prepare(`
    UPDATE listini_prezzi SET prezzo=?, sconto=?
    WHERE id=? AND listino_id=?
  `).run(
    prezzo == null || prezzo === '' ? null : +prezzo,
    sconto == null || sconto === '' ? null : +sconto,
    req.params.prezzoId, req.params.id,
  );
  res.json({ success: true });
});

router.delete('/:id/prezzi/:prezzoId', (req, res) => {
  db.prepare('DELETE FROM listini_prezzi WHERE id=? AND listino_id=?')
    .run(req.params.prezzoId, req.params.id);
  res.json({ success: true });
});

// ── Risoluzione prezzo per (cliente, prodotto) ────────────────────────────────
// Logica: se il cliente ha un listino → cerca prezzo override; se non c'è,
// applica lo sconto specifico riga (se presente) o lo sconto_default del listino
router.get('/resolve/:clienteId/:prodottoId', (req, res) => {
  const cliente = db.prepare('SELECT listino_id FROM clienti WHERE id=?').get(req.params.clienteId);
  const prodotto = db.prepare('SELECT id, prezzo, iva FROM prodotti WHERE id=?').get(req.params.prodottoId);
  if (!prodotto) return res.status(404).json({ error: 'Prodotto non trovato' });

  const base = { prezzo: prodotto.prezzo, sconto: 0, iva: prodotto.iva, sorgente: 'BASE' };
  if (!cliente?.listino_id) return res.json(base);

  const listino = db.prepare('SELECT id, nome, sconto_default FROM listini WHERE id=? AND attivo=1').get(cliente.listino_id);
  if (!listino) return res.json(base);

  const lp = db.prepare(`
    SELECT prezzo, sconto FROM listini_prezzi
    WHERE listino_id=? AND prodotto_id=?
  `).get(cliente.listino_id, req.params.prodottoId);

  if (lp?.prezzo != null) {
    return res.json({ prezzo: lp.prezzo, sconto: 0, iva: prodotto.iva,
                     sorgente: 'LISTINO_OVERRIDE', listinoId: listino.id, listinoNome: listino.nome });
  }
  const sconto = lp?.sconto != null ? lp.sconto : (listino.sconto_default || 0);
  return res.json({
    prezzo: prodotto.prezzo, sconto, iva: prodotto.iva,
    sorgente: sconto > 0 ? 'LISTINO_SCONTO' : 'BASE',
    listinoId: listino.id, listinoNome: listino.nome,
  });
});

module.exports = router;
