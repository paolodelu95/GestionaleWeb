//! /api/categorie-prodotto — parità con routes/categorieProdotto.js

use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::{opt_i64, str_field, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt =
        conn.prepare("SELECT id, nome, aliquota_iva_id FROM categorie_prodotto ORDER BY nome")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nome": r.get::<_, Option<String>>(1)?,
                "aliquotaIvaId": r.get::<_, Option<i64>>(2)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO categorie_prodotto (nome, aliquota_iva_id) VALUES (?1, ?2)",
        params![str_field(&body, "nome"), opt_i64(&body, "aliquotaIvaId")],
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
        "UPDATE categorie_prodotto SET nome=?1, aliquota_iva_id=?2 WHERE id=?3",
        params![str_field(&body, "nome"), opt_i64(&body, "aliquotaIvaId"), id],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM categorie_prodotto WHERE id=?1", params![id])?;
    Ok(Json(json!({ "success": true })))
}
