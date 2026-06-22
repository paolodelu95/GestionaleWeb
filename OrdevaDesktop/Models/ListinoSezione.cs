namespace Ordeva.Desktop.Models;

/// <summary>
/// Sezione/divisore di un listino (tabella <c>listini_sezioni</c>): un'intestazione
/// che raggruppa visivamente le righe prezzo. L'ordinamento è condiviso con i prezzi
/// tramite la colonna <c>ordine</c>.
/// </summary>
public sealed class ListinoSezione
{
    public long Id { get; set; }
    public long ListinoId { get; set; }
    public string Nome { get; set; } = "";
    public int Ordine { get; set; }
}
