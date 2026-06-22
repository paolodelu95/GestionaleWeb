namespace Ordeva.Desktop.Models;

/// <summary>
/// Riga di un ordine (tabella <c>ordini_righe</c>). Le colonne SQLite sono
/// snake_case: le query del repository usano alias espliciti verso queste
/// proprietà PascalCase. I valori REAL (quantità, prezzo, iva, sconto) diventano
/// <see cref="decimal"/>; <c>prodotto_id</c>/<c>variante_id</c> NULL → null.
/// </summary>
public sealed class OrdineRiga
{
    public long Id { get; set; }
    public long OrdineId { get; set; }

    /// <summary>Prodotto collegato. NULL/0 = riga libera (descrizione manuale o nota).</summary>
    public long? ProdottoId { get; set; }
    /// <summary>Nome del prodotto, risolto in join (non mappato dalla tabella righe).</summary>
    public string? ProdottoNome { get; set; }

    public string CodiceProdotto { get; set; } = "";
    public string CodiceFornitore { get; set; } = "";
    public string Descrizione { get; set; } = "";

    public decimal Quantita { get; set; } = 1m;
    public string UnitaMisura { get; set; } = "";
    public decimal Prezzo { get; set; }
    /// <summary>Sconto percentuale di riga (0–100).</summary>
    public decimal Sconto { get; set; }
    public decimal Iva { get; set; } = 22m;

    public long? VarianteId { get; set; }
    public string VarianteTaglia { get; set; } = "";
    public string VarianteColore { get; set; } = "";

    /// <summary>"PRODOTTO" (default) oppure "NOTA" per le righe descrittive.</summary>
    public string Tipo { get; set; } = "PRODOTTO";

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>Imponibile di riga = quantità × prezzo × (1 - sconto/100).</summary>
    public decimal Imponibile => Quantita * Prezzo * (1m - Sconto / 100m);

    /// <summary>Totale di riga IVA inclusa.</summary>
    public decimal Totale => Imponibile * (1m + Iva / 100m);
}
