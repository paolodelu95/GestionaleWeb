//! Router /api. Le fasi aggiungono progressivamente i moduli di dominio.
//! Fase 0: me/auth. Fase 1: anagrafiche (in corso — tabelle base completate).

mod aliquote_iva;
mod azienda;
mod categorie_prodotto;
mod causali;
mod clienti;
mod conti_acquisto;
pub(crate) mod fornitori;
mod listini;
mod me;
mod prodotti;
mod tipi_pagamento;
mod unita_misura;

use axum::Router;

use crate::db::AppState;

/// Costruisce il sotto-router montato su `/api`.
pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(me::routes())
        // Anagrafiche (Fase 1)
        .nest("/azienda", azienda::routes())
        .nest("/clienti", clienti::routes())
        .nest("/fornitori", fornitori::routes())
        .nest("/prodotti", prodotti::routes())
        .nest("/listini", listini::routes())
        // Tabelle base (Fase 1)
        .nest("/unita-misura", unita_misura::routes())
        .nest("/aliquote-iva", aliquote_iva::routes())
        .nest("/causali", causali::routes())
        .nest("/conti-acquisto", conti_acquisto::routes())
        .nest("/categorie-prodotto", categorie_prodotto::routes())
        .nest("/tipi-pagamento", tipi_pagamento::routes())
}
