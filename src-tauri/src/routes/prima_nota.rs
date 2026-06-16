//! /api/prima-nota — prima nota cassa/banca. Parità con routes/primaNota.js.
//! In offline la scrittura è sempre consentita (utente OWNER).

use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use rusqlite::{params, OptionalExtension, Row};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::{num, opt_num, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", axum::routing::put(update).delete(remove))
}

fn to_dto(r: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>("id")?,
        "data": r.get::<_, Option<String>>("data")?,
        "tipo": r.get::<_, Option<String>>("tipo")?,
        "causale": r.get::<_, Option<String>>("causale")?,
        "importo": opt_num(r.get::<_, Option<f64>>("importo")?),
        "conto": r.get::<_, Option<String>>("conto")?,
        "riferimentoTipo": r.get::<_, Option<String>>("riferimento_tipo")?.unwrap_or_default(),
        "riferimentoId": r.get::<_, Option<i64>>("riferimento_id")?,
        "note": r.get::<_, Option<String>>("note")?.unwrap_or_default(),
        "createdAt": r.get::<_, Option<String>>("created_at")?,
    }))
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mese = q.get("mese").filter(|m| is_yyyymm(m));
    let sql = if mese.is_some() {
        "SELECT * FROM prima_nota WHERE strftime('%Y-%m', data) = ?1 ORDER BY data DESC, id DESC"
    } else {
        "SELECT * FROM prima_nota ORDER BY data DESC, id DESC"
    };
    let mut stmt = conn.prepare(sql)?;
    let map = |r: &Row| -> rusqlite::Result<(Value, String, f64)> {
        Ok((to_dto(r)?, r.get::<_, Option<String>>("tipo")?.unwrap_or_default(), r.get::<_, Option<f64>>("importo")?.unwrap_or(0.0)))
    };
    let rows: Vec<(Value, String, f64)> = match mese {
        Some(m) => stmt.query_map([m], map)?.collect::<Result<_, _>>()?,
        None => stmt.query_map([], map)?.collect::<Result<_, _>>()?,
    };
    let entrate: f64 = rows.iter().filter(|(_, t, _)| t == "ENTRATA").map(|(_, _, i)| i).sum();
    let uscite: f64 = rows.iter().filter(|(_, t, _)| t == "USCITA").map(|(_, _, i)| i).sum();
    let entries: Vec<Value> = rows.into_iter().map(|(d, _, _)| d).collect();
    Ok(Json(json!({
        "entries": entries,
        "totaleEntrate": num(entrate),
        "totaleUscite": num(uscite),
        "saldo": num(entrate - uscite),
    })))
}

async fn create(State(state): State<AppState>, Json(b): Json<Value>) -> ApiResult<Response> {
    if let Some(e) = valida(&b) {
        return Err(ApiError::bad_request(e));
    }
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO prima_nota (data, tipo, causale, importo, conto, riferimento_tipo, riferimento_id, note) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            b.get("data").and_then(Value::as_str),
            b.get("tipo").and_then(Value::as_str),
            b.get("causale").and_then(Value::as_str),
            b.get("importo").and_then(Value::as_f64),
            conto_db(&b),
            str_def(&b, "riferimentoTipo"),
            opt_i64(&b, "riferimentoId"),
            str_def(&b, "note"),
        ],
    )?;
    let id = conn.last_insert_rowid();
    let dto = conn.query_row("SELECT * FROM prima_nota WHERE id=?1", [id], |r| to_dto(r))?;
    Ok((StatusCode::CREATED, Json(dto)).into_response())
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    if let Some(e) = valida(&b) {
        return Err(ApiError::bad_request(e));
    }
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let changes = conn.execute(
        "UPDATE prima_nota SET data=?1, tipo=?2, causale=?3, importo=?4, conto=?5, riferimento_tipo=?6, riferimento_id=?7, note=?8 WHERE id=?9",
        params![
            b.get("data").and_then(Value::as_str),
            b.get("tipo").and_then(Value::as_str),
            b.get("causale").and_then(Value::as_str),
            b.get("importo").and_then(Value::as_f64),
            conto_db(&b),
            str_def(&b, "riferimentoTipo"),
            opt_i64(&b, "riferimentoId"),
            str_def(&b, "note"),
            id,
        ],
    )?;
    if changes == 0 {
        return Err(ApiError::not_found("Registrazione non trovata"));
    }
    let dto = conn.query_row("SELECT * FROM prima_nota WHERE id=?1", [id], |r| to_dto(r))?;
    Ok(Json(dto))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let changes = conn.execute("DELETE FROM prima_nota WHERE id=?1", [id])?;
    if changes == 0 {
        return Err(ApiError::not_found("Registrazione non trovata"));
    }
    Ok(Json(json!({ "success": true })))
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn valida(b: &Value) -> Option<&'static str> {
    let data_ok = b.get("data").and_then(Value::as_str).filter(|s| !s.is_empty()).is_some();
    let tipo = b.get("tipo").and_then(Value::as_str).unwrap_or("");
    let causale_ok = b.get("causale").and_then(Value::as_str).filter(|s| !s.is_empty()).is_some();
    let importo_present = b.get("importo").map(|v| !v.is_null()).unwrap_or(false);
    if !data_ok || tipo.is_empty() || !causale_ok || !importo_present {
        return Some("Campi obbligatori: data, tipo, causale, importo");
    }
    if tipo != "ENTRATA" && tipo != "USCITA" {
        return Some("tipo deve essere ENTRATA o USCITA");
    }
    if b.get("importo").and_then(Value::as_f64).unwrap_or(0.0) <= 0.0 {
        return Some("importo deve essere maggiore di 0");
    }
    None
}

fn conto_db(b: &Value) -> String {
    match b.get("conto").and_then(Value::as_str) {
        Some(c) if c == "CASSA" || c == "BANCA" => c.to_string(),
        _ => "CASSA".to_string(),
    }
}
fn str_def(b: &Value, k: &str) -> String {
    b.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}
fn opt_i64(b: &Value, k: &str) -> Option<i64> {
    b.get(k).and_then(Value::as_i64).filter(|&v| v != 0)
}
fn is_yyyymm(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[4] == b'-' && b[0..4].iter().all(u8::is_ascii_digit) && b[5..7].iter().all(u8::is_ascii_digit)
}
