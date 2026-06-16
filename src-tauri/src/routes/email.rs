//! /api/email — parità con routes/email.js. In offline il flusso primario è
//! /preview (genera oggetto+corpo testo per un link mailto:, senza SMTP). Gli
//! invii reali usano SMTP (lettre) e richiedono la configurazione in azienda.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::tenant_conn;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/test", post(test_smtp))
        .route("/send", post(send_generic))
        .route("/fattura/:id", post(send_fattura))
        .route("/acquisto/:id", post(send_acquisto))
        .route("/ddt/:id", post(send_ddt))
        .route("/preventivo/:id", post(send_preventivo))
        .route("/nota-credito/:id", post(send_nota_credito))
        .route("/ordine/:id", post(send_ordine))
        .route("/sollecito/:tipo/:id", post(send_sollecito))
        .route("/preview/:tipo/:id", post(preview))
        .route("/solleciti/:tipo/:id", get(storico_solleciti))
}

// ── formattazione valuta it-IT (Intl currency: NBSP + € finale, grouping ≥10000) ──
fn fmt_intl(n: f64) -> String {
    let neg = n < 0.0;
    let cents = (n.abs() * 100.0).round() as i64;
    let int_part = cents / 100;
    let frac = cents % 100;
    let int_str = if int_part < 10_000 {
        int_part.to_string()
    } else {
        let digits = int_part.to_string();
        let mut g = String::new();
        let len = digits.len();
        for (i, b) in digits.bytes().enumerate() {
            if i > 0 && (len - i) % 3 == 0 {
                g.push('.');
            }
            g.push(b as char);
        }
        g
    };
    format!("{}{},{:02}\u{00A0}€", if neg { "-" } else { "" }, int_str, frac)
}

fn escape_html(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            _ => o.push(c),
        }
    }
    o
}
fn body_to_html(s: &str) -> String {
    escape_html(s).replace('\n', "<br>")
}

const DEFAULT_BODY: &str = "Buongiorno,\nin allegato trovate il documento richiesto.\nRestiamo a disposizione per qualsiasi chiarimento.";

fn default_email_body(c: &Connection) -> String {
    c.query_row("SELECT email_corpo_documento FROM azienda WHERE id=1", [], |r| r.get::<_, Option<String>>(0))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_BODY.to_string())
}

fn email_re_ok(addr: &str) -> bool {
    // ^[^\s@]+@[^\s@]+\.[^\s@]+$
    let parts: Vec<&str> = addr.split('@').collect();
    if parts.len() != 2 || parts[0].is_empty() {
        return false;
    }
    let dom = parts[1];
    let no_space = |s: &str| !s.chars().any(|c| c.is_whitespace() || c == '@');
    if !no_space(parts[0]) || !no_space(dom) {
        return false;
    }
    // dominio: almeno un punto con caratteri prima e dopo
    match dom.rfind('.') {
        Some(i) if i > 0 && i < dom.len() - 1 => true,
        _ => false,
    }
}

/// Valida i destinatari (stringa con virgole o lista). Err(msg) come throw di Node.
fn assert_safe_recipient(input: Option<&Value>) -> Result<(), String> {
    let list: Vec<String> = match input {
        Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        Some(Value::String(s)) => s.split(',').map(|x| x.to_string()).collect(),
        Some(Value::Null) | None => return Err("Email destinatario mancante".into()),
        Some(other) => other.as_str().map(|s| s.split(',').map(String::from).collect()).unwrap_or_default(),
    };
    if list.is_empty() {
        // input presente ma vuoto → come stringa vuota: "" è falsy in Node → "Email destinatario mancante"
        return Err("Email destinatario mancante".into());
    }
    for raw in &list {
        let addr = raw.trim();
        if addr.contains('\r') || addr.contains('\n') {
            return Err("Indirizzo email non valido (caratteri di controllo)".into());
        }
        if !email_re_ok(addr) {
            return Err(format!("Indirizzo email non valido: {addr}"));
        }
    }
    Ok(())
}

struct Smtp {
    host: String,
    port: u16,
    secure: bool,
    user: String,
    pass: String,
    from_name: String,
    from_addr: String,
}

fn read_smtp(c: &Connection) -> Option<Smtp> {
    c.query_row(
        "SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, ragione_sociale FROM azienda WHERE id=1",
        [],
        |r| {
            Ok(Smtp {
                host: r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                port: r.get::<_, Option<i64>>(1)?.unwrap_or(0) as u16,
                secure: r.get::<_, Option<i64>>(2)? == Some(1),
                user: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                pass: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                from_addr: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                from_name: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
            })
        },
    )
    .ok()
}

/// Costruisce la stringa "from" (come getFrom): `"Nome" <addr>` o addr.
fn from_header(s: &Smtp) -> String {
    let addr = if !s.from_addr.is_empty() { &s.from_addr } else { &s.user };
    if !s.from_name.is_empty() {
        format!("\"{}\" <{}>", s.from_name, addr)
    } else {
        addr.clone()
    }
}

/// Invia via SMTP. Err(msg) replica i messaggi di Node ("SMTP non configurato…" ecc).
fn smtp_send(c: &Connection, to: &Value, subject: &str, html: &str) -> Result<(), String> {
    use lettre::message::header::ContentType;
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};

    let cfg = read_smtp(c).ok_or("SMTP non configurato. Vai in Impostazioni → Email.")?;
    if cfg.host.is_empty() || cfg.user.is_empty() {
        return Err("SMTP non configurato. Vai in Impostazioni → Email.".into());
    }
    let port = if cfg.port == 0 { 587 } else { cfg.port };

    let mut builder = Message::builder()
        .from(from_header(&cfg).parse().map_err(|_| "Mittente non valido".to_string())?)
        .subject(subject);
    let recipients: Vec<String> = match to {
        Value::Array(a) => a.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        Value::String(s) => s.split(',').map(|x| x.trim().to_string()).collect(),
        _ => vec![],
    };
    for r in &recipients {
        builder = builder.to(r.parse().map_err(|_| format!("Indirizzo email non valido: {r}"))?);
    }
    let email = builder
        .header(ContentType::TEXT_HTML)
        .body(html.to_string())
        .map_err(|e| e.to_string())?;

    let creds = Credentials::new(cfg.user.clone(), cfg.pass.clone());
    let tport = if cfg.secure {
        SmtpTransport::relay(&cfg.host).map_err(|e| e.to_string())?
    } else {
        SmtpTransport::starttls_relay(&cfg.host).map_err(|e| e.to_string())?
    };
    let mailer = tport.port(port).credentials(creds).build();
    mailer.send(&email).map_err(|e| e.to_string())?;
    Ok(())
}

// ── /test, /send ─────────────────────────────────────────────────────────────

async fn test_smtp(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{SmtpTransport, Transport};
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let cfg = read_smtp(&conn).filter(|c| !c.host.is_empty() && !c.user.is_empty());
    let cfg = match cfg {
        Some(c) => c,
        None => return Err(ApiError::Status(StatusCode::BAD_REQUEST, "SMTP non configurato. Vai in Impostazioni → Email.".into())),
    };
    let port = if cfg.port == 0 { 587 } else { cfg.port };
    let creds = Credentials::new(cfg.user.clone(), cfg.pass.clone());
    let res = (|| -> Result<(), String> {
        let tport = if cfg.secure {
            SmtpTransport::relay(&cfg.host).map_err(|e| e.to_string())?
        } else {
            SmtpTransport::starttls_relay(&cfg.host).map_err(|e| e.to_string())?
        };
        let mailer = tport.port(port).credentials(creds).build();
        mailer.test_connection().map_err(|e| e.to_string()).and_then(|ok| if ok { Ok(()) } else { Err("connessione fallita".into()) })
    })();
    match res {
        Ok(()) => Ok(Json(json!({ "ok": true }))),
        Err(e) => Err(ApiError::Status(StatusCode::BAD_REQUEST, e)),
    }
}

async fn send_generic(State(state): State<AppState>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let to = b.get("to");
    let subject = b.get("subject").and_then(Value::as_str).unwrap_or("");
    if to.map(|v| v.is_null()).unwrap_or(true) || subject.is_empty() {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "to e subject obbligatori".into()));
    }
    if subject.contains('\r') || subject.contains('\n') {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Subject non valido".into()));
    }
    let html = b.get("html").and_then(Value::as_str).unwrap_or("");
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let res = assert_safe_recipient(to).and_then(|_| smtp_send(&conn, to.unwrap(), subject, html));
    match res {
        Ok(()) => Ok(Json(json!({ "ok": true }))),
        Err(msg) => {
            let code = if msg.starts_with("Indirizzo") || msg.starts_with("Subject") { StatusCode::BAD_REQUEST } else { StatusCode::INTERNAL_SERVER_ERROR };
            Err(ApiError::Status(code, msg))
        }
    }
}

// ── invio documenti (HTML) ───────────────────────────────────────────────────

fn riga_sum(q: f64, p: f64, sconto: f64, iva: f64) -> f64 {
    q * p * (1.0 - sconto / 100.0) * (1.0 + iva / 100.0)
}

/// Recupera (numero, destinatario, righe[(descr,q,p,sconto,iva)]) per i documenti righe.
fn doc_send(
    state: &AppState,
    head_sql: &str,
    righe_sql: &str,
    id: i64,
    not_found: &str,
    body_to: Option<&Value>,
    note: Option<&str>,
    subject: &str,
    heading: &str,
    with_total: bool,
) -> Result<(StatusCode, Value), (StatusCode, String)> {
    let conn = tenant_conn(state).map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Errore database".to_string()))?;
    let conn = conn.lock().unwrap();
    let row = conn
        .query_row(head_sql, params![id], |r| {
            Ok((r.get::<_, Option<String>>("numero")?.unwrap_or_default(), r.get::<_, Option<String>>("dest_email")?))
        })
        .ok();
    let (numero, dest_email) = match row {
        Some(x) => x,
        None => return Err((StatusCode::NOT_FOUND, not_found.to_string())),
    };
    // destinatario: to fornito o email del documento
    let dest_val: Value = match body_to {
        Some(v) if !v.is_null() && !(v.as_str() == Some("")) => v.clone(),
        _ => Value::String(dest_email.clone().unwrap_or_default()),
    };
    assert_safe_recipient(Some(&dest_val)).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let mut stmt = conn.prepare(righe_sql).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let righe: Vec<(String, f64, f64, f64, f64)> = stmt
        .query_map(params![id], |r| {
            Ok((
                r.get::<_, Option<String>>("descrizione")?.unwrap_or_default(),
                r.get::<_, Option<f64>>("quantita")?.unwrap_or(0.0),
                r.get::<_, Option<f64>>("prezzo")?.unwrap_or(0.0),
                r.get::<_, Option<f64>>("sconto")?.unwrap_or(0.0),
                r.get::<_, Option<f64>>("iva")?.unwrap_or(0.0),
            ))
        })
        .and_then(|m| m.collect::<Result<_, _>>())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let body_text = match note {
        Some(n) if !n.trim().is_empty() => n.to_string(),
        _ => default_email_body(&conn),
    };
    let total_header = if with_total { "<th style=\"padding:8px;text-align:right;border-bottom:2px solid #e2e8f0\">Totale</th>" } else { "" };
    let mut rows_html = String::new();
    let mut totale = 0.0;
    for (descr, q, p, sc, iva) in &righe {
        let tot = riga_sum(*q, *p, *sc, *iva);
        totale += tot;
        rows_html.push_str(&format!(
            "<tr><td>{}</td><td style=\"text-align:right\">{}</td><td style=\"text-align:right\">{}</td>{}</tr>",
            escape_html(descr),
            crate::web::fmt_num(*q),
            fmt_intl(*p),
            if with_total { format!("<td style=\"text-align:right\">{}</td>", fmt_intl(tot)) } else { String::new() }
        ));
    }
    let totale_row = if with_total {
        format!("<tfoot><tr><td colspan=\"3\" style=\"text-align:right;padding:8px;font-weight:700\">TOTALE</td><td style=\"text-align:right;padding:8px;font-weight:700\">{}</td></tr></tfoot>", fmt_intl(totale))
    } else {
        String::new()
    };
    let html = format!(
        "<!DOCTYPE html><html><body style=\"font-family:Arial,sans-serif;font-size:13px;color:#1e293b\"><h2>{}</h2><p>{}</p><table style=\"width:100%;border-collapse:collapse;margin-top:16px\"><thead><tr style=\"background:#f8fafc\"><th style=\"padding:8px;text-align:left;border-bottom:2px solid #e2e8f0\">Descrizione</th><th style=\"padding:8px;text-align:right;border-bottom:2px solid #e2e8f0\">Qtà</th><th style=\"padding:8px;text-align:right;border-bottom:2px solid #e2e8f0\">Prezzo</th>{}</tr></thead><tbody>{}</tbody>{}</table><p style=\"margin-top:24px;font-size:12px;color:#64748b\">Cordiali saluti</p></body></html>",
        escape_html(heading), body_to_html(&body_text), total_header, rows_html, totale_row
    );

    match smtp_send(&conn, &dest_val, subject, &html) {
        Ok(()) => Ok((StatusCode::OK, json!({ "ok": true }))),
        Err(msg) => Err((StatusCode::INTERNAL_SERVER_ERROR, msg)),
    }
}

fn body_to(b: &Value) -> Option<&Value> {
    b.get("to")
}
fn body_note(b: &Value) -> Option<&str> {
    b.get("note").and_then(Value::as_str)
}

async fn send_fattura(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    finish(doc_send(
        &state,
        "SELECT f.numero AS numero, c.email AS dest_email FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.id=?",
        "SELECT fr.descrizione, fr.quantita, fr.prezzo, fr.sconto, fr.iva FROM fatture_righe fr WHERE fr.fattura_id=?",
        id, "Fattura non trovata", body_to(&b), body_note(&b),
        &format!("Fattura n. {}", num_of(&state, "fatture", id)), &format!("Fattura n. {}", num_of(&state, "fatture", id)), true,
    ))
}

async fn send_acquisto(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let numero = num_of(&state, "acquisti", id);
    finish(doc_send(
        &state,
        "SELECT a.numero AS numero, f.email AS dest_email FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id=f.id WHERE a.id=?",
        "SELECT ar.descrizione, ar.quantita, ar.prezzo, ar.sconto, ar.iva FROM acquisti_righe ar WHERE ar.acquisto_id=?",
        id, "Acquisto non trovato", body_to(&b), body_note(&b),
        &format!("Acquisto n. {numero}"), &format!("Ordine/Acquisto n. {numero}"), false,
    ))
}

async fn send_ddt(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let numero = num_of(&state, "ddt", id);
    finish(doc_send(
        &state,
        "SELECT d.numero AS numero, c.email AS dest_email FROM ddt d LEFT JOIN clienti c ON d.cliente_id=c.id WHERE d.id=?",
        "SELECT descrizione, quantita, prezzo, 0 AS sconto, 0 AS iva FROM ddt_righe WHERE ddt_id=?",
        id, "Documento di trasporto non trovato", body_to(&b), body_note(&b),
        &format!("Documento di trasporto n. {numero}"), &format!("Documento di trasporto n. {numero}"), false,
    ))
}

async fn send_preventivo(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let numero = num_of(&state, "preventivi", id);
    finish(doc_send(
        &state,
        "SELECT p.numero AS numero, c.email AS dest_email FROM preventivi p LEFT JOIN clienti c ON p.cliente_id=c.id WHERE p.id=?",
        "SELECT descrizione, quantita, prezzo, sconto, iva FROM preventivi_righe WHERE preventivo_id=?",
        id, "Preventivo non trovato", body_to(&b), body_note(&b),
        &format!("Preventivo n. {numero}"), &format!("Preventivo n. {numero}"), true,
    ))
}

async fn send_nota_credito(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    let numero = num_of(&state, "note_credito", id);
    finish(doc_send(
        &state,
        "SELECT n.numero AS numero, c.email AS dest_email FROM note_credito n LEFT JOIN clienti c ON n.cliente_id=c.id WHERE n.id=?",
        "SELECT descrizione, quantita, prezzo, sconto, iva FROM note_credito_righe WHERE nota_credito_id=?",
        id, "Nota di credito non trovata", body_to(&b), body_note(&b),
        &format!("Nota di credito n. {numero}"), &format!("Nota di credito n. {numero}"), true,
    ))
}

async fn send_ordine(State(state): State<AppState>, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult<Json<Value>> {
    // destinatario: cliente o fornitore secondo il tipo ordine.
    let numero = num_of(&state, "ordini", id);
    let head = "SELECT o.numero AS numero,
                  CASE WHEN o.tipo='FORNITORE' OR (o.cliente_id IS NULL AND o.fornitore_id IS NOT NULL) THEN f.email ELSE c.email END AS dest_email
                FROM ordini o LEFT JOIN clienti c ON o.cliente_id=c.id LEFT JOIN fornitori f ON o.fornitore_id=f.id WHERE o.id=?";
    finish(doc_send(
        &state, head,
        "SELECT descrizione, quantita, prezzo, sconto, iva FROM ordini_righe WHERE ordine_id=?",
        id, "Ordine non trovato", body_to(&b), body_note(&b),
        &format!("Ordine n. {numero}"), &format!("Ordine n. {numero}"), true,
    ))
}

fn finish(r: Result<(StatusCode, Value), (StatusCode, String)>) -> ApiResult<Json<Value>> {
    match r {
        Ok((_, v)) => Ok(Json(v)),
        Err((code, msg)) => Err(ApiError::Status(code, msg)),
    }
}

/// Numero documento (per subject/heading) — "" se non trovato.
fn num_of(state: &AppState, table: &str, id: i64) -> String {
    tenant_conn(state)
        .ok()
        .and_then(|c| {
            let c = c.lock().unwrap();
            c.query_row(&format!("SELECT numero FROM {table} WHERE id=?"), params![id], |r| r.get::<_, Option<String>>(0)).ok().flatten()
        })
        .unwrap_or_default()
}

async fn send_sollecito(
    State(state): State<AppState>,
    Path((tipo, id)): Path<(String, i64)>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let is_fat = tipo == "fattura";
    let row = if is_fat {
        conn.query_row(
            "SELECT f.numero, f.data_emissione, c.ragione_sociale AS nome, c.email FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.id=?",
            params![id],
            |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?.unwrap_or_default(), r.get::<_, Option<String>>(3)?)),
        )
    } else {
        conn.query_row(
            "SELECT a.numero, a.data_emissione, f.ragione_sociale AS nome, f.email FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id=f.id WHERE a.id=?",
            params![id],
            |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?.unwrap_or_default(), r.get::<_, Option<String>>(3)?)),
        )
    }
    .ok();
    let (numero, data_em, nome, email) = match row {
        Some(x) => x,
        None => return Err(ApiError::Status(StatusCode::NOT_FOUND, "Documento non trovato".into())),
    };
    let dest_val: Value = match b.get("to") {
        Some(v) if !v.is_null() && v.as_str() != Some("") => v.clone(),
        _ => Value::String(email.unwrap_or_default()),
    };
    if let Err(e) = assert_safe_recipient(Some(&dest_val)) {
        return Err(ApiError::Status(StatusCode::INTERNAL_SERVER_ERROR, e));
    }
    let pagati: f64 = conn
        .query_row(
            if is_fat { "SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE fattura_id=?" } else { "SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE acquisto_id=?" },
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let tot: f64 = conn
        .query_row(
            if is_fat { "SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM fatture_righe WHERE fattura_id=?" } else { "SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM acquisti_righe WHERE acquisto_id=?" },
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let rimanente = tot - pagati;
    let tipo_label = if is_fat { "Fattura" } else { "Acquisto" };
    let note = body_note(&b);
    let note_html = match note {
        Some(n) if !n.is_empty() => format!("<p>{n}</p>"),
        _ => String::new(),
    };
    let html = format!(
        "<!DOCTYPE html><html><body style=\"font-family:Arial,sans-serif;font-size:13px;color:#1e293b\"><h2>Sollecito di pagamento</h2><p>Gentile {},<br>la contattamo in merito alla <b>{} n. {}</b> del {}.</p><p>L'importo residuo da saldare è: <b style=\"color:#dc2626\">{}</b></p>{}<p>La invitiamo a provvedere al pagamento quanto prima.<br>Per qualsiasi informazione non esiti a contattarci.</p><p style=\"margin-top:24px;font-size:12px;color:#64748b\">Cordiali saluti</p></body></html>",
        if nome.is_empty() { "Cliente" } else { &nome },
        tipo_label, numero, data_em, fmt_intl(rimanente), note_html
    );
    if let Err(msg) = smtp_send(&conn, &dest_val, &format!("Sollecito pagamento – {tipo_label} n. {numero}"), &html) {
        return Err(ApiError::Status(StatusCode::INTERNAL_SERVER_ERROR, msg));
    }
    conn.execute(
        "INSERT INTO solleciti (documento_tipo, documento_id, email_destinatario, data_invio, esito) VALUES (?,?,?,?,?)",
        params![tipo.to_uppercase(), id, dest_val.as_str().unwrap_or(""), crate::web::oggi(), "INVIATO"],
    )?;
    Ok(Json(json!({ "ok": true })))
}

// ── /preview (mailto): nessun SMTP ───────────────────────────────────────────

async fn preview(
    State(state): State<AppState>,
    Path((tipo, id)): Path<(String, i64)>,
    Json(b): Json<Value>,
) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let rag = conn.query_row("SELECT ragione_sociale FROM azienda WHERE id=1", [], |r| r.get::<_, Option<String>>(0)).ok().flatten().unwrap_or_default();
    let note = b.get("note").and_then(Value::as_str);
    let corpo = match note {
        Some(n) if !n.trim().is_empty() => n.to_string(),
        _ => default_email_body(&conn),
    };
    let saluti = format!("Cordiali saluti,\n{rag}").trim().to_string();
    let to_override = b.get("to").and_then(Value::as_str).filter(|s| !s.is_empty());

    let sum_total = |conn: &Connection, sql: &str| -> f64 {
        let mut stmt = match conn.prepare(sql) {
            Ok(s) => s,
            Err(_) => return 0.0,
        };
        stmt.query_map(params![id], |r| {
            Ok(riga_sum(
                r.get::<_, Option<f64>>(0)?.unwrap_or(0.0),
                r.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                r.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
            ))
        })
        .map(|m| m.filter_map(|x| x.ok()).sum())
        .unwrap_or(0.0)
    };
    let doc_info = |heading: &str, numero: &str, data: &str, totale: Option<f64>| -> String {
        let mut lines = vec![format!("Documento: {heading} n. {numero}"), format!("Data: {data}")];
        if let Some(t) = totale {
            lines.push(format!("Totale: {}", fmt_intl(t)));
        }
        lines.join("\n")
    };

    // (numero, data, dest_email, totale?)
    let result: Option<(String, String, Option<String>, String, String)> = match tipo.as_str() {
        "fattura" => {
            let row = conn.query_row("SELECT f.numero, f.data_emissione, c.email FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?))).ok();
            row.map(|(numero, data, email)| {
                let tot = sum_total(&conn, "SELECT quantita, prezzo, sconto, iva FROM fatture_righe WHERE fattura_id=?");
                (format!("Fattura n. {numero}"), format!("{corpo}\n\n{}\n\n{saluti}", doc_info("Fattura", &numero, &data, Some(tot))), email, numero, data)
            })
        }
        "ddt" => {
            let row = conn.query_row("SELECT d.numero, d.data_emissione, c.email FROM ddt d LEFT JOIN clienti c ON d.cliente_id=c.id WHERE d.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?))).ok();
            row.map(|(numero, data, email)| {
                (format!("Documento di trasporto n. {numero}"), format!("{corpo}\n\n{}\n\n{saluti}", doc_info("Documento di trasporto", &numero, &data, None)), email, numero, data)
            })
        }
        "preventivo" => {
            let row = conn.query_row("SELECT p.numero, p.data_emissione, c.email FROM preventivi p LEFT JOIN clienti c ON p.cliente_id=c.id WHERE p.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?))).ok();
            row.map(|(numero, data, email)| {
                let tot = sum_total(&conn, "SELECT quantita, prezzo, sconto, iva FROM preventivi_righe WHERE preventivo_id=?");
                (format!("Preventivo n. {numero}"), format!("{corpo}\n\n{}\n\n{saluti}", doc_info("Preventivo", &numero, &data, Some(tot))), email, numero, data)
            })
        }
        "ordine" => {
            let row = conn.query_row("SELECT o.numero, o.data_ordine, c.email AS c_email, f.email AS f_email, o.tipo, o.cliente_id, o.fornitore_id FROM ordini o LEFT JOIN clienti c ON o.cliente_id=c.id LEFT JOIN fornitori f ON o.fornitore_id=f.id WHERE o.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, Option<String>>(4)?.unwrap_or_default(), r.get::<_, Option<i64>>(5)?, r.get::<_, Option<i64>>(6)?))).ok();
            row.map(|(numero, data, c_email, f_email, otipo, cid, fid)| {
                let is_forn = otipo == "FORNITORE" || (cid.is_none() && fid.is_some());
                let email = if is_forn { f_email } else { c_email };
                let tot = sum_total(&conn, "SELECT quantita, prezzo, sconto, iva FROM ordini_righe WHERE ordine_id=?");
                (format!("Ordine n. {numero}"), format!("{corpo}\n\n{}\n\n{saluti}", doc_info("Ordine", &numero, &data, Some(tot))), email, numero, data)
            })
        }
        "nota-credito" => {
            let row = conn.query_row("SELECT n.numero, n.data_emissione, c.email FROM note_credito n LEFT JOIN clienti c ON n.cliente_id=c.id WHERE n.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?))).ok();
            row.map(|(numero, data, email)| {
                let tot = sum_total(&conn, "SELECT quantita, prezzo, sconto, iva FROM note_credito_righe WHERE nota_credito_id=?");
                (format!("Nota di credito n. {numero}"), format!("{corpo}\n\n{}\n\n{saluti}", doc_info("Nota di credito", &numero, &data, Some(tot))), email, numero, data)
            })
        }
        "acquisto" => {
            let row = conn.query_row("SELECT a.numero, a.data_emissione, f.email FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id=f.id WHERE a.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?))).ok();
            row.map(|(numero, data, email)| {
                let tot = sum_total(&conn, "SELECT quantita, prezzo, sconto, iva FROM acquisti_righe WHERE acquisto_id=?");
                (format!("Acquisto n. {numero}"), format!("{corpo}\n\n{}\n\n{saluti}", doc_info("Acquisto", &numero, &data, Some(tot))), email, numero, data)
            })
        }
        "sollecito-fattura" | "sollecito-acquisto" => {
            let is_fat = tipo == "sollecito-fattura";
            let row = if is_fat {
                conn.query_row("SELECT f.numero, f.data_emissione, c.email FROM fatture f LEFT JOIN clienti c ON f.cliente_id=c.id WHERE f.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?))).ok()
            } else {
                conn.query_row("SELECT a.numero, a.data_emissione, f.email FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id=f.id WHERE a.id=?", params![id], |r| Ok((r.get::<_, Option<String>>(0)?.unwrap_or_default(), r.get::<_, Option<String>>(1)?.unwrap_or_default(), r.get::<_, Option<String>>(2)?))).ok()
            };
            row.map(|(numero, data, email)| {
                let pagati: f64 = conn.query_row(if is_fat { "SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE fattura_id=?" } else { "SELECT COALESCE(SUM(importo),0) FROM pagamenti WHERE acquisto_id=?" }, params![id], |r| r.get(0)).unwrap_or(0.0);
                let tot: f64 = conn.query_row(if is_fat { "SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM fatture_righe WHERE fattura_id=?" } else { "SELECT COALESCE(SUM(quantita*prezzo*(1-COALESCE(sconto,0)/100)*(1+iva/100)),0) FROM acquisti_righe WHERE acquisto_id=?" }, params![id], |r| r.get(0)).unwrap_or(0.0);
                let residuo = tot - pagati;
                let label = if is_fat { "Fattura" } else { "Acquisto" };
                let body = [corpo.clone(), String::new(), format!("{label} n. {numero} del {data}"), format!("Importo residuo da saldare: {}", fmt_intl(residuo)), String::new(), saluti.clone()].join("\n");
                (format!("Sollecito pagamento – {label} n. {numero}"), body, email, numero, data)
            })
        }
        _ => return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Tipo documento non supportato".into())),
    };

    let not_found = match tipo.as_str() {
        "fattura" => "Fattura non trovata",
        "ddt" => "Documento di trasporto non trovato",
        "preventivo" => "Preventivo non trovato",
        "ordine" => "Ordine non trovato",
        "nota-credito" => "Nota di credito non trovata",
        "acquisto" => "Acquisto non trovato",
        _ => "Documento non trovato",
    };
    let (subject, body, email, _n, _d) = match result {
        Some(x) => x,
        None => return Err(ApiError::Status(StatusCode::NOT_FOUND, not_found.into())),
    };
    let dest = to_override.map(String::from).or(email).unwrap_or_default();
    Ok(Json(json!({ "to": dest, "subject": subject, "body": body })))
}

async fn storico_solleciti(
    State(state): State<AppState>,
    Path((tipo, id)): Path<(String, i64)>,
) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, documento_tipo, documento_id, email_destinatario, data_invio, esito FROM solleciti
         WHERE documento_tipo=? AND documento_id=? ORDER BY data_invio DESC",
    )?;
    let rows = stmt
        .query_map(params![tipo.to_uppercase(), id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "documento_tipo": r.get::<_, Option<String>>(1)?,
                "documento_id": r.get::<_, Option<i64>>(2)?,
                "email_destinatario": r.get::<_, Option<String>>(3)?,
                "data_invio": r.get::<_, Option<String>>(4)?,
                "esito": r.get::<_, Option<String>>(5)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}
