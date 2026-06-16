//! Calcoli fiscali dei documenti (ritenuta d'acconto, cassa previdenziale, bollo).
//! Parità con utils/fiscale.js — usati da fatture, note di credito e (poi) XML SDI.

use rusqlite::Row;

pub fn round2(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}

/// Parametri fiscali normalizzati di un documento.
#[derive(Clone)]
pub struct Fisc {
    pub ritenuta_aliquota: f64,
    pub ritenuta_causale: String,
    pub ritenuta_tipo: String,
    pub ritenuta_su_cassa: bool,
    pub cassa_tipo: String,
    pub cassa_aliquota: f64,
    pub cassa_iva: f64,
    pub bollo: bool,
}

/// Totali calcolati.
pub struct Totali {
    pub imponibile: f64,
    pub cassa_importo: f64,
    pub iva: f64,
    pub ritenuta_importo: f64,
    pub bollo_importo: f64,
    pub totale: f64,
    pub netto_a_pagare: f64,
}

/// Righe come (quantita, prezzo, sconto, iva).
pub fn calcola_totali_fiscali(righe: &[(f64, f64, f64, f64)], fisc: &Fisc) -> Totali {
    let mut imponibile = 0.0;
    let mut iva_righe = 0.0;
    for &(q, p, sc, iva) in righe {
        let base = q * p * (1.0 - sc / 100.0);
        imponibile += base;
        iva_righe += base * iva / 100.0;
    }
    let imponibile = round2(imponibile);
    let iva_righe = round2(iva_righe);

    let cassa_importo = if fisc.cassa_aliquota != 0.0 {
        round2(imponibile * fisc.cassa_aliquota / 100.0)
    } else {
        0.0
    };
    let iva_cassa = if cassa_importo != 0.0 {
        round2(cassa_importo * fisc.cassa_iva / 100.0)
    } else {
        0.0
    };
    let iva = round2(iva_righe + iva_cassa);

    let ritenuta_base = imponibile + if fisc.ritenuta_su_cassa { cassa_importo } else { 0.0 };
    let ritenuta_importo = if fisc.ritenuta_aliquota != 0.0 {
        round2(ritenuta_base * fisc.ritenuta_aliquota / 100.0)
    } else {
        0.0
    };

    let bollo_importo = if fisc.bollo { 2.0 } else { 0.0 };
    let totale = round2(imponibile + cassa_importo + iva + bollo_importo);
    let netto_a_pagare = round2(totale - ritenuta_importo);

    Totali {
        imponibile,
        cassa_importo,
        iva,
        ritenuta_importo,
        bollo_importo,
        totale,
        netto_a_pagare,
    }
}

/// Estrae i parametri fiscali da una riga DB (colonne snake_case).
pub fn fisc_from_row(row: &Row) -> Fisc {
    let f = |k: &str| row.get::<_, Option<f64>>(k).ok().flatten().unwrap_or(0.0);
    let s = |k: &str| row.get::<_, Option<String>>(k).ok().flatten().unwrap_or_default();
    let b = |k: &str| row.get::<_, Option<i64>>(k).ok().flatten() == Some(1);
    Fisc {
        ritenuta_aliquota: f("ritenuta_aliquota"),
        ritenuta_causale: s("ritenuta_causale"),
        ritenuta_tipo: s("ritenuta_tipo"),
        ritenuta_su_cassa: b("ritenuta_su_cassa"),
        cassa_tipo: s("cassa_tipo"),
        cassa_aliquota: f("cassa_aliquota"),
        cassa_iva: f("cassa_iva"),
        bollo: b("bollo"),
    }
}

/// Valori fiscali da bindare nell'INSERT/UPDATE, nell'ordine di FISC_COLS.
/// (ritenuta_aliquota, ritenuta_causale, ritenuta_tipo, ritenuta_su_cassa,
///  cassa_tipo, cassa_aliquota, cassa_iva, bollo)
pub fn fisc_values(body: &serde_json::Value) -> (f64, String, String, i64, String, f64, f64, i64) {
    use serde_json::Value;
    let n = |k: &str| body.get(k).and_then(Value::as_f64).unwrap_or(0.0);
    let s = |k: &str| body.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let bf = |k: &str| matches!(body.get(k), Some(Value::Bool(true))) as i64;
    (
        n("ritenutaAliquota"),
        s("ritenutaCausale"),
        s("ritenutaTipo"),
        bf("ritenutaSuCassa"),
        s("cassaTipo"),
        n("cassaAliquota"),
        n("cassaIva"),
        bf("bollo"),
    )
}

/// Le 8 colonne fiscali, nell'ordine usato da INSERT/UPDATE.
pub const FISC_COLS: [&str; 8] = [
    "ritenuta_aliquota",
    "ritenuta_causale",
    "ritenuta_tipo",
    "ritenuta_su_cassa",
    "cassa_tipo",
    "cassa_aliquota",
    "cassa_iva",
    "bollo",
];
