const express = require('express');
const router = express.Router();
const {
  listTenants, getTenant, createTenant, updateTenant, deleteTenant,
} = require('../utils/authDb');
const { openTenantDb } = require('../utils/tenantDb');
const { requireRole } = require('../middleware/auth');

function isSuper(req) { return req.user?.ruolo === 'SUPERADMIN'; }

// Lista: SUPERADMIN vede tutti, altri vedono solo il proprio
router.get('/', (req, res) => {
  if (isSuper(req)) return res.json(listTenants());
  const t = getTenant(req.user.tenant);
  res.json(t ? [t] : []);
});

router.get('/:slug', (req, res) => {
  if (!isSuper(req) && req.params.slug !== req.user.tenant) {
    return res.status(403).json({ error: 'Accesso negato' });
  }
  const t = getTenant(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Tenant non trovato' });
  res.json(t);
});

// Solo SUPERADMIN può creare/modificare/eliminare tenant
router.post('/', requireRole('SUPERADMIN'), (req, res) => {
  const { slug, nome } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug obbligatorio' });
  try {
    const t = createTenant({ slug, nome });
    // Crea fisicamente il DB del tenant (con schema) subito
    openTenantDb(slug);
    res.json(t);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Slug già usato' });
    res.status(400).json({ error: e.message });
  }
});

router.put('/:slug', requireRole('SUPERADMIN'), (req, res) => {
  try {
    const t = updateTenant(req.params.slug, req.body || {});
    res.json(t);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:slug', requireRole('SUPERADMIN'), (req, res) => {
  try {
    deleteTenant(req.params.slug);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
