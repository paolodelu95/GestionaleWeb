// Sistema licenze: Stripe Checkout + Customer Portal + Webhook.
//
// Setup richiesto in .env (e su fly secrets):
//   STRIPE_SECRET_KEY        = sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET    = whsec_... (per validare la firma del webhook)
//   STRIPE_PRICE_PRO_MONTHLY = price_xxx (Prodotto "Ordeva Pro" mensile)
//   STRIPE_PRICE_PRO_YEARLY  = price_xxx (Prodotto "Ordeva Pro" annuale)
//   APP_BASE_URL             = https://ordeva.it (per redirect post-checkout)
//
// Stati subscription gestiti:
//   trialing      → permesso pieno (è una trial Stripe, raramente usata)
//   active        → permesso pieno (abbonamento Pro attivo)
//   past_due      → abbonamento in mora: trattato come "scaduto" → read-only
//   unpaid        → non pagato: read-only
//   canceled      → cancellato: read-only
//   incomplete*   → setup non completato: trial nativa rimane in vigore
//
// Read-only state: solo GET su whitelist (gestito in middleware/auth.js).

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const {
  getTenant, updateTenantBilling, getTenantByStripeCustomerId, markStripeEventProcessed,
} = require('../utils/authDb');

let _stripe = null;
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configurata');
  if (_stripe) return _stripe;
  try { _stripe = require('stripe')(key); }
  catch (_) { throw new Error('Pacchetto "stripe" non installato.'); }
  return _stripe;
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
}

function priceIdFor(interval) {
  if (interval === 'year') return process.env.STRIPE_PRICE_PRO_YEARLY;
  return process.env.STRIPE_PRICE_PRO_MONTHLY; // default month
}

// Stati subscription che permettono accesso write completo
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// ── GET /api/billing/status ───────────────────────────────────────────────
// Stato licenza del tenant corrente. Usato da frontend per mostrare banner,
// pulsanti "Sottoscrivi" / "Gestisci abbonamento".
router.get('/status', (req, res) => {
  const tenant = getTenant(req.tenant);
  if (!tenant) return res.status(404).json({ error: 'Tenant non trovato' });

  // Calcolo lo stato effettivo (cosa vede l'utente)
  const today = new Date();
  let effective; // 'trial' | 'active' | 'expired' | 'past_due'
  if (tenant.piano === 'pro' && ACTIVE_STATUSES.has(tenant.subscriptionStatus)) {
    effective = 'active';
  } else if (tenant.piano === 'pro' && tenant.subscriptionStatus === 'past_due') {
    effective = 'past_due';
  } else if (tenant.piano === 'pro') {
    // Pro ma subscription non attiva: read-only
    effective = 'expired';
  } else {
    // Trial
    const trialEnd = tenant.trialScadeIl ? new Date(tenant.trialScadeIl + 'T23:59:59') : null;
    if (!trialEnd || trialEnd >= today) effective = 'trial';
    else effective = 'expired';
  }

  res.json({
    plan: tenant.piano,
    effectiveState: effective,
    subscriptionStatus: tenant.subscriptionStatus,
    currentPeriodEnd: tenant.currentPeriodEnd,
    trialScadeIl: tenant.trialScadeIl,
    billingInterval: tenant.billingInterval,
    hasStripeCustomer: !!tenant.stripeCustomerId,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY
                    && !!process.env.STRIPE_PRICE_PRO_MONTHLY
                    && !!process.env.STRIPE_PRICE_PRO_YEARLY,
  });
});

// ── POST /api/billing/checkout ────────────────────────────────────────────
// Crea una sessione Stripe Checkout per sottoscrivere il piano Pro.
// Body: { interval: 'month' | 'year' }
// Risposta: { url } da aprire (window.location o popup).
router.post('/checkout', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), async (req, res) => {
  try {
    const stripe = getStripe();
    const interval = req.body?.interval === 'year' ? 'year' : 'month';
    const price = priceIdFor(interval);
    if (!price) return res.status(500).json({ error: `STRIPE_PRICE_PRO_${interval.toUpperCase()}LY non configurato` });

    const tenant = getTenant(req.tenant);
    if (!tenant) return res.status(404).json({ error: 'Tenant non trovato' });

    // Riutilizza il Customer esistente se già creato. In modalità
    // subscription Stripe crea il customer da solo se non lo passiamo;
    // gli forniamo solo l'email per pre-compilare la form.
    // Nota: `customer_creation` NON è ammesso in mode='subscription'.
    const customerArgs = tenant.stripeCustomerId
      ? { customer: tenant.stripeCustomerId }
      : { customer_email: req.user.email || req.user.username };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      ...customerArgs,
      // Il tenant slug viene salvato nei metadata di SESSION e di SUBSCRIPTION
      // così il webhook può correlare gli eventi al tenant giusto.
      client_reference_id: tenant.slug,
      metadata: { tenant_slug: tenant.slug },
      subscription_data: { metadata: { tenant_slug: tenant.slug } },
      success_url: `${appBaseUrl()}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appBaseUrl()}/billing?checkout=cancel`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      automatic_tax: { enabled: false },
      locale: 'it',
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[billing/checkout]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/billing/portal ──────────────────────────────────────────────
// Crea una sessione Stripe Customer Portal per gestire l'abbonamento
// (cambia carta, annulla, scarica fatture, cambia piano mensile↔annuale).
router.post('/portal', requireRole('SUPERADMIN', 'OWNER', 'ADMIN'), async (req, res) => {
  try {
    const stripe = getStripe();
    const tenant = getTenant(req.tenant);
    if (!tenant) return res.status(404).json({ error: 'Tenant non trovato' });
    if (!tenant.stripeCustomerId) {
      return res.status(400).json({ error: 'Nessun customer Stripe — sottoscrivi prima un piano' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${appBaseUrl()}/billing`,
      locale: 'it',
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[billing/portal]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Webhook handler (registrato in server.js con raw body) ───────────────
// IMPORTANTE: deve ricevere il body GREZZO (Buffer) per validare la firma.
async function handleStripeWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  if (secret) {
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    } catch (err) {
      console.error('[webhook] signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else if (process.env.NODE_ENV === 'development') {
    // SOLO in sviluppo esplicito: senza secret accettiamo il body come-is.
    try { event = JSON.parse(req.body.toString('utf8')); }
    catch (e) { return res.status(400).send('Invalid JSON'); }
    console.warn('[webhook] DEV: STRIPE_WEBHOOK_SECRET assente, verifica firma DISABILITATA');
  } else {
    // Produzione senza secret: fail-closed (vedi guard d'avvio in server.js).
    console.error('[webhook] STRIPE_WEBHOOK_SECRET non configurato: webhook rifiutato');
    return res.status(500).send('Webhook non configurato');
  }

  // Idempotenza: scarta gli eventi Stripe già processati (consegna at-least-once).
  if (!markStripeEventProcessed(event.id, event.type)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantSlug = session.metadata?.tenant_slug || session.client_reference_id;
        if (!tenantSlug) {
          console.warn('[webhook] checkout.session.completed senza tenant_slug', session.id);
          break;
        }
        // La subscription è già creata: salviamo i ref e attendiamo
        // l'evento `customer.subscription.created` per dettagli completi.
        updateTenantBilling(tenantSlug, {
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          piano: 'pro',
          subscriptionStatus: 'active',
        });
        console.log(`[webhook] checkout completed for tenant=${tenantSlug} sub=${session.subscription}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const tenantSlug = sub.metadata?.tenant_slug || (await tenantFromCustomer(sub.customer));
        if (!tenantSlug) {
          console.warn('[webhook] subscription event senza tenant', sub.id);
          break;
        }
        const interval = sub.items?.data?.[0]?.price?.recurring?.interval || null;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        // Se attivo o in trialing, è "pro". Se cancellato/past_due/unpaid, restiamo "pro" ma
        // lo stato della sub guida il middleware (read-only).
        updateTenantBilling(tenantSlug, {
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          currentPeriodEnd: periodEnd,
          billingInterval: interval,
          piano: 'pro',
        });
        console.log(`[webhook] sub.${event.type.split('.').pop()} tenant=${tenantSlug} status=${sub.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const tenantSlug = sub.metadata?.tenant_slug || (await tenantFromCustomer(sub.customer));
        if (!tenantSlug) break;
        updateTenantBilling(tenantSlug, {
          subscriptionStatus: 'canceled',
          // Manteniamo piano='pro' così il middleware sa che era un cliente
          // pagante e applica lo stato "expired" (read-only su dati propri).
        });
        console.log(`[webhook] sub deleted tenant=${tenantSlug}`);
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const tenantSlug = await tenantFromCustomer(inv.customer);
        if (!tenantSlug) break;
        updateTenantBilling(tenantSlug, { subscriptionStatus: 'past_due' });
        console.log(`[webhook] payment failed tenant=${tenantSlug}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        // Solo log; lo stato verrà aggiornato dall'evento subscription.updated.
        break;
      }

      default:
        // Eventi non gestiti: log per visibilità ma non errore
        // console.log('[webhook] evento non gestito:', event.type);
        break;
    }
  } catch (e) {
    console.error('[webhook] handler error:', e.message);
    return res.status(500).send('Handler error');
  }

  res.json({ received: true });
}

async function tenantFromCustomer(customerId) {
  if (!customerId) return null;
  const t = getTenantByStripeCustomerId(customerId);
  return t?.slug || null;
}

module.exports = { router, handleStripeWebhook, ACTIVE_STATUSES };
