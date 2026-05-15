const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/:id', (req, res) => {
  try {
    const fattura = db.prepare('SELECT numero FROM fatture WHERE id=?').get(req.params.id);
    if (!fattura) return res.status(404).json({ error: 'Not found' });
    const xml = buildFatturaPA(req.params.id);
    const safeName = String(fattura.numero).replace(/[^A-Za-z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="FatturaPA_${safeName}.xml"`);
    res.send(xml);
  } catch (e) {
    console.error('FatturaPA error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt2(n) { return Number(n ?? 0).toFixed(2); }
function fmtDate(s) { return String(s ?? '').substring(0, 10); }

function sanitizeProgressivo(s) {
  return String(s ?? '').replace(/[^A-Za-z0-9\-_]/g, '').substring(0, 10) || '1';
}

function cleanPIva(s) {
  return String(s ?? '').replace(/^IT/i, '').replace(/\s/g, '');
}

function padCAP(s) {
  const v = String(s ?? '').replace(/\D/g, '');
  return v.padStart(5, '0').substring(0, 5) || '00000';
}

// Returns { formato, codice } — detects FPA12 (6-char SDI) vs FPR12 (7-char SDI)
function detectFormato(sdi) {
  const v = String(sdi ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v.length === 6) return { formato: 'FPA12', codice: v };
  if (v.length === 7) return { formato: 'FPR12', codice: v };
  // No valid SDI → FPR12 with special code
  return { formato: 'FPR12', codice: '0000000' };
}

function mapModalita(nome) {
  const n = String(nome ?? '').toLowerCase();
  if (n.includes('contant') || n.includes('cass')) return 'MP01';
  if (n.includes('assegno')) return 'MP02';
  if (n.includes('pos') || n.includes('carta') || n.includes('bancomat')) return 'MP08';
  return 'MP05';
}

function calcScadenza(dataEmissione, giorni, fineMese) {
  const d = new Date(dataEmissione);
  if (isNaN(d.getTime())) return fmtDate(dataEmissione);
  d.setDate(d.getDate() + (giorni || 0));
  if (fineMese) { d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(0); }
  return d.toISOString().substring(0, 10);
}

// Split a long note into multiple <Causale> elements (max 200 chars each)
function causaleBlocks(note) {
  if (!note) return '';
  const text = String(note);
  const chunks = [];
  for (let i = 0; i < text.length; i += 200) {
    chunks.push(text.substring(i, i + 200));
  }
  return chunks.map(c => `\n        <Causale>${esc(c)}</Causale>`).join('');
}

// ── builder ──────────────────────────────────────────────────────────────────

function buildFatturaPA(id) {
  const az = db.prepare('SELECT * FROM azienda WHERE id=1').get() || {};
  const row = db.prepare(`
    SELECT f.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
           c.citta as c_citta, c.provincia as c_provincia, c.stato as c_stato,
           c.p_iva as c_piva, c.codice_fiscale as c_cf,
           c.sdi as c_sdi, c.pec as c_pec,
           tp.nome as tp_nome, tp.giorni_scadenza as tp_giorni,
           tp.fine_mese as tp_fine_mese
    FROM fatture f
    LEFT JOIN clienti c ON f.cliente_id = c.id
    LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
    WHERE f.id=?
  `).get(id);
  if (!row) throw new Error('Fattura non trovata');

  const righe = db.prepare(
    'SELECT * FROM fatture_righe WHERE fattura_id=? ORDER BY id'
  ).all(id);

  // IVA breakdown
  const ivaMap = {};
  for (const r of righe) {
    const aliq = r.iva ?? 22;
    const base = (r.quantita ?? 1) * (r.prezzo ?? 0) * (1 - ((r.sconto ?? 0) / 100));
    if (!ivaMap[aliq]) ivaMap[aliq] = { imp: 0, iva: 0 };
    ivaMap[aliq].imp += base;
    ivaMap[aliq].iva += base * aliq / 100;
  }

  const totale = Object.values(ivaMap).reduce((s, v) => s + v.imp + v.iva, 0);

  const pIvaAz = cleanPIva(az.p_iva || '00000000000');
  const { formato, codice: codDest } = detectFormato(row.c_sdi);
  const hasPEC = codDest === '0000000' && row.c_pec;
  const progressivo = sanitizeProgressivo(row.numero);
  const scadenza = calcScadenza(row.data_emissione, row.tp_giorni || 0, row.tp_fine_mese || 0);

  // ── CedentePrestatore optional blocks
  const cfAzBlock = az.cod_fiscale && az.cod_fiscale !== az.p_iva
    ? `\n        <CodiceFiscale>${esc(az.cod_fiscale)}</CodiceFiscale>`
    : '';
  const provAzBlock = az.provincia
    ? `\n        <Provincia>${esc(String(az.provincia).substring(0, 2).toUpperCase())}</Provincia>`
    : '';
  const contattiAzBlock = (az.pec || az.email)
    ? `\n      <Contatti><Email>${esc(az.pec || az.email)}</Email></Contatti>`
    : '';

  // ── CessionarioCommittente optional blocks
  const pIvaClientBlock = row.c_piva
    ? `\n        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${esc(cleanPIva(row.c_piva))}</IdCodice></IdFiscaleIVA>`
    : '';
  const cfClientBlock = row.c_cf
    ? `\n        <CodiceFiscale>${esc(row.c_cf)}</CodiceFiscale>`
    : '';
  const provClientBlock = row.c_provincia
    ? `\n        <Provincia>${esc(String(row.c_provincia).substring(0, 2).toUpperCase())}</Provincia>`
    : '';

  // ── DettaglioLinee
  const dettaglioLinee = righe.map((r, i) => {
    const q   = r.quantita ?? 1;
    const pu  = r.prezzo ?? 0;
    const sc  = r.sconto ?? 0;
    const aliq = r.iva ?? 22;
    const imp = q * pu * (1 - sc / 100);
    const umBlock = r.unita_misura
      ? `\n        <UnitaMisura>${esc(r.unita_misura)}</UnitaMisura>`
      : '';
    const scontoBlock = sc > 0
      ? `\n        <ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${fmt2(sc)}</Percentuale></ScontoMaggiorazione>`
      : '';
    const naturaBlock = aliq === 0 ? '\n        <Natura>N4</Natura>' : '';
    return `      <DettaglioLinee>
        <NumeroLinea>${i + 1}</NumeroLinea>
        <Descrizione>${esc(r.descrizione || 'Prodotto/Servizio')}</Descrizione>
        <Quantita>${fmt2(q)}</Quantita>${umBlock}
        <PrezzoUnitario>${fmt2(pu)}</PrezzoUnitario>${scontoBlock}
        <PrezzoTotale>${fmt2(imp)}</PrezzoTotale>
        <AliquotaIVA>${fmt2(aliq)}</AliquotaIVA>${naturaBlock}
      </DettaglioLinee>`;
  }).join('\n');

  // ── DatiRiepilogo
  const datiRiepilogo = Object.entries(ivaMap).map(([aliq, v]) => {
    const naturaBlock = Number(aliq) === 0 ? '\n        <Natura>N4</Natura>' : '';
    return `      <DatiRiepilogo>
        <AliquotaIVA>${fmt2(aliq)}</AliquotaIVA>${naturaBlock}
        <ImponibileImporto>${fmt2(v.imp)}</ImponibileImporto>
        <Imposta>${fmt2(v.iva)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>`;
  }).join('\n');

  // ── DatiPagamento
  const pagamentoBlock = row.tipo_pagamento_id ? `
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${mapModalita(row.tp_nome)}</ModalitaPagamento>
        <DataScadenzaPagamento>${scadenza}</DataScadenzaPagamento>
        <ImportoPagamento>${fmt2(totale)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>` : '';

  const pecBlock = hasPEC
    ? `\n      <PECDestinatario>${esc(row.c_pec)}</PECDestinatario>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${formato}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${esc(pIvaAz)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${esc(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>${formato}</FormatoTrasmissione>
      <CodiceDestinatario>${codDest}</CodiceDestinatario>${pecBlock}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${esc(pIvaAz)}</IdCodice>
        </IdFiscaleIVA>${cfAzBlock}
        <Anagrafica>
          <Denominazione>${esc(az.ragione_sociale || 'Azienda')}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${esc(az.regime_fiscale || 'RF01')}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(az.indirizzo || 'Via non specificata')}</Indirizzo>
        <CAP>${padCAP(az.cap)}</CAP>
        <Comune>${esc(az.citta || 'Comune')}</Comune>${provAzBlock}
        <Nazione>IT</Nazione>
      </Sede>${contattiAzBlock}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>${pIvaClientBlock}${cfClientBlock}
        <Anagrafica>
          <Denominazione>${esc(row.c_nome || 'Cliente')}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${esc(row.c_via || 'Via non specificata')}</Indirizzo>
        <CAP>${padCAP(row.c_cap)}</CAP>
        <Comune>${esc(row.c_citta || 'Comune')}</Comune>${provClientBlock}
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${fmtDate(row.data_emissione)}</Data>
        <Numero>${esc(row.numero)}</Numero>
        <ImportoTotaleDocumento>${fmt2(totale)}</ImportoTotaleDocumento>${causaleBlocks(row.note)}
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${dettaglioLinee}
${datiRiepilogo}
    </DatiBeniServizi>${pagamentoBlock}
  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;
}

module.exports = router;
