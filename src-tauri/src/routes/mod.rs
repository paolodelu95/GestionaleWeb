//! Router /api. Le fasi aggiungono progressivamente i moduli di dominio.
//! Fase 0: me/auth. Fase 1: anagrafiche (in corso — tabelle base completate).

mod acquisti;
mod agenda;
mod allegati;
mod aliquote_iva;
mod arrivi_merce;
mod audit;
mod azienda;
mod backup;
mod bug_reports;
mod categorie_prodotto;
mod causali;
mod clienti;
mod conti_acquisto;
mod ddt;
mod fattura_xml;
mod fatture;
mod fatture_ricorrenti;
pub(crate) mod fornitori;
mod gruppi;
mod moduli;
mod note_credito;
mod note_rapide;
mod notifications;
mod listini;
mod magazzini;
mod me;
mod movimenti_magazzino;
mod ordini;
mod pagamenti;
mod preventivi;
mod prima_nota;
mod prodotti;
mod prodotto_varianti;
mod reports;
mod riconciliazione;
mod riordino;
mod scadenzario;
mod setup;
mod stats;
mod tipi_pagamento;
mod unita_misura;
mod utenti;
mod vendite_banco;

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
        .nest("/acquisti", acquisti::routes())
        .nest("/vendite-banco", vendite_banco::routes())
        .nest("/fatture", fatture::routes())
        .nest("/note-credito", note_credito::routes())
        .nest("/fattura-xml", fattura_xml::routes())
        // Contabilità (Fase 5)
        .nest("/pagamenti", pagamenti::routes())
        .nest("/scadenzario", scadenzario::routes())
        .nest("/prima-nota", prima_nota::routes())
        .nest("/riconciliazione", riconciliazione::routes())
        .nest("/stats", stats::routes())
        .nest("/reports", reports::routes())
        // Trasversali offline (Fase 6)
        .nest("/audit", audit::routes())
        .nest("/notifications", notifications::routes())
        .nest("/note-rapide", note_rapide::routes())
        .nest("/bug-reports", bug_reports::routes())
        .nest("/prodotto-varianti", prodotto_varianti::routes())
        .nest("/moduli", moduli::routes())
        .nest("/gruppi", gruppi::routes())
        .nest("/utenti", utenti::routes())
        .nest("/fatture-ricorrenti", fatture_ricorrenti::routes())
        .nest("/agenda", agenda::routes())
        .nest("/allegati", allegati::routes())
        // Offline-only (Fase 6)
        .nest("/setup", setup::routes())
        .nest("/backup", backup::routes())
        // Tabelle base (Fase 1)
        .nest("/unita-misura", unita_misura::routes())
        .nest("/aliquote-iva", aliquote_iva::routes())
        .nest("/causali", causali::routes())
        .nest("/conti-acquisto", conti_acquisto::routes())
        .nest("/categorie-prodotto", categorie_prodotto::routes())
        .nest("/tipi-pagamento", tipi_pagamento::routes())
}
