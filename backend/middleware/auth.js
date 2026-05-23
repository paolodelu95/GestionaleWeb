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

module.exports = { authMiddleware, requireRole };
