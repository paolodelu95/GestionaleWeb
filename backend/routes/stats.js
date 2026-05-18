const express = require('express');
const router = express.Router();
const db = require('../database');

// ── GET /vendite-mensili – ultimi 12 mesi ─────────────────────────────────────
router.get('/vendite-mensili', (req, res) => {
  const rows = db.prepare(`
    SELECT substr(f.data_emissione,1,7) as mese,
           COALESCE(SUM(fr.quantita * fr.prezzo * (1-COALESCE(fr.sconto,0)/100)),0) as imponibile,
           COALESCE(SUM(fr.quantita * fr.prezzo * (1-COALESCE(fr.sconto,0)/100) * (1+fr.iva/100)),0) as totale
    FROM fatture f
    JOIN fatture_righe fr ON fr.fattura_id = f.id
    WHERE f.data_emissione >= date('now','-12 months')
      AND f.stato != 'ANNULLATA'
    GROUP BY mese ORDER BY mese`).all();
  res.json(rows);
});

// ── GET /acquisti-mensili – ultimi 12 mesi ────────────────────────────────────
router.get('/acquisti-mensili', (req, res) => {
  const rows = db.prepare(`
    SELECT substr(a.data_emissione,1,7) as mese,
           COALESCE(SUM(ar.quantita * ar.prezzo * (1-COALESCE(ar.sconto,0)/100)),0) as imponibile
    FROM acquisti a
    JOIN acquisti_righe ar ON ar.acquisto_id = a.id
    WHERE a.data_emissione >= date('now','-12 months')
    GROUP BY mese ORDER BY mese`).all();
  res.json(rows);
});

// ── GET /top-prodotti – top 10 per fatturato ──────────────────────────────────
router.get('/top-prodotti', (req, res) => {
  const anno = req.query.anno || new Date().getFullYear();
  const rows = db.prepare(`
    SELECT p.nome,
           COALESCE(SUM(fr.quantita * fr.prezzo * (1-COALESCE(fr.sconto,0)/100)),0) as fatturato,
           COALESCE(SUM(fr.quantita),0) as quantita_venduta
    FROM fatture_righe fr
    JOIN fatture f ON f.id = fr.fattura_id
    LEFT JOIN prodotti p ON p.id = fr.prodotto_id
    WHERE substr(f.data_emissione,1,4) = ?
      AND f.stato != 'ANNULLATA'
      AND fr.prodotto_id IS NOT NULL
    GROUP BY fr.prodotto_id
    ORDER BY fatturato DESC LIMIT 10`).all(String(anno));
  res.json(rows);
});

// ── GET /top-clienti – top 10 per fatturato ───────────────────────────────────
router.get('/top-clienti', (req, res) => {
  const anno = req.query.anno || new Date().getFullYear();
  const rows = db.prepare(`
    SELECT c.ragione_sociale as nome,
           COALESCE(SUM(fr.quantita * fr.prezzo * (1-COALESCE(fr.sconto,0)/100) * (1+fr.iva/100)),0) as fatturato
    FROM fatture f
    JOIN fatture_righe fr ON fr.fattura_id = f.id
    LEFT JOIN clienti c ON c.id = f.cliente_id
    WHERE substr(f.data_emissione,1,4) = ?
      AND f.stato != 'ANNULLATA'
      AND f.cliente_id IS NOT NULL
    GROUP BY f.cliente_id
    ORDER BY fatturato DESC LIMIT 10`).all(String(anno));
  res.json(rows);
});

// ── GET /cashflow – proiezione 6 mesi ─────────────────────────────────────────
router.get('/cashflow', (req, res) => {
  const entrate = db.prepare(`
    SELECT COALESCE(SUM(f.rimanente),0) as tot,
           tp.giorni_scadenza, tp.fine_mese
    FROM (
      SELECT f.id,
             f.tipo_pagamento_id,
             f.data_emissione,
             COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0)
               - COALESCE((SELECT SUM(importo) FROM pagamenti WHERE fattura_id=f.id),0) as rimanente
      FROM fatture f
      JOIN fatture_righe fr ON fr.fattura_id=f.id
      WHERE f.stato='EMESSA'
      GROUP BY f.id HAVING rimanente > 0
    ) f
    LEFT JOIN tipi_pagamento tp ON tp.id = f.tipo_pagamento_id
    GROUP BY tp.id`).all();

  const uscite = db.prepare(`
    SELECT COALESCE(SUM(a.rimanente),0) as tot,
           0 as giorni_scadenza, 0 as fine_mese
    FROM (
      SELECT a.id,
             COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0)
               - COALESCE((SELECT SUM(importo) FROM pagamenti WHERE acquisto_id=a.id),0) as rimanente
      FROM acquisti a JOIN acquisti_righe ar ON ar.acquisto_id=a.id
      GROUP BY a.id HAVING rimanente > 0
    ) a`).all();

  res.json({
    daIncassare: entrate.reduce((s, r) => s + r.tot, 0),
    daPagare: uscite.reduce((s, r) => s + r.tot, 0),
  });
});

// ── GET /kpi-anno – KPI dell'anno corrente ────────────────────────────────────
router.get('/kpi-anno', (req, res) => {
  const anno = req.query.anno || new Date().getFullYear();
  const fat = db.prepare(`
    SELECT COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) as tot
    FROM fatture f JOIN fatture_righe fr ON fr.fattura_id=f.id
    WHERE substr(f.data_emissione,1,4)=? AND f.stato!='ANNULLATA'`).get(String(anno));
  const acq = db.prepare(`
    SELECT COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0) as tot
    FROM acquisti a JOIN acquisti_righe ar ON ar.acquisto_id=a.id
    WHERE substr(a.data_emissione,1,4)=?`).get(String(anno));
  res.json({
    fatturato: fat?.tot || 0,
    costi: acq?.tot || 0,
    margine: (fat?.tot || 0) - (acq?.tot || 0),
  });
});

module.exports = router;
