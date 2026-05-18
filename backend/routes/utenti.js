const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database');

const SALT = 10;

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, username, nome, email, ruolo, attivo FROM utenti ORDER BY nome').all();
  res.json(rows.map(r => ({ ...r, attivo: r.attivo === 1 })));
});

router.post('/', async (req, res) => {
  const { username, password, nome, email, ruolo } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username e password obbligatori' });
  try {
    const hash = await bcrypt.hash(password, SALT);
    const result = db.prepare(
      `INSERT INTO utenti (username, password_hash, nome, email, ruolo) VALUES (?,?,?,?,?)`
    ).run(username, hash, nome || '', email || '', ruolo || 'OPERATORE');
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username già in uso' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  const { username, password, nome, email, ruolo, attivo } = req.body;
  const existing = db.prepare('SELECT * FROM utenti WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Utente non trovato' });
  let hash = existing.password_hash;
  if (password) hash = await bcrypt.hash(password, SALT);
  db.prepare(`UPDATE utenti SET username=?, password_hash=?, nome=?, email=?, ruolo=?, attivo=? WHERE id=?`)
    .run(username || existing.username, hash, nome ?? existing.nome, email ?? existing.email,
         ruolo || existing.ruolo, attivo !== undefined ? (attivo ? 1 : 0) : existing.attivo, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM utenti WHERE attivo=1').get();
  const user = db.prepare('SELECT ruolo FROM utenti WHERE id=?').get(req.params.id);
  if (user?.ruolo === 'ADMIN' && count.n <= 1)
    return res.status(400).json({ error: 'Non puoi eliminare l\'unico amministratore attivo' });
  db.prepare('DELETE FROM utenti WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Login multi-utente ────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM utenti WHERE username=? AND attivo=1').get(username);
  if (!user) return res.status(401).json({ error: 'Credenziali non valide' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });
  const crypto = require('crypto');
  const AUTH_SECRET = process.env.AUTH_SECRET || 'invoxa-jwt-secret-changeme';
  const token = crypto.createHmac('sha256', AUTH_SECRET)
    .update(`${user.id}:${user.username}:${user.ruolo}`).digest('hex');
  res.json({ token, user: { id: user.id, username: user.username, nome: user.nome, ruolo: user.ruolo } });
});

module.exports = router;
