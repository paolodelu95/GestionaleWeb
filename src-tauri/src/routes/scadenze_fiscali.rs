//! /api/scadenze-fiscali — calendario delle scadenze fiscali italiane (offline).
//!
//! Le scadenze standard (IVA, LIPE, ritenute, imposte, dichiarazioni) sono GENERATE
//! automaticamente per l'anno richiesto in base a due impostazioni d'azienda
//! (periodicità IVA mensile/trimestrale, sostituto d'imposta). L'utente può segnarle
//! "fatto", aggiungere note/importo e creare scadenze manuali. Le generate hanno una
//! `chiave` naturale: rigenerarle è idempotente (INSERT OR IGNORE) e non sovrascrive lo
//! stato impostato dall'utente.
//!
//! Le date sono quelle ordinarie; eventuali proroghe ufficiali non sono considerate.

use axum::{
    extract::{Path, Query, State},
    routing::{get, put},
    Json, Router,
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::db::AppState;
use crate::error::ApiResult;
use crate::web::{anno, str_field, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/config", put(set_config))
        .route("/:id", put(update).delete(remove))
}

const MESI: [&str; 12] = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
    "settembre", "ottobre", "novembre", "dicembre",
];

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// Mese/anno precedenti a `m` (1..=12) dell'anno `y` (per "IVA/ritenute del mese prima").
fn mese_prec(m: i64, y: i64) -> (&'static str, i64) {
    if m == 1 {
        (MESI[11], y - 1)
    } else {
        (MESI[(m - 2) as usize], y)
    }
}

/// Legge la configurazione fiscale dall'azienda.
fn leggi_config(conn: &Connection) -> (String, bool) {
    conn.query_row(
        "SELECT COALESCE(iva_periodicita,'trimestrale'), COALESCE(sostituto_imposta,0) FROM azienda WHERE id=1",
        [],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0)),
    )
    .unwrap_or_else(|_| ("trimestrale".to_string(), false))
}

/// Genera (idempotente) le scadenze standard dell'anno `y` secondo la configurazione.
fn genera(conn: &Connection, y: i64, periodicita: &str, sostituto: bool) -> rusqlite::Result<()> {
    // (chiave, data, titolo, categoria)
    let mut voci: Vec<(String, String, String, &str)> = Vec::new();

    // ── IVA ──────────────────────────────────────────────────────────────────
    if periodicita == "mensile" {
        for m in 1..=12 {
            let (nome, py) = mese_prec(m, y);
            voci.push((
                format!("iva-mens-{y}-{m:02}"),
                format!("{y}-{m:02}-16"),
                format!("Versamento IVA {nome} {py}"),
                "IVA",
            ));
        }
    } else {
        voci.push((format!("iva-trim-{y}-1"), format!("{y}-05-16"), "Versamento IVA 1° trimestre".into(), "IVA"));
        voci.push((format!("iva-trim-{y}-2"), format!("{y}-08-16"), "Versamento IVA 2° trimestre".into(), "IVA"));
        voci.push((format!("iva-trim-{y}-3"), format!("{y}-11-16"), "Versamento IVA 3° trimestre".into(), "IVA"));
        voci.push((format!("iva-trim-{y}-4"), format!("{y}-03-16"), "Versamento IVA saldo (4° trim. anno prec.)".into(), "IVA"));
    }

    // ── LIPE (comunicazione liquidazioni periodiche IVA) ───────────────────────
    let feb_fine = if is_leap(y) { 29 } else { 28 };
    voci.push((format!("lipe-{y}-4"), format!("{y}-02-{feb_fine}"), "Comunicazione LIPE 4° trim. (anno prec.)".into(), "LIPE"));
    voci.push((format!("lipe-{y}-1"), format!("{y}-05-31"), "Comunicazione LIPE 1° trimestre".into(), "LIPE"));
    voci.push((format!("lipe-{y}-2"), format!("{y}-09-30"), "Comunicazione LIPE 2° trimestre".into(), "LIPE"));
    voci.push((format!("lipe-{y}-3"), format!("{y}-11-30"), "Comunicazione LIPE 3° trimestre".into(), "LIPE"));

    // ── Dichiarazioni ──────────────────────────────────────────────────────────
    voci.push((format!("cu-{y}"), format!("{y}-03-16"), "Certificazione Unica (CU)".into(), "Dichiarazioni"));
    voci.push((format!("iva-annuale-{y}"), format!("{y}-04-30"), "Dichiarazione IVA annuale".into(), "Dichiarazioni"));

    // ── Ritenute (solo se sostituto d'imposta) ─────────────────────────────────
    if sostituto {
        for m in 1..=12 {
            let (nome, py) = mese_prec(m, y);
            voci.push((
                format!("rit-{y}-{m:02}"),
                format!("{y}-{m:02}-16"),
                format!("Versamento ritenute {nome} {py}"),
                "Ritenute",
            ));
        }
    }

    // ── Imposte sui redditi ─────────────────────────────────────────────────────
    voci.push((format!("imposte-saldo-{y}"), format!("{y}-06-30"), "Saldo e 1° acconto imposte".into(), "Imposte"));
    voci.push((format!("imposte-acconto2-{y}"), format!("{y}-11-30"), "2° acconto imposte".into(), "Imposte"));

    for (chiave, data, titolo, cat) in voci {
        conn.execute(
            "INSERT OR IGNORE INTO scadenze_fiscali (chiave, data, titolo, categoria, auto) \
             VALUES (?1, ?2, ?3, ?4, 1)",
            params![chiave, data, titolo, cat],
        )?;
    }
    Ok(())
}

fn riga_dto(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "data": r.get::<_, String>(1)?,
        "titolo": r.get::<_, String>(2)?,
        "categoria": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
        "importo": r.get::<_, Option<f64>>(4)?,
        "note": r.get::<_, Option<String>>(5)?.unwrap_or_default(),
        "stato": r.get::<_, Option<String>>(6)?.unwrap_or_else(|| "pendente".into()),
        "auto": r.get::<_, Option<i64>>(7)? == Some(1),
    }))
}

/// GET /api/scadenze-fiscali?anno=YYYY — genera (se serve) e restituisce le scadenze
/// dell'anno, ordinate per data, più la configurazione corrente.
async fn list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let y: i64 = q.get("anno").and_then(|s| s.parse().ok()).unwrap_or_else(anno);
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let (periodicita, sostituto) = leggi_config(&conn);
    genera(&conn, y, &periodicita, sostituto)?;

    let mut stmt = conn.prepare(
        "SELECT id, data, titolo, categoria, importo, note, stato, auto \
         FROM scadenze_fiscali WHERE substr(data,1,4)=?1 ORDER BY data, id",
    )?;
    let scadenze = stmt
        .query_map(params![y.to_string()], riga_dto)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({
        "anno": y,
        "config": { "ivaPeriodicita": periodicita, "sostitutoImposta": sostituto },
        "scadenze": scadenze,
    })))
}

/// POST /api/scadenze-fiscali — scadenza manuale.
async fn create(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let data = str_field(&body, "data");
    let titolo = str_field(&body, "titolo");
    if data.is_empty() || titolo.is_empty() {
        return Err(crate::error::ApiError::bad_request("Data e titolo obbligatori"));
    }
    let categoria = {
        let c = str_field(&body, "categoria");
        if c.is_empty() { "Altro".to_string() } else { c }
    };
    let importo = body.get("importo").and_then(Value::as_f64);
    let note = str_field(&body, "note");
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO scadenze_fiscali (data, titolo, categoria, importo, note, auto) \
         VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        params![data, titolo, categoria, importo, note],
    )?;
    Ok(Json(json!({ "id": conn.last_insert_rowid() })))
}

/// PUT /api/scadenze-fiscali/:id — aggiorna campi/stato (es. segnare "fatto").
async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    // Stato (pendente|fatto) sempre aggiornabile; gli altri campi solo se forniti.
    if let Some(stato) = body.get("stato").and_then(Value::as_str) {
        let stato = if stato == "fatto" { "fatto" } else { "pendente" };
        conn.execute("UPDATE scadenze_fiscali SET stato=?1 WHERE id=?2", params![stato, id])?;
    }
    if body.get("note").is_some() {
        conn.execute("UPDATE scadenze_fiscali SET note=?1 WHERE id=?2", params![str_field(&body, "note"), id])?;
    }
    if body.get("importo").is_some() {
        conn.execute("UPDATE scadenze_fiscali SET importo=?1 WHERE id=?2", params![body.get("importo").and_then(Value::as_f64), id])?;
    }
    // Titolo/data/categoria modificabili (utile per le scadenze manuali).
    if let Some(t) = body.get("titolo").and_then(Value::as_str) {
        if !t.is_empty() {
            conn.execute("UPDATE scadenze_fiscali SET titolo=?1 WHERE id=?2", params![t, id])?;
        }
    }
    if let Some(d) = body.get("data").and_then(Value::as_str) {
        if !d.is_empty() {
            conn.execute("UPDATE scadenze_fiscali SET data=?1 WHERE id=?2", params![d, id])?;
        }
    }
    if let Some(c) = body.get("categoria").and_then(Value::as_str) {
        if !c.is_empty() {
            conn.execute("UPDATE scadenze_fiscali SET categoria=?1 WHERE id=?2", params![c, id])?;
        }
    }
    Ok(Json(json!({ "success": true })))
}

/// DELETE /api/scadenze-fiscali/:id — elimina (le scadenze auto verrebbero rigenerate al
/// prossimo caricamento: per "toglierle" conviene segnarle "fatto").
async fn remove(State(state): State<AppState>, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute("DELETE FROM scadenze_fiscali WHERE id=?1", params![id])?;
    Ok(Json(json!({ "success": true })))
}

/// PUT /api/scadenze-fiscali/config — periodicità IVA + sostituto d'imposta, poi rigenera.
async fn set_config(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let periodicita = {
        let p = str_field(&body, "ivaPeriodicita");
        if p == "mensile" { "mensile".to_string() } else { "trimestrale".to_string() }
    };
    let sostituto = crate::web::bool_field(&body, "sostitutoImposta");
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "UPDATE azienda SET iva_periodicita=?1, sostituto_imposta=?2 WHERE id=1",
        params![periodicita, sostituto as i64],
    )?;
    genera(&conn, anno(), &periodicita, sostituto)?;
    Ok(Json(json!({ "success": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE scadenze_fiscali (id INTEGER PRIMARY KEY AUTOINCREMENT, \
             chiave TEXT UNIQUE, data TEXT NOT NULL, titolo TEXT NOT NULL, \
             categoria TEXT, importo REAL, note TEXT DEFAULT '', \
             stato TEXT DEFAULT 'pendente', auto INTEGER DEFAULT 0);",
        )
        .unwrap();
        c
    }

    fn count(c: &Connection) -> i64 {
        c.query_row("SELECT COUNT(*) FROM scadenze_fiscali", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn genera_trimestrale_idempotente() {
        let c = conn();
        // trimestrale, no sostituto: IVA 4 + LIPE 4 + Dichiarazioni 2 + Imposte 2 = 12.
        genera(&c, 2026, "trimestrale", false).unwrap();
        assert_eq!(count(&c), 12);
        // Rigenerare non duplica.
        genera(&c, 2026, "trimestrale", false).unwrap();
        assert_eq!(count(&c), 12);
    }

    #[test]
    fn genera_mensile_con_ritenute() {
        let c = conn();
        // mensile + sostituto: IVA 12 + LIPE 4 + Dichiarazioni 2 + Ritenute 12 + Imposte 2 = 32.
        genera(&c, 2026, "mensile", true).unwrap();
        assert_eq!(count(&c), 32);
        // IVA di dicembre dell'anno prima è la scadenza del 16 gennaio.
        let t: String = c
            .query_row("SELECT titolo FROM scadenze_fiscali WHERE chiave='iva-mens-2026-01'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(t, "Versamento IVA dicembre 2025");
    }

    #[test]
    fn lipe_quarto_trim_gestisce_anno_bisestile() {
        let b = conn();
        genera(&b, 2024, "trimestrale", false).unwrap(); // 2024 bisestile
        let d: String = b.query_row("SELECT data FROM scadenze_fiscali WHERE chiave='lipe-2024-4'", [], |r| r.get(0)).unwrap();
        assert_eq!(d, "2024-02-29");
        let n = conn();
        genera(&n, 2026, "trimestrale", false).unwrap(); // 2026 non bisestile
        let d2: String = n.query_row("SELECT data FROM scadenze_fiscali WHERE chiave='lipe-2026-4'", [], |r| r.get(0)).unwrap();
        assert_eq!(d2, "2026-02-28");
    }
}
