using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Dapper;
using Ordeva.Desktop.Data;

namespace Ordeva.Desktop.Services;

/// <summary>
/// Generazione dell'XML FatturaPA (TD01 fattura / TD04 nota di credito) conforme
/// SDI. Porting fedele di <c>src-tauri/src/xml.rs</c> (<c>build_fattura_pa</c>) +
/// <c>fiscale.rs</c> (<c>calcola_totali_fiscali</c>), che a loro volta sono
/// allineati byte-per-byte con il backend Node (routes/fatturaXml.js).
///
/// PARITÀ DI OUTPUT: l'XML deve combaciare carattere-per-carattere con quello del
/// backend, altrimenti SDI lo scarta. Per questo:
/// <list type="bullet">
///   <item>l'ordine degli elementi, l'indentazione e i blocchi opzionali sono
///   ricostruiti a mano via stringhe (niente serializzatore XML);</item>
///   <item>i calcoli fiscali usano <see cref="double"/> (f64) come in Rust, NON
///   decimal, così l'arrotondamento intermedio è identico;</item>
///   <item><see cref="Fmt2"/> replica <c>format!("{:.2}", n)</c> di Rust, che usa
///   l'arrotondamento half-to-even (banker's), diverso dal "F2" di .NET;</item>
///   <item><see cref="JsNum"/> replica la stampa delle aliquote come template
///   literal JS (intero se senza decimali) usata nella chiave del riepilogo IVA;</item>
///   <item>l'ordine di inserimento del riepilogo IVA è preservato (lista, non
///   dizionario ordinato per chiave).</item>
/// </list>
///
/// Accesso dati SOLO via <see cref="Db.Open"/> (Dapper su Microsoft.Data.Sqlite);
/// le query ricalcano le stesse JOIN del backend Rust.
/// </summary>
public static class FatturaElettronicaService
{
    // ── API pubblica ─────────────────────────────────────────────────────────

    /// <summary>Genera l'XML FatturaPA TD01 per la fattura con id <paramref name="id"/>.</summary>
    public static string BuildFattura(long id) => BuildFatturaPa(id, isNota: false);

    /// <summary>Genera l'XML FatturaPA TD04 per la nota di credito con id <paramref name="id"/>.</summary>
    public static string BuildNotaCredito(long id) => BuildFatturaPa(id, isNota: true);

    /// <summary>
    /// Nome file suggerito per il download (parità con la route Node/Rust):
    /// <c>FatturaPA_{numero}.xml</c> / <c>NotaCredito_{numero}.xml</c>, con il
    /// numero ridotto a soli [A-Za-z0-9_-].
    /// </summary>
    public static string SuggestFileName(string numero, bool isNota) =>
        (isNota ? "NotaCredito_" : "FatturaPA_") + SafeName(numero) + ".xml";

    /// <summary>
    /// Nome file in formato SDI: <c>IT{pIvaPulita}_{numero}.xml</c> (usato per
    /// l'header X-Filename quando si invia all'API SDI).
    /// </summary>
    public static string SdiFileName(string pIvaAzienda, string numero) =>
        "IT" + CleanPiva(pIvaAzienda) + "_" + SafeName(numero) + ".xml";

    // ── builder principale ─────────────────────────────────────────────────────

    private static string BuildFatturaPa(long id, bool isNota)
    {
        using var conn = Db.Open();

        // azienda (singleton id=1) — alias snake_case -> PascalCase per Dapper
        var az = conn.QueryFirstOrDefault<AzData>(
            @"SELECT ragione_sociale AS RagioneSociale, p_iva AS PIva, cod_fiscale AS CodFiscale,
                     indirizzo AS Indirizzo, cap AS Cap, citta AS Citta, provincia AS Provincia,
                     regime_fiscale AS RegimeFiscale, pec AS Pec, email AS Email
              FROM azienda WHERE id=1")
            ?? new AzData();

        DocData doc;
        Fisc fisc;
        var riferimenti = new List<Riferimento>();

        if (isNota)
        {
            var row = conn.QueryFirstOrDefault(
                @"SELECT n.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap, c.citta as c_citta, c.provincia as c_provincia,
                         c.stato as c_stato, c.p_iva as c_piva, c.codice_fiscale as c_cf, c.sdi as c_sdi, c.pec as c_pec,
                         c.tipo_soggetto as c_tipo_soggetto, c.cig as c_cig, c.cup as c_cup,
                         f.numero as coll_numero, f.data_emissione as coll_data
                  FROM note_credito n
                  LEFT JOIN clienti c ON n.cliente_id = c.id
                  LEFT JOIN fatture f ON n.fattura_id = f.id
                  WHERE n.id=@id", new { id });
            if (row is null) throw new InvalidOperationException("Nota di credito non trovata");
            doc = LoadDoc(row, isFattura: false);
            fisc = FiscFromRow(row);
            if (doc.CollNumero.Length != 0)
            {
                riferimenti.Add(new Riferimento
                {
                    Tipo = "FATTURA_COLLEGATA",
                    Numero = doc.CollNumero,
                    Data = doc.CollData,
                });
            }
        }
        else
        {
            var row = conn.QueryFirstOrDefault(
                @"SELECT f.*, c.ragione_sociale as c_nome, c.via as c_via, c.cap as c_cap, c.citta as c_citta, c.provincia as c_provincia,
                         c.stato as c_stato, c.p_iva as c_piva, c.codice_fiscale as c_cf, c.sdi as c_sdi, c.pec as c_pec,
                         c.tipo_soggetto as c_tipo_soggetto, c.cig as c_cig, c.cup as c_cup,
                         tp.nome as tp_nome, tp.giorni_scadenza as tp_giorni, tp.fine_mese as tp_fine_mese, tp.immediato as tp_immediato
                  FROM fatture f
                  LEFT JOIN clienti c ON f.cliente_id = c.id
                  LEFT JOIN tipi_pagamento tp ON f.tipo_pagamento_id = tp.id
                  WHERE f.id=@id", new { id });
            if (row is null) throw new InvalidOperationException("Fattura non trovata");
            doc = LoadDoc(row, isFattura: true);
            fisc = FiscFromRow(row);
            riferimenti = LoadRiferimenti(conn, id);
        }

        // righe
        var righe = LoadRighe(conn, id, isNota);

        var isPa = doc.CTipoSoggetto == "PA" || DetectFormato(doc.CSdi).Formato == "FPA12";

        // Semantica Rust `row.cig || row.c_cig || ''` poi .trim(): primo NON vuoto (grezzo), poi trim.
        var cig = FirstTruthyTrim(doc.DocCig, doc.CCig);
        var cup = FirstTruthyTrim(doc.DocCup, doc.CCup);

        // IVA breakdown (ordine di inserimento preservato)
        var ivaMap = new List<IvaEntry>();
        foreach (var r in righe)
        {
            if (r.Tipo == "NOTA") continue;
            var aliq = r.Iva ?? 22.0;
            var natura = ResolveNatura(conn, r.CodiceIva, aliq);
            var esig = ResolveEsigibilita(isPa && aliq > 0.0, r.CodiceIva);
            var key = $"{JsNum(aliq)}|{natura ?? ""}|{esig}";
            var bas = (r.Quantita ?? 1.0) * (r.Prezzo ?? 0.0) * (1.0 - (r.Sconto ?? 0.0) / 100.0);
            UpsertIva(ivaMap, key, aliq, natura, esig, bas, bas * aliq / 100.0);
        }

        // calcoli fiscali (f64, come Rust)
        var righe4 = righe
            .Select(r => (r.Quantita ?? 0.0, r.Prezzo ?? 0.0, r.Sconto ?? 0.0, r.Iva ?? 0.0))
            .ToList();
        var tot = CalcolaTotaliFiscali(righe4, fisc);

        if (tot.CassaImporto > 0.0)
        {
            var aliq = fisc.CassaIva;
            var natura = ResolveNatura(conn, "", aliq);
            var esig = ResolveEsigibilita(isPa && aliq > 0.0, "");
            var key = $"{JsNum(aliq)}|{natura ?? ""}|{esig}";
            UpsertIva(ivaMap, key, aliq, natura, esig, tot.CassaImporto, tot.IvaCassa);
        }

        var totale = tot.Totale;

        // blocchi fiscali
        var ritenutaBlock = tot.RitenutaImporto > 0.0
            ? "\n        <DatiRitenuta>\n          <TipoRitenuta>" + Esc(Or(fisc.RitenutaTipo, "RT02")) +
              "</TipoRitenuta>\n          <ImportoRitenuta>" + Fmt2(tot.RitenutaImporto) +
              "</ImportoRitenuta>\n          <AliquotaRitenuta>" + Fmt2(fisc.RitenutaAliquota) +
              "</AliquotaRitenuta>\n          <CausalePagamento>" + Esc(Or(fisc.RitenutaCausale, "A")) +
              "</CausalePagamento>\n        </DatiRitenuta>"
            : "";
        var bolloBlock = tot.BolloImporto > 0.0
            ? "\n        <DatiBollo>\n          <BolloVirtuale>SI</BolloVirtuale>\n          <ImportoBollo>" +
              Fmt2(tot.BolloImporto) + "</ImportoBollo>\n        </DatiBollo>"
            : "";
        var cassaNatura = ResolveNatura(conn, "", fisc.CassaIva);
        var cassaBlock = "";
        if (tot.CassaImporto > 0.0)
        {
            var nat = cassaNatura != null ? "\n          <Natura>" + Esc(cassaNatura) + "</Natura>" : "";
            cassaBlock =
                "\n        <DatiCassaPrevidenziale>\n          <TipoCassa>" + Esc(Or(fisc.CassaTipo, "TC22")) +
                "</TipoCassa>\n          <AlCassa>" + Fmt2(fisc.CassaAliquota) +
                "</AlCassa>\n          <ImportoContributoCassa>" + Fmt2(tot.CassaImporto) +
                "</ImportoContributoCassa>\n          <ImponibileCassa>" + Fmt2(tot.Imponibile) +
                "</ImponibileCassa>\n          <AliquotaIVA>" + Fmt2(fisc.CassaIva) +
                "</AliquotaIVA>" + nat + "\n        </DatiCassaPrevidenziale>";
        }
        var fiscaliBlock = ritenutaBlock + bolloBlock + cassaBlock;

        var pIvaAz = CleanPiva(string.IsNullOrEmpty(az.PIva) ? "00000000000" : az.PIva);
        var (formato, codDest) = DetectFormato(doc.CSdi);
        var hasPec = codDest == "0000000" && doc.CPec.Length != 0;
        var progressivo = SanitizeProgressivo(doc.Numero);
        var scadenza = CalcScadenza(doc.DataEmissione, doc.TpGiorni, doc.TpFineMese != 0);
        var tipoDoc = isNota ? "TD04" : "TD01";

        var cfAzBlock = az.CodFiscale.Length != 0 && az.CodFiscale != az.PIva
            ? "\n        <CodiceFiscale>" + Esc(az.CodFiscale) + "</CodiceFiscale>"
            : "";
        var provAzBlock = az.Provincia.Length != 0
            ? "\n        <Provincia>" + Esc(Prov2(az.Provincia)) + "</Provincia>"
            : "";
        var contattiAzBlock = "";
        if (az.Pec.Length != 0 || az.Email.Length != 0)
        {
            var mail = az.Pec.Length != 0 ? az.Pec : az.Email;
            contattiAzBlock = "\n      <Contatti><Email>" + Esc(mail) + "</Email></Contatti>";
        }

        var pivaClientBlock = doc.CPiva.Length != 0
            ? "\n        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>" + Esc(CleanPiva(doc.CPiva)) + "</IdCodice></IdFiscaleIVA>"
            : "";
        var cfClientBlock = doc.CCf.Length != 0
            ? "\n        <CodiceFiscale>" + Esc(doc.CCf) + "</CodiceFiscale>"
            : "";
        var provClientBlock = doc.CProvincia.Length != 0
            ? "\n        <Provincia>" + Esc(Prov2(doc.CProvincia)) + "</Provincia>"
            : "";

        var cigBlock = cig.Length != 0 ? "\n        <CodiceCIG>" + Esc(cig) + "</CodiceCIG>" : "";
        var cupBlock = cup.Length != 0 ? "\n        <CodiceCUP>" + Esc(cup) + "</CodiceCUP>" : "";

        // DettaglioLinee
        var lineaNum = 0;
        var linee = new List<string>();
        foreach (var r in righe)
        {
            if (r.Tipo == "NOTA") continue;
            lineaNum += 1;
            var q = r.Quantita ?? 1.0;
            var pu = r.Prezzo ?? 0.0;
            var sc = r.Sconto ?? 0.0;
            var aliq = r.Iva ?? 22.0;
            var imp = q * pu * (1.0 - sc / 100.0);
            var natura = ResolveNatura(conn, r.CodiceIva, aliq);
            var umBlock = !string.IsNullOrEmpty(r.UnitaMisura)
                ? "\n        <UnitaMisura>" + Esc(r.UnitaMisura!) + "</UnitaMisura>"
                : "";
            var scontoBlock = sc > 0.0
                ? "\n        <ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>" + Fmt2(sc) + "</Percentuale></ScontoMaggiorazione>"
                : "";
            var naturaBlock = natura != null ? "\n        <Natura>" + Esc(natura) + "</Natura>" : "";
            var descr = !string.IsNullOrEmpty(r.Descrizione) ? r.Descrizione! : "Prodotto/Servizio";
            linee.Add(
                "      <DettaglioLinee>\n        <NumeroLinea>" + lineaNum +
                "</NumeroLinea>\n        <Descrizione>" + Esc(descr) +
                "</Descrizione>\n        <Quantita>" + Fmt2(q) + "</Quantita>" + umBlock +
                "\n        <PrezzoUnitario>" + Fmt2(pu) + "</PrezzoUnitario>" + scontoBlock +
                "\n        <PrezzoTotale>" + Fmt2(imp) + "</PrezzoTotale>\n        <AliquotaIVA>" + Fmt2(aliq) +
                "</AliquotaIVA>" + naturaBlock + "\n      </DettaglioLinee>");
        }
        var dettaglioLinee = string.Join("\n", linee);

        // DatiRiepilogo
        var riepilogo = ivaMap.Select(v =>
        {
            var naturaBlock = v.Natura != null ? "\n        <Natura>" + Esc(v.Natura) + "</Natura>" : "";
            return "      <DatiRiepilogo>\n        <AliquotaIVA>" + Fmt2(v.Aliq) + "</AliquotaIVA>" + naturaBlock +
                   "\n        <ImponibileImporto>" + Fmt2(v.Imp) + "</ImponibileImporto>\n        <Imposta>" +
                   Fmt2(v.Iva) + "</Imposta>\n        <EsigibilitaIVA>" + v.Esig + "</EsigibilitaIVA>\n      </DatiRiepilogo>";
        }).ToList();
        var datiRiepilogo = string.Join("\n", riepilogo);

        // DatiPagamento
        var pagamentoBlock = "";
        if (doc.TipoPagamentoId.HasValue)
        {
            var condPag = doc.TpImmediato != 0 ? "TP01" : "TP02";
            pagamentoBlock =
                "\n    <DatiPagamento>\n      <CondizioniPagamento>" + condPag +
                "</CondizioniPagamento>\n      <DettaglioPagamento>\n        <ModalitaPagamento>" + MapModalita(doc.TpNome) +
                "</ModalitaPagamento>\n        <DataScadenzaPagamento>" + scadenza +
                "</DataScadenzaPagamento>\n        <ImportoPagamento>" + Fmt2(tot.NettoAPagare) +
                "</ImportoPagamento>\n      </DettaglioPagamento>\n    </DatiPagamento>";
        }

        var pecBlock = hasPec ? "\n      <PECDestinatario>" + Esc(doc.CPec) + "</PECDestinatario>" : "";

        var rifXml = BuildRiferimentiXml(riferimenti);

        // template finale (identico a xml.rs, segnaposto risolti)
        var pivaAzEsc = Esc(pIvaAz);
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.Append("<p:FatturaElettronica versione=\"").Append(formato)
          .Append("\" xmlns:ds=\"http://www.w3.org/2000/09/xmldsig#\" xmlns:p=\"http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd\">\n");
        sb.Append("  <FatturaElettronicaHeader>\n");
        sb.Append("    <DatiTrasmissione>\n");
        sb.Append("      <IdTrasmittente>\n");
        sb.Append("        <IdPaese>IT</IdPaese>\n");
        sb.Append("        <IdCodice>").Append(pivaAzEsc).Append("</IdCodice>\n");
        sb.Append("      </IdTrasmittente>\n");
        sb.Append("      <ProgressivoInvio>").Append(Esc(progressivo)).Append("</ProgressivoInvio>\n");
        sb.Append("      <FormatoTrasmissione>").Append(formato).Append("</FormatoTrasmissione>\n");
        sb.Append("      <CodiceDestinatario>").Append(codDest).Append("</CodiceDestinatario>").Append(pecBlock).Append('\n');
        sb.Append("    </DatiTrasmissione>\n");
        sb.Append("    <CedentePrestatore>\n");
        sb.Append("      <DatiAnagrafici>\n");
        sb.Append("        <IdFiscaleIVA>\n");
        sb.Append("          <IdPaese>IT</IdPaese>\n");
        sb.Append("          <IdCodice>").Append(pivaAzEsc).Append("</IdCodice>\n");
        sb.Append("        </IdFiscaleIVA>").Append(cfAzBlock).Append('\n');
        sb.Append("        <Anagrafica>\n");
        sb.Append("          <Denominazione>").Append(Esc(Or(az.RagioneSociale, "Azienda"))).Append("</Denominazione>\n");
        sb.Append("        </Anagrafica>\n");
        sb.Append("        <RegimeFiscale>").Append(Esc(Or(az.RegimeFiscale, "RF01"))).Append("</RegimeFiscale>\n");
        sb.Append("      </DatiAnagrafici>\n");
        sb.Append("      <Sede>\n");
        sb.Append("        <Indirizzo>").Append(Esc(Or(az.Indirizzo, "Via non specificata"))).Append("</Indirizzo>\n");
        sb.Append("        <CAP>").Append(PadCap(az.Cap)).Append("</CAP>\n");
        sb.Append("        <Comune>").Append(Esc(Or(az.Citta, "Comune"))).Append("</Comune>").Append(provAzBlock).Append('\n');
        sb.Append("        <Nazione>IT</Nazione>\n");
        sb.Append("      </Sede>").Append(contattiAzBlock).Append('\n');
        sb.Append("    </CedentePrestatore>\n");
        sb.Append("    <CessionarioCommittente>\n");
        sb.Append("      <DatiAnagrafici>").Append(pivaClientBlock).Append(cfClientBlock).Append('\n');
        sb.Append("        <Anagrafica>\n");
        sb.Append("          <Denominazione>").Append(Esc(Or(doc.CNome, "Cliente"))).Append("</Denominazione>\n");
        sb.Append("        </Anagrafica>\n");
        sb.Append("      </DatiAnagrafici>\n");
        sb.Append("      <Sede>\n");
        sb.Append("        <Indirizzo>").Append(Esc(Or(doc.CVia, "Via non specificata"))).Append("</Indirizzo>\n");
        sb.Append("        <CAP>").Append(PadCap(doc.CCap)).Append("</CAP>\n");
        sb.Append("        <Comune>").Append(Esc(Or(doc.CCitta, "Comune"))).Append("</Comune>").Append(provClientBlock).Append('\n');
        sb.Append("        <Nazione>IT</Nazione>\n");
        sb.Append("      </Sede>\n");
        sb.Append("    </CessionarioCommittente>\n");
        sb.Append("  </FatturaElettronicaHeader>\n");
        sb.Append("  <FatturaElettronicaBody>\n");
        sb.Append("    <DatiGenerali>\n");
        sb.Append("      <DatiGeneraliDocumento>\n");
        sb.Append("        <TipoDocumento>").Append(tipoDoc).Append("</TipoDocumento>\n");
        sb.Append("        <Divisa>EUR</Divisa>\n");
        sb.Append("        <Data>").Append(FmtDate(doc.DataEmissione)).Append("</Data>\n");
        sb.Append("        <Numero>").Append(Esc(doc.Numero)).Append("</Numero>").Append(fiscaliBlock).Append('\n');
        sb.Append("        <ImportoTotaleDocumento>").Append(Fmt2(totale)).Append("</ImportoTotaleDocumento>")
          .Append(cigBlock).Append(cupBlock).Append(CausaleBlocks(doc.Note)).Append('\n');
        sb.Append("      </DatiGeneraliDocumento>").Append(rifXml).Append('\n');
        sb.Append("    </DatiGenerali>\n");
        sb.Append("    <DatiBeniServizi>\n");
        sb.Append(dettaglioLinee).Append('\n');
        sb.Append(datiRiepilogo).Append('\n');
        sb.Append("    </DatiBeniServizi>").Append(pagamentoBlock).Append('\n');
        sb.Append("  </FatturaElettronicaBody>\n");
        sb.Append("</p:FatturaElettronica>\n");
        return sb.ToString();
    }

    // ── caricamento documento/righe ────────────────────────────────────────────

    private static DocData LoadDoc(dynamic r, bool isFattura)
    {
        var d = (IDictionary<string, object?>)r;
        string S(string k) => d.TryGetValue(k, out var v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) ?? "" : "";
        long? I(string k) => d.TryGetValue(k, out var v) && v != null ? Convert.ToInt64(v, CultureInfo.InvariantCulture) : (long?)null;

        return new DocData
        {
            Numero = S("numero"),
            DataEmissione = S("data_emissione"),
            Note = S("note"),
            DocCig = isFattura ? S("cig") : "",
            DocCup = isFattura ? S("cup") : "",
            CNome = S("c_nome"),
            CVia = S("c_via"),
            CCap = S("c_cap"),
            CCitta = S("c_citta"),
            CProvincia = S("c_provincia"),
            CPiva = S("c_piva"),
            CCf = S("c_cf"),
            CSdi = S("c_sdi"),
            CPec = S("c_pec"),
            CTipoSoggetto = S("c_tipo_soggetto"),
            CCig = S("c_cig"),
            CCup = S("c_cup"),
            TpNome = S("tp_nome"),
            TpGiorni = I("tp_giorni") ?? 0,
            TpFineMese = I("tp_fine_mese") ?? 0,
            TpImmediato = I("tp_immediato") ?? 0,
            TipoPagamentoId = isFattura ? I("tipo_pagamento_id") : null,
            CollNumero = S("coll_numero"),
            CollData = S("coll_data"),
        };
    }

    private static Fisc FiscFromRow(dynamic r)
    {
        var d = (IDictionary<string, object?>)r;
        double F(string k) => d.TryGetValue(k, out var v) && v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : 0.0;
        string S(string k) => d.TryGetValue(k, out var v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) ?? "" : "";
        bool B(string k) => d.TryGetValue(k, out var v) && v != null && Convert.ToInt64(v, CultureInfo.InvariantCulture) == 1;

        return new Fisc
        {
            RitenutaAliquota = F("ritenuta_aliquota"),
            RitenutaCausale = S("ritenuta_causale"),
            RitenutaTipo = S("ritenuta_tipo"),
            RitenutaSuCassa = B("ritenuta_su_cassa"),
            CassaTipo = S("cassa_tipo"),
            CassaAliquota = F("cassa_aliquota"),
            CassaIva = F("cassa_iva"),
            Bollo = B("bollo"),
        };
    }

    private static List<Riga> LoadRighe(Microsoft.Data.Sqlite.SqliteConnection conn, long id, bool isNota)
    {
        string table, fk;
        bool hasCodiceIva;
        if (isNota) { table = "note_credito_righe"; fk = "nota_credito_id"; hasCodiceIva = false; }
        else { table = "fatture_righe"; fk = "fattura_id"; hasCodiceIva = true; }

        var codiceIvaSel = hasCodiceIva ? "codice_iva" : "'' AS codice_iva";
        var sql = $"SELECT tipo, descrizione, quantita, prezzo, sconto, iva, {codiceIvaSel}, unita_misura FROM {table} WHERE {fk}=@id ORDER BY id";

        var rows = conn.Query(sql, new { id });
        var list = new List<Riga>();
        foreach (var r in rows)
        {
            var d = (IDictionary<string, object?>)r;
            object? G(string k) => d.TryGetValue(k, out var v) ? v : null;
            string Str(string k) { var v = G(k); return v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) ?? "" : ""; }
            double? Dbl(string k) { var v = G(k); return v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : (double?)null; }
            string? StrOpt(string k) { var v = G(k); return v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) : null; }

            list.Add(new Riga
            {
                Tipo = Str("tipo"),
                Descrizione = StrOpt("descrizione"),
                Quantita = Dbl("quantita"),
                Prezzo = Dbl("prezzo"),
                Sconto = Dbl("sconto"),
                Iva = Dbl("iva"),
                CodiceIva = Str("codice_iva"),
                UnitaMisura = StrOpt("unita_misura"),
            });
        }
        return list;
    }

    private static List<Riferimento> LoadRiferimenti(Microsoft.Data.Sqlite.SqliteConnection conn, long fatturaId)
    {
        var rows = conn.Query(
            "SELECT tipo, numero, data, cig, cup, commessa FROM fatture_riferimenti WHERE fattura_id=@id ORDER BY ordine, id",
            new { id = fatturaId });
        var list = new List<Riferimento>();
        foreach (var r in rows)
        {
            var d = (IDictionary<string, object?>)r;
            string Str(string k) => d.TryGetValue(k, out var v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture) ?? "" : "";
            list.Add(new Riferimento
            {
                Tipo = Str("tipo"),
                Numero = Str("numero"),
                Data = Str("data"),
                Cig = Str("cig"),
                Cup = Str("cup"),
                Commessa = Str("commessa"),
            });
        }
        return list;
    }

    private static string BuildRiferimentiXml(List<Riferimento> riferimenti)
    {
        if (riferimenti.Count == 0) return "";
        var blocks = riferimenti.Select(r =>
        {
            var tag = r.Tipo switch
            {
                "ORDINE_ACQUISTO" => "DatiOrdineAcquisto",
                "CONTRATTO" => "DatiContratto",
                "CONVENZIONE" => "DatiConvenzione",
                "RICEZIONE" => "DatiRicezione",
                "FATTURA_COLLEGATA" => "DatiFattureCollegate",
                "DDT" => "DatiDDT",
                _ => "DatiOrdineAcquisto",
            };
            if (r.Tipo == "DDT")
            {
                var dataBlock = r.Data.Length != 0 ? "\n      <DataDDT>" + FmtDate(r.Data) + "</DataDDT>" : "";
                return "    <DatiDDT>\n      <NumeroDDT>" + Esc(r.Numero) + "</NumeroDDT>" + dataBlock + "\n    </DatiDDT>";
            }
            else
            {
                var dataBlock = r.Data.Length != 0 ? "\n      <Data>" + FmtDate(r.Data) + "</Data>" : "";
                var commessaBlock = r.Commessa.Length != 0 ? "\n      <CodiceCommessaConvenzione>" + Esc(r.Commessa) + "</CodiceCommessaConvenzione>" : "";
                var cupBlock = r.Cup.Length != 0 ? "\n      <CodiceCUP>" + Esc(r.Cup) + "</CodiceCUP>" : "";
                var cigBlock = r.Cig.Length != 0 ? "\n      <CodiceCIG>" + Esc(r.Cig) + "</CodiceCIG>" : "";
                return "    <" + tag + ">\n      <IdDocumento>" + Esc(r.Numero) + "</IdDocumento>" +
                       dataBlock + commessaBlock + cupBlock + cigBlock + "\n    </" + tag + ">";
            }
        });
        return "\n" + string.Join("\n", blocks);
    }

    // ── calcoli fiscali (porting di fiscale.rs::calcola_totali_fiscali) ─────────

    private static double Round2(double n) => Math.Round(n * 100.0, MidpointRounding.AwayFromZero) / 100.0;

    private static Totali CalcolaTotaliFiscali(List<(double q, double p, double sc, double iva)> righe, Fisc fisc)
    {
        var imponibile = 0.0;
        var ivaRighe = 0.0;
        foreach (var (q, p, sc, aliq) in righe)
        {
            var bas = q * p * (1.0 - sc / 100.0);
            imponibile += bas;
            ivaRighe += bas * aliq / 100.0;
        }
        imponibile = Round2(imponibile);
        ivaRighe = Round2(ivaRighe);

        var cassaImporto = fisc.CassaAliquota != 0.0 ? Round2(imponibile * fisc.CassaAliquota / 100.0) : 0.0;
        var ivaCassa = cassaImporto != 0.0 ? Round2(cassaImporto * fisc.CassaIva / 100.0) : 0.0;
        var ivaTot = Round2(ivaRighe + ivaCassa);

        var ritenutaBase = imponibile + (fisc.RitenutaSuCassa ? cassaImporto : 0.0);
        var ritenutaImporto = fisc.RitenutaAliquota != 0.0 ? Round2(ritenutaBase * fisc.RitenutaAliquota / 100.0) : 0.0;

        var bolloImporto = fisc.Bollo ? 2.0 : 0.0;
        var totale = Round2(imponibile + cassaImporto + ivaTot + bolloImporto);
        var nettoAPagare = Round2(totale - ritenutaImporto);

        return new Totali
        {
            Imponibile = imponibile,
            CassaImporto = cassaImporto,
            IvaCassa = ivaCassa,
            Iva = ivaTot,
            RitenutaImporto = ritenutaImporto,
            BolloImporto = bolloImporto,
            Totale = totale,
            NettoAPagare = nettoAPagare,
        };
    }

    // ── natura / esigibilità ───────────────────────────────────────────────────

    /// <summary>aliq&gt;0 → null; altrimenti codice_iva→aliquote_iva.natura, fallback N4.</summary>
    private static string? ResolveNatura(Microsoft.Data.Sqlite.SqliteConnection conn, string codiceIva, double aliq)
    {
        if (aliq > 0.0) return null;
        if (codiceIva.Length != 0)
        {
            var nat = conn.QueryFirstOrDefault<string?>(
                "SELECT natura FROM aliquote_iva WHERE codice=@codice", new { codice = codiceIva });
            if (!string.IsNullOrEmpty(nat)) return nat;
        }
        return "N4";
    }

    private static string ResolveEsigibilita(bool isSplit, string codiceIva) =>
        (isSplit || codiceIva.EndsWith("sp", StringComparison.Ordinal)) ? "S" : "I";

    // ── helpers di formattazione (parità byte-per-byte con xml.rs) ─────────────

    private static string Esc(string s) =>
        s.Replace("&", "&amp;")
         .Replace("<", "&lt;")
         .Replace(">", "&gt;")
         .Replace("\"", "&quot;")
         .Replace("'", "&apos;");

    /// <summary>
    /// Replica di <c>format!("{:.2}", n)</c> di Rust: due decimali con punto e
    /// arrotondamento half-to-even (banker's). NB: il "F2" di .NET arrotonda
    /// away-from-zero, quindi NON è equivalente; qui forziamo ToEven.
    /// </summary>
    private static string Fmt2(double n)
    {
        var rounded = Math.Round(n, 2, MidpointRounding.ToEven);
        // -0.00 → 0.00 (Rust stampa "-0.00"? No: format!("{:.2}", -0.0) = "-0.00").
        // Per replicare Rust manteniamo il segno se il valore arrotondato è -0.
        return rounded.ToString("0.00", CultureInfo.InvariantCulture);
    }

    private static string FmtDate(string s) => s.Length <= 10 ? s : s.Substring(0, 10);

    private static string SanitizeProgressivo(string s)
    {
        var v = new string(s.Where(c => IsAsciiAlnum(c) || c == '-' || c == '_').Take(10).ToArray());
        return v.Length == 0 ? "1" : v;
    }

    private static string CleanPiva(string s)
    {
        if (s.StartsWith("IT", StringComparison.Ordinal)) s = s.Substring(2);
        else if (s.StartsWith("it", StringComparison.Ordinal)) s = s.Substring(2);
        return new string(s.Where(c => !char.IsWhiteSpace(c)).ToArray());
    }

    private static string PadCap(string s)
    {
        var digits = new string(s.Where(c => c is >= '0' and <= '9').ToArray());
        var padded = digits.Length < 5 ? digits.PadLeft(5, '0') : digits;
        var outp = padded.Length > 5 ? padded.Substring(0, 5) : padded;
        return outp.Length == 0 ? "00000" : outp;
    }

    /// <summary>FPA12 = 6 char → PA; FPR12 = 7 char → privato/B2B.</summary>
    private static (string Formato, string CodDest) DetectFormato(string sdi)
    {
        var v = new string(sdi.Trim().ToUpperInvariant().Where(IsAsciiAlnum).ToArray());
        return v.Length switch
        {
            6 => ("FPA12", v),
            7 => ("FPR12", v),
            _ => ("FPR12", "0000000"),
        };
    }

    private static string MapModalita(string nome)
    {
        var n = nome.ToLowerInvariant();
        if (n.Contains("contant") || n.Contains("cass")) return "MP01";
        if (n.Contains("assegno circ")) return "MP03";
        if (n.Contains("assegno")) return "MP02";
        if (n.Contains("riba")) return "MP12";
        if (n.Contains("rid") || n.Contains("sdd") || n.Contains("domicil")) return "MP19";
        if (n.Contains("pos") || n.Contains("carta") || n.Contains("bancomat") || n.Contains("satispay") || n.Contains("paypal")) return "MP08";
        if (n.Contains("anticipato")) return "MP05";
        return "MP05";
    }

    private static string CausaleBlocks(string note)
    {
        if (note.Length == 0) return "";
        // Rust itera per CHAR (code point), non per byte: usa StringInfo per i grafemi/code point.
        // Per fedeltà con Rust (.chars() = scalar Unicode) usiamo il chunking per rune.
        var runes = note.EnumerateRunes().ToList();
        var sb = new StringBuilder();
        for (var i = 0; i < runes.Count; i += 200)
        {
            var chunk = new StringBuilder();
            for (var j = i; j < Math.Min(i + 200, runes.Count); j++) chunk.Append(runes[j].ToString());
            sb.Append("\n        <Causale>").Append(Esc(chunk.ToString())).Append("</Causale>");
        }
        return sb.ToString();
    }

    // ── scadenza pagamento (calendario proletico gregoriano, parità con xml.rs) ─

    private static long DaysFromCivil(long y, long m, long d)
    {
        y = m <= 2 ? y - 1 : y;
        var era = (y >= 0 ? y : y - 399) / 400;
        var yoe = y - era * 400;
        var doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
        var doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    private static (long y, long m, long d) CivilFromDays(long z)
    {
        z += 719468;
        var era = (z >= 0 ? z : z - 146096) / 146097;
        var doe = z - era * 146097;
        var yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        var y = yoe + era * 400;
        var doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        var mp = (5 * doy + 2) / 153;
        var d = doy - (153 * mp + 2) / 5 + 1;
        var m = mp < 10 ? mp + 3 : mp - 9;
        return (m <= 2 ? y + 1 : y, m, d);
    }

    private static string CalcScadenza(string dataEmissione, long giorni, bool fineMese)
    {
        var head = dataEmissione.Length <= 10 ? dataEmissione : dataEmissione.Substring(0, 10);
        var parts = head.Split('-');
        (long y, long m, long d)? parsed = null;
        if (parts.Length == 3
            && long.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var py)
            && long.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var pm)
            && long.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out var pd)
            && pm is >= 1 and <= 12 && pd is >= 1 and <= 31)
        {
            parsed = (py, pm, pd);
        }
        if (parsed is null) return FmtDate(dataEmissione);

        var (y, m, d) = parsed.Value;
        var days = DaysFromCivil(y, m, d) + giorni;
        if (fineMese)
        {
            var (y2, m2, _) = CivilFromDays(days);
            var firstNext = DaysFromCivil(m2 == 12 ? y2 + 1 : y2, m2 == 12 ? 1 : m2 + 1, 1);
            var (y3, m3, d3) = CivilFromDays(firstNext - 1);
            return $"{y3:D4}-{m3:D2}-{d3:D2}";
        }
        else
        {
            var (yy, mm, dd) = CivilFromDays(days);
            return $"{yy:D4}-{mm:D2}-{dd:D2}";
        }
    }

    // ── micro-helpers ──────────────────────────────────────────────────────────

    private static void UpsertIva(List<IvaEntry> map, string key, double aliq, string? natura, string esig, double imp, double iva)
    {
        var e = map.FirstOrDefault(x => x.Key == key);
        if (e != null)
        {
            e.Imp += imp;
            e.Iva += iva;
        }
        else
        {
            map.Add(new IvaEntry { Key = key, Aliq = aliq, Natura = natura, Esig = esig, Imp = imp, Iva = iva });
        }
    }

    /// <summary>Formattazione di un numero come template literal JS (intero se senza decimali).</summary>
    private static string JsNum(double v)
    {
        if (v == Math.Floor(v) && !double.IsInfinity(v))
            return ((long)v).ToString(CultureInfo.InvariantCulture);
        // JS usa la rappresentazione più corta; "R"/shortest roundtrip è l'equivalente.
        return v.ToString("R", CultureInfo.InvariantCulture);
    }

    private static string Or(string s, string dflt) => s.Length == 0 ? dflt : s;

    private static string Prov2(string s) =>
        new string(s.Take(2).ToArray()).ToUpperInvariant();

    private static string FirstTruthyTrim(params string[] opts)
    {
        foreach (var o in opts)
            if (o.Length != 0) return o.Trim();
        return "";
    }

    private static string SafeName(string numero) =>
        new string(numero.Select(c => (IsAsciiAlnum(c) || c == '_' || c == '-') ? c : '_').ToArray());

    private static bool IsAsciiAlnum(char c) =>
        c is (>= '0' and <= '9') or (>= 'A' and <= 'Z') or (>= 'a' and <= 'z');

    // ── strutture di supporto ──────────────────────────────────────────────────

    private sealed class AzData
    {
        // Popolata da Dapper via alias espliciti (vedi SELECT). NULL DB -> "".
        public string RagioneSociale { get => _rs; set => _rs = value ?? ""; }
        public string PIva { get => _pIva; set => _pIva = value ?? ""; }
        public string CodFiscale { get => _cf; set => _cf = value ?? ""; }
        public string Indirizzo { get => _ind; set => _ind = value ?? ""; }
        public string Cap { get => _cap; set => _cap = value ?? ""; }
        public string Citta { get => _citta; set => _citta = value ?? ""; }
        public string Provincia { get => _prov; set => _prov = value ?? ""; }
        public string RegimeFiscale { get => _rf; set => _rf = value ?? ""; }
        public string Pec { get => _pec; set => _pec = value ?? ""; }
        public string Email { get => _email; set => _email = value ?? ""; }

        private string _rs = "", _pIva = "", _cf = "", _ind = "", _cap = "",
                       _citta = "", _prov = "", _rf = "", _pec = "", _email = "";
    }

    private sealed class DocData
    {
        public string Numero = "";
        public string DataEmissione = "";
        public string Note = "";
        public string DocCig = "";
        public string DocCup = "";
        public string CNome = "";
        public string CVia = "";
        public string CCap = "";
        public string CCitta = "";
        public string CProvincia = "";
        public string CPiva = "";
        public string CCf = "";
        public string CSdi = "";
        public string CPec = "";
        public string CTipoSoggetto = "";
        public string CCig = "";
        public string CCup = "";
        public string TpNome = "";
        public long TpGiorni;
        public long TpFineMese;
        public long TpImmediato;
        public long? TipoPagamentoId;
        public string CollNumero = "";
        public string CollData = "";
    }

    private sealed class Fisc
    {
        public double RitenutaAliquota;
        public string RitenutaCausale = "";
        public string RitenutaTipo = "";
        public bool RitenutaSuCassa;
        public string CassaTipo = "";
        public double CassaAliquota;
        public double CassaIva;
        public bool Bollo;
    }

    private sealed class Totali
    {
        public double Imponibile;
        public double CassaImporto;
        public double IvaCassa;
        public double Iva;
        public double RitenutaImporto;
        public double BolloImporto;
        public double Totale;
        public double NettoAPagare;
    }

    private sealed class Riga
    {
        public string Tipo = "";
        public string? Descrizione;
        public double? Quantita;
        public double? Prezzo;
        public double? Sconto;
        public double? Iva;
        public string CodiceIva = "";
        public string? UnitaMisura;
    }

    private sealed class Riferimento
    {
        public string Tipo = "";
        public string Numero = "";
        public string Data = "";
        public string Cig = "";
        public string Cup = "";
        public string Commessa = "";
    }

    private sealed class IvaEntry
    {
        public string Key = "";
        public double Aliq;
        public string? Natura;
        public string Esig = "";
        public double Imp;
        public double Iva;
    }
}
