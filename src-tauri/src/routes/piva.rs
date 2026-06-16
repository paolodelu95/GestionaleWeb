//! /api/piva — parità con routes/piva.js: lookup ragione sociale/indirizzo da
//! P.IVA via openapi.it (con OPENAPI_IT_KEY) e fallback VIES. Senza chiave o
//! senza rete restano i path deterministici (validazione, ricerca vuota).

use std::collections::HashMap;
use std::time::Duration;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/search-name", get(search_name))
        .route("/:piva", get(lookup))
}

fn client() -> reqwest::Client {
    reqwest::Client::builder().timeout(Duration::from_secs(8)).build().unwrap_or_default()
}

/// titleCase: lower + prima lettera di ogni parola (\b\w, ASCII) in maiuscolo.
fn title_case(s: &str) -> Option<String> {
    if s.is_empty() {
        return None;
    }
    let lower = s.to_lowercase();
    let mut out = String::with_capacity(lower.len());
    let mut prev_word = false;
    for ch in lower.chars() {
        let is_word = ch.is_ascii_alphanumeric() || ch == '_';
        if is_word && !prev_word {
            out.extend(ch.to_uppercase());
        } else {
            out.push(ch);
        }
        prev_word = is_word;
    }
    Some(out)
}

fn clean_name(name: &str) -> Option<String> {
    let t = name.trim();
    if t.is_empty() || t == "---" {
        None
    } else {
        Some(t.to_string())
    }
}

fn clean_via(via: &str) -> Option<String> {
    let t = via.trim();
    if t.is_empty() || t == "---" {
        None
    } else {
        title_case(t)
    }
}

/// Primo valore non vuoto tra i campi indicati di un oggetto JSON.
fn pick<'a>(o: &'a Value, keys: &[&str]) -> &'a str {
    for k in keys {
        if let Some(s) = o.get(*k).and_then(Value::as_str) {
            if !s.is_empty() {
                return s;
            }
        }
    }
    ""
}

async fn search_name(Query(q): Query<HashMap<String, String>>) -> Json<Value> {
    let query = q.get("q").map(|s| s.trim().to_string()).unwrap_or_default();
    if query.chars().count() < 2 {
        return Json(json!([]));
    }
    let key = std::env::var("OPENAPI_IT_KEY").unwrap_or_default();
    if key.is_empty() {
        return Json(json!([]));
    }
    let enc = urlencoding(&query);
    let endpoints = [
        format!("https://imprese.openapi.it/ricerca?denominazione={enc}&dimensione=10"),
        format!("https://imprese.openapi.it/ricerca?q={enc}&size=10"),
        format!("https://imprese.openapi.it/search?q={enc}&limit=10"),
    ];
    let cli = client();
    for url in &endpoints {
        if let Ok(resp) = cli.get(url).bearer_auth(&key).header("Accept", "application/json").send().await {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<Value>().await {
                    let items = data
                        .get("data")
                        .or_else(|| data.get("items"))
                        .or_else(|| data.get("results"))
                        .cloned()
                        .or_else(|| if data.is_array() { Some(data.clone()) } else { None })
                        .unwrap_or(Value::Array(vec![]));
                    if let Value::Array(arr) = &items {
                        if !arr.is_empty() {
                            let out: Vec<Value> = arr
                                .iter()
                                .map(|d| {
                                    let sede = d.get("sede_legale").cloned().unwrap_or(Value::Null);
                                    json!({
                                        "ragioneSociale": clean_name(pick(d, &["ragione_sociale", "denominazione", "nome"])),
                                        "pIva": pick(d, &["codice_fiscale", "partita_iva", "p_iva", "piva"]).replace(char::is_whitespace, ""),
                                        "via": clean_via(if let Some(s) = sede.get("indirizzo").and_then(Value::as_str) { s } else { d.get("indirizzo").and_then(Value::as_str).unwrap_or("") }),
                                        "cap": sede.get("cap").and_then(Value::as_str).or_else(|| d.get("cap").and_then(Value::as_str)),
                                        "citta": title_case(sede.get("comune").and_then(Value::as_str).unwrap_or_else(|| d.get("comune").and_then(Value::as_str).unwrap_or(""))),
                                        "provincia": prov2(sede.get("provincia").and_then(Value::as_str).unwrap_or_else(|| d.get("provincia").and_then(Value::as_str).unwrap_or(""))),
                                        "stato": "Italia",
                                    })
                                })
                                .filter(|r| !r.get("ragioneSociale").map(|v| v.is_null()).unwrap_or(true))
                                .collect();
                            return Json(Value::Array(out));
                        }
                    }
                }
            }
        }
    }
    Json(json!([]))
}

fn prov2(s: &str) -> Value {
    let up: String = s.chars().take(2).collect::<String>().to_uppercase();
    if up.is_empty() {
        Value::Null
    } else {
        Value::String(up)
    }
}

async fn lookup(State(_state): State<AppState>, Path(piva_in): Path<String>) -> ApiResult<Json<Value>> {
    let mut piva: String = piva_in.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_uppercase();
    if let Some(rest) = piva.strip_prefix("IT") {
        piva = rest.to_string();
    }
    if piva.len() != 11 || !piva.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "P.IVA non valida: deve essere di 11 cifre".into()));
    }

    let cli = client();
    // 1) openapi.it se la chiave è configurata.
    let key = std::env::var("OPENAPI_IT_KEY").unwrap_or_default();
    if !key.is_empty() {
        if let Ok(resp) = cli
            .get(format!("https://imprese.openapi.it/base/{piva}"))
            .bearer_auth(&key)
            .header("Accept", "application/json")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<Value>().await {
                    if data.get("success") != Some(&Value::Bool(false)) {
                        let d = data.get("data").cloned().unwrap_or(data.clone());
                        let sede = d.get("sede_legale").or_else(|| d.get("sede")).or_else(|| d.get("indirizzo_sede")).cloned().unwrap_or(Value::Null);
                        let via_raw = pick(&sede, &["indirizzo", "via"]);
                        return Ok(Json(json!({
                            "pIva": piva,
                            "ragioneSociale": clean_name(pick(&d, &["ragione_sociale", "denominazione", "nome"])),
                            "via": clean_via(via_raw),
                            "cap": opt_str(pick(&sede, &["cap", "codice_postale"])),
                            "citta": title_case(pick(&sede, &["comune", "citta"])),
                            "provincia": prov2(pick(&sede, &["provincia", "sigla_provincia"])),
                            "stato": "Italia",
                        })));
                    }
                }
            }
        }
    }

    // 2) Fallback VIES.
    let resp = cli
        .post("https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({ "countryCode": "IT", "vatNumber": piva }))
        .send()
        .await;
    let resp = match resp {
        Ok(r) => r,
        Err(e) if e.is_timeout() => return Err(ApiError::Status(StatusCode::GATEWAY_TIMEOUT, "Timeout: servizi di lookup non rispondono".into())),
        Err(_) => return Err(ApiError::Status(StatusCode::BAD_GATEWAY, "Errore nella comunicazione con i servizi di lookup".into())),
    };
    if !resp.status().is_success() {
        return Err(ApiError::Status(StatusCode::BAD_GATEWAY, "Servizio VIES non raggiungibile".into()));
    }
    let data: Value = match resp.json().await {
        Ok(d) => d,
        Err(_) => return Err(ApiError::Status(StatusCode::BAD_GATEWAY, "Errore nella comunicazione con i servizi di lookup".into())),
    };
    let valid = data.get("valid").and_then(Value::as_bool).unwrap_or(false) || data.get("isValid").and_then(Value::as_bool).unwrap_or(false);
    if !valid {
        return Err(ApiError::Status(StatusCode::NOT_FOUND, "P.IVA non trovata. Per la copertura completa configura OPENAPI_IT_KEY nel file .env (openapi.it - gratuito)".into()));
    }
    let mut result = json!({
        "pIva": piva,
        "ragioneSociale": data.get("name").and_then(Value::as_str).and_then(clean_name).map(Value::String).unwrap_or(Value::Null),
        "via": Value::Null, "cap": Value::Null, "citta": Value::Null, "provincia": Value::Null, "stato": "Italia",
    });
    if let Some(addr) = data.get("address").and_then(Value::as_str) {
        if addr != "---" {
            parse_vies_address(addr, &mut result);
        }
    }
    Ok(Json(result))
}

fn opt_str(s: &str) -> Value {
    if s.is_empty() {
        Value::Null
    } else {
        Value::String(s.to_string())
    }
}

/// urlencode minimale (component): spazi e caratteri non sicuri → %XX.
fn urlencoding(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => o.push(b as char),
            _ => o.push_str(&format!("%{b:02X}")),
        }
    }
    o
}

/// parseViesAddress: estrae via/cap/citta/provincia da un indirizzo multilinea.
fn parse_vies_address(raw: &str, result: &mut Value) {
    let lines: Vec<String> = raw.split('\n').map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
    let set = |result: &mut Value, k: &str, v: Value| {
        result.as_object_mut().unwrap().insert(k.into(), v);
    };
    if lines.len() >= 2 {
        set(result, "via", title_case(&lines[0]).map(Value::String).unwrap_or(Value::Null));
        let line2 = {
            let t = &lines[1];
            let up = t.to_uppercase();
            if up == "ITALY" || up == "ITALIA" {
                String::new()
            } else {
                t.clone()
            }
        };
        let line2 = line2.trim();
        // (\d{5})\s+(.+?)\s+([A-Z]{2})$
        if let Some((cap, citta, prov)) = re_cap_city_prov(line2) {
            set(result, "cap", Value::String(cap));
            set(result, "citta", title_case(&citta).map(Value::String).unwrap_or(Value::Null));
            set(result, "provincia", Value::String(prov));
            return;
        }
        // (.+?)\s+([A-Z]{2})\s+(\d{5})$
        if let Some((citta, prov, cap)) = re_city_prov_cap(line2) {
            set(result, "citta", title_case(&citta).map(Value::String).unwrap_or(Value::Null));
            set(result, "provincia", Value::String(prov));
            set(result, "cap", Value::String(cap));
            return;
        }
        // (.+?)\s+\(([A-Z]{2})\)$
        if let Some((citta, prov)) = re_city_paren_prov(line2) {
            set(result, "citta", title_case(&citta).map(Value::String).unwrap_or(Value::Null));
            set(result, "provincia", Value::String(prov));
        }
    } else if lines.len() == 1 {
        set(result, "via", title_case(&lines[0]).map(Value::String).unwrap_or(Value::Null));
    }
}

fn re_cap_city_prov(s: &str) -> Option<(String, String, String)> {
    let re = fancy_regex::Regex::new(r"^(\d{5})\s+(.+?)\s+([A-Z]{2})$").ok()?;
    let c = re.captures(s).ok()??;
    Some((c.get(1)?.as_str().into(), c.get(2)?.as_str().into(), c.get(3)?.as_str().into()))
}
fn re_city_prov_cap(s: &str) -> Option<(String, String, String)> {
    let re = fancy_regex::Regex::new(r"^(.+?)\s+([A-Z]{2})\s+(\d{5})$").ok()?;
    let c = re.captures(s).ok()??;
    Some((c.get(1)?.as_str().into(), c.get(2)?.as_str().into(), c.get(3)?.as_str().into()))
}
fn re_city_paren_prov(s: &str) -> Option<(String, String)> {
    let re = fancy_regex::Regex::new(r"^(.+?)\s+\(([A-Z]{2})\)$").ok()?;
    let c = re.captures(s).ok()??;
    Some((c.get(1)?.as_str().into(), c.get(2)?.as_str().into()))
}
