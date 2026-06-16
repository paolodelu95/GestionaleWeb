//! Gestione connessioni SQLite (parità con utils/tenantDb.js + utils/authDb.js).
//!
//! Modello multi-tenant: un auth.db globale + un file tenants/<slug>.db per tenant.
//! In edizione offline esiste un solo tenant ("default") e un solo utente ("local").
//! Lo schema è quello canonico estratto dal backend Node (src/schema/*.sql), reso
//! idempotente con IF NOT EXISTS: il Rust apre gli STESSI file dati del backend Node,
//! quindi i database e i backup esistenti restano validi senza migrazioni.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use rusqlite::Connection;

/// Tenant unico in edizione offline.
pub const DEFAULT_TENANT: &str = "default";

const AUTH_SCHEMA: &str = include_str!("schema/auth.sql");
const TENANT_SCHEMA: &str = include_str!("schema/tenant.sql");
/// Dati preset (aliquote IVA, unità, tipi pagamento, conti, causali, crm stage,
/// magazzino e azienda di default) applicati solo su tenant nuovo.
const TENANT_SEED: &str = include_str!("schema/seed.sql");

/// Stato condiviso dell'app: cartella dati + connessioni cache.
#[derive(Clone)]
pub struct AppState {
    pub data_dir: PathBuf,
    auth: Arc<Mutex<Connection>>,
    tenants: Arc<Mutex<HashMap<String, Arc<Mutex<Connection>>>>>,
}

impl AppState {
    /// Inizializza cartelle, apre auth.db, applica gli schemi e fa il bootstrap
    /// del tenant/utente offline. Idempotente.
    pub fn init(data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(data_dir.join("tenants"))
            .with_context(|| format!("creazione cartella dati {:?}", data_dir))?;

        let auth_conn = open_db(&data_dir.join("auth.db"))?;
        auth_conn
            .execute_batch(AUTH_SCHEMA)
            .context("init schema auth.db")?;

        let state = AppState {
            data_dir,
            auth: Arc::new(Mutex::new(auth_conn)),
            tenants: Arc::new(Mutex::new(HashMap::new())),
        };

        state.bootstrap_offline()?;
        // Materializza subito il tenant default (apre + applica schema tenant).
        let _ = state.tenant_conn(DEFAULT_TENANT)?;
        Ok(state)
    }

    /// Crea (se assenti) il tenant "default" e l'utente "local" OWNER, come fa
    /// il bootstrap di server.js in OFFLINE_MODE.
    fn bootstrap_offline(&self) -> Result<()> {
        let auth = self.auth.lock().unwrap();
        auth.execute(
            "INSERT OR IGNORE INTO tenants (slug, nome, attivo, stato, piano) \
             VALUES (?1, 'Default', 1, 'attiva', 'pro')",
            [DEFAULT_TENANT],
        )?;
        auth.execute(
            "INSERT OR IGNORE INTO users (username, password_hash, nome, ruolo, tenant_slug, attivo) \
             VALUES ('local', 'offline', 'Utente locale', 'OWNER', ?1, 1)",
            [DEFAULT_TENANT],
        )?;
        // Catalogo moduli + righe tenant_moduli per il tenant default (come seedModuli +
        // ensureTenantModuli del bootstrap Node).
        crate::moduli::seed_catalog(&auth)?;
        crate::moduli::ensure_tenant_moduli(&auth, DEFAULT_TENANT)?;
        Ok(())
    }

    /// Esegue una closure con la connessione auth.db.
    pub fn with_auth<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let conn = self.auth.lock().unwrap();
        f(&conn)
    }

    /// Restituisce la connessione (cache) per un tenant, aprendola e applicando
    /// lo schema al primo accesso. Valida lo slug come fa openTenantDb().
    pub fn tenant_conn(&self, slug: &str) -> Result<Arc<Mutex<Connection>>> {
        if !valid_slug(slug) {
            anyhow::bail!("slug tenant non valido: {slug}");
        }
        let mut cache = self.tenants.lock().unwrap();
        if let Some(conn) = cache.get(slug) {
            return Ok(conn.clone());
        }
        let path = self.data_dir.join("tenants").join(format!("{slug}.db"));
        let conn = open_db(&path)?;
        conn.execute_batch(TENANT_SCHEMA)
            .with_context(|| format!("init schema tenant {slug}"))?;
        // Seed solo su DB fresco (azienda vuota), come il bootstrap di server.js.
        let already_seeded: i64 =
            conn.query_row("SELECT COUNT(*) FROM azienda", [], |r| r.get(0))?;
        if already_seeded == 0 {
            conn.execute_batch(TENANT_SEED)
                .with_context(|| format!("seed tenant {slug}"))?;
        }
        let conn = Arc::new(Mutex::new(conn));
        cache.insert(slug.to_string(), conn.clone());
        Ok(conn)
    }

    /// Esegue una closure con la connessione del tenant indicato.
    pub fn with_tenant<T>(
        &self,
        slug: &str,
        f: impl FnOnce(&Connection) -> Result<T>,
    ) -> Result<T> {
        let conn = self.tenant_conn(slug)?;
        let conn = conn.lock().unwrap();
        f(&conn)
    }
}

/// Apre una connessione SQLite con le stesse PRAGMA del backend Node.
fn open_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)
        .with_context(|| format!("apertura db {:?}", path))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         PRAGMA synchronous = NORMAL;",
    )?;
    Ok(conn)
}

/// Stessa regex di openTenantDb(): /^[a-z0-9][a-z0-9_-]{0,63}$/i
fn valid_slug(slug: &str) -> bool {
    let bytes = slug.as_bytes();
    if bytes.is_empty() || bytes.len() > 64 {
        return false;
    }
    let is_alnum = |c: u8| c.is_ascii_alphanumeric();
    if !is_alnum(bytes[0]) {
        return false;
    }
    bytes
        .iter()
        .all(|&c| is_alnum(c) || c == b'_' || c == b'-')
}
