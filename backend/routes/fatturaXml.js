const express = require('express');
const router = express.Router();
const db = require('../database');
const { XMLValidator, XMLParser } = require('fast-xml-parser');
const { calcolaTotaliFiscali, fiscFromRow } = require('../utils/fiscale');

// ── helpers di validazione ────────────────────────────────────────────────────
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_PEC = REGEX_EMAIL;
const REGEX_IBAN = /^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/;
const REGIMI_VALID = new Set(['RF01','RF02','RF04','RF05','RF06','RF07','RF08','RF09','RF10','RF11','RF12','RF13','RF14','RF15','RF16','RF17','RF18','RF19']);
const NATURE_VALID = new Set(['N1','N2','N2.1','N2.2','N3','N3.1','N3.2','N3.3','N3.4','N3.5','N3.6','N4','N5','N6','N6.1','N6.2','N6.3','N6.4','N6.5','N6.6','N6.7','N6.8','N6.9','N7']);

function cleanPiva(s) { return String(s || '').replace(/^IT/i, '').replace(/\s/g, ''); }
function cleanCF(s) { return String(s || '').replace(/\s/g, '').toUpperCase(); }

// ── POST /:id/invia-sdi ───────────────────────────────────────────────────────
router.post('/:id/invia-sdi', async (req, res) => {
  const az = db.prepare('SELECT * FROM azienda WHERE id=1').get();
  if (!az?.sdi_api_url || !az?.sdi_api_key)
    return res.status(400).json({ error: 'API SDI non configurata. Vai in Impostazioni → SDI.' });
  try {
    const xml = buildFatturaPA(req.params.id);
    const fattura = db.prepare('SELECT numero FROM fatture WHERE id=?').get(req.params.id);
    if (!fattura) return res.status(404).json({ error: 'Fattura non trovata' });
    const pIva = String(az.p_iva || '').replace(/^IT/i, '').replace(/\s/g, '');
    const safeName = String(fattura.numero).replace(/[^A-Za-z0-9_\-]/g, '_');
    const filename = `IT${pIva}_${safeName}.xml`;

    const response = await fetch(az.sdi_api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Authorization': `Bearer ${az.sdi_api_key}`,
        'X-Filename': filename,
      },
      body: xml,
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Errore API SDI: ${errText}` });
    }

    const data = await response.json().catch(() => ({}));
    const idTrasmissione = data.id || data.identifier || data.progressivo || String(Date.now());

    db.prepare(`UPDATE fatture SET stato_sdi='INVIATA', data_invio_sdi=?, id_trasmissione_sdi=? WHERE id=?`)
      .run(new Date().toISOString().split('T')[0], idTrasmissione, req.params.id);

    res.json({ ok: true, idTrasmissione });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/validate – controlli FatturaPA pre-invio SDI
// Esegue regole specifiche FatturaPA (non XSD completo, ma copre i casi piu
// comuni di scarto SDI) + parse XML well-formed dell'output di buildFatturaPA.
router.get('/:id/validate', (req, res) => {
  try {
    const f = db.prepare(`SELECT f.*, c.* FROM fatture f LEFT JOIN clienti c ON c.id=f.cliente_id WHERE f.id=?`).get(req.params.id);
    const az = db.prepare('SELECT * FROM azienda WHERE id=1').get();
    const errors = [];
    const warnings = [];

    if (!f) return res.status(404).json({ error: 'Fattura non trovata' });

    const tipoSogg = (f.tipo_soggetto || 'AZIENDA').toUpperCase();
    const pivaClean = cleanPiva(f.p_iva);
    const cfClean = cleanCF(f.codice_fiscale);

    // ── CLIENTE ──────────────────────────────────────────────────────────────
    if (!f.cliente_id) errors.push('Cliente mancante.');
    else {
      if (!f.ragione_sociale?.trim()) errors.push('Cliente: ragione sociale mancante.');
      else if (f.ragione_sociale.length > 80) errors.push(`Cliente: ragione sociale > 80 char (${f.ragione_sociale.length}).`);

      if (!pivaClean && !cfClean) {
        errors.push('Cliente: serve P.IVA o Codice Fiscale per la fattura elettronica.');
      } else {
        if (pivaClean && !/^\d{11}$/.test(pivaClean)) errors.push(`P.IVA cliente non valida: "${f.p_iva}" (11 cifre richieste).`);
        if (cfClean && cfClean.length !== 11 && cfClean.length !== 16) {
          errors.push(`Codice Fiscale cliente non valido: "${f.codice_fiscale}" (deve essere 11 o 16 caratteri).`);
        }
        if (cfClean.length === 16 && !/^[A-Z0-9]{16}$/.test(cfClean)) {
          errors.push(`Codice Fiscale "${f.codice_fiscale}" contiene caratteri non validi (atteso A-Z, 0-9).`);
        }
      }

      // Indirizzo
      if (!f.via?.trim()) errors.push('Cliente: indirizzo (via) mancante — obbligatorio per SDI.');
      if (!f.cap?.trim()) errors.push('Cliente: CAP mancante.');
      else if (!/^\d{5}$/.test(String(f.cap).trim())) errors.push(`Cliente: CAP "${f.cap}" non valido (5 cifre).`);
      if (!f.citta?.trim()) errors.push('Cliente: citta mancante.');
      if (f.provincia && !/^[A-Z]{2}$/.test(String(f.provincia).trim().toUpperCase())) {
        warnings.push(`Cliente: provincia "${f.provincia}" non standard (2 lettere maiuscole).`);
      }

      // Destinatario SDI (codice SDI / PEC)
      const sdi = (f.sdi || '').trim().toUpperCase();
      const pec = (f.pec || '').trim();
      if (!sdi && !pec) {
        warnings.push('Cliente senza codice SDI ne PEC: la fattura verra recapitata con destinatario default 0000000 (consultabile dal cassetto fiscale).');
      } else {
        if (sdi) {
          if (tipoSogg === 'PA') {
            if (sdi.length !== 6) errors.push(`Cliente PA: codice SDI deve essere di 6 caratteri (attuale "${sdi}" = ${sdi.length}).`);
          } else {
            if (sdi !== '0000000' && sdi.length !== 7) {
              errors.push(`Cliente B2B/B2C: codice SDI deve essere di 7 caratteri (attuale "${sdi}" = ${sdi.length}).`);
            }
          }
          if (!/^[A-Z0-9]+$/.test(sdi)) errors.push(`Codice SDI "${sdi}" contiene caratteri non validi.`);
        }
        if (pec && !REGEX_PEC.test(pec)) errors.push(`PEC cliente non valida: "${pec}".`);
      }

      // Tipo soggetto coerenza
      if (tipoSogg === 'PRIVATO' && !cfClean) {
        warnings.push('Cliente PRIVATO senza Codice Fiscale: di solito necessario per SDI.');
      }
    }

    // ── AZIENDA EMITTENTE ────────────────────────────────────────────────────
    if (!az?.ragione_sociale?.trim()) errors.push('Ragione sociale azienda mancante (Impostazioni → Azienda).');
    const pivaAz = cleanPiva(az?.p_iva);
    if (!pivaAz || !/^\d{11}$/.test(pivaAz)) errors.push('P.IVA azienda mancante o non valida.');
    if (!az?.via?.trim() || !az?.cap?.trim() || !az?.citta?.trim()) errors.push('Indirizzo azienda incompleto (via/CAP/citta) — obbligatorio.');
    if (az?.cap && !/^\d{5}$/.test(String(az.cap).trim())) errors.push(`CAP azienda "${az.cap}" non valido.`);
    if (az?.regime_fiscale && !REGIMI_VALID.has(String(az.regime_fiscale).trim().toUpperCase())) {
      errors.push(`Regime fiscale "${az.regime_fiscale}" non valido (atteso RF01..RF19).`);
    } else if (!az?.regime_fiscale) {
      warnings.push('Regime fiscale azienda non impostato (default RF01 - ordinario).');
    }
    if (az?.iban && !REGEX_IBAN.test(String(az.iban).replace(/\s/g, '').toUpperCase())) {
      warnings.push(`IBAN azienda "${az.iban}" formato non valido (atteso ITxx X xxxxx xxxxx xxxxxxxxxxxx).`);
    }
    if (az?.email && !REGEX_EMAIL.test(az.email)) warnings.push(`Email azienda "${az.email}" non valida.`);

    // ── INTESTAZIONE FATTURA ─────────────────────────────────────────────────
    if (!f.numero?.trim()) errors.push('Numero fattura mancante.');
    else if (String(f.numero).length > 20) errors.push(`Numero fattura > 20 caratteri (${String(f.numero).length}).`);
    if (!f.data_emissione) errors.push('Data emissione mancante.');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.data_emissione).slice(0, 10))) {
      errors.push(`Data emissione "${f.data_emissione}" non in formato YYYY-MM-DD.`);
    } else if (new Date(f.data_emissione) > new Date()) {
      warnings.push('Data emissione futura.');
    }
    if (f.note && String(f.note).length > 200) {
      warnings.push(`Note > 200 caratteri (${f.note.length}): SDI tronca il campo Causale.`);
    }

    // ── RIGHE ────────────────────────────────────────────────────────────────
    const righe = db.prepare('SELECT * FROM fatture_righe WHERE fattura_id=?').all(f.id);
    if (!righe.length) errors.push('Nessuna riga in fattura.');
    let totaleCalcolato = 0;
    const ivaConNaturaMancante = new Set();
    for (const [i, r] of righe.entries()) {
      const n = i + 1;
      if (!r.descrizione?.trim()) errors.push(`Riga ${n}: descrizione vuota.`);
      else if (String(r.descrizione).length > 1000) errors.push(`Riga ${n}: descrizione > 1000 caratteri.`);
      if (r.quantita == null || +r.quantita === 0) warnings.push(`Riga ${n}: quantita zero o mancante.`);
      if (r.prezzo == null || +r.prezzo < 0) errors.push(`Riga ${n}: prezzo negativo o mancante.`);
      if (r.iva == null || +r.iva < 0 || +r.iva > 100) errors.push(`Riga ${n}: IVA fuori range (${r.iva}).`);
      // Esente / non imponibile -> serve Natura
      if (+r.iva === 0) {
        const nat = (r.codice_iva || '').trim().toUpperCase();
        if (!nat) ivaConNaturaMancante.add(n);
        else if (!NATURE_VALID.has(nat) && !/^N\d(\.\d)?$/.test(nat)) {
          errors.push(`Riga ${n}: codice Natura "${r.codice_iva}" non riconosciuto (atteso N1..N7).`);
        }
      }
      const sconto = +(r.sconto ?? 0);
      if (sconto < 0 || sconto > 100) errors.push(`Riga ${n}: sconto fuori range (${sconto}%).`);
      totaleCalcolato += (+r.quantita || 0) * (+r.prezzo || 0) * (1 - sconto / 100) * (1 + (+r.iva || 0) / 100);
    }
    if (ivaConNaturaMancante.size) {
      errors.push(`Righe ${[...ivaConNaturaMancante].join(', ')}: con IVA 0% serve indicare un codice Natura (N1=escluse, N2=non soggette, N3=non imponibili, N4=esenti, N6=reverse charge, N7=IVA estera).`);
    }
    if (totaleCalcolato === 0) warnings.push('Totale fattura zero.');

    // ── STATO ────────────────────────────────────────────────────────────────
    if (f.stato === 'ANNULLATA') errors.push('Fattura annullata: non puo essere inviata a SDI.');
    if (f.stato_sdi === 'INVIATA') warnings.push('Fattura gia inviata a SDI in precedenza.');

    // ── XML WELL-FORMED ──────────────────────────────────────────────────────
    let xmlValido = null;
    let xmlSize = 0;
    try {
      const xml = buildFatturaPA(req.params.id);
      xmlSize = Buffer.byteLength(xml, 'utf8');
      const check = XMLValidator.validate(xml, { allowBooleanAttributes: false });
      if (check === true) {
        xmlValido = true;
        // Parse e check struttura base
        const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
        const root = parsed['p:FatturaElettronica'] || parsed['FatturaElettronica'];
        if (!root) errors.push('XML generato non contiene elemento radice FatturaElettronica.');
        const header = root?.FatturaElettronicaHeader;
        const body = root?.FatturaElettronicaBody;
        if (!header) errors.push('XML: FatturaElettronicaHeader mancante.');
        if (!body) errors.push('XML: FatturaElettronicaBody mancante.');
      } else {
        xmlValido = false;
        errors.push(`XML mal formato alla riga ${check.err?.line}: ${check.err?.msg}`);
      }
    } catch (e) {
      xmlValido = false;
      errors.push(`Errore generazione/parse XML: ${e.message}`);
    }

    if (xmlSize > 5 * 1024 * 1024) {
      warnings.push(`File XML grande (${(xmlSize/1024/1024).toFixed(2)}MB): SDI max 5MB.`);
    }

    res.json({
      ok: errors.length === 0,
      errors,
      warnings,
      totaleCalcolato: +totaleCalcolato.toFixed(2),
      xmlValido,
      xmlSize,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// ── Note di credito elettroniche (TD04) ──────────────────────────────────────
// GET /nota-credito/:id — scarica l'XML TD04
router.get('/nota-credito/:id', (req, res) => {
  try {
    const nc = db.prepare('SELECT numero FROM note_credito WHERE id=?').get(req.params.id);
    if (!nc) return res.status(404).json({ error: 'Not found' });
    const xml = buildFatturaPA(req.params.id, { source: 'nota' });
    const safeName = String(nc.numero).replace(/[^A-Za-z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="NotaCredito_${safeName}.xml"`);
    res.send(xml);
  } catch (e) {
    console.error('NotaCredito XML error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /nota-credito/:id/invia-sdi — invia la nota di credito TD04 all'API SDI configurata
router.post('/nota-credito/:id/invia-sdi', async (req, res) => {
  const az = db.prepare('SELECT * FROM azienda WHERE id=1').get();
  if (!az?.sdi_api_url || !az?.sdi_api_key)
    return res.status(400).json({ error: 'API SDI non configurata. Vai in Impostazioni → SDI.' });
  try {
    const nc = db.prepare('SELECT numero FROM note_credito WHERE id=?').get(req.params.id);
    if (!nc) return res.status(404).json({ error: 'Nota di credito non trovata' });
    const xml = buildFatturaPA(req.params.id, { source: 'nota' });
    const pIva = String(az.p_iva || '').replace(/^IT/i, '').replace(/\s/g, '');
    const safeName = String(nc.numero).replace(/[^A-Za-z0-9_\-]/g, '_');
    const response = await fetch(az.sdi_api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Authorization': `Bearer ${az.sdi_api_key}`,
        'X-Filename': `IT${pIva}_${safeName}.xml`,
      },
      body: xml,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Errore API SDI: ${errText}` });
    }
    const data = await response.json().catch(() => ({}));
    const idTrasmissione = data.id || data.identifier || data.progressivo || String(Date.now());
    db.prepare(`UPDATE note_credito SET stato_sdi='INVIATA', data_invio_sdi=?, id_trasmissione_sdi=? WHERE id=?`)
      .run(new Date().toISOString().split('T')[0], idTrasmissione, req.params.id);
    res.json({ ok: true, idTrasmissione });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fmt2(n) { return Number(n ?? 0).toFixed(2); }
function fmtDate(s) { return String(s ?? '').substring(0, 10); }

function sanitizeProgressivo(s) {
  return String(s ?? '').replace(/[^A-Za-z0-9\-_]/g, '').substring(0, 10) || '1';
}
function cleanPIva(s) { return String(s ?? '').replace(/^IT/i, '').replace(/\s/g, ''); }
function padCAP(s) {
  const v = String(s ?? '').replace(/\D/g, '');
  return v.padStart(5, '0').substring(0, 5) || '00000';
}

// FPA12 = 6 chars → Pubblica Amministrazione; FPR12 = 7 chars → privato/B2B
function detectFormato(sdi) {
  const v = String(sdi ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v.length === 6) return { formato: 'FPA12', codice: v };
  if (v.length === 7) return { formato: 'FPR12', codice: v };
  return { formato: 'FPR12', codice: '0000000' };
}

function mapModalita(nome) {
  const n = String(nome ?? '').toLowerCase();
  if (n.includes('contant') || n.includes('cass')) return 'MP01';
  if (n.includes('assegno circ')) return 'MP03';
  if (n.includes('assegno')) return 'MP02';
  if (n.includes('riba')) return 'MP12';
  if (n.includes('rid') || n.includes('sdd') || n.includes('domicil')) return 'MP19';
  if (n.includes('pos') || n.includes('carta') || n.includes('bancomat') || n.includes('satispay') || n.includes('paypal')) return 'MP08';
  if (n.includes('anticipato')) return 'MP05';
  return 'MP05'; // bonifico
}

function calcScadenza(dataEmissione, giorni, fineMese) {
  const d = new Date(dataEmissione);
  if (isNaN(d.getTime())) return fmtDate(dataEmissione);
  d.setDate(d.getDate() + (giorni || 0));
  if (fineMese) { d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(0); }
  return d.toISOString().substring(0, 10);
}

function causaleBlocks(note) {
  if (!note) return '';
  const text = String(note);
  const chunks = [];
  for (let i = 0; i < text.length; i += 200) chunks.push(text.substring(i, i + 200));
  return chunks.map(c => `\n        <Causale>${esc(c)}</Causale>`).join('');
}

// Risolve la Natura SDI per una riga.
// Prima guarda codice_iva sulla riga, poi cerca in aliquote_iva, fallback su aliquota %.
function resolveNatura(codiceIva, aliq) {
  if (Number(aliq) > 0) return null; // imponibile con percentuale → nessuna Natura
  if (codiceIva) {
    const row = db.prepare('SELECT natura FROM aliquote_iva WHERE codice=?').get(codiceIva);
    if (row?.natura) return row.natura;
  }
  return 'N4'; // fallback sicuro: esente
}

// Determina EsigibilitaIVA:
//   S = split payment (PA)
//   I = esigibilità immediata
//   D = esigibilità differita (cassa)
function resolveEsigibilita(isSplitPayment, codiceIva) {
  if (isSplitPayment || String(codiceIva ?? '').endsWith('sp')) return 'S';
  return 'I';
}

// ── builder ──────────────────────────────────────────────────────────────────

function buildFatturaPA(id, opts = {}) {
  const isNota = opts.source === 'nota';     // nota di credito → TD04
  const az = db.prepare('SELECT * FROM azienda WHERE id=1').get() || {};
  let row, righe, riferimenti;
  if (isNota) {
    row = db.prepare(`
      SELECT n.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
             c.citta as c_citta, c.provincia as c_provincia, c.stato as c_stato,
             c.p_iva as c_piva, c.codice_fiscale as c_cf,
             c.sdi as c_sdi, c.pec as c_pec, c.tipo_soggetto as c_tipo_soggetto,
             c.cig as c_cig, c.cup as c_cup,
             f.numero as coll_numero, f.data_emissione as coll_data
      FROM note_credito n
      LEFT JOIN clienti c ON n.cliente_id = c.id
      LEFT JOIN fatture f ON n.fattura_id = f.id
      WHERE n.id=?
    `).get(id);
    if (!row) throw new Error('Nota di credito non trovata');
    righe = db.prepare('SELECT * FROM note_credito_righe WHERE nota_credito_id=? ORDER BY id').all(id);
    // La fattura collegata diventa un riferimento DatiFattureCollegate.
    riferimenti = row.coll_numero
      ? [{ tipo: 'FATTURA_COLLEGATA', numero: row.coll_numero, data: row.coll_data }]
      : [];
  } else {
    row = db.prepare(`
      SELECT f.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap,
             c.citta as c_citta, c.provincia as c_provincia, c.stato as c_stato,
             c.p_iva as c_piva, c.codice_fiscale as c_cf,
             c.sdi as c_sdi, c.pec as c_pec,
             c.tipo_soggetto as c_tipo_soggetto,
             c.cig as c_cig, c.cup as c_cup,
             tp.nome as tp_nome, tp.giorni_scadenza as tp_giorni,
             tp.fine_mese as tp_fine_mese, tp.immediato as tp_immediato
      FROM fatture f
      LEFT JOIN clienti c ON f.cliente_id = c.id
      LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
      WHERE f.id=?
    `).get(id);
    if (!row) throw new Error('Fattura non trovata');
    righe = db.prepare('SELECT * FROM fatture_righe WHERE fattura_id=? ORDER BY id').all(id);
    riferimenti = db.prepare('SELECT * FROM fatture_riferimenti WHERE fattura_id=? ORDER BY ordine, id').all(id);
  }

  const isPA = row.c_tipo_soggetto === 'PA' || detectFormato(row.c_sdi).formato === 'FPA12';
  // CIG/CUP: prima guarda la fattura, poi il cliente
  const cig = (row.cig || row.c_cig || '').trim();
  const cup = (row.cup || row.c_cup || '').trim();

  // IVA breakdown per DatiRiepilogo (key = "aliq|natura|esigibilita")
  const ivaMap = {};
  for (const r of righe) {
    if (r.tipo === 'NOTA') continue;
    const aliq = r.iva ?? 22;
    const natura = resolveNatura(r.codice_iva || '', aliq);
    const esig  = resolveEsigibilita(isPA && aliq > 0, r.codice_iva || '');
    const key   = `${aliq}|${natura ?? ''}|${esig}`;
    const base  = (r.quantita ?? 1) * (r.prezzo ?? 0) * (1 - ((r.sconto ?? 0) / 100));
    if (!ivaMap[key]) ivaMap[key] = { aliq, natura, esig, imp: 0, iva: 0 };
    ivaMap[key].imp += base;
    ivaMap[key].iva += base * aliq / 100;
  }

  // ── Calcoli fiscali (ritenuta d'acconto / cassa previdenziale / bollo) ─────
  const fisc = fiscFromRow(row);
  const tot = calcolaTotaliFiscali(righe, fisc);

  // La cassa previdenziale concorre alla base IVA: la sommo al riepilogo del
  // gruppo con la sua stessa AliquotaIVA (creandolo se non esiste già).
  if (tot.cassaImporto > 0) {
    const aliq = Number(fisc.cassaIva) || 0;
    const natura = resolveNatura('', aliq);
    const esig = resolveEsigibilita(isPA && aliq > 0, '');
    const key = `${aliq}|${natura ?? ''}|${esig}`;
    if (!ivaMap[key]) ivaMap[key] = { aliq, natura, esig, imp: 0, iva: 0 };
    ivaMap[key].imp += tot.cassaImporto;
    ivaMap[key].iva += tot.ivaCassa;
  }

  const totale = tot.totale;

  // Blocchi fiscali, nell'ordine imposto da SDI dentro DatiGeneraliDocumento:
  // DatiRitenuta* → DatiBollo? → DatiCassaPrevidenziale* (prima di ImportoTotaleDocumento).
  const ritenutaBlock = tot.ritenutaImporto > 0 ? `
        <DatiRitenuta>
          <TipoRitenuta>${esc(fisc.ritenutaTipo || 'RT02')}</TipoRitenuta>
          <ImportoRitenuta>${fmt2(tot.ritenutaImporto)}</ImportoRitenuta>
          <AliquotaRitenuta>${fmt2(fisc.ritenutaAliquota)}</AliquotaRitenuta>
          <CausalePagamento>${esc(fisc.ritenutaCausale || 'A')}</CausalePagamento>
        </DatiRitenuta>` : '';
  const bolloBlock = tot.bolloImporto > 0 ? `
        <DatiBollo>
          <BolloVirtuale>SI</BolloVirtuale>
          <ImportoBollo>${fmt2(tot.bolloImporto)}</ImportoBollo>
        </DatiBollo>` : '';
  const cassaNatura = resolveNatura('', Number(fisc.cassaIva) || 0);
  const cassaBlock = tot.cassaImporto > 0 ? `
        <DatiCassaPrevidenziale>
          <TipoCassa>${esc(fisc.cassaTipo || 'TC22')}</TipoCassa>
          <AlCassa>${fmt2(fisc.cassaAliquota)}</AlCassa>
          <ImportoContributoCassa>${fmt2(tot.cassaImporto)}</ImportoContributoCassa>
          <ImponibileCassa>${fmt2(tot.imponibile)}</ImponibileCassa>
          <AliquotaIVA>${fmt2(fisc.cassaIva)}</AliquotaIVA>${cassaNatura ? `\n          <Natura>${esc(cassaNatura)}</Natura>` : ''}
        </DatiCassaPrevidenziale>` : '';
  const fiscaliBlock = `${ritenutaBlock}${bolloBlock}${cassaBlock}`;

  const pIvaAz = cleanPIva(az.p_iva || '00000000000');
  const { formato, codice: codDest } = detectFormato(row.c_sdi);
  const hasPEC  = codDest === '0000000' && row.c_pec;
  const progressivo = sanitizeProgressivo(row.numero);
  const scadenza = calcScadenza(row.data_emissione, row.tp_giorni || 0, row.tp_fine_mese || 0);

  // Tipo documento: TD01 fattura, TD04 nota di credito
  const tipoDoc = isNota ? 'TD04' : 'TD01';

  // ── Blocchi opzionali cedente
  const cfAzBlock = az.cod_fiscale && az.cod_fiscale !== az.p_iva
    ? `\n        <CodiceFiscale>${esc(az.cod_fiscale)}</CodiceFiscale>` : '';
  const provAzBlock = az.provincia
    ? `\n        <Provincia>${esc(String(az.provincia).substring(0, 2).toUpperCase())}</Provincia>` : '';
  const contattiAzBlock = (az.pec || az.email)
    ? `\n      <Contatti><Email>${esc(az.pec || az.email)}</Email></Contatti>` : '';

  // ── Blocchi opzionali cessionario
  const pIvaClientBlock = row.c_piva
    ? `\n        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${esc(cleanPIva(row.c_piva))}</IdCodice></IdFiscaleIVA>` : '';
  const cfClientBlock = row.c_cf
    ? `\n        <CodiceFiscale>${esc(row.c_cf)}</CodiceFiscale>` : '';
  const provClientBlock = row.c_provincia
    ? `\n        <Provincia>${esc(String(row.c_provincia).substring(0, 2).toUpperCase())}</Provincia>` : '';

  // ── CIG/CUP (obbligatori per molte PA — inseriti in DatiGeneraliDocumento)
  const cigBlock = cig ? `\n        <CodiceCIG>${esc(cig)}</CodiceCIG>` : '';
  const cupBlock = cup ? `\n        <CodiceCUP>${esc(cup)}</CodiceCUP>` : '';

  // ── DettaglioLinee (salta righe NOTA con quantita=0 e prezzo=0)
  let lineaNum = 0;
  const dettaglioLinee = righe.map(r => {
    if (r.tipo === 'NOTA') return null;
    lineaNum++;
    const q   = r.quantita ?? 1;
    const pu  = r.prezzo ?? 0;
    const sc  = r.sconto ?? 0;
    const aliq = r.iva ?? 22;
    const imp  = q * pu * (1 - sc / 100);
    const natura = resolveNatura(r.codice_iva || '', aliq);
    const umBlock = r.unita_misura
      ? `\n        <UnitaMisura>${esc(r.unita_misura)}</UnitaMisura>` : '';
    const scontoBlock = sc > 0
      ? `\n        <ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${fmt2(sc)}</Percentuale></ScontoMaggiorazione>` : '';
    const naturaBlock = natura ? `\n        <Natura>${esc(natura)}</Natura>` : '';
    return `      <DettaglioLinee>
        <NumeroLinea>${lineaNum}</NumeroLinea>
        <Descrizione>${esc(r.descrizione || 'Prodotto/Servizio')}</Descrizione>
        <Quantita>${fmt2(q)}</Quantita>${umBlock}
        <PrezzoUnitario>${fmt2(pu)}</PrezzoUnitario>${scontoBlock}
        <PrezzoTotale>${fmt2(imp)}</PrezzoTotale>
        <AliquotaIVA>${fmt2(aliq)}</AliquotaIVA>${naturaBlock}
      </DettaglioLinee>`;
  }).filter(Boolean).join('\n');

  // ── DatiRiepilogo (uno per ogni combinazione aliquota+natura+esigibilità)
  const datiRiepilogo = Object.values(ivaMap).map(v => {
    const naturaBlock = v.natura ? `\n        <Natura>${esc(v.natura)}</Natura>` : '';
    return `      <DatiRiepilogo>
        <AliquotaIVA>${fmt2(v.aliq)}</AliquotaIVA>${naturaBlock}
        <ImponibileImporto>${fmt2(v.imp)}</ImponibileImporto>
        <Imposta>${fmt2(v.iva)}</Imposta>
        <EsigibilitaIVA>${v.esig}</EsigibilitaIVA>
      </DatiRiepilogo>`;
  }).join('\n');

  // ── DatiPagamento
  const condPag = row.tp_immediato ? 'TP01' : 'TP02'; // TP01=unica sol. TP02=rateale
  const pagamentoBlock = row.tipo_pagamento_id ? `
    <DatiPagamento>
      <CondizioniPagamento>${condPag}</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${mapModalita(row.tp_nome)}</ModalitaPagamento>
        <DataScadenzaPagamento>${scadenza}</DataScadenzaPagamento>
        <ImportoPagamento>${fmt2(tot.nettoAPagare)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>` : '';

  const pecBlock = hasPEC ? `\n      <PECDestinatario>${esc(row.c_pec)}</PECDestinatario>` : '';

  // ── Blocchi DatiGenerali aggiuntivi (riferimenti PA)
  const TIPO_XML = {
    'ORDINE_ACQUISTO': 'DatiOrdineAcquisto',
    'CONTRATTO':       'DatiContratto',
    'CONVENZIONE':     'DatiConvenzione',
    'RICEZIONE':       'DatiRicezione',
    'FATTURA_COLLEGATA': 'DatiFattureCollegate',
    'DDT':             'DatiDDT',
  };
  const riferimentiXml = (riferimenti || []).map(r => {
    const tag = TIPO_XML[r.tipo] || 'DatiOrdineAcquisto';
    if (r.tipo === 'DDT') {
      const dataBlock = r.data ? `\n      <DataDDT>${fmtDate(r.data)}</DataDDT>` : '';
      return `    <DatiDDT>\n      <NumeroDDT>${esc(r.numero)}</NumeroDDT>${dataBlock}\n    </DatiDDT>`;
    }
    const dataBlock    = r.data     ? `\n      <Data>${fmtDate(r.data)}</Data>`                                       : '';
    const commessaBlock = r.commessa ? `\n      <CodiceCommessaConvenzione>${esc(r.commessa)}</CodiceCommessaConvenzione>` : '';
    const cupRifBlock  = r.cup      ? `\n      <CodiceCUP>${esc(r.cup)}</CodiceCUP>`                                  : '';
    const cigRifBlock  = r.cig      ? `\n      <CodiceCIG>${esc(r.cig)}</CodiceCIG>`                                  : '';
    return `    <${tag}>\n      <IdDocumento>${esc(r.numero)}</IdDocumento>${dataBlock}${commessaBlock}${cupRifBlock}${cigRifBlock}\n    </${tag}>`;
  }).join('\n');

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
        <TipoDocumento>${tipoDoc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${fmtDate(row.data_emissione)}</Data>
        <Numero>${esc(row.numero)}</Numero>${fiscaliBlock}
        <ImportoTotaleDocumento>${fmt2(totale)}</ImportoTotaleDocumento>${cigBlock}${cupBlock}${causaleBlocks(row.note)}
      </DatiGeneraliDocumento>${riferimentiXml ? '\n' + riferimentiXml : ''}
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
