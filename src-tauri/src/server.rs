//! Server HTTP locale (axum) che sostituisce Express: serve /api/* e la SPA Angular,
//! esattamente come faceva server.js. La WebView di Tauri punta a questo server.

use std::path::PathBuf;

use anyhow::{Context, Result};
use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::db::AppState;
use crate::routes;

/// Porta del server locale. Deve combaciare con environment.offline.ts del frontend
/// (apiUrl http://localhost:3000/api), così la SPA resta invariata.
pub const PORT: u16 = 3000;

/// Costruisce il router completo: /healthz, /api/*, e fallback statico per la SPA.
pub fn build_router(state: AppState) -> Router {
    let api = routes::api_router().with_state(state);

    // SPA Angular buildata, con fallback su index.html per il routing client-side.
    // .fallback() (non not_found_service) preserva lo status 200, come faceva
    // res.sendFile(index.html) in Express per le rotte non-API.
    let spa_dir = spa_dir();
    let spa = ServeDir::new(&spa_dir).fallback(ServeFile::new(spa_dir.join("index.html")));

    Router::new()
        .route("/healthz", get(healthz))
        .nest("/api", api)
        .fallback_service(spa)
        // origin: true del backend Node → in offline è same-origin; restiamo permissivi.
        .layer(CorsLayer::very_permissive())
}

/// GET /healthz — parità con server.js (liveness, niente DB).
/// Espone anche la versione dell'app (fonte unica: Cargo.toml) per il
/// controllo aggiornamenti lato frontend.
async fn healthz() -> Json<Value> {
    Json(json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") }))
}

/// Cartella della SPA: override via ORDEVA_SPA_DIR, altrimenti la build Angular del repo.
fn spa_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ORDEVA_SPA_DIR") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("frontend")
        .join("dist")
        .join("frontend")
        .join("browser")
}

/// Bind sincrono della porta (così quando la WebView carica, il server accetta già)
/// e avvio del serve loop sul runtime async di Tauri.
pub fn spawn(state: AppState) -> Result<()> {
    let router = build_router(state);
    let addr = format!("127.0.0.1:{PORT}");

    let listener = tauri::async_runtime::block_on(async {
        tokio::net::TcpListener::bind(&addr).await
    })
    .with_context(|| format!("bind {addr} (porta occupata?)"))?;

    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            tracing::error!("server axum terminato: {e}");
        }
    });
    Ok(())
}
