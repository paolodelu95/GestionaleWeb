namespace Ordeva.Desktop.Models;

/// <summary>
/// Riga della tabella <c>prodotto_fornitori</c>: associazione prodotto↔fornitore
/// con codice e prezzo d'acquisto. <see cref="FornitoreNome"/> arriva dal join.
/// </summary>
public sealed class ProdottoFornitore
{
    public long Id { get; set; }
    public long ProdottoId { get; set; }
    public long FornitoreId { get; set; }
    public string FornitoreNome { get; set; } = "";
    public string CodiceFornitore { get; set; } = "";
    public decimal? PrezzoAcquisto { get; set; }
    public bool Predefinito { get; set; }
}
