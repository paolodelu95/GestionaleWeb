namespace Ordeva.Desktop.Models;

/// <summary>
/// Riga di un documento di trasporto (tabella <c>ddt_righe</c>). Le colonne
/// SQLite sono snake_case: il repository usa alias espliciti verso queste
/// proprietà PascalCase. I valori REAL (quantità/prezzo/sconto/iva) diventano
/// <see cref="decimal"/> per evitare errori di arrotondamento sui totali.
/// Il flag INTEGER 0/1 <c>scarica_magazzino</c> diventa bool.
/// </summary>
public sealed class DdtRiga
{
    public long Id { get; set; }
    public long DdtId { get; set; }

    /// <summary>Prodotto collegato. NULL = riga libera (descrizione manuale o NOTA).</summary>
    public long? ProdottoId { get; set; }

    /// <summary>Nome prodotto risolto via JOIN (non mappato su una colonna di ddt_righe).</summary>
    public string? ProdottoNome { get; set; }

    public string CodiceProdotto { get; set; } = "";
    public string Descrizione { get; set; } = "";

    public decimal Quantita { get; set; } = 1m;
    public string UnitaMisura { get; set; } = "";
    public decimal Prezzo { get; set; }

    /// <summary>Sconto percentuale 0..100.</summary>
    public decimal Sconto { get; set; }
    public decimal Iva { get; set; } = 22m;

    /// <summary>Codice IVA opzionale (colonna codice_iva).</summary>
    public string CodiceIva { get; set; } = "";

    public long? VarianteId { get; set; }
    public string VarianteTaglia { get; set; } = "";
    public string VarianteColore { get; set; } = "";

    /// <summary>"PRODOTTO" oppure "NOTA" (riga di solo testo, esclusa dai totali).</summary>
    public string Tipo { get; set; } = "PRODOTTO";

    /// <summary>
    /// Se la riga scarica le scorte di magazzino (default true). Lo scarico vero
    /// e proprio è gestito dal backend; qui resta come dato fedele al DB.
    /// </summary>
    public bool ScaricaMagazzino { get; set; } = true;

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>True per le righe di sola nota (escluse dal calcolo dei totali).</summary>
    public bool IsNota => string.Equals(Tipo, "NOTA", System.StringComparison.OrdinalIgnoreCase);

    /// <summary>Imponibile riga = quantità × prezzo × (1 - sconto/100). 0 per le note.</summary>
    public decimal Imponibile => IsNota ? 0m : Quantita * Prezzo * (1m - Sconto / 100m);

    /// <summary>Totale ivato della riga = imponibile × (1 + iva/100). 0 per le note.</summary>
    public decimal Totale => IsNota ? 0m : Imponibile * (1m + Iva / 100m);
}
