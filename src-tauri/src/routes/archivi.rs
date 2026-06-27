//! API gestione archivi (in-app, ad app avviata): elenco, crea, duplica, rinomina,
//! elimina, importa/esporta, cambia archivio, imposta/rimuovi password.
//!
//! La cartella radice (che contiene `archivi/`) si ricava dall'archivio attivo: il
//! data_dir dell'app è `<root>/archivi/<slug>`, quindi `root = data_dir/../..`.
//! Le operazioni su file delegano al modulo `crate::archivi`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::archivi;
use crate::db::AppState;
use crate::error::{ApiError, ApiResult};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(lista).post(crea))
        .route("/importa", post(importa))
        .route("/password", post(password_set).delete(password_remove))
        .route("/:slug/duplica", post(duplica))
        .route("/:slug/rinomina", post(rinomina))
        .route("/:slug/cambia", post(cambia))
        .route("/:slug/esporta", post(esporta))
        .route("/:slug/elimina", post(elimina))
}

/// Radice dati (contiene `archivi/`), ricavata dall'archivio attivo.
fn root_dir(state: &AppState) -> std::path::PathBuf {
    state
        .data_dir
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| state.data_dir.clone())
}

/// Slug dell'archivio attualmente aperto (= nome cartella del data_dir attivo).
fn slug_corrente(state: &AppState) -> Option<String> {
    state.data_dir.file_name().map(|s| s.to_string_lossy().into_owned())
}

#[derive(Deserialize)]
struct NomeReq {
    nome: String,
}

#[derive(Deserialize)]
struct ImportaReq {
    file: String,
    nome: String,
}

#[derive(Deserialize)]
struct EsportaReq {
    dest: String,
}

#[derive(Deserialize)]
struct PwReq {
    password: String,
}

async fn lista(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let root = root_dir(&state);
    Ok(Json(json!({
        "archivi": archivi::list(&root),
        "corrente": slug_corrente(&state),
    })))
}

async fn crea(State(state): State<AppState>, Json(b): Json<NomeReq>) -> ApiResult<Json<Value>> {
    if b.nome.trim().is_empty() {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Nome mancante".into()));
    }
    let a = archivi::crea(&root_dir(&state), b.nome.trim()).map_err(ApiError::Internal)?;
    Ok(Json(json!({ "archivio": a })))
}

async fn duplica(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(b): Json<NomeReq>,
) -> ApiResult<Json<Value>> {
    if b.nome.trim().is_empty() {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Nome mancante".into()));
    }
    let a = archivi::duplica(&root_dir(&state), &slug, b.nome.trim()).map_err(ApiError::Internal)?;
    Ok(Json(json!({ "archivio": a })))
}

async fn rinomina(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(b): Json<NomeReq>,
) -> ApiResult<Json<Value>> {
    archivi::rinomina(&root_dir(&state), &slug, b.nome.trim()).map_err(ApiError::Internal)?;
    Ok(Json(json!({ "ok": true })))
}

async fn elimina(State(state): State<AppState>, Path(slug): Path<String>) -> ApiResult<Json<Value>> {
    if slug_corrente(&state).as_deref() == Some(slug.as_str()) {
        return Err(ApiError::Status(
            StatusCode::CONFLICT,
            "Non puoi eliminare l'archivio attualmente in uso".into(),
        ));
    }
    archivi::elimina(&root_dir(&state), &slug).map_err(ApiError::Internal)?;
    Ok(Json(json!({ "ok": true })))
}

/// Imposta come corrente un altro archivio: il frontend poi riavvia l'app per aprirlo.
async fn cambia(State(state): State<AppState>, Path(slug): Path<String>) -> ApiResult<Json<Value>> {
    let root = root_dir(&state);
    if archivi::get(&root, &slug).is_none() {
        return Err(ApiError::Status(StatusCode::NOT_FOUND, "Archivio inesistente".into()));
    }
    archivi::set_corrente(&root, &slug).map_err(ApiError::Internal)?;
    Ok(Json(json!({ "ok": true, "riavvio": true })))
}

async fn importa(State(state): State<AppState>, Json(b): Json<ImportaReq>) -> ApiResult<Json<Value>> {
    if b.nome.trim().is_empty() {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Nome mancante".into()));
    }
    let a = archivi::importa(&root_dir(&state), std::path::Path::new(&b.file), b.nome.trim())
        .map_err(ApiError::Internal)?;
    Ok(Json(json!({ "archivio": a })))
}

async fn esporta(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(b): Json<EsportaReq>,
) -> ApiResult<Json<Value>> {
    archivi::esporta(&root_dir(&state), &slug, std::path::Path::new(&b.dest))
        .map_err(ApiError::Internal)?;
    Ok(Json(json!({ "ok": true })))
}

/// Imposta la password (cifratura a riposo) sull'archivio CORRENTE: cifra subito il file;
/// il chiaro resta in uso e viene risigillato/rimosso alla chiusura.
async fn password_set(State(state): State<AppState>, Json(b): Json<PwReq>) -> ApiResult<Json<Value>> {
    if b.password.trim().is_empty() {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Password vuota".into()));
    }
    crate::atrest::encrypt_now(&state.data_dir, &b.password).map_err(ApiError::Internal)?;
    *state.atrest_password.lock().unwrap() = Some(b.password.clone());
    crate::config::set_encrypted(&state.config_path, true).map_err(ApiError::Internal)?;
    let _ = archivi::risincronizza_cifrati(&root_dir(&state));
    Ok(Json(json!({ "ok": true })))
}

/// Rimuove la password dall'archivio CORRENTE: niente più cifratura a riposo.
async fn password_remove(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    crate::atrest::remove_enc(&state.data_dir);
    *state.atrest_password.lock().unwrap() = None;
    let _ = crate::config::set_encrypted(&state.config_path, false);
    let _ = archivi::risincronizza_cifrati(&root_dir(&state));
    Ok(Json(json!({ "ok": true })))
}
