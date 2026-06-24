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
mod comandi;
mod conti_acquisto;
mod crm;
mod ddt;
mod ecommerce;
pub(crate) mod email;
mod fattura_xml;
mod fatture;
pub(crate) mod fatture_ricorrenti;
pub(crate) mod fornitori;
mod gruppi;
mod lavagna;
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
mod piva;
mod preventivi;
mod prima_nota;
mod prodotti;
mod prodotto_varianti;
mod reports;
mod riconciliazione;
mod riordino;
mod scadenzario;
mod sdi_passive;
mod scadenze_fiscali;
mod setup;
mod sistema;
mod stats;
mod timesheet;
mod tipi_pagamento;
mod unita_misura;
mod utenti;
mod vendite_banco;

use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::numerazione::get_next_numero;
use crate::web::tenant_conn;

/// Costruisce il sotto-router montato su `/api`.
pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(me::routes())
        // Numerazione automatica documenti (parità con la route Node
        // /api/next-number/:tipo): prossimo numero libero, gap-filling, con
        // prefissi e numerazione annuale presi dalle impostazioni azienda.
        .route("/next-number/:tipo", get(next_number))
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
        .nest("/scadenze-fiscali", scadenze_fiscali::routes())
        .nest("/prima-nota", prima_nota::routes())
        .nest("/riconciliazione", riconciliazione::routes())
        .nest("/stats", stats::routes())
        .nest("/reports", reports::routes())
        // Trasversali offline (Fase 6)
        .nest("/audit", audit::routes())
        .nest("/notifications", notifications::routes())
        .nest("/note-rapide", note_rapide::routes())
        .nest("/lavagna", lavagna::routes())
        .nest("/bug-reports", bug_reports::routes())
        .nest("/prodotto-varianti", prodotto_varianti::routes())
        .nest("/moduli", moduli::routes())
        .nest("/gruppi", gruppi::routes())
        .nest("/utenti", utenti::routes())
        .nest("/fatture-ricorrenti", fatture_ricorrenti::routes())
        .nest("/agenda", agenda::routes())
        .nest("/allegati", allegati::routes())
        .nest("/crm", crm::routes())
        .nest("/timesheet", timesheet::routes())
        .nest("/sdi-passive", sdi_passive::routes())
        .nest("/comandi", comandi::routes())
        .nest("/email", email::routes())
        .nest("/ecommerce", ecommerce::routes())
        .nest("/piva", piva::routes())
        // Offline-only (Fase 6)
        .nest("/setup", setup::routes())
        .nest("/backup", backup::routes())
        .nest("/sistema", sistema::routes())
        // Tabelle base (Fase 1)
        .nest("/unita-misura", unita_misura::routes())
        .nest("/aliquote-iva", aliquote_iva::routes())
        .nest("/causali", causali::routes())
        .nest("/conti-acquisto", conti_acquisto::routes())
        .nest("/categorie-prodotto", categorie_prodotto::routes())
        .nest("/tipi-pagamento", tipi_pagamento::routes())
}

/// GET /api/next-number/:tipo — prossimo numero documento suggerito al frontend
/// quando si crea un nuovo documento. Mappa il tipo (URL) alla tabella e alla
/// chiave-prefisso, poi delega a get_next_numero (gap-filling + prefisso/annuale).
async fn next_number(
    State(state): State<AppState>,
    Path(tipo): Path<String>,
) -> ApiResult<Json<Value>> {
    // (chiave_prefisso, tabella_sql) — identico alla tableMap di server.js.
    let (prefix_key, table) = match tipo.as_str() {
        "ddt" => ("ddt", "ddt"),
        "fatture" => ("fatture", "fatture"),
        "ordini" => ("ordini", "ordini"),
        "preventivi" => ("preventivi", "preventivi"),
        "note-credito" => ("note_credito", "note_credito"),
        "acquisti" => ("acquisti", "acquisti"),
        "vendite-banco" => ("vendite_banco", "vendite_banco"),
        "arrivi-merce" => ("arrivi_merce", "arrivi_merce"),
        _ => {
            return Err(ApiError::Status(
                axum::http::StatusCode::BAD_REQUEST,
                "tipo non valido".into(),
            ))
        }
    };
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let numero = get_next_numero(&conn, prefix_key, table, 0)?;
    Ok(Json(json!({ "numero": numero })))
}
