//! /api/moduli — parità con routes/moduli.js (attivazione moduli per tenant).
//! In offline l'utente è sempre OWNER: come in Node, OWNER non è ADMIN/SUPERADMIN,
//! quindi le PUT e le rotte /admin restituiscono 403 (parità fedele).

use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use serde_json::{json, Value};

use crate::auth::CurrentUser;
use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::moduli;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list))
        .route("/:slug", put(toggle))
        .route("/admin/all", get(admin_all))
        .route("/admin/:tenant/:slug", put(admin_toggle))
}

fn is_super(u: &CurrentUser) -> bool {
    u.ruolo == "SUPERADMIN"
}
fn is_admin(u: &CurrentUser) -> bool {
    u.ruolo == "ADMIN" || is_super(u)
}

fn forbidden(msg: &str) -> ApiError {
    ApiError::Status(axum::http::StatusCode::FORBIDDEN, msg.into())
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    let out = state.with_auth(|c| Ok(moduli::list_tenant_moduli(c, &user.tenant)?))?;
    Ok(Json(Value::Array(out)))
}

async fn toggle(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if !is_admin(&user) {
        return Err(forbidden("Permessi insufficienti"));
    }
    let attivo = matches!(body.get("attivo"), Some(Value::Bool(true)))
        || matches!(body.get("attivo"), Some(Value::Number(n)) if n.as_f64() != Some(0.0) && n.as_f64().is_some());
    let res = state.with_auth(|c| {
        Ok(moduli::set_tenant_modulo(c, &user.tenant, &slug, attivo))
    })?;
    match res {
        Ok(m) => Ok(Json(m.unwrap_or(Value::Null))),
        Err(msg) => Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, msg)),
    }
}

async fn admin_all(State(_state): State<AppState>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if !is_super(&user) {
        return Err(forbidden("Solo SUPERADMIN"));
    }
    // In offline non è raggiungibile (OWNER), ma per fedeltà ne replichiamo l'output.
    let out = _state.with_auth(|c| {
        let mut stmt = c.prepare("SELECT slug, nome FROM tenants ORDER BY slug")?;
        let tenants: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<_, _>>()?;
        let mut arr = Vec::new();
        for (slug, nome) in tenants {
            let moduli: Vec<Value> = moduli::list_tenant_moduli(c, &slug)?
                .into_iter()
                .map(|m| {
                    json!({
                        "slug": m.get("slug").cloned().unwrap_or(Value::Null),
                        "attivo": m.get("attivo").cloned().unwrap_or(Value::Null),
                        "core": m.get("core").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect();
            arr.push(json!({ "tenant": slug, "nome": nome, "moduli": moduli }));
        }
        Ok(Value::Array(arr))
    })?;
    Ok(Json(out))
}

async fn admin_toggle(
    State(state): State<AppState>,
    Path((tenant, slug)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    if !is_super(&user) {
        return Err(forbidden("Solo SUPERADMIN"));
    }
    let attivo = matches!(body.get("attivo"), Some(Value::Bool(true)));
    let res = state.with_auth(|c| Ok(moduli::set_tenant_modulo(c, &tenant, &slug, attivo)))?;
    match res {
        Ok(m) => Ok(Json(m.unwrap_or(Value::Null))),
        Err(msg) => Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, msg)),
    }
}
