//! /api/agenti — anagrafica agenti e calcolo provvigioni.
//!
//! Ogni agente sceglie la propria base di calcolo (imponibile fatturato, incassato
//! o margine) e ha una percentuale di default; la percentuale può essere sovrascritta
//! sul cliente e infine sul singolo documento (snapshot su fatture.provvigione).

use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::routing::{get, put};
use axum::{Json, Router};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::tenant_conn;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(lista).post(crea))
        .route("/provvigioni", get(provvigioni))
        .route("/:id", put(aggiorna).delete(elimina))
}

#[derive(Deserialize)]
struct AgenteReq {
    nome: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    telefono: String,
    #[serde(rename = "baseProvvigione", default)]
    base_provvigione: Option<String>,
    #[serde(rename = "provvigioneDefault", default)]
    provvigione_default: Option<f64>,
    #[serde(default)]
    attivo: Option<bool>,
}

/// Normalizza la base a uno dei valori ammessi (default IMPONIBILE).
fn normalizza_base(s: &str) -> String {
    match s.to_ascii_uppercase().as_str() {
        "INCASSATO" => "INCASSATO",
        "MARGINE" => "MARGINE",
        _ => "IMPONIBILE",
    }
    .to_string()
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

async fn lista(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, nome, email, telefono, base_provvigione, provvigione_default, attivo \
         FROM agenti ORDER BY nome COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "nome": r.get::<_, String>(1)?,
            "email": r.get::<_, Option<String>>(2)?,
            "telefono": r.get::<_, Option<String>>(3)?,
            "baseProvvigione": r.get::<_, Option<String>>(4)?,
            "provvigioneDefault": r.get::<_, Option<f64>>(5)?,
            "attivo": r.get::<_, i64>(6)? != 0,
        }))
    })?;
    let mut out = Vec::new();
    for x in rows {
        out.push(x?);
    }
    Ok(Json(Value::Array(out)))
}

async fn crea(State(state): State<AppState>, Json(b): Json<AgenteReq>) -> ApiResult<Json<Value>> {
    let nome = b.nome.trim();
    if nome.is_empty() {
        return Err(ApiError::bad_request("Nome agente mancante"));
    }
    let base = normalizza_base(b.base_provvigione.as_deref().unwrap_or("IMPONIBILE"));
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO agenti (nome, email, telefono, base_provvigione, provvigione_default, attivo) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            nome,
            b.email.trim(),
            b.telefono.trim(),
            base,
            b.provvigione_default.unwrap_or(0.0),
            if b.attivo.unwrap_or(true) { 1 } else { 0 }
        ],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

async fn aggiorna(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(b): Json<AgenteReq>,
) -> ApiResult<Json<Value>> {
    let nome = b.nome.trim();
    if nome.is_empty() {
        return Err(ApiError::bad_request("Nome agente mancante"));
    }
    let base = normalizza_base(b.base_provvigione.as_deref().unwrap_or("IMPONIBILE"));
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE agenti SET nome=?1, email=?2, telefono=?3, base_provvigione=?4, \
         provvigione_default=?5, attivo=?6 WHERE id=?7",
        params![
            nome,
            b.email.trim(),
            b.telefono.trim(),
            base,
            b.provvigione_default.unwrap_or(0.0),
            if b.attivo.unwrap_or(true) { 1 } else { 0 },
            id
        ],
    )?;
    Ok(Json(json!({ "ok": true })))
}

async fn elimina(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM agenti WHERE id=?1", params![id])?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct PeriodoQuery {
    da: Option<String>,
    a: Option<String>,
}

/// GET /api/agenti/provvigioni?da=&a= — provvigioni maturate per agente nel periodo.
/// La base dipende dall'agente; la percentuale è quella del documento, poi del
/// cliente, poi di default dell'agente.
async fn provvigioni(
    State(state): State<AppState>,
    Query(q): Query<PeriodoQuery>,
) -> ApiResult<Json<Value>> {
    let da = q.da.filter(|s| !s.is_empty()).unwrap_or_else(|| "0000-01-01".into());
    let a = q.a.filter(|s| !s.is_empty()).unwrap_or_else(|| "9999-12-31".into());

    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();

    // Agenti: id -> (nome, base, perc_default)
    let mut agenti: HashMap<i64, (String, String, f64)> = HashMap::new();
    {
        let mut s = conn.prepare("SELECT id, nome, base_provvigione, provvigione_default FROM agenti")?;
        let rows = s.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?.unwrap_or_else(|| "IMPONIBILE".into()),
                r.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
            ))
        })?;
        for x in rows {
            let (id, nome, base, perc) = x?;
            agenti.insert(id, (nome, base, perc));
        }
    }

    // Fatture del periodo con un agente assegnato (raccolte prima, così poi posso
    // interrogare le righe sulla stessa connessione senza sovrapporre gli statement).
    let fatture: Vec<(i64, String, String, i64, Option<f64>, Option<String>, Option<f64>, String)> = {
        let mut fstmt = conn.prepare(
            "SELECT f.id, f.numero, f.data_emissione, f.agente_id, f.provvigione, \
                    c.ragione_sociale, c.provvigione, f.stato \
             FROM fatture f LEFT JOIN clienti c ON c.id=f.cliente_id \
             WHERE f.agente_id IS NOT NULL AND f.data_emissione>=?1 AND f.data_emissione<=?2 \
             ORDER BY f.data_emissione",
        )?;
        fstmt
            .query_map(params![da, a], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<f64>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<f64>>(6)?,
                    r.get::<_, Option<String>>(7)?.unwrap_or_default(),
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };

    // (baseTotale, provvigioneTotale, documenti) per agente.
    let mut per_agente: HashMap<i64, (f64, f64, Vec<Value>)> = HashMap::new();
    let mut rstmt = conn.prepare(
        "SELECT r.prezzo, r.quantita, r.sconto, COALESCE(p.prezzo_acquisto, 0) \
         FROM fatture_righe r LEFT JOIN prodotti p ON p.id=r.prodotto_id \
         WHERE r.fattura_id=?1 AND COALESCE(r.tipo,'PRODOTTO')<>'NOTA'",
    )?;

    for (fid, numero, data, agente_id, f_perc, cli_nome, cli_perc, stato) in fatture {
        let (_, a_base, a_perc_def) = agenti
            .get(&agente_id)
            .cloned()
            .unwrap_or_else(|| ("?".into(), "IMPONIBILE".into(), 0.0));

        let mut imponibile = 0.0f64;
        let mut costo = 0.0f64;
        let rr = rstmt.query_map(params![fid], |r| {
            Ok((
                r.get::<_, Option<f64>>(0)?.unwrap_or(0.0),
                r.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                r.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
            ))
        })?;
        for x in rr {
            let (prezzo, qta, sconto, pacq) = x?;
            imponibile += prezzo * qta * (1.0 - sconto / 100.0);
            costo += pacq * qta;
        }

        let pagata = stato.eq_ignore_ascii_case("PAGATA");
        let base_val = match a_base.as_str() {
            "INCASSATO" => if pagata { imponibile } else { 0.0 },
            "MARGINE" => imponibile - costo,
            _ => imponibile,
        };
        let perc = f_perc.or(cli_perc).unwrap_or(a_perc_def);
        let provv = base_val * perc / 100.0;

        let entry = per_agente.entry(agente_id).or_insert((0.0, 0.0, Vec::new()));
        entry.0 += base_val;
        entry.1 += provv;
        entry.2.push(json!({
            "fatturaId": fid,
            "numero": numero,
            "data": data,
            "clienteNome": cli_nome,
            "base": round2(base_val),
            "perc": perc,
            "provvigione": round2(provv),
            "pagata": pagata,
        }));
    }

    let mut out: Vec<Value> = per_agente
        .into_iter()
        .map(|(agid, (base_tot, provv_tot, documenti))| {
            let (nome, base, _) = agenti
                .get(&agid)
                .cloned()
                .unwrap_or_else(|| ("?".into(), "IMPONIBILE".into(), 0.0));
            json!({
                "agenteId": agid,
                "agenteNome": nome,
                "base": base,
                "baseTotale": round2(base_tot),
                "provvigioneTotale": round2(provv_tot),
                "documenti": documenti,
            })
        })
        .collect();
    out.sort_by(|a, b| {
        a["agenteNome"].as_str().unwrap_or("").cmp(b["agenteNome"].as_str().unwrap_or(""))
    });
    Ok(Json(Value::Array(out)))
}
