//! Job schedulati dell'edizione offline (parità con i cron di server.js, ma in
//! modello "catch-up": all'avvio e poi ogni 6h, dato che un'app desktop non è
//! garantita accesa alle 7:00/8:00). Idempotenti.
//!
//! - Fatture ricorrenti dovute → emissione (DB, niente rete).
//! - Solleciti automatici → invio email (SMTP); no-op se SMTP non configurato.

use std::time::Duration;

use rusqlite::params;
use serde_json::json;

use crate::db::{AppState, DEFAULT_TENANT};
use crate::routes::email;
use crate::routes::fatture_ricorrenti::emetti_template;
use crate::web;

/// Avvia lo scheduler in un thread dedicato: esegue subito i job, poi ogni 6 ore.
pub fn spawn_scheduler(state: AppState) {
    std::thread::spawn(move || loop {
        run_due_recurring(&state);
        invia_solleciti_automatici(&state);
        // Snapshot automatico (cronologia versioni) se l'ultimo è troppo vecchio.
        crate::backup::run_snapshot_if_due(&state);
        std::thread::sleep(Duration::from_secs(6 * 3600));
    });
}

/// Emette le fatture ricorrenti con prossima_emissione <= oggi (UTC), come il
/// cron delle 7:00. Avanzare il periodo rende l'operazione idempotente.
pub fn run_due_recurring(state: &AppState) {
    let conn = match state.tenant_conn(DEFAULT_TENANT) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut conn = conn.lock().unwrap();
    let today = web::oggi();
    let due: Vec<i64> = {
        let mut stmt = match conn.prepare("SELECT id FROM fatture_ricorrenti WHERE attiva=1 AND prossima_emissione <= ?") {
            Ok(s) => s,
            Err(_) => return,
        };
        match stmt.query_map(params![today], |r| r.get::<_, i64>(0)).and_then(|m| m.collect::<Result<Vec<_>, _>>()) {
            Ok(v) => v,
            Err(_) => return,
        }
    };
    if !due.is_empty() {
        tracing::info!("[ricorrenti] {} template dovuti (oggi={today})", due.len());
    }
    for id in due {
        match emetti_template(&mut conn, id) {
            Ok(Some((_, numero, _))) => tracing::info!("[ricorrenti] emessa {numero} (template {id})"),
            Ok(None) => {}
            Err(e) => tracing::error!("[ricorrenti] errore template {id}: {e}"),
        }
    }
}

/// Invia i solleciti automatici per le fatture scadute (cron delle 8:00).
/// No-op se SMTP non è configurato; massimo un sollecito al giorno per fattura.
pub fn invia_solleciti_automatici(state: &AppState) {
    let conn = match state.tenant_conn(DEFAULT_TENANT) {
        Ok(c) => c,
        Err(_) => return,
    };
    let conn = conn.lock().unwrap();

    // SMTP configurato? Altrimenti niente da fare.
    let (smtp_ok, ragione, from_addr) = conn
        .query_row(
            "SELECT smtp_host, smtp_user, ragione_sociale, smtp_from FROM azienda WHERE id=1",
            [],
            |r| {
                let host: Option<String> = r.get(0)?;
                let user: Option<String> = r.get(1)?;
                Ok((
                    !host.as_deref().unwrap_or("").is_empty() && !user.as_deref().unwrap_or("").is_empty(),
                    r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                ))
            },
        )
        .unwrap_or((false, String::new(), String::new()));
    let _ = from_addr; // il mittente è gestito da email::send_mail (getFrom)
    if !smtp_ok {
        return;
    }

    let today = web::today_days();
    let oggi = web::oggi();

    // Fatture EMESSE con email cliente.
    let fatture: Vec<(i64, String, String, String, String, i64, f64)> = {
        let mut stmt = match conn.prepare(
            "SELECT f.id, f.numero, f.data_emissione, c.ragione_sociale, c.email,
                    COALESCE(tp.giorni_scadenza, 30) AS giorni,
                    COALESCE((SELECT SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100.0)*(1+COALESCE(iva,0)/100.0)) FROM fatture_righe WHERE fattura_id=f.id),0) AS totale
             FROM fatture f JOIN clienti c ON f.cliente_id=c.id
             LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id=tp.id
             WHERE f.stato='EMESSA' AND c.email != ''",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        match stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                    r.get::<_, i64>(5)?,
                    r.get::<_, f64>(6)?,
                ))
            })
            .and_then(|m| m.collect::<Result<Vec<_>, _>>())
        {
            Ok(v) => v,
            Err(_) => return,
        }
    };

    let mut inviati = 0;
    for (id, numero, data_em, cliente_nome, cliente_email, giorni, totale) in fatture {
        let scad_days = match web::days_of(&data_em) {
            Some(d) => d + giorni,
            None => continue,
        };
        if scad_days >= today {
            continue; // non ancora scaduta
        }
        // Max un sollecito al giorno per fattura.
        let esiste: bool = conn
            .query_row(
                "SELECT 1 FROM solleciti WHERE documento_tipo='FATTURA' AND documento_id=? AND data_invio >= date(?, '-1 day') LIMIT 1",
                params![id, oggi],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if esiste {
            continue;
        }
        let giorni_ritardo = today - scad_days;
        let subject = format!("Sollecito pagamento – Fattura n. {numero}");
        let text = [
            format!("Gentile {cliente_nome},"),
            String::new(),
            format!(
                "La fattura n. {numero} del {data_em} per un importo di € {:.2} risulta scaduta da {giorni_ritardo} giorn{}.",
                totale,
                if giorni_ritardo == 1 { "o" } else { "i" }
            ),
            String::new(),
            "La preghiamo di provvedere al pagamento al più presto o di contattarci per qualsiasi chiarimento.".to_string(),
            String::new(),
            format!("Cordiali saluti,\n{ragione}"),
        ]
        .join("\n");

        match email::send_mail(&conn, &json!(cliente_email), &subject, &text, false) {
            Ok(()) => {
                let _ = conn.execute(
                    "INSERT INTO solleciti (documento_tipo, documento_id, email_destinatario, data_invio, esito) VALUES ('FATTURA',?,?,?,'INVIATO')",
                    params![id, cliente_email, oggi],
                );
                inviati += 1;
            }
            Err(e) => tracing::error!("[solleciti] errore fattura {numero}: {e}"),
        }
    }
    if inviati > 0 {
        tracing::info!("[solleciti] inviati {inviati} solleciti automatici");
    }
}
