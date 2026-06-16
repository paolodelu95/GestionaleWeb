//! /api/note-rapide — parità con routes/noteRapide.js

use axum::{
    extract::{Path, State},
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
        .route("/", get(list).post(create))
        .route("/:id", axum::routing::put(update).delete(remove))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM note_rapide ORDER BY ordine, id")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>("id")?,
                "testo": r.get::<_, Option<String>>("testo")?,
                "ordine": r.get::<_, Option<i64>>("ordine")?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let testo = body.get("testo").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if testo.is_empty() {
        return Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "testo richiesto".into()));
    }
    let ordine = body.get("ordine").and_then(Value::as_i64).unwrap_or(0);
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("INSERT INTO note_rapide (testo, ordine) VALUES (?,?)", params![testo, ordine])?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let testo = body.get("testo").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if testo.is_empty() {
        return Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "testo richiesto".into()));
    }
    let ordine = body.get("ordine").and_then(Value::as_i64).unwrap_or(0);
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("UPDATE note_rapide SET testo=?, ordine=? WHERE id=?", params![testo, ordine, id])?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM note_rapide WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}
