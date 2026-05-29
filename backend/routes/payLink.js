// Stripe Payment Links per le fatture.
//
// Setup:
//   - env STRIPE_SECRET_KEY = sk_test_... oppure sk_live_...
//   - (opzionale) env STRIPE_WEBHOOK_SECRET = whsec_... per validare la firma
//     dei webhook. Senza, il payload viene comunque processato in modo "best effort"
//     (utile in dev; in produzione configurare il webhook è raccomandato).

const express = require('express');
const router = express.Router();
const db = require('../database');

let _stripe = null;
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configurata');
  if (_stripe) return _stripe;
  let stripeLib;
  try { stripeLib = require('stripe'); }
  catch (_) { throw new Error('Pacchetto "stripe" non installato. Esegui: npm install stripe'); }
  _stripe = stripeLib(key);
  return _stripe;
}

// GET /api/pay-link/status — verifica se Stripe è configurato
router.get('/status', (req, res) => {
  res.json({
    configured: !!process.env.STRIPE_SECRET_KEY,
    webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE'
        : process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'TEST'
        : 'NONE',
  });
});

// POST /api/pay-link/fattura/:id — crea Payment Link
router.post('/fattura/:id', async (req, res) => {
  try {
    const stripe = getStripe();
    const id = parseInt(req.params.id, 10);
    const f = db.prepare(`SELECT f.*, c.ragione_sociale c_nome, c.email c_email
                          FROM fatture f LEFT JOIN clienti c ON c.id=f.cliente_id WHERE f.id=?`).get(id);
    if (!f) return res.status(404).json({ error: 'Fattura non trovata' });

    const totaleRow = db.prepare(
      `SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) AS t
       FROM fatture_righe WHERE fattura_id=?`).get(id);
    const pagatoRow = db.prepare(
      `SELECT COALESCE(SUM(importo),0) AS p FROM pagamenti WHERE fattura_id=?`).get(id);
    const importo = +(totaleRow.t - pagatoRow.p).toFixed(2);
    if (importo <= 0) return res.status(400).json({ error: 'Fattura già saldata' });

    const currency = (req.body?.currency || 'eur').toLowerCase();
    const cents = Math.round(importo * 100);

    const product = await stripe.products.create({
      name: `Fattura ${f.numero}` + (f.c_nome ? ` — ${f.c_nome}` : ''),
      description: req.body?.description || `Pagamento fattura n. ${f.numero} del ${f.data_emissione}`,
    });
    const price = await stripe.prices.create({ product: product.id, unit_amount: cents, currency });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { fatturaId: String(id), numero: f.numero || '', tenant: req.tenant || '' },
      after_completion: { type: 'hosted_confirmation', hosted_confirmation: { custom_message: `Grazie! Il pagamento della fattura ${f.numero} è confermato.` } },
    });

    // Salva il link in una nota della fattura per riferimento futuro (best-effort)
    try {
      const cur = db.prepare('SELECT note FROM fatture WHERE id=?').get(id)?.note || '';
      const newNote = cur + (cur ? '\n' : '') + `[Stripe Payment Link] ${link.url}`;
      db.prepare('UPDATE fatture SET note=? WHERE id=?').run(newNote, id);
    } catch(_) {}

    res.json({ url: link.url, paymentLinkId: link.id, importo, currency });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook handler esportato — registrato in server.js PRIMA di express.json()
// per ricevere il body raw (necessario per la firma Stripe).
function stripeWebhookHandler(req, res) {
  let event;
  const sig = req.headers['stripe-signature'];
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (whsec) {
    if (!sig) return res.status(400).send('Webhook error: firma mancante');
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, sig, whsec);
    } catch (err) {
      console.warn('[Stripe webhook] firma non valida:', err.message);
      return res.status(400).send(`Webhook error: ${err.message}`);
    }
  } else if (process.env.NODE_ENV === 'development') {
    // SOLO in sviluppo esplicito: accetta il JSON non firmato per i test locali.
    console.warn('[Stripe webhook] DEV: STRIPE_WEBHOOK_SECRET assente, firma NON verificata');
    try { event = JSON.parse(req.body.toString('utf8')); }
    catch (err) { return res.status(400).send(`Webhook error: ${err.message}`); }
  } else {
    // Produzione senza secret: fail-closed. Il guard d'avvio in server.js
    // impedisce questo stato quando STRIPE_SECRET_KEY è presente.
    console.error('[Stripe webhook] STRIPE_WEBHOOK_SECRET non configurato: webhook rifiutato');
    return res.status(500).send('Webhook non configurato');
  }

  // Idempotenza: Stripe consegna at-least-once. Scarta gli eventi già processati.
  const { markStripeEventProcessed } = require('../utils/authDb');
  if (!markStripeEventProcessed(event.id, event.type)) {
    return res.json({ received: true, duplicate: true });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const obj = event.data?.object || {};
    const meta = obj.metadata || obj.payment_intent?.metadata || {};
    const fatturaId = parseInt(meta.fatturaId, 10);
    const tenant = meta.tenant;
    const amount = (obj.amount_total || obj.amount || 0) / 100;
    if (fatturaId && tenant && amount > 0) {
      try {
        // Difesa in profondità: non aprire/creare un DB per un tenant inesistente
        // anche se la firma è valida (evita side-effect su slug arbitrari).
        const { getTenant } = require('../utils/authDb');
        if (!getTenant(tenant)) {
          console.warn('[Stripe webhook] tenant inesistente, ignoro:', tenant);
          return res.json({ received: true });
        }
        const { openTenantDb } = require('../utils/tenantDb');
        const tdb = openTenantDb(tenant);
        // Idempotenza a livello pagamento: lo stesso incasso può arrivare via due
        // eventi diversi (checkout.session.completed + payment_intent.succeeded).
        // Dedup sul payment_intent (o id oggetto) per non registrarlo due volte.
        const paymentRef = obj.payment_intent || obj.id || null;
        if (paymentRef && tdb.prepare('SELECT id FROM pagamenti WHERE stripe_ref=?').get(paymentRef)) {
          return res.json({ received: true, duplicate: true });
        }
        tdb.prepare(`INSERT INTO pagamenti
          (fattura_id, data_pagamento, importo, metodo, note, tipo, conto, stripe_ref)
          VALUES (?,?,?,?,?,?,?,?)`).run(
          fatturaId, new Date().toISOString().slice(0, 10), amount,
          'Stripe', `Webhook ${event.type} · ${obj.id || ''}`, 'ENTRATA', 'BANCA', paymentRef);
        const r = tdb.prepare(`SELECT
          (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM fatture_righe WHERE fattura_id=?) -
          (SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE fattura_id=?) AS res`).get(fatturaId, fatturaId);
        if (r?.res <= 0.01) tdb.prepare('UPDATE fatture SET stato=? WHERE id=?').run('PAGATA', fatturaId);
        console.log(`[Stripe webhook] pagamento € ${amount} registrato su fattura ${fatturaId} (tenant=${tenant})`);
      } catch (e) {
        console.error('[Stripe webhook] errore registrazione pagamento:', e.message);
      }
    }
  }

  res.json({ received: true });
}

module.exports = router;
module.exports.stripeWebhookHandler = stripeWebhookHandler;
