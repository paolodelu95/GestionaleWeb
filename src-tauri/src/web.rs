//! Helper trasversali per le route: lettura lasca dei campi dal body JSON
//! (parità con la leniency di req.body in Express) e accesso al DB del tenant.

use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::{AppState, DEFAULT_TENANT};
use crate::error::{ApiError, ApiResult};

/// Stringa trimmata da `body[key]` ("" se assente/non stringa) — come `x?.trim()`.
pub fn str_field(body: &Value, key: &str) -> String {
    body.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

/// Stringa trimmata con default se vuota — come `x?.trim() || default`.
pub fn str_or(body: &Value, key: &str, default: &str) -> String {
    let s = str_field(body, key);
    if s.is_empty() {
        default.to_string()
    } else {
        s
    }
}

/// `Some(stringa)` se non vuota, altrimenti `None` — come `x || null` per le TEXT nullable.
pub fn opt_str(body: &Value, key: &str) -> Option<String> {
    let s = str_field(body, key);
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Bool da `body[key]` (default false) — come `Boolean(x)` / `x ? 1 : 0`.
pub fn bool_field(body: &Value, key: &str) -> bool {
    match body.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|v| v != 0.0).unwrap_or(false),
        _ => false,
    }
}

/// Bool che vale true salvo valore esplicitamente false — come `x !== false`.
pub fn bool_or_true(body: &Value, key: &str) -> bool {
    !matches!(body.get(key), Some(Value::Bool(false)))
}

/// Numero da `body[key]` (default `d`).
pub fn num_or(body: &Value, key: &str, d: f64) -> f64 {
    body.get(key).and_then(Value::as_f64).unwrap_or(d)
}

/// Intero opzionale da `body[key]` (None se assente/null) — come `x ?? null`.
pub fn opt_i64(body: &Value, key: &str) -> Option<i64> {
    body.get(key).and_then(Value::as_i64)
}

/// Stringa grezza NON trimmata (`a.campo`): Some se stringa presente, altrimenti None
/// (assente/null → bind NULL, come `undefined` in better-sqlite3).
pub fn raw_opt(body: &Value, key: &str) -> Option<String> {
    match body.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}

/// `a.campo || ''` senza trim: stringa presente o "".
pub fn str_def(body: &Value, key: &str) -> String {
    body.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

/// Serializza un REAL come fa better-sqlite3 + JSON.stringify: intero se senza
/// parte frazionaria (4.0 → 4), altrimenti float (4.5 → 4.5). Serve per la parità
/// byte dei numeri (prezzi, quantità, aliquote, importi) col backend Node.
pub fn num(v: f64) -> Value {
    if v.fract() == 0.0 && v.abs() < 9.007e15 {
        json!(v as i64)
    } else {
        json!(v)
    }
}

/// Come [`num`] ma per REAL nullable (None → JSON null).
pub fn opt_num(v: Option<f64>) -> Value {
    match v {
        Some(x) => num(x),
        None => Value::Null,
    }
}

/// Connessione del tenant corrente. In offline è sempre "default" (auth bypassata).
pub fn tenant_conn(state: &AppState) -> ApiResult<Arc<Mutex<Connection>>> {
    state.tenant_conn(DEFAULT_TENANT).map_err(ApiError::from)
}
