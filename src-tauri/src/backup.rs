//! Backup cifrato dell'edizione offline — parità con utils/backup.js,
//! utils/backupConfig.js e utils/appSession.js.
//!
//! Cifratura: scrypt(password, salt, N=16384,r=8,p=1)=key32 + AES-256-GCM.
//! Formato file V2 (cross-PC): "ORDEVA2\0"(8) | salt(16) | iv(12) | tag(16) | dati.
//! V1 (legacy): "ORDEVA1\0"(8) | iv(12) | tag(16) | dati (ripristino solo stesso PC).

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use aes_gcm::aead::{AeadInPlace, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use crate::db::{AppState, DEFAULT_TENANT};
use crate::web;

const MAGIC_V2: &[u8; 8] = b"ORDEVA2\0";
const MAGIC_V1: &[u8; 8] = b"ORDEVA1\0";
const MAX_BACKUPS: usize = 14;
const EXT_MAX: usize = 30;

// ── Config (azienda.backup_config) ──────────────────────────────────────────

/// DEFAULTS del config backup (come backupConfig.js).
fn defaults() -> Value {
    json!({
        "dir": "",
        "enabled": false,
        "encrypt": false,
        "alertDays": 3,
        "alertDisabled": false,
        "lastAt": Value::Null,
        "alertDismissedAt": Value::Null,
        "encSalt": Value::Null,
    })
}

/// Legge il config (DEFAULTS sovrascritti da quanto salvato in azienda.backup_config).
pub fn read_config(state: &AppState) -> Result<Value> {
    let stored: Option<String> = state.with_tenant(DEFAULT_TENANT, |c| {
        Ok(c.query_row("SELECT backup_config FROM azienda WHERE id=1", [], |r| r.get(0))
            .ok()
            .flatten())
    })?;
    let mut cfg = defaults();
    if let Some(s) = stored {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&s) {
            let obj = cfg.as_object_mut().unwrap();
            for (k, v) in map {
                obj.insert(k, v);
            }
        }
    }
    Ok(cfg)
}

/// Scrive un patch sul config (merge su read()) e ritorna il merged.
pub fn write_config(state: &AppState, patch: Value) -> Result<Value> {
    let mut merged = read_config(state)?;
    if let Value::Object(p) = patch {
        let obj = merged.as_object_mut().unwrap();
        for (k, v) in p {
            obj.insert(k, v);
        }
    }
    let s = serde_json::to_string(&merged)?;
    state.with_tenant(DEFAULT_TENANT, |c| {
        c.execute("UPDATE azienda SET backup_config=?1 WHERE id=1", [s.as_str()])?;
        Ok(())
    })?;
    Ok(merged)
}

/// Garantisce un salt persistente (hex). Lo crea se assente.
pub fn ensure_salt(state: &AppState) -> Result<String> {
    let cfg = read_config(state)?;
    if let Some(s) = cfg.get("encSalt").and_then(Value::as_str) {
        if !s.is_empty() {
            return Ok(s.to_string());
        }
    }
    let mut raw = [0u8; 16];
    getrandom::getrandom(&mut raw).map_err(|e| anyhow!(e.to_string()))?;
    let salt = hex_encode(&raw);
    write_config(state, json!({ "encSalt": salt }))?;
    Ok(salt)
}

// ── Chiave di sessione (in memoria) ─────────────────────────────────────────

/// Deriva e memorizza la chiave AES-256 dalla password + salt (hex). Vuoti → None.
pub fn set_key_from_password(state: &AppState, password: &str, salt_hex: &str) {
    let mut slot = state.backup_key.lock().unwrap();
    if password.is_empty() || salt_hex.is_empty() {
        *slot = None;
        return;
    }
    match derive_key(password, salt_hex) {
        Ok(k) => *slot = Some(k),
        Err(_) => *slot = None,
    }
}

pub fn get_key(state: &AppState) -> Option<[u8; 32]> {
    *state.backup_key.lock().unwrap()
}

pub fn clear_key(state: &AppState) {
    *state.backup_key.lock().unwrap() = None;
}

/// scrypt(password, salt) → 32 byte (parità con crypto.scryptSync default).
fn derive_key(password: &str, salt_hex: &str) -> Result<[u8; 32]> {
    let salt = hex_decode(salt_hex).ok_or_else(|| anyhow!("salt non valido"))?;
    derive_key_raw(password, &salt)
}

fn derive_key_raw(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    // Node scryptSync default: N=16384 (log_n=14), r=8, p=1.
    let params = scrypt::Params::new(14, 8, 1, 32).map_err(|e| anyhow!(e.to_string()))?;
    let mut out = [0u8; 32];
    scrypt::scrypt(password.as_bytes(), salt, &params, &mut out)
        .map_err(|e| anyhow!(e.to_string()))?;
    Ok(out)
}

// ── Cifratura AES-256-GCM ───────────────────────────────────────────────────

pub fn is_encrypted(buf: &[u8]) -> bool {
    buf.len() >= 8 && (&buf[0..8] == MAGIC_V2 || &buf[0..8] == MAGIC_V1)
}

fn encrypt_buffer(buf: &[u8], key: &[u8; 32], salt: &[u8]) -> Result<Vec<u8>> {
    let mut iv = [0u8; 12];
    getrandom::getrandom(&mut iv).map_err(|e| anyhow!(e.to_string()))?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut data = buf.to_vec();
    let tag = cipher
        .encrypt_in_place_detached(Nonce::from_slice(&iv), b"", &mut data)
        .map_err(|_| anyhow!("cifratura fallita"))?;
    let mut out = Vec::with_capacity(8 + salt.len() + 12 + 16 + data.len());
    out.extend_from_slice(MAGIC_V2);
    out.extend_from_slice(salt);
    out.extend_from_slice(&iv);
    out.extend_from_slice(&tag);
    out.extend_from_slice(&data);
    Ok(out)
}

/// Decifra. Con `password` ricava la chiave dal salt incorporato (V2, cross-PC).
fn decrypt_buffer(buf: &[u8], key: Option<[u8; 32]>, password: Option<&str>) -> Result<Vec<u8>> {
    let v2 = buf.len() >= 8 && &buf[0..8] == MAGIC_V2;
    let v1 = buf.len() >= 8 && &buf[0..8] == MAGIC_V1;
    if !v2 && !v1 {
        bail!("File non cifrato o formato non riconosciuto");
    }
    let mut p = 8usize;
    let mut k = key;
    if v2 {
        let salt = &buf[p..p + 16];
        p += 16;
        if let Some(pw) = password {
            k = Some(derive_key_raw(pw, salt)?);
        }
    } else if password.is_some() && key.is_none() {
        bail!("Backup in formato precedente: ripristinabile solo sullo stesso PC che lo ha creato.");
    }
    let k = k.ok_or_else(|| anyhow!("Password mancante per decifrare il backup"))?;
    let iv = &buf[p..p + 12];
    p += 12;
    let tag = &buf[p..p + 16];
    p += 16;
    let data = &buf[p..];
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&k));
    let mut out = data.to_vec();
    cipher
        .decrypt_in_place_detached(
            Nonce::from_slice(iv),
            b"",
            &mut out,
            aes_gcm::Tag::from_slice(tag),
        )
        .map_err(|_| anyhow!("decifratura fallita"))?;
    Ok(out)
}

// ── Backup / restore ────────────────────────────────────────────────────────

/// Timestamp UTC "YYYY-MM-DDTHH-MM-SS" (toISOString con [:.] → '-', slice 0..19).
fn ts_now() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let iso = web::iso_of_days(days); // YYYY-MM-DD
    format!("{iso}T{h:02}-{mi:02}-{s:02}")
}

/// Esegue una copia consistente (VACUUM INTO) del DB tenant nel file `dest`.
fn vacuum_into(state: &AppState, dest: &Path) -> Result<()> {
    let dest_str = dest.to_string_lossy().replace('\'', "''");
    state.with_tenant(DEFAULT_TENANT, |c| {
        c.execute_batch(&format!("VACUUM INTO '{dest_str}'"))?;
        Ok(())
    })
}

/// Backup interno di sicurezza in data_dir/backups/<slug> (parità con runBackup).
fn run_internal_backup(state: &AppState) -> Result<()> {
    let dir = state.data_dir.join("backups").join(DEFAULT_TENANT);
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("gestionale-{}.db", ts_now()));
    vacuum_into(state, &dest)?;
    prune(&dir, "gestionale-", MAX_BACKUPS, false);
    Ok(())
}

/// Crea un backup nella cartella `dir`, cifrato se richiesto. Ritorna (file, encrypted).
pub fn run_external_backup(
    state: &AppState,
    dir: &str,
    encrypt: bool,
    key: Option<[u8; 32]>,
    salt_hex: &str,
) -> Result<(PathBuf, bool)> {
    if dir.is_empty() {
        bail!("Cartella di backup non impostata");
    }
    if encrypt && (key.is_none() || salt_hex.is_empty()) {
        bail!("Cifratura richiesta ma password d'accesso non sbloccata");
    }
    let dir = PathBuf::from(dir);
    std::fs::create_dir_all(&dir)?;
    let src = state.tenant_db_path(DEFAULT_TENANT);
    if !src.exists() {
        bail!("Database non trovato");
    }
    let tmp = std::env::temp_dir().join(format!("ordeva-bk-{}.db", nanos()));
    vacuum_into(state, &tmp)?;

    let ts = ts_now();
    let (dest, encrypted) = if encrypt && key.is_some() {
        let dest = dir.join(format!("ordeva-{ts}.db.enc"));
        let salt = hex_decode(salt_hex).ok_or_else(|| anyhow!("salt non valido"))?;
        let plain = std::fs::read(&tmp)?;
        std::fs::write(&dest, encrypt_buffer(&plain, &key.unwrap(), &salt)?)?;
        (dest, true)
    } else {
        let dest = dir.join(format!("ordeva-{ts}.db"));
        std::fs::copy(&tmp, &dest)?;
        (dest, false)
    };
    let _ = std::fs::remove_file(&tmp);
    prune(&dir, "ordeva-", EXT_MAX, true);
    Ok((dest, encrypted))
}

/// Ripristina un backup (.db o .db.enc), sostituendo il DB del tenant.
pub fn restore_backup(
    state: &AppState,
    file_path: &str,
    key: Option<[u8; 32]>,
    password: Option<&str>,
) -> Result<()> {
    let fp = PathBuf::from(file_path);
    if file_path.is_empty() || !fp.exists() {
        bail!("File di backup non trovato");
    }
    let mut data = std::fs::read(&fp)?;
    if is_encrypted(&data) {
        if key.is_none() && password.is_none() {
            bail!("Backup cifrato: inserisci la password usata per crearlo.");
        }
        data = decrypt_buffer(&data, key, password)
            .map_err(|_| anyhow!("Impossibile decifrare il backup: password errata o file danneggiato."))?;
    }
    if data.len() < 16 || &data[0..16] != b"SQLite format 3\0" {
        bail!("Il file non è un database valido (password errata?)");
    }
    // Backup di sicurezza dell'attuale (best-effort), poi chiude e sovrascrive.
    let _ = run_internal_backup(state);
    state.evict_tenant(DEFAULT_TENANT);
    let target = state.tenant_db_path(DEFAULT_TENANT);
    std::fs::write(&target, &data)?;
    for ext in ["-wal", "-shm"] {
        let p = PathBuf::from(format!("{}{}", target.to_string_lossy(), ext));
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

/// Elenco backup nella cartella, ordinati per mtime desc.
pub fn list_external(dir: &str) -> Vec<Value> {
    let mut out = Vec::new();
    let path = Path::new(dir);
    if dir.is_empty() || !path.exists() {
        return out;
    }
    let mut items: Vec<(String, bool, u64, std::time::SystemTime)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if !is_backup_name(&name) {
                continue;
            }
            if let Ok(md) = e.metadata() {
                let mtime = md.modified().unwrap_or(UNIX_EPOCH);
                items.push((name.clone(), name.ends_with(".db.enc"), md.len(), mtime));
            }
        }
    }
    items.sort_by(|a, b| b.3.cmp(&a.3));
    for (name, enc, size, mtime) in items {
        out.push(json!({
            "name": name,
            "encrypted": enc,
            "size": size,
            "mtime": iso_utc(mtime),
        }));
    }
    out
}

/// Nome backup valido: ^ordeva-.*\.(db|db\.enc)$
fn is_backup_name(f: &str) -> bool {
    f.starts_with("ordeva-") && (f.ends_with(".db") || f.ends_with(".db.enc"))
}

fn prune(dir: &Path, prefix: &str, keep: usize, ext_pattern: bool) {
    let mut files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let ok = if ext_pattern { is_backup_name(&name) } else { name.starts_with(prefix) && name.ends_with(".db") };
            if !ok {
                continue;
            }
            if let Ok(md) = e.metadata() {
                files.push((e.path(), md.modified().unwrap_or(UNIX_EPOCH)));
            }
        }
    }
    files.sort_by(|a, b| b.1.cmp(&a.1));
    for (p, _) in files.into_iter().skip(keep) {
        let _ = std::fs::remove_file(p);
    }
}

// ── util ────────────────────────────────────────────────────────────────────

fn nanos() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
}

fn iso_utc(t: std::time::SystemTime) -> String {
    let secs = t.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let nanos = t.duration_since(UNIX_EPOCH).map(|d| d.subsec_millis()).unwrap_or(0);
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let iso = web::iso_of_days(days);
    format!("{iso}T{h:02}:{mi:02}:{s:02}.{nanos:03}Z")
}

fn hex_encode(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push_str(&format!("{x:02x}"));
    }
    s
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLAIN: &[u8] = b"SQLite format 3 test-payload-123";
    const SALT_HEX: &str = "00112233445566778899aabbccddeeff";
    const NODE_KEY: &str = "d13f9141ddd7b37e06893d66b545c1df8429c8fc052008655f111f42cff1e652";
    // Blob V2 prodotto da utils/backup.js (Node) con password "segreta" e SALT_HEX.
    const NODE_BLOB: &str = "4f5244455641320000112233445566778899aabbccddeeffdca82688f23ebda00a1cfd1888bc3cd444d0ac7a93ee930c19ba00520e1e474def1f5de82bb7941e3a4b2099536d2c6f4b25f52e47f67cdeddc75be4";

    #[test]
    fn scrypt_matches_node() {
        let key = derive_key("segreta", SALT_HEX).unwrap();
        assert_eq!(hex_encode(&key), NODE_KEY, "scrypt key deve combaciare con Node");
    }

    #[test]
    fn decrypts_node_blob_with_password() {
        let blob = hex_decode(NODE_BLOB).unwrap();
        let out = decrypt_buffer(&blob, None, Some("segreta")).unwrap();
        assert_eq!(out, PLAIN, "deve decifrare il blob V2 di Node via password");
    }

    #[test]
    fn rust_blob_roundtrips_and_is_written_for_node() {
        let salt = hex_decode(SALT_HEX).unwrap();
        let key = derive_key("segreta", SALT_HEX).unwrap();
        let blob = encrypt_buffer(PLAIN, &key, &salt).unwrap();
        // header ORDEVA2
        assert_eq!(&blob[0..8], MAGIC_V2);
        // round-trip interno (via chiave e via password)
        assert_eq!(decrypt_buffer(&blob, Some(key), None).unwrap(), PLAIN);
        assert_eq!(decrypt_buffer(&blob, None, Some("segreta")).unwrap(), PLAIN);
        // scrive il blob così Node può verificarne la decifratura (cross-compat).
        let out_path = std::env::temp_dir().join("rust_enc.bin");
        std::fs::write(&out_path, &blob).unwrap();
    }
}
