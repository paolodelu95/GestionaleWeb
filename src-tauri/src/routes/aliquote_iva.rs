//! /api/aliquote-iva — parità con routes/aliquoteIva.js

use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::{bool_field, str_field, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
}

// Ordinamento per categoria fiscale standardizzata, poi valore DESC, poi codice.
const ORDER: &str = "ORDER BY
    CASE categoria
      WHEN 'Imponibile' THEN 1
      WHEN 'Acq. reverse charge' THEN 2
      WHEN 'Split payment' THEN 3
      WHEN 'N1: Escluso art. 15' THEN 4
      WHEN 'N2.1' THEN 5 WHEN 'N2.2' THEN 6
      WHEN 'N3.1' THEN 7 WHEN 'N3.2' THEN 8 WHEN 'N3.3' THEN 9 WHEN 'N3.4' THEN 10 WHEN 'N3.5' THEN 11
      WHEN 'N4: Esente' THEN 12
      WHEN 'N5: Regime del margine' THEN 13
      WHEN 'N6' THEN 14 WHEN 'N6.1' THEN 15 WHEN 'N6.3' THEN 16 WHEN 'N6.4' THEN 17
      WHEN 'N6.5' THEN 18 WHEN 'N6.6' THEN 19 WHEN 'N6.7' THEN 20
      ELSE 99
    END, valore DESC, codice";

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let sql = format!(
        "SELECT id, nome, valore, codice, categoria, descrizione, natura, note, predefinito, attiva \
         FROM aliquote_iva {ORDER}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nome": r.get::<_, Option<String>>(1)?,
                "valore": crate::web::opt_num(r.get::<_, Option<f64>>(2)?),
                "codice": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                "categoria": r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                "descrizione": r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                "natura": r.get::<_, Option<String>>(6)?,
                "note": r.get::<_, Option<String>>(7)?.unwrap_or_default(),
                "predefinito": r.get::<_, i64>(8)? == 1,
                "attiva": r.get::<_, i64>(9)? == 1,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO aliquote_iva \
         (nome, valore, codice, categoria, descrizione, natura, note, predefinito, attiva) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            str_field(&body, "nome"),
            body.get("valore").and_then(Value::as_f64),
            str_field(&body, "codice"),
            str_field(&body, "categoria"),
            str_field(&body, "descrizione"),
            crate::web::opt_str(&body, "natura"),
            str_field(&body, "note"),
            bool_field(&body, "predefinito") as i64,
            bool_field(&body, "attiva") as i64,
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
        "UPDATE aliquote_iva SET nome=?1, valore=?2, codice=?3, categoria=?4, descrizione=?5, \
         natura=?6, note=?7, predefinito=?8, attiva=?9 WHERE id=?10",
        params![
            str_field(&body, "nome"),
            body.get("valore").and_then(Value::as_f64),
            str_field(&body, "codice"),
            str_field(&body, "categoria"),
            str_field(&body, "descrizione"),
            crate::web::opt_str(&body, "natura"),
            str_field(&body, "note"),
            bool_field(&body, "predefinito") as i64,
            bool_field(&body, "attiva") as i64,
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM aliquote_iva WHERE id=?1", params![id])?;
    Ok(Json(json!({ "success": true })))
}
