const express = require('express');
const router = express.Router();
const db = require('../database');

// ── Helpers ──────────────────────────────────────────────────────────────────
const parseJson = (s, fallback) => {
  try { return JSON.parse(s) ?? fallback; } catch (_) { return fallback; }
};

const toDto = (r) => r && ({
  id: r.id,
  nome: r.nome,
  descrizione: r.descrizione || '',
  scontoDefault: r.sconto_default || 0,
  attivo: !!r.attivo,
  colonneExtra: parseJson(r.colonne_extra, []),
  createdAt: r.created_at,
});

const prezzoDto = (r) => r && ({
  id: r.id,
  listinoId: r.listino_id,
  prodottoId: r.prodotto_id,
  prezzo: r.prezzo,
  sconto: r.sconto,
  ordine: r.ordine || 0,
  datiExtra: parseJson(r.dati_extra, {}),
  prodottoNome: r.prodotto_nome,
  prodottoCodice: r.prodotto_codice,
  prodottoPrezzoBase: r.prodotto_prezzo_base,
  prodottoIva: r.prodotto_iva,
  prodottoUm: r.prodotto_um,
  prodottoCategoria: r.prodotto_categoria,
  prodottoDescrizione: r.prodotto_descrizione,
});

// Le colonne extra sono definite dall'utente: accetta solo {key,label} sani.
const sanitizeColonne = (cols) => (Array.isArray(cols) ? cols : [])
  .filter(c => c && typeof c.key === 'string' && c.key.trim() && typeof c.label === 'string' && c.label.trim())
  .slice(0, 12)
  .map(c => ({ key: c.key.trim().slice(0, 40), label: c.label.trim().slice(0, 60) }));

const sanitizeDatiExtra = (d) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
  const out = {};
  for (const [k, v] of Object.entries(d).slice(0, 12)) {
    if (typeof k === 'string' && k.trim()) out[k.trim().slice(0, 40)] = String(v ?? '').slice(0, 200);
  }
  return out;
};

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
  const { nome, descrizione, scontoDefault, attivo, colonneExtra } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    const result = db.prepare(`
      INSERT INTO listini (nome, descrizione, sconto_default, attivo, colonne_extra)
      VALUES (?, ?, ?, ?, ?)
    `).run(nome.trim(), descrizione || '', +scontoDefault || 0, attivo === false ? 0 : 1,
           JSON.stringify(sanitizeColonne(colonneExtra)));
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Esiste già un listino con questo nome' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { nome, descrizione, scontoDefault, attivo, colonneExtra } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    // colonneExtra assente nel payload = non toccare quelle salvate
    const colonneJson = colonneExtra === undefined
      ? (db.prepare('SELECT colonne_extra FROM listini WHERE id=?').get(req.params.id)?.colonne_extra || '[]')
      : JSON.stringify(sanitizeColonne(colonneExtra));
    db.prepare(`
      UPDATE listini SET nome=?, descrizione=?, sconto_default=?, attivo=?, colonne_extra=?
      WHERE id=?
    `).run(nome.trim(), descrizione || '', +scontoDefault || 0, attivo === false ? 0 : 1,
           colonneJson, req.params.id);
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
           p.nome        AS prodotto_nome,
           p.codice      AS prodotto_codice,
           p.prezzo      AS prodotto_prezzo_base,
           p.iva         AS prodotto_iva,
           p.unita_misura AS prodotto_um,
           p.categoria   AS prodotto_categoria,
           p.descrizione AS prodotto_descrizione
    FROM listini_prezzi lp
    JOIN prodotti p ON p.id = lp.prodotto_id
    WHERE lp.listino_id=?
    ORDER BY lp.ordine, p.nome
  `).all(req.params.id);
  res.json(rows.map(prezzoDto));
});

router.post('/:id/prezzi', (req, res) => {
  const { prodottoId, prezzo, sconto, datiExtra } = req.body || {};
  if (!prodottoId) return res.status(400).json({ error: 'prodottoId obbligatorio' });
  try {
    // datiExtra assente = preserva i valori già salvati (upsert parziale)
    const extraJson = datiExtra === undefined
      ? undefined
      : JSON.stringify(sanitizeDatiExtra(datiExtra));
    const maxOrd = db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM listini_prezzi WHERE listino_id=?')
      .get(req.params.id).m;
    const result = db.prepare(`
      INSERT INTO listini_prezzi (listino_id, prodotto_id, prezzo, sconto, dati_extra, ordine)
      VALUES (?, ?, ?, ?, COALESCE(?, '{}'), ?)
      ON CONFLICT(listino_id, prodotto_id) DO UPDATE SET
        prezzo=excluded.prezzo, sconto=excluded.sconto,
        dati_extra=CASE WHEN ? IS NULL THEN dati_extra ELSE excluded.dati_extra END
    `).run(
      req.params.id,
      prodottoId,
      prezzo == null || prezzo === '' ? null : +prezzo,
      sconto == null || sconto === '' ? null : +sconto,
      extraJson ?? null,
      maxOrd + 1,
      extraJson ?? null,
    );
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aggiunta massiva: tutti i prodotti indicati (es. flaggati nel picker o di una
// categoria). I prodotti già presenti nel listino vengono ignorati.
router.post('/:id/prezzi/bulk', (req, res) => {
  const { prodottoIds, sconto } = req.body || {};
  if (!Array.isArray(prodottoIds) || !prodottoIds.length) {
    return res.status(400).json({ error: 'prodottoIds obbligatorio' });
  }
  const listino = db.prepare('SELECT id FROM listini WHERE id=?').get(req.params.id);
  if (!listino) return res.status(404).json({ error: 'Listino non trovato' });
  try {
    const scontoVal = sconto == null || sconto === '' ? null : +sconto;
    let maxOrd = db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM listini_prezzi WHERE listino_id=?')
      .get(req.params.id).m;
    const ins = db.prepare(`
      INSERT INTO listini_prezzi (listino_id, prodotto_id, prezzo, sconto, dati_extra, ordine)
      VALUES (?, ?, NULL, ?, '{}', ?)
      ON CONFLICT(listino_id, prodotto_id) DO NOTHING
    `);
    let aggiunti = 0;
    const tx = db.transaction((ids) => {
      for (const pid of ids) {
        if (!+pid) continue;
        const r = ins.run(req.params.id, +pid, scontoVal, ++maxOrd);
        aggiunti += r.changes;
      }
    });
    tx(prodottoIds.slice(0, 5000));
    res.json({ aggiunti });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ordinamento manuale delle righe: array di prezzoId nell'ordine desiderato.
router.put('/:id/prezzi/riordina', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids obbligatorio' });
  try {
    const upd = db.prepare('UPDATE listini_prezzi SET ordine=? WHERE id=? AND listino_id=?');
    const tx = db.transaction((list) => {
      list.forEach((id, i) => upd.run(i + 1, id, req.params.id));
    });
    tx(ids.slice(0, 5000));
    res.json({ success: true });
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
