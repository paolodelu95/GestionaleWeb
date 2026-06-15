const { verify } = require('../utils/authToken');
const { runWithContext } = require('../utils/tenantContext');
const { getUserById, getTenant } = require('../utils/authDb');

// Edizione offline (desktop/Electron, single-user): niente login né multi-tenant.
// Ogni richiesta è autenticata come utente locale OWNER sul tenant "default".
const OFFLINE_MODE = process.env.OFFLINE_MODE === '1' || process.env.OFFLINE_MODE === 'true';
const LOCAL_USER = { id: 1, username: 'local', nome: 'Utente locale', email: '', ruolo: 'OWNER', tenant: 'default' };

function authMiddleware(req, res, next) {
  if (OFFLINE_MODE) {
    req.user = { ...LOCAL_USER };
    req.tenant = 'default';
    return runWithContext({ tenant: 'default', user: req.user }, () => next());
  }
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante' });
  }
  const payload = verify(header.slice(7));
  if (!payload) return res.status(401).json({ error: 'Token non valido' });

  const user = getUserById(payload.uid);
  if (!user || !user.attivo) return res.status(401).json({ error: 'Utente non attivo' });
  if (user.tenant_slug !== payload.tenant) return res.status(401).json({ error: 'Token incoerente' });

  const tenant = getTenant(user.tenant_slug);
  if (!tenant || !tenant.attivo) return res.status(403).json({ error: 'Tenant non attivo' });

  // Revoca sessioni: se la password è stata cambiata/resettata dopo l'emissione
  // del token, token_epoch diverge → il token non è più valido. Il `|| 0` mantiene
  // validi i token emessi prima dell'introduzione del campo.
  if ((payload.te || 0) !== (user.token_epoch || 0)) {
    return res.status(401).json({ error: 'Sessione non più valida, effettua di nuovo l\'accesso' });
  }

  req.user = {
    id: user.id, username: user.username, nome: user.nome,
    email: user.email, ruolo: user.ruolo, tenant: user.tenant_slug,
  };
  req.tenant = user.tenant_slug;

  runWithContext({ tenant: user.tenant_slug, user: req.user }, () => next());
}

function requireRole(...allowed) {
  const set = new Set(allowed);
  return (req, res, next) => {
    if (!req.user || !set.has(req.user.ruolo)) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    next();
  };
}

/**
 * Blocca tutte le richieste verso /api/* se il tenant ha piano='trial'
 * e la data trial_scade_il è passata.
 *
 * Eccezioni:
 *  - SUPERADMIN: accesso libero sempre (per supporto/gestione)
 *  - GET su una whitelist di endpoint che permettono all'utente di
 *    vedere il proprio account, esportare i dati, sottoscrivere un piano
 *  - Endpoint pubblici (/auth/*): già non passano da qui
 *
 * Risposta 402 Payment Required con codice TRIAL_EXPIRED che il
 * frontend intercetta per mostrare la pagina /trial-expired.
 */
const TRIAL_WHITELIST_GET = [
  '/me',
  '/azienda',                  // dati propria azienda (solo lettura)
  '/moduli',                   // catalogo moduli (per UI prezzi)
  '/tenants',                  // info propri tenant
  '/notifications/unread-count',  // count notifiche (per UI quiet)
];
// Path che iniziano con uno di questi prefissi sono sempre permessi (GET)
const TRIAL_WHITELIST_PREFIXES = ['/tenants/', '/auth/'];

function isTrialWhitelistedGet(reqPath) {
  if (TRIAL_WHITELIST_GET.includes(reqPath)) return true;
  for (const p of TRIAL_WHITELIST_PREFIXES) {
    if (reqPath.startsWith(p)) return true;
  }
  return false;
}

// Stati Stripe subscription che permettono accesso pieno.
const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing']);

// Whitelist endpoint sempre accessibili (anche in read-only) per permettere
// il path di pagamento: status billing, creazione checkout, customer portal.
const BILLING_PATHS = ['/billing/status', '/billing/checkout', '/billing/portal'];

function isBillingPath(reqPath) {
  return BILLING_PATHS.includes(reqPath);
}

function trialEnforcement(req, res, next) {
  if (OFFLINE_MODE) return next();   // niente trial/billing nell'edizione offline
  if (!req.user || !req.tenant) return next();
  if (req.user.ruolo === 'SUPERADMIN') return next();
  // Route sempre accessibili anche in read-only:
  //  - /billing/*   per rinnovare / sottoscrivere
  //  - /auth/*      per gestire l'account (verifica email, reset password,
  //                 smtp-test, ecc.) — sarebbe assurdo bloccarle
  if (req.path.startsWith('/billing/')) return next();
  if (req.path.startsWith('/auth/')) return next();

  const { getTenant } = require('../utils/authDb');
  const tenant = getTenant(req.tenant);
  if (!tenant) return next();

  // ── Tenant Pro con subscription Stripe ────────────────────────────────
  // Safety net: se piano='pro' ma il tenant non ha mai avuto uno Stripe
  // Customer (stripeCustomerId vuoto), trattalo come trial. Questo evita
  // che uno stato sporco (es. webhook handler chiamato male, test manuali)
  // blocchi un utente che non ha mai sottoscritto davvero.
  if (tenant.piano === 'pro' && tenant.stripeCustomerId) {
    if (ACTIVE_SUB_STATUSES.has(tenant.subscriptionStatus)) return next();
    // Sub non attiva (past_due/canceled/unpaid/null): read-only indefinito.
    // L'utente può leggere tutti i propri dati e portarli via via export,
    // ma non può scrivere fino al rinnovo.
    if (req.method === 'GET') return next();
    return res.status(402).json({
      error: 'Abbonamento non attivo',
      code: 'SUBSCRIPTION_INACTIVE',
      subscriptionStatus: tenant.subscriptionStatus,
      currentPeriodEnd: tenant.currentPeriodEnd,
      ragioneSociale: tenant.ragioneSociale || tenant.nome,
      message: 'L\'abbonamento Pro non è attivo. Rinnova per riprendere la modifica dei dati.',
    });
  }

  // ── Tenant trial ──────────────────────────────────────────────────────
  if (!tenant.trialScadeIl) return next();
  const now = new Date();
  const expiresAt = new Date(tenant.trialScadeIl + 'T23:59:59');
  if (expiresAt >= now) return next();

  // Trial scaduto: read-only indefinito (allineato col comportamento Pro).
  if (req.method === 'GET') return next();

  return res.status(402).json({
    error: 'Trial scaduto',
    code: 'TRIAL_EXPIRED',
    trialScadeIl: tenant.trialScadeIl,
    ragioneSociale: tenant.ragioneSociale || tenant.nome,
    message: 'Il periodo di prova è terminato. Sottoscrivi un piano per continuare a usare Ordeva.',
  });
}

module.exports = { authMiddleware, requireRole, trialEnforcement };
