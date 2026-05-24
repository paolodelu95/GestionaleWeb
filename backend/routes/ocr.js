// OCR fatture passive — usa Mindee Invoice API v4.
//
// Setup:
//   - registrati su https://www.mindee.com → API Token gratuito (250 chiamate/mese)
//   - env MINDEE_API_KEY = il token (non lo prefisso con "Token", lo aggiunge il client)
//
// Flusso:
//   1) Il client invia POST /api/ocr/fattura con body = PDF (binario)
//   2) Server lo inoltra a Mindee, ottiene JSON estratto
//   3) Risponde con i campi suggeriti (fornitore, totale, IVA, data, righe)
//      lasciando all'utente di confermare prima di creare l'acquisto.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/ocr/fattura  (multipart/form-data, campo "file")
router.post('/fattura', upload.single('file'), async (req, res) => {
  const key = process.env.MINDEE_API_KEY;
  if (!key) return res.status(500).json({ error: 'MINDEE_API_KEY non configurata' });
  if (!req.file) return res.status(400).json({ error: 'File mancante (campo "file")' });

  try {
    const form = new FormData();
    form.append('document', new Blob([req.file.buffer], { type: req.file.mimetype || 'application/pdf' }), req.file.originalname || 'document.pdf');
    const r = await fetch('https://api.mindee.net/v1/products/mindee/invoices/v4/predict', {
      method: 'POST',
      headers: { 'Authorization': `Token ${key}` },
      body: form,
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: `Mindee ${r.status}: ${t.slice(0, 300)}` });
    }
    const data = await r.json();
    const pred = data?.document?.inference?.prediction || {};

    // Estrazione campi (Mindee Invoice v4)
    const fornitore = pred.supplier_name?.value || '';
    const pIvaFornitore = (pred.supplier_company_registrations || [])
      .find(x => /VAT|P\.?IVA/i.test(x.type || ''))?.value || '';
    const dataDoc = pred.date?.value || null;
    const numero = pred.invoice_number?.value || '';
    const totaleLordo = parseFloat(pred.total_amount?.value || pred.total_incl?.value || 0) || 0;
    const totaleNetto = parseFloat(pred.total_net?.value || pred.total_excl?.value || 0) || 0;
    const totaleIva   = parseFloat(pred.total_tax?.value || (totaleLordo - totaleNetto) || 0) || 0;

    const righe = (pred.line_items || []).map(l => ({
      descrizione: l.description || '',
      quantita:    parseFloat(l.quantity || 1) || 1,
      prezzo:      parseFloat(l.unit_price || l.total_amount || 0) || 0,
      iva:         parseFloat(l.tax_rate || 22) || 22,
    }));

    res.json({
      ok: true,
      suggerito: {
        fornitore, pIvaFornitore, dataDoc, numero,
        totaleLordo, totaleNetto, totaleIva,
        righe,
      },
      mindeeRequestId: data?.api_request?.request_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ocr/fattura/conferma — crea l'acquisto a partire dai dati confermati
// body: { fornitore, pIva, dataDoc, numero, righe: [{descrizione,quantita,prezzo,iva}] }
router.post('/fattura/conferma', (req, res) => {
  const { fornitore, pIva, dataDoc, numero, righe } = req.body || {};
  if (!fornitore || !dataDoc || !Array.isArray(righe) || !righe.length) {
    return res.status(400).json({ error: 'fornitore, dataDoc e righe sono obbligatori' });
  }

  // Cerca/crea fornitore
  let f = null;
  if (pIva) f = db.prepare('SELECT * FROM fornitori WHERE p_iva=? OR p_iva=?').get(pIva, 'IT' + pIva);
  if (!f)   f = db.prepare('SELECT * FROM fornitori WHERE LOWER(TRIM(ragione_sociale))=?').get(String(fornitore).toLowerCase().trim());
  if (!f) {
    const r = db.prepare('INSERT INTO fornitori (ragione_sociale, p_iva) VALUES (?,?)').run(fornitore, pIva || '');
    f = { id: r.lastInsertRowid };
  }

  const numDoc = String(numero || `OCR-${Date.now()}`).trim();
  const dup = db.prepare('SELECT id FROM acquisti WHERE numero=? AND fornitore_id=?').get(numDoc, f.id);
  if (dup) return res.status(409).json({ error: 'Acquisto già presente', acquistoId: dup.id });

  const tx = db.transaction(() => {
    const a = db.prepare(`INSERT INTO acquisti (numero, data_emissione, fornitore_id, note, stato)
                          VALUES (?,?,?,?,?)`)
      .run(numDoc, dataDoc, f.id, 'Importato da OCR Mindee', 'RICEVUTA');
    const id = a.lastInsertRowid;
    const stmt = db.prepare(`INSERT INTO acquisti_righe (acquisto_id, descrizione, quantita, prezzo, iva)
                             VALUES (?,?,?,?,?)`);
    for (const r of righe) stmt.run(id, r.descrizione || '', r.quantita || 1, r.prezzo || 0, r.iva ?? 22);
    return id;
  });

  try {
    const acquistoId = tx();
    res.json({ acquistoId, fornitoreId: f.id, righe: righe.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', (req, res) => {
  res.json({ configured: !!process.env.MINDEE_API_KEY });
});

module.exports = router;
