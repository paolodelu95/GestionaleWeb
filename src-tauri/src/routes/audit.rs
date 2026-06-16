//! /api/audit — parità con routes/audit.js (storico modifiche entità)

use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::tenant_conn;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/recent", get(recent))
        .route("/:entity_type/:entity_id", get(by_entity))
}

fn try_parse(s: &str) -> Value {
    serde_json::from_str(if s.is_empty() { "{}" } else { s }).unwrap_or_else(|_| json!({}))
}

async fn by_entity(
    State(state): State<AppState>,
    Path((entity_type, entity_id)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, entity_type, entity_id, action, payload, created_at
         FROM audit_log
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 100",
    )?;
    let rows = stmt
        .query_map(params![entity_type, entity_id], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn recent(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let limit = q
        .get("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(50)
        .clamp(1, 200);
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, entity_type, entity_id, action, payload, created_at
         FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?",
    )?;
    let rows = stmt
        .query_map(params![limit], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "entityType": r.get::<_, Option<String>>(1)?,
        "entityId": r.get::<_, i64>(2)?,
        "action": r.get::<_, Option<String>>(3)?,
        "payload": try_parse(&r.get::<_, Option<String>>(4)?.unwrap_or_default()),
        "createdAt": r.get::<_, Option<String>>(5)?,
    }))
}
