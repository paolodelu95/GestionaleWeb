//! Movimentazione magazzino centralizzata (parità con utils/stock.js).
//! In Fase 1 servono solo le funzioni usate da prodotti: deposito predefinito,
//! upsert giacenza, riallineo. `applicaRigheStock` arriverà in Fase 2 coi documenti.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

/// Contesto del movimento (parità con il `ctx` di applicaRigheStock in stock.js).
#[derive(Default)]
pub struct StockCtx {
    pub data: Option<String>,
    pub causale: String,
    pub documento_tipo: String,
    pub documento_id: Option<i64>,
    pub documento_numero: String,
    pub cliente_id: Option<i64>,
    pub cliente_nome: String,
    pub fornitore_id: Option<i64>,
    pub fornitore_nome: String,
    pub note: String,
    pub magazzino_id: Option<i64>,
    pub lotto: Option<String>,
    pub scadenza: Option<String>,
}

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

/// Applica un movimento di stock a una lista di righe documento.
/// delta = -1 (scarico) | +1 (carico). Salta righe senza prodotto, qty 0 o
/// scaricaMagazzino === false. Parità con applicaRigheStock di stock.js.
pub fn applica_righe_stock(
    conn: &Connection,
    righe: &[Value],
    delta: i64,
    ctx: &StockCtx,
) -> rusqlite::Result<()> {
    let oggi = crate::web::oggi();
    let mag_def = ctx.magazzino_id.or(magazzino_default_id(conn)?);

    for r in righe {
        let prodotto_id = match r.get("prodottoId").and_then(Value::as_i64) {
            Some(p) if p != 0 => p,
            _ => continue,
        };
        if matches!(r.get("scaricaMagazzino"), Some(Value::Bool(false))) {
            continue;
        }
        let qty = num_loose(r.get("quantita"));
        if qty == 0.0 {
            continue;
        }
        let mag = r.get("magazzinoId").and_then(Value::as_i64).or(mag_def);
        let lotto = str_or(r.get("lotto"), ctx.lotto.as_deref(), "");
        let scad = str_or(r.get("scadenza"), ctx.scadenza.as_deref(), "");
        let signed = delta as f64 * qty;

        conn.execute("UPDATE prodotti SET quantita = quantita + ?1 WHERE id = ?2", params![signed, prodotto_id])?;
        if let Some(vid) = r.get("varianteId").and_then(Value::as_i64).filter(|&v| v != 0) {
            conn.execute("UPDATE prodotto_varianti SET quantita = quantita + ?1 WHERE id = ?2", params![signed, vid])?;
        }
        let variante_id = r.get("varianteId").and_then(Value::as_i64).filter(|&v| v != 0);
        adj_giacenza(conn, prodotto_id, variante_id, mag, &lotto, &scad, signed)?;

        let nome: String = conn
            .query_row("SELECT nome FROM prodotti WHERE id=?1", [prodotto_id], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten()
            .filter(|s| !s.is_empty())
            .or_else(|| r.get("descrizione").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_default();

        conn.execute(
            "INSERT INTO movimenti_magazzino \
             (data,prodotto_id,prodotto_nome,tipo,quantita,causale,documento_tipo,documento_id,documento_numero,\
              cliente_id,cliente_nome,fornitore_id,fornitore_nome,note,variante_id,variante_taglia,variante_colore,\
              magazzino_id,magazzino_dest_id,lotto,scadenza) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
            params![
                ctx.data.clone().unwrap_or(oggi.clone()),
                prodotto_id,
                nome,
                if delta > 0 { "CARICO" } else { "SCARICO" },
                signed.abs(),
                ctx.causale,
                ctx.documento_tipo,
                ctx.documento_id,
                ctx.documento_numero,
                ctx.cliente_id,
                ctx.cliente_nome,
                ctx.fornitore_id,
                ctx.fornitore_nome,
                ctx.note,
                variante_id,
                r.get("varianteTaglia").and_then(Value::as_str).unwrap_or(""),
                r.get("varianteColore").and_then(Value::as_str).unwrap_or(""),
                mag,
                Option::<i64>::None,
                lotto,
                scad,
            ],
        )?;
    }
    Ok(())
}

fn num_loose(v: Option<&Value>) -> f64 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.replace(',', ".").parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn str_or(field: Option<&Value>, ctx_val: Option<&str>, default: &str) -> String {
    if let Some(s) = field.and_then(Value::as_str).filter(|s| !s.is_empty()) {
        return s.to_string();
    }
    ctx_val.filter(|s| !s.is_empty()).unwrap_or(default).to_string()
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
