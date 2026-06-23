//! Lock/heartbeat di sessione: un file `ordeva.lock` nella cartella dati segnala che
//! Ordeva è in uso su un computer. Serve per l'uso del DB su Dropbox condiviso tra più PC:
//! se all'avvio risulta una sessione recente su un computer DIVERSO, avvisiamo l'utente
//! (usarlo contemporaneamente su due PC può corrompere SQLite).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Una sessione considerata "viva" se il suo heartbeat è più recente di questo (secondi).
const FRESH_SECS: i64 = 120;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockInfo {
    pub host: String,
    pub pid: u32,
    pub started_at: i64,
    pub heartbeat_at: i64,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Nome del computer (best-effort, multipiattaforma).
pub fn host() -> String {
    if let Ok(h) = std::env::var("COMPUTERNAME") {
        if !h.is_empty() {
            return h;
        }
    }
    if let Ok(h) = std::env::var("HOSTNAME") {
        if !h.is_empty() {
            return h;
        }
    }
    fs::read_to_string("/etc/hostname")
        .map(|s| s.trim().to_string())
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "PC".to_string())
}

pub fn lock_path(data_dir: &Path) -> PathBuf {
    data_dir.join("ordeva.lock")
}

pub fn read(data_dir: &Path) -> Option<LockInfo> {
    fs::read_to_string(lock_path(data_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

/// Lock corrente di questa sessione, con heartbeat = adesso.
pub fn self_info(started_at: i64) -> LockInfo {
    LockInfo {
        host: host(),
        pid: std::process::id(),
        started_at,
        heartbeat_at: now(),
    }
}

pub fn write(data_dir: &Path, info: &LockInfo) {
    if let Ok(s) = serde_json::to_string(info) {
        let _ = fs::write(lock_path(data_dir), s);
    }
}

pub fn remove(data_dir: &Path) {
    let _ = fs::remove_file(lock_path(data_dir));
}

/// True se `lock` rappresenta una sessione viva su un computer DIVERSO da questo.
/// (Stesso host con pid diverso = relaunch/crash locale: non è un conflitto Dropbox.)
pub fn is_conflict(lock: &LockInfo) -> bool {
    lock.host != host() && (now() - lock.heartbeat_at) < FRESH_SECS
}

pub fn current_time() -> i64 {
    now()
}
