//! /api/causali — parità con routes/causali.js (causali pagamento)

use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::{str_field, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt =
        conn.prepare("SELECT id, nome, ordine, attivo FROM causali_pagamento ORDER BY ordine, nome")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nome": r.get::<_, Option<String>>(1)?,
                "ordine": r.get::<_, Option<i64>>(2)?.unwrap_or(0),
                // attivo !== 0: NULL e qualsiasi non-zero → true.
                "attivo": !matches!(r.get::<_, Option<i64>>(3)?, Some(0)),
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let nome = str_field(&body, "nome");
    if nome.is_empty() {
        return Err(ApiError::bad_request("Nome causale mancante"));
    }
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let max: i64 =
        conn.query_row("SELECT COALESCE(MAX(ordine),0) FROM causali_pagamento", [], |r| {
            r.get(0)
        })?;
    conn.execute(
        "INSERT INTO causali_pagamento (nome, ordine) VALUES (?1, ?2)",
        params![nome, max + 1],
    )
    // Node: qualsiasi errore (tipicamente UNIQUE) → 400 "Causale già esistente".
    .map_err(|_| ApiError::bad_request("Causale già esistente"))?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let nome = str_field(&body, "nome");
    if nome.is_empty() {
        return Err(ApiError::bad_request("Nome causale mancante"));
    }
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE causali_pagamento SET nome=?1 WHERE id=?2",
        params![nome, id],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM causali_pagamento WHERE id=?1", params![id])?;
    Ok(Json(json!({ "success": true })))
}
