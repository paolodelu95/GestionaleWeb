const express = require('express');
const router = express.Router();
const db = require('../database');

// Quantità suggerita: riordino_quantita se impostata, altrimenti quanto serve per
// tornare alla soglia (minimo 1).
function suggestQty(p) {
  if (p.riordino_quantita > 0) return p.riordino_quantita;
  const diff = (p.soglia_minima || 0) - (p.quantita || 0);
  return diff > 0 ? diff : 1;
}

// GET /api/riordino/proposte — prodotti da riordinare (esauriti/negativi o sotto soglia),
// con fornitore preferito e quantità suggerita.
router.get('/proposte', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.nome, p.codice, p.quantita, p.soglia_minima, p.riordino_quantita,
           p.prezzo_acquisto, p.prezzo, p.iva, p.unita_misura,
           p.fornitore_id_preferito, f.ragione_sociale AS fornitore_nome
    FROM prodotti p
    LEFT JOIN fornitori f ON f.id = p.fornitore_id_preferito
    WHERE p.quantita <= 0 OR (p.soglia_minima > 0 AND p.quantita < p.soglia_minima)
    ORDER BY COALESCE(f.ragione_sociale, 'ZZZZ'), p.nome
  `).all();
  res.json(rows.map(r => ({
    prodottoId: r.id, nome: r.nome, codice: r.codice || '',
    quantita: r.quantita, sogliaMinima: r.soglia_minima,
    quantitaSuggerita: suggestQty(r),
    prezzoAcquisto: r.prezzo_acquisto ?? r.prezzo ?? 0,
    iva: r.iva ?? 22, unitaMisura: r.unita_misura || '',
    fornitoreId: r.fornitore_id_preferito || null,
    fornitoreNome: r.fornitore_nome || null,
  })));
});

// POST /api/riordino/genera — crea ordini fornitore (uno per fornitore) dalle righe scelte.
// body: { items: [{ prodottoId, quantita, fornitoreId }] }
router.post('/genera', (req, res) => {
  const items = (req.body?.items || []).filter(i => i.prodottoId && i.fornitoreId && Number(i.quantita) > 0);
  if (!items.length) return res.status(400).json({ error: 'Nessun prodotto valido da ordinare (serve un fornitore e una quantità).' });

  const byForn = new Map();
  for (const it of items) {
    if (!byForn.has(it.fornitoreId)) byForn.set(it.fornitoreId, []);
    byForn.get(it.fornitoreId).push(it);
  }

  const oggi = new Date().toISOString().split('T')[0];
  const created = [];
  const insOrd = db.prepare(`INSERT INTO ordini (numero, data_ordine, fornitore_id, tipo, stato, note)
    VALUES (?,?,?,?,?,?)`);
  const insRiga = db.prepare(`INSERT INTO ordini_righe (ordine_id, prodotto_id, descrizione, quantita, prezzo, iva)
    VALUES (?,?,?,?,?,?)`);
  const getProd = db.prepare('SELECT nome, prezzo_acquisto, prezzo, iva FROM prodotti WHERE id=?');

  db.transaction(() => {
    for (const [fornitoreId, righe] of byForn) {
      let n = db.prepare('SELECT COUNT(*) AS c FROM ordini').get().c + 1;
      let numero = `RO-${n}`;
      while (db.prepare('SELECT id FROM ordini WHERE numero=?').get(numero)) { n++; numero = `RO-${n}`; }
      const ordineId = insOrd.run(numero, oggi, fornitoreId, 'FORNITORE', 'APERTO', 'Riordino scorte').lastInsertRowid;
      for (const r of righe) {
        const prod = getProd.get(r.prodottoId);
        insRiga.run(ordineId, r.prodottoId, prod?.nome || '', Number(r.quantita),
          prod?.prezzo_acquisto ?? prod?.prezzo ?? 0, prod?.iva ?? 22);
      }
      const forn = db.prepare('SELECT ragione_sociale FROM fornitori WHERE id=?').get(fornitoreId);
      created.push({ numero, fornitoreNome: forn?.ragione_sociale || '', righe: righe.length });
    }
  })();

  res.json({ created });
});

module.exports = router;
