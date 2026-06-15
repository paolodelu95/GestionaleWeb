const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');   // puro JS: nessuna compilazione nativa (edizione offline/Electron)
const {
  listUsers, createUser, updateUser, deleteUser,
  getUserById, getTenant,
} = require('../utils/authDb');

const SALT = 10;

function isSuper(req)  { return req.user?.ruolo === 'SUPERADMIN'; }
function isOwner(req)  { return req.user?.ruolo === 'OWNER' || isSuper(req); }
function isAdmin(req)  { return ['ADMIN', 'OWNER', 'SUPERADMIN'].includes(req.user?.ruolo); }

function toDto(u) {
  return {
    id: u.id, username: u.username, nome: u.nome, email: u.email,
    ruolo: u.ruolo, tenant: u.tenant_slug, attivo: !!u.attivo,
  };
}

// ── Lista utenti (admin tenant, o SUPERADMIN su tutti) ────────────────────────
router.get('/', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Permessi insufficienti' });
  const rows = isSuper(req) ? listUsers() : listUsers({ tenant: req.user.tenant });
  res.json(rows.map(toDto));
});

router.post('/', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Permessi insufficienti' });
  const { username, password, nome, email, ruolo, tenant } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username e password obbligatori' });

  // Solo SUPERADMIN può assegnare tenant diversi dal proprio o creare SUPERADMIN
  const targetTenant = isSuper(req) ? (tenant || req.user.tenant) : req.user.tenant;
  if (!getTenant(targetTenant)) return res.status(400).json({ error: 'Tenant inesistente' });
  const targetRuolo = (ruolo === 'SUPERADMIN' && !isSuper(req)) ? 'OPERATORE' : (ruolo || 'OPERATORE');

  try {
    const hash = await bcrypt.hash(password, SALT);
    const u = createUser({
      username, password_hash: hash, nome, email,
      ruolo: targetRuolo, tenant_slug: targetTenant,
    });
    res.json(toDto(u));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username già in uso' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Permessi insufficienti' });
  const id = parseInt(req.params.id);
  const existing = getUserById(id);
  if (!existing) return res.status(404).json({ error: 'Utente non trovato' });

  // Admin non-SUPER può modificare solo utenti del proprio tenant
  if (!isSuper(req) && existing.tenant_slug !== req.user.tenant) {
    return res.status(403).json({ error: 'Utente non appartiene al tuo tenant' });
  }

  const { username, password, nome, email, ruolo, tenant, attivo } = req.body || {};
  const fields = { username, nome, email, attivo };
  if (password) fields.password_hash = await bcrypt.hash(password, SALT);

  if (ruolo !== undefined) {
    // Solo SUPERADMIN può elevare a SUPERADMIN o declassare un SUPERADMIN
    if (!isSuper(req) && ruolo === 'SUPERADMIN') {
      fields.ruolo = existing.ruolo;
    } else if (!isSuper(req) && existing.ruolo === 'SUPERADMIN' && ruolo !== 'SUPERADMIN') {
      return res.status(403).json({ error: 'Solo SUPERADMIN può declassare un SUPERADMIN' });
    } else if (!isSuper(req) && !isOwner(req) && ruolo === 'OWNER') {
      // Solo OWNER o SUPERADMIN possono assegnare il ruolo OWNER
      fields.ruolo = existing.ruolo;
    } else {
      fields.ruolo = ruolo;
    }
  }
  // Impedisce a un admin (non-super) di disattivare un SUPERADMIN
  if (attivo !== undefined && existing.ruolo === 'SUPERADMIN' && !attivo && !isSuper(req)) {
    return res.status(403).json({ error: 'Solo SUPERADMIN può disattivare un SUPERADMIN' });
  }
  if (tenant !== undefined) {
    if (!isSuper(req) && tenant !== existing.tenant_slug) {
      return res.status(403).json({ error: 'Solo SUPERADMIN può cambiare tenant' });
    }
    fields.tenant_slug = tenant;
  }

  try {
    const u = updateUser(id, fields);
    res.json(toDto(u));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username già in uso' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Permessi insufficienti' });
  const id = parseInt(req.params.id);
  const target = getUserById(id);
  if (!target) return res.status(404).json({ error: 'Utente non trovato' });
  if (!isSuper(req) && target.tenant_slug !== req.user.tenant) {
    return res.status(403).json({ error: 'Utente non appartiene al tuo tenant' });
  }
  if (target.id === req.user.id) return res.status(400).json({ error: 'Non puoi eliminare te stesso' });

  // Impedisce di rimuovere l'ultimo SUPERADMIN globale
  if (target.ruolo === 'SUPERADMIN') {
    const others = listUsers().filter(u => u.ruolo === 'SUPERADMIN' && u.id !== target.id && u.attivo);
    if (others.length === 0) return res.status(400).json({ error: 'Non puoi eliminare l\'unico SUPERADMIN attivo' });
  }
  deleteUser(id);
  res.json({ success: true });
});

module.exports = router;
