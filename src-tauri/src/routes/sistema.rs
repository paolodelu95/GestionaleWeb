//! /api/sistema — gestione "da app vera" dei file dati (edizione offline):
//! dove vivono i dati, spostarli (anche in Dropbox), stato del lock di sessione e
//! chiusura sicura con sincronizzazione.

use std::path::PathBuf;

use axum::{extract::State, routing::{get, post}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/percorsi", get(percorsi))
        .route("/data-dir", post(set_data_dir))
        .route("/lock", get(lock_stato))
        .route("/flush", post(flush))
        .route("/snapshots", get(snapshots_list).post(snapshot_create))
        .route("/snapshots/restore", post(snapshot_restore))
}

/// GET /api/sistema/percorsi — cartella dati corrente + elenco file principali.
async fn percorsi(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let dir = &state.data_dir;
    let mut files: Vec<Value> = Vec::new();
    for nome in [crate::db::DB_FILE, "backups"] {
        let p = dir.join(nome);
        let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        files.push(json!({ "nome": nome, "esiste": p.exists(), "bytes": size }));
    }
    Ok(Json(json!({
        "dataDir": dir.to_string_lossy(),
        "configPath": state.config_path.to_string_lossy(),
    "files": files,
    })))
}

#[derive(Deserialize)]
struct DataDirReq {
    path: String,
}

/// POST /api/sistema/data-dir — sposta i dati nella cartella indicata (es. Dropbox) e
/// persiste la scelta. Richiede un riavvio dell'app (lo fa il frontend).
async fn set_data_dir(
    State(state): State<AppState>,
    Json(req): Json<DataDirReq>,
) -> ApiResult<Json<Value>> {
    let path = req.path.trim();
    if path.is_empty() {
        return Err(ApiError::bad_request("Percorso mancante"));
    }
    let new_dir = PathBuf::from(path);
    if !new_dir.is_dir() {
        return Err(ApiError::bad_request("La cartella scelta non esiste"));
    }
    state.set_data_dir(&new_dir)?;
    Ok(Json(json!({ "ok": true, "riavvioRichiesto": true, "dataDir": new_dir.to_string_lossy() })))
}

/// GET /api/sistema/lock — se all'avvio risultava una sessione viva su un ALTRO computer
/// (per avvisare l'utente prima di lavorare sullo stesso DB Dropbox).
async fn lock_stato(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let other = state.other_session.lock().unwrap().clone();
    Ok(Json(match other {
        Some(l) => json!({
            "altraSessione": true,
            "host": l.host,
            "heartbeatAt": l.heartbeat_at,
        }),
        None => json!({ "altraSessione": false }),
    }))
}

/// GET /api/sistema/snapshots — cronologia versioni ripristinabili (più recenti prima).
async fn snapshots_list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    Ok(Json(json!({ "snapshots": crate::backup::list_snapshots(&state) })))
}

/// POST /api/sistema/snapshots — crea uno snapshot ora.
async fn snapshot_create(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let name = crate::backup::create_snapshot(&state)?;
    Ok(Json(json!({ "ok": true, "name": name })))
}

#[derive(Deserialize)]
struct SnapshotReq {
    name: String,
}

/// POST /api/sistema/snapshots/restore — ripristina i dati da uno snapshot.
async fn snapshot_restore(
    State(state): State<AppState>,
    Json(req): Json<SnapshotReq>,
) -> ApiResult<Json<Value>> {
    crate::backup::restore_snapshot(&state, &req.name)?;
    Ok(Json(json!({ "ok": true })))
}

/// POST /api/sistema/flush — checkpoint finale + rilascio lock, per "Chiudi in sicurezza".
/// Dopo questa, il frontend chiude l'app (plugin-process), così Dropbox sincronizza un
/// file `.db` pulito prima di aprire Ordeva su un altro computer.
async fn flush(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    state.flush();
    state.release_lock();
    Ok(Json(json!({ "ok": true })))
}
