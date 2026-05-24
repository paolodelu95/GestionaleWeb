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
    CREATE TABLE IF NOT EXISTS moduli (
      slug             TEXT PRIMARY KEY,
      nome             TEXT NOT NULL,
      descrizione      TEXT DEFAULT '',
      categoria        TEXT DEFAULT '',
      icona            TEXT DEFAULT '',
      core             INTEGER NOT NULL DEFAULT 0,
      default_attivo   INTEGER NOT NULL DEFAULT 1,
      ordine           INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tenant_moduli (
      tenant_slug TEXT NOT NULL,
      modulo_slug TEXT NOT NULL,
      attivo      INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tenant_slug, modulo_slug),
      FOREIGN KEY (tenant_slug) REFERENCES tenants(slug) ON DELETE CASCADE,
      FOREIGN KEY (modulo_slug) REFERENCES moduli(slug)
    );
    CREATE TABLE IF NOT EXISTS gruppi (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_slug TEXT NOT NULL,
      nome        TEXT NOT NULL,
      descrizione TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_slug) REFERENCES tenants(slug) ON DELETE CASCADE,
      UNIQUE (tenant_slug, nome)
    );
    CREATE TABLE IF NOT EXISTS user_gruppi (
      user_id   INTEGER NOT NULL,
      gruppo_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, gruppo_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (gruppo_id) REFERENCES gruppi(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_gruppi_tenant ON gruppi(tenant_slug);
    CREATE INDEX IF NOT EXISTS idx_user_gruppi_user ON user_gruppi(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_gruppi_gruppo ON user_gruppi(gruppo_id);
  `);
  seedModuli(db);
  authDbInstance = db;
  return db;
}

// Catalogo moduli: core = sempre attivi (non disattivabili)
const MODULI_CATALOGO = [
  // CORE — sempre attivi
  { slug: 'anagrafica',  nome: 'Anagrafica',  descrizione: 'Clienti, fornitori, prodotti',  categoria: 'Core', icona: 'contacts',        core: 1, default_attivo: 1, ordine: 1 },
  { slug: 'vendite',     nome: 'Vendite',     descrizione: 'Preventivi, ordini, DDT, fatture, note credito', categoria: 'Core', icona: 'point_of_sale', core: 1, default_attivo: 1, ordine: 2 },
  { slug: 'acquisti',    nome: 'Acquisti',    descrizione: 'Acquisti e arrivi merce',       categoria: 'Core', icona: 'shopping_bag',    core: 1, default_attivo: 1, ordine: 3 },
  { slug: 'magazzino',   nome: 'Magazzino',   descrizione: 'Movimenti e giacenze',          categoria: 'Core', icona: 'warehouse',       core: 1, default_attivo: 1, ordine: 4 },
  { slug: 'contabilita', nome: 'Contabilità', descrizione: 'Pagamenti, scadenzario, prima nota', categoria: 'Core', icona: 'account_balance', core: 1, default_attivo: 1, ordine: 5 },

  // OPZIONALI — attivabili
  { slug: 'fatture_ricorrenti', nome: 'Fatturazione ricorrente', descrizione: 'Fatture periodiche automatiche', categoria: 'Vendite', icona: 'autorenew', core: 0, default_attivo: 1, ordine: 10 },
  { slug: 'vendita_banco',      nome: 'Vendita al banco',        descrizione: 'Cassa veloce per negozi',         categoria: 'Vendite', icona: 'point_of_sale', core: 0, default_attivo: 0, ordine: 11 },
  { slug: 'riconciliazione',    nome: 'Riconciliazione bancaria', descrizione: 'Import OFX/CSV + match scadenze', categoria: 'Contabilità', icona: 'account_balance', core: 0, default_attivo: 1, ordine: 20 },
  { slug: 'compliance',         nome: 'Compliance fiscale',       descrizione: 'LIPE, esterometro, export commercialista', categoria: 'Contabilità', icona: 'verified', core: 0, default_attivo: 1, ordine: 21 },
  { slug: 'crm',                nome: 'CRM',                      descrizione: 'Pipeline opportunità + attività', categoria: 'Operativo', icona: 'group_work', core: 0, default_attivo: 0, ordine: 30 },
  { slug: 'timesheet',          nome: 'Timesheet',                descrizione: 'Progetti e ore lavorate',         categoria: 'Operativo', icona: 'schedule', core: 0, default_attivo: 0, ordine: 31 },
  { slug: 'ecommerce',          nome: 'E-commerce',               descrizione: 'Sync WooCommerce / Shopify',      categoria: 'Operativo', icona: 'shopping_basket', core: 0, default_attivo: 0, ordine: 32 },
  { slug: 'agenda',             nome: 'Agenda',                   descrizione: 'Appuntamenti, todo list, vista calendario + ICS export', categoria: 'Operativo', icona: 'event_note', core: 0, default_attivo: 1, ordine: 33 },
];

function seedModuli(db) {
  const ins = db.prepare(`INSERT OR IGNORE INTO moduli
    (slug, nome, descrizione, categoria, icona, core, default_attivo, ordine)
    VALUES (?,?,?,?,?,?,?,?)`);
  const upd = db.prepare(`UPDATE moduli SET nome=?, descrizione=?, categoria=?, icona=?, core=?, default_attivo=?, ordine=? WHERE slug=?`);
  for (const m of MODULI_CATALOGO) {
    const existing = db.prepare('SELECT slug FROM moduli WHERE slug=?').get(m.slug);
    if (existing) {
      upd.run(m.nome, m.descrizione, m.categoria, m.icona, m.core, m.default_attivo, m.ordine, m.slug);
    } else {
      ins.run(m.slug, m.nome, m.descrizione, m.categoria, m.icona, m.core, m.default_attivo, m.ordine);
    }
  }
}

// Garantisce che per ogni tenant esistente ci sia una riga in tenant_moduli
// per ogni modulo del catalogo, con `attivo` = default_attivo (o 1 se core).
function ensureTenantModuli(tenantSlug) {
  const db = getAuthDb();
  const moduli = db.prepare('SELECT slug, core, default_attivo FROM moduli').all();
  const ins = db.prepare('INSERT OR IGNORE INTO tenant_moduli (tenant_slug, modulo_slug, attivo) VALUES (?,?,?)');
  for (const m of moduli) {
    const attivo = m.core === 1 ? 1 : m.default_attivo;
    ins.run(tenantSlug, m.slug, attivo);
  }
}

function listModuliCatalogo() {
  return getAuthDb().prepare('SELECT * FROM moduli ORDER BY ordine, nome').all()
    .map(m => ({ ...m, core: m.core === 1, defaultAttivo: m.default_attivo === 1 }));
}

function listTenantModuli(tenantSlug) {
  ensureTenantModuli(tenantSlug);
  return getAuthDb().prepare(`
    SELECT m.slug, m.nome, m.descrizione, m.categoria, m.icona, m.core, m.default_attivo,
           m.ordine, tm.attivo, tm.updated_at
    FROM moduli m
    LEFT JOIN tenant_moduli tm ON tm.modulo_slug=m.slug AND tm.tenant_slug=?
    ORDER BY m.ordine, m.nome`).all(tenantSlug)
    .map(r => ({
      slug: r.slug, nome: r.nome, descrizione: r.descrizione,
      categoria: r.categoria, icona: r.icona,
      core: r.core === 1, defaultAttivo: r.default_attivo === 1,
      attivo: (r.core === 1) || (r.attivo === 1),
      updatedAt: r.updated_at,
    }));
}

function setTenantModulo(tenantSlug, moduloSlug, attivo) {
  const db = getAuthDb();
  const m = db.prepare('SELECT slug, core FROM moduli WHERE slug=?').get(moduloSlug);
  if (!m) throw new Error('Modulo inesistente');
  if (m.core === 1 && !attivo) throw new Error('Modulo core: non disattivabile');
  ensureTenantModuli(tenantSlug);
  db.prepare(`UPDATE tenant_moduli SET attivo=?, updated_at=datetime('now')
              WHERE tenant_slug=? AND modulo_slug=?`).run(attivo ? 1 : 0, tenantSlug, moduloSlug);
  return listTenantModuli(tenantSlug).find(x => x.slug === moduloSlug);
}

function isModuloAttivo(tenantSlug, moduloSlug) {
  const db = getAuthDb();
  const m = db.prepare('SELECT core FROM moduli WHERE slug=?').get(moduloSlug);
  if (!m) return false;
  if (m.core === 1) return true;
  const tm = db.prepare('SELECT attivo FROM tenant_moduli WHERE tenant_slug=? AND modulo_slug=?')
    .get(tenantSlug, moduloSlug);
  return tm ? tm.attivo === 1 : false;
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
  ensureTenantModuli(slug);
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

// ── Gruppi (per tenant) ─────────────────────────────────────────────────────
function listGruppi(tenantSlug) {
  return getAuthDb().prepare(`
    SELECT g.id, g.nome, g.descrizione, g.created_at,
           (SELECT COUNT(*) FROM user_gruppi WHERE gruppo_id=g.id) AS num_membri
    FROM gruppi g WHERE g.tenant_slug=? ORDER BY g.nome
  `).all(tenantSlug);
}

function getGruppo(tenantSlug, id) {
  const row = getAuthDb().prepare('SELECT * FROM gruppi WHERE id=? AND tenant_slug=?').get(id, tenantSlug);
  if (!row) return null;
  const membri = getAuthDb().prepare(`
    SELECT u.id, u.username, u.nome, u.email, u.ruolo, u.attivo
    FROM user_gruppi ug JOIN users u ON u.id=ug.user_id
    WHERE ug.gruppo_id=? ORDER BY u.username
  `).all(id);
  return { ...row, membri };
}

function createGruppo({ tenantSlug, nome, descrizione }) {
  if (!nome || !nome.trim()) throw new Error('Nome gruppo obbligatorio');
  const r = getAuthDb().prepare('INSERT INTO gruppi (tenant_slug, nome, descrizione) VALUES (?,?,?)')
    .run(tenantSlug, nome.trim(), descrizione || '');
  return getGruppo(tenantSlug, r.lastInsertRowid);
}

function updateGruppo(tenantSlug, id, { nome, descrizione }) {
  const g = getGruppo(tenantSlug, id);
  if (!g) throw new Error('Gruppo non trovato');
  getAuthDb().prepare('UPDATE gruppi SET nome=?, descrizione=? WHERE id=?')
    .run(nome ?? g.nome, descrizione ?? g.descrizione, id);
  return getGruppo(tenantSlug, id);
}

function deleteGruppo(tenantSlug, id) {
  const g = getGruppo(tenantSlug, id);
  if (!g) return;
  getAuthDb().prepare('DELETE FROM gruppi WHERE id=?').run(id);
}

function setGruppoMembri(tenantSlug, gruppoId, userIds) {
  const db = getAuthDb();
  const g = getGruppo(tenantSlug, gruppoId);
  if (!g) throw new Error('Gruppo non trovato');
  // Verifica che tutti gli userIds appartengano al tenant
  const valid = db.prepare(`SELECT id FROM users WHERE tenant_slug=? AND id IN (${userIds.length ? userIds.map(() => '?').join(',') : 'NULL'})`)
    .all(tenantSlug, ...userIds).map(r => r.id);
  db.transaction(() => {
    db.prepare('DELETE FROM user_gruppi WHERE gruppo_id=?').run(gruppoId);
    const ins = db.prepare('INSERT OR IGNORE INTO user_gruppi (user_id, gruppo_id) VALUES (?,?)');
    for (const uid of valid) ins.run(uid, gruppoId);
  })();
  return getGruppo(tenantSlug, gruppoId);
}

function getUserGruppi(userId) {
  return getAuthDb().prepare(`
    SELECT g.id, g.nome FROM user_gruppi ug
    JOIN gruppi g ON g.id=ug.gruppo_id
    WHERE ug.user_id=?
    ORDER BY g.nome
  `).all(userId);
}

/** ID dei colleghi del gruppo (inclusi i propri). Usato per filtrare appuntamenti condivisi. */
function getGroupMatesIds(userId) {
  const rows = getAuthDb().prepare(`
    SELECT DISTINCT ug2.user_id
    FROM user_gruppi ug1
    JOIN user_gruppi ug2 ON ug1.gruppo_id = ug2.gruppo_id
    WHERE ug1.user_id = ?
  `).all(userId);
  const ids = new Set([userId, ...rows.map(r => r.user_id)]);
  return [...ids];
}

module.exports = {
  getAuthDb,
  dataDir, tenantsDir, authDbPath, tenantDbPath,
  listTenants, getTenant, createTenant, updateTenant, deleteTenant,
  getUserByUsername, getUserById, listUsers, createUser, updateUser, deleteUser, countUsers,
  listModuliCatalogo, listTenantModuli, setTenantModulo, ensureTenantModuli, isModuloAttivo,
  listGruppi, getGruppo, createGruppo, updateGruppo, deleteGruppo,
  setGruppoMembri, getUserGruppi, getGroupMatesIds,
};
