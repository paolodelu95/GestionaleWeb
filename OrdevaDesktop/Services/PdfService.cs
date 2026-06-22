using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using Dapper;
using Ordeva.Desktop.Data;
using Ordeva.Desktop.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Ordeva.Desktop.Services;

/// <summary>
/// Generazione dei PDF dei documenti (fattura, preventivo, DDT) con QuestPDF.
///
/// Porting del servizio Angular <c>print.service.ts</c> (jsPDF + autoTable). La
/// logica originale è config-driven tramite <c>azienda.template_config</c> (JSON):
/// qui viene letta la configurazione che mappa in modo pulito su QuestPDF —
/// colore accent (colors.accent / accentColor legacy), palette testi/sfondi,
/// scala font, titoli sezione in maiuscolo, logo (show/align/size), footer
/// (toggle dei singoli campi + testo libero + numero pagina), visibilità IBAN /
/// riferimenti, tema tabella e margini. Le righe NOTA sono escluse dai totali; i
/// totali fiscali (cassa/ritenuta/bollo/netto) sono quelli già calcolati dai
/// Model (parità con fiscale.rs del backend).
///
/// Gli stili "moderno" e "minimal" del servizio web e la colonna miniatura del
/// preventivo non sono ancora portati: vedi note finali della consegna. Lo stile
/// reso è il "classico" (default storico).
///
/// Lettura dati: i Model/Repository esistenti per testata e righe; i pochi dati
/// trasversali non esposti dai repo (record cliente completo, nome del tipo
/// pagamento, pagamenti registrati di una fattura) sono letti qui con Dapper via
/// <see cref="Db.Open"/>, senza aprire connessioni a mano.
/// </summary>
public sealed class PdfService
{
    static PdfService()
    {
        // Licenza Community (gratuita per uso interno/open-source). Idempotente.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    private readonly FatturaRepository _fatture = new();
    private readonly PreventivoRepository _preventivi = new();
    private readonly DdtRepository _ddt = new();
    private readonly AziendaRepository _aziende = new();

    // ── API pubblica: genera il PDF e lo salva su file, restituendo il percorso ──

    /// <summary>Genera il PDF di una fattura e lo salva. Ritorna il percorso del file.</summary>
    public string SalvaFattura(long id, string? destPath = null)
    {
        var f = _fatture.GetById(id) ?? throw new InvalidOperationException("Fattura non trovata");
        var az = _aziende.Get();
        var path = destPath ?? DefaultPath($"Fattura_{Safe(f.Numero)}.pdf");
        BuildFattura(f, az).GeneratePdf(path);
        return path;
    }

    /// <summary>Genera il PDF di un preventivo e lo salva. Ritorna il percorso del file.</summary>
    public string SalvaPreventivo(long id, string? destPath = null)
    {
        var p = _preventivi.GetById(id) ?? throw new InvalidOperationException("Preventivo non trovato");
        var az = _aziende.Get();
        var path = destPath ?? DefaultPath($"Preventivo_{Safe(p.Numero)}.pdf");
        BuildPreventivo(p, az).GeneratePdf(path);
        return path;
    }

    /// <summary>Genera il PDF di un DDT e lo salva. Ritorna il percorso del file.</summary>
    public string SalvaDdt(long id, string? destPath = null)
    {
        var d = _ddt.GetById(id) ?? throw new InvalidOperationException("Documento di trasporto non trovato");
        var az = _aziende.Get();
        var path = destPath ?? DefaultPath($"DDT_{Safe(d.Numero)}.pdf");
        BuildDdt(d, az).GeneratePdf(path);
        return path;
    }

    /// <summary>Bytes del PDF della fattura (per anteprima/allegato senza file).</summary>
    public byte[] FatturaPdfBytes(long id)
    {
        var f = _fatture.GetById(id) ?? throw new InvalidOperationException("Fattura non trovata");
        return BuildFattura(f, _aziende.Get()).GeneratePdf();
    }

    /// <summary>Bytes del PDF del preventivo.</summary>
    public byte[] PreventivoPdfBytes(long id)
    {
        var p = _preventivi.GetById(id) ?? throw new InvalidOperationException("Preventivo non trovato");
        return BuildPreventivo(p, _aziende.Get()).GeneratePdf();
    }

    /// <summary>Bytes del PDF del DDT.</summary>
    public byte[] DdtPdfBytes(long id)
    {
        var d = _ddt.GetById(id) ?? throw new InvalidOperationException("Documento di trasporto non trovato");
        return BuildDdt(d, _aziende.Get()).GeneratePdf();
    }

    // ── Document builders ────────────────────────────────────────────────────

    private IDocument BuildFattura(Fattura f, Azienda az)
    {
        var cfg = ResolveConfig(az, "fattura");
        var cliente = LoadCliente(f.ClienteId);
        var pagamenti = LoadPagamenti(f.Id);
        var tipoPag = LoadTipoPagamentoNome(f.TipoPagamentoId);

        var righe = ToRows(f.Righe);
        var totali = TotaliFattura(f);

        return BuildDocument(cfg, az, page =>
        {
            Header(page, cfg, az, "FATTURA", "", f.Numero, f.DataEmissione);
            Parties(page, cfg,
                ("VENDITORE", az.RagioneSociale, AzLines(az)),
                ("CLIENTE", cliente?.RagioneSociale ?? f.ClienteNome ?? "—", ContactLines(cliente)));
            Table(page, cfg, righe);
            Totals(page, cfg, totali);
            Payment(page, cfg, az, tipoPag, pagamenti);
            if (!string.IsNullOrWhiteSpace(f.Note)) NoteBox(page, cfg, f.Note);
        });
    }

    private IDocument BuildPreventivo(Preventivo p, Azienda az)
    {
        var cfg = ResolveConfig(az, "preventivo");
        var cliente = LoadCliente(p.ClienteId);
        var righe = ToRows(p.Righe);

        return BuildDocument(cfg, az, page =>
        {
            Header(page, cfg, az, "PREVENTIVO", $"Validità: {p.Validita} giorni", p.Numero, p.DataEmissione);
            Parties(page, cfg,
                ("EMITTENTE", az.RagioneSociale, AzLines(az)),
                ("CLIENTE", cliente?.RagioneSociale ?? p.ClienteNome ?? "—", ContactLines(cliente)));
            Table(page, cfg, righe);
            Totals(page, cfg, TotaliSemplici(p.Imponibile, p.IvaTotale, p.Totale, p.Righe));
            if (!string.IsNullOrWhiteSpace(p.Note)) NoteBox(page, cfg, p.Note);
        });
    }

    private IDocument BuildDdt(Ddt d, Azienda az)
    {
        var cfg = ResolveConfig(az, "ddt");
        var isReso = d.IsFornitore;
        var controparte = isReso ? LoadFornitore(d.FornitoreId) : (object?)LoadCliente(d.ClienteId);
        var righe = ToRows(d.Righe);

        var subtitle = isReso ? "Documento di Trasporto · Reso a fornitore" : "Documento di Trasporto";
        var (destNome, destLines) = DdtDest(d, controparte);

        return BuildDocument(cfg, az, page =>
        {
            Header(page, cfg, az, "DDT", subtitle, d.Numero, d.DataEmissione);
            Parties(page, cfg,
                ("MITTENTE", az.RagioneSociale, AzLines(az)),
                (isReso ? "DESTINATARIO (FORNITORE)" : "DESTINATARIO", destNome, destLines));
            Trasporto(page, cfg, d);
            Table(page, cfg, righe);
            Totals(page, cfg, TotaliSemplici(d.Imponibile, d.IvaTotale, d.Totale, d.Righe));
            if (!string.IsNullOrWhiteSpace(d.Note)) NoteBox(page, cfg, d.Note);
            Signatures(page, cfg);
        });
    }

    // ── QuestPDF document skeleton (stile "classico") ────────────────────────

    private IDocument BuildDocument(Cfg cfg, Azienda az, Action<ColumnDescriptor> bodyContent)
    {
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(cfg.MarginLeft, Unit.Millimetre);
                page.MarginRight(cfg.MarginRight, Unit.Millimetre);
                page.DefaultTextStyle(t => t.FontFamily(cfg.FontFamily).FontSize(9 * cfg.FontScale).FontColor(cfg.Text));

                page.Content().Column(col =>
                {
                    col.Spacing(6);
                    bodyContent(col);
                });

                page.Footer().Element(c => Footer(c, cfg, az));
            });
        });
    }

    // ── Header ───────────────────────────────────────────────────────────────

    private void Header(ColumnDescriptor col, Cfg cfg, Azienda az, string type, string subtitle, string numero, string data)
    {
        col.Item().Row(row =>
        {
            // Blocco azienda (con logo a sinistra se attivo)
            row.RelativeItem().Column(left =>
            {
                if (cfg.LogoShow && TryDecodeLogo(az.Logo, out var bytes, out var px))
                {
                    var h = LogoHeightMm(cfg.LogoSize);
                    left.Item().Height(h, Unit.Millimetre).AlignLeft().Image(bytes).FitHeight();
                    left.Item().PaddingTop(2);
                }
                left.Item().Text(az.RagioneSociale).FontSize(13 * cfg.FontScale).Bold().FontColor(cfg.Text);
                foreach (var line in AzInfoLines(az, withTel: true))
                    left.Item().Text(line).FontSize(8 * cfg.FontScale).FontColor(cfg.Muted);
            });

            // Blocco titolo documento (a destra)
            row.ConstantItem(70, Unit.Millimetre).Column(right =>
            {
                right.Item().AlignRight().Text(type).FontSize(22 * cfg.FontScale).Bold().FontColor(cfg.Accent);
                if (!string.IsNullOrWhiteSpace(subtitle))
                    right.Item().AlignRight().Text(subtitle).FontSize(9 * cfg.FontScale).FontColor(cfg.Muted);
                right.Item().PaddingTop(2).AlignRight().Text($"N. {numero}").FontSize(10 * cfg.FontScale).FontColor(cfg.Text);
                right.Item().AlignRight().Text($"Del {Fd(data)}").FontSize(10 * cfg.FontScale).FontColor(cfg.Text);
            });
        });

        // Linea divisoria accent
        col.Item().PaddingTop(1).LineHorizontal(0.7f).LineColor(cfg.Accent);
    }

    // ── Parties (due box affiancati) ─────────────────────────────────────────

    private void Parties(ColumnDescriptor col, Cfg cfg,
        (string lbl, string name, IReadOnlyList<string> lines) left,
        (string lbl, string name, IReadOnlyList<string> lines) right)
    {
        col.Item().Row(row =>
        {
            row.RelativeItem().Element(c => PartyBox(c, cfg, left));
            row.ConstantItem(6);
            row.RelativeItem().Element(c => PartyBox(c, cfg, right));
        });
    }

    private void PartyBox(IContainer c, Cfg cfg, (string lbl, string name, IReadOnlyList<string> lines) p)
    {
        c.Background(cfg.LightBg).Padding(8).Column(box =>
        {
            box.Item().Text(p.lbl).FontSize(7.5f * cfg.FontScale).Bold().FontColor(cfg.Accent);
            box.Item().PaddingTop(2).Text(p.name).FontSize(10 * cfg.FontScale).Bold().FontColor(cfg.Text);
            foreach (var line in p.lines)
                if (!string.IsNullOrWhiteSpace(line))
                    box.Item().Text(line).FontSize(8 * cfg.FontScale).FontColor(cfg.Muted);
        });
    }

    // ── Tabella righe (colonne data-driven dalla config) ─────────────────────

    private void Table(ColumnDescriptor col, Cfg cfg, IReadOnlyList<Row> righe)
    {
        var cols = cfg.Columns.Where(c => c.Visible).ToList();

        col.Item().Table(table =>
        {
            table.ColumnsDefinition(def =>
            {
                foreach (var c in cols)
                {
                    if (c.Width is double w) def.ConstantColumn((float)w, Unit.Millimetre);
                    else def.RelativeColumn();
                }
            });

            // Intestazione
            table.Header(header =>
            {
                foreach (var c in cols)
                {
                    Align(header.Cell().Background(cfg.HeadFill).Padding(4), c.Align)
                        .Text(c.Label).FontSize(9 * cfg.FontScale).Bold().FontColor(cfg.HeadText);
                }
            });

            // Corpo (righe alternate; le NOTA occupano tutta la larghezza in corsivo)
            int rowIndex = 0;
            int rowNum = 0;
            foreach (var r in righe)
            {
                var bg = (rowIndex % 2 == 1) ? cfg.RowAlt : "#FFFFFF";

                if (r.IsNota)
                {
                    table.Cell().ColumnSpan((uint)cols.Count).Background(bg).Padding(4)
                        .Text(r.Descrizione).Italic().FontSize(9 * cfg.FontScale).FontColor(cfg.Muted);
                }
                else
                {
                    rowNum++;
                    foreach (var c in cols)
                    {
                        Align(table.Cell().Background(bg).Padding(4), c.Align)
                            .Text(CellValue(c.Key, r, rowNum)).FontSize(9 * cfg.FontScale).FontColor(cfg.Text);
                    }
                }
                rowIndex++;
            }
        });
    }

    private string CellValue(string key, Row r, int rowNum) => key switch
    {
        "num" => rowNum.ToString(),
        "codiceDescrizione" => string.IsNullOrEmpty(r.Codice) ? r.Descrizione : $"[{r.Codice}]  {r.Descrizione}",
        "quantita" => r.Quantita == 0 ? "" : Num(r.Quantita),
        "um" => r.UnitaMisura,
        "prezzo" => r.Prezzo != 0 ? Fe(r.Prezzo) : "—",
        "sconto" => r.Sconto != 0 ? Num(r.Sconto) + "%" : "—",
        "iva" => Num(r.Iva) + "%",
        "importo" => r.Imponibile != 0 ? Fe(r.Imponibile) : "—",
        _ => "",
    };

    // ── Totali (riepilogo IVA multi-aliquota + barra totale) ─────────────────

    private void Totals(ColumnDescriptor col, Cfg cfg, Totali t)
    {
        col.Item().AlignRight().Width(80, Unit.Millimetre).Column(box =>
        {
            // Riepilogo per aliquota se più di una
            if (t.PerAliquota.Count > 1)
            {
                box.Item().Table(table =>
                {
                    table.ColumnsDefinition(d => { d.RelativeColumn(); d.RelativeColumn(); d.RelativeColumn(); });
                    table.Header(h =>
                    {
                        h.Cell().Background(cfg.LightBg).Padding(2).Text("Aliquota").FontSize(8 * cfg.FontScale).Bold();
                        h.Cell().Background(cfg.LightBg).Padding(2).AlignRight().Text("Imponibile").FontSize(8 * cfg.FontScale).Bold();
                        h.Cell().Background(cfg.LightBg).Padding(2).AlignRight().Text("IVA").FontSize(8 * cfg.FontScale).Bold();
                    });
                    foreach (var (aliq, imp, iva) in t.PerAliquota.OrderBy(x => x.aliq))
                    {
                        table.Cell().Padding(2).Text($"{Num(aliq)}%").FontSize(8 * cfg.FontScale);
                        table.Cell().Padding(2).AlignRight().Text(Fe(imp)).FontSize(8 * cfg.FontScale);
                        table.Cell().Padding(2).AlignRight().Text(Fe(iva)).FontSize(8 * cfg.FontScale);
                    }
                });
                box.Item().PaddingTop(3);
            }

            void Riga(string lbl, string val)
            {
                box.Item().Row(row =>
                {
                    row.RelativeItem().Text(lbl).FontSize(9 * cfg.FontScale).FontColor(cfg.Muted);
                    row.RelativeItem().AlignRight().Text(val).FontSize(9 * cfg.FontScale).FontColor(cfg.Text);
                });
                box.Item().LineHorizontal(0.2f).LineColor(cfg.Divider);
            }

            Riga("Imponibile", Fe(t.Imponibile));
            if (t.Cassa > 0) Riga("Contributo cassa", Fe(t.Cassa));
            Riga("IVA", Fe(t.Iva));
            if (t.Bollo > 0) Riga("Bollo", Fe(t.Bollo));
            if (t.Ritenuta > 0)
            {
                Riga("Totale documento", Fe(t.Totale));
                Riga("Ritenuta d'acconto", "-" + Fe(t.Ritenuta));
            }

            // Barra totale
            box.Item().PaddingTop(2).Background(cfg.TotalBar).Padding(4).Row(row =>
            {
                row.RelativeItem().Text(t.Ritenuta > 0 ? "NETTO A PAGARE" : "TOTALE")
                    .FontSize(11 * cfg.FontScale).Bold().FontColor(cfg.TotalBarText);
                row.RelativeItem().AlignRight().Text(Fe(t.Ritenuta > 0 ? t.Netto : t.Totale))
                    .FontSize(11 * cfg.FontScale).Bold().FontColor(cfg.TotalBarText);
            });
        });
    }

    // ── Pagamento (modalità + IBAN + pagamenti registrati) ───────────────────

    private void Payment(ColumnDescriptor col, Cfg cfg, Azienda az, string? tipoPag, IReadOnlyList<PagamentoRow> pagamenti)
    {
        var hasModalita = !string.IsNullOrWhiteSpace(tipoPag);
        var hasIban = cfg.ShowIban && !string.IsNullOrWhiteSpace(az.Iban);
        if (!hasModalita && !hasIban && pagamenti.Count == 0) return;

        SecTitle(col, cfg, "Modalità di pagamento");
        if (hasModalita)
            col.Item().Text($"Modalità: {tipoPag}").FontSize(9 * cfg.FontScale).FontColor(cfg.Text);
        if (hasIban)
            col.Item().Text($"IBAN: {az.Iban}{(string.IsNullOrWhiteSpace(az.Banca) ? "" : $" — {az.Banca}")}")
                .FontSize(9 * cfg.FontScale).FontColor(cfg.Text);

        if (pagamenti.Count == 0) return;

        SecTitle(col, cfg, "Pagamenti registrati");
        col.Item().Table(table =>
        {
            table.ColumnsDefinition(d =>
            {
                d.ConstantColumn(25, Unit.Millimetre);
                d.RelativeColumn();
                d.ConstantColumn(28, Unit.Millimetre);
                d.RelativeColumn();
            });
            table.Header(h =>
            {
                h.Cell().Background(cfg.LightBg).Padding(2).Text("Data").FontSize(8 * cfg.FontScale).Bold();
                h.Cell().Background(cfg.LightBg).Padding(2).Text("Metodo").FontSize(8 * cfg.FontScale).Bold();
                h.Cell().Background(cfg.LightBg).Padding(2).AlignRight().Text("Importo").FontSize(8 * cfg.FontScale).Bold();
                h.Cell().Background(cfg.LightBg).Padding(2).Text("Note").FontSize(8 * cfg.FontScale).Bold();
            });
            foreach (var p in pagamenti)
            {
                table.Cell().Padding(2).Text(Fd(p.Data)).FontSize(8 * cfg.FontScale);
                table.Cell().Padding(2).Text(string.IsNullOrEmpty(p.Metodo) ? "—" : p.Metodo).FontSize(8 * cfg.FontScale);
                table.Cell().Padding(2).AlignRight().Text(Fe(p.Importo)).FontSize(8 * cfg.FontScale);
                table.Cell().Padding(2).Text(p.Note ?? "").FontSize(8 * cfg.FontScale);
            }
        });
    }

    // ── Dati trasporto (DDT) ─────────────────────────────────────────────────

    private void Trasporto(ColumnDescriptor col, Cfg cfg, Ddt d)
    {
        var fields = new (string lbl, string val)[]
        {
            ("Causale", d.CausaleTrasporto),
            ("Aspetto beni", d.AspettoBeni),
            ("Porto", d.Porto),
            ("N. Colli", d.NumeroColli != 0 ? Num(d.NumeroColli) : ""),
            ("Peso lordo", d.PesoLordo != 0 ? $"{Num(d.PesoLordo)} kg" : ""),
            ("Incaricato", d.IncaricatoTrasporto),
            ("Vettore", d.Vettore),
            ("Data/ora inizio", FmtDataOra(d.DataOraInizioTrasporto)),
            ("Destinazione", DestinazioneTrasporto(d)),
        }.Where(f => !string.IsNullOrWhiteSpace(f.val)).ToList();

        if (fields.Count == 0 && string.IsNullOrWhiteSpace(d.NoteTrasporto)) return;

        SecTitle(col, cfg, "Dati trasporto");

        // Griglia a due colonne
        for (int i = 0; i < fields.Count; i += 2)
        {
            var a = fields[i];
            var b = i + 1 < fields.Count ? fields[i + 1] : (lbl: "", val: "");
            col.Item().Row(row =>
            {
                row.RelativeItem().Text(txt =>
                {
                    txt.Span($"{a.lbl}: ").FontSize(8.5f * cfg.FontScale).FontColor(cfg.Muted);
                    txt.Span(a.val).FontSize(8.5f * cfg.FontScale).Bold().FontColor(cfg.Text);
                });
                row.RelativeItem().Text(txt =>
                {
                    if (!string.IsNullOrEmpty(b.lbl))
                    {
                        txt.Span($"{b.lbl}: ").FontSize(8.5f * cfg.FontScale).FontColor(cfg.Muted);
                        txt.Span(b.val).FontSize(8.5f * cfg.FontScale).Bold().FontColor(cfg.Text);
                    }
                });
            });
        }

        if (!string.IsNullOrWhiteSpace(d.NoteTrasporto))
            col.Item().Text($"Note: {d.NoteTrasporto}").FontSize(8 * cfg.FontScale).FontColor(cfg.Muted);
    }

    // ── Firme (DDT) ──────────────────────────────────────────────────────────

    private void Signatures(ColumnDescriptor col, Cfg cfg)
    {
        var labels = new[] { "Firma mittente", "Firma vettore", "Firma destinatario" };
        col.Item().PaddingTop(12).Row(row =>
        {
            for (int i = 0; i < labels.Length; i++)
            {
                if (i > 0) row.ConstantItem(6);
                row.RelativeItem().Column(c =>
                {
                    c.Item().LineHorizontal(0.3f).LineColor("#96A0AA");
                    c.Item().PaddingTop(2).AlignCenter().Text(labels[i]).FontSize(8 * cfg.FontScale).FontColor(cfg.Muted);
                });
            }
        });
    }

    // ── Note ─────────────────────────────────────────────────────────────────

    private void NoteBox(ColumnDescriptor col, Cfg cfg, string note)
    {
        SecTitle(col, cfg, "Note");
        col.Item().Background(cfg.NoteFill).Border(0.3f).BorderColor(cfg.NoteBorder).Padding(6)
            .Text(note).FontSize(8.5f * cfg.FontScale).FontColor(cfg.Text);
    }

    // ── Titolo sezione (con linea) ───────────────────────────────────────────

    private void SecTitle(ColumnDescriptor col, Cfg cfg, string title)
    {
        var label = cfg.UppercaseTitles ? title.ToUpperInvariant() : title;
        col.Item().PaddingTop(2).Row(row =>
        {
            row.AutoItem().Text(label).FontSize(9 * cfg.FontScale).Bold().FontColor(cfg.SecTitle);
            row.ConstantItem(2);
            row.RelativeItem().AlignBottom().PaddingBottom(1.5f).LineHorizontal(0.2f).LineColor("#C8CDF0");
        });
    }

    // ── Footer ───────────────────────────────────────────────────────────────

    private void Footer(IContainer c, Cfg cfg, Azienda az)
    {
        if (!cfg.FooterShow) { c.Text(""); return; }

        var f = cfg.Footer;
        var parts = new[]
        {
            f.ShowRagioneSociale ? az.RagioneSociale : "",
            f.ShowPiva && !string.IsNullOrWhiteSpace(az.PIva) ? $"P.IVA {az.PIva}" : "",
            f.ShowCodFiscale && !string.IsNullOrWhiteSpace(az.CodFiscale) ? $"C.F. {az.CodFiscale}" : "",
            f.ShowPec && !string.IsNullOrWhiteSpace(az.Pec) ? $"PEC: {az.Pec}" : "",
            f.ShowSdi && !string.IsNullOrWhiteSpace(az.Sdi) ? $"SDI: {az.Sdi}" : "",
            f.CustomText,
        }.Where(s => !string.IsNullOrWhiteSpace(s));
        var line = string.Join("  —  ", parts);

        c.Column(col =>
        {
            col.Item().LineHorizontal(0.2f).LineColor(cfg.Divider);
            col.Item().PaddingTop(2).Row(row =>
            {
                row.RelativeItem().AlignCenter().Text(line).FontSize(7.5f * cfg.FontScale).FontColor(cfg.Muted);
                if (f.ShowPageNumber)
                    row.ConstantItem(20, Unit.Millimetre).AlignRight().Text(txt =>
                    {
                        txt.DefaultTextStyle(s => s.FontSize(7.5f * cfg.FontScale).FontColor(cfg.Muted));
                        txt.CurrentPageNumber();
                        txt.Span(" / ");
                        txt.TotalPages();
                    });
            });
        });
    }

    // ── Config resolution (legge azienda.template_config) ────────────────────

    private Cfg ResolveConfig(Azienda az, string docType)
    {
        JsonElement root = default;
        var hasJson = false;
        if (!string.IsNullOrWhiteSpace(az.TemplateConfig))
        {
            try { root = JsonDocument.Parse(az.TemplateConfig).RootElement; hasJson = true; }
            catch { hasJson = false; }
        }

        // override per-tipo: perDoc[docType] sostituisce in blocco i sotto-oggetti.
        JsonElement ov = default;
        var hasOv = false;
        if (hasJson && root.TryGetProperty("perDoc", out var perDoc)
            && perDoc.ValueKind == JsonValueKind.Object
            && perDoc.TryGetProperty(docType, out ov) && ov.ValueKind == JsonValueKind.Object)
            hasOv = true;

        JsonElement Pick(string name)
        {
            if (hasOv && ov.TryGetProperty(name, out var o)) return o;
            if (hasJson && root.TryGetProperty(name, out var b)) return b;
            return default;
        }

        var colors = Pick("colors");
        var typography = Pick("typography");
        var logo = Pick("logo");
        var footer = Pick("footer");
        var visibility = Pick("visibility");
        var columns = Pick("columns");
        var margins = Pick("margins");

        // accent: colors.accent > accentColor legacy > default storico (indaco).
        var accent = HexOr(GetStr(colors, "accent"), null)
                     ?? HexOr(hasJson ? GetStr(root, "accentColor") : null, "#4F46E5")!;

        var scale = 1.0;
        if (GetNum(typography, "fontScale") is double fs)
            scale = Math.Clamp(fs, 0.85, 1.2);

        var fontFamily = MapFont(GetStr(typography, "fontFamily"));

        return new Cfg
        {
            Accent = accent,
            Text = HexOr(GetStr(colors, "text"), "#1A1A2E")!,
            Muted = HexOr(GetStr(colors, "muted"), "#647488")!,
            LightBg = HexOr(GetStr(colors, "lightBg"), "#F0F2F8")!,
            RowAlt = HexOr(GetStr(colors, "rowAlt"), "#F8FAFC")!,
            HeadFill = accent, // stile classico: testata tabella con colore accent
            HeadText = HexOr(GetStr(colors, "headText"), "#FFFFFF")!,
            TotalBar = accent,
            TotalBarText = HexOr(GetStr(colors, "totalBarText"), "#FFFFFF")!,
            Divider = HexOr(GetStr(colors, "divider"), "#DCE1E6")!,
            NoteFill = HexOr(GetStr(colors, "noteFill"), "#FFFBEB")!,
            NoteBorder = HexOr(GetStr(colors, "noteBorder"), "#FDE68A")!,
            SecTitle = accent,
            FontFamily = fontFamily,
            FontScale = (float)scale,
            UppercaseTitles = GetBool(typography, "uppercaseSectionTitles") != false,
            LogoShow = GetBool(logo, "show") != false,
            LogoSize = GetStr(logo, "size") ?? "M",
            ShowIban = GetBool(visibility, "showIban") != false,
            MarginLeft = (float)(GetNum(margins, "left") ?? 14),
            MarginRight = (float)(GetNum(margins, "right") ?? 14),
            Columns = ResolveColumns(columns),
            FooterShow = GetBool(footer, "show") != false,
            Footer = new FooterCfg
            {
                ShowRagioneSociale = GetBool(footer, "showRagioneSociale") != false,
                ShowPiva = GetBool(footer, "showPiva") != false,
                ShowCodFiscale = GetBool(footer, "showCodFiscale") != false,
                ShowPec = GetBool(footer, "showPec") != false,
                ShowSdi = GetBool(footer, "showSdi") != false,
                ShowPageNumber = GetBool(footer, "showPageNumber") != false,
                CustomText = GetStr(footer, "customText") ?? "",
            },
        };
    }

    private static readonly (string key, string label, double? width, string align)[] DefaultColumns =
    {
        ("num", "#", 8, "center"),
        ("codiceDescrizione", "Codice / Descrizione", null, "left"),
        ("quantita", "Q.tà", 14, "right"),
        ("um", "UM", 12, "left"),
        ("prezzo", "Prezzo", 22, "right"),
        ("sconto", "Sc.%", 14, "right"),
        ("iva", "IVA", 14, "right"),
        ("importo", "Importo", 24, "right"),
    };

    // num/codiceDescrizione/importo: il servizio web forza visibili "importo" e
    // "codiceDescrizione"; "num" è disattivabile.
    private static readonly HashSet<string> ForcedColumns = new() { "codiceDescrizione", "importo" };

    private static List<ColCfg> ResolveColumns(JsonElement columns)
    {
        var defaults = DefaultColumns.ToDictionary(c => c.key);

        if (columns.ValueKind != JsonValueKind.Array)
            return DefaultColumns.Select(c => new ColCfg
            { Key = c.key, Label = c.label, Width = c.width, Align = c.align, Visible = true }).ToList();

        var outp = new List<ColCfg>();
        var seen = new HashSet<string>();
        foreach (var c in columns.EnumerateArray())
        {
            var key = GetStr(c, "key");
            if (key == null || !defaults.TryGetValue(key, out var d) || !seen.Add(key)) continue;
            outp.Add(new ColCfg
            {
                Key = key,
                Label = GetStr(c, "label") ?? d.label,
                Width = c.TryGetProperty("width", out var w) && w.ValueKind == JsonValueKind.Number ? w.GetDouble() : d.width,
                Align = GetStr(c, "align") ?? d.align,
                Visible = GetBool(c, "visible") != false,
            });
        }
        foreach (var d in DefaultColumns)
            if (seen.Add(d.key))
                outp.Add(new ColCfg { Key = d.key, Label = d.label, Width = d.width, Align = d.align, Visible = true });
        foreach (var c in outp) if (ForcedColumns.Contains(c.Key)) c.Visible = true;
        return outp;
    }

    // ── Data access trasversale (Dapper, via Db.Open) ────────────────────────

    private static Cliente? LoadCliente(long? id)
    {
        if (id is not > 0) return null;
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Cliente>(@"
            SELECT id AS Id, ragione_sociale AS RagioneSociale, email AS Email, telefono AS Telefono,
                   via AS Via, cap AS Cap, citta AS Citta, provincia AS Provincia,
                   codice_fiscale AS CodiceFiscale, p_iva AS PIva, pec AS Pec, sdi AS Sdi
            FROM clienti WHERE id=@id", new { id });
    }

    private static Fornitore? LoadFornitore(long? id)
    {
        if (id is not > 0) return null;
        using var conn = Db.Open();
        return conn.QuerySingleOrDefault<Fornitore>(@"
            SELECT id AS Id, ragione_sociale AS RagioneSociale, email AS Email, telefono AS Telefono,
                   via AS Via, cap AS Cap, citta AS Citta, provincia AS Provincia, p_iva AS PIva
            FROM fornitori WHERE id=@id", new { id });
    }

    private static string? LoadTipoPagamentoNome(long? id)
    {
        if (id is not > 0) return null;
        using var conn = Db.Open();
        return conn.ExecuteScalar<string?>("SELECT nome FROM tipi_pagamento WHERE id=@id", new { id });
    }

    private static List<PagamentoRow> LoadPagamenti(long fatturaId)
    {
        using var conn = Db.Open();
        return conn.Query<PagamentoRow>(@"
            SELECT data_pagamento AS Data, COALESCE(metodo,'') AS Metodo,
                   importo AS Importo, COALESCE(note,'') AS Note
            FROM pagamenti
            WHERE fattura_id=@fatturaId AND COALESCE(tipo,'ENTRATA')='ENTRATA'
            ORDER BY data_pagamento, id", new { fatturaId }).ToList();
    }

    // ── Totali ───────────────────────────────────────────────────────────────

    private static Totali TotaliFattura(Fattura f)
    {
        var per = PerAliquota(f.Righe.Select(r => (r.IsNota, r.Imponibile, r.Iva, r.IvaImporto)));
        return new Totali
        {
            Imponibile = f.Imponibile,
            Cassa = f.CassaImporto,
            Iva = f.Iva,
            Bollo = f.BolloImporto,
            Ritenuta = f.RitenutaImporto,
            Totale = f.Totale,
            Netto = f.NettoAPagare,
            PerAliquota = per,
        };
    }

    private static Totali TotaliSemplici<TR>(decimal imponibile, decimal iva, decimal totale, IEnumerable<TR> righe)
        where TR : class
    {
        // Preventivo/DDT: nessun campo fiscale (cassa/ritenuta/bollo) → solo imponibile/IVA/totale.
        var per = PerAliquota(righe.Select(r =>
        {
            dynamic d = r!;
            return ((bool)d.IsNota, (decimal)d.Imponibile, (decimal)d.Iva, (decimal)((bool)d.IsNota ? 0m : d.Imponibile * d.Iva / 100m));
        }));
        return new Totali
        {
            Imponibile = imponibile,
            Iva = iva,
            Totale = totale,
            Netto = totale,
            PerAliquota = per,
        };
    }

    private static List<(decimal aliq, decimal imp, decimal iva)> PerAliquota(
        IEnumerable<(bool isNota, decimal imp, decimal aliq, decimal iva)> righe)
    {
        var map = new Dictionary<decimal, (decimal imp, decimal iva)>();
        foreach (var r in righe)
        {
            if (r.isNota) continue;
            map.TryGetValue(r.aliq, out var ex);
            map[r.aliq] = (ex.imp + r.imp, ex.iva + r.iva);
        }
        return map.Select(kv => (kv.Key, kv.Value.imp, kv.Value.iva)).ToList();
    }

    // ── Mapping righe → Row uniforme ─────────────────────────────────────────

    private static List<Row> ToRows(IEnumerable<FatturaRiga> righe) =>
        righe.Select(r => new Row
        {
            IsNota = r.IsNota, Codice = r.CodiceProdotto, Descrizione = r.Descrizione,
            Quantita = r.Quantita, UnitaMisura = r.UnitaMisura, Prezzo = r.Prezzo,
            Sconto = r.Sconto, Iva = r.Iva, Imponibile = r.Imponibile,
        }).ToList();

    private static List<Row> ToRows(IEnumerable<PreventivoRiga> righe) =>
        righe.Select(r => new Row
        {
            IsNota = r.IsNota, Codice = r.CodiceProdotto, Descrizione = r.Descrizione,
            Quantita = r.Quantita, UnitaMisura = r.UnitaMisura, Prezzo = r.Prezzo,
            Sconto = r.Sconto, Iva = r.Iva, Imponibile = r.Imponibile,
        }).ToList();

    private static List<Row> ToRows(IEnumerable<DdtRiga> righe) =>
        righe.Select(r => new Row
        {
            IsNota = r.IsNota, Codice = r.CodiceProdotto, Descrizione = r.Descrizione,
            Quantita = r.Quantita, UnitaMisura = r.UnitaMisura, Prezzo = r.Prezzo,
            Sconto = r.Sconto, Iva = r.Iva, Imponibile = r.Imponibile,
        }).ToList();

    // ── Linee testuali anagrafiche ───────────────────────────────────────────

    private static List<string> AzInfoLines(Azienda az, bool withTel)
    {
        var outp = new List<string>();
        var addr = Join(", ", az.Indirizzo, Join(" ", az.Cap, az.Citta, string.IsNullOrWhiteSpace(az.Provincia) ? "" : $"({az.Provincia})"));
        if (!string.IsNullOrWhiteSpace(addr)) outp.Add(addr);
        if (!string.IsNullOrWhiteSpace(az.PIva)) outp.Add($"P.IVA: {az.PIva}");
        if (!string.IsNullOrWhiteSpace(az.Email)) outp.Add(az.Email);
        if (withTel && !string.IsNullOrWhiteSpace(az.Telefono)) outp.Add($"Tel: {az.Telefono}");
        return outp;
    }

    private static List<string> AzLines(Azienda az)
    {
        var outp = new List<string>();
        var addr = Join(", ", az.Indirizzo, Join(" ", az.Cap, az.Citta, string.IsNullOrWhiteSpace(az.Provincia) ? "" : $"({az.Provincia})"));
        if (!string.IsNullOrWhiteSpace(addr)) outp.Add(addr);
        if (!string.IsNullOrWhiteSpace(az.PIva)) outp.Add($"P.IVA: {az.PIva}");
        if (!string.IsNullOrWhiteSpace(az.Iban)) outp.Add($"IBAN: {az.Iban}");
        return outp;
    }

    private static List<string> ContactLines(Cliente? c)
    {
        if (c == null) return new List<string>();
        var outp = new List<string>();
        var addr = Join(", ", c.Via, Join(" ", c.Cap, c.Citta, string.IsNullOrWhiteSpace(c.Provincia) ? "" : $"({c.Provincia})"));
        if (!string.IsNullOrWhiteSpace(addr)) outp.Add(addr);
        if (!string.IsNullOrWhiteSpace(c.PIva)) outp.Add($"P.IVA: {c.PIva}");
        if (!string.IsNullOrWhiteSpace(c.CodiceFiscale)) outp.Add($"C.F.: {c.CodiceFiscale}");
        if (!string.IsNullOrWhiteSpace(c.Email)) outp.Add(c.Email);
        if (!string.IsNullOrWhiteSpace(c.Telefono)) outp.Add($"Tel: {c.Telefono}");
        return outp;
    }

    private static List<string> ContactLinesFornitore(Fornitore? c)
    {
        if (c == null) return new List<string>();
        var outp = new List<string>();
        var addr = Join(", ", c.Via, Join(" ", c.Cap, c.Citta, string.IsNullOrWhiteSpace(c.Provincia) ? "" : $"({c.Provincia})"));
        if (!string.IsNullOrWhiteSpace(addr)) outp.Add(addr);
        if (!string.IsNullOrWhiteSpace(c.PIva)) outp.Add($"P.IVA: {c.PIva}");
        if (!string.IsNullOrWhiteSpace(c.Email)) outp.Add(c.Email);
        if (!string.IsNullOrWhiteSpace(c.Telefono)) outp.Add($"Tel: {c.Telefono}");
        return outp;
    }

    private static (string nome, IReadOnlyList<string> lines) DdtDest(Ddt d, object? controparte)
    {
        if (controparte is Fornitore fo)
            return (fo.RagioneSociale, ContactLinesFornitore(fo));

        var cli = controparte as Cliente;
        // Destinazione diversa: una riga libera + P.IVA del cliente.
        if (!string.IsNullOrWhiteSpace(d.DestinazioneDiversa))
        {
            var lines = new List<string> { d.DestinazioneDiversa };
            if (cli != null && !string.IsNullOrWhiteSpace(cli.PIva)) lines.Add($"P.IVA: {cli.PIva}");
            return (cli?.RagioneSociale ?? d.ClienteNome ?? "—", lines);
        }
        return (cli?.RagioneSociale ?? d.ClienteNome ?? "—", ContactLines(cli));
    }

    private static string DestinazioneTrasporto(Ddt d)
    {
        if (!string.IsNullOrWhiteSpace(d.DestinazioneDiversa)) return d.DestinazioneDiversa;
        return "";
    }

    // ── Logo ─────────────────────────────────────────────────────────────────

    private static bool TryDecodeLogo(string? dataUrl, out byte[] bytes, out bool _)
    {
        bytes = Array.Empty<byte>(); _ = false;
        if (string.IsNullOrWhiteSpace(dataUrl)) return false;
        var idx = dataUrl.IndexOf("base64,", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return false;
        try { bytes = Convert.FromBase64String(dataUrl[(idx + 7)..]); return bytes.Length > 0; }
        catch { return false; }
    }

    private static float LogoHeightMm(string size) => size switch
    {
        "S" => 12, "L" => 24, _ => 18, // M default
    };

    // ── Formatting / JSON helpers ────────────────────────────────────────────

    private static readonly CultureInfo It = CultureInfo.GetCultureInfo("it-IT");

    private static string Fe(decimal n) => n.ToString("C", It); // es. "1.234,56 €"

    private static string Num(decimal n) =>
        n == Math.Truncate(n) ? ((long)n).ToString(It) : n.ToString("0.##", It);

    /// <summary>Data ISO yyyy-MM-dd → dd/MM/yyyy. "—" se vuota.</summary>
    private static string Fd(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "—";
        var p = s.Length >= 10 ? s[..10].Split('-') : s.Split('-');
        return p.Length == 3 ? $"{p[2]}/{p[1]}/{p[0]}" : s;
    }

    private static string FmtDataOra(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var d = Fd(s);
        return s.Length > 10 ? $"{d} {s.Substring(11, Math.Min(5, s.Length - 11))}" : d;
    }

    private static IContainer Align(IContainer c, string align) => align switch
    {
        "right" => c.AlignRight(),
        "center" => c.AlignCenter(),
        _ => c.AlignLeft(),
    };

    private static string MapFont(string? f) => f switch
    {
        "times" => "Times New Roman",
        "courier" => "Courier New",
        _ => "Helvetica",
    };

    private static string? GetStr(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static double? GetNum(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
            ? v.GetDouble() : null;

    private static bool? GetBool(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null,
        };
    }

    private static string? HexOr(string? hex, string? fallback) =>
        IsHex(hex) ? hex : fallback;

    private static bool IsHex(string? s) =>
        !string.IsNullOrEmpty(s) && s.Length == 7 && s[0] == '#'
        && s.Skip(1).All(Uri.IsHexDigit);

    private static string Join(string sep, params string?[] parts) =>
        string.Join(sep, parts.Where(s => !string.IsNullOrWhiteSpace(s)));

    private static string Safe(string s) =>
        new string((s ?? "").Select(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_' ? ch : '_').ToArray());

    private static string DefaultPath(string filename) =>
        Path.Combine(AppPaths.DataDir, filename);

    // ── Tipi interni ─────────────────────────────────────────────────────────

    private sealed class Cfg
    {
        public string Accent = "#4F46E5";
        public string Text = "#1A1A2E";
        public string Muted = "#647488";
        public string LightBg = "#F0F2F8";
        public string RowAlt = "#F8FAFC";
        public string HeadFill = "#4F46E5";
        public string HeadText = "#FFFFFF";
        public string TotalBar = "#4F46E5";
        public string TotalBarText = "#FFFFFF";
        public string Divider = "#DCE1E6";
        public string NoteFill = "#FFFBEB";
        public string NoteBorder = "#FDE68A";
        public string SecTitle = "#4F46E5";
        public string FontFamily = "Helvetica";
        public float FontScale = 1f;
        public bool UppercaseTitles = true;
        public bool LogoShow = true;
        public string LogoSize = "M";
        public bool ShowIban = true;
        public float MarginLeft = 14;
        public float MarginRight = 14;
        public List<ColCfg> Columns = new();
        public bool FooterShow = true;
        public FooterCfg Footer = new();
    }

    private sealed class FooterCfg
    {
        public bool ShowRagioneSociale = true;
        public bool ShowPiva = true;
        public bool ShowCodFiscale = true;
        public bool ShowPec = true;
        public bool ShowSdi = true;
        public bool ShowPageNumber = true;
        public string CustomText = "";
    }

    private sealed class ColCfg
    {
        public string Key = "";
        public string Label = "";
        public double? Width;     // null = auto (RelativeColumn)
        public string Align = "left";
        public bool Visible = true;
    }

    /// <summary>Riga uniforme per la tabella (campi comuni a fattura/preventivo/DDT).</summary>
    private sealed class Row
    {
        public bool IsNota;
        public string Codice = "";
        public string Descrizione = "";
        public decimal Quantita;
        public string UnitaMisura = "";
        public decimal Prezzo;
        public decimal Sconto;
        public decimal Iva;
        public decimal Imponibile;
    }

    private sealed class Totali
    {
        public decimal Imponibile;
        public decimal Cassa;
        public decimal Iva;
        public decimal Bollo;
        public decimal Ritenuta;
        public decimal Totale;
        public decimal Netto;
        public List<(decimal aliq, decimal imp, decimal iva)> PerAliquota = new();
    }

    private sealed class PagamentoRow
    {
        public string Data { get; set; } = "";
        public string Metodo { get; set; } = "";
        public decimal Importo { get; set; }
        public string? Note { get; set; }
    }
}
