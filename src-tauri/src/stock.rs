//! Movimentazione magazzino centralizzata (parità con utils/stock.js).
//! In Fase 1 servono solo le funzioni usate da prodotti: deposito predefinito,
//! upsert giacenza, riallineo. `applicaRigheStock` arriverà in Fase 2 coi documenti.

use rusqlite::{params, Connection, OptionalExtension};

/// Id del deposito predefinito (o il primo attivo/esistente). None se nessuno.
pub fn magazzino_default_id(conn: &Connection) -> rusqlite::Result<Option<i64>> {
    let q = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).optional();
    if let Some(id) = q("SELECT id FROM magazzini WHERE predefinito=1")? {
        return Ok(Some(id));
    }
    if let Some(id) = q("SELECT id FROM magazzini WHERE attivo=1 ORDER BY id LIMIT 1")? {
        return Ok(Some(id));
    }
    q("SELECT id FROM magazzini ORDER BY id LIMIT 1")
}

/// Upsert giacenza per chiave prodotto/variante/deposito/lotto/scadenza.
/// No-op se manca il deposito o delta è 0 (come `if (!magazzinoId || !delta) return`).
pub fn adj_giacenza(
    conn: &Connection,
    prodotto_id: i64,
    variante_id: Option<i64>,
    magazzino_id: Option<i64>,
    lotto: &str,
    scadenza: &str,
    delta: f64,
) -> rusqlite::Result<()> {
    let mag = match magazzino_id {
        Some(m) if delta != 0.0 => m,
        _ => return Ok(()),
    };
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM giacenze \
             WHERE prodotto_id=?1 AND IFNULL(variante_id,0)=IFNULL(?2,0) AND magazzino_id=?3 AND lotto=?4 AND scadenza=?5",
            params![prodotto_id, variante_id, mag, lotto, scadenza],
            |r| r.get(0),
        )
        .optional()?;
    match existing {
        Some(id) => {
            conn.execute("UPDATE giacenze SET quantita = quantita + ?1 WHERE id=?2", params![delta, id])?;
        }
        None => {
            conn.execute(
                "INSERT INTO giacenze (prodotto_id, variante_id, magazzino_id, lotto, scadenza, quantita) \
                 VALUES (?1,?2,?3,?4,?5,?6)",
                params![prodotto_id, variante_id, mag, lotto, scadenza, delta],
            )?;
        }
    }
    Ok(())
}

/// Riallinea le giacenze ai totali "master" riversando la differenza nel deposito
/// predefinito (mantiene l'invariante somma(giacenze)==totale).
pub fn riallinea_giacenze(conn: &Connection, prodotto_id: i64) -> rusqlite::Result<()> {
    let mag = match magazzino_default_id(conn)? {
        Some(m) => m,
        None => return Ok(()),
    };
    let varianti: Vec<(i64, f64)> = {
        let mut stmt =
            conn.prepare("SELECT id, COALESCE(quantita,0) FROM prodotto_varianti WHERE prodotto_id=?1")?;
        let rows = stmt
            .query_map([prodotto_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    if !varianti.is_empty() {
        for (vid, vq) in varianti {
            let somma: f64 = conn.query_row(
                "SELECT COALESCE(SUM(quantita),0) FROM giacenze WHERE prodotto_id=?1 AND variante_id=?2",
                params![prodotto_id, vid],
                |r| r.get(0),
            )?;
            let diff = vq - somma;
            if diff != 0.0 {
                adj_giacenza(conn, prodotto_id, Some(vid), Some(mag), "", "", diff)?;
            }
        }
    } else {
        let tot: f64 = conn
            .query_row("SELECT COALESCE(quantita,0) FROM prodotti WHERE id=?1", [prodotto_id], |r| r.get(0))
            .optional()?
            .unwrap_or(0.0);
        let somma: f64 = conn.query_row(
            "SELECT COALESCE(SUM(quantita),0) FROM giacenze WHERE prodotto_id=?1 AND variante_id IS NULL",
            [prodotto_id],
            |r| r.get(0),
        )?;
        let diff = tot - somma;
        if diff != 0.0 {
            adj_giacenza(conn, prodotto_id, None, Some(mag), "", "", diff)?;
        }
    }
    Ok(())
}
