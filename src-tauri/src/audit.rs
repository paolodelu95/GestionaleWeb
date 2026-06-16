//! Log di audit best-effort (parità con utils/audit.js): non blocca mai l'operazione.

use rusqlite::{params, Connection};
use serde_json::Value;

pub fn audit(conn: &Connection, entity_type: &str, entity_id: i64, action: &str, payload: &Value) {
    let _ = conn.execute(
        "INSERT INTO audit_log (entity_type, entity_id, action, payload) VALUES (?1,?2,?3,?4)",
        params![entity_type, entity_id, action, payload.to_string()],
    );
}
