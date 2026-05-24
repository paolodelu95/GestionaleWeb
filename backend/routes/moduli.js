const express = require('express');
const router = express.Router();
const { listTenantModuli, setTenantModulo, listTenants } = require('../utils/authDb');

function isSuper(req)  { return req.user?.ruolo === 'SUPERADMIN'; }
function isAdmin(req)  { return req.user?.ruolo === 'ADMIN' || isSuper(req); }

// GET /api/moduli — lista moduli per il tenant corrente, con stato attivo/disattivo
router.get('/', (req, res) => {
  res.json(listTenantModuli(req.tenant));
});

// PUT /api/moduli/:slug — attiva/disattiva un modulo (ADMIN+)
router.put('/:slug', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Permessi insufficienti' });
  try {
    const m = setTenantModulo(req.tenant, req.params.slug, !!req.body?.attivo);
    res.json(m);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/moduli/admin — SUPERADMIN: lista moduli per tutti i tenant
router.get('/admin/all', (req, res) => {
  if (!isSuper(req)) return res.status(403).json({ error: 'Solo SUPERADMIN' });
  const tenants = listTenants();
  const out = tenants.map(t => ({
    tenant: t.slug,
    nome: t.nome,
    moduli: listTenantModuli(t.slug).map(m => ({ slug: m.slug, attivo: m.attivo, core: m.core })),
  }));
  res.json(out);
});

module.exports = router;
