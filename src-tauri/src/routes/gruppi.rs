//! /api/gruppi — parità con routes/gruppi.js (gruppi utenti per tenant, su auth.db).
//! In offline l'utente è OWNER: come in Node, OWNER non è ADMIN/SUPERADMIN, quindi
//! POST/PUT/DELETE e /:id/membri restituiscono 403 (parità fedele).

use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::auth::CurrentUser;
use crate::db::AppState;
use crate::error::{ApiError, ApiResult};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/me/mine", get(mine))
        .route("/:id", get(detail).put(update).delete(remove))
        .route("/:id/membri", put(set_membri))
}

fn is_admin(u: &CurrentUser) -> bool {
    u.ruolo == "SUPERADMIN" || u.ruolo == "ADMIN"
}
fn admin_guard(u: &CurrentUser) -> Option<ApiError> {
    if !is_admin(u) {
        Some(ApiError::Status(axum::http::StatusCode::FORBIDDEN, "Solo ADMIN o SUPERADMIN".into()))
    } else {
        None
    }
}

fn list_gruppi(c: &Connection, tenant: &str) -> rusqlite::Result<Vec<Value>> {
    let mut stmt = c.prepare(
        "SELECT g.id, g.nome, g.descrizione, g.created_at,
                (SELECT COUNT(*) FROM user_gruppi WHERE gruppo_id=g.id) AS num_membri
         FROM gruppi g WHERE g.tenant_slug=? ORDER BY g.nome",
    )?;
    let v: Vec<Value> = stmt
        .query_map(params![tenant], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nome": r.get::<_, Option<String>>(1)?,
                "descrizione": r.get::<_, Option<String>>(2)?,
                "created_at": r.get::<_, Option<String>>(3)?,
                "num_membri": r.get::<_, i64>(4)?,
            }))
        })?
        .collect::<Result<_, _>>()?;
    Ok(v)
}

fn get_gruppo(c: &Connection, tenant: &str, id: i64) -> rusqlite::Result<Option<Value>> {
    let row = c
        .query_row(
            "SELECT id, tenant_slug, nome, descrizione, created_at FROM gruppi WHERE id=? AND tenant_slug=?",
            params![id, tenant],
            |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?,
                    "tenant_slug": r.get::<_, Option<String>>(1)?,
                    "nome": r.get::<_, Option<String>>(2)?,
                    "descrizione": r.get::<_, Option<String>>(3)?,
                    "created_at": r.get::<_, Option<String>>(4)?,
                }))
            },
        )
        .ok();
    let mut row = match row {
        Some(r) => r,
        None => return Ok(None),
    };
    let mut stmt = c.prepare(
        "SELECT u.id, u.username, u.nome, u.email, u.ruolo, u.attivo
         FROM user_gruppi ug JOIN users u ON u.id=ug.user_id
         WHERE ug.gruppo_id=? ORDER BY u.username",
    )?;
    let membri: Vec<Value> = stmt
        .query_map(params![id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "username": r.get::<_, Option<String>>(1)?,
                "nome": r.get::<_, Option<String>>(2)?,
                "email": r.get::<_, Option<String>>(3)?,
                "ruolo": r.get::<_, Option<String>>(4)?,
                "attivo": r.get::<_, i64>(5)?,
            }))
        })?
        .collect::<Result<_, _>>()?;
    row.as_object_mut().unwrap().insert("membri".into(), Value::Array(membri));
    Ok(Some(row))
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    let out = state.with_auth(|c| Ok(list_gruppi(c, &user.tenant)?))?;
    Ok(Json(Value::Array(out)))
}

async fn detail(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    let g = state.with_auth(|c| Ok(get_gruppo(c, &user.tenant, id)?))?;
    match g {
        Some(v) => Ok(Json(v)),
        None => Err(ApiError::Status(axum::http::StatusCode::NOT_FOUND, "Gruppo non trovato".into())),
    }
}

async fn mine(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    let out = state.with_auth(|c| {
        let mut stmt = c.prepare(
            "SELECT g.id, g.nome FROM user_gruppi ug
             JOIN gruppi g ON g.id=ug.gruppo_id
             WHERE ug.user_id=? ORDER BY g.nome",
        )?;
        let v: Vec<Value> = stmt
            .query_map(params![user.id], |r| {
                Ok(json!({ "id": r.get::<_, i64>(0)?, "nome": r.get::<_, Option<String>>(1)? }))
            })?
            .collect::<Result<_, _>>()?;
        Ok(v)
    })?;
    Ok(Json(Value::Array(out)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if let Some(e) = admin_guard(&user) {
        return Err(e);
    }
    let nome = body.get("nome").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if nome.is_empty() {
        return Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "Nome gruppo obbligatorio".into()));
    }
    let descrizione = body.get("descrizione").and_then(Value::as_str).unwrap_or("").to_string();
    let tenant = user.tenant.clone();
    let res = state.with_auth(|c| {
        match c.execute(
            "INSERT INTO gruppi (tenant_slug, nome, descrizione) VALUES (?,?,?)",
            params![tenant, nome, descrizione],
        ) {
            Ok(_) => {
                let id = c.last_insert_rowid();
                Ok(Ok(get_gruppo(c, &tenant, id)?.unwrap_or(Value::Null)))
            }
            Err(e) => Ok(Err(e.to_string())),
        }
    })?;
    match res {
        Ok(v) => Ok(Json(v)),
        Err(msg) if msg.contains("UNIQUE") => {
            Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "Nome gruppo già usato".into()))
        }
        Err(msg) => Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, msg)),
    }
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if let Some(e) = admin_guard(&user) {
        return Err(e);
    }
    let nome = body.get("nome").and_then(Value::as_str).map(|s| s.to_string());
    let descrizione = body.get("descrizione").and_then(Value::as_str).map(|s| s.to_string());
    let tenant = user.tenant.clone();
    let res = state.with_auth(|c| {
        let existing = get_gruppo(c, &tenant, id)?;
        let g = match existing {
            Some(g) => g,
            None => return Ok(Err("Gruppo non trovato".to_string())),
        };
        let cur_nome = g.get("nome").and_then(Value::as_str).unwrap_or("").to_string();
        let cur_desc = g.get("descrizione").and_then(Value::as_str).unwrap_or("").to_string();
        let new_nome = nome.clone().unwrap_or(cur_nome);
        let new_desc = descrizione.clone().unwrap_or(cur_desc);
        c.execute("UPDATE gruppi SET nome=?, descrizione=? WHERE id=?", params![new_nome, new_desc, id])?;
        Ok(Ok(get_gruppo(c, &tenant, id)?.unwrap_or(Value::Null)))
    })?;
    match res {
        Ok(v) => Ok(Json(v)),
        Err(msg) => Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, msg)),
    }
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if let Some(e) = admin_guard(&user) {
        return Err(e);
    }
    let tenant = user.tenant.clone();
    state.with_auth(|c| {
        if get_gruppo(c, &tenant, id)?.is_some() {
            c.execute("DELETE FROM gruppi WHERE id=?", params![id])?;
        }
        Ok(())
    })?;
    Ok(Json(json!({ "success": true })))
}

async fn set_membri(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if let Some(e) = admin_guard(&user) {
        return Err(e);
    }
    // userIds: array di interi (Number), come .map(Number).filter(Boolean)
    let ids: Vec<i64> = body
        .get("userIds")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_i64).filter(|n| *n != 0).collect())
        .unwrap_or_default();
    let tenant = user.tenant.clone();
    let res = state.with_auth(|c| {
        if get_gruppo(c, &tenant, id)?.is_none() {
            return Ok(Err("Gruppo non trovato".to_string()));
        }
        // tieni solo gli userIds del tenant
        let mut valid = Vec::new();
        for uid in &ids {
            let ok: Option<i64> = c
                .query_row(
                    "SELECT id FROM users WHERE tenant_slug=? AND id=?",
                    params![tenant, uid],
                    |r| r.get(0),
                )
                .ok();
            if let Some(v) = ok {
                valid.push(v);
            }
        }
        c.execute("DELETE FROM user_gruppi WHERE gruppo_id=?", params![id])?;
        for uid in valid {
            c.execute(
                "INSERT OR IGNORE INTO user_gruppi (user_id, gruppo_id) VALUES (?,?)",
                params![uid, id],
            )?;
        }
        Ok(Ok(get_gruppo(c, &tenant, id)?.unwrap_or(Value::Null)))
    })?;
    match res {
        Ok(v) => Ok(Json(v)),
        Err(msg) => Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, msg)),
    }
}
