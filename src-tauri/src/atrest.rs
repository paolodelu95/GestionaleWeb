//! Cifratura del database a riposo (edizione offline).
//!
//! Quando attiva, su disco il dato vive cifrato in `ordeva.db.enc` (formato ORDEVA2,
//! scrypt + AES-256-GCM, vedi backup.rs). All'avvio si **decifra** in `ordeva.db` con la
//! password (il tag GCM verifica anche la correttezza della password); alla chiusura si
//! **ricifra** e si rimuove il file in chiaro. Mentre l'app è aperta esiste un
//! `ordeva.db` in chiaro in locale: la protezione è "a riposo" (utile col file su
//! Dropbox/USB), non contro l'accesso alla macchina mentre l'app gira.
//!
//! Nessun cambio del motore SQLite: il DB resta SQLite normale, è il FILE a essere
//! cifrato quando l'app non è in uso.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

use crate::backup;
use crate::db::DB_FILE;

/// Percorso del database in chiaro (`ordeva.db`).
pub fn db_path(data_dir: &Path) -> PathBuf {
    data_dir.join(DB_FILE)
}

/// Percorso del database cifrato a riposo (`ordeva.db.enc`).
pub fn enc_path(data_dir: &Path) -> PathBuf {
    data_dir.join(format!("{DB_FILE}.enc"))
}

/// All'avvio è "bloccato" (serve la password) se esiste il file cifrato ma NON il chiaro.
pub fn is_locked(data_dir: &Path) -> bool {
    enc_path(data_dir).exists() && !db_path(data_dir).exists()
}

/// Verifica dell'header SQLite (per distinguere password giusta da file corrotto).
fn looks_like_sqlite(buf: &[u8]) -> bool {
    buf.len() >= 16 && &buf[0..16] == b"SQLite format 3\0"
}

/// Decifra `ordeva.db.enc` → `ordeva.db` con la password. Errore (password errata o file
/// non valido) lascia il sistema invariato. Rimuove eventuali sidecar -wal/-shm stantii.
pub fn unlock(data_dir: &Path, password: &str) -> Result<()> {
    let enc = enc_path(data_dir);
    let data = std::fs::read(&enc).with_context(|| format!("lettura {:?}", enc))?;
    if !backup::is_encrypted(&data) {
        bail!("Il file cifrato non è valido");
    }
    let plain = backup::decrypt_with_password(&data, password)
        .map_err(|_| anyhow::anyhow!("Password errata o file danneggiato"))?;
    if !looks_like_sqlite(&plain) {
        bail!("Password errata");
    }
    let db = db_path(data_dir);
    // Scrive in modo atomico (tmp + rename) per non lasciare un db a metà.
    let tmp = data_dir.join(".ordeva.db.tmp");
    std::fs::write(&tmp, &plain).with_context(|| format!("scrittura {:?}", tmp))?;
    std::fs::rename(&tmp, &db).with_context(|| format!("rename {:?}", db))?;
    for ext in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{}", db.to_string_lossy(), ext));
    }
    Ok(())
}

/// Cifra `ordeva.db` → `ordeva.db.enc` (scrittura atomica). Lascia il chiaro al suo posto:
/// il chiamante decide se rimuoverlo (vedi `seal_on_close`).
pub fn encrypt_now(data_dir: &Path, password: &str) -> Result<()> {
    let db = db_path(data_dir);
    let data = std::fs::read(&db).with_context(|| format!("lettura {:?}", db))?;
    let enc = backup::encrypt_with_password(&data, password)?;
    let enc_path = enc_path(data_dir);
    let tmp = data_dir.join(".ordeva.db.enc.tmp");
    std::fs::write(&tmp, &enc).with_context(|| format!("scrittura {:?}", tmp))?;
    std::fs::rename(&tmp, &enc_path).with_context(|| format!("rename {:?}", enc_path))?;
    Ok(())
}

/// Alla chiusura: ricifra il chiaro e rimuove `ordeva.db` (+ sidecar). Da chiamare DOPO
/// aver fatto il checkpoint del WAL e chiuso le connessioni.
pub fn seal_on_close(data_dir: &Path, password: &str) -> Result<()> {
    encrypt_now(data_dir, password)?;
    let db = db_path(data_dir);
    let _ = std::fs::remove_file(&db);
    for ext in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{}", db.to_string_lossy(), ext));
    }
    Ok(())
}

/// Disattiva la cifratura: rimuove il file cifrato (resta solo il chiaro).
pub fn remove_enc(data_dir: &Path) {
    let _ = std::fs::remove_file(enc_path(data_dir));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn tmp() -> PathBuf {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let p = std::env::temp_dir().join(format!("ordeva-atrest-{}-{}", std::process::id(), n));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    /// Contenuto plausibile di un DB (header SQLite + payload).
    fn fake_db() -> Vec<u8> {
        let mut v = b"SQLite format 3\0".to_vec();
        v.extend_from_slice(b"dati-importanti-di-ordeva-1234567890");
        v
    }

    #[test]
    fn ciclo_cifra_sigilla_sblocca() {
        let dir = tmp();
        let original = fake_db();
        std::fs::write(db_path(&dir), &original).unwrap();

        // Sigilla (chiusura): crea .enc e rimuove il chiaro → bloccato.
        seal_on_close(&dir, "segreta").unwrap();
        assert!(enc_path(&dir).exists(), ".enc creato");
        assert!(!db_path(&dir).exists(), "chiaro rimosso");
        assert!(is_locked(&dir));

        // Password sbagliata: niente decifratura, resta bloccato.
        assert!(unlock(&dir, "sbagliata").is_err());
        assert!(!db_path(&dir).exists());

        // Password giusta: il chiaro torna identico all'originale.
        unlock(&dir, "segreta").unwrap();
        assert!(db_path(&dir).exists());
        assert_eq!(std::fs::read(db_path(&dir)).unwrap(), original);
    }

    #[test]
    fn encrypt_now_lascia_il_chiaro() {
        let dir = tmp();
        std::fs::write(db_path(&dir), fake_db()).unwrap();
        encrypt_now(&dir, "pw").unwrap();
        // encrypt_now NON rimuove il chiaro (lo fa solo seal_on_close).
        assert!(db_path(&dir).exists());
        assert!(enc_path(&dir).exists());
        // remove_enc disattiva: resta solo il chiaro.
        remove_enc(&dir);
        assert!(!enc_path(&dir).exists());
        assert!(db_path(&dir).exists());
    }
}
