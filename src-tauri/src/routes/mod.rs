//! Router /api. Le fasi aggiungono progressivamente i moduli di dominio.
//! Fase 0: me/auth. Fase 1: anagrafiche (in corso — tabelle base completate).

mod aliquote_iva;
mod arrivi_merce;
mod azienda;
mod categorie_prodotto;
mod causali;
mod clienti;
mod conti_acquisto;
mod ddt;
pub(crate) mod fornitori;
mod listini;
mod magazzini;
mod me;
mod movimenti_magazzino;
mod ordini;
mod preventivi;
mod prodotti;
mod riordino;
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
        // Magazzino (Fase 2)
        .nest("/magazzini", magazzini::routes())
        .nest("/movimenti-magazzino", movimenti_magazzino::routes())
        .nest("/arrivi-merce", arrivi_merce::routes())
        .nest("/riordino", riordino::routes())
        // Documenti (Fase 3)
        .nest("/ddt", ddt::routes())
        .nest("/preventivi", preventivi::routes())
        .nest("/ordini", ordini::routes())
        // Tabelle base (Fase 1)
        .nest("/unita-misura", unita_misura::routes())
        .nest("/aliquote-iva", aliquote_iva::routes())
        .nest("/causali", causali::routes())
        .nest("/conti-acquisto", conti_acquisto::routes())
        .nest("/categorie-prodotto", categorie_prodotto::routes())
        .nest("/tipi-pagamento", tipi_pagamento::routes())
}
