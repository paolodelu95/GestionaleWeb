// Import estratto conto bancario (OFX o CSV) + riconciliazione assistita.
//
// Flusso:
//   1) POST /parse-ofx  body: { contenuto: <stringa OFX> }
//   2) POST /parse-csv  body: { contenuto: <stringa CSV>, separatore?: ';' }
//      → ritorna [{ data, importo, descrizione, riferimento }]
//   3) POST /match      body: { data, importo, descrizione } → top 3 candidati (fatture/acquisti aperti)
//   4) POST /conferma   body: { transazioni: [{ tipoEntry: 'FATTURA'|'ACQUISTO', id, data, importo, metodo }] }
//      → registra i pagamenti

const express = require('express');
const router = express.Router();
const db = require('../database');

// ── Parser OFX (regex-based, sufficiente per i file standard SGML/XML) ──────
function parseOfx(text) {
  const txs = [];
  // Estrae blocchi <STMTTRN>...</STMTTRN>
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const b of blocks) {
    const get = (tag) => {
      const re = new RegExp(`<${tag}>([^<\n\r]+)`, 'i');
      const m = b.match(re);
      return m ? m[1].trim() : '';
    };
    const dt = get('DTPOSTED');                 // YYYYMMDD o YYYYMMDDHHMMSS
    const data = dt && dt.length >= 8
      ? `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}`
      : '';
    const importo = parseFloat(get('TRNAMT').replace(',', '.')) || 0;
    const fitid = get('FITID');
    const memo = get('MEMO') || get('NAME') || '';
    if (data && importo !== 0) {
      txs.push({ data, importo: +importo.toFixed(2), descrizione: memo, riferimento: fitid });
    }
  }
  return txs;
}

// ── Parser CSV bancario generico ────────────────────────────────────────────
// Cerca colonne "data", "importo" (anche separati dare/avere), "descrizione".
function parseBancaCsv(text, separatore = ';') {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const splitLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === separatore && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  };

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().trim());
  const idxData    = headers.findIndex(h => /^data($| op| val|cont)/.test(h));
  const idxImporto = headers.findIndex(h => /^(importo|amount)$/.test(h));
  const idxDare    = headers.findIndex(h => /(addebito|dare|uscita|debit)/.test(h));
  const idxAvere   = headers.findIndex(h => /(accredito|avere|entrata|credit)/.test(h));
  const idxDescr   = headers.findIndex(h => /(descriz|causale|operazi|memo)/.test(h));
  const idxRif     = headers.findIndex(h => /(riferi|crid|cro|trn)/.test(h));

  const parseDate = (s) => {
    s = s.trim();
    let m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/^(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return '';
  };
  const parseNum = (s) => {
    if (!s) return 0;
    return parseFloat(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
  };

  const txs = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const data = idxData >= 0 ? parseDate(cols[idxData] || '') : '';
    let importo = 0;
    if (idxImporto >= 0) importo = parseNum(cols[idxImporto]);
    else {
      const dare = idxDare >= 0 ? parseNum(cols[idxDare]) : 0;
      const avere = idxAvere >= 0 ? parseNum(cols[idxAvere]) : 0;
      importo = avere - dare;
    }
    const descrizione = idxDescr >= 0 ? (cols[idxDescr] || '').trim() : '';
    const riferimento = idxRif >= 0 ? (cols[idxRif] || '').trim() : '';
    if (data && importo !== 0) {
      txs.push({ data, importo: +importo.toFixed(2), descrizione, riferimento });
    }
  }
  return txs;
}

router.post('/parse-ofx', express.text({ type: '*/*', limit: '8mb' }), (req, res) => {
  try {
    const txs = parseOfx(String(req.body || ''));
    res.json({ count: txs.length, transazioni: txs });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/parse-csv', express.text({ type: '*/*', limit: '8mb' }), (req, res) => {
  try {
    const sep = req.query.sep || ';';
    const txs = parseBancaCsv(String(req.body || ''), sep);
    res.json({ count: txs.length, transazioni: txs });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Match: suggerisce top 3 scadenze open per una transazione ───────────────
router.post('/match', (req, res) => {
  const { data, importo, descrizione } = req.body || {};
  if (!data || importo == null) return res.status(400).json({ error: 'data e importo richiesti' });
  const isEntrata = +importo > 0;
  const abs = Math.abs(+importo);
  const desc = String(descrizione || '').toLowerCase();

  // Window ± 60 giorni rispetto alla data transazione (più tolleranza per bonifici)
  const offset = 60;
  const tx = new Date(data);
  const da = new Date(tx); da.setDate(da.getDate() - offset);
  const a  = new Date(tx); a.setDate(a.getDate() + offset);
  const daIso = da.toISOString().slice(0, 10);
  const aIso  = a.toISOString().slice(0, 10);

  let cand = [];
  if (isEntrata) {
    // Fatture attive con residuo
    const rows = db.prepare(`
      SELECT f.id, f.numero, f.data_emissione, c.ragione_sociale as controparte,
             COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) AS totale,
             COALESCE((SELECT SUM(importo) FROM pagamenti p WHERE p.fattura_id=f.id),0) AS pagato
      FROM fatture f
      JOIN fatture_righe fr ON fr.fattura_id=f.id
      LEFT JOIN clienti c ON c.id=f.cliente_id
      WHERE f.stato NOT IN ('PAGATA','ANNULLATA') AND f.data_emissione BETWEEN ? AND ?
      GROUP BY f.id`).all(daIso, aIso);
    cand = rows.map(r => ({
      tipoEntry: 'FATTURA', id: r.id, numero: r.numero, data: r.data_emissione,
      controparte: r.controparte || '', residuo: +(r.totale - r.pagato).toFixed(2),
    }));
  } else {
    const rows = db.prepare(`
      SELECT a.id, a.numero, a.data_emissione, f.ragione_sociale as controparte,
             COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0) AS totale,
             COALESCE((SELECT SUM(importo) FROM pagamenti p WHERE p.acquisto_id=a.id),0) AS pagato
      FROM acquisti a
      JOIN acquisti_righe ar ON ar.acquisto_id=a.id
      LEFT JOIN fornitori f ON f.id=a.fornitore_id
      WHERE a.stato NOT IN ('PAGATA','PAGATO','ANNULLATA','ANNULLATO') AND a.data_emissione BETWEEN ? AND ?
      GROUP BY a.id`).all(daIso, aIso);
    cand = rows.map(r => ({
      tipoEntry: 'ACQUISTO', id: r.id, numero: r.numero, data: r.data_emissione,
      controparte: r.controparte || '', residuo: +(r.totale - r.pagato).toFixed(2),
    }));
  }

  // Scoring: importo esatto +10, range importo +3, descrizione contiene numero +5,
  //   descrizione contiene parte controparte +3, vicinanza data (più vicino = +)
  const scored = cand.map(c => {
    let score = 0;
    const diff = Math.abs(c.residuo - abs);
    if (diff < 0.01) score += 10;
    else if (diff < abs * 0.05) score += 3;
    if (c.numero && desc.includes(String(c.numero).toLowerCase().replace(/[^\w]/g, ''))) score += 5;
    const cp = c.controparte.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    for (const w of cp) if (desc.includes(w)) { score += 3; break; }
    const dDiff = Math.abs((new Date(c.data) - tx) / 86400000);
    score -= Math.min(5, Math.floor(dDiff / 10));
    return { ...c, score };
  }).filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  res.json({ tipo: isEntrata ? 'ENTRATA' : 'USCITA', importo: abs, candidati: scored });
});

// ── Conferma: registra i pagamenti per le transazioni confermate ────────────
router.post('/conferma', (req, res) => {
  const items = Array.isArray(req.body?.transazioni) ? req.body.transazioni : [];
  let creati = 0;
  const errori = [];
  for (const it of items) {
    try {
      if (!it.tipoEntry || !it.id || !it.data || it.importo == null) throw new Error('campi mancanti');
      const importo = Math.abs(+it.importo);
      const tipo = it.tipoEntry === 'FATTURA' ? 'ENTRATA' : 'USCITA';
      const fkCol = it.tipoEntry === 'FATTURA' ? 'fattura_id' : 'acquisto_id';

      // Verifica esistenza documento prima di registrare
      const docTable = it.tipoEntry === 'FATTURA' ? 'fatture' : 'acquisti';
      const doc = db.prepare(`SELECT id FROM ${docTable} WHERE id=?`).get(it.id);
      if (!doc) throw new Error(`${docTable} #${it.id} non trovato`);

      const tx = db.transaction(() => {
        db.prepare(`INSERT INTO pagamenti
          (${fkCol}, data_pagamento, importo, metodo, note, tipo, conto)
          VALUES (?,?,?,?,?,?,?)`)
          .run(it.id, it.data, importo,
               it.metodo || 'Bonifico',
               it.note || 'Da riconciliazione bancaria',
               tipo, 'BANCA');
        if (it.tipoEntry === 'FATTURA') {
          const r = db.prepare(`SELECT
            (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100.0)*(1+COALESCE(iva,0)/100.0)),0) FROM fatture_righe WHERE fattura_id=?) -
            (SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE fattura_id=?) AS res`).get(it.id, it.id);
          if (r?.res <= 0.01) db.prepare('UPDATE fatture SET stato=? WHERE id=?').run('PAGATA', it.id);
        } else {
          const r = db.prepare(`SELECT
            (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100.0)*(1+COALESCE(iva,0)/100.0)),0) FROM acquisti_righe WHERE acquisto_id=?) -
            (SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE acquisto_id=?) AS res`).get(it.id, it.id);
          if (r?.res <= 0.01) db.prepare('UPDATE acquisti SET stato=? WHERE id=?').run('PAGATA', it.id);
        }
      });
      tx();
      creati++;
    } catch (err) { errori.push({ item: it, errore: err.message }); }
  }
  res.json({ creati, errori });
});

module.exports = router;
