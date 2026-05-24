const express = require('express');
const router = express.Router();
const {
  listGruppi, getGruppo, createGruppo, updateGruppo, deleteGruppo,
  setGruppoMembri, getUserGruppi,
} = require('../utils/authDb');

function isAdmin(req) {
  return req.user?.ruolo === 'SUPERADMIN' || req.user?.ruolo === 'ADMIN';
}
function adminOnly(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Solo ADMIN o SUPERADMIN' });
  next();
}

// Lista gruppi del tenant corrente
router.get('/', (req, res) => {
  res.json(listGruppi(req.tenant));
});

// Dettaglio gruppo (con membri)
router.get('/:id', (req, res) => {
  const g = getGruppo(req.tenant, parseInt(req.params.id));
  if (!g) return res.status(404).json({ error: 'Gruppo non trovato' });
  res.json(g);
});

// I miei gruppi (qualunque utente)
router.get('/me/mine', (req, res) => {
  res.json(getUserGruppi(req.user.id));
});

router.post('/', adminOnly, (req, res) => {
  try {
    res.json(createGruppo({ tenantSlug: req.tenant, ...req.body }));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'Nome gruppo già usato' });
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', adminOnly, (req, res) => {
  try {
    res.json(updateGruppo(req.tenant, parseInt(req.params.id), req.body));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', adminOnly, (req, res) => {
  deleteGruppo(req.tenant, parseInt(req.params.id));
  res.json({ success: true });
});

// PUT /:id/membri  body: { userIds: [int] }
router.put('/:id/membri', adminOnly, (req, res) => {
  try {
    const ids = Array.isArray(req.body?.userIds) ? req.body.userIds.map(Number).filter(Boolean) : [];
    res.json(setGruppoMembri(req.tenant, parseInt(req.params.id), ids));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
