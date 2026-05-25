const { verify } = require('../utils/authToken');
const { runWithContext } = require('../utils/tenantContext');
const { getUserById, getTenant } = require('../utils/authDb');

function authMiddleware(req, res, next) {
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

function trialEnforcement(req, res, next) {
  if (!req.user || !req.tenant) return next();
  if (req.user.ruolo === 'SUPERADMIN') return next();

  const { getTenant } = require('../utils/authDb');
  const tenant = getTenant(req.tenant);
  if (!tenant) return next();

  // Tenant non-trial: passa
  if (tenant.piano !== 'trial') return next();

  // Trial senza data: passa (sicurezza, no break)
  if (!tenant.trialScadeIl) return next();

  // Trial ancora valido: passa
  const now = new Date();
  const expiresAt = new Date(tenant.trialScadeIl + 'T23:59:59');
  if (expiresAt >= now) return next();

  // Trial scaduto: permetti solo GET su whitelist
  if (req.method === 'GET' && isTrialWhitelistedGet(req.path)) return next();

  return res.status(402).json({
    error: 'Trial scaduto',
    code: 'TRIAL_EXPIRED',
    trialScadeIl: tenant.trialScadeIl,
    ragioneSociale: tenant.ragioneSociale || tenant.nome,
    message: 'Il periodo di prova è terminato. Sottoscrivi un piano per continuare a usare Ordeva.',
  });
}

module.exports = { authMiddleware, requireRole, trialEnforcement };
