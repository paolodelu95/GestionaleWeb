/**
 * Endpoint amministrativi globali — accessibili solo ai SUPERADMIN.
 *
 * Forniscono dati aggregati su TUTTI i tenant del SaaS (non scoped a un
 * singolo tenant). Usati dalla pagina /admin per il monitoraggio
 * dell'attività commerciale (tenant attivi, trial in corso, MRR, ecc.).
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const {
  listTenants, listUsers, getAuthDb,
} = require('../utils/authDb');
const { openTenantDb, getCachedTenantDb } = require('../utils/tenantDb');

// Tutti gli endpoint admin richiedono SUPERADMIN
router.use(requireRole('SUPERADMIN'));

// Stima conteggi su un singolo tenant DB. Usa il DB cached se già aperto,
// altrimenti lo apre (può essere lento al primo accesso; fine per UI admin).
function tenantCounts(slug) {
  try {
    const db = openTenantDb(slug);
    const safeCount = (table) => {
      try { return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; }
      catch (_) { return 0; }
    };
    return {
      clienti:  safeCount('clienti'),
      prodotti: safeCount('prodotti'),
      fatture:  safeCount('fatture'),
      acquisti: safeCount('acquisti'),
    };
  } catch (_) {
    return { clienti: 0, prodotti: 0, fatture: 0, acquisti: 0 };
  }
}

// GET /api/admin/stats — KPI globali
router.get('/stats', (req, res) => {
  const tenants = listTenants();
  const stats = {
    totaleTenant: tenants.length,
    attivi: tenants.filter(t => t.attivo).length,
    sospesi: tenants.filter(t => !t.attivo).length,
    trial: tenants.filter(t => t.piano === 'trial').length,
    paying: tenants.filter(t => t.piano && t.piano !== 'trial').length,
    perPiano: {},
    perStato: {},
    utentiTotali: 0,
    utentiAttivi: 0,
    registratiUltimi30Giorni: 0,
    mrr: 0, // placeholder finché non c'è Stripe Subscription
  };
  for (const t of tenants) {
    stats.perPiano[t.piano || 'trial'] = (stats.perPiano[t.piano || 'trial'] || 0) + 1;
    stats.perStato[t.stato || 'attiva'] = (stats.perStato[t.stato || 'attiva'] || 0) + 1;
  }
  const allUsers = listUsers();
  stats.utentiTotali = allUsers.length;
  stats.utentiAttivi = allUsers.filter(u => u.attivo).length;
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  stats.registratiUltimi30Giorni = allUsers.filter(u => (u.created_at || '') >= since30).length;
  res.json(stats);
});

// GET /api/admin/tenants — lista tenant arricchita con conteggi
// query: ?counts=1 → include i conteggi per tenant (più lento)
router.get('/tenants', (req, res) => {
  const includeCounts = req.query.counts === '1' || req.query.counts === 'true';
  const tenants = listTenants();
  const allUsers = listUsers();
  const usersByTenant = new Map();
  for (const u of allUsers) {
    if (!usersByTenant.has(u.tenant_slug)) usersByTenant.set(u.tenant_slug, []);
    usersByTenant.get(u.tenant_slug).push(u);
  }
  const result = tenants.map(t => {
    const utenti = usersByTenant.get(t.slug) || [];
    const base = {
      ...t,
      utenti: utenti.length,
      utentiAttivi: utenti.filter(u => u.attivo).length,
      owner: utenti.find(u => u.ruolo === 'OWNER') || null,
    };
    if (includeCounts) {
      Object.assign(base, tenantCounts(t.slug));
    }
    return base;
  });
  res.json(result);
});

// GET /api/admin/tenants/:slug — dettaglio singolo tenant
router.get('/tenants/:slug', (req, res) => {
  const tenants = listTenants();
  const t = tenants.find(x => x.slug === req.params.slug);
  if (!t) return res.status(404).json({ error: 'Tenant non trovato' });
  const utenti = listUsers({ tenant: t.slug });
  res.json({
    ...t,
    utenti,
    counts: tenantCounts(t.slug),
  });
});

// GET /api/admin/recent-users — ultimi N utenti registrati (default 30, max 100)
router.get('/recent-users', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const rows = getAuthDb().prepare(
    `SELECT id, username, nome, email, ruolo, tenant_slug, attivo, email_verified, created_at
     FROM users ORDER BY created_at DESC LIMIT ?`
  ).all(limit);
  res.json(rows.map(r => ({
    ...r,
    attivo: r.attivo === 1,
    emailVerified: r.email_verified === 1,
  })));
});

module.exports = router;
