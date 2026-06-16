//! /api/utenti — parità con routes/utenti.js (gestione utenti, su auth.db).
//! In offline l'utente è OWNER (isAdmin=true, isOwner=true, isSuper=false): può
//! gestire gli utenti del proprio tenant ma non i SUPERADMIN né cambiare tenant.

use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::auth::CurrentUser;
use crate::db::AppState;
use crate::error::{ApiError, ApiResult};

const SALT: u32 = 10;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", axum::routing::put(update).delete(remove))
}

fn is_super(u: &CurrentUser) -> bool {
    u.ruolo == "SUPERADMIN"
}
fn is_owner(u: &CurrentUser) -> bool {
    u.ruolo == "OWNER" || is_super(u)
}
fn is_admin(u: &CurrentUser) -> bool {
    matches!(u.ruolo.as_str(), "ADMIN" | "OWNER" | "SUPERADMIN")
}

fn forbidden(msg: &str) -> ApiError {
    ApiError::Status(axum::http::StatusCode::FORBIDDEN, msg.into())
}
fn bad(msg: &str) -> ApiError {
    ApiError::Status(axum::http::StatusCode::BAD_REQUEST, msg.into())
}
fn not_found(msg: &str) -> ApiError {
    ApiError::Status(axum::http::StatusCode::NOT_FOUND, msg.into())
}

/// Verità JS (`x ? 1 : 0`).
fn js_truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|x| x != 0.0).unwrap_or(false),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_)) | Some(Value::Object(_)) => true,
        _ => false, // null / undefined
    }
}

/// `body[key]` come `x ?? default`: null/assente → None (cioè default), stringa → Some.
fn coalesce_str(body: &Value, key: &str) -> Option<String> {
    match body.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}

fn user_dto(c: &Connection, id: i64) -> rusqlite::Result<Option<Value>> {
    c.query_row(
        "SELECT id, username, nome, email, ruolo, tenant_slug, attivo FROM users WHERE id=?",
        params![id],
        |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "username": r.get::<_, Option<String>>(1)?,
                "nome": r.get::<_, Option<String>>(2)?,
                "email": r.get::<_, Option<String>>(3)?,
                "ruolo": r.get::<_, Option<String>>(4)?,
                "tenant": r.get::<_, Option<String>>(5)?,
                "attivo": r.get::<_, i64>(6)? == 1,
            }))
        },
    )
    .optional()
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if !is_admin(&user) {
        return Err(forbidden("Permessi insufficienti"));
    }
    let super_ = is_super(&user);
    let tenant = user.tenant.clone();
    let out = state.with_auth(|c| {
        let sql = if super_ {
            "SELECT id, username, nome, email, ruolo, tenant_slug, attivo FROM users ORDER BY username".to_string()
        } else {
            "SELECT id, username, nome, email, ruolo, tenant_slug, attivo FROM users WHERE tenant_slug=? ORDER BY username".to_string()
        };
        let mut stmt = c.prepare(&sql)?;
        let map = |r: &rusqlite::Row| -> rusqlite::Result<Value> {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "username": r.get::<_, Option<String>>(1)?,
                "nome": r.get::<_, Option<String>>(2)?,
                "email": r.get::<_, Option<String>>(3)?,
                "ruolo": r.get::<_, Option<String>>(4)?,
                "tenant": r.get::<_, Option<String>>(5)?,
                "attivo": r.get::<_, i64>(6)? == 1,
            }))
        };
        let rows: Vec<Value> = if super_ {
            stmt.query_map([], map)?.collect::<Result<_, _>>()?
        } else {
            stmt.query_map(params![tenant], map)?.collect::<Result<_, _>>()?
        };
        Ok(rows)
    })?;
    Ok(Json(Value::Array(out)))
}

async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if !is_admin(&user) {
        return Err(forbidden("Permessi insufficienti"));
    }
    let username = body.get("username").and_then(Value::as_str).unwrap_or("");
    let password = body.get("password").and_then(Value::as_str).unwrap_or("");
    if username.is_empty() || password.is_empty() {
        return Err(bad("username e password obbligatori"));
    }
    let super_ = is_super(&user);
    // targetTenant: solo SUPERADMIN può assegnare tenant diversi dal proprio
    let target_tenant = if super_ {
        body.get("tenant").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(&user.tenant).to_string()
    } else {
        user.tenant.clone()
    };
    let ruolo_in = body.get("ruolo").and_then(Value::as_str);
    let target_ruolo = match ruolo_in {
        Some("SUPERADMIN") if !super_ => "OPERATORE".to_string(),
        Some(r) if !r.is_empty() => r.to_string(),
        _ => "OPERATORE".to_string(),
    };
    let nome = body.get("nome").and_then(Value::as_str).unwrap_or("").to_string();
    let email = body.get("email").and_then(Value::as_str).unwrap_or("").to_string();
    let hash = bcrypt::hash(password, SALT).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    let username = username.to_string();

    let res = state.with_auth(|c| {
        // getTenant(targetTenant)
        let exists: Option<i64> = c
            .query_row("SELECT 1 FROM tenants WHERE slug=?", params![target_tenant], |r| r.get(0))
            .optional()?;
        if exists.is_none() {
            return Ok(Err((400, "Tenant inesistente".to_string())));
        }
        match c.execute(
            "INSERT INTO users (username, password_hash, nome, email, ruolo, tenant_slug) VALUES (?,?,?,?,?,?)",
            params![username, hash, nome, email, target_ruolo, target_tenant],
        ) {
            Ok(_) => {
                let id = c.last_insert_rowid();
                Ok(Ok(user_dto(c, id)?.unwrap_or(Value::Null)))
            }
            Err(e) => {
                let msg = e.to_string();
                let status = if msg.contains("UNIQUE") { 400 } else { 500 };
                let text = if msg.contains("UNIQUE") { "Username già in uso".to_string() } else { msg };
                Ok(Err((status, text)))
            }
        }
    })?;
    match res {
        Ok(v) => Ok(Json(v)),
        Err((400, m)) => Err(bad(&m)),
        Err((_, m)) => Err(ApiError::Status(axum::http::StatusCode::INTERNAL_SERVER_ERROR, m)),
    }
}

async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if !is_admin(&user) {
        return Err(forbidden("Permessi insufficienti"));
    }
    let super_ = is_super(&user);
    let owner = is_owner(&user);

    // Hash password fuori dalla closure (CPU sync).
    let password = body.get("password").and_then(Value::as_str).filter(|s| !s.is_empty());
    let new_hash = match password {
        Some(p) => Some(bcrypt::hash(p, SALT).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?),
        None => None,
    };

    let username = coalesce_str(&body, "username");
    let nome = coalesce_str(&body, "nome");
    let email = coalesce_str(&body, "email");
    let attivo_present = body.get("attivo").is_some();
    let attivo_val = js_truthy(body.get("attivo"));
    let ruolo_present = body.get("ruolo").is_some();
    let ruolo_val = coalesce_str(&body, "ruolo"); // None se null
    let tenant_present = body.get("tenant").is_some();
    let tenant_val = coalesce_str(&body, "tenant");
    let req_tenant = user.tenant.clone();

    let res = state.with_auth(|c| {
        // getUserById
        let existing = c
            .query_row(
                "SELECT ruolo, tenant_slug FROM users WHERE id=?",
                params![id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()?;
        let (ex_ruolo, ex_tenant) = match existing {
            Some(t) => t,
            None => return Ok(Err((404, "Utente non trovato".to_string()))),
        };
        if !super_ && ex_tenant != req_tenant {
            return Ok(Err((403, "Utente non appartiene al tuo tenant".to_string())));
        }

        // Calcolo ruolo finale (None = invariato).
        let mut final_ruolo: Option<String> = None;
        if ruolo_present {
            let r = ruolo_val.as_deref();
            if !super_ && r == Some("SUPERADMIN") {
                final_ruolo = Some(ex_ruolo.clone());
            } else if !super_ && ex_ruolo == "SUPERADMIN" && r != Some("SUPERADMIN") {
                return Ok(Err((403, "Solo SUPERADMIN può declassare un SUPERADMIN".to_string())));
            } else if !super_ && !owner && r == Some("OWNER") {
                final_ruolo = Some(ex_ruolo.clone());
            } else {
                final_ruolo = ruolo_val.clone(); // None (null) → invariato in coalesce
            }
        }
        // Disattivazione SUPERADMIN
        if attivo_present && ex_ruolo == "SUPERADMIN" && !attivo_val && !super_ {
            return Ok(Err((403, "Solo SUPERADMIN può disattivare un SUPERADMIN".to_string())));
        }
        // Cambio tenant
        let mut final_tenant: Option<String> = None;
        if tenant_present {
            let t = tenant_val.clone().unwrap_or_default();
            if !super_ && t != ex_tenant {
                return Ok(Err((403, "Solo SUPERADMIN può cambiare tenant".to_string())));
            }
            final_tenant = tenant_val.clone(); // se null → invariato in coalesce
        }

        // updateUser: campi forniti ?? esistenti
        if let Some(ft) = &final_tenant {
            let texists: Option<i64> = c
                .query_row("SELECT 1 FROM tenants WHERE slug=?", params![ft], |r| r.get(0))
                .optional()?;
            if texists.is_none() {
                return Ok(Err((500, "Tenant inesistente".to_string())));
            }
        }

        let mut sets: Vec<&str> = Vec::new();
        let mut binds: Vec<rusqlite::types::Value> = Vec::new();
        use rusqlite::types::Value as SV;
        if let Some(v) = &username {
            sets.push("username=?");
            binds.push(SV::Text(v.clone()));
        }
        if let Some(v) = &new_hash {
            sets.push("password_hash=?");
            binds.push(SV::Text(v.clone()));
        }
        if let Some(v) = &nome {
            sets.push("nome=?");
            binds.push(SV::Text(v.clone()));
        }
        if let Some(v) = &email {
            sets.push("email=?");
            binds.push(SV::Text(v.clone()));
        }
        if let Some(v) = &final_ruolo {
            sets.push("ruolo=?");
            binds.push(SV::Text(v.clone()));
        }
        if let Some(v) = &final_tenant {
            sets.push("tenant_slug=?");
            binds.push(SV::Text(v.clone()));
        }
        if attivo_present {
            sets.push("attivo=?");
            binds.push(SV::Integer(if attivo_val { 1 } else { 0 }));
        }

        if !sets.is_empty() {
            let sql = format!("UPDATE users SET {} WHERE id=?", sets.join(", "));
            binds.push(SV::Integer(id));
            match c.execute(&sql, rusqlite::params_from_iter(binds.iter())) {
                Ok(_) => {}
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("UNIQUE") {
                        return Ok(Err((400, "Username già in uso".to_string())));
                    }
                    return Ok(Err((500, msg)));
                }
            }
        }
        Ok(Ok(user_dto(c, id)?.unwrap_or(Value::Null)))
    })?;
    match res {
        Ok(v) => Ok(Json(v)),
        Err((400, m)) => Err(bad(&m)),
        Err((403, m)) => Err(forbidden(&m)),
        Err((404, m)) => Err(not_found(&m)),
        Err((_, m)) => Err(ApiError::Status(axum::http::StatusCode::INTERNAL_SERVER_ERROR, m)),
    }
}

async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if !is_admin(&user) {
        return Err(forbidden("Permessi insufficienti"));
    }
    let super_ = is_super(&user);
    let my_id = user.id;
    let req_tenant = user.tenant.clone();
    let res = state.with_auth(|c| {
        let target = c
            .query_row(
                "SELECT id, ruolo, tenant_slug FROM users WHERE id=?",
                params![id],
                |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
            )
            .optional()?;
        let (tid, truolo, ttenant) = match target {
            Some(t) => t,
            None => return Ok(Err((404, "Utente non trovato".to_string()))),
        };
        if !super_ && ttenant != req_tenant {
            return Ok(Err((403, "Utente non appartiene al tuo tenant".to_string())));
        }
        if tid == my_id {
            return Ok(Err((400, "Non puoi eliminare te stesso".to_string())));
        }
        if truolo == "SUPERADMIN" {
            let others: i64 = c.query_row(
                "SELECT COUNT(*) FROM users WHERE ruolo='SUPERADMIN' AND id<>? AND attivo=1",
                params![tid],
                |r| r.get(0),
            )?;
            if others == 0 {
                return Ok(Err((400, "Non puoi eliminare l'unico SUPERADMIN attivo".to_string())));
            }
        }
        c.execute("DELETE FROM users WHERE id=?", params![tid])?;
        Ok(Ok(()))
    })?;
    match res {
        Ok(()) => Ok(Json(json!({ "success": true }))),
        Err((400, m)) => Err(bad(&m)),
        Err((403, m)) => Err(forbidden(&m)),
        Err((404, m)) => Err(not_found(&m)),
        Err((_, m)) => Err(ApiError::Status(axum::http::StatusCode::INTERNAL_SERVER_ERROR, m)),
    }
}
