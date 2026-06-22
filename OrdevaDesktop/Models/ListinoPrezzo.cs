namespace Ordeva.Desktop.Models;

/// <summary>
/// Riga prezzo di un listino (tabella <c>listini_prezzi</c>): override di
/// prezzo/sconto per un prodotto. <c>prezzo</c> NULL = nessun override manuale
/// (il prezzo finale si calcola dallo sconto); <c>sconto</c> NULL = usa lo sconto
/// di default del listino. I campi prodotto* sono JOIN read-only sul prodotto,
/// caricati in batch (niente N+1). datiExtra/stili sono TEXT JSON grezzo.
/// </summary>
public sealed class ListinoPrezzo
{
    public long Id { get; set; }
    public long ListinoId { get; set; }
    public long ProdottoId { get; set; }

    /// <summary>Prezzo override. NULL in DB → null (non 0): si torna al calcolo da sconto.</summary>
    public decimal? Prezzo { get; set; }
    /// <summary>Sconto riga (%). NULL → usa lo sconto_default del listino.</summary>
    public decimal? Sconto { get; set; }
    public int Ordine { get; set; }

    public string DatiExtra { get; set; } = "{}";
    public string Stili { get; set; } = "{}";

    // ── dati prodotto (JOIN read-only) ────────────────────────────────────────
    public string ProdottoNome { get; set; } = "";
    public string ProdottoCodice { get; set; } = "";
    public decimal? ProdottoPrezzoBase { get; set; }
    public decimal? ProdottoIva { get; set; }
    public string ProdottoUm { get; set; } = "";
    public string ProdottoCategoria { get; set; } = "";
    public string ProdottoDescrizione { get; set; } = "";
    public decimal? ProdottoPeso { get; set; }
    public string ProdottoDimensioni { get; set; } = "";

    /// <summary>
    /// Prezzo finale per la UI: override se presente, altrimenti base scontata.
    /// Lo sconto effettivo è quello di riga, o quello di default passato dal listino.
    /// Replica prezzoFinale() del componente Angular (arrotondato a 2 decimali).
    /// </summary>
    public decimal PrezzoFinale(decimal scontoDefault)
    {
        if (Prezzo != null) return Prezzo.Value;
        var basePrezzo = ProdottoPrezzoBase ?? 0m;
        var sconto = Sconto ?? scontoDefault;
        return decimal.Round(basePrezzo * (1 - sconto / 100m), 2);
    }
}
