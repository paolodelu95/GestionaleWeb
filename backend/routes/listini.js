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
  colonneStandard: parseJson(r.colonne_standard, []),
  colonneConfig: parseJson(r.colonne_config, []),
  stampaDueColonne: !!r.stampa_due_colonne,
  griglia: !!r.griglia,
  createdAt: r.created_at,
});

const sezioneDto = (r) => r && ({
  id: r.id,
  listinoId: r.listino_id,
  nome: r.nome,
  ordine: r.ordine || 0,
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

// Override delle colonne standard (legacy, mantenuto per compat di lettura).
const STD_KEYS = ['num', 'codice', 'prodotto', 'prezzoBase', 'sconto', 'prezzo'];
const sanitizeColonneStd = (cols) => {
  const seen = new Set();
  return (Array.isArray(cols) ? cols : [])
    .filter(c => c && STD_KEYS.includes(c.key) && !seen.has(c.key) && seen.add(c.key))
    .map(c => ({
      key: c.key,
      label: String(c.label ?? '').trim().slice(0, 60),
      visibile: c.visibile !== false,
    }));
};

// Config colonne unificata: standard + personalizzate in un unico ordine.
// Tutte rinominabili e nascondibili (anche "prodotto", su richiesta esplicita).
const sanitizeColonneCfg = (cols) => {
  const seen = new Set();
  const out = [];
  for (const c of (Array.isArray(cols) ? cols : [])) {
    if (!c || typeof c.key !== 'string') continue;
    const key = c.key.trim().slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label: String(c.label ?? '').trim().slice(0, 60),
      visibile: c.visibile !== false,
      tipo: STD_KEYS.includes(key) ? 'std' : 'extra',
    });
    if (out.length >= 18) break;
  }
  return out;
};

/** Prossimo valore di "ordine": sequenza unica condivisa tra prezzi e sezioni. */
const nextOrdine = (listinoId) => Math.max(
  db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM listini_prezzi WHERE listino_id=?').get(listinoId).m,
  db.prepare('SELECT COALESCE(MAX(ordine), 0) AS m FROM listini_sezioni WHERE listino_id=?').get(listinoId).m,
) + 1;

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
  const { nome, descrizione, scontoDefault, attivo, colonneExtra, colonneStandard, colonneConfig, stampaDueColonne, griglia } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    const result = db.prepare(`
      INSERT INTO listini (nome, descrizione, sconto_default, attivo, colonne_extra, colonne_standard, colonne_config, stampa_due_colonne, griglia)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nome.trim(), descrizione || '', +scontoDefault || 0, attivo === false ? 0 : 1,
           JSON.stringify(sanitizeColonne(colonneExtra)),
           JSON.stringify(sanitizeColonneStd(colonneStandard)),
           JSON.stringify(sanitizeColonneCfg(colonneConfig)),
           stampaDueColonne ? 1 : 0,
           griglia ? 1 : 0);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Esiste già un listino con questo nome' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { nome, descrizione, scontoDefault, attivo, colonneExtra, colonneStandard, colonneConfig, stampaDueColonne, griglia } = req.body || {};
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    // Campi di configurazione assenti nel payload = non toccare quelli salvati
    const cur = db.prepare('SELECT colonne_extra, colonne_standard, colonne_config, stampa_due_colonne, griglia FROM listini WHERE id=?')
      .get(req.params.id) || {};
    const colonneJson = colonneExtra === undefined
      ? (cur.colonne_extra || '[]')
      : JSON.stringify(sanitizeColonne(colonneExtra));
    const colonneStdJson = colonneStandard === undefined
      ? (cur.colonne_standard || '[]')
      : JSON.stringify(sanitizeColonneStd(colonneStandard));
    const colonneCfgJson = colonneConfig === undefined
      ? (cur.colonne_config || '[]')
      : JSON.stringify(sanitizeColonneCfg(colonneConfig));
    const dueColonne = stampaDueColonne === undefined
      ? (cur.stampa_due_colonne || 0)
      : (stampaDueColonne ? 1 : 0);
    const grigliaVal = griglia === undefined
      ? (cur.griglia || 0)
      : (griglia ? 1 : 0);
    db.prepare(`
      UPDATE listini SET nome=?, descrizione=?, sconto_default=?, attivo=?, colonne_extra=?, colonne_standard=?, colonne_config=?, stampa_due_colonne=?, griglia=?
      WHERE id=?
    `).run(nome.trim(), descrizione || '', +scontoDefault || 0, attivo === false ? 0 : 1,
           colonneJson, colonneStdJson, colonneCfgJson, dueColonne, grigliaVal, req.params.id);
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
    const ord = nextOrdine(req.params.id);
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
      ord,
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
    let maxOrd = nextOrdine(req.params.id) - 1;
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

// ── SEZIONI (righe-divisore del listino, es. per categoria) ──────────────────
router.get('/:id/sezioni', (req, res) => {
  const rows = db.prepare('SELECT * FROM listini_sezioni WHERE listino_id=? ORDER BY ordine, id')
    .all(req.params.id);
  res.json(rows.map(sezioneDto));
});

router.post('/:id/sezioni', (req, res) => {
  const { nome } = req.body || {};
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  const listino = db.prepare('SELECT id FROM listini WHERE id=?').get(req.params.id);
  if (!listino) return res.status(404).json({ error: 'Listino non trovato' });
  try {
    const result = db.prepare('INSERT INTO listini_sezioni (listino_id, nome, ordine) VALUES (?, ?, ?)')
      .run(req.params.id, String(nome).trim().slice(0, 80), nextOrdine(req.params.id));
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/sezioni/:sezioneId', (req, res) => {
  const { nome } = req.body || {};
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  db.prepare('UPDATE listini_sezioni SET nome=? WHERE id=? AND listino_id=?')
    .run(String(nome).trim().slice(0, 80), req.params.sezioneId, req.params.id);
  res.json({ success: true });
});

router.delete('/:id/sezioni/:sezioneId', (req, res) => {
  db.prepare('DELETE FROM listini_sezioni WHERE id=? AND listino_id=?')
    .run(req.params.sezioneId, req.params.id);
  res.json({ success: true });
});

// Ordinamento manuale misto: array di {tipo: 'sezione'|'prezzo', id} nell'ordine
// desiderato. Assegna una sequenza unica condivisa tra le due tabelle.
router.put('/:id/riordina', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items obbligatorio' });
  try {
    const updPrezzo = db.prepare('UPDATE listini_prezzi SET ordine=? WHERE id=? AND listino_id=?');
    const updSezione = db.prepare('UPDATE listini_sezioni SET ordine=? WHERE id=? AND listino_id=?');
    const tx = db.transaction((list) => {
      list.forEach((it, i) => {
        if (!it || !+it.id) return;
        if (it.tipo === 'sezione') updSezione.run(i + 1, +it.id, req.params.id);
        else updPrezzo.run(i + 1, +it.id, req.params.id);
      });
    });
    tx(items.slice(0, 10000));
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
