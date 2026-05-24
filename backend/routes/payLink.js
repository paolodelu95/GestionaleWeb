// Scaffold: genera link di pagamento Stripe per una fattura.
// Per attivare: `npm install stripe` nel backend, poi imposta env STRIPE_SECRET_KEY
// (chiave segreta che inizia con sk_test_... o sk_live_...).
// In aggiunta, lo script può salvare un riferimento al payment link in fatture.note
// in modo da poter monitorare i pagamenti via webhook (TODO seconda fase).

const express = require('express');
const router = express.Router();
const db = require('../database');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configurata. Imposta la variabile d\'ambiente.');
  let stripeLib;
  try { stripeLib = require('stripe'); }
  catch (_) { throw new Error('Pacchetto "stripe" non installato. Esegui: npm install stripe'); }
  return stripeLib(key);
}

// POST /api/pay-link/fattura/:id — crea un Payment Link per la fattura indicata.
// body opzionale: { description, currency='eur', clienteEmail }
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
    });

    res.json({ url: link.url, paymentLinkId: link.id, importo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pay-link/webhook — endpoint per webhook Stripe (TODO: validazione firma,
// registrazione del pagamento sulla fattura). Lasciato come scaffold.
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // TODO: validare con STRIPE_WEBHOOK_SECRET e gestire l'evento
  // 'checkout.session.completed' o 'payment_intent.succeeded' per registrare
  // un pagamento sulla fattura indicata da metadata.fatturaId.
  res.json({ received: true, status: 'scaffold' });
});

module.exports = router;
