namespace Ordeva.Desktop.Models;

/// <summary>Riga della tabella <c>prodotto_varianti</c> (taglia/colore/giacenza).</summary>
public sealed class ProdottoVariante
{
    public long Id { get; set; }
    public long ProdottoId { get; set; }
    public string Taglia { get; set; } = "";
    public string Colore { get; set; } = "";
    public decimal Quantita { get; set; }
    public string Barcode { get; set; } = "";
}
