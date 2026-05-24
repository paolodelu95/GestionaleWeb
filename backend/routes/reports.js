// Report builder template-based.
// Espone una lista di report predefiniti; ognuno è un'aggregazione SQL parametrica
// che restituisce { colonne: [{key,label,format}], righe: [...], totali: {...} }.

const express = require('express');
const router = express.Router();
const db = require('../database');

const REPORTS = {
  // ── Vendite ───────────────────────────────────────────────────────────────
  'vendite-per-cliente': {
    nome: 'Vendite per cliente',
    descrizione: 'Fatturato totale, numero fatture e ultimo invio per ogni cliente, nel periodo selezionato.',
    categoria: 'Vendite',
    parametri: ['dataDa', 'dataA'],
    exec: ({ dataDa, dataA }) => {
      const rows = db.prepare(`
        SELECT c.ragione_sociale AS cliente,
               c.p_iva AS p_iva,
               COUNT(DISTINCT f.id) AS num_fatture,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) AS imponibile,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(fr.iva/100)),0) AS iva,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) AS totale,
               MAX(f.data_emissione) AS ultima_fattura
        FROM fatture f
        JOIN clienti c ON c.id=f.cliente_id
        LEFT JOIN fatture_righe fr ON fr.fattura_id=f.id
        WHERE f.data_emissione BETWEEN ? AND ? AND f.stato!='ANNULLATA'
        GROUP BY f.cliente_id
        ORDER BY totale DESC`).all(dataDa, dataA);
      return {
        colonne: [
          { key: 'cliente', label: 'Cliente', format: 'text' },
          { key: 'p_iva', label: 'P.IVA', format: 'text' },
          { key: 'num_fatture', label: 'N° fatture', format: 'int' },
          { key: 'imponibile', label: 'Imponibile', format: 'eur' },
          { key: 'iva', label: 'IVA', format: 'eur' },
          { key: 'totale', label: 'Totale', format: 'eur' },
          { key: 'ultima_fattura', label: 'Ultima fattura', format: 'date' },
        ],
        righe: rows,
        totali: aggregate(rows, ['num_fatture', 'imponibile', 'iva', 'totale']),
      };
    },
  },

  'vendite-per-prodotto': {
    nome: 'Vendite per prodotto',
    descrizione: 'Quantità venduta, imponibile e totale per prodotto, nel periodo selezionato.',
    categoria: 'Vendite',
    parametri: ['dataDa', 'dataA'],
    exec: ({ dataDa, dataA }) => {
      const rows = db.prepare(`
        SELECT COALESCE(p.nome, fr.descrizione) AS prodotto,
               COALESCE(p.codice, '') AS codice,
               COALESCE(p.categoria, '') AS categoria,
               COALESCE(SUM(fr.quantita), 0) AS quantita,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) AS imponibile,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) AS totale
        FROM fatture f
        JOIN fatture_righe fr ON fr.fattura_id=f.id
        LEFT JOIN prodotti p ON p.id=fr.prodotto_id
        WHERE f.data_emissione BETWEEN ? AND ? AND f.stato!='ANNULLATA' AND fr.tipo!='NOTA'
        GROUP BY COALESCE(p.id, fr.descrizione)
        ORDER BY totale DESC`).all(dataDa, dataA);
      return {
        colonne: [
          { key: 'prodotto', label: 'Prodotto', format: 'text' },
          { key: 'codice', label: 'Codice', format: 'text' },
          { key: 'categoria', label: 'Categoria', format: 'text' },
          { key: 'quantita', label: 'Q.tà venduta', format: 'num' },
          { key: 'imponibile', label: 'Imponibile', format: 'eur' },
          { key: 'totale', label: 'Totale (IVA inc.)', format: 'eur' },
        ],
        righe: rows,
        totali: aggregate(rows, ['quantita', 'imponibile', 'totale']),
      };
    },
  },

  'vendite-mensili': {
    nome: 'Andamento vendite mensile',
    descrizione: 'Fatturato per mese, ordinato cronologicamente.',
    categoria: 'Vendite',
    parametri: ['dataDa', 'dataA'],
    exec: ({ dataDa, dataA }) => {
      const rows = db.prepare(`
        SELECT substr(f.data_emissione,1,7) AS mese,
               COUNT(DISTINCT f.id) AS num_fatture,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) AS imponibile,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) AS totale
        FROM fatture f
        JOIN fatture_righe fr ON fr.fattura_id=f.id
        WHERE f.data_emissione BETWEEN ? AND ? AND f.stato!='ANNULLATA'
        GROUP BY mese ORDER BY mese`).all(dataDa, dataA);
      return {
        colonne: [
          { key: 'mese', label: 'Mese', format: 'text' },
          { key: 'num_fatture', label: 'N° fatture', format: 'int' },
          { key: 'imponibile', label: 'Imponibile', format: 'eur' },
          { key: 'totale', label: 'Totale', format: 'eur' },
        ],
        righe: rows,
        totali: aggregate(rows, ['num_fatture', 'imponibile', 'totale']),
      };
    },
  },

  // ── Acquisti ──────────────────────────────────────────────────────────────
  'acquisti-per-fornitore': {
    nome: 'Acquisti per fornitore',
    descrizione: 'Totale acquistato, numero documenti e ultimo acquisto per ogni fornitore.',
    categoria: 'Acquisti',
    parametri: ['dataDa', 'dataA'],
    exec: ({ dataDa, dataA }) => {
      const rows = db.prepare(`
        SELECT f.ragione_sociale AS fornitore,
               f.p_iva AS p_iva,
               COUNT(DISTINCT a.id) AS num_acquisti,
               COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)),0) AS imponibile,
               COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(ar.iva/100)),0) AS iva,
               COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0) AS totale,
               MAX(a.data_emissione) AS ultimo_acquisto
        FROM acquisti a
        JOIN fornitori f ON f.id=a.fornitore_id
        LEFT JOIN acquisti_righe ar ON ar.acquisto_id=a.id
        WHERE a.data_emissione BETWEEN ? AND ?
        GROUP BY a.fornitore_id
        ORDER BY totale DESC`).all(dataDa, dataA);
      return {
        colonne: [
          { key: 'fornitore', label: 'Fornitore', format: 'text' },
          { key: 'p_iva', label: 'P.IVA', format: 'text' },
          { key: 'num_acquisti', label: 'N° acquisti', format: 'int' },
          { key: 'imponibile', label: 'Imponibile', format: 'eur' },
          { key: 'iva', label: 'IVA', format: 'eur' },
          { key: 'totale', label: 'Totale', format: 'eur' },
          { key: 'ultimo_acquisto', label: 'Ultimo acquisto', format: 'date' },
        ],
        righe: rows,
        totali: aggregate(rows, ['num_acquisti', 'imponibile', 'iva', 'totale']),
      };
    },
  },

  'acquisti-per-conto': {
    nome: 'Acquisti per conto contabile',
    descrizione: 'Spese aggregate per conto (es. Carburanti, Cancelleria, Utenze).',
    categoria: 'Acquisti',
    parametri: ['dataDa', 'dataA'],
    exec: ({ dataDa, dataA }) => {
      const rows = db.prepare(`
        SELECT COALESCE(ca.nome, '(non assegnato)') AS conto,
               COUNT(DISTINCT a.id) AS num_acquisti,
               COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)),0) AS imponibile,
               COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0) AS totale
        FROM acquisti a
        LEFT JOIN conti_acquisto ca ON ca.id=a.conto_acquisto_id
        LEFT JOIN acquisti_righe ar ON ar.acquisto_id=a.id
        WHERE a.data_emissione BETWEEN ? AND ?
        GROUP BY a.conto_acquisto_id ORDER BY totale DESC`).all(dataDa, dataA);
      return {
        colonne: [
          { key: 'conto', label: 'Conto', format: 'text' },
          { key: 'num_acquisti', label: 'N° documenti', format: 'int' },
          { key: 'imponibile', label: 'Imponibile', format: 'eur' },
          { key: 'totale', label: 'Totale (IVA inc.)', format: 'eur' },
        ],
        righe: rows,
        totali: aggregate(rows, ['num_acquisti', 'imponibile', 'totale']),
      };
    },
  },

  // ── Magazzino ─────────────────────────────────────────────────────────────
  'giacenze': {
    nome: 'Giacenze magazzino',
    descrizione: 'Quantità e valore di magazzino per prodotto. Valore = quantità × prezzo (o prezzo acquisto se presente).',
    categoria: 'Magazzino',
    parametri: [],
    exec: () => {
      const rows = db.prepare(`
        SELECT nome AS prodotto,
               codice, categoria,
               quantita,
               soglia_minima,
               COALESCE(prezzo_acquisto, prezzo) AS valore_unitario,
               quantita * COALESCE(prezzo_acquisto, prezzo) AS valore_totale,
               CASE WHEN quantita < soglia_minima THEN 'sotto soglia' ELSE 'ok' END AS stato
        FROM prodotti
        ORDER BY valore_totale DESC`).all();
      return {
        colonne: [
          { key: 'prodotto', label: 'Prodotto', format: 'text' },
          { key: 'codice', label: 'Codice', format: 'text' },
          { key: 'categoria', label: 'Categoria', format: 'text' },
          { key: 'quantita', label: 'Q.tà', format: 'num' },
          { key: 'soglia_minima', label: 'Soglia min', format: 'int' },
          { key: 'valore_unitario', label: '€ unit.', format: 'eur' },
          { key: 'valore_totale', label: 'Valore', format: 'eur' },
          { key: 'stato', label: 'Stato', format: 'text' },
        ],
        righe: rows,
        totali: aggregate(rows, ['quantita', 'valore_totale']),
      };
    },
  },

  // ── Contabilità ───────────────────────────────────────────────────────────
  'iva-per-aliquota': {
    nome: 'IVA per aliquota',
    descrizione: 'Riepilogo imponibile e IVA per aliquota, suddiviso tra vendite e acquisti.',
    categoria: 'Contabilità',
    parametri: ['dataDa', 'dataA'],
    exec: ({ dataDa, dataA }) => {
      const v = db.prepare(`
        SELECT 'VENDITA' AS tipo, fr.iva AS aliquota,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)),0) AS imponibile,
               COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(fr.iva/100)),0) AS iva
        FROM fatture f JOIN fatture_righe fr ON fr.fattura_id=f.id
        WHERE f.data_emissione BETWEEN ? AND ? AND f.stato!='ANNULLATA'
        GROUP BY fr.iva`).all(dataDa, dataA);
      const a = db.prepare(`
        SELECT 'ACQUISTO' AS tipo, ar.iva AS aliquota,
               COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)),0) AS imponibile,
               COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(ar.iva/100)),0) AS iva
        FROM acquisti a JOIN acquisti_righe ar ON ar.acquisto_id=a.id
        WHERE a.data_emissione BETWEEN ? AND ?
        GROUP BY ar.iva`).all(dataDa, dataA);
      const rows = [...v, ...a].sort((x, y) => x.tipo.localeCompare(y.tipo) || x.aliquota - y.aliquota);
      return {
        colonne: [
          { key: 'tipo', label: 'Tipo', format: 'text' },
          { key: 'aliquota', label: 'Aliquota', format: 'pct' },
          { key: 'imponibile', label: 'Imponibile', format: 'eur' },
          { key: 'iva', label: 'IVA', format: 'eur' },
        ],
        righe: rows,
        totali: aggregate(rows, ['imponibile', 'iva']),
      };
    },
  },

  'scadute': {
    nome: 'Scadenze scadute',
    descrizione: 'Fatture e acquisti con scadenza già passata, residuo da incassare/pagare.',
    categoria: 'Contabilità',
    parametri: [],
    exec: () => {
      const oggi = new Date().toISOString().slice(0, 10);
      const rows = db.prepare(`
        SELECT 'FATTURA' AS tipo, f.numero, c.ragione_sociale AS controparte,
               f.data_emissione,
               date(f.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') AS scadenza,
               (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM fatture_righe WHERE fattura_id=f.id)
                 - COALESCE((SELECT SUM(importo) FROM pagamenti WHERE fattura_id=f.id), 0) AS residuo
        FROM fatture f
        LEFT JOIN clienti c ON c.id=f.cliente_id
        LEFT JOIN tipi_pagamento tp ON tp.id=f.tipo_pagamento_id
        WHERE f.stato='EMESSA'
        UNION ALL
        SELECT 'ACQUISTO' AS tipo, a.numero, fo.ragione_sociale AS controparte,
               a.data_emissione,
               date(a.data_emissione, '+' || COALESCE(tp.giorni_scadenza, 30) || ' days') AS scadenza,
               (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM acquisti_righe WHERE acquisto_id=a.id)
                 - COALESCE((SELECT SUM(importo) FROM pagamenti WHERE acquisto_id=a.id), 0) AS residuo
        FROM acquisti a
        LEFT JOIN fornitori fo ON fo.id=a.fornitore_id
        LEFT JOIN tipi_pagamento tp ON tp.id=a.tipo_pagamento_id
        WHERE a.stato NOT IN ('PAGATA','ANNULLATA')
      `).all().filter(r => r.scadenza < oggi && r.residuo > 0.01);
      return {
        colonne: [
          { key: 'tipo', label: 'Tipo', format: 'text' },
          { key: 'numero', label: 'Numero', format: 'text' },
          { key: 'controparte', label: 'Controparte', format: 'text' },
          { key: 'data_emissione', label: 'Data emissione', format: 'date' },
          { key: 'scadenza', label: 'Scadenza', format: 'date' },
          { key: 'residuo', label: 'Residuo', format: 'eur' },
        ],
        righe: rows.sort((a, b) => a.scadenza.localeCompare(b.scadenza)),
        totali: aggregate(rows, ['residuo']),
      };
    },
  },
};

function aggregate(rows, fields) {
  const out = {};
  for (const f of fields) out[f] = rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  return out;
}

// GET /api/reports — lista template disponibili
router.get('/', (req, res) => {
  res.json(Object.entries(REPORTS).map(([key, r]) => ({
    key, nome: r.nome, descrizione: r.descrizione, categoria: r.categoria, parametri: r.parametri,
  })));
});

// POST /api/reports/run — esegue un report con i parametri forniti
router.post('/run', (req, res) => {
  const { key, parametri } = req.body || {};
  const r = REPORTS[key];
  if (!r) return res.status(404).json({ error: 'Report non trovato' });
  const p = parametri || {};
  // Default sensati se mancanti
  if (r.parametri.includes('dataDa') && !p.dataDa) p.dataDa = `${new Date().getFullYear()}-01-01`;
  if (r.parametri.includes('dataA') && !p.dataA) p.dataA = new Date().toISOString().slice(0, 10);
  try {
    const result = r.exec(p);
    res.json({ key, nome: r.nome, parametri: p, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
