//! /api/conti-acquisto — parità con routes/contiAcquisto.js
//! Nota: POST usa `attivo!==false` (default true), PUT usa `attivo?1:0` (default false).

use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::{bool_field, bool_or_true, str_field, str_or, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt =
        conn.prepare("SELECT id, nome, predefinito_per, attivo FROM conti_acquisto ORDER BY nome")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nome": r.get::<_, Option<String>>(1)?,
                "predefinitoPer": r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                "attivo": r.get::<_, i64>(3)? == 1,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO conti_acquisto (nome, predefinito_per, attivo) VALUES (?1,?2,?3)",
        params![
            str_field(&body, "nome"),
            str_or(&body, "predefinitoPer", ""),
            bool_or_true(&body, "attivo") as i64,
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE conti_acquisto SET nome=?1, predefinito_per=?2, attivo=?3 WHERE id=?4",
        params![
            str_field(&body, "nome"),
            str_or(&body, "predefinitoPer", ""),
            bool_field(&body, "attivo") as i64,
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM conti_acquisto WHERE id=?1", params![id])?;
    Ok(Json(json!({ "success": true })))
}
