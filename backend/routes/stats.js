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

// ── GET /cashflow-forecast – proiezione giornaliera prossimi N giorni ───────
router.get('/cashflow-forecast', (req, res) => {
  const giorni = Math.min(Math.max(parseInt(String(req.query.giorni || '60'), 10), 7), 180);
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const fine = new Date(oggi); fine.setDate(fine.getDate() + giorni);
  const oggiIso = oggi.toISOString().slice(0, 10);

  const rowsIn = db.prepare(`
    SELECT date(f.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') AS scadenza,
           COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0)
             - COALESCE((SELECT SUM(importo) FROM pagamenti p WHERE p.fattura_id=f.id),0) AS rimanente
    FROM fatture f
    JOIN fatture_righe fr ON fr.fattura_id=f.id
    LEFT JOIN tipi_pagamento tp ON tp.id=f.tipo_pagamento_id
    WHERE f.stato NOT IN ('PAGATA','ANNULLATA')
    GROUP BY f.id HAVING rimanente > 0
  `).all();

  const rowsOut = db.prepare(`
    SELECT date(a.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') AS scadenza,
           COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0)
             - COALESCE((SELECT SUM(importo) FROM pagamenti p WHERE p.acquisto_id=a.id),0) AS rimanente
    FROM acquisti a
    JOIN acquisti_righe ar ON ar.acquisto_id=a.id
    LEFT JOIN tipi_pagamento tp ON tp.id=a.tipo_pagamento_id
    WHERE a.stato NOT IN ('PAGATA','PAGATO','ANNULLATA','ANNULLATO')
    GROUP BY a.id HAVING rimanente > 0
  `).all();

  // Aggrega per giorno: scaduti -> data oggi; futuri -> data scadenza; troppo lontani -> ignorati
  const daysMap = new Map();
  const ensure = (d) => {
    if (!daysMap.has(d)) daysMap.set(d, { date: d, in: 0, out: 0 });
    return daysMap.get(d);
  };
  for (const r of rowsIn) {
    const d = (r.scadenza < oggiIso) ? oggiIso : r.scadenza;
    if (new Date(d) > fine) continue;
    ensure(d).in += +r.rimanente;
  }
  for (const r of rowsOut) {
    const d = (r.scadenza < oggiIso) ? oggiIso : r.scadenza;
    if (new Date(d) > fine) continue;
    ensure(d).out += +r.rimanente;
  }
  const items = [...daysMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  for (const it of items) { cum += it.in - it.out; it.cumulativo = +cum.toFixed(2); it.in = +it.in.toFixed(2); it.out = +it.out.toFixed(2); }
  res.json({
    giorni,
    saldoFinale: +cum.toFixed(2),
    totEntrate: +items.reduce((s, x) => s + x.in, 0).toFixed(2),
    totUscite: +items.reduce((s, x) => s + x.out, 0).toFixed(2),
    items,
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

// ── GET /bi – Business Intelligence completa ──────────────────────────────────
router.get('/bi', (req, res) => {
  try {
    const anno = String(req.query.anno || new Date().getFullYear());
    const annoPrec = String(parseInt(anno) - 1);

    // Fatturato mensile anno corrente e precedente
    const fatturaMensile = db.prepare(`
      SELECT substr(f.data_emissione,1,7) as mese,
             COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) as fatturato,
             COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) as imponibile
      FROM fatture f JOIN fatture_righe fr ON fr.fattura_id=f.id
      WHERE substr(f.data_emissione,1,4) IN (?,?)
        AND f.stato != 'ANNULLATA'
      GROUP BY mese ORDER BY mese`).all(anno, annoPrec);

    // Acquisti mensili anno corrente e precedente
    const acquistiMensili = db.prepare(`
      SELECT substr(a.data_emissione,1,7) as mese,
             COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0) as costi
      FROM acquisti a JOIN acquisti_righe ar ON ar.acquisto_id=a.id
      WHERE substr(a.data_emissione,1,4) IN (?,?)
      GROUP BY mese ORDER BY mese`).all(anno, annoPrec);

    // ABC analysis – tutti i clienti per fatturato anno corrente
    const abcClienti = db.prepare(`
      SELECT c.ragione_sociale as nome,
             COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) as fatturato,
             COUNT(DISTINCT f.id) as numFatture
      FROM fatture f
      JOIN fatture_righe fr ON fr.fattura_id=f.id
      LEFT JOIN clienti c ON c.id=f.cliente_id
      WHERE substr(f.data_emissione,1,4)=?
        AND f.stato != 'ANNULLATA'
        AND f.cliente_id IS NOT NULL
      GROUP BY f.cliente_id
      ORDER BY fatturato DESC`).all(anno);

    // Calcola cumulative % per Pareto
    const totFatturato = abcClienti.reduce((s, r) => s + r.fatturato, 0);
    let cumulativo = 0;
    const abc = abcClienti.map(r => {
      cumulativo += r.fatturato;
      const pct = totFatturato > 0 ? (r.fatturato / totFatturato) * 100 : 0;
      const pctCum = totFatturato > 0 ? (cumulativo / totFatturato) * 100 : 0;
      return { ...r, pct: +pct.toFixed(1), pctCumulativa: +pctCum.toFixed(1),
               classe: pctCum <= 80 ? 'A' : pctCum <= 95 ? 'B' : 'C' };
    });

    // Breakdown per categoria prodotto — prodotti.categoria è TEXT (no FK)
    const categorie = db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(p.categoria),''),'Senza categoria') as categoria,
             COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) as imponibile,
             COALESCE(SUM(fr.quantita),0) as quantita
      FROM fatture_righe fr
      JOIN fatture f ON f.id=fr.fattura_id
      LEFT JOIN prodotti p ON p.id=fr.prodotto_id
      WHERE substr(f.data_emissione,1,4)=? AND f.stato!='ANNULLATA'
      GROUP BY categoria
      ORDER BY imponibile DESC`).all(anno);

    // DSO – Days Sales Outstanding (giorni medi incasso)
    // NB: la colonna su pagamenti è data_pagamento, non data
    const dso = db.prepare(`
      SELECT AVG(julianday(p.data_pagamento) - julianday(f.data_emissione)) as giorni
      FROM pagamenti p
      JOIN fatture f ON f.id=p.fattura_id
      WHERE substr(p.data_pagamento,1,4)=?
        AND p.data_pagamento IS NOT NULL AND f.data_emissione IS NOT NULL`).get(anno);

    // Tasso incasso – % fatturato incassato vs emesso
    const incassoStats = db.prepare(`
      SELECT
        COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) as emesso,
        COALESCE((SELECT SUM(importo) FROM pagamenti pg
                  JOIN fatture ff ON ff.id=pg.fattura_id
                  WHERE substr(pg.data_pagamento,1,4)=? AND ff.stato!='ANNULLATA'),0) as incassato
      FROM fatture f JOIN fatture_righe fr ON fr.fattura_id=f.id
      WHERE substr(f.data_emissione,1,4)=? AND f.stato!='ANNULLATA'`).get(anno, anno);

    // Prodotti top & bottom per margine (fatturato - costo acquisto medio)
    const prodottiMargini = db.prepare(`
      SELECT p.nome,
             COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) as ricavi,
             COALESCE(SUM(fr.quantita * COALESCE(NULLIF(p.prezzo_acquisto,0), NULL)),0) as costi_stimati,
             COALESCE(SUM(fr.quantita),0) as qta_venduta
      FROM fatture_righe fr
      JOIN fatture f ON f.id=fr.fattura_id
      JOIN prodotti p ON p.id=fr.prodotto_id
      WHERE substr(f.data_emissione,1,4)=? AND f.stato!='ANNULLATA'
      GROUP BY fr.prodotto_id
      HAVING ricavi > 0
      ORDER BY (ricavi - costi_stimati) DESC LIMIT 10`).all(anno);

    // Stagionalità – media mensile pluriennale (tutti gli anni disponibili)
    const stagionalita = db.prepare(`
      SELECT f.mese_num,
             AVG(f.mensile) as media
      FROM (
        SELECT substr(f.data_emissione,1,7) as ym,
               substr(f.data_emissione,6,2) as mese_num,
               SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)) as mensile
        FROM fatture f JOIN fatture_righe fr ON fr.fattura_id=f.id
        WHERE f.stato!='ANNULLATA'
        GROUP BY ym
      ) f
      GROUP BY f.mese_num ORDER BY f.mese_num`).all();

    res.json({
      anno,
      annoPrec,
      fatturaMensile,
      acquistiMensili,
      abcClienti: abc,
      categorie,
      dsoMedio: dso?.giorni ? +dso.giorni.toFixed(1) : null,
      incassoStats: {
        emesso: incassoStats?.emesso || 0,
        incassato: incassoStats?.incassato || 0,
        tassoIncasso: incassoStats?.emesso > 0
          ? +((incassoStats.incassato / incassoStats.emesso) * 100).toFixed(1)
          : 0,
      },
      prodottiMargini: prodottiMargini.map(p => ({
        nome: p.nome,
        ricavi: +p.ricavi.toFixed(2),
        costiStimati: +p.costi_stimati.toFixed(2),
        margine: +(p.ricavi - p.costi_stimati).toFixed(2),
        marginePerc: p.ricavi > 0 ? +((1 - p.costi_stimati / p.ricavi) * 100).toFixed(1) : 0,
        qtaVenduta: p.qta_venduta,
      })),
      stagionalita,
    });
  } catch (e) {
    console.error('[stats/bi] error:', e.message);
    res.status(500).json({ error: 'bi_query_failed', message: e.message });
  }
});

module.exports = router;
