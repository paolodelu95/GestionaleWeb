const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const { tipo } = req.query;
  let where = '';
  if (tipo === 'ENTRATA') where = "WHERE p.tipo = 'ENTRATA'";
  else if (tipo === 'USCITA') where = "WHERE p.tipo = 'USCITA'";
  const rows = db.prepare(`
    SELECT p.*, f.numero as fattura_numero, c.ragione_sociale as cliente_nome,
           a.numero as acquisto_numero, forn.ragione_sociale as fornitore_nome,
           tp.nome as tipo_pagamento_nome,
           vb.numero as vendita_banco_numero, vb.cliente_nome as vb_cliente_nome
    FROM pagamenti p
    LEFT JOIN fatture f ON p.fattura_id = f.id
    LEFT JOIN clienti c ON f.cliente_id = c.id
    LEFT JOIN acquisti a ON p.acquisto_id = a.id
    LEFT JOIN fornitori forn ON a.fornitore_id = forn.id
    LEFT JOIN tipi_pagamento tp ON p.tipo_pagamento_id = tp.id
    LEFT JOIN vendite_banco vb ON p.vendita_banco_id = vb.id
    ${where}
    ORDER BY p.data_pagamento DESC`).all();
  res.json(rows.map(toDto));
});

router.get('/scadenzario', (req, res) => {
  // Fatture emesse non completamente pagate
  const fatture = db.prepare(`
    SELECT f.id, f.numero, f.data_emissione, f.cliente_id, c.ragione_sociale as controparte,
      tp.giorni_scadenza, tp.fine_mese, tp.conto, tp.immediato, tp.nome as tipo_pagamento_nome,
      COALESCE(SUM(fr.quantita * fr.prezzo * (1 - COALESCE(fr.sconto,0)/100.0) * (1 + COALESCE(fr.iva,0)/100.0)), 0) as importo_totale,
      COALESCE((SELECT SUM(p.importo) FROM pagamenti p WHERE p.fattura_id = f.id), 0) as importo_pagato,
      'FATTURA' as tipo_entry
    FROM fatture f
    LEFT JOIN clienti c ON f.cliente_id = c.id
    LEFT JOIN fatture_righe fr ON fr.fattura_id = f.id
    LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
    WHERE f.stato = 'EMESSA'
    GROUP BY f.id
    HAVING importo_totale > importo_pagato`).all();

  // Acquisti ricevuti non completamente pagati
  const acquisti = db.prepare(`
    SELECT a.id, a.numero, a.data_emissione, a.fornitore_id as cliente_id,
      f.ragione_sociale as controparte,
      tp.giorni_scadenza, tp.fine_mese, tp.conto, tp.immediato, tp.nome as tipo_pagamento_nome,
      COALESCE(SUM(ar.quantita * ar.prezzo * (1 - COALESCE(ar.sconto,0)/100.0) * (1 + COALESCE(ar.iva,0)/100.0)), 0) as importo_totale,
      COALESCE((SELECT SUM(p.importo) FROM pagamenti p WHERE p.acquisto_id = a.id), 0) as importo_pagato,
      'ACQUISTO' as tipo_entry
    FROM acquisti a
    LEFT JOIN fornitori f ON a.fornitore_id = f.id
    LEFT JOIN acquisti_righe ar ON ar.acquisto_id = a.id
    LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
    WHERE a.stato = 'RICEVUTA'
    GROUP BY a.id
    HAVING importo_totale > importo_pagato`).all();

  const all = [...fatture, ...acquisti].map(r => {
    const dataScadenza = calcolaDataScadenza(r.data_emissione, r.giorni_scadenza || 0, r.fine_mese === 1);
    return {
      id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
      controparte: r.controparte, dataScadenza,
      tipoPagamentoNome: r.tipo_pagamento_nome,
      conto: r.conto || 'BANCA',
      importoTotale: r.importo_totale, importoPagato: r.importo_pagato,
      rimanente: r.importo_totale - r.importo_pagato,
      tipoEntry: r.tipo_entry
    };
  });
  all.sort((a, b) => (a.dataScadenza || '').localeCompare(b.dataScadenza || ''));
  res.json(all);
});

// Calcola il totale e il rimanente di una fattura/acquisto, escludendo
// opzionalmente un pagamento esistente (usato dalla PUT per non includere
// se stesso nel calcolo del residuo).
function calcolaRimanente({ fatturaId, acquistoId, excludePagamentoId }) {
  if (fatturaId) {
    const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) as tot
      FROM fatture_righe WHERE fattura_id=?`).get(fatturaId)?.tot || 0;
    const pagato = db.prepare(`SELECT COALESCE(SUM(importo), 0) as tot FROM pagamenti
      WHERE fattura_id=? AND (? IS NULL OR id != ?)`)
      .get(fatturaId, excludePagamentoId || null, excludePagamentoId || null)?.tot || 0;
    return { totale, rimanente: totale - pagato };
  }
  if (acquistoId) {
    const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) as tot
      FROM acquisti_righe WHERE acquisto_id=?`).get(acquistoId)?.tot || 0;
    const pagato = db.prepare(`SELECT COALESCE(SUM(importo), 0) as tot FROM pagamenti
      WHERE acquisto_id=? AND (? IS NULL OR id != ?)`)
      .get(acquistoId, excludePagamentoId || null, excludePagamentoId || null)?.tot || 0;
    return { totale, rimanente: totale - pagato };
  }
  return null;
}

// Tolleranza di arrotondamento per evitare falsi positivi su 0.01 € residui
// dovuti a calcoli con IVA. Permettiamo anche un importo leggermente superiore
// al rimanente (utile per pagamenti con piccole commissioni/abbuoni).
const ROUNDING_TOLERANCE = 0.05;

function validatePagamento(p, { excludePagamentoId } = {}) {
  if (!p.dataPagamento) return 'dataPagamento mancante';
  const importo = Number(p.importo);
  if (!Number.isFinite(importo)) return 'importo non valido';
  if (importo <= 0) return 'importo deve essere positivo';
  // Al massimo uno tra fatturaId / acquistoId. Se il pagamento è collegato a un
  // documento, verifica il residuo. Un pagamento "libero" (spesa/entrata generica,
  // es. affitto, stipendi, bollette) è ammesso senza alcun documento collegato.
  const hasFatt = !!p.fatturaId;
  const hasAcq = !!p.acquistoId;
  if (hasFatt && hasAcq) return 'specificare al massimo uno tra fattura e acquisto';
  if (hasFatt || hasAcq) {
    const r = calcolaRimanente({ fatturaId: p.fatturaId, acquistoId: p.acquistoId, excludePagamentoId });
    if (!r) return 'fattura/acquisto non trovato';
    if (r.totale <= 0) return 'documento senza righe imponibili';
    if (importo > r.rimanente + ROUNDING_TOLERANCE) {
      return `importo ${importo.toFixed(2)} € supera il residuo (${r.rimanente.toFixed(2)} €)`;
    }
  }
  return null;
}

// Il conto (BANCA/CASSA) viene derivato dal tipo di pagamento scelto: l'utente
// imposta solo il tipo, il conto lo decide il sistema. Fallback al valore passato o BANCA.
function contoDaTipo(tipoPagamentoId, fallback) {
  if (tipoPagamentoId) {
    const tp = db.prepare('SELECT conto FROM tipi_pagamento WHERE id=?').get(tipoPagamentoId);
    if (tp?.conto) return tp.conto;
  }
  return fallback || 'BANCA';
}

router.post('/', (req, res) => {
  const p = req.body;
  const err = validatePagamento(p);
  if (err) return res.status(400).json({ error: err });
  const result = db.prepare(`INSERT INTO pagamenti (fattura_id, acquisto_id, data_pagamento, importo, metodo, note, tipo, tipo_pagamento_id, conto, causale)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(p.fatturaId || null, p.acquistoId || null, p.dataPagamento, Number(p.importo),
         p.metodo || 'Bonifico', p.note || '', p.tipo || 'ENTRATA',
         p.tipoPagamentoId || null, contoDaTipo(p.tipoPagamentoId, p.conto), p.causale || '');
  if (p.fatturaId) aggiornaStatoFattura(p.fatturaId);
  if (p.acquistoId) aggiornaStatoAcquisto(p.acquistoId);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const p = req.body;
  const err = validatePagamento(p, { excludePagamentoId: Number(req.params.id) });
  if (err) return res.status(400).json({ error: err });
  db.prepare(`UPDATE pagamenti SET fattura_id=?,acquisto_id=?,data_pagamento=?,importo=?,metodo=?,note=?,tipo=?,tipo_pagamento_id=?,conto=?,causale=? WHERE id=?`)
    .run(p.fatturaId || null, p.acquistoId || null, p.dataPagamento, Number(p.importo),
         p.metodo || 'Bonifico', p.note || '', p.tipo || 'ENTRATA',
         p.tipoPagamentoId || null, contoDaTipo(p.tipoPagamentoId, p.conto), p.causale || '', req.params.id);
  if (p.fatturaId) aggiornaStatoFattura(p.fatturaId);
  if (p.acquistoId) aggiornaStatoAcquisto(p.acquistoId);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const pag = db.prepare('SELECT fattura_id, acquisto_id FROM pagamenti WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM pagamenti WHERE id=?').run(req.params.id);
  if (pag?.fattura_id) aggiornaStatoFattura(pag.fattura_id);
  if (pag?.acquisto_id) aggiornaStatoAcquisto(pag.acquisto_id);
  res.json({ success: true });
});

function aggiornaStatoFattura(fatturaId) {
  // Una fattura collegata a una nota di credito resta STORNATA, a prescindere dai pagamenti.
  if (db.prepare('SELECT COUNT(*) AS n FROM note_credito WHERE fattura_id=?').get(fatturaId).n > 0) {
    db.prepare("UPDATE fatture SET stato='STORNATA' WHERE id=?").run(fatturaId);
    return;
  }
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) as tot
    FROM fatture_righe WHERE fattura_id=?`).get(fatturaId)?.tot || 0;
  const pagato = db.prepare(`SELECT COALESCE(SUM(importo), 0) as tot FROM pagamenti WHERE fattura_id=?`).get(fatturaId)?.tot || 0;
  const stato = pagato >= totale && totale > 0 ? 'PAGATA' : 'EMESSA';
  db.prepare('UPDATE fatture SET stato=? WHERE id=?').run(stato, fatturaId);
}

function aggiornaStatoAcquisto(acquistoId) {
  const totale = db.prepare(`SELECT COALESCE(SUM(quantita * prezzo * (1 - COALESCE(sconto,0)/100.0) * (1 + COALESCE(iva,0)/100.0)), 0) as tot
    FROM acquisti_righe WHERE acquisto_id=?`).get(acquistoId)?.tot || 0;
  const pagato = db.prepare(`SELECT COALESCE(SUM(importo), 0) as tot FROM pagamenti WHERE acquisto_id=?`).get(acquistoId)?.tot || 0;
  const stato = pagato >= totale && totale > 0 ? 'PAGATA' : 'RICEVUTA';
  db.prepare('UPDATE acquisti SET stato=? WHERE id=?').run(stato, acquistoId);
}

function calcolaDataScadenza(dataEmissione, giorni, fineMese) {
  if (!dataEmissione) return null;
  const d = new Date(dataEmissione);
  d.setDate(d.getDate() + giorni);
  if (fineMese) {
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
  }
  return d.toISOString().substring(0, 10);
}

function toDto(r) {
  return {
    id: r.id, fatturaId: r.fattura_id, fatturaNumero: r.fattura_numero,
    acquistoId: r.acquisto_id, acquistoNumero: r.acquisto_numero,
    venditaBancoId: r.vendita_banco_id, venditaBancoNumero: r.vendita_banco_numero,
    clienteNome: r.cliente_nome || r.vb_cliente_nome || null,
    fornitoreNome: r.fornitore_nome,
    dataPagamento: r.data_pagamento, importo: r.importo, metodo: r.metodo,
    note: r.note, tipo: r.tipo || 'ENTRATA', conto: r.conto || 'BANCA',
    causale: r.causale || '',
    tipoPagamentoId: r.tipo_pagamento_id, tipoPagamentoNome: r.tipo_pagamento_nome
  };
}

module.exports = router;
