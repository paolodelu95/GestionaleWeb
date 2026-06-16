//! /api/sdi-passive — parità con routes/sdiPassive.js: import manuale di fatture
//! passive FatturaPA (crea fornitore + acquisto in bozza), elenco ricevute,
//! provider. Il polling Aruba è network: in offline (senza credenziali) ritorna
//! l'errore di configurazione, come Node.

use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::db::AppState;
use crate::error::{ApiError, ApiResult};
use crate::web::{self, tenant_conn};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/import-xml", post(import_xml))
        .route("/ricevute", get(ricevute))
        .route("/providers", get(providers))
        .route("/poll/aruba", post(poll_aruba))
        .route("/poll/:provider", post(poll_provider))
}

fn norm(s: &str) -> String {
    s.trim().to_lowercase()
}

fn child<'a, 'input>(
    n: roxmltree::Node<'a, 'input>,
    name: &str,
) -> Option<roxmltree::Node<'a, 'input>> {
    n.children().find(|c| c.is_element() && c.tag_name().name() == name)
}

fn child_text(n: roxmltree::Node, name: &str) -> String {
    child(n, name).and_then(|c| c.text()).unwrap_or("").trim().to_string()
}

/// parseFloat lenient (numero in testa). "" / non numerico → None.
fn parse_f(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<f64>().ok().or_else(|| {
        // prende il prefisso numerico (come parseFloat)
        let end = t.find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+')).unwrap_or(t.len());
        t[..end].parse::<f64>().ok()
    })
}

async fn import_xml(State(state): State<AppState>, body: Bytes) -> ApiResult<Json<Value>> {
    // Body può essere XML grezzo o JSON {xml:"..."}.
    let raw = String::from_utf8_lossy(&body).to_string();
    let xml = {
        let t = raw.trim_start();
        if t.starts_with('{') {
            serde_json::from_str::<Value>(t)
                .ok()
                .and_then(|v| v.get("xml").and_then(Value::as_str).map(String::from))
                .unwrap_or_default()
        } else {
            raw.clone()
        }
    };
    if xml.trim().is_empty() {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "XML mancante".into()));
    }
    if xml.len() > 2_000_000 {
        return Err(ApiError::Status(StatusCode::PAYLOAD_TOO_LARGE, "XML troppo grande (max ~2MB)".into()));
    }

    let doc = match roxmltree::Document::parse(&xml) {
        Ok(d) => d,
        Err(e) => return Err(ApiError::Status(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    };
    let root = doc.descendants().find(|n| n.is_element() && n.tag_name().name() == "FatturaElettronica");
    let root = match root {
        Some(r) => r,
        None => return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Non sembra un XML FatturaPA".into())),
    };

    let header = child(root, "FatturaElettronicaHeader");
    let body_el = root.children().find(|c| c.is_element() && c.tag_name().name() == "FatturaElettronicaBody");

    let cedente = header.and_then(|h| child(h, "CedentePrestatore"));
    let ced = cedente.and_then(|c| child(c, "DatiAnagrafici"));
    let ced_sede = cedente.and_then(|c| child(c, "Sede"));
    let ced_anagr = ced.and_then(|c| child(c, "Anagrafica"));

    let idfisc = ced.and_then(|c| child(c, "IdFiscaleIVA"));
    let p_iva = idfisc.map(|n| child_text(n, "IdCodice")).unwrap_or_default();
    let id_paese = {
        let v = idfisc.map(|n| child_text(n, "IdPaese")).unwrap_or_default();
        if v.is_empty() { "IT".to_string() } else { v }
    };
    let denom = ced_anagr.map(|n| child_text(n, "Denominazione")).unwrap_or_default();
    let nome = ced_anagr.map(|n| child_text(n, "Nome")).unwrap_or_default();
    let cognome = ced_anagr.map(|n| child_text(n, "Cognome")).unwrap_or_default();
    let rag_soc = if !denom.is_empty() {
        denom
    } else {
        let nc = format!("{nome} {cognome}").trim().to_string();
        if nc.is_empty() { "(senza nome)".to_string() } else { nc }
    };

    let sede_ind = ced_sede.map(|n| child_text(n, "Indirizzo")).unwrap_or_default();
    let sede_cap = ced_sede.map(|n| child_text(n, "CAP")).unwrap_or_default();
    let sede_com = ced_sede.map(|n| child_text(n, "Comune")).unwrap_or_default();
    let sede_prov = ced_sede.map(|n| child_text(n, "Provincia")).unwrap_or_default();
    let sede_naz = {
        let v = ced_sede.map(|n| child_text(n, "Nazione")).unwrap_or_default();
        if v.is_empty() { "IT".to_string() } else { v }
    };

    let conn = tenant_conn(&state)?;
    let mut conn = conn.lock().unwrap();

    // Crea/recupera fornitore.
    let mut fornitore_id: Option<i64> = None;
    if !p_iva.is_empty() {
        fornitore_id = conn
            .query_row(
                "SELECT id FROM fornitori WHERE p_iva=? OR p_iva=?",
                params![p_iva, format!("{id_paese}{p_iva}")],
                |r| r.get(0),
            )
            .ok();
    }
    if fornitore_id.is_none() && !rag_soc.is_empty() {
        fornitore_id = conn
            .query_row(
                "SELECT id FROM fornitori WHERE LOWER(TRIM(ragione_sociale))=?",
                params![rag_soc.to_lowercase().trim()],
                |r| r.get(0),
            )
            .ok();
    }
    if fornitore_id.is_none() {
        conn.execute(
            "INSERT INTO fornitori (ragione_sociale, p_iva, via, cap, citta, provincia, stato, estero)
             VALUES (?,?,?,?,?,?,?,?)",
            params![rag_soc, p_iva, sede_ind, sede_cap, sede_com, sede_prov, sede_naz, if id_paese != "IT" { 1 } else { 0 }],
        )?;
        fornitore_id = Some(conn.last_insert_rowid());
    }
    let fornitore_id = fornitore_id.unwrap();

    // Numero / data dal documento.
    let gen = body_el
        .and_then(|b| child(b, "DatiGenerali"))
        .and_then(|g| child(g, "DatiGeneraliDocumento"));
    let numero = {
        let n = gen.map(|g| child_text(g, "Numero")).unwrap_or_default();
        if n.is_empty() { format!("IMPORT-{}", millis()) } else { n }
    };
    let data = {
        let d = gen.map(|g| child_text(g, "Data")).unwrap_or_default();
        if d.is_empty() { web::oggi() } else { d }
    };

    // Duplicato?
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM acquisti WHERE numero=? AND fornitore_id=?", params![numero, fornitore_id], |r| r.get(0))
        .ok();
    if let Some(eid) = existing {
        return Err(ApiError::Body(
            StatusCode::CONFLICT,
            json!({ "error": format!("Acquisto già presente (id={eid})"), "acquistoId": eid }),
        ));
    }

    // Righe.
    let dati_beni = body_el.and_then(|b| child(b, "DatiBeniServizi"));
    let linee: Vec<roxmltree::Node> = dati_beni
        .map(|d| d.children().filter(|c| c.is_element() && c.tag_name().name() == "DettaglioLinee").collect())
        .unwrap_or_default();
    if linee.len() > 5000 {
        return Err(ApiError::Status(StatusCode::PAYLOAD_TOO_LARGE, "Troppe righe nel documento".into()));
    }

    // Alias map del fornitore (codice_norm → prodotto_id).
    let alias: HashMap<String, i64> = {
        let mut m = HashMap::new();
        let mut stmt = conn.prepare("SELECT prodotto_id, codice_norm FROM fornitore_codice_alias WHERE fornitore_id=?")?;
        let rows = stmt.query_map(params![fornitore_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (pid, k) = row?;
            m.insert(k, pid);
        }
        m
    };

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO acquisti (numero, data_emissione, fornitore_id, note, stato) VALUES (?,?,?,?,?)",
        params![numero, data, fornitore_id, "Importato da XML FatturaPA passiva", "RICEVUTA"],
    )?;
    let acquisto_id = tx.last_insert_rowid();
    let mut imp = 0.0f64;
    let mut abbinate = 0i64;
    for l in &linee {
        let q = {
            let v = parse_f(&child_text(*l, "Quantita")).unwrap_or(1.0);
            if v == 0.0 || v.is_nan() { 1.0 } else { v }
        };
        let pu = parse_f(&child_text(*l, "PrezzoUnitario")).unwrap_or(0.0);
        let aliq = parse_f(&child_text(*l, "AliquotaIVA")).unwrap_or(0.0);
        let descr = child_text(*l, "Descrizione");
        let codice_art = child(*l, "CodiceArticolo").map(|c| child_text(c, "CodiceValore")).unwrap_or_default();
        let key = norm(if codice_art.is_empty() { &descr } else { &codice_art });
        let prodotto_id = if key.is_empty() { None } else { alias.get(&key).copied() };
        if prodotto_id.is_some() {
            abbinate += 1;
        }
        tx.execute(
            "INSERT INTO acquisti_righe (acquisto_id, descrizione, quantita, prezzo, iva, unita_misura, prodotto_id, codice_prodotto)
             VALUES (?,?,?,?,?,?,?,?)",
            params![acquisto_id, descr, q, pu, aliq, child_text(*l, "UnitaMisura"), prodotto_id, codice_art],
        )?;
        imp += q * pu;
    }
    tx.commit()?;

    Ok(Json(json!({
        "id": acquisto_id,
        "numero": numero,
        "fornitoreId": fornitore_id,
        "ragSoc": rag_soc,
        "righe": linee.len(),
        "abbinate": abbinate,
        "imponibile": web::num((imp * 100.0).round() / 100.0),
    })))
}

async fn ricevute(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT a.id, a.numero, a.data_emissione, a.stato, a.fornitore_id,
                f.ragione_sociale AS fornitore_nome,
                (SELECT COUNT(*) FROM acquisti_righe r WHERE r.acquisto_id = a.id) AS num_righe,
                (SELECT COALESCE(SUM(r.quantita * r.prezzo * (1 - COALESCE(r.sconto,0)/100.0) * (1 + COALESCE(r.iva,0)/100.0)), 0)
                   FROM acquisti_righe r WHERE r.acquisto_id = a.id) AS totale,
                (SELECT COALESCE(SUM(p.importo), 0) FROM pagamenti p WHERE p.acquisto_id = a.id) AS pagato,
                (SELECT COUNT(*) FROM arrivi_merce am WHERE am.acquisto_id = a.id) AS num_arrivi
         FROM acquisti a LEFT JOIN fornitori f ON a.fornitore_id = f.id
         WHERE a.note LIKE '%FatturaPA passiva%' OR a.note LIKE '%Importato da XML%'
         ORDER BY a.data_emissione DESC, a.id DESC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            let totale = (r.get::<_, f64>("totale")? * 100.0).round() / 100.0;
            let pagato = (r.get::<_, f64>("pagato")? * 100.0).round() / 100.0;
            Ok(json!({
                "id": r.get::<_, i64>("id")?,
                "numero": r.get::<_, Option<String>>("numero")?,
                "dataEmissione": r.get::<_, Option<String>>("data_emissione")?,
                "fornitoreId": r.get::<_, Option<i64>>("fornitore_id")?,
                "fornitoreNome": r.get::<_, Option<String>>("fornitore_nome")?.unwrap_or_else(|| "—".into()),
                "stato": r.get::<_, Option<String>>("stato")?,
                "numRighe": r.get::<_, i64>("num_righe")?,
                "totale": web::num(totale),
                "importoPagato": web::num(pagato),
                "pagato": totale > 0.0 && pagato >= totale - 0.05,
                "caricatoMagazzino": r.get::<_, i64>("num_arrivi")? > 0,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn providers() -> Json<Value> {
    Json(json!([
        { "id": "aruba", "name": "Aruba Fatturazione Elettronica", "status": "TODO", "docs": "https://fatturazioneelettronica.aruba.it/apidoc/v2/docs.html" },
        { "id": "fic", "name": "Fatture in Cloud", "status": "TODO", "docs": "https://developers.fattureincloud.it/" },
        { "id": "acube", "name": "Acubeapi", "status": "TODO", "docs": "https://docs.invoicing.acubeapi.com/" },
    ]))
}

async fn poll_aruba() -> ApiResult<Json<Value>> {
    // Polling network: in offline le credenziali non sono configurate → stesso
    // errore di Node (pollAruba lancia subito).
    let user = std::env::var("ARUBA_USER").unwrap_or_default();
    let pass = std::env::var("ARUBA_PASS").unwrap_or_default();
    if user.is_empty() || pass.is_empty() {
        return Err(ApiError::Status(StatusCode::INTERNAL_SERVER_ERROR, "ARUBA_USER e ARUBA_PASS non configurati".into()));
    }
    // Con credenziali presenti servirebbe l'integrazione HTTP completa (fuori scope offline).
    Err(ApiError::Status(StatusCode::NOT_IMPLEMENTED, "Polling Aruba non disponibile in edizione offline".into()))
}

async fn poll_provider(Path(provider): Path<String>) -> ApiResult<Json<Value>> {
    if provider == "aruba" {
        // gestito da /poll/aruba; qui non dovrebbe arrivare.
        return Ok(Json(json!({})));
    }
    Err(ApiError::Body(
        StatusCode::NOT_IMPLEMENTED,
        json!({
            "error": format!("Provider \"{provider}\" non ancora implementato"),
            "hint": "Provider supportati attualmente: aruba. Configurare ARUBA_USER e ARUBA_PASS nell'ambiente.",
        }),
    ))
}

fn millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}
