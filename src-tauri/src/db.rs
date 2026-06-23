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
    /// Percorso del file di config (`ordeva.json`) per persistere la cartella dati scelta.
    pub config_path: PathBuf,
    auth: Arc<Mutex<Connection>>,
    tenants: Arc<Mutex<HashMap<String, Arc<Mutex<Connection>>>>>,
    /// Chiave AES-256 dei backup, derivata dalla password d'accesso (scrypt) e
    /// tenuta SOLO in memoria (parità con utils/appSession.js). None = bloccata.
    pub backup_key: Arc<Mutex<Option<[u8; 32]>>>,
    /// Sessione rilevata su un ALTRO computer all'avvio (avviso uso Dropbox). None = ok.
    pub other_session: Arc<Mutex<Option<crate::lock::LockInfo>>>,
    /// Istante d'avvio di questa sessione (per il campo started_at del lock).
    started_at: i64,
}

impl AppState {
    /// Inizializza cartelle, apre auth.db, applica gli schemi e fa il bootstrap
    /// del tenant/utente offline. Idempotente.
    pub fn init(data_dir: PathBuf, config_path: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(data_dir.join("tenants"))
            .with_context(|| format!("creazione cartella dati {:?}", data_dir))?;

        // Lock di sessione: rileva una sessione viva su un altro computer (Dropbox) PRIMA
        // di sovrascrivere il lock con il nostro.
        let other_session = crate::lock::read(&data_dir).filter(crate::lock::is_conflict);
        let started_at = crate::lock::current_time();
        crate::lock::write(&data_dir, &crate::lock::self_info(started_at));

        let auth_conn = open_db(&data_dir.join("auth.db"))?;
        auth_conn
            .execute_batch(AUTH_SCHEMA)
            .context("init schema auth.db")?;
        // Auto-migrazione: aggiunge le colonne dello schema mancanti in DB vecchi.
        crate::migrate::add_missing_columns(&auth_conn, AUTH_SCHEMA);

        let state = AppState {
            data_dir,
            config_path,
            auth: Arc::new(Mutex::new(auth_conn)),
            tenants: Arc::new(Mutex::new(HashMap::new())),
            backup_key: Arc::new(Mutex::new(None)),
            other_session: Arc::new(Mutex::new(other_session)),
            started_at,
        };

        state.bootstrap_offline()?;
        // Materializza subito il tenant default (apre + applica schema tenant).
        let _ = state.tenant_conn(DEFAULT_TENANT)?;
        Ok(state)
    }

    /// Checkpoint WAL (TRUNCATE) su tutte le connessioni: integra il `-wal` nel file
    /// `.db` principale e lo azzera. Così, sotto cloud-sync (Dropbox), si sincronizza un
    /// singolo file consistente invece di `.db` + `-wal` disallineati.
    pub fn flush(&self) {
        if let Ok(c) = self.auth.lock() {
            let _ = c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        if let Ok(cache) = self.tenants.lock() {
            for conn in cache.values() {
                if let Ok(c) = conn.lock() {
                    let _ = c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
                }
            }
        }
    }

    /// Rilascia il lock di sessione (uscita pulita).
    pub fn release_lock(&self) {
        crate::lock::remove(&self.data_dir);
    }

    /// Avvia il thread di heartbeat: aggiorna `ordeva.lock` ogni 30s finché l'app vive.
    pub fn spawn_heartbeat(&self) {
        let data_dir = self.data_dir.clone();
        let started_at = self.started_at;
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(30));
            crate::lock::write(&data_dir, &crate::lock::self_info(started_at));
        });
    }

    /// Sposta i dati nella nuova cartella (es. dentro Dropbox) e persiste la scelta in
    /// config. Fa prima un checkpoint per copiare uno stato consistente. NON applica il
    /// cambio in-place: serve un riavvio dell'app (gestito dal frontend).
    pub fn set_data_dir(&self, new_dir: &Path) -> Result<()> {
        if new_dir == self.data_dir {
            return Ok(());
        }
        if new_dir.starts_with(&self.data_dir) {
            anyhow::bail!("la nuova cartella non può essere dentro quella attuale");
        }
        self.flush();
        crate::config::copy_dir_all(&self.data_dir, new_dir)
            .with_context(|| format!("copia dati in {:?}", new_dir))?;
        crate::config::write_readme(new_dir);
        crate::config::save_data_dir(&self.config_path, Some(new_dir))?;
        Ok(())
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

    /// Percorso del file DB di un tenant (parità con tenantDbPath()).
    pub fn tenant_db_path(&self, slug: &str) -> PathBuf {
        self.data_dir.join("tenants").join(format!("{slug}.db"))
    }

    /// Rimuove dalla cache la connessione del tenant (la chiude se è l'ultimo
    /// riferimento). Serve prima di sovrascrivere il file in un ripristino.
    pub fn evict_tenant(&self, slug: &str) {
        self.tenants.lock().unwrap().remove(slug);
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
        // Auto-migrazione: aggiunge le colonne dello schema mancanti in DB vecchi.
        crate::migrate::add_missing_columns(&conn, TENANT_SCHEMA);
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
