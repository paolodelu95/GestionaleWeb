//! Router /api. In Fase 0 sono presenti solo gli endpoint necessari a far
//! partire e autenticare la SPA offline; le fasi successive aggiungono i moduli
//! di dominio (anagrafiche, magazzino, documenti, fiscale, ...).

mod me;

use axum::Router;

use crate::db::AppState;

/// Costruisce il sotto-router montato su `/api`.
pub fn api_router() -> Router<AppState> {
    Router::new().merge(me::routes())
}
