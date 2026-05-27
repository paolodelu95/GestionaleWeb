// OCR fatture passive — usa Mindee Invoice API v2 (asincrona).
//
// Setup:
//   - registrati su https://www.mindee.com → API Token gratuito (250 chiamate/mese)
//   - env MINDEE_API_KEY = il token (senza prefisso "Token")
//
// Flusso v2:
//   1) POST /v2/inferences/enqueue  → ottieni inference.id
//   2) GET  /v2/inferences/{id}     → poll finché inference.result.fields è presente
//   3) Estrai i campi e rispondi al client

const express = require('express');
const router = express.Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Limita le richieste OCR per utente: ogni call costa quota Mindee (250/mese
// gratis nel piano free). 10 OCR ogni 15 minuti per utente è abbondante per
// uso normale e taglia gli abusi.
const { ipKeyGenerator } = require('express-rate-limit');
const ocrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // authMiddleware è già applicato in server.js prima di questa route, quindi
  // req.user.id è sempre presente. Fallback su ipKeyGenerator per sicurezza
  // (gestisce correttamente IPv6).
  keyGenerator: (req) => req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req),
  message: { error: 'Troppe richieste OCR. Riprova tra qualche minuto.' },
});

const MINDEE_ENQUEUE = 'https://api-v2.mindee.net/v2/inferences/enqueue';
const MINDEE_GET     = 'https://api-v2.mindee.net/v2/inferences';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// POST /api/ocr/fattura  (multipart/form-data, campo "file")
router.post('/fattura', ocrLimiter, upload.single('file'), async (req, res) => {
  const key = process.env.MINDEE_API_KEY;
  if (!key) return res.status(500).json({ error: 'MINDEE_API_KEY non configurata' });
  if (!req.file) return res.status(400).json({ error: 'File mancante (campo "file")' });

  try {
    // 1. Enqueue
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'application/pdf' }), req.file.originalname || 'document.pdf');
    form.append('model_id', 'mindee/invoices');

    const enqueueResp = await fetch(MINDEE_ENQUEUE, {
      method: 'POST',
      headers: { 'Authorization': key },
      body: form,
    });
    if (!enqueueResp.ok) {
      const t = await enqueueResp.text();
      return res.status(502).json({ error: `Mindee ${enqueueResp.status}: ${t.slice(0, 300)}` });
    }

    const enqueueData = await enqueueResp.json();
    const inferenceId = enqueueData.inference?.id;
    if (!inferenceId) {
      return res.status(502).json({ error: 'Mindee non ha restituito un inference ID' });
    }

    // 2. Poll (max 30s, check ogni 2s)
    let fields = enqueueData.inference?.result?.fields ?? null;
    for (let i = 0; i < 15 && !fields; i++) {
      await sleep(2000);
      const pollResp = await fetch(`${MINDEE_GET}/${inferenceId}`, {
        headers: { 'Authorization': key },
      });
      if (!pollResp.ok) continue;
      const pollData = await pollResp.json();
      fields = pollData.inference?.result?.fields ?? null;
    }

    if (!fields) {
      return res.status(502).json({ error: 'Timeout: Mindee non ha completato l\'analisi (30s)' });
    }

    // 3. Estrazione campi (Mindee v2: inference.result.fields)
    const fornitore = fields.supplier_name?.value || '';
    const pIvaFornitore = (fields.supplier_company_registrations || [])
      .find(x => /VAT|P\.?IVA/i.test(x.type || ''))?.value || '';
    const dataDoc = fields.date?.value || null;
    const numero  = fields.invoice_number?.value || '';
    const totaleLordo = parseFloat(fields.total_amount?.value ?? 0) || 0;
    const totaleNetto = parseFloat(fields.total_net?.value ?? fields.total_excl?.value ?? 0) || 0;
    const totaleIva   = parseFloat(
      fields.total_tax?.value ??
      fields.taxes?.[0]?.value ??
      (totaleLordo - totaleNetto)
    ) || 0;

    const righe = (fields.line_items || []).map(l => ({
      descrizione: l.description || '',
      quantita:    parseFloat(l.quantity  ?? 1)  || 1,
      prezzo:      parseFloat(l.unit_price ?? l.total_amount ?? 0) || 0,
      iva:         parseFloat(l.tax_rate   ?? 22) || 22,
    }));

    res.json({
      ok: true,
      suggerito: { fornitore, pIvaFornitore, dataDoc, numero, totaleLordo, totaleNetto, totaleIva, righe },
      mindeeRequestId: inferenceId,
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
