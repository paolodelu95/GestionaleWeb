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
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      slug             TEXT PRIMARY KEY,
      nome             TEXT NOT NULL DEFAULT '',
      attivo           INTEGER NOT NULL DEFAULT 1,
      ragione_sociale  TEXT DEFAULT '',
      piva             TEXT DEFAULT '',
      piano            TEXT NOT NULL DEFAULT 'trial',
      stato            TEXT NOT NULL DEFAULT 'attiva',
      trial_scade_il   TEXT DEFAULT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      expires_at  TEXT NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ip          TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at);
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      expires_at  TEXT NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ip          TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_evt_expires ON email_verification_tokens(expires_at);
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id          TEXT PRIMARY KEY,
      type        TEXT DEFAULT '',
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Migrazioni per email_verified su users esistenti
  const userMigrations = [
    'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN email_verified_at TEXT DEFAULT NULL',
    // Epoch per la revoca delle sessioni: incrementato al cambio password.
    'ALTER TABLE users ADD COLUMN token_epoch INTEGER NOT NULL DEFAULT 0',
  ];
  for (const sql of userMigrations) { try { db.exec(sql); } catch(_) {} }
  // Migrazioni per campi commerciali sui tenant esistenti
  const tenantMigrations = [
    "ALTER TABLE tenants ADD COLUMN ragione_sociale TEXT DEFAULT ''",
    "ALTER TABLE tenants ADD COLUMN piva TEXT DEFAULT ''",
    "ALTER TABLE tenants ADD COLUMN piano TEXT NOT NULL DEFAULT 'trial'",
    "ALTER TABLE tenants ADD COLUMN stato TEXT NOT NULL DEFAULT 'attiva'",
    "ALTER TABLE tenants ADD COLUMN trial_scade_il TEXT DEFAULT NULL",
    // Subscription Stripe
    "ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT DEFAULT NULL",
    "ALTER TABLE tenants ADD COLUMN stripe_subscription_id TEXT DEFAULT NULL",
    // active | trialing | past_due | canceled | unpaid | incomplete | null
    "ALTER TABLE tenants ADD COLUMN subscription_status TEXT DEFAULT NULL",
    // ISO timestamp del termine del periodo corrente di fatturazione
    "ALTER TABLE tenants ADD COLUMN current_period_end TEXT DEFAULT NULL",
    // 'month' | 'year' | null
    "ALTER TABLE tenants ADD COLUMN billing_interval TEXT DEFAULT NULL",
  ];
  for (const sql of tenantMigrations) { try { db.exec(sql); } catch(_) {} }

  seedModuli(db);
  authDbInstance = db;
  return db;
}

// Checkpoint + chiusura di auth.db. Usato dallo shutdown graceful.
function closeAuthDb() {
  if (!authDbInstance) return;
  try {
    authDbInstance.pragma('wal_checkpoint(TRUNCATE)');
    authDbInstance.close();
  } catch (err) {
    console.error('[shutdown] errore chiusura auth.db:', err.message);
  }
  authDbInstance = null;
}

// Moduli nascosti dalla UI (impostazioni, home, ecc.) ma mantenuti nel catalogo/DB.
// Per riattivarli in futuro è sufficiente svuotare questo set.
const MODULI_NASCOSTI = new Set(['crm', 'timesheet']);

// Catalogo moduli: core = sempre attivi (non disattivabili)
const MODULI_CATALOGO = [
  // CORE — sempre attivi
  { slug: 'anagrafica',  nome: 'Anagrafica',  descrizione: 'Clienti, fornitori, prodotti',  categoria: 'Core', icona: 'contacts',        core: 1, default_attivo: 1, ordine: 1 },
  { slug: 'vendite',     nome: 'Vendite',     descrizione: 'Preventivi, ordini, documenti di trasporto, fatture, note credito', categoria: 'Core', icona: 'point_of_sale', core: 1, default_attivo: 1, ordine: 2 },
  { slug: 'acquisti',    nome: 'Acquisti',    descrizione: 'Acquisti e arrivi merce',       categoria: 'Core', icona: 'shopping_bag',    core: 1, default_attivo: 1, ordine: 3 },
  { slug: 'magazzino',   nome: 'Magazzino',   descrizione: 'Movimenti e giacenze',          categoria: 'Core', icona: 'warehouse',       core: 1, default_attivo: 1, ordine: 4 },
  { slug: 'contabilita', nome: 'Contabilità', descrizione: 'Pagamenti, scadenzario, prima nota', categoria: 'Core', icona: 'account_balance', core: 1, default_attivo: 1, ordine: 5 },

  // OPZIONALI — attivabili
  { slug: 'fatture_ricorrenti', nome: 'Fatturazione ricorrente', descrizione: 'Fatture periodiche automatiche', categoria: 'Vendite', icona: 'autorenew', core: 0, default_attivo: 1, ordine: 10 },
  { slug: 'vendita_banco',      nome: 'Vendita al banco',        descrizione: 'Cassa veloce per negozi',         categoria: 'Vendite', icona: 'point_of_sale', core: 0, default_attivo: 0, ordine: 11 },
  { slug: 'riconciliazione',    nome: 'Riconciliazione bancaria', descrizione: 'Import OFX/CSV + match scadenze', categoria: 'Contabilità', icona: 'account_balance', core: 0, default_attivo: 1, ordine: 20 },
  { slug: 'compliance',         nome: 'Compliance fiscale',       descrizione: 'LIPE, esterometro, export commercialista', categoria: 'Contabilità', icona: 'verified', core: 0, default_attivo: 1, ordine: 21 },
  // NASCOSTI (vedi MODULI_NASCOSTI): troppo complessi per il target attuale.
  // Lasciati nel catalogo per non perdere i dati; filtrati dalle liste UI. Riattivabili in futuro.
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
    .filter(m => !MODULI_NASCOSTI.has(m.slug))
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
    .filter(r => !MODULI_NASCOSTI.has(r.slug))
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

function _tenantRowToDto(t) {
  return {
    ...t,
    attivo: t.attivo === 1,
    ragioneSociale: t.ragione_sociale ?? '',
    piva: t.piva ?? '',
    piano: t.piano ?? 'trial',
    stato: t.stato ?? 'attiva',
    trialScadeIl: t.trial_scade_il ?? null,
    stripeCustomerId: t.stripe_customer_id ?? null,
    stripeSubscriptionId: t.stripe_subscription_id ?? null,
    subscriptionStatus: t.subscription_status ?? null,
    currentPeriodEnd: t.current_period_end ?? null,
    billingInterval: t.billing_interval ?? null,
  };
}

const TENANT_COLS = `
  slug, nome, attivo, ragione_sociale, piva, piano, stato, trial_scade_il, created_at,
  stripe_customer_id, stripe_subscription_id, subscription_status,
  current_period_end, billing_interval
`;

function listTenants({ activeOnly = false } = {}) {
  const db = getAuthDb();
  const where = activeOnly ? 'WHERE attivo=1 AND stato=\'attiva\'' : '';
  return db.prepare(
    `SELECT ${TENANT_COLS} FROM tenants ${where} ORDER BY slug`
  ).all().map(_tenantRowToDto);
}

function getTenant(slug) {
  const row = getAuthDb().prepare(
    `SELECT ${TENANT_COLS} FROM tenants WHERE slug=?`
  ).get(slug);
  return row ? _tenantRowToDto(row) : null;
}

function getTenantByStripeCustomerId(customerId) {
  const row = getAuthDb().prepare(
    `SELECT ${TENANT_COLS} FROM tenants WHERE stripe_customer_id=?`
  ).get(customerId);
  return row ? _tenantRowToDto(row) : null;
}

function updateTenantBilling(slug, fields) {
  // Aggiornamento "patch" dei soli campi billing forniti. Usato dal webhook
  // Stripe per propagare lo stato della subscription verso il nostro DB.
  const allowed = {
    stripe_customer_id: fields.stripeCustomerId,
    stripe_subscription_id: fields.stripeSubscriptionId,
    subscription_status: fields.subscriptionStatus,
    current_period_end: fields.currentPeriodEnd,
    billing_interval: fields.billingInterval,
    piano: fields.piano,
  };
  const sets = [];
  const vals = [];
  for (const [col, val] of Object.entries(allowed)) {
    if (val === undefined) continue;
    sets.push(`${col}=?`);
    vals.push(val);
  }
  if (!sets.length) return getTenant(slug);
  vals.push(slug);
  getAuthDb().prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE slug=?`).run(...vals);
  return getTenant(slug);
}

function createTenant({ slug, nome, ragioneSociale, piva, piano, stato, trialScadeIl }) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) throw new Error('Slug tenant non valido');
  const trialExp = trialScadeIl ?? new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10);
  getAuthDb().prepare(
    `INSERT INTO tenants (slug, nome, ragione_sociale, piva, piano, stato, trial_scade_il)
     VALUES (?,?,?,?,?,?,?)`
  ).run(slug, nome || ragioneSociale || slug, ragioneSociale || '', piva || '',
        piano || 'trial', stato || 'attiva', trialExp);
  ensureTenantModuli(slug);
  return getTenant(slug);
}

function updateTenant(slug, { nome, attivo, ragioneSociale, piva, piano, stato, trialScadeIl }) {
  const t = getTenant(slug);
  if (!t) throw new Error('Tenant non trovato');
  getAuthDb().prepare(
    `UPDATE tenants SET nome=?, attivo=?, ragione_sociale=?, piva=?, piano=?, stato=?, trial_scade_il=?
     WHERE slug=?`
  ).run(
    nome ?? t.nome,
    attivo === undefined ? (t.attivo ? 1 : 0) : (attivo ? 1 : 0),
    ragioneSociale ?? t.ragioneSociale,
    piva ?? t.piva,
    piano ?? t.piano,
    stato ?? t.stato,
    trialScadeIl !== undefined ? trialScadeIl : t.trialScadeIl,
    slug,
  );
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

// Incrementa il "token epoch": invalida TUTTI i token già emessi per l'utente
// (authMiddleware confronta payload.te con users.token_epoch). Chiamare SOLO ai
// punti di cambio password (reset / change), non in updateUser generico.
function bumpTokenEpoch(id) {
  getAuthDb().prepare('UPDATE users SET token_epoch = token_epoch + 1 WHERE id=?').run(id);
}

// Idempotenza webhook Stripe: registra l'event.id e ritorna true SOLO la prima
// volta (false se già processato). Stripe consegna gli eventi at-least-once.
function markStripeEventProcessed(eventId, type) {
  if (!eventId) return true;
  const r = getAuthDb().prepare(
    'INSERT OR IGNORE INTO stripe_webhook_events (id, type) VALUES (?, ?)'
  ).run(String(eventId), type || '');
  return r.changes === 1;
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

// ── Password reset tokens ───────────────────────────────────────────────────

function createPasswordResetToken({ userId, token, expiresAt, ip }) {
  getAuthDb().prepare(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at, ip)
     VALUES (?,?,?,?)`
  ).run(token, userId, expiresAt, ip || '');
}

function getPasswordResetToken(token) {
  const row = getAuthDb().prepare(
    `SELECT token, user_id, expires_at, used, created_at, ip
     FROM password_reset_tokens WHERE token=?`
  ).get(token);
  if (!row) return null;
  return { ...row, used: row.used === 1 };
}

function markPasswordResetTokenUsed(token) {
  getAuthDb().prepare(
    `UPDATE password_reset_tokens SET used=1 WHERE token=?`
  ).run(token);
}

function invalidateOtherResetTokens(userId, exceptToken) {
  getAuthDb().prepare(
    `UPDATE password_reset_tokens SET used=1
     WHERE user_id=? AND token!=? AND used=0`
  ).run(userId, exceptToken);
}

function countRecentResetRequests(userId, minutesWindow = 60) {
  const sinceIso = new Date(Date.now() - minutesWindow * 60000).toISOString();
  return getAuthDb().prepare(
    `SELECT COUNT(*) AS n FROM password_reset_tokens
     WHERE user_id=? AND created_at >= ?`
  ).get(userId, sinceIso).n;
}

function purgeExpiredResetTokens() {
  getAuthDb().prepare(
    `DELETE FROM password_reset_tokens
     WHERE expires_at < datetime('now', '-7 days')`
  ).run();
}

// ── Email verification tokens ───────────────────────────────────────────────

function createEmailVerificationToken({ userId, token, expiresAt, ip }) {
  getAuthDb().prepare(
    `INSERT INTO email_verification_tokens (token, user_id, expires_at, ip)
     VALUES (?,?,?,?)`
  ).run(token, userId, expiresAt, ip || '');
}

function getEmailVerificationToken(token) {
  const row = getAuthDb().prepare(
    `SELECT token, user_id, expires_at, used, created_at, ip
     FROM email_verification_tokens WHERE token=?`
  ).get(token);
  if (!row) return null;
  return { ...row, used: row.used === 1 };
}

function markEmailVerificationTokenUsed(token) {
  getAuthDb().prepare(
    `UPDATE email_verification_tokens SET used=1 WHERE token=?`
  ).run(token);
}

function markUserEmailVerified(userId) {
  getAuthDb().prepare(
    `UPDATE users SET email_verified=1, email_verified_at=datetime('now') WHERE id=?`
  ).run(userId);
}

function invalidateOtherEmailVerificationTokens(userId, exceptToken) {
  getAuthDb().prepare(
    `UPDATE email_verification_tokens SET used=1
     WHERE user_id=? AND token!=? AND used=0`
  ).run(userId, exceptToken);
}

function countRecentEmailVerificationRequests(userId, minutesWindow = 60) {
  const sinceIso = new Date(Date.now() - minutesWindow * 60000).toISOString();
  return getAuthDb().prepare(
    `SELECT COUNT(*) AS n FROM email_verification_tokens
     WHERE user_id=? AND created_at >= ?`
  ).get(userId, sinceIso).n;
}

function purgeExpiredEmailVerificationTokens() {
  getAuthDb().prepare(
    `DELETE FROM email_verification_tokens
     WHERE expires_at < datetime('now', '-7 days')`
  ).run();
}

function findUserByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  // username e email sono salvati con maiuscole/minuscole come inserite,
  // ma per il reset cerco case-insensitive su entrambi i campi.
  return getAuthDb().prepare(
    `SELECT * FROM users
     WHERE LOWER(username)=? OR LOWER(email)=?
     LIMIT 1`
  ).get(e, e) || null;
}

module.exports = {
  getAuthDb, closeAuthDb,
  dataDir, tenantsDir, authDbPath, tenantDbPath,
  listTenants, getTenant, createTenant, updateTenant, deleteTenant,
  getTenantByStripeCustomerId, updateTenantBilling, markStripeEventProcessed,
  getUserByUsername, getUserById, listUsers, createUser, updateUser, deleteUser, countUsers, bumpTokenEpoch,
  findUserByEmail,
  listModuliCatalogo, listTenantModuli, setTenantModulo, ensureTenantModuli, isModuloAttivo,
  listGruppi, getGruppo, createGruppo, updateGruppo, deleteGruppo,
  setGruppoMembri, getUserGruppi, getGroupMatesIds,
  createPasswordResetToken, getPasswordResetToken, markPasswordResetTokenUsed,
  invalidateOtherResetTokens, countRecentResetRequests, purgeExpiredResetTokens,
  createEmailVerificationToken, getEmailVerificationToken,
  markEmailVerificationTokenUsed, markUserEmailVerified,
  invalidateOtherEmailVerificationTokens,
  countRecentEmailVerificationRequests, purgeExpiredEmailVerificationTokens,
};
