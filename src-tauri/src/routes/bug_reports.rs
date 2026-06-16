//! /api/bug-reports — parità con routes/bugReports.js (segnalazioni).
//! Nota: la notifica email (best-effort in Node, no-op se SMTP non configurato)
//! è demandata al modulo email; qui resta non bloccante e non influisce sulla
//! risposta HTTP, quindi è omessa per la parità del payload.

use axum::{
    extract::{Path, State},
    routing::{get, patch},
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
        .route("/:id/risolto", patch(risolto))
        .route("/:id/riapri", patch(riapri))
        .route("/:id", axum::routing::delete(remove))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let titolo = body.get("titolo").and_then(Value::as_str).unwrap_or("");
    let descrizione = body.get("descrizione").and_then(Value::as_str).unwrap_or("");
    if titolo.is_empty() || descrizione.is_empty() {
        return Err(ApiError::Status(
            axum::http::StatusCode::BAD_REQUEST,
            "titolo e descrizione obbligatori".into(),
        ));
    }
    let prio_in = body.get("priorita").and_then(Value::as_str).unwrap_or("");
    let prio = if ["BASSA", "MEDIA", "ALTA"].contains(&prio_in) { prio_in } else { "MEDIA" };
    let pagina = body.get("pagina").and_then(Value::as_str).unwrap_or("");

    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO bug_reports (titolo, descrizione, pagina, priorita) VALUES (?, ?, ?, ?)",
        params![titolo, descrizione, pagina, prio],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, titolo, descrizione, pagina, priorita, stato, created_at, resolved_at
         FROM bug_reports ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "titolo": r.get::<_, Option<String>>(1)?,
                "descrizione": r.get::<_, Option<String>>(2)?,
                "pagina": r.get::<_, Option<String>>(3)?,
                "priorita": r.get::<_, Option<String>>(4)?,
                "stato": r.get::<_, Option<String>>(5)?,
                "created_at": r.get::<_, Option<String>>(6)?,
                "resolved_at": r.get::<_, Option<String>>(7)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn risolto(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let exists: Option<i64> = conn
        .query_row("SELECT id FROM bug_reports WHERE id=?", params![id], |r| r.get(0))
        .ok();
    if exists.is_none() {
        return Err(ApiError::Status(axum::http::StatusCode::NOT_FOUND, "Non trovato".into()));
    }
    conn.execute(
        "UPDATE bug_reports SET stato='RISOLTO', resolved_at=datetime('now') WHERE id=?",
        params![id],
    )?;
    Ok(Json(json!({ "ok": true })))
}

async fn riapri(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE bug_reports SET stato='APERTO', resolved_at=NULL WHERE id=?",
        params![id],
    )?;
    Ok(Json(json!({ "ok": true })))
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM bug_reports WHERE id=?", params![id])?;
    Ok(Json(json!({ "ok": true })))
}
