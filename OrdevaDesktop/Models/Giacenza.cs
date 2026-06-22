namespace Ordeva.Desktop.Models;

/// <summary>
/// Giacenza per chiave prodotto/variante/deposito/lotto/scadenza (tabella
/// <c>giacenze</c>). I campi prodotto/variante/deposito "Nome"/"Codice" sono
/// denormalizzati via join in lettura (non sono colonne della tabella).
/// La quantità REAL è mappata a decimal.
/// </summary>
public sealed class Giacenza
{
    public long Id { get; set; }

    public long ProdottoId { get; set; }
    public string ProdottoNome { get; set; } = string.Empty;
    public string ProdottoCodice { get; set; } = string.Empty;
    public string UnitaMisura { get; set; } = string.Empty;

    public long? VarianteId { get; set; }
    public string VarianteTaglia { get; set; } = string.Empty;
    public string VarianteColore { get; set; } = string.Empty;

    public long MagazzinoId { get; set; }
    public string MagazzinoNome { get; set; } = string.Empty;

    public string Lotto { get; set; } = string.Empty;
    public string Scadenza { get; set; } = string.Empty;

    public decimal Quantita { get; set; }

    /// <summary>Etichetta variante "Taglia / Colore" (vuota se nessuna variante).</summary>
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

    /// <summary>Quantità + unità di misura per la colonna giacenza.</summary>
    public string QuantitaLabel =>
        string.IsNullOrWhiteSpace(UnitaMisura) ? Quantita.ToString() : $"{Quantita} {UnitaMisura}";
}
