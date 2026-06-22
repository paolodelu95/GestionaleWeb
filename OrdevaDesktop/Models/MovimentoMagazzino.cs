namespace Ordeva.Desktop.Models;

/// <summary>
/// Movimento di magazzino (tabella <c>movimenti_magazzino</c>): lo storico di
/// carichi/scarichi/trasferimenti/rettifiche. I nomi prodotto/cliente/fornitore
/// sono risolti con COALESCE(join, colonna_denormalizzata) come nel backend Rust.
/// </summary>
public sealed class MovimentoMagazzino
{
    public long Id { get; set; }
    public string Data { get; set; } = string.Empty;

    public long? ProdottoId { get; set; }
    public string ProdottoNome { get; set; } = string.Empty;

    /// <summary>CARICO | SCARICO | TRASFERIMENTO.</summary>
    public string Tipo { get; set; } = string.Empty;
    public decimal Quantita { get; set; }
    public string Causale { get; set; } = string.Empty;

    public string DocumentoTipo { get; set; } = string.Empty;
    public long? DocumentoId { get; set; }
    public string DocumentoNumero { get; set; } = string.Empty;

    public long? ClienteId { get; set; }
    public string ClienteNome { get; set; } = string.Empty;
    public long? FornitoreId { get; set; }
    public string FornitoreNome { get; set; } = string.Empty;

    public string Note { get; set; } = string.Empty;
    public string VarianteTaglia { get; set; } = string.Empty;
    public string VarianteColore { get; set; } = string.Empty;

    // ── Etichette per la griglia (nessun accesso a DB) ────────────────────────

    /// <summary>Data formattata gg/mm/aaaa (il DB tiene yyyy-MM-dd).</summary>
    public string DataLabel
    {
        get
        {
            if (string.IsNullOrEmpty(Data)) return "—";
            var p = Data.Length >= 10 ? Data.Substring(0, 10).Split('-') : Data.Split('-');
            return p.Length == 3 ? $"{p[2]}/{p[1]}/{p[0]}" : Data;
        }
    }

    public string VarianteLabel
    {
        get
        {
            var parts = new System.Collections.Generic.List<string>(2);
            if (!string.IsNullOrWhiteSpace(VarianteTaglia)) parts.Add(VarianteTaglia);
            if (!string.IsNullOrWhiteSpace(VarianteColore)) parts.Add(VarianteColore);
            return parts.Count == 0 ? string.Empty : string.Join(" / ", parts);
        }
    }

    /// <summary>Etichetta leggibile della causale (mappa del componente Angular).</summary>
    public string CausaleLabel => Causale switch
    {
        "DDT" => "Doc. di trasporto",
        "FATTURA" => "Fattura",
        "RETTIFICA" => "Rettifica",
        "STORNO" => "Storno",
        "ELIMINAZIONE" => "Eliminazione",
        "ANNULLAMENTO" => "Annullamento",
        "RIATTIVAZIONE" => "Riattivazione",
        "TRASFERIMENTO" => "Trasferimento",
        _ => Causale ?? string.Empty,
    };

    /// <summary>Numero documento o "—" se assente.</summary>
    public string DocumentoLabel =>
        string.IsNullOrWhiteSpace(DocumentoNumero) ? "—" : DocumentoNumero;

    /// <summary>Controparte: cliente per gli scarichi, fornitore per i carichi.</summary>
    public string ControparteLabel
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(ClienteNome)) return ClienteNome;
            if (!string.IsNullOrWhiteSpace(FornitoreNome)) return FornitoreNome;
            return "—";
        }
    }

    /// <summary>Quantità con segno per la griglia (+ carico, − scarico).</summary>
    public string QuantitaLabel => Tipo == "SCARICO" ? $"-{Quantita}" : $"+{Quantita}";
}
