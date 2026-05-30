const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  try {
    const { mese } = req.query; // formato YYYY-MM opzionale

    // Fatture da incassare (emesse, non pagate, non annullate)
    const fatture = db.prepare(`
      SELECT f.id, f.numero, f.data_emissione, f.stato,
             c.ragione_sociale as cliente_nome,
             COALESCE(tp.giorni_scadenza, 30) as giorni_pagamento,
             date(f.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') as data_scadenza,
             COALESCE((
               SELECT SUM(fr.quantita * fr.prezzo * (1 - COALESCE(fr.sconto,0)/100) * (1 + fr.iva/100))
               FROM fatture_righe fr WHERE fr.fattura_id = f.id
             ), 0) as totale,
             'fattura' as tipo, 'ENTRATA' as direzione
      FROM fatture f
      LEFT JOIN clienti c ON f.cliente_id = c.id
      LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
      WHERE f.stato NOT IN ('PAGATA','ANNULLATA','STORNATA')
    `).all();

    // Acquisti da pagare (ricevuti, non pagati, non annullati)
    const acquisti = db.prepare(`
      SELECT a.id, a.numero, a.data_emissione, a.stato,
             forn.ragione_sociale as fornitore_nome,
             COALESCE(tp.giorni_scadenza, 30) as giorni_pagamento,
             date(a.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') as data_scadenza,
             COALESCE((
               SELECT SUM(ar.quantita * ar.prezzo * (1 - COALESCE(ar.sconto,0)/100) * (1 + ar.iva/100))
               FROM acquisti_righe ar WHERE ar.acquisto_id = a.id
             ), 0) as totale,
             'acquisto' as tipo, 'USCITA' as direzione
      FROM acquisti a
      LEFT JOIN fornitori forn ON a.fornitore_id = forn.id
      LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
      WHERE a.stato NOT IN ('PAGATO','ANNULLATO','PAGATA')
    `).all();

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    const toItem = (r) => {
      const dataScadenza = r.data_scadenza || null;
      let giorniMancanti = null;
      if (dataScadenza) {
        const ds = new Date(dataScadenza);
        ds.setHours(0, 0, 0, 0);
        giorniMancanti = Math.round((ds - oggi) / (1000 * 60 * 60 * 24));
      }
      return {
        id: r.id,
        numero: r.numero,
        tipo: r.tipo,
        direzione: r.direzione,
        dataScadenza,
        dataEmissione: r.data_emissione,
        totale: r.totale ?? 0,
        stato: r.stato,
        controparte: r.cliente_nome || r.fornitore_nome || null,
        giorniMancanti,
        scaduto: giorniMancanti !== null ? giorniMancanti < 0 : false,
      };
    };

    let items = [...fatture.map(toItem), ...acquisti.map(toItem)];

    // Filtro opzionale per mese di scadenza
    if (mese && /^\d{4}-\d{2}$/.test(mese)) {
      items = items.filter(i => i.dataScadenza && i.dataScadenza.startsWith(mese));
    }

    // Ordina per data scadenza ascendente (scaduti prima)
    items.sort((a, b) => {
      const da = a.dataScadenza || '';
      const db2 = b.dataScadenza || '';
      return da.localeCompare(db2);
    });

    res.json(items);
  } catch (err) {
    console.error('[scadenzario] errore:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
