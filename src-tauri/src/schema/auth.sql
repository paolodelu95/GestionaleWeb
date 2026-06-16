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
    , stripe_customer_id TEXT DEFAULT NULL, stripe_subscription_id TEXT DEFAULT NULL, subscription_status TEXT DEFAULT NULL, current_period_end TEXT DEFAULT NULL, billing_interval TEXT DEFAULT NULL);
CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nome          TEXT DEFAULT '',
      email         TEXT DEFAULT '',
      ruolo         TEXT NOT NULL DEFAULT 'OPERATORE',
      tenant_slug   TEXT NOT NULL,
      attivo        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')), email_verified INTEGER NOT NULL DEFAULT 0, email_verified_at TEXT DEFAULT NULL, token_epoch INTEGER NOT NULL DEFAULT 0,
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
