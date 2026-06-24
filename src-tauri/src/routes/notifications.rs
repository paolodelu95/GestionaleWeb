//! /api/notifications — parità con routes/notifications.js (badge sidebar).

use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::{days_of, tenant_conn, today_days};

pub fn routes() -> Router<AppState> {
    Router::new().route("/badges", get(badges))
}

async fn badges(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let oggi = today_days();
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();

    let mut scadenze_scadute: i64 = 0;

    // Fatture emesse con data scadenza superata.
    if let Ok(mut stmt) = conn.prepare(
        "SELECT f.data_emissione, tp.giorni_pagamento
         FROM fatture f
         LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
         WHERE f.stato NOT IN ('PAGATA','ANNULLATA')",
    ) {
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                ))
            })
            .and_then(|m| m.collect::<Result<Vec<_>, _>>());
        if let Ok(rows) = rows {
            for (data, giorni) in rows {
                let giorni = giorni.unwrap_or(30);
                if let Some(d) = data.as_deref().and_then(days_of) {
                    if d + giorni < oggi {
                        scadenze_scadute += 1;
                    }
                }
            }
        }
    }

    // Acquisti non pagati scaduti.
    if let Ok(mut stmt) = conn.prepare(
        "SELECT a.data_emissione, tp.giorni_pagamento
         FROM acquisti a
         LEFT JOIN tipi_pagamento tp ON a.tipo_pagamento_id = tp.id
         WHERE a.stato NOT IN ('PAGATA','ANNULLATA')",
    ) {
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                ))
            })
            .and_then(|m| m.collect::<Result<Vec<_>, _>>());
        if let Ok(rows) = rows {
            for (data, giorni) in rows {
                let giorni = giorni.unwrap_or(30);
                if let Some(d) = data.as_deref().and_then(days_of) {
                    if d + giorni < oggi {
                        scadenze_scadute += 1;
                    }
                }
            }
        }
    }

    // Prodotti sotto soglia minima.
    let prodotti_sotto_soglia: i64 = conn
        .query_row(
            "SELECT COUNT(*) as n FROM prodotti WHERE soglia_minima > 0 AND quantita <= soglia_minima",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // Scadenze fiscali pendenti, imminenti (entro 7 giorni) o già scadute.
    let scadenze_fiscali: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM scadenze_fiscali \
             WHERE stato != 'fatto' AND data <= date('now','+7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(Json(json!({
        "scadenzeScadute": scadenze_scadute,
        "prodottiSottoSoglia": prodotti_sotto_soglia,
        "solleciti": scadenze_scadute,
        "scadenzeFiscali": scadenze_fiscali,
    })))
}
