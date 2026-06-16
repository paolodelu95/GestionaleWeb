//! Numerazione documenti (parità con utils/nextNumero.js): gap-filling che rispetta
//! prefissi e numerazione annuale, senza toccare contatori.

use rusqlite::Connection;
use std::collections::HashSet;

use crate::web::anno;

/// Prossimo numero libero per `tipo` su `table`, saltando i primi `offset` liberi.
pub fn get_next_numero(
    conn: &Connection,
    tipo: &str,
    table: &str,
    offset: i64,
) -> rusqlite::Result<String> {
    let (annuale, prefissi_json): (i64, Option<String>) = conn
        .query_row(
            "SELECT COALESCE(numerazione_annuale,1), numero_prefissi FROM azienda WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((1, None));
    let annuale = annuale != 0;
    let prefisso = prefissi_json
        .as_deref()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
        .and_then(|v| v.get(tipo).and_then(|x| x.as_str()).map(str::to_string))
        .unwrap_or_default();
    let anno = anno();

    let mut used: HashSet<i64> = HashSet::new();
    // table proviene da costante interna (mai input utente): interpolazione sicura.
    let mut stmt = conn.prepare(&format!("SELECT numero FROM \"{table}\""))?;
    let numeri: Vec<String> = stmt
        .query_map([], |r| Ok(r.get::<_, Option<String>>(0)?.unwrap_or_default()))?
        .collect::<Result<_, _>>()?;
    for s in &numeri {
        if annuale {
            // estrae N da "...{anno}/NNNN" (suffisso)
            if let Some(pos) = s.rfind(&format!("{anno}/")) {
                let tail = &s[pos + format!("{anno}/").len()..];
                if !tail.is_empty() && tail.bytes().all(|b| b.is_ascii_digit()) {
                    if let Ok(n) = tail.parse::<i64>() {
                        used.insert(n);
                    }
                }
            }
        } else {
            // rimuove la PRIMA occorrenza del prefisso (come String.replace JS) poi ^\d+$
            let stripped = if prefisso.is_empty() {
                s.clone()
            } else if let Some(pos) = s.find(&prefisso) {
                let mut t = s.clone();
                t.replace_range(pos..pos + prefisso.len(), "");
                t
            } else {
                s.clone()
            };
            if !stripped.is_empty() && stripped.bytes().all(|b| b.is_ascii_digit()) {
                if let Ok(n) = stripped.parse::<i64>() {
                    used.insert(n);
                }
            }
        }
    }

    let mut n = 1i64;
    let mut skipped = 0i64;
    while used.contains(&n) || skipped < offset {
        if !used.contains(&n) {
            skipped += 1;
        }
        n += 1;
    }

    Ok(if annuale {
        format!("{prefisso}{anno}/{n:04}")
    } else {
        format!("{prefisso}{n}")
    })
}
