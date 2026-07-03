//! /api/kit — kit di righe riutilizzabili (bundle di righe salvate) inseribili nei documenti.
//! Le righe sono conservate come blob JSON, incluse nei backup del tenant.

use axum::extract::{Path, State};
use axum::routing::{delete, get};
use axum::{Json, Router};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::tenant_conn;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(lista).post(crea))
        .route("/:id", delete(elimina))
}

#[derive(Deserialize)]
struct KitReq {
    nome: String,
    righe: Value,
}

/// GET /api/kit — elenco dei kit (con le righe), ordinati per nome.
async fn lista(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, nome, righe, creato_il FROM kit ORDER BY nome COLLATE NOCASE",
    )?;
    let mapped = stmt.query_map([], |r| {
        let righe_str: String = r.get(2)?;
        let righe = serde_json::from_str::<Value>(&righe_str).unwrap_or_else(|_| json!([]));
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "nome": r.get::<_, String>(1)?,
            "righe": righe,
            "creatoIl": r.get::<_, Option<String>>(3)?,
        }))
    })?;
    let mut out = Vec::new();
    for x in mapped {
        out.push(x?);
    }
    Ok(Json(Value::Array(out)))
}

/// POST /api/kit — crea un kit da un nome e un array di righe.
async fn crea(State(state): State<AppState>, Json(b): Json<KitReq>) -> ApiResult<Json<Value>> {
    let nome = b.nome.trim();
    if nome.is_empty() {
        return Err(ApiError::bad_request("Nome kit mancante"));
    }
    let righe = serde_json::to_string(&b.righe).unwrap_or_else(|_| "[]".to_string());
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO kit (nome, righe, creato_il) VALUES (?1, ?2, datetime('now'))",
        params![nome, righe],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid(), "nome": nome })))
}

/// DELETE /api/kit/:id — elimina un kit.
async fn elimina(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM kit WHERE id = ?1", params![id])?;
    Ok(Json(json!({ "success": true })))
}
