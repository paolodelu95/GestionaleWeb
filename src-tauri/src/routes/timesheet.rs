//! /api/timesheet — parità con routes/timesheet.js (progetti, voci, fattura da
//! timesheet). In offline l'utente OWNER supera tutti i requireRole.

use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::auth::CurrentUser;
use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::numerazione::get_next_numero;
use crate::web::{self, num, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/progetti", get(list_progetti).post(create_progetto))
        .route("/progetti/:id", axum::routing::put(update_progetto).delete(delete_progetto))
        .route("/progetti/:id/fattura", axum::routing::post(genera_fattura))
        .route("/voci", get(list_voci).post(create_voce))
        .route("/voci/:id", axum::routing::put(update_voce).delete(delete_voce))
}

async fn list_progetti(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT p.*, c.ragione_sociale AS cliente_nome,
                COALESCE((SELECT SUM(ore) FROM timesheet_voci WHERE progetto_id=p.id), 0) AS ore_totali,
                COALESCE((SELECT SUM(ore) FROM timesheet_voci WHERE progetto_id=p.id AND fatturata=1), 0) AS ore_fatturate
         FROM progetti p LEFT JOIN clienti c ON c.id=p.cliente_id
         ORDER BY p.data_inizio DESC, p.id DESC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>("id")?,
                "nome": r.get::<_, Option<String>>("nome")?,
                "descrizione": r.get::<_, Option<String>>("descrizione")?,
                "clienteId": r.get::<_, Option<i64>>("cliente_id")?,
                "clienteNome": r.get::<_, Option<String>>("cliente_nome")?.unwrap_or_default(),
                "stato": r.get::<_, Option<String>>("stato")?,
                "dataInizio": r.get::<_, Option<String>>("data_inizio")?,
                "dataFine": r.get::<_, Option<String>>("data_fine")?,
                "budget": num(r.get::<_, Option<f64>>("budget")?.unwrap_or(0.0)),
                "tariffaOraria": num(r.get::<_, Option<f64>>("tariffa_oraria")?.unwrap_or(0.0)),
                "note": r.get::<_, Option<String>>("note")?,
                "createdAt": r.get::<_, Option<String>>("created_at")?,
                "oreTotali": num(r.get::<_, Option<f64>>("ore_totali")?.unwrap_or(0.0)),
                "oreFatturate": num(r.get::<_, Option<f64>>("ore_fatturate")?.unwrap_or(0.0)),
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn create_progetto(State(state): State<AppState>, Json(p): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO progetti (nome, descrizione, cliente_id, stato, data_inizio, data_fine, budget, tariffa_oraria, note)
         VALUES (?,?,?,?,?,?,?,?,?)",
        params![
            p.get("nome").and_then(Value::as_str),
            p.get("descrizione").and_then(Value::as_str).unwrap_or(""),
            p.get("clienteId").and_then(Value::as_i64),
            p.get("stato").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("APERTO"),
            p.get("dataInizio").and_then(Value::as_str).unwrap_or(""),
            p.get("dataFine").and_then(Value::as_str).unwrap_or(""),
            p.get("budget").and_then(Value::as_f64).unwrap_or(0.0),
            p.get("tariffaOraria").and_then(Value::as_f64).unwrap_or(0.0),
            p.get("note").and_then(Value::as_str).unwrap_or(""),
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update_progetto(State(state): State<AppState>, Path(id): Path<i64>, Json(p): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE progetti SET nome=?, descrizione=?, cliente_id=?, stato=?, data_inizio=?, data_fine=?, budget=?, tariffa_oraria=?, note=? WHERE id=?",
        params![
            p.get("nome").and_then(Value::as_str),
            p.get("descrizione").and_then(Value::as_str).unwrap_or(""),
            p.get("clienteId").and_then(Value::as_i64),
            p.get("stato").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("APERTO"),
            p.get("dataInizio").and_then(Value::as_str).unwrap_or(""),
            p.get("dataFine").and_then(Value::as_str).unwrap_or(""),
            p.get("budget").and_then(Value::as_f64).unwrap_or(0.0),
            p.get("tariffaOraria").and_then(Value::as_f64).unwrap_or(0.0),
            p.get("note").and_then(Value::as_str).unwrap_or(""),
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_progetto(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM progetti WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}

async fn list_voci(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let progetto: Option<i64> = q.get("progettoId").and_then(|s| s.parse().ok()).filter(|n| *n != 0);
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let where_clause = if progetto.is_some() { "WHERE v.progetto_id=?" } else { "" };
    let sql = format!(
        "SELECT v.*, p.nome AS progetto_nome FROM timesheet_voci v
         LEFT JOIN progetti p ON p.id=v.progetto_id {where_clause}
         ORDER BY v.data DESC, v.id DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let map = |r: &rusqlite::Row| -> rusqlite::Result<Value> {
        Ok(json!({
            "id": r.get::<_, i64>("id")?,
            "progettoId": r.get::<_, Option<i64>>("progetto_id")?,
            "progettoNome": r.get::<_, Option<String>>("progetto_nome")?.unwrap_or_default(),
            "data": r.get::<_, Option<String>>("data")?,
            "ore": num(r.get::<_, Option<f64>>("ore")?.unwrap_or(0.0)),
            "descrizione": r.get::<_, Option<String>>("descrizione")?,
            "utente": r.get::<_, Option<String>>("utente")?,
            "fatturata": r.get::<_, Option<i64>>("fatturata")? == Some(1),
            "fatturaId": r.get::<_, Option<i64>>("fattura_id")?,
            "createdAt": r.get::<_, Option<String>>("created_at")?,
        }))
    };
    let rows = if let Some(pid) = progetto {
        stmt.query_map(params![pid], map)?.collect::<Result<Vec<_>, _>>()?
    } else {
        stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?
    };
    Ok(Json(Value::Array(rows)))
}

async fn create_voce(State(state): State<AppState>, Json(v): Json<Value>) -> ApiResult<Json<Value>> {
    let user = CurrentUser::local();
    let progetto_ok = web::truthy(v.get("progettoId"));
    let data = v.get("data").and_then(Value::as_str).unwrap_or("");
    let ore_ok = web::truthy(v.get("ore"));
    if !progetto_ok || data.is_empty() || !ore_ok {
        return Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "progettoId, data, ore obbligatori".into()));
    }
    let utente = v
        .get("utente")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or(user.username);
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO timesheet_voci (progetto_id, data, ore, descrizione, utente) VALUES (?,?,?,?,?)",
        params![
            v.get("progettoId").and_then(Value::as_i64),
            data,
            v.get("ore").and_then(Value::as_f64),
            v.get("descrizione").and_then(Value::as_str).unwrap_or(""),
            utente,
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn update_voce(State(state): State<AppState>, Path(id): Path<i64>, Json(v): Json<Value>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE timesheet_voci SET data=?, ore=?, descrizione=?, utente=? WHERE id=?",
        params![
            v.get("data").and_then(Value::as_str),
            v.get("ore").and_then(Value::as_f64),
            v.get("descrizione").and_then(Value::as_str).unwrap_or(""),
            v.get("utente").and_then(Value::as_str).unwrap_or(""),
            id,
        ],
    )?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_voce(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM timesheet_voci WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}

async fn genera_fattura(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let mut conn = conn.lock().unwrap();

    let prog = conn
        .query_row(
            "SELECT nome, cliente_id, tariffa_oraria FROM progetti WHERE id=?",
            params![id],
            |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<i64>>(1)?, r.get::<_, Option<f64>>(2)?)),
        )
        .ok();
    let (nome, cliente_id, tariffa) = match prog {
        Some(p) => p,
        None => return Err(ApiError::Status(axum::http::StatusCode::NOT_FOUND, "Progetto non trovato".into())),
    };
    let cliente_id = match cliente_id {
        Some(c) => c,
        None => return Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "Progetto senza cliente: impossibile fatturare".into())),
    };
    let tariffa = tariffa.unwrap_or(0.0);
    if tariffa <= 0.0 {
        return Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "Tariffa oraria non impostata sul progetto".into()));
    }

    let voci: Vec<(i64, f64)> = {
        let mut stmt = conn.prepare("SELECT id, ore FROM timesheet_voci WHERE progetto_id=? AND fatturata=0 ORDER BY data")?;
        let v: Vec<(i64, f64)> = stmt.query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
        v
    };
    if voci.is_empty() {
        return Err(ApiError::Status(axum::http::StatusCode::BAD_REQUEST, "Nessuna voce da fatturare".into()));
    }

    let ore_totali: f64 = voci.iter().map(|(_, o)| *o).sum();
    let importo = (ore_totali * tariffa * 100.0).round() / 100.0;
    let oggi = web::oggi();

    // IVA dal cliente, altrimenti predefinita azienda, altrimenti 22.
    let iva_cliente: Option<f64> = conn
        .query_row(
            "SELECT ai.valore FROM clienti c LEFT JOIN aliquote_iva ai ON ai.id = c.aliquota_iva_id WHERE c.id=?",
            params![cliente_id],
            |r| r.get::<_, Option<f64>>(0),
        )
        .ok()
        .flatten();
    let iva_pred: Option<f64> = conn
        .query_row("SELECT valore FROM aliquote_iva WHERE predefinito=1 LIMIT 1", [], |r| r.get::<_, Option<f64>>(0))
        .ok()
        .flatten();
    let iva_default = iva_cliente.or(iva_pred).unwrap_or(22.0);

    let descrizione = format!(
        "Prestazioni progetto \"{nome}\" — {} h x {:.2} €/h",
        web::fmt_num(ore_totali),
        tariffa
    );

    let tx = conn.transaction()?;
    let numero = get_next_numero(&tx, "fatture", "fatture", 0)?;
    tx.execute(
        "INSERT INTO fatture (numero, data_emissione, cliente_id, note, stato) VALUES (?,?,?,?,?)",
        params![numero, oggi, cliente_id, format!("Fattura automatica da timesheet: progetto \"{nome}\""), "EMESSA"],
    )?;
    let fattura_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO fatture_righe (fattura_id, descrizione, quantita, prezzo, iva, unita_misura, tipo) VALUES (?,?,?,?,?,?,?)",
        params![fattura_id, descrizione, ore_totali, tariffa, iva_default, "h", "PRODOTTO"],
    )?;
    for (vid, _) in &voci {
        tx.execute("UPDATE timesheet_voci SET fatturata=1, fattura_id=? WHERE id=?", params![fattura_id, vid])?;
    }
    tx.commit()?;

    Ok(Json(json!({
        "fatturaId": fattura_id,
        "numero": numero,
        "voci": voci.len(),
        "oreTotali": num(ore_totali),
        "importo": num(importo),
    })))
}
