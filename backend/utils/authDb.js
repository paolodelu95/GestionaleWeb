const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.DB_PATH) return path.dirname(process.env.DB_PATH);
  return path.join(__dirname, '..');
}

function tenantsDir() {
  return path.join(dataDir(), 'tenants');
}

function authDbPath() {
  return path.join(dataDir(), 'auth.db');
}

function tenantDbPath(slug) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) {
    throw new Error(`Slug tenant non valido: ${slug}`);
  }
  return path.join(tenantsDir(), `${slug}.db`);
}

let authDbInstance = null;

function getAuthDb() {
  if (authDbInstance) return authDbInstance;
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.mkdirSync(tenantsDir(), { recursive: true });
  const db = new Database(authDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      slug       TEXT PRIMARY KEY,
      nome       TEXT NOT NULL DEFAULT '',
      attivo     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nome          TEXT DEFAULT '',
      email         TEXT DEFAULT '',
      ruolo         TEXT NOT NULL DEFAULT 'OPERATORE',
      tenant_slug   TEXT NOT NULL,
      attivo        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_slug) REFERENCES tenants(slug)
    );
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_slug);
  `);
  authDbInstance = db;
  return db;
}

function listTenants({ activeOnly = false } = {}) {
  const db = getAuthDb();
  const where = activeOnly ? 'WHERE attivo=1' : '';
  return db.prepare(`SELECT slug, nome, attivo, created_at FROM tenants ${where} ORDER BY slug`).all()
    .map(t => ({ ...t, attivo: t.attivo === 1 }));
}

function getTenant(slug) {
  const row = getAuthDb().prepare('SELECT slug, nome, attivo, created_at FROM tenants WHERE slug=?').get(slug);
  return row ? { ...row, attivo: row.attivo === 1 } : null;
}

function createTenant({ slug, nome }) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) throw new Error('Slug tenant non valido');
  getAuthDb().prepare('INSERT INTO tenants (slug, nome) VALUES (?,?)').run(slug, nome || '');
  return getTenant(slug);
}

function updateTenant(slug, { nome, attivo }) {
  const t = getTenant(slug);
  if (!t) throw new Error('Tenant non trovato');
  getAuthDb().prepare('UPDATE tenants SET nome=?, attivo=? WHERE slug=?')
    .run(nome ?? t.nome, attivo === undefined ? (t.attivo ? 1 : 0) : (attivo ? 1 : 0), slug);
  return getTenant(slug);
}

function deleteTenant(slug) {
  const db = getAuthDb();
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE tenant_slug=?').get(slug).n;
  if (userCount > 0) throw new Error('Tenant ha utenti associati');
  db.prepare('DELETE FROM tenants WHERE slug=?').run(slug);
}

function getUserByUsername(username) {
  return getAuthDb().prepare('SELECT * FROM users WHERE username=?').get(username) || null;
}

function getUserById(id) {
  return getAuthDb().prepare('SELECT * FROM users WHERE id=?').get(id) || null;
}

function listUsers({ tenant } = {}) {
  const db = getAuthDb();
  const sql = `SELECT id, username, nome, email, ruolo, tenant_slug, attivo, created_at
               FROM users ${tenant ? 'WHERE tenant_slug=?' : ''} ORDER BY username`;
  const rows = tenant ? db.prepare(sql).all(tenant) : db.prepare(sql).all();
  return rows.map(r => ({ ...r, attivo: r.attivo === 1 }));
}

function createUser({ username, password_hash, nome, email, ruolo, tenant_slug }) {
  if (!getTenant(tenant_slug)) throw new Error('Tenant inesistente');
  const r = getAuthDb().prepare(
    `INSERT INTO users (username, password_hash, nome, email, ruolo, tenant_slug)
     VALUES (?,?,?,?,?,?)`
  ).run(username, password_hash, nome || '', email || '', ruolo || 'OPERATORE', tenant_slug);
  return getUserById(r.lastInsertRowid);
}

function updateUser(id, fields) {
  const u = getUserById(id);
  if (!u) throw new Error('Utente non trovato');
  if (fields.tenant_slug && !getTenant(fields.tenant_slug)) throw new Error('Tenant inesistente');
  const next = {
    username:      fields.username      ?? u.username,
    password_hash: fields.password_hash ?? u.password_hash,
    nome:          fields.nome          ?? u.nome,
    email:         fields.email         ?? u.email,
    ruolo:         fields.ruolo         ?? u.ruolo,
    tenant_slug:   fields.tenant_slug   ?? u.tenant_slug,
    attivo:        fields.attivo === undefined ? u.attivo : (fields.attivo ? 1 : 0),
  };
  getAuthDb().prepare(
    `UPDATE users SET username=?, password_hash=?, nome=?, email=?, ruolo=?, tenant_slug=?, attivo=? WHERE id=?`
  ).run(next.username, next.password_hash, next.nome, next.email, next.ruolo, next.tenant_slug, next.attivo, id);
  return getUserById(id);
}

function deleteUser(id) {
  getAuthDb().prepare('DELETE FROM users WHERE id=?').run(id);
}

function countUsers() {
  return getAuthDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

module.exports = {
  getAuthDb,
  dataDir, tenantsDir, authDbPath, tenantDbPath,
  listTenants, getTenant, createTenant, updateTenant, deleteTenant,
  getUserByUsername, getUserById, listUsers, createUser, updateUser, deleteUser, countUsers,
};
