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

// POST /api/sdi-passive/import-xml — body: XML come stringa (text/xml o
// application/xml) oppure JSON { xml: "<...>" } per chiamate dal frontend.
router.post('/import-xml', express.text({ type: ['text/xml','application/xml','text/plain'], limit: '2mb' }), (req, res) => {
  try {
    const xml = typeof req.body === 'string' ? req.body : String(req.body?.xml || '');
    if (!xml.trim()) return res.status(400).json({ error: 'XML mancante' });
    // Cap esplicito: il path JSON {xml} dal frontend passa per express.json('10mb')
    // globale, bypassando il limit di express.text. Parsare XML grandi su 256MB → OOM.
    if (Buffer.byteLength(xml, 'utf8') > 2_000_000) {
      return res.status(413).json({ error: 'XML troppo grande (max ~2MB)' });
    }
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

    // Righe
    const linee = asArray(body.DatiBeniServizi?.DettaglioLinee);
    if (linee.length > 5000) return res.status(413).json({ error: 'Troppe righe nel documento' });

    // Atomico: testata + righe in un'unica transazione (un solo commit; nessuno
    // stato parziale se una riga è malformata).
    const out = db.transaction(() => {
      const result = db.prepare(`INSERT INTO acquisti
        (numero, data_emissione, fornitore_id, note, stato)
        VALUES (?,?,?,?,?)`).run(numero, data, fornitore.id, 'Importato da XML FatturaPA passiva', 'RICEVUTA');
      const acquistoId = result.lastInsertRowid;
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
      return { acquistoId, imp };
    })();

    res.json({ id: out.acquistoId, numero, fornitoreId: fornitore.id, ragSoc, righe: linee.length, imponibile: +out.imp.toFixed(2) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sdi-passive/ricevute — elenco delle fatture passive scaricate/importate
// dal Sistema di Interscambio (acquisti con marcatore di import), con lo stato di
// registrazione: caricato a magazzino? pagato?
router.get('/ricevute', (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.numero, a.data_emissione, a.stato, a.note, a.fornitore_id,
           f.ragione_sociale AS fornitore_nome,
           (SELECT COUNT(*) FROM acquisti_righe r WHERE r.acquisto_id = a.id) AS num_righe,
           (SELECT COALESCE(SUM(r.quantita * r.prezzo * (1 - COALESCE(r.sconto,0)/100.0) * (1 + COALESCE(r.iva,0)/100.0)), 0)
              FROM acquisti_righe r WHERE r.acquisto_id = a.id) AS totale,
           (SELECT COALESCE(SUM(p.importo), 0) FROM pagamenti p WHERE p.acquisto_id = a.id) AS pagato,
           (SELECT COUNT(*) FROM arrivi_merce am WHERE am.acquisto_id = a.id) AS num_arrivi
    FROM acquisti a
    LEFT JOIN fornitori f ON a.fornitore_id = f.id
    WHERE a.note LIKE '%FatturaPA passiva%' OR a.note LIKE '%Importato da XML%'
    ORDER BY a.data_emissione DESC, a.id DESC`).all();

  res.json(rows.map(r => {
    const totale = +(r.totale || 0).toFixed(2);
    const pagato = +(r.pagato || 0).toFixed(2);
    return {
      id: r.id, numero: r.numero, dataEmissione: r.data_emissione,
      fornitoreId: r.fornitore_id, fornitoreNome: r.fornitore_nome || '—',
      stato: r.stato, numRighe: r.num_righe, totale, importoPagato: pagato,
      pagato: totale > 0 && pagato >= totale - 0.05,
      caricatoMagazzino: r.num_arrivi > 0,
    };
  }));
});

// GET /api/sdi-passive/providers — lista provider supportati (scaffold)
router.get('/providers', (req, res) => {
  res.json([
    { id: 'aruba',  name: 'Aruba Fatturazione Elettronica', status: 'TODO', docs: 'https://fatturazioneelettronica.aruba.it/apidoc/v2/docs.html' },
    { id: 'fic',    name: 'Fatture in Cloud',              status: 'TODO', docs: 'https://developers.fattureincloud.it/' },
    { id: 'acube',  name: 'Acubeapi',                      status: 'TODO', docs: 'https://docs.invoicing.acubeapi.com/' },
  ]);
});

// POST /api/sdi-passive/poll/aruba — esegue polling fatture passive da Aruba
// Setup:
//   env ARUBA_USER, ARUBA_PASS (credenziali Aruba Fatturazione Elettronica)
//   env ARUBA_BASE = https://ws.fatturazioneelettronica.aruba.it (default produzione)
// API ref: https://fatturazioneelettronica.aruba.it/apidoc/v2/docs.html
async function pollAruba({ fromDate, toDate }) {
  const user = process.env.ARUBA_USER;
  const pass = process.env.ARUBA_PASS;
  const base = (process.env.ARUBA_BASE || 'https://ws.fatturazioneelettronica.aruba.it').replace(/\/$/, '');
  if (!user || !pass) throw new Error('ARUBA_USER e ARUBA_PASS non configurati');

  // Step 1: ottieni token OAuth (Aruba usa /auth/signin)
  const tokenRes = await fetch(`${base}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=password&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
    signal: AbortSignal.timeout(15000),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Aruba auth ${tokenRes.status}: ${t.slice(0, 200)}`);
  }
  const tk = await tokenRes.json();
  const accessToken = tk.access_token || tk.token;
  if (!accessToken) throw new Error('Aruba: token non ricevuto');

  // Step 2: lista fatture passive nel range
  const q = new URLSearchParams({
    fromDate: fromDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    toDate:   toDate   || new Date().toISOString().slice(0, 10),
    type:     'ALL',
  });
  const listRes = await fetch(`${base}/services/invoice/in/list?${q}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`Aruba list ${listRes.status}: ${t.slice(0, 200)}`);
  }
  const list = await listRes.json();
  const invoices = Array.isArray(list?.invoices) ? list.invoices : (Array.isArray(list) ? list : []);

  return { invoices, accessToken };
}

router.post('/poll/aruba', async (req, res) => {
  try {
    const { fromDate, toDate } = req.body || {};
    const { invoices, accessToken } = await pollAruba({ fromDate, toDate });
    const base = (process.env.ARUBA_BASE || 'https://ws.fatturazioneelettronica.aruba.it').replace(/\/$/, '');

    let importate = 0, saltate = 0;
    const errori = [];

    for (const inv of invoices) {
      try {
        const remoteId = inv.id || inv.invoiceId || inv.uuid;
        if (!remoteId) { saltate++; continue; }

        // Scarica XML
        const xmlRes = await fetch(`${base}/services/invoice/in/${remoteId}/file`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!xmlRes.ok) { errori.push({ remoteId, errore: `download ${xmlRes.status}` }); continue; }
        const xml = await xmlRes.text();

        // Riusa il parser dell'import manuale (POST locale verso noi stessi non serve:
        // chiamiamo direttamente la funzione interna)
        const result = await new Promise((resolve, reject) => {
          // Riusa l'endpoint /import-xml passando il body
          const reqClone = { body: xml, tenant: req.tenant, user: req.user };
          const resClone = {
            _status: 200,
            status(s) { this._status = s; return this; },
            json(d) { resolve({ status: this._status, data: d }); },
          };
          try { router.stack.find(l => l.route?.path === '/import-xml')?.route.stack[1].handle(reqClone, resClone); }
          catch (e) { reject(e); }
        });

        if (result.status === 409) saltate++;
        else if (result.status === 200) importate++;
        else errori.push({ remoteId, errore: result.data?.error });
      } catch (err) {
        errori.push({ remoteId: inv.id, errore: err.message });
      }
    }

    res.json({ trovate: invoices.length, importate, saltate, errori });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /poll/:provider — fallback per altri provider non ancora implementati
router.post('/poll/:provider', (req, res) => {
  if (req.params.provider === 'aruba') return; // gestito sopra
  res.status(501).json({
    error: `Provider "${req.params.provider}" non ancora implementato`,
    hint: 'Provider supportati attualmente: aruba. Configurare ARUBA_USER e ARUBA_PASS nell\'ambiente.',
  });
});

module.exports = router;
