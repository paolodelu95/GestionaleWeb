// Scaffold: ricezione fatture passive (XML FatturaPA) tramite intermediario SDI.
//
// Modalità supportate:
//   1) Import manuale XML — endpoint POST /api/sdi-passive/import-xml accetta il
//      contenuto XML di una fattura passiva e crea automaticamente un acquisto in
//      bozza con fornitore (creato se nuovo) e righe.
//   2) Polling da intermediario — TODO: integrazione con Aruba Doc API (oppure
//      Fatture in Cloud, Acubeapi). Richiede credenziali dedicate per tenant.
//
// Il parsing usa fast-xml-parser (già nelle dipendenze).

const express = require('express');
const router = express.Router();
const { XMLParser } = require('fast-xml-parser');
const db = require('../database');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
});

function asArray(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
function pick(o, ...keys) { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; }

// POST /api/sdi-passive/import-xml — body: XML come stringa, content-type text/xml o application/xml
router.post('/import-xml', express.text({ type: ['text/xml','application/xml','text/plain'], limit: '4mb' }), (req, res) => {
  try {
    const xml = String(req.body || '');
    if (!xml.trim()) return res.status(400).json({ error: 'XML mancante' });
    const tree = parser.parse(xml);
    const root = pick(tree, 'FatturaElettronica');
    if (!root) return res.status(400).json({ error: 'Non sembra un XML FatturaPA' });

    const header = root.FatturaElettronicaHeader || {};
    const body   = asArray(root.FatturaElettronicaBody)[0] || {};

    const ced = header.CedentePrestatore?.DatiAnagrafici || {};
    const cedSede = header.CedentePrestatore?.Sede || {};
    const cedAnagr = ced.Anagrafica || {};
    const pIva = ced.IdFiscaleIVA?.IdCodice || '';
    const idPaese = ced.IdFiscaleIVA?.IdPaese || 'IT';
    const cf  = ced.CodiceFiscale || '';
    const ragSoc = cedAnagr.Denominazione || `${cedAnagr.Nome || ''} ${cedAnagr.Cognome || ''}`.trim() || '(senza nome)';

    // Crea/recupera fornitore
    let fornitore = null;
    if (pIva) fornitore = db.prepare('SELECT * FROM fornitori WHERE p_iva=? OR p_iva=?').get(pIva, idPaese + pIva);
    if (!fornitore && ragSoc) fornitore = db.prepare('SELECT * FROM fornitori WHERE LOWER(TRIM(ragione_sociale))=?').get(ragSoc.toLowerCase().trim());
    if (!fornitore) {
      const r = db.prepare(`INSERT INTO fornitori
        (ragione_sociale, p_iva, via, cap, citta, provincia, stato, estero)
        VALUES (?,?,?,?,?,?,?,?)`).run(
        ragSoc, pIva, cedSede.Indirizzo || '', cedSede.CAP || '',
        cedSede.Comune || '', cedSede.Provincia || '', cedSede.Nazione || 'IT',
        idPaese !== 'IT' ? 1 : 0);
      fornitore = db.prepare('SELECT * FROM fornitori WHERE id=?').get(r.lastInsertRowid);
    }

    const gen = body.DatiGenerali?.DatiGeneraliDocumento || {};
    const numero = String(gen.Numero || '').trim() || `IMPORT-${Date.now()}`;
    const data = String(gen.Data || new Date().toISOString().slice(0, 10));

    // Inserisce acquisto in bozza
    const existing = db.prepare('SELECT id FROM acquisti WHERE numero=? AND fornitore_id=?').get(numero, fornitore.id);
    if (existing) return res.status(409).json({ error: `Acquisto già presente (id=${existing.id})`, acquistoId: existing.id });

    const result = db.prepare(`INSERT INTO acquisti
      (numero, data_emissione, fornitore_id, note, stato)
      VALUES (?,?,?,?,?)`).run(numero, data, fornitore.id, 'Importato da XML FatturaPA passiva', 'RICEVUTA');
    const acquistoId = result.lastInsertRowid;

    // Righe
    const linee = asArray(body.DatiBeniServizi?.DettaglioLinee);
    const stmt = db.prepare(`INSERT INTO acquisti_righe
      (acquisto_id, descrizione, quantita, prezzo, iva, unita_misura)
      VALUES (?,?,?,?,?,?)`);
    let imp = 0;
    for (const l of linee) {
      const q = parseFloat(l.Quantita ?? 1) || 1;
      const pu = parseFloat(l.PrezzoUnitario ?? 0) || 0;
      const aliq = parseFloat(l.AliquotaIVA ?? 0) || 0;
      stmt.run(acquistoId, String(l.Descrizione || ''), q, pu, aliq, String(l.UnitaMisura || ''));
      imp += q * pu;
    }

    res.json({ id: acquistoId, numero, fornitoreId: fornitore.id, ragSoc, righe: linee.length, imponibile: +imp.toFixed(2) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sdi-passive/providers — lista provider supportati (scaffold)
router.get('/providers', (req, res) => {
  res.json([
    { id: 'aruba',  name: 'Aruba Fatturazione Elettronica', status: 'TODO', docs: 'https://fatturazioneelettronica.aruba.it/apidoc/v2/docs.html' },
    { id: 'fic',    name: 'Fatture in Cloud',              status: 'TODO', docs: 'https://developers.fattureincloud.it/' },
    { id: 'acube',  name: 'Acubeapi',                      status: 'TODO', docs: 'https://docs.invoicing.acubeapi.com/' },
  ]);
});

// POST /api/sdi-passive/poll/:provider — esegue polling delle nuove fatture passive
// Scaffold: ritorna 501 finché non si configurano le credenziali
router.post('/poll/:provider', (req, res) => {
  res.status(501).json({
    error: 'Integrazione provider non ancora configurata',
    hint: 'Configura le credenziali API in Impostazioni → SDI e abilita il provider scelto.',
    provider: req.params.provider,
  });
});

module.exports = router;
