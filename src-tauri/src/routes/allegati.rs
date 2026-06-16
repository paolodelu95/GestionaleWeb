//! /api/allegati — parità con routes/allegati.js (upload/download allegati documenti).
//! I file vanno in data_dir/uploads/<tenant> (segregati per tenant).

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::Body,
    extract::{Multipart, Path as AxPath, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::db::{AppState, DEFAULT_TENANT};
use crate::error::{ApiError, ApiResult};
use crate::web::tenant_conn;

const ALLOWED_MIME: [&str; 14] = [
    "application/pdf",
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "text/plain", "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/xml", "text/xml",
    "application/zip",
];
const ALLOWED_EXT: [&str; 13] = [
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".txt", ".csv", ".xls", ".xlsx", ".doc", ".docx", ".xml", // .zip sotto
];
const MAX_SIZE: usize = 10 * 1024 * 1024;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(upload))
        .route("/:id", axum::routing::delete(remove))
        .route("/:id/download", get(download))
}

fn upload_dir(state: &AppState) -> PathBuf {
    let dir = state.data_dir.join("uploads").join(DEFAULT_TENANT);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Estensione (lowercase, con punto) di un filename, come path.extname().toLowerCase().
fn ext_of(name: &str) -> String {
    match Path::new(name).extension().and_then(|e| e.to_str()) {
        Some(e) => format!(".{}", e.to_lowercase()),
        None => String::new(),
    }
}

fn ext_allowed(ext: &str) -> bool {
    ext == ".zip" || ALLOWED_EXT.contains(&ext)
}

fn safe_file_path(state: &AppState, percorso: &str) -> Option<PathBuf> {
    if percorso.is_empty() {
        return None;
    }
    let base = upload_dir(state).canonicalize().ok()?;
    let candidate = base.join(percorso);
    let candidate = candidate.canonicalize().ok().unwrap_or(candidate);
    if candidate == base || candidate.starts_with(&base) {
        Some(candidate)
    } else {
        None
    }
}

async fn list(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Json<Value>> {
    let (tipo, id) = (q.get("tipo"), q.get("id"));
    let (tipo, id) = match (tipo, id) {
        (Some(t), Some(i)) if !t.is_empty() && !i.is_empty() => (t.clone(), i.clone()),
        _ => return Ok(Json(json!([]))),
    };
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, nome_file, percorso, dimensione, mime_type, created_at
         FROM allegati WHERE documento_tipo=? AND documento_id=? ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map(params![tipo, id], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "nomeFile": r.get::<_, Option<String>>(1)?,
                "percorso": r.get::<_, Option<String>>(2)?,
                "dimensione": r.get::<_, Option<i64>>(3)?,
                "mimeType": r.get::<_, Option<String>>(4)?,
                "createdAt": r.get::<_, Option<String>>(5)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

async fn upload(
    State(state): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
    mut multipart: Multipart,
) -> ApiResult<Json<Value>> {
    // Estrae il campo "file".
    let mut original = String::new();
    let mut mimetype = String::new();
    let mut data: Vec<u8> = Vec::new();
    let mut found = false;
    while let Some(field) = multipart.next_field().await.map_err(|e| ApiError::Status(StatusCode::BAD_REQUEST, e.to_string()))? {
        if field.name() == Some("file") {
            original = field.file_name().unwrap_or("").to_string();
            mimetype = field.content_type().unwrap_or("").to_string();
            data = field
                .bytes()
                .await
                .map_err(|e| ApiError::Status(StatusCode::BAD_REQUEST, e.to_string()))?
                .to_vec();
            found = true;
            break;
        }
    }

    let ext = ext_of(&original);
    if found {
        // fileFilter: mime + ext consentiti.
        if !ALLOWED_MIME.contains(&mimetype.as_str()) || !ext_allowed(&ext) {
            return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Tipo di file non consentito".into()));
        }
        if data.len() > MAX_SIZE {
            return Err(ApiError::Status(StatusCode::PAYLOAD_TOO_LARGE, "File too large".into()));
        }
    }

    let tipo = q.get("tipo").cloned().unwrap_or_default();
    let id = q.get("id").cloned().unwrap_or_default();
    if tipo.is_empty() || id.is_empty() || !found {
        return Err(ApiError::Status(StatusCode::BAD_REQUEST, "Parametri mancanti".into()));
    }

    // Nome file unico (Date.now()-rand) + estensione consentita.
    let stored_name = format!("{}-{}{}", millis(), rand_int(), if ext_allowed(&ext) { ext.as_str() } else { "" });
    let dir = upload_dir(&state);
    std::fs::write(dir.join(&stored_name), &data)
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    let size = data.len() as i64;

    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    conn.execute(
        "INSERT INTO allegati (documento_tipo, documento_id, nome_file, percorso, dimensione, mime_type) VALUES (?,?,?,?,?,?)",
        params![tipo, id, original, stored_name, size, mimetype],
    )?;
    Ok(Json(json!({
        "id": conn.last_insert_rowid(),
        "nomeFile": original,
        "percorso": stored_name,
        "dimensione": size,
        "mimeType": mimetype,
        "createdAt": now_iso(),
    })))
}

async fn remove(State(state): State<AppState>, AxPath(id): AxPath<i64>) -> ApiResult<Json<Value>> {
    let conn = tenant_conn(&state)?;
    let conn = conn.lock().unwrap();
    let percorso: Option<String> = conn
        .query_row("SELECT percorso FROM allegati WHERE id=?", params![id], |r| r.get(0))
        .ok();
    let percorso = match percorso {
        Some(p) => p,
        None => return Err(ApiError::Status(StatusCode::NOT_FOUND, "Allegato non trovato".into())),
    };
    if let Some(fp) = safe_file_path(&state, &percorso) {
        let _ = std::fs::remove_file(fp);
    }
    conn.execute("DELETE FROM allegati WHERE id=?", params![id])?;
    Ok(Json(json!({ "success": true })))
}

async fn download(State(state): State<AppState>, AxPath(id): AxPath<i64>) -> Response {
    let row = {
        let conn = match tenant_conn(&state) {
            Ok(c) => c,
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Errore").into_response(),
        };
        let conn = conn.lock().unwrap();
        conn.query_row("SELECT nome_file, percorso, mime_type FROM allegati WHERE id=?", params![id], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        })
        .ok()
    };
    let (nome, percorso, mime) = match row {
        Some(t) => t,
        None => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Non trovato" }))).into_response(),
    };
    let fp = match safe_file_path(&state, &percorso) {
        Some(p) if p.exists() => p,
        _ => return (StatusCode::NOT_FOUND, Json(json!({ "error": "File non trovato sul disco" }))).into_response(),
    };
    let bytes = match std::fs::read(&fp) {
        Ok(b) => b,
        Err(_) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "File non trovato sul disco" }))).into_response(),
    };
    let ctype = if mime.is_empty() { "application/octet-stream".to_string() } else { mime };
    Response::builder()
        .header(header::CONTENT_TYPE, ctype)
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", nome.replace('"', "")))
        .body(Body::from(bytes))
        .unwrap()
}

fn millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

fn rand_int() -> u32 {
    let mut b = [0u8; 4];
    let _ = getrandom::getrandom(&mut b);
    (u32::from_le_bytes(b) % 1_000_000) + 1
}

fn now_iso() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = now.as_secs() as i64;
    let ms = now.subsec_millis();
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let iso = crate::web::iso_of_days(days);
    format!("{iso}T{h:02}:{mi:02}:{s:02}.{ms:03}Z")
}
