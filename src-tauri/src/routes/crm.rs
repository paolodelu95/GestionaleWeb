//! /api/crm — parità con routes/crm.js (pipeline opportunità: stage, opportunità,
//! attività). In offline l'utente OWNER supera tutti i requireRole.

use axum::{
    extract::{Path, State},
    routing::{get, patch},
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::{self, num, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/stages", get(list_stages).post(create_stage))
        .route("/stages/:id", axum::routing::put(update_stage).delete(delete_stage))
        .route("/opportunita", get(list_opp).post(create_opp))
        .route("/opportunita/:id", axum::routing::put(update_opp).delete(delete_opp))
        .route("/opportunita/:id/stage", patch(move_opp))
        .route("/opportunita/:id/attivita", get(list_att).post(create_att))
        .route("/attivita/:id", patch(update_att).delete(delete_att))
}

// ── Stage ───────────────────────────────────────────────────────────────────

async fn list_stages(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, nome, ordine, colore, vinto, perso FROM crm_stage ORDER BY ordine, id")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nome": r.get::<_, Option<String>>(1)?,
                "ordine": r.get::<_, Option<i64>>(2)?,
                "colore": r.get::<_, Option<String>>(3)?,
                "vinto": r.get::<_, Option<i64>>(4)? == Some(1),
                "perso": r.get::<_, Option<i64>>(5)? == Some(1),
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create_stage(State(state): State<AppState>, Json(s): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO crm_stage (nome, ordine, colore, vinto, perso) VALUES (?,?,?,?,?)",
        params![
            s.get("nome").and_then(Value::as_str),
            s.get("ordine").and_then(Value::as_i64).unwrap_or(0),
            s.get("colore").and_then(Value::as_str).filter(|x| !x.is_empty()).unwrap_or("#6366f1"),
            if web::truthy(s.get("vinto")) { 1 } else { 0 },
            if web::truthy(s.get("perso")) { 1 } else { 0 },
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update_stage(State(state): State<AppState>, Path(id): Path<i64>, Json(s): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE crm_stage SET nome=?, ordine=?, colore=?, vinto=?, perso=? WHERE id=?",
        params![
            s.get("nome").and_then(Value::as_str),
            s.get("ordine").and_then(Value::as_i64).unwrap_or(0),
            s.get("colore").and_then(Value::as_str).filter(|x| !x.is_empty()).unwrap_or("#6366f1"),
            if web::truthy(s.get("vinto")) { 1 } else { 0 },
            if web::truthy(s.get("perso")) { 1 } else { 0 },
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_stage(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("UPDATE crm_opportunita SET stage_id=NULL WHERE stage_id=?", params![id])?;
    conn.execute("DELETE FROM crm_stage WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}

// ── Opportunità ─────────────────────────────────────────────────────────────

fn opp_dto(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>("id")?,
        "titolo": r.get::<_, Option<String>>("titolo")?,
        "clienteId": r.get::<_, Option<i64>>("cliente_id")?,
        "clienteNome": r.get::<_, Option<String>>("cliente_nome")?.unwrap_or_default(),
        "contatto": r.get::<_, Option<String>>("contatto")?,
        "email": r.get::<_, Option<String>>("email")?,
        "telefono": r.get::<_, Option<String>>("telefono")?,
        "stageId": r.get::<_, Option<i64>>("stage_id")?,
        "stageName": r.get::<_, Option<String>>("stage_nome")?.unwrap_or_default(),
        "stageColor": r.get::<_, Option<String>>("stage_colore")?.filter(|s| !s.is_empty()).unwrap_or_else(|| "#6366f1".into()),
        "valore": num(r.get::<_, Option<f64>>("valore")?.unwrap_or(0.0)),
        "probabilita": r.get::<_, Option<i64>>("probabilita")?,
        "dataPrevista": r.get::<_, Option<String>>("data_prevista")?,
        "assegnatario": r.get::<_, Option<String>>("assegnatario")?,
        "note": r.get::<_, Option<String>>("note")?,
        "ordine": r.get::<_, Option<i64>>("ordine")?,
        "createdAt": r.get::<_, Option<String>>("created_at")?,
        "updatedAt": r.get::<_, Option<String>>("updated_at")?,
    }))
}

async fn list_opp(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT o.*, c.ragione_sociale AS cliente_nome, s.nome AS stage_nome, s.colore AS stage_colore
         FROM crm_opportunita o
         LEFT JOIN clienti c ON c.id = o.cliente_id
         LEFT JOIN crm_stage s ON s.id = o.stage_id
         ORDER BY o.ordine, o.updated_at DESC",
    )?;
    let rows = stmt.query_map([], opp_dto)?.collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create_opp(State(state): State<AppState>, Json(o): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO crm_opportunita
         (titolo, cliente_id, contatto, email, telefono, stage_id, valore, probabilita, data_prevista, assegnatario, note, ordine)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            o.get("titolo").and_then(Value::as_str),
            o.get("clienteId").and_then(Value::as_i64),
            o.get("contatto").and_then(Value::as_str).unwrap_or(""),
            o.get("email").and_then(Value::as_str).unwrap_or(""),
            o.get("telefono").and_then(Value::as_str).unwrap_or(""),
            o.get("stageId").and_then(Value::as_i64),
            o.get("valore").and_then(Value::as_f64).unwrap_or(0.0),
            o.get("probabilita").and_then(Value::as_i64).unwrap_or(50),
            o.get("dataPrevista").and_then(Value::as_str).unwrap_or(""),
            o.get("assegnatario").and_then(Value::as_str).unwrap_or(""),
            o.get("note").and_then(Value::as_str).unwrap_or(""),
            o.get("ordine").and_then(Value::as_i64).unwrap_or(0),
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update_opp(State(state): State<AppState>, Path(id): Path<i64>, Json(o): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE crm_opportunita SET titolo=?, cliente_id=?, contatto=?, email=?, telefono=?, stage_id=?,
           valore=?, probabilita=?, data_prevista=?, assegnatario=?, note=?, ordine=?, updated_at=datetime('now')
         WHERE id=?",
        params![
            o.get("titolo").and_then(Value::as_str),
            o.get("clienteId").and_then(Value::as_i64),
            o.get("contatto").and_then(Value::as_str).unwrap_or(""),
            o.get("email").and_then(Value::as_str).unwrap_or(""),
            o.get("telefono").and_then(Value::as_str).unwrap_or(""),
            o.get("stageId").and_then(Value::as_i64),
            o.get("valore").and_then(Value::as_f64).unwrap_or(0.0),
            o.get("probabilita").and_then(Value::as_i64).unwrap_or(50),
            o.get("dataPrevista").and_then(Value::as_str).unwrap_or(""),
            o.get("assegnatario").and_then(Value::as_str).unwrap_or(""),
            o.get("note").and_then(Value::as_str).unwrap_or(""),
            o.get("ordine").and_then(Value::as_i64).unwrap_or(0),
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn move_opp(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE crm_opportunita SET stage_id=?, ordine=?, updated_at=datetime('now') WHERE id=?",
        params![
            b.get("stageId").and_then(Value::as_i64),
            b.get("ordine").and_then(Value::as_i64).unwrap_or(0),
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_opp(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM crm_opportunita WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}

// ── Attività ────────────────────────────────────────────────────────────────

async fn list_att(State(state): State<AppState>, Path(opp_id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, opportunita_id, tipo, titolo, descrizione, data_pianificata, data_completamento, completata, created_at
         FROM crm_attivita WHERE opportunita_id=? ORDER BY data_pianificata DESC, id DESC",
    )?;
    let rows = stmt
        .query_map(params![opp_id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "opportunita_id": r.get::<_, Option<i64>>(1)?,
                "tipo": r.get::<_, Option<String>>(2)?,
                "titolo": r.get::<_, Option<String>>(3)?,
                "descrizione": r.get::<_, Option<String>>(4)?,
                "data_pianificata": r.get::<_, Option<String>>(5)?,
                "data_completamento": r.get::<_, Option<String>>(6)?,
                "completata": r.get::<_, Option<i64>>(7)? == Some(1),
                "created_at": r.get::<_, Option<String>>(8)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create_att(State(state): State<AppState>, Path(opp_id): Path<i64>, Json(a): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO crm_attivita (opportunita_id, tipo, titolo, descrizione, data_pianificata, data_completamento, completata)
         VALUES (?,?,?,?,?,?,?)",
        params![
            opp_id,
            a.get("tipo").and_then(Value::as_str),
            a.get("titolo").and_then(Value::as_str),
            a.get("descrizione").and_then(Value::as_str).unwrap_or(""),
            a.get("dataPianificata").and_then(Value::as_str),
            a.get("dataCompletamento").and_then(Value::as_str),
            if web::truthy(a.get("completata")) { 1 } else { 0 },
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update_att(State(state): State<AppState>, Path(id): Path<i64>, Json(a): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let cur = conn
        .query_row(
            "SELECT titolo, descrizione, data_pianificata, data_completamento, completata FROM crm_attivita WHERE id=?",
            params![id],
            |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                ))
            },
        )
        .ok();
    let (titolo, descr, dp, dc, comp) = match cur {
        Some(t) => t,
        None => return Err(ApiError::Status(axum::http::StatusCode::NOT_FOUND, "Non trovata".into())),
    };
    let n_titolo = a.get("titolo").and_then(Value::as_str).map(String::from).or(titolo);
    let n_descr = a.get("descrizione").and_then(Value::as_str).map(String::from).or(descr);
    let n_dp = a.get("dataPianificata").and_then(Value::as_str).map(String::from).or(dp);
    let n_dc = a.get("dataCompletamento").and_then(Value::as_str).map(String::from).or(dc);
    let n_comp = if a.get("completata").is_some() {
        if web::truthy(a.get("completata")) { 1 } else { 0 }
    } else {
        comp.unwrap_or(0)
    };
    conn.execute(
        "UPDATE crm_attivita SET titolo=?, descrizione=?, data_pianificata=?, data_completamento=?, completata=? WHERE id=?",
        params![n_titolo, n_descr, n_dp, n_dc, n_comp, id],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_att(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM crm_attivita WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}
