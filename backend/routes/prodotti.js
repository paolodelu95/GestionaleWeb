const express = require('express');
const router = express.Router();
const db = require('../database');

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

// GET /api/prodotti/:id — dettaglio singolo prodotto
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID non valido' });
  const row = db.prepare('SELECT * FROM prodotti WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Prodotto non trovato' });
  res.json(toDto(row));
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
