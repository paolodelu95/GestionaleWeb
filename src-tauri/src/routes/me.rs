//! Endpoint utente corrente e login (edizione offline).

use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};

use crate::auth::CurrentUser;
use crate::db::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/me", get(me))
        .route("/auth/login", axum::routing::post(login))
}

/// GET /api/me — parità con server.js: { ...user, emailVerified, piano, trialScadeIl, tenantAttivo }.
async fn me(State(state): State<AppState>) -> Json<Value> {
    let user = CurrentUser::local();
    Json(user_payload(&state, &user))
}

/// POST /api/auth/login — in offline l'auth è bypassata: ritorna sempre l'utente locale.
async fn login(State(state): State<AppState>) -> Json<Value> {
    let user = CurrentUser::local();
    Json(json!({
        "token": "offline-local",
        "user": user_payload(&state, &user),
    }))
}

fn user_payload(state: &AppState, user: &CurrentUser) -> Value {
    // In offline il piano è sempre attivo; leggiamo comunque lo stato tenant dal db.
    let tenant_attivo = state
        .with_auth(|c| {
            let n: i64 = c.query_row(
                "SELECT attivo FROM tenants WHERE slug = ?1",
                [&user.tenant],
                |r| r.get(0),
            )?;
            Ok(n != 0)
        })
        .unwrap_or(true);

    json!({
        "id": user.id,
        "username": user.username,
        "nome": user.nome,
        "email": user.email,
        "ruolo": user.ruolo,
        "tenant": user.tenant,
        "emailVerified": true,
        "piano": "pro",
        "trialScadeIl": Value::Null,
        "tenantAttivo": tenant_attivo,
    })
}
