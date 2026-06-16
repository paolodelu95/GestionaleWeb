//! /api/tipi-pagamento — parità con routes/tipiPagamento.js

use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::{bool_field, bool_or_true, num_or, str_field, str_or, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, nome, conto, giorni_scadenza, fine_mese, immediato, attivo \
         FROM tipi_pagamento ORDER BY id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nome": r.get::<_, Option<String>>(1)?,
                "conto": r.get::<_, Option<String>>(2)?,
                "giorniScadenza": r.get::<_, Option<i64>>(3)?,
                "fineMese": r.get::<_, i64>(4)? == 1,
                "immediato": r.get::<_, i64>(5)? == 1,
                "attivo": r.get::<_, i64>(6)? == 1,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO tipi_pagamento (nome, conto, giorni_scadenza, fine_mese, immediato, attivo) \
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![
            str_field(&body, "nome"),
            str_or(&body, "conto", "BANCA"),
            num_or(&body, "giorniScadenza", 0.0) as i64,
            bool_field(&body, "fineMese") as i64,
            bool_field(&body, "immediato") as i64,
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
        "UPDATE tipi_pagamento SET nome=?1, conto=?2, giorni_scadenza=?3, fine_mese=?4, \
         immediato=?5, attivo=?6 WHERE id=?7",
        params![
            str_field(&body, "nome"),
            str_or(&body, "conto", "BANCA"),
            num_or(&body, "giorniScadenza", 0.0) as i64,
            bool_field(&body, "fineMese") as i64,
            bool_field(&body, "immediato") as i64,
            bool_or_true(&body, "attivo") as i64,
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM tipi_pagamento WHERE id=?1", params![id])?;
    Ok(Json(json!({ "success": true })))
}
