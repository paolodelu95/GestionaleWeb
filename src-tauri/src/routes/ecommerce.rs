//! /api/ecommerce — parità con routes/ecommerce.js: configurazioni provider
//! (WooCommerce/Shopify) in DB + endpoint di sync. La CRUD è locale; la sync vera
//! richiede chiamate REST autenticate al provider (rete): qui restano i controlli
//! di configurazione, mentre la chiamata di rete non è portata in offline.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::tenant_conn;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/configs", get(list).post(create))
        .route("/configs/:id", axum::routing::put(update).delete(remove))
        .route("/configs/:id/sync-prodotti", axum::routing::post(sync_prodotti))
        .route("/configs/:id/pull-ordini", axum::routing::post(pull_ordini))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, provider, nome, base_url, api_key, api_secret, attivo, last_sync, created_at FROM ecommerce_config ORDER BY id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            let api_key: Option<String> = r.get("api_key")?;
            let api_secret: Option<String> = r.get("api_secret")?;
            Ok(json!({
                "id": r.get::<_, i64>("id")?,
                "provider": r.get::<_, Option<String>>("provider")?,
                "nome": r.get::<_, Option<String>>("nome")?,
                "baseUrl": r.get::<_, Option<String>>("base_url")?,
                "apiKey": if api_key.as_deref().unwrap_or("").is_empty() { "" } else { "***" },
                "apiSecret": if api_secret.as_deref().unwrap_or("").is_empty() { "" } else { "***" },
                "attivo": r.get::<_, Option<i64>>("attivo")? == Some(1),
                "lastSync": r.get::<_, Option<String>>("last_sync")?,
                "createdAt": r.get::<_, Option<String>>("created_at")?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create(State(state): State<AppState>, Json(c): Json<Value>) -> ApiResult<Json<Value>> {
    let provider = c.get("provider").and_then(Value::as_str).unwrap_or("");
    let nome = c.get("nome").and_then(Value::as_str).unwrap_or("");
    let base_url = c.get("baseUrl").and_then(Value::as_str).unwrap_or("");
    if provider.is_empty() || nome.is_empty() || base_url.is_empty() {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "provider, nome, baseUrl obbligatori".into()));
    }
    let attivo = if matches!(c.get("attivo"), Some(Value::Bool(false))) { 0 } else { 1 };
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO ecommerce_config (provider, nome, base_url, api_key, api_secret, attivo) VALUES (?,?,?,?,?,?)",
        params![
            provider, nome, base_url,
            c.get("apiKey").and_then(Value::as_str).unwrap_or(""),
            c.get("apiSecret").and_then(Value::as_str).unwrap_or(""),
            attivo,
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update(State(state): State<AppState>, Path(id): Path<i64>, Json(c): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let cur = conn
        .query_row(
            "SELECT nome, base_url, api_key, api_secret FROM ecommerce_config WHERE id=?",
            params![id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                ))
            },
        )
        .ok();
    let (cur_nome, cur_url, cur_key, cur_secret) = match cur {
        Some(x) => x,
        None => return Err(ApiError::Status(StatusCode::NOT_FOUND, "Configurazione non trovata".into())),
    };
    let nome = c.get("nome").and_then(Value::as_str).map(String::from).unwrap_or(cur_nome);
    let base_url = c.get("baseUrl").and_then(Value::as_str).map(String::from).unwrap_or(cur_url);
    // api_key/secret: aggiornati solo se forniti e diversi da '***'.
    let api_key = match c.get("apiKey").and_then(Value::as_str) {
        Some(k) if !k.is_empty() && k != "***" => k.to_string(),
        _ => cur_key,
    };
    let api_secret = match c.get("apiSecret").and_then(Value::as_str) {
        Some(s) if !s.is_empty() && s != "***" => s.to_string(),
        _ => cur_secret,
    };
    let attivo = if matches!(c.get("attivo"), Some(Value::Bool(false))) { 0 } else { 1 };
    conn.execute(
        "UPDATE ecommerce_config SET nome=?, base_url=?, api_key=?, api_secret=?, attivo=? WHERE id=?",
        params![nome, base_url, api_key, api_secret, attivo, id],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM ecommerce_config WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}

/// Controlli comuni di sync: config attiva + api_secret. Err da restituire o Ok.
fn check_sync(state: &AppState, id: i64) -> Result<(), ApiError> {
    let conn = tenant_conn(state)?;
    let conn = conn.lock().unwrap();
    let secret: Option<Option<String>> = conn
        .query_row("SELECT api_secret FROM ecommerce_config WHERE id=? AND attivo=1", params![id], |r| r.get::<_, Option<String>>(0))
        .ok();
    match secret {
        None => Err(ApiError::Status(StatusCode::NOT_FOUND, "Configurazione non trovata o disattivata".into())),
        Some(s) if s.as_deref().unwrap_or("").is_empty() => {
            Err(ApiError::Status(StatusCode::BAD_REQUEST, "API key/secret mancanti nella configurazione".into()))
        }
        Some(_) => Ok(()),
    }
}

async fn sync_prodotti(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    check_sync(&state, id)?;
    // Selezione prodotti (tutti o per ids): se nessuno, nessuna chiamata di rete →
    // contatori a zero come pushProdotti() di Node.
    let count = {
        let conn = tenant_conn(&state)?;
        let conn = conn.lock().unwrap();
        match b.get("ids").and_then(Value::as_array) {
            Some(ids) => {
                let nums: Vec<i64> = ids.iter().filter_map(Value::as_i64).collect();
                if nums.is_empty() {
                    0
                } else {
                    let ph = vec!["?"; nums.len()].join(",");
                    let binds: Vec<rusqlite::types::Value> = nums.iter().map(|n| rusqlite::types::Value::Integer(*n)).collect();
                    conn.query_row(&format!("SELECT COUNT(*) FROM prodotti WHERE id IN ({ph})"), rusqlite::params_from_iter(binds.iter()), |r| r.get::<_, i64>(0)).unwrap_or(0)
                }
            }
            None => conn.query_row("SELECT COUNT(*) FROM prodotti", [], |r| r.get::<_, i64>(0)).unwrap_or(0),
        }
    };
    if count == 0 {
        let conn = tenant_conn(&state)?;
        let conn = conn.lock().unwrap();
        conn.execute("UPDATE ecommerce_config SET last_sync=datetime('now') WHERE id=?", params![id])?;
        return Ok(Json(json!({ "creati": 0, "aggiornati": 0, "errori": [], "totali": 0 })));
    }
    // Con prodotti da inviare serve la chiamata REST al provider (rete): non portata in offline.
    Err(ApiError::Status(StatusCode::INTERNAL_SERVER_ERROR, "Sync e-commerce non disponibile in edizione offline".into()))
}

async fn pull_ordini(State(state): State<AppState>, Path(id): Path<i64>, Json(_b): Json<Value>) -> ApiResult<Json<Value>> {
    check_sync(&state, id)?;
    Err(ApiError::Status(StatusCode::INTERNAL_SERVER_ERROR, "Sync e-commerce non disponibile in edizione offline".into()))
}
