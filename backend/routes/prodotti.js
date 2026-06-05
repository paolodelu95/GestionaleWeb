const express = require('express');
const router = express.Router();
const db = require('../database');
const { scoreCandidati } = require('../utils/matchProdotti');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM prodotti ORDER BY nome').all();
  res.json(rows.map(r => toDto(r)));
});

router.get('/sotto-soglia', (req, res) => {
  // Mostra tutti i prodotti con un problema di giacenza: esauriti o negativi
  // (quantita <= 0) oppure sotto la soglia minima configurata (se impostata).
  const rows = db.prepare(`SELECT * FROM prodotti
    WHERE quantita <= 0 OR (soglia_minima > 0 AND quantita < soglia_minima)
    ORDER BY quantita ASC, nome`).all();
  res.json(rows.map(r => toDto(r)));
});

// Rettifica rapida della giacenza: imposta la quantità reale a magazzino,
// registra automaticamente un movimento di rettifica con la differenza.
router.post('/:id/rettifica', (req, res) => {
  const id = Number(req.params.id);
  const nuova = Number(req.body?.quantita);
  if (!Number.isFinite(nuova)) return res.status(400).json({ error: 'Quantità non valida' });
  const prod = db.prepare('SELECT id, nome, quantita FROM prodotti WHERE id=?').get(id);
  if (!prod) return res.status(404).json({ error: 'Prodotto non trovato' });
  const delta = nuova - (prod.quantita ?? 0);
  if (delta !== 0) {
    db.prepare('UPDATE prodotti SET quantita=? WHERE id=?').run(nuova, id);
    db.prepare(`INSERT INTO movimenti_magazzino
      (data, prodotto_id, prodotto_nome, tipo, quantita, causale, note)
      VALUES (?,?,?,?,?,?,?)`)
      .run(new Date().toISOString().split('T')[0], id, prod.nome || '',
           delta > 0 ? 'CARICO' : 'SCARICO', Math.abs(delta), 'RETTIFICA',
           (req.body?.note || '').toString().slice(0, 500));
  }
  res.json({ success: true, delta });
});

router.get('/count', (req, res) => {
  const r = db.prepare('SELECT COUNT(*) as count FROM prodotti').get();
  res.json(r.count);
});

router.get('/valore', (req, res) => {
  const r = db.prepare('SELECT SUM(prezzo * quantita) as valore FROM prodotti').get();
  res.json(r.valore || 0);
});

router.post('/', (req, res) => {
  const p = req.body;
  const result = db.prepare(`INSERT INTO prodotti
    (nome, categoria, descrizione, prezzo, prezzo_acquisto, quantita, soglia_minima, unita_misura, codice, codice_fornitore, iva, barcode, ha_varianti, fornitore_id_preferito, riordino_quantita)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.nome, p.categoria, p.descrizione, p.prezzo, p.prezzoAcquisto ?? null, p.quantita ?? 0,
         p.sogliaMinima ?? 0, p.unitaMisura, p.codice, p.codiceFornitore || '',
         p.iva, p.barcode || '', p.haVarianti ? 1 : 0,
         p.fornitoreIdPreferito || null, p.riordinoQuantita ?? 0);
  const id = result.lastInsertRowid;
  if (p.haVarianti && p.varianti?.length) {
    saveVarianti(id, p.varianti);
    syncQuantita(id);
  }
  if (p.fornitori) saveFornitori(id, p.fornitori);
  res.json({ id });
});

router.post('/import', (req, res) => {
  try {
    const records = Array.isArray(req.body) ? req.body : [];
    let created = 0, updated = 0, skipped = 0;
    const str = v => String(v ?? '').trim();
    const num = v => parseFloat(String(v ?? '').replace(',', '.')) || 0;
    const stmtCat = db.prepare('INSERT OR IGNORE INTO categorie_prodotto (nome) VALUES (?)');
    for (const p of records) {
      const nome = str(p.nome);
      if (!nome) { skipped++; continue; }
      const categoria    = str(p.categoria);
      const descrizione  = str(p.descrizione);
      const codice       = str(p.codice);
      const codiceFornitore = str(p.codiceFornitore);
      const barcode      = str(p.barcode);
      const unitaMisura  = str(p.unitaMisura) || 'pz';
      const prezzo       = num(p.prezzo);
      const prezzoAcquisto = num(p.prezzoAcquisto) || null;
      const iva          = num(p.iva) || 22;
      const quantita     = parseInt(String(p.quantita ?? 0)) || 0;
      const sogliaMinima = parseInt(String(p.sogliaMinima ?? 0)) || 0;

      if (categoria) stmtCat.run(categoria);

      let existing = null;
      if (codice)
        existing = db.prepare("SELECT * FROM prodotti WHERE codice=? AND codice!=''").get(codice);
      if (!existing && barcode)
        existing = db.prepare("SELECT * FROM prodotti WHERE barcode=? AND barcode!=''").get(barcode);
      if (!existing)
        existing = db.prepare('SELECT * FROM prodotti WHERE LOWER(TRIM(nome))=?').get(nome.toLowerCase());

      if (existing) {
        const patch = {};
        if (!existing.categoria && categoria)          patch.categoria = categoria;
        if (!existing.descrizione && descrizione)      patch.descrizione = descrizione;
        if (!existing.codice && codice)                patch.codice = codice;
        if (!existing.codice_fornitore && codiceFornitore) patch.codice_fornitore = codiceFornitore;
        if (!existing.barcode && barcode)              patch.barcode = barcode;
        if (!existing.prezzo && prezzo)                patch.prezzo = prezzo;
        if (!existing.prezzo_acquisto && prezzoAcquisto) patch.prezzo_acquisto = prezzoAcquisto;
        if (!existing.unita_misura && unitaMisura)     patch.unita_misura = unitaMisura;
        if (Object.keys(patch).length > 0) {
          const sets = Object.keys(patch).map(k => `${k}=?`).join(', ');
          db.prepare(`UPDATE prodotti SET ${sets} WHERE id=?`).run(...Object.values(patch), existing.id);
          updated++;
        } else { skipped++; }
      } else {
        db.prepare(`INSERT INTO prodotti (nome,categoria,descrizione,prezzo,prezzo_acquisto,quantita,soglia_minima,unita_misura,codice,codice_fornitore,iva,barcode,ha_varianti,fornitore_id_preferito,riordino_quantita) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(nome, categoria, descrizione, prezzo, prezzoAcquisto, quantita, sogliaMinima, unitaMisura, codice, codiceFornitore, iva, barcode, 0, null, 0);
        created++;
      }
    }
    res.json({ created, updated, skipped });
  } catch (err) {
    console.error('Import prodotti error:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/prodotti/import-listino — aggiorna i prezzi di acquisto di un fornitore
// abbinando il codice del file al codice fornitore salvato nel prodotto.
// body: { fornitoreId, ivato: bool, righe: [{ codice, prezzo }] }
// I prezzi vengono SEMPRE salvati in netto: se 'ivato' è true, sono convertiti
// usando l'IVA del prodotto.
router.post('/import-listino', (req, res) => {
  const { fornitoreId, ivato, righe } = req.body || {};
  if (!fornitoreId || !Array.isArray(righe)) return res.status(400).json({ error: 'Dati mancanti (fornitore o righe).' });
  const findPF = db.prepare(`
    SELECT pf.id, pf.prodotto_id, p.iva, p.nome
    FROM prodotto_fornitori pf
    JOIN prodotti p ON p.id = pf.prodotto_id
    WHERE pf.fornitore_id = ? AND pf.codice_fornitore != ''
      AND LOWER(TRIM(pf.codice_fornitore)) = LOWER(TRIM(?))`);
  const updPF = db.prepare('UPDATE prodotto_fornitori SET prezzo_acquisto=? WHERE id=?');
  const updProdPref = db.prepare('UPDATE prodotti SET prezzo_acquisto=? WHERE id=? AND fornitore_id_preferito=?');
  // Fallback: codici memorizzati in precedenti abbinamenti confermati (anche piu
  // codici per lo stesso prodotto). Se il match esatto su prodotto_fornitori
  // fallisce, prova l'alias: cosi gli import successivi diventano automatici.
  const findAlias = db.prepare('SELECT prodotto_id FROM fornitore_codice_alias WHERE fornitore_id=? AND codice_norm=?');
  const findPFById = db.prepare('SELECT id FROM prodotto_fornitori WHERE prodotto_id=? AND fornitore_id=?');
  const ivaProd = db.prepare('SELECT iva FROM prodotti WHERE id=?');

  let aggiornati = 0;
  // nonTrovati: oggetti { codice, prezzo, descrizione } cosi il dialog puo
  // proporre un abbinamento per somiglianza testuale senza ri-leggere il file.
  const nonTrovati = [];
  const meta = (r, codice) => ({ codice, prezzo: r.prezzo ?? '', descrizione: String(r.descrizione ?? '').trim() });
  // applica il prezzo a un prodotto via il suo prodotto_fornitori (creandolo se manca)
  const applica = (prodottoId, codice, prezzoRaw) => {
    const iva = ivaProd.get(prodottoId)?.iva || 0;
    const netto = ivato ? +(prezzoRaw / (1 + iva / 100)).toFixed(4) : +prezzoRaw.toFixed(4);
    const row = findPFById.get(prodottoId, fornitoreId);
    if (row) {
      updPF.run(netto, row.id);
    } else {
      const isFirst = !db.prepare('SELECT 1 FROM prodotto_fornitori WHERE prodotto_id=? LIMIT 1').get(prodottoId);
      db.prepare('INSERT INTO prodotto_fornitori (prodotto_id, fornitore_id, codice_fornitore, prezzo_acquisto, predefinito) VALUES (?,?,?,?,?)')
        .run(prodottoId, fornitoreId, codice, netto, isFirst ? 1 : 0);
    }
    updProdPref.run(netto, prodottoId, fornitoreId);
  };
  db.transaction(() => {
    for (const r of righe) {
      const codice = String(r.codice ?? '').trim();
      const prezzoRaw = parseFloat(String(r.prezzo ?? '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
      if (!codice) continue;
      if (!Number.isFinite(prezzoRaw)) { nonTrovati.push(meta(r, codice)); continue; }
      const pf = findPF.get(fornitoreId, codice);
      if (pf) {
        const netto = ivato ? +(prezzoRaw / (1 + (pf.iva || 0) / 100)).toFixed(4) : +prezzoRaw.toFixed(4);
        updPF.run(netto, pf.id);
        updProdPref.run(netto, pf.prodotto_id, fornitoreId);
        aggiornati++;
        continue;
      }
      const al = findAlias.get(fornitoreId, codice.toLowerCase());
      if (al) { applica(al.prodotto_id, codice, prezzoRaw); aggiornati++; continue; }
      nonTrovati.push(meta(r, codice));
    }
  })();
  res.json({ aggiornati, nonTrovati });
});

// POST /api/prodotti/import-listino/match — per le righe NON abbinate propone i
// prodotti a magazzino piu probabili per somiglianza testuale (SOLA LETTURA).
// body: { fornitoreId, righe: [{ codice, descrizione, marca?, prezzo? }], limit?, minScore? }
router.post('/import-listino/match', (req, res) => {
  const { fornitoreId, righe, limit, minScore } = req.body || {};
  if (!fornitoreId || !Array.isArray(righe)) return res.status(400).json({ error: 'Dati mancanti (fornitore o righe).' });
  const prodotti = db.prepare(
    'SELECT id, nome, categoria, codice, descrizione, prezzo, prezzo_acquisto, quantita FROM prodotti'
  ).all();
  // prodotti gia associati a questo fornitore: lo segnaliamo (non li escludiamo,
  // potrebbero avere il codice ancora vuoto)
  const gia = new Set(
    db.prepare('SELECT prodotto_id FROM prodotto_fornitori WHERE fornitore_id=?').all(fornitoreId).map((r) => r.prodotto_id)
  );
  const risultati = scoreCandidati(righe, prodotti, { limit, minScore }).map((r) => ({
    ...r,
    candidati: r.candidati.map((c) => ({ ...c, giaAssociatoAFornitore: gia.has(c.prodottoId) })),
  }));
  res.json({ risultati });
});

// POST /api/prodotti/import-listino/abbina — conferma in batch gli abbinamenti
// scelti dall'utente: attacca il codice fornitore (UPSERT su prodotto_fornitori
// per coppia prodotto+fornitore, senza toccare gli altri fornitori) ed eventuale
// prezzo d'acquisto (convertito in netto come l'import).
// body: { fornitoreId, ivato, abbinamenti: [{ codice, prodottoId, prezzo? }] }
router.post('/import-listino/abbina', (req, res) => {
  const { fornitoreId, ivato, abbinamenti } = req.body || {};
  if (!fornitoreId || !Array.isArray(abbinamenti)) return res.status(400).json({ error: 'Dati mancanti.' });
  const fid = Number(fornitoreId);

  // codici gia usati da questo fornitore -> prodotto_id (per non assegnare lo
  // stesso codice fornitore a due prodotti diversi, presupposto del match esatto).
  // Unione dei codici primari (prodotto_fornitori) e della memoria (alias).
  const usati = new Map();
  for (const row of db.prepare("SELECT prodotto_id, codice_fornitore FROM prodotto_fornitori WHERE fornitore_id=? AND codice_fornitore!=''").all(fid))
    usati.set(String(row.codice_fornitore).trim().toLowerCase(), row.prodotto_id);
  for (const row of db.prepare('SELECT prodotto_id, codice_norm FROM fornitore_codice_alias WHERE fornitore_id=?').all(fid))
    usati.set(row.codice_norm, row.prodotto_id);
  const insAlias = db.prepare(`INSERT INTO fornitore_codice_alias (fornitore_id, prodotto_id, codice, codice_norm)
    VALUES (?,?,?,?) ON CONFLICT(fornitore_id, codice_norm) DO UPDATE SET prodotto_id=excluded.prodotto_id, codice=excluded.codice`);

  let associati = 0, aggiornati = 0;
  const saltati = [];

  db.transaction(() => {
    for (const a of abbinamenti) {
      const codice = String(a.codice ?? '').trim();
      const prodottoId = Number(a.prodottoId);
      if (!codice || !Number.isFinite(prodottoId)) { saltati.push({ codice, motivo: 'dati incompleti' }); continue; }

      const prod = db.prepare('SELECT id, iva FROM prodotti WHERE id=?').get(prodottoId);
      if (!prod) { saltati.push({ codice, motivo: 'prodotto inesistente' }); continue; }

      const key = codice.toLowerCase();
      if (usati.has(key) && usati.get(key) !== prodottoId) {
        saltati.push({ codice, motivo: 'codice gia usato su un altro prodotto' });
        continue;
      }

      // prezzo netto (stessa conversione di /import-listino)
      let netto = null;
      const raw = parseFloat(String(a.prezzo ?? '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
      if (Number.isFinite(raw)) netto = ivato ? +(raw / (1 + (prod.iva || 0) / 100)).toFixed(4) : +raw.toFixed(4);

      const exist = db.prepare('SELECT id FROM prodotto_fornitori WHERE prodotto_id=? AND fornitore_id=?').get(prodottoId, fid);
      if (exist) {
        // non distruttivo: il codice primario resta se gia valorizzato; il codice
        // appena confermato vive comunque nella memoria alias (sotto).
        db.prepare(`UPDATE prodotto_fornitori
          SET codice_fornitore = CASE WHEN codice_fornitore IS NULL OR codice_fornitore='' THEN ? ELSE codice_fornitore END,
              prezzo_acquisto = COALESCE(?, prezzo_acquisto)
          WHERE id=?`).run(codice, netto, exist.id);
        aggiornati++;
      } else {
        const isFirst = !db.prepare('SELECT 1 FROM prodotto_fornitori WHERE prodotto_id=? LIMIT 1').get(prodottoId);
        db.prepare('INSERT INTO prodotto_fornitori (prodotto_id, fornitore_id, codice_fornitore, prezzo_acquisto, predefinito) VALUES (?,?,?,?,?)')
          .run(prodottoId, fid, codice, netto, isFirst ? 1 : 0);
        associati++;
      }
      usati.set(key, prodottoId);
      // memorizza l'abbinamento (idempotente): rende automatici i prossimi import
      insAlias.run(fid, prodottoId, codice, key);

      // sincronizza i campi legacy del prodotto dal fornitore predefinito
      // (come saveFornitori) senza toccare gli altri fornitori
      const pref = db.prepare('SELECT fornitore_id, codice_fornitore FROM prodotto_fornitori WHERE prodotto_id=? ORDER BY predefinito DESC, id LIMIT 1').get(prodottoId);
      if (pref) {
        db.prepare('UPDATE prodotti SET fornitore_id_preferito=?, codice_fornitore=? WHERE id=?')
          .run(pref.fornitore_id, pref.codice_fornitore || '', prodottoId);
        if (pref.fornitore_id === fid && netto != null)
          db.prepare('UPDATE prodotti SET prezzo_acquisto=? WHERE id=?').run(netto, prodottoId);
      }
    }
  })();

  res.json({ associati, aggiornati, saltati });
});

// GET /api/prodotti/:id — dettaglio singolo prodotto
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID non valido' });
  const row = db.prepare('SELECT * FROM prodotti WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Prodotto non trovato' });
  res.json(toDto(row));
});

// GET /api/prodotti/:id/fornitori — fornitori del prodotto (codice + prezzo per fornitore)
router.get('/:id/fornitori', (req, res) => {
  const rows = db.prepare(`
    SELECT pf.id, pf.fornitore_id, pf.codice_fornitore, pf.prezzo_acquisto, pf.predefinito,
           f.ragione_sociale AS fornitore_nome
    FROM prodotto_fornitori pf
    LEFT JOIN fornitori f ON f.id = pf.fornitore_id
    WHERE pf.prodotto_id = ?
    ORDER BY pf.predefinito DESC, f.ragione_sociale`).all(req.params.id);
  res.json(rows.map(r => ({
    id: r.id, fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome || '',
    codiceFornitore: r.codice_fornitore || '', prezzoAcquisto: r.prezzo_acquisto ?? null,
    predefinito: r.predefinito === 1,
  })));
});

// GET /api/prodotti/:id/codici-alias — codici fornitore memorizzati per questo
// prodotto (dalla conferma abbinamenti durante l'import listino).
router.get('/:id/codici-alias', (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.codice, a.fornitore_id, a.created_at, f.ragione_sociale AS fornitore_nome
    FROM fornitore_codice_alias a
    LEFT JOIN fornitori f ON f.id = a.fornitore_id
    WHERE a.prodotto_id = ?
    ORDER BY f.ragione_sociale, a.codice`).all(req.params.id);
  res.json(rows.map(r => ({
    id: r.id, codice: r.codice, fornitoreId: r.fornitore_id,
    fornitoreNome: r.fornitore_nome || '', createdAt: r.created_at,
  })));
});

// DELETE /api/prodotti/codici-alias/:aliasId — rimuove un codice memorizzato.
router.delete('/codici-alias/:aliasId', (req, res) => {
  db.prepare('DELETE FROM fornitore_codice_alias WHERE id=?').run(req.params.aliasId);
  res.json({ success: true });
});

router.put('/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE prodotti SET nome=?, categoria=?, descrizione=?, prezzo=?, prezzo_acquisto=?,
    quantita=?, soglia_minima=?, unita_misura=?, codice=?, codice_fornitore=?, iva=?, barcode=?, ha_varianti=?,
    fornitore_id_preferito=?, riordino_quantita=? WHERE id=?`)
    .run(p.nome, p.categoria, p.descrizione, p.prezzo, p.prezzoAcquisto ?? null, p.quantita ?? 0,
         p.sogliaMinima ?? 0, p.unitaMisura, p.codice, p.codiceFornitore || '',
         p.iva, p.barcode || '', p.haVarianti ? 1 : 0,
         p.fornitoreIdPreferito || null, p.riordinoQuantita ?? 0, req.params.id);
  if (p.haVarianti) {
    db.prepare('DELETE FROM prodotto_varianti WHERE prodotto_id=?').run(req.params.id);
    if (p.varianti?.length) saveVarianti(req.params.id, p.varianti);
    syncQuantita(req.params.id);
  } else {
    db.prepare('DELETE FROM prodotto_varianti WHERE prodotto_id=?').run(req.params.id);
  }
  if (p.fornitori) saveFornitori(req.params.id, p.fornitori);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const t of ['ddt_righe', 'fatture_righe', 'note_credito_righe', 'ordini_righe',
                   'preventivi_righe', 'acquisti_righe', 'vendite_banco_righe', 'arrivi_merce_righe']) {
    db.prepare(`UPDATE ${t} SET prodotto_id=NULL WHERE prodotto_id=?`).run(id);
  }
  db.prepare('DELETE FROM prodotti WHERE id=?').run(id);
  res.json({ success: true });
});

function saveVarianti(prodottoId, varianti) {
  const stmt = db.prepare(
    `INSERT INTO prodotto_varianti (prodotto_id, taglia, colore, quantita, barcode)
     VALUES (?,?,?,?,?)`
  );
  for (const v of varianti) {
    stmt.run(prodottoId, v.taglia || '', v.colore || '', v.quantita ?? 0, v.barcode || '');
  }
}

// Salva i fornitori del prodotto (codice + prezzo per fornitore) e sincronizza i
// campi singoli di compatibilità (fornitore_id_preferito, codice_fornitore) dal predefinito.
function saveFornitori(prodottoId, fornitori) {
  db.prepare('DELETE FROM prodotto_fornitori WHERE prodotto_id=?').run(prodottoId);
  const list = Array.isArray(fornitori) ? fornitori.filter(f => f.fornitoreId) : [];
  if (!list.length) {
    db.prepare("UPDATE prodotti SET fornitore_id_preferito=NULL, codice_fornitore='' WHERE id=?").run(prodottoId);
    return;
  }
  const pref = list.find(f => f.predefinito) || list[0];
  const ins = db.prepare(`INSERT INTO prodotto_fornitori
    (prodotto_id, fornitore_id, codice_fornitore, prezzo_acquisto, predefinito) VALUES (?,?,?,?,?)`);
  for (const f of list) {
    ins.run(prodottoId, f.fornitoreId, f.codiceFornitore || '',
      (f.prezzoAcquisto === '' || f.prezzoAcquisto == null) ? null : Number(f.prezzoAcquisto),
      f === pref ? 1 : 0);
  }
  db.prepare('UPDATE prodotti SET fornitore_id_preferito=?, codice_fornitore=? WHERE id=?')
    .run(pref.fornitoreId, pref.codiceFornitore || '', prodottoId);
}

function syncQuantita(prodottoId) {
  const r = db.prepare('SELECT COALESCE(SUM(quantita),0) as tot FROM prodotto_varianti WHERE prodotto_id=?').get(prodottoId);
  db.prepare('UPDATE prodotti SET quantita=? WHERE id=?').run(r.tot, prodottoId);
}

function toDto(r) {
  const dto = {
    id: r.id, nome: r.nome, categoria: r.categoria, descrizione: r.descrizione,
    prezzo: r.prezzo, prezzoAcquisto: r.prezzo_acquisto ?? null, quantita: r.quantita, sogliaMinima: r.soglia_minima,
    unitaMisura: r.unita_misura, codice: r.codice, codiceFornitore: r.codice_fornitore || '',
    iva: r.iva, barcode: r.barcode || '', haVarianti: r.ha_varianti === 1,
    fornitoreIdPreferito: r.fornitore_id_preferito || null,
    riordinoQuantita: r.riordino_quantita ?? 0,
  };
  if (r.ha_varianti === 1) {
    dto.varianti = db.prepare(
      'SELECT id, taglia, colore, quantita, barcode FROM prodotto_varianti WHERE prodotto_id=? ORDER BY taglia, colore'
    ).all(r.id);
  }
  return dto;
}

module.exports = router;
