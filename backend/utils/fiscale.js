// Calcoli fiscali dei documenti (fattura / nota di credito): ritenuta d'acconto,
// cassa previdenziale, bollo. Centralizzati qui così DTO, generazione XML SDI,
// validatore e "netto a pagare" usano le stesse identiche regole.

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * Totali fiscali di un documento a partire dalle righe e dai parametri fiscali.
 *
 * Regole (caso mainstream italiano):
 *  - imponibile = Σ righe (quantità · prezzo · (1 − sconto%))
 *  - cassa previdenziale: importo = imponibile · cassaAliquota%; CONCORRE alla
 *    base IVA (l'IVA si applica anche sulla cassa, all'aliquota cassaIva)
 *  - IVA = IVA sulle righe + IVA sulla cassa
 *  - ritenuta d'acconto: su imponibile (+ cassa se ritenutaSuCassa); NON entra
 *    nell'ImportoTotaleDocumento, ma riduce il netto a pagare
 *  - bollo: 2,00 € se attivo (di norma su operazioni esenti/non imponibili)
 *  - totale documento = imponibile + cassa + IVA + bollo
 *  - netto a pagare = totale − ritenuta
 *
 * @param {Array} righe  [{ quantita, prezzo, sconto, iva }]
 * @param {Object} fisc  { ritenutaAliquota, ritenutaSuCassa, cassaAliquota, cassaIva, bollo }
 */
function calcolaTotaliFiscali(righe, fisc = {}) {
  let imponibile = 0, ivaRighe = 0;
  for (const r of righe || []) {
    const base = (Number(r.quantita) || 0) * (Number(r.prezzo) || 0) * (1 - (Number(r.sconto) || 0) / 100);
    imponibile += base;
    ivaRighe += base * (Number(r.iva) || 0) / 100;
  }
  imponibile = round2(imponibile);
  ivaRighe = round2(ivaRighe);

  const cassaAliquota = Number(fisc.cassaAliquota) || 0;
  const cassaImporto = cassaAliquota ? round2(imponibile * cassaAliquota / 100) : 0;
  const cassaIva = Number(fisc.cassaIva) || 0;
  const ivaCassa = cassaImporto ? round2(cassaImporto * cassaIva / 100) : 0;
  const iva = round2(ivaRighe + ivaCassa);

  const ritenutaAliquota = Number(fisc.ritenutaAliquota) || 0;
  const ritenutaBase = imponibile + (fisc.ritenutaSuCassa ? cassaImporto : 0);
  const ritenutaImporto = ritenutaAliquota ? round2(ritenutaBase * ritenutaAliquota / 100) : 0;

  const bolloImporto = fisc.bollo ? 2 : 0;

  const totale = round2(imponibile + cassaImporto + iva + bolloImporto);
  const nettoAPagare = round2(totale - ritenutaImporto);

  return {
    imponibile, ivaRighe, cassaImporto, ivaCassa, iva,
    ritenutaImporto, ritenutaBase: round2(ritenutaBase), bolloImporto,
    totale, nettoAPagare,
  };
}

/** Estrae i parametri fiscali da una riga DB (snake_case) in forma normalizzata. */
function fiscFromRow(row = {}) {
  return {
    ritenutaAliquota: row.ritenuta_aliquota || 0,
    ritenutaCausale: row.ritenuta_causale || '',
    ritenutaTipo: row.ritenuta_tipo || '',
    ritenutaSuCassa: row.ritenuta_su_cassa === 1,
    cassaTipo: row.cassa_tipo || '',
    cassaAliquota: row.cassa_aliquota || 0,
    cassaIva: row.cassa_iva || 0,
    bollo: row.bollo === 1,
  };
}

module.exports = { round2, calcolaTotaliFiscali, fiscFromRow };
