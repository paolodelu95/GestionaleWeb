const express = require('express');
const router = express.Router();
const db = require('../database');

// Restituisce i contatori per i badge nella sidebar
router.get('/badges', (req, res) => {
  const oggi = new Date().toISOString().split('T')[0];

  // Fatture emesse con data scadenza superata
  let scadenzeScadute = 0;
  try {
    const fatture = db.prepare(
      `SELECT f.id, f.totale, tp.giorni_pagamento
       FROM fatture f
       LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
       WHERE f.stato NOT IN ('PAGATA','ANNULLATA')`
    ).all();
    for (const f of fatture) {
      const giorni = f.giorni_pagamento ?? 30;
      const scadenza = db.prepare(
        `SELECT data_emissione FROM fatture WHERE id=?`
      ).get(f.id);
      if (scadenza?.data_emissione) {
        const dataScad = new Date(scadenza.data_emissione);
        dataScad.setDate(dataScad.getDate() + giorni);
        if (dataScad.toISOString().split('T')[0] < oggi) scadenzeScadute++;
      }
    }
  } catch (_) {}

  // Acquisti non pagati scaduti
  try {
    const acquisti = db.prepare(
      `SELECT a.id, a.data_emissione, tp.giorni_pagamento
       FROM acquisti a
       LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
       WHERE a.stato NOT IN ('PAGATA','ANNULLATA')`
    ).all();
    for (const a of acquisti) {
      const giorni = a.giorni_pagamento ?? 30;
      const dataScad = new Date(a.data_emissione);
      dataScad.setDate(dataScad.getDate() + giorni);
      if (dataScad.toISOString().split('T')[0] < oggi) scadenzeScadute++;
    }
  } catch (_) {}

  // Prodotti sotto soglia minima
  let prodottiSottoSoglia = 0;
  try {
    const r = db.prepare(
      `SELECT COUNT(*) as n FROM prodotti WHERE soglia_minima > 0 AND quantita <= soglia_minima`
    ).get();
    prodottiSottoSoglia = r?.n ?? 0;
  } catch (_) {}

  res.json({ scadenzeScadute, prodottiSottoSoglia, solleciti: scadenzeScadute });
});

module.exports = router;
