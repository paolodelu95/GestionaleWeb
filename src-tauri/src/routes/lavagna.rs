//! /api/lavagna — bacheca post-it (un blob JSON per tenant, incluso nei backup).

use axum::{extract::State, routing::get, Json, Router};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::tenant_conn;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(get_board).put(save_board))
}

/// GET /api/lavagna — stato completo della bacheca (default: nessun post-it).
async fn get_board(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let dati: Option<String> = conn
        .query_row("SELECT dati FROM lavagna WHERE id = 1", [], |r| r.get(0))
        .optional()?;
    let board = dati
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or_else(|| json!({ "note": [] }));
    Ok(Json(board))
}

/// PUT /api/lavagna — salva l'intero stato della bacheca (upsert sull'unica riga).
async fn save_board(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let dati = serde_json::to_string(&body).unwrap_or_else(|_| "{}".to_string());
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO lavagna (id, dati) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET dati = ?1",
        params![dati],
    )?;
    Ok(Json(json!({ "success": true })))
}
