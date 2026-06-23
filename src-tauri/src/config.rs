//! Risoluzione e persistenza della cartella dati.
//!
//! Obiettivo: i dati non vivono più in una cartella nascosta di sistema, ma in una
//! posizione **visibile e spostabile** (di default `Documenti/Ordeva`), così l'utente può
//! anche tenerla dentro Dropbox e usarla — un PC alla volta — da più computer.
//!
//! Priorità di risoluzione:
//!   1. variabile d'ambiente `DATA_DIR` (sviluppo/test);
//!   2. file di config persistente `app_config_dir()/ordeva.json` (`{ "data_dir": "…" }`);
//!   3. default visibile `document_dir()/Ordeva`.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

/// Contenuto di `ordeva.json`.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct OrdevaConfig {
    /// Cartella dati scelta dall'utente. `None` → si usa il default visibile.
    #[serde(default)]
    pub data_dir: Option<String>,
}

/// Percorso del file di config (in `app_config_dir`, che NON cambia spostando i dati).
pub fn config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let dir = app.path().app_config_dir().context("app_config_dir")?;
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("ordeva.json"))
}

/// Legge la config; ritorna default se assente o illeggibile.
pub fn load<R: Runtime>(app: &AppHandle<R>) -> OrdevaConfig {
    let Ok(path) = config_path(app) else {
        return OrdevaConfig::default();
    };
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Scrive in config la cartella dati scelta (`None` per tornare al default).
pub fn save_data_dir(path: &Path, data_dir: Option<&Path>) -> Result<()> {
    let cfg = OrdevaConfig {
        data_dir: data_dir.map(|p| p.to_string_lossy().into_owned()),
    };
    let json = serde_json::to_string_pretty(&cfg)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(path, json).with_context(|| format!("scrittura config {:?}", path))?;
    Ok(())
}

/// Cartella dati di default, visibile: `Documenti/Ordeva`.
pub fn default_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let docs = app.path().document_dir().context("document_dir")?;
    Ok(docs.join("Ordeva"))
}

/// Vecchia cartella dati nascosta usata fino alla v1.2.x (`app_data_dir/data`), da cui
/// migrare i dati esistenti al primo avvio della nuova versione.
pub fn legacy_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let base = app.path().app_data_dir().context("app_data_dir")?;
    Ok(base.join("data"))
}

/// Risolve la cartella dati secondo la priorità documentata in testa al modulo.
pub fn resolve_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    if let Ok(p) = std::env::var("DATA_DIR") {
        if !p.is_empty() {
            return Ok(PathBuf::from(p));
        }
    }
    if let Some(d) = load(app).data_dir {
        if !d.is_empty() {
            return Ok(PathBuf::from(d));
        }
    }
    default_data_dir(app)
}

/// True se la cartella contiene già un database Ordeva (`auth.db`).
pub fn has_data(dir: &Path) -> bool {
    dir.join("auth.db").is_file()
}

/// Migrazione one-time: se la cartella `target` è priva di dati e la vecchia cartella
/// nascosta ne contiene, copia (non sposta) tutto in `target`. La vecchia cartella resta
/// come copia di sicurezza. Idempotente: a dati già presenti non fa nulla.
pub fn migrate_legacy_if_needed<R: Runtime>(app: &AppHandle<R>, target: &Path) -> Result<()> {
    if has_data(target) {
        return Ok(());
    }
    let legacy = match legacy_data_dir(app) {
        Ok(p) => p,
        Err(_) => return Ok(()),
    };
    if !has_data(&legacy) || legacy == target {
        return Ok(());
    }
    tracing::info!("migrazione dati da {:?} a {:?}", legacy, target);
    copy_dir_all(&legacy, target)
        .with_context(|| format!("copia dati {:?} -> {:?}", legacy, target))?;
    Ok(())
}

/// Copia ricorsiva di una cartella (file e sottocartelle). Salta i file sidecar di SQLite
/// (`-wal`, `-shm`) per copiare uno stato consistente: i dati del WAL vanno comunque
/// integrati nel `.db` principale dal checkpoint prima della copia.
pub fn copy_dir_all(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let name = entry.file_name();
        let to = dst.join(&name);
        if entry.file_type()?.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            let n = name.to_string_lossy();
            if n.ends_with("-wal") || n.ends_with("-shm") {
                continue;
            }
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Testo del file `LEGGIMI.txt` lasciato nella cartella dati per renderla comprensibile.
pub const LEGGIMI: &str = "\
Cartella dati di Ordeva
=======================

Qui dentro c'è tutto il tuo gestionale. Puoi spostare questa cartella dove vuoi
(anche dentro Dropbox/OneDrive/iCloud) e poi indicarne la nuova posizione da
Ordeva: Impostazioni > Dati e sincronizzazione.

Contenuto:
- auth.db            utenti e configurazione di accesso
- tenants/           i dati veri e propri (clienti, fatture, magazzino, ...)
                     in edizione offline c'è un solo file: tenants/default.db
- backups/           copie di backup automatiche
- ordeva.lock        segnala una sessione in corso (per evitare conflitti su Dropbox)

USO SU PIÙ COMPUTER (Dropbox)
Apri Ordeva su UN computer alla volta. Quando hai finito, usa
\"Chiudi in sicurezza (sincronizza dati)\" così Dropbox sincronizza un file
pulito prima di aprire l'app sull'altro computer. Aprirla contemporaneamente su
due computer può corrompere i dati.

Non modificare questi file a mano mentre Ordeva è aperto.
";

/// Scrive/aggiorna il LEGGIMI.txt nella cartella dati (best-effort).
pub fn write_readme(dir: &Path) {
    let _ = fs::write(dir.join("LEGGIMI.txt"), LEGGIMI);
}
