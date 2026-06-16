//! /api/riconciliazione — import estratto conto (OFX/CSV) + match/conferma pagamenti.
//! Parità con routes/riconciliazione.js.

use std::collections::HashMap;
use std::sync::OnceLock;

use axum::{
    extract::{Query, State},
    routing::post,
    Json, Router,
};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::{days_of, num, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/parse-ofx", post(parse_ofx_h))
        .route("/parse-csv", post(parse_csv_h))
        .route("/match", post(match_h))
        .route("/conferma", post(conferma_h))
}

// ── parser ───────────────────────────────────────────────────────────────────

fn parse_float(s: &str) -> f64 {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"^[+-]?(?:\d+\.?\d*|\.\d+)").unwrap());
    re.find(s.trim()).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0)
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn parse_ofx(text: &str) -> Vec<Value> {
    static RE_BLOCK: OnceLock<Regex> = OnceLock::new();
    let re = RE_BLOCK.get_or_init(|| Regex::new(r"(?is)<STMTTRN>.*?</STMTTRN>").unwrap());
    let mut txs = Vec::new();
    for m in re.find_iter(text) {
        let b = m.as_str();
        let get = |tag: &str| -> String {
            let re = Regex::new(&format!(r"(?i)<{tag}>([^<\n\r]+)")).unwrap();
            re.captures(b).map(|c| c[1].trim().to_string()).unwrap_or_default()
        };
        let dt = get("DTPOSTED");
        let data = if dt.len() >= 8 {
            format!("{}-{}-{}", &dt[0..4], &dt[4..6], &dt[6..8])
        } else {
            String::new()
        };
        let importo = parse_float(&get("TRNAMT").replace(',', "."));
        let fitid = get("FITID");
        let memo = {
            let m = get("MEMO");
            if m.is_empty() { get("NAME") } else { m }
        };
        if !data.is_empty() && importo != 0.0 {
            txs.push(json!({ "data": data, "importo": num(round2(importo)), "descrizione": memo, "riferimento": fitid }));
        }
    }
    txs
}

fn split_line(line: &str, sep: char) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_q = false;
    for ch in line.chars() {
        if ch == '"' {
            in_q = !in_q;
            continue;
        }
        if ch == sep && !in_q {
            out.push(cur.clone());
            cur.clear();
            continue;
        }
        cur.push(ch);
    }
    out.push(cur);
    out
}

fn parse_csv(text: &str, sep: char) -> Vec<Value> {
    let lines: Vec<&str> = text.split('\n').map(|l| l.trim_end_matches('\r')).filter(|l| !l.trim().is_empty()).collect();
    if lines.len() < 2 {
        return Vec::new();
    }
    let headers: Vec<String> = split_line(lines[0], sep).iter().map(|h| h.to_lowercase().trim().to_string()).collect();
    let find = |pred: &dyn Fn(&str) -> bool| headers.iter().position(|h| pred(h)).map(|i| i as i64).unwrap_or(-1);
    let idx_data = find(&|h| {
        h.starts_with("data") && {
            let rest = &h[4..];
            rest.is_empty() || rest.starts_with(" op") || rest.starts_with(" val") || rest.starts_with("cont")
        }
    });
    let idx_importo = find(&|h| h == "importo" || h == "amount");
    let idx_dare = find(&|h| h.contains("addebito") || h.contains("dare") || h.contains("uscita") || h.contains("debit"));
    let idx_avere = find(&|h| h.contains("accredito") || h.contains("avere") || h.contains("entrata") || h.contains("credit"));
    let idx_descr = find(&|h| h.contains("descriz") || h.contains("causale") || h.contains("operazi") || h.contains("memo"));
    let idx_rif = find(&|h| h.contains("riferi") || h.contains("crid") || h.contains("cro") || h.contains("trn"));

    let parse_date = |s: &str| -> String {
        let s = s.trim();
        static RE1: OnceLock<Regex> = OnceLock::new();
        static RE2: OnceLock<Regex> = OnceLock::new();
        let re1 = RE1.get_or_init(|| Regex::new(r"^(\d{2})[/\-.](\d{2})[/\-.](\d{4})").unwrap());
        let re2 = RE2.get_or_init(|| Regex::new(r"^(\d{4})[/\-.](\d{2})[/\-.](\d{2})").unwrap());
        if let Some(c) = re1.captures(s) {
            return format!("{}-{}-{}", &c[3], &c[2], &c[1]);
        }
        if let Some(c) = re2.captures(s) {
            return format!("{}-{}-{}", &c[1], &c[2], &c[3]);
        }
        String::new()
    };
    let parse_num = |s: &str| -> f64 {
        if s.is_empty() {
            return 0.0;
        }
        let cleaned: String = s.replace('.', "").replace(',', ".").chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();
        parse_float(&cleaned)
    };
    let col = |cols: &[String], i: i64| -> String { if i >= 0 { cols.get(i as usize).cloned().unwrap_or_default() } else { String::new() } };

    let mut txs = Vec::new();
    for line in &lines[1..] {
        let cols = split_line(line, sep);
        let data = if idx_data >= 0 { parse_date(&col(&cols, idx_data)) } else { String::new() };
        let importo = if idx_importo >= 0 {
            parse_num(&col(&cols, idx_importo))
        } else {
            let dare = if idx_dare >= 0 { parse_num(&col(&cols, idx_dare)) } else { 0.0 };
            let avere = if idx_avere >= 0 { parse_num(&col(&cols, idx_avere)) } else { 0.0 };
            avere - dare
        };
        let descrizione = if idx_descr >= 0 { col(&cols, idx_descr).trim().to_string() } else { String::new() };
        let riferimento = if idx_rif >= 0 { col(&cols, idx_rif).trim().to_string() } else { String::new() };
        if !data.is_empty() && importo != 0.0 {
            txs.push(json!({ "data": data, "importo": num(round2(importo)), "descrizione": descrizione, "riferimento": riferimento }));
        }
    }
    txs
}

async fn parse_ofx_h(State(_s): State<AppState>, body: String) -> ApiResult<Json<Value>> {
    let txs = parse_ofx(&body);
    Ok(Json(json!({ "count": txs.len(), "transazioni": txs })))
}

async fn parse_csv_h(
    State(_s): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    body: String,
) -> ApiResult<Json<Value>> {
    let sep = q.get("sep").and_then(|s| s.chars().next()).unwrap_or(';');
    let txs = parse_csv(&body, sep);
    Ok(Json(json!({ "count": txs.len(), "transazioni": txs })))
}

// ── match ────────────────────────────────────────────────────────────────────

async fn match_h(State(state): State<AppState>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let data = b.get("data").and_then(Value::as_str).filter(|s| !s.is_empty());
    let importo = b.get("importo").and_then(Value::as_f64);
    let (data, importo) = match (data, importo) {
        (Some(d), Some(i)) => (d.to_string(), i),
        _ => return Err(crate::error::ApiError::bad_request("data e importo richiesti")),
    };
    let is_entrata = importo > 0.0;
    let abs = importo.abs();
    let desc = b.get("descrizione").and_then(Value::as_str).unwrap_or("").to_lowercase();
    let tx_days = days_of(&data).unwrap_or(0);
    let da_iso = iso_from_days(tx_days - 60);
    let a_iso = iso_from_days(tx_days + 60);

    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    // Cand: (tipoEntry, id, numero, data, controparte, residuo)
    let cand: Vec<(String, i64, String, String, String, f64)> = if is_entrata {
        let mut stmt = conn.prepare(
            "SELECT f.id, f.numero, f.data_emissione, c.ragione_sociale as controparte, \
                    COALESCE(SUM(fr.quantita*fr.prezzo*(1-COALESCE(fr.sconto,0)/100)*(1+fr.iva/100)),0) AS totale, \
                    COALESCE((SELECT SUM(importo) FROM pagamenti p WHERE p.fattura_id=f.id),0) AS pagato \
             FROM fatture f JOIN fatture_righe fr ON fr.fattura_id=f.id LEFT JOIN clienti c ON c.id=f.cliente_id \
             WHERE f.stato NOT IN ('PAGATA','ANNULLATA') AND f.data_emissione BETWEEN ?1 AND ?2 GROUP BY f.id",
        )?;
        let v: Vec<_> = stmt.query_map(params![da_iso, a_iso], cand_row("FATTURA"))?.collect::<Result<_, _>>()?;
        v
    } else {
        let mut stmt = conn.prepare(
            "SELECT a.id, a.numero, a.data_emissione, f.ragione_sociale as controparte, \
                    COALESCE(SUM(ar.quantita*ar.prezzo*(1-COALESCE(ar.sconto,0)/100)*(1+ar.iva/100)),0) AS totale, \
                    COALESCE((SELECT SUM(importo) FROM pagamenti p WHERE p.acquisto_id=a.id),0) AS pagato \
             FROM acquisti a JOIN acquisti_righe ar ON ar.acquisto_id=a.id LEFT JOIN fornitori f ON f.id=a.fornitore_id \
             WHERE a.stato NOT IN ('PAGATA','PAGATO','ANNULLATA','ANNULLATO') AND a.data_emissione BETWEEN ?1 AND ?2 GROUP BY a.id",
        )?;
        let v: Vec<_> = stmt.query_map(params![da_iso, a_iso], cand_row("ACQUISTO"))?.collect::<Result<_, _>>()?;
        v
    };

    let mut scored: Vec<(f64, Value)> = Vec::new();
    for (tipo_entry, id, numero, c_data, controparte, residuo) in &cand {
        let mut score = 0.0;
        let diff = (residuo - abs).abs();
        if diff < 0.01 {
            score += 10.0;
        } else if diff < abs * 0.05 {
            score += 3.0;
        }
        let num_norm: String = numero.to_lowercase().chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
        if !num_norm.is_empty() && desc.contains(&num_norm) {
            score += 5.0;
        }
        for w in controparte.to_lowercase().split_whitespace().filter(|w| w.chars().count() >= 4) {
            if desc.contains(w) {
                score += 3.0;
                break;
            }
        }
        let d_diff = (days_of(c_data).unwrap_or(tx_days) - tx_days).abs();
        score -= 5.0_f64.min((d_diff / 10) as f64);
        if score > 0.0 {
            scored.push((score, json!({
                "tipoEntry": tipo_entry, "id": id, "numero": numero, "data": c_data,
                "controparte": controparte, "residuo": num(round2(*residuo)), "score": num(score),
            })));
        }
    }
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let candidati: Vec<Value> = scored.into_iter().take(3).map(|(_, v)| v).collect();
    Ok(Json(json!({ "tipo": if is_entrata { "ENTRATA" } else { "USCITA" }, "importo": num(abs), "candidati": candidati })))
}

fn cand_row(tipo: &'static str) -> impl Fn(&rusqlite::Row) -> rusqlite::Result<(String, i64, String, String, String, f64)> {
    move |r| {
        let totale = r.get::<_, Option<f64>>(4)?.unwrap_or(0.0);
        let pagato = r.get::<_, Option<f64>>(5)?.unwrap_or(0.0);
        Ok((
            tipo.to_string(),
            r.get::<_, i64>(0)?,
            r.get::<_, Option<String>>(1)?.unwrap_or_default(),
            r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            round2(totale - pagato),
        ))
    }
}

// ── conferma ─────────────────────────────────────────────────────────────────

async fn conferma_h(State(state): State<AppState>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let items = b.get("transazioni").and_then(Value::as_array).cloned().unwrap_or_default();
    let arc = tenant_conn(&state)?;
    let mut guard = arc.lock().unwrap();
    let mut creati = 0i64;
    let mut errori: Vec<Value> = Vec::new();
    for it in &items {
        match conferma_item(&mut guard, it) {
            Ok(()) => creati += 1,
            Err(e) => errori.push(json!({ "item": it, "errore": e })),
        }
    }
    Ok(Json(json!({ "creati": creati, "errori": errori })))
}

fn conferma_item(conn: &mut Connection, it: &Value) -> Result<(), String> {
    let tipo_entry = it.get("tipoEntry").and_then(Value::as_str).unwrap_or("");
    let id = it.get("id").and_then(Value::as_i64).filter(|&v| v != 0);
    let data = it.get("data").and_then(Value::as_str).filter(|s| !s.is_empty());
    let importo_present = it.get("importo").map(|v| !v.is_null()).unwrap_or(false);
    if tipo_entry.is_empty() || id.is_none() || data.is_none() || !importo_present {
        return Err("campi mancanti".into());
    }
    let id = id.unwrap();
    let data = data.unwrap();
    let importo = it.get("importo").and_then(Value::as_f64).unwrap_or(0.0).abs();
    let is_fatt = tipo_entry == "FATTURA";
    let (fk_col, doc_table, tipo) = if is_fatt { ("fattura_id", "fatture", "ENTRATA") } else { ("acquisto_id", "acquisti", "USCITA") };

    let exists = conn.query_row(&format!("SELECT id FROM {doc_table} WHERE id=?1"), [id], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_some();
    if !exists {
        return Err(format!("{doc_table} #{id} non trovato"));
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        &format!("INSERT INTO pagamenti ({fk_col}, data_pagamento, importo, metodo, note, tipo, conto) VALUES (?1,?2,?3,?4,?5,?6,'BANCA')"),
        params![
            id, data, importo,
            it.get("metodo").and_then(Value::as_str).unwrap_or("Bonifico"),
            it.get("note").and_then(Value::as_str).unwrap_or("Da riconciliazione bancaria"),
            tipo,
        ],
    ).map_err(|e| e.to_string())?;
    let righe_table = if is_fatt { "fatture_righe" } else { "acquisti_righe" };
    let res: f64 = tx.query_row(
        &format!("SELECT (SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100.0)*(1+COALESCE(iva,0)/100.0)),0) FROM {righe_table} WHERE {fk_col}=?1) - (SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE {fk_col}=?1)"),
        [id], |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    if res <= 0.01 {
        tx.execute(&format!("UPDATE {doc_table} SET stato='PAGATA' WHERE id=?1"), [id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn iso_from_days(days: i64) -> String {
    crate::web::iso_of_days(days)
}
