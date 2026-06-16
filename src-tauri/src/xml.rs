//! Generazione XML FatturaPA (TD01 fattura / TD04 nota di credito).
//! Parità BYTE-PER-BYTE con routes/fatturaXml.js buildFatturaPA: ordine elementi,
//! indentazione e formattazione numeri devono combaciare (XML diverso = scarto SDI).

use rusqlite::{Connection, OptionalExtension};

use crate::fiscale::{calcola_totali_fiscali, fisc_from_row, Fisc};

// ── helpers ──────────────────────────────────────────────────────────────────

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn fmt2(n: f64) -> String {
    format!("{:.2}", n)
}

fn fmt_date(s: &str) -> String {
    s.chars().take(10).collect()
}

fn sanitize_progressivo(s: &str) -> String {
    let v: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(10).collect();
    if v.is_empty() {
        "1".into()
    } else {
        v
    }
}

fn clean_piva(s: &str) -> String {
    let s = s.strip_prefix("IT").or_else(|| s.strip_prefix("it")).unwrap_or(s);
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

fn pad_cap(s: &str) -> String {
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    let padded = if digits.len() < 5 {
        format!("{:0>5}", digits)
    } else {
        digits
    };
    let out: String = padded.chars().take(5).collect();
    if out.is_empty() {
        "00000".into()
    } else {
        out
    }
}

/// FPA12 = 6 char → PA; FPR12 = 7 char → privato/B2B.
fn detect_formato(sdi: &str) -> (&'static str, String) {
    let v: String = sdi.trim().to_uppercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    match v.len() {
        6 => ("FPA12", v),
        7 => ("FPR12", v),
        _ => ("FPR12", "0000000".into()),
    }
}

fn map_modalita(nome: &str) -> &'static str {
    let n = nome.to_lowercase();
    if n.contains("contant") || n.contains("cass") {
        "MP01"
    } else if n.contains("assegno circ") {
        "MP03"
    } else if n.contains("assegno") {
        "MP02"
    } else if n.contains("riba") {
        "MP12"
    } else if n.contains("rid") || n.contains("sdd") || n.contains("domicil") {
        "MP19"
    } else if n.contains("pos") || n.contains("carta") || n.contains("bancomat") || n.contains("satispay") || n.contains("paypal") {
        "MP08"
    } else if n.contains("anticipato") {
        "MP05"
    } else {
        "MP05"
    }
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn calc_scadenza(data_emissione: &str, giorni: i64, fine_mese: bool) -> String {
    let head: String = data_emissione.chars().take(10).collect();
    let parts: Vec<&str> = head.split('-').collect();
    let parsed = if parts.len() == 3 {
        match (parts[0].parse::<i64>(), parts[1].parse::<i64>(), parts[2].parse::<i64>()) {
            (Ok(y), Ok(m), Ok(d)) if (1..=12).contains(&m) && (1..=31).contains(&d) => Some((y, m, d)),
            _ => None,
        }
    } else {
        None
    };
    let (y, m, d) = match parsed {
        Some(t) => t,
        None => return fmt_date(data_emissione),
    };
    let days = days_from_civil(y, m, d) + giorni;
    let (y2, m2, _) = civil_from_days(days);
    if fine_mese {
        let first_next = days_from_civil(if m2 == 12 { y2 + 1 } else { y2 }, if m2 == 12 { 1 } else { m2 + 1 }, 1);
        let (y3, m3, d3) = civil_from_days(first_next - 1);
        format!("{y3:04}-{m3:02}-{d3:02}")
    } else {
        let (yy, mm, dd) = civil_from_days(days);
        let _ = (y2, m2);
        format!("{yy:04}-{mm:02}-{dd:02}")
    }
}

fn causale_blocks(note: &str) -> String {
    if note.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = note.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let chunk: String = chars[i..(i + 200).min(chars.len())].iter().collect();
        out.push_str(&format!("\n        <Causale>{}</Causale>", esc(&chunk)));
        i += 200;
    }
    out
}

/// Natura SDI per una riga: aliq>0 → None; altrimenti codice_iva→aliquote_iva.natura, fallback N4.
fn resolve_natura(conn: &Connection, codice_iva: &str, aliq: f64) -> Option<String> {
    if aliq > 0.0 {
        return None;
    }
    if !codice_iva.is_empty() {
        let nat: Option<String> = conn
            .query_row("SELECT natura FROM aliquote_iva WHERE codice=?1", [codice_iva], |r| r.get::<_, Option<String>>(0))
            .optional()
            .ok()
            .flatten()
            .flatten();
        if let Some(n) = nat.filter(|s| !s.is_empty()) {
            return Some(n);
        }
    }
    Some("N4".into())
}

fn resolve_esigibilita(is_split: bool, codice_iva: &str) -> &'static str {
    if is_split || codice_iva.ends_with("sp") {
        "S"
    } else {
        "I"
    }
}

// ── struct di supporto ───────────────────────────────────────────────────────

struct Riga {
    tipo: String,
    descrizione: Option<String>,
    quantita: Option<f64>,
    prezzo: Option<f64>,
    sconto: Option<f64>,
    iva: Option<f64>,
    codice_iva: String,
    unita_misura: Option<String>,
}

struct Riferimento {
    tipo: String,
    numero: String,
    data: String,
    cig: String,
    cup: String,
    commessa: String,
}

// ── builder ──────────────────────────────────────────────────────────────────

/// Genera l'XML. `is_nota` → TD04 da note_credito; altrimenti TD01 da fatture.
pub fn build_fattura_pa(conn: &Connection, id: i64, is_nota: bool) -> anyhow::Result<String> {
    // azienda
    let az = conn
        .query_row("SELECT * FROM azienda WHERE id=1", [], |r| {
            let s = |k: &str| r.get::<_, Option<String>>(k).ok().flatten().unwrap_or_default();
            Ok(AzData {
                ragione_sociale: s("ragione_sociale"),
                p_iva: s("p_iva"),
                cod_fiscale: s("cod_fiscale"),
                indirizzo: s("indirizzo"),
                cap: s("cap"),
                citta: s("citta"),
                provincia: s("provincia"),
                regime_fiscale: s("regime_fiscale"),
                pec: s("pec"),
                email: s("email"),
            })
        })
        .optional()?
        .unwrap_or_default();

    // documento
    let (doc, fisc, riferimenti) = if is_nota {
        let d = conn
            .query_row(
                "SELECT n.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap, c.citta as c_citta, c.provincia as c_provincia, \
                        c.stato as c_stato, c.p_iva as c_piva, c.codice_fiscale as c_cf, c.sdi as c_sdi, c.pec as c_pec, \
                        c.tipo_soggetto as c_tipo_soggetto, c.cig as c_cig, c.cup as c_cup, \
                        f.numero as coll_numero, f.data_emissione as coll_data \
                 FROM note_credito n LEFT JOIN clienti c ON n.cliente_id = c.id LEFT JOIN fatture f ON n.fattura_id = f.id WHERE n.id=?1",
                [id],
                |r| Ok((load_doc(r, false), fisc_from_row(r))),
            )
            .optional()?;
        let (doc, fisc) = d.ok_or_else(|| anyhow::anyhow!("Nota di credito non trovata"))?;
        let rifs = if !doc.coll_numero.is_empty() {
            vec![Riferimento { tipo: "FATTURA_COLLEGATA".into(), numero: doc.coll_numero.clone(), data: doc.coll_data.clone(), cig: String::new(), cup: String::new(), commessa: String::new() }]
        } else {
            vec![]
        };
        (doc, fisc, rifs)
    } else {
        let d = conn
            .query_row(
                "SELECT f.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap, c.citta as c_citta, c.provincia as c_provincia, \
                        c.stato as c_stato, c.p_iva as c_piva, c.codice_fiscale as c_cf, c.sdi as c_sdi, c.pec as c_pec, \
                        c.tipo_soggetto as c_tipo_soggetto, c.cig as c_cig, c.cup as c_cup, \
                        tp.nome as tp_nome, tp.giorni_scadenza as tp_giorni, tp.fine_mese as tp_fine_mese, tp.immediato as tp_immediato \
                 FROM fatture f LEFT JOIN clienti c ON f.cliente_id = c.id LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id WHERE f.id=?1",
                [id],
                |r| Ok((load_doc(r, true), fisc_from_row(r))),
            )
            .optional()?;
        let (doc, fisc) = d.ok_or_else(|| anyhow::anyhow!("Fattura non trovata"))?;
        (doc, fisc, load_riferimenti(conn, id)?)
    };

    // righe
    let righe = load_righe(conn, id, is_nota)?;

    let is_pa = doc.c_tipo_soggetto == "PA" || detect_formato(&doc.c_sdi).0 == "FPA12";
    // Semantica `row.cig || row.c_cig || ''` poi .trim(): primo NON vuoto (grezzo), poi trim.
    let cig = first_truthy_trim(&[doc.doc_cig.as_str(), doc.c_cig.as_str()]);
    let cup = first_truthy_trim(&[doc.doc_cup.as_str(), doc.c_cup.as_str()]);

    // IVA breakdown (ordine di inserimento preservato)
    let mut iva_map: Vec<IvaEntry> = Vec::new();
    for r in &righe {
        if r.tipo == "NOTA" {
            continue;
        }
        let aliq = r.iva.unwrap_or(22.0);
        let natura = resolve_natura(conn, &r.codice_iva, aliq);
        let esig = resolve_esigibilita(is_pa && aliq > 0.0, &r.codice_iva);
        let key = format!("{}|{}|{}", js_num(aliq), natura.clone().unwrap_or_default(), esig);
        let base = r.quantita.unwrap_or(1.0) * r.prezzo.unwrap_or(0.0) * (1.0 - r.sconto.unwrap_or(0.0) / 100.0);
        upsert_iva(&mut iva_map, key, aliq, natura, esig, base, base * aliq / 100.0);
    }

    // calcoli fiscali
    let righe4: Vec<(f64, f64, f64, f64)> = righe
        .iter()
        .map(|r| (r.quantita.unwrap_or(0.0), r.prezzo.unwrap_or(0.0), r.sconto.unwrap_or(0.0), r.iva.unwrap_or(0.0)))
        .collect();
    let tot = calcola_totali_fiscali(&righe4, &fisc);

    if tot.cassa_importo > 0.0 {
        let aliq = fisc.cassa_iva;
        let natura = resolve_natura(conn, "", aliq);
        let esig = resolve_esigibilita(is_pa && aliq > 0.0, "");
        let key = format!("{}|{}|{}", js_num(aliq), natura.clone().unwrap_or_default(), esig);
        upsert_iva(&mut iva_map, key, aliq, natura, esig, tot.cassa_importo, tot.iva_cassa);
    }

    let totale = tot.totale;

    // blocchi fiscali
    let ritenuta_block = if tot.ritenuta_importo > 0.0 {
        format!(
            "\n        <DatiRitenuta>\n          <TipoRitenuta>{}</TipoRitenuta>\n          <ImportoRitenuta>{}</ImportoRitenuta>\n          <AliquotaRitenuta>{}</AliquotaRitenuta>\n          <CausalePagamento>{}</CausalePagamento>\n        </DatiRitenuta>",
            esc(or(&fisc.ritenuta_tipo, "RT02")),
            fmt2(tot.ritenuta_importo),
            fmt2(fisc.ritenuta_aliquota),
            esc(or(&fisc.ritenuta_causale, "A")),
        )
    } else {
        String::new()
    };
    let bollo_block = if tot.bollo_importo > 0.0 {
        format!("\n        <DatiBollo>\n          <BolloVirtuale>SI</BolloVirtuale>\n          <ImportoBollo>{}</ImportoBollo>\n        </DatiBollo>", fmt2(tot.bollo_importo))
    } else {
        String::new()
    };
    let cassa_natura = resolve_natura(conn, "", fisc.cassa_iva);
    let cassa_block = if tot.cassa_importo > 0.0 {
        let nat = cassa_natura.as_ref().map(|n| format!("\n          <Natura>{}</Natura>", esc(n))).unwrap_or_default();
        format!(
            "\n        <DatiCassaPrevidenziale>\n          <TipoCassa>{}</TipoCassa>\n          <AlCassa>{}</AlCassa>\n          <ImportoContributoCassa>{}</ImportoContributoCassa>\n          <ImponibileCassa>{}</ImponibileCassa>\n          <AliquotaIVA>{}</AliquotaIVA>{}\n        </DatiCassaPrevidenziale>",
            esc(or(&fisc.cassa_tipo, "TC22")),
            fmt2(fisc.cassa_aliquota),
            fmt2(tot.cassa_importo),
            fmt2(tot.imponibile),
            fmt2(fisc.cassa_iva),
            nat,
        )
    } else {
        String::new()
    };
    let fiscali_block = format!("{ritenuta_block}{bollo_block}{cassa_block}");

    let p_iva_az = clean_piva(if az.p_iva.is_empty() { "00000000000" } else { &az.p_iva });
    let (formato, cod_dest) = detect_formato(&doc.c_sdi);
    let has_pec = cod_dest == "0000000" && !doc.c_pec.is_empty();
    let progressivo = sanitize_progressivo(&doc.numero);
    let scadenza = calc_scadenza(&doc.data_emissione, doc.tp_giorni, doc.tp_fine_mese != 0);
    let tipo_doc = if is_nota { "TD04" } else { "TD01" };

    let cf_az_block = if !az.cod_fiscale.is_empty() && az.cod_fiscale != az.p_iva {
        format!("\n        <CodiceFiscale>{}</CodiceFiscale>", esc(&az.cod_fiscale))
    } else {
        String::new()
    };
    let prov_az_block = if !az.provincia.is_empty() {
        format!("\n        <Provincia>{}</Provincia>", esc(&prov2(&az.provincia)))
    } else {
        String::new()
    };
    let contatti_az_block = if !az.pec.is_empty() || !az.email.is_empty() {
        let mail = if !az.pec.is_empty() { &az.pec } else { &az.email };
        format!("\n      <Contatti><Email>{}</Email></Contatti>", esc(mail))
    } else {
        String::new()
    };

    let piva_client_block = if !doc.c_piva.is_empty() {
        format!("\n        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>{}</IdCodice></IdFiscaleIVA>", esc(&clean_piva(&doc.c_piva)))
    } else {
        String::new()
    };
    let cf_client_block = if !doc.c_cf.is_empty() {
        format!("\n        <CodiceFiscale>{}</CodiceFiscale>", esc(&doc.c_cf))
    } else {
        String::new()
    };
    let prov_client_block = if !doc.c_provincia.is_empty() {
        format!("\n        <Provincia>{}</Provincia>", esc(&prov2(&doc.c_provincia)))
    } else {
        String::new()
    };

    let cig_block = if !cig.is_empty() { format!("\n        <CodiceCIG>{}</CodiceCIG>", esc(&cig)) } else { String::new() };
    let cup_block = if !cup.is_empty() { format!("\n        <CodiceCUP>{}</CodiceCUP>", esc(&cup)) } else { String::new() };

    // DettaglioLinee
    let mut linea_num = 0;
    let mut linee: Vec<String> = Vec::new();
    for r in &righe {
        if r.tipo == "NOTA" {
            continue;
        }
        linea_num += 1;
        let q = r.quantita.unwrap_or(1.0);
        let pu = r.prezzo.unwrap_or(0.0);
        let sc = r.sconto.unwrap_or(0.0);
        let aliq = r.iva.unwrap_or(22.0);
        let imp = q * pu * (1.0 - sc / 100.0);
        let natura = resolve_natura(conn, &r.codice_iva, aliq);
        let um_block = match &r.unita_misura {
            Some(u) if !u.is_empty() => format!("\n        <UnitaMisura>{}</UnitaMisura>", esc(u)),
            _ => String::new(),
        };
        let sconto_block = if sc > 0.0 {
            format!("\n        <ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>{}</Percentuale></ScontoMaggiorazione>", fmt2(sc))
        } else {
            String::new()
        };
        let natura_block = natura.as_ref().map(|n| format!("\n        <Natura>{}</Natura>", esc(n))).unwrap_or_default();
        let descr = r.descrizione.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| "Prodotto/Servizio".into());
        linee.push(format!(
            "      <DettaglioLinee>\n        <NumeroLinea>{linea_num}</NumeroLinea>\n        <Descrizione>{}</Descrizione>\n        <Quantita>{}</Quantita>{um_block}\n        <PrezzoUnitario>{}</PrezzoUnitario>{sconto_block}\n        <PrezzoTotale>{}</PrezzoTotale>\n        <AliquotaIVA>{}</AliquotaIVA>{natura_block}\n      </DettaglioLinee>",
            esc(&descr), fmt2(q), fmt2(pu), fmt2(imp), fmt2(aliq),
        ));
    }
    let dettaglio_linee = linee.join("\n");

    // DatiRiepilogo
    let riepilogo: Vec<String> = iva_map
        .iter()
        .map(|v| {
            let natura_block = v.natura.as_ref().map(|n| format!("\n        <Natura>{}</Natura>", esc(n))).unwrap_or_default();
            format!(
                "      <DatiRiepilogo>\n        <AliquotaIVA>{}</AliquotaIVA>{natura_block}\n        <ImponibileImporto>{}</ImponibileImporto>\n        <Imposta>{}</Imposta>\n        <EsigibilitaIVA>{}</EsigibilitaIVA>\n      </DatiRiepilogo>",
                fmt2(v.aliq), fmt2(v.imp), fmt2(v.iva), v.esig,
            )
        })
        .collect();
    let dati_riepilogo = riepilogo.join("\n");

    // DatiPagamento
    let pagamento_block = if doc.tipo_pagamento_id.is_some() {
        let cond_pag = if doc.tp_immediato != 0 { "TP01" } else { "TP02" };
        format!(
            "\n    <DatiPagamento>\n      <CondizioniPagamento>{cond_pag}</CondizioniPagamento>\n      <DettaglioPagamento>\n        <ModalitaPagamento>{}</ModalitaPagamento>\n        <DataScadenzaPagamento>{scadenza}</DataScadenzaPagamento>\n        <ImportoPagamento>{}</ImportoPagamento>\n      </DettaglioPagamento>\n    </DatiPagamento>",
            map_modalita(&doc.tp_nome),
            fmt2(tot.netto_a_pagare),
        )
    } else {
        String::new()
    };

    let pec_block = if has_pec { format!("\n      <PECDestinatario>{}</PECDestinatario>", esc(&doc.c_pec)) } else { String::new() };

    // riferimenti PA
    let rif_xml = build_riferimenti_xml(&riferimenti);

    Ok(format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="{formato}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>{piva_az_esc}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>{prog_esc}</ProgressivoInvio>
      <FormatoTrasmissione>{formato}</FormatoTrasmissione>
      <CodiceDestinatario>{cod_dest}</CodiceDestinatario>{pec_block}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>{piva_az_esc}</IdCodice>
        </IdFiscaleIVA>{cf_az_block}
        <Anagrafica>
          <Denominazione>{az_nome}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>{az_regime}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>{az_indirizzo}</Indirizzo>
        <CAP>{az_cap}</CAP>
        <Comune>{az_citta}</Comune>{prov_az_block}
        <Nazione>IT</Nazione>
      </Sede>{contatti_az_block}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>{piva_client_block}{cf_client_block}
        <Anagrafica>
          <Denominazione>{c_nome}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>{c_via}</Indirizzo>
        <CAP>{c_cap}</CAP>
        <Comune>{c_citta}</Comune>{prov_client_block}
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>{tipo_doc}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>{data_emissione}</Data>
        <Numero>{numero_esc}</Numero>{fiscali_block}
        <ImportoTotaleDocumento>{totale}</ImportoTotaleDocumento>{cig_block}{cup_block}{causale}
      </DatiGeneraliDocumento>{rif_xml}
    </DatiGenerali>
    <DatiBeniServizi>
{dettaglio_linee}
{dati_riepilogo}
    </DatiBeniServizi>{pagamento_block}
  </FatturaElettronicaBody>
</p:FatturaElettronica>
"#,
        piva_az_esc = esc(&p_iva_az),
        prog_esc = esc(&progressivo),
        az_nome = esc(or(&az.ragione_sociale, "Azienda")),
        az_regime = esc(or(&az.regime_fiscale, "RF01")),
        az_indirizzo = esc(or(&az.indirizzo, "Via non specificata")),
        az_cap = pad_cap(&az.cap),
        az_citta = esc(or(&az.citta, "Comune")),
        c_nome = esc(or(&doc.c_nome, "Cliente")),
        c_via = esc(or(&doc.c_via, "Via non specificata")),
        c_cap = pad_cap(&doc.c_cap),
        c_citta = esc(or(&doc.c_citta, "Comune")),
        data_emissione = fmt_date(&doc.data_emissione),
        numero_esc = esc(&doc.numero),
        totale = fmt2(totale),
        causale = causale_blocks(&doc.note),
    ))
}

// ── caricamento documento/righe ──────────────────────────────────────────────

#[derive(Default)]
struct AzData {
    ragione_sociale: String,
    p_iva: String,
    cod_fiscale: String,
    indirizzo: String,
    cap: String,
    citta: String,
    provincia: String,
    regime_fiscale: String,
    pec: String,
    email: String,
}

struct DocData {
    numero: String,
    data_emissione: String,
    note: String,
    doc_cig: String,
    doc_cup: String,
    c_nome: String,
    c_via: String,
    c_cap: String,
    c_citta: String,
    c_provincia: String,
    c_piva: String,
    c_cf: String,
    c_sdi: String,
    c_pec: String,
    c_tipo_soggetto: String,
    c_cig: String,
    c_cup: String,
    tp_nome: String,
    tp_giorni: i64,
    tp_fine_mese: i64,
    tp_immediato: i64,
    tipo_pagamento_id: Option<i64>,
    coll_numero: String,
    coll_data: String,
}

fn load_doc(r: &rusqlite::Row, is_fattura: bool) -> DocData {
    let s = |k: &str| r.get::<_, Option<String>>(k).ok().flatten().unwrap_or_default();
    let i = |k: &str| r.get::<_, Option<i64>>(k).ok().flatten();
    DocData {
        numero: s("numero"),
        data_emissione: s("data_emissione"),
        note: s("note"),
        doc_cig: if is_fattura { s("cig") } else { String::new() },
        doc_cup: if is_fattura { s("cup") } else { String::new() },
        c_nome: s("c_nome"),
        c_via: s("c_via"),
        c_cap: s("c_cap"),
        c_citta: s("c_citta"),
        c_provincia: s("c_provincia"),
        c_piva: s("c_piva"),
        c_cf: s("c_cf"),
        c_sdi: s("c_sdi"),
        c_pec: s("c_pec"),
        c_tipo_soggetto: s("c_tipo_soggetto"),
        c_cig: s("c_cig"),
        c_cup: s("c_cup"),
        tp_nome: s("tp_nome"),
        tp_giorni: i("tp_giorni").unwrap_or(0),
        tp_fine_mese: i("tp_fine_mese").unwrap_or(0),
        tp_immediato: i("tp_immediato").unwrap_or(0),
        tipo_pagamento_id: if is_fattura { i("tipo_pagamento_id") } else { None },
        coll_numero: s("coll_numero"),
        coll_data: s("coll_data"),
    }
}

fn load_righe(conn: &Connection, id: i64, is_nota: bool) -> rusqlite::Result<Vec<Riga>> {
    let (table, fk, has_codice_iva) = if is_nota {
        ("note_credito_righe", "nota_credito_id", false)
    } else {
        ("fatture_righe", "fattura_id", true)
    };
    let codice_iva_sel = if has_codice_iva { "codice_iva" } else { "'' AS codice_iva" };
    let sql = format!("SELECT tipo, descrizione, quantita, prezzo, sconto, iva, {codice_iva_sel}, unita_misura FROM {table} WHERE {fk}=?1 ORDER BY id");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([id], |r| {
            Ok(Riga {
                tipo: r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                descrizione: r.get::<_, Option<String>>(1)?,
                quantita: r.get::<_, Option<f64>>(2)?,
                prezzo: r.get::<_, Option<f64>>(3)?,
                sconto: r.get::<_, Option<f64>>(4)?,
                iva: r.get::<_, Option<f64>>(5)?,
                codice_iva: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
                unita_misura: r.get::<_, Option<String>>(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn load_riferimenti(conn: &Connection, fattura_id: i64) -> rusqlite::Result<Vec<Riferimento>> {
    let mut stmt = conn.prepare("SELECT tipo, numero, data, cig, cup, commessa FROM fatture_riferimenti WHERE fattura_id=?1 ORDER BY ordine, id")?;
    let rows = stmt
        .query_map([fattura_id], |r| {
            Ok(Riferimento {
                tipo: r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                numero: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                data: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                cig: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                cup: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                commessa: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn build_riferimenti_xml(riferimenti: &[Riferimento]) -> String {
    if riferimenti.is_empty() {
        return String::new();
    }
    let blocks: Vec<String> = riferimenti
        .iter()
        .map(|r| {
            let tag = match r.tipo.as_str() {
                "ORDINE_ACQUISTO" => "DatiOrdineAcquisto",
                "CONTRATTO" => "DatiContratto",
                "CONVENZIONE" => "DatiConvenzione",
                "RICEZIONE" => "DatiRicezione",
                "FATTURA_COLLEGATA" => "DatiFattureCollegate",
                "DDT" => "DatiDDT",
                _ => "DatiOrdineAcquisto",
            };
            if r.tipo == "DDT" {
                let data_block = if !r.data.is_empty() { format!("\n      <DataDDT>{}</DataDDT>", fmt_date(&r.data)) } else { String::new() };
                format!("    <DatiDDT>\n      <NumeroDDT>{}</NumeroDDT>{data_block}\n    </DatiDDT>", esc(&r.numero))
            } else {
                let data_block = if !r.data.is_empty() { format!("\n      <Data>{}</Data>", fmt_date(&r.data)) } else { String::new() };
                let commessa_block = if !r.commessa.is_empty() { format!("\n      <CodiceCommessaConvenzione>{}</CodiceCommessaConvenzione>", esc(&r.commessa)) } else { String::new() };
                let cup_block = if !r.cup.is_empty() { format!("\n      <CodiceCUP>{}</CodiceCUP>", esc(&r.cup)) } else { String::new() };
                let cig_block = if !r.cig.is_empty() { format!("\n      <CodiceCIG>{}</CodiceCIG>", esc(&r.cig)) } else { String::new() };
                format!("    <{tag}>\n      <IdDocumento>{}</IdDocumento>{data_block}{commessa_block}{cup_block}{cig_block}\n    </{tag}>", esc(&r.numero))
            }
        })
        .collect();
    format!("\n{}", blocks.join("\n"))
}

// ── micro-helpers ────────────────────────────────────────────────────────────

struct IvaEntry {
    key: String,
    aliq: f64,
    natura: Option<String>,
    esig: &'static str,
    imp: f64,
    iva: f64,
}

fn upsert_iva(map: &mut Vec<IvaEntry>, key: String, aliq: f64, natura: Option<String>, esig: &'static str, imp: f64, iva: f64) {
    if let Some(e) = map.iter_mut().find(|e| e.key == key) {
        e.imp += imp;
        e.iva += iva;
    } else {
        map.push(IvaEntry { key, aliq, natura, esig, imp, iva });
    }
}

/// Formattazione di un numero come template literal JS (intero se senza decimali).
fn js_num(v: f64) -> String {
    if v.fract() == 0.0 {
        format!("{}", v as i64)
    } else {
        // JS usa la rappresentazione più corta; per le aliquote (1-2 decimali) basta questo.
        let s = format!("{v}");
        s
    }
}

fn or<'a>(s: &'a str, default: &'a str) -> &'a str {
    if s.is_empty() {
        default
    } else {
        s
    }
}

fn prov2(s: &str) -> String {
    s.chars().take(2).collect::<String>().to_uppercase()
}

fn first_truthy_trim(opts: &[&str]) -> String {
    for o in opts {
        if !o.is_empty() {
            return o.trim().to_string();
        }
    }
    String::new()
}
