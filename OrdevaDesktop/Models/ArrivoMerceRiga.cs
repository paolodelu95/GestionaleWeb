namespace Ordeva.Desktop.Models;

/// <summary>
/// Riga di un arrivo merce (tabella <c>arrivi_merce_righe</c>). Le colonne SQLite
/// sono snake_case: le query del repository usano alias espliciti verso queste
/// proprietà PascalCase. I valori REAL (quantità, prezzo) diventano
/// <see cref="decimal"/>; <c>prodotto_id</c>/<c>variante_id</c>/<c>magazzino_id</c>
/// NULL → null. Porta la logica del backend Rust (routes/arrivi_merce.rs, get_righe).
/// </summary>
public sealed class ArrivoMerceRiga
{
    public long Id { get; set; }
    public long ArrivoMerceId { get; set; }

    /// <summary>Prodotto collegato. NULL/0 = riga libera (non movimenta il magazzino).</summary>
    public long? ProdottoId { get; set; }
    /// <summary>Nome del prodotto, risolto in join (non mappato dalla tabella righe).</summary>
    public string ProdottoNome { get; set; } = "";

    public long? VarianteId { get; set; }

    public string Descrizione { get; set; } = "";
    public string CodiceFornitore { get; set; } = "";

    /// <summary>Quantità ricevuta (REAL, default 1).</summary>
    public decimal Quantita { get; set; } = 1m;
    public string UnitaMisura { get; set; } = "";
    /// <summary>Prezzo di acquisto unitario (REAL, default 0).</summary>
    public decimal PrezzoAcquisto { get; set; }

    public string VarianteTaglia { get; set; } = "";
    public string VarianteColore { get; set; } = "";

    /// <summary>Lotto (per tracciabilità giacenze). Default "".</summary>
    public string Lotto { get; set; } = "";
    /// <summary>Scadenza ISO "yyyy-MM-dd" (per tracciabilità giacenze). Default "".</summary>
    public string Scadenza { get; set; } = "";

    /// <summary>Deposito di destinazione della riga (override di quello di testata).</summary>
    public long? MagazzinoId { get; set; }

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>Valore di riga = quantità × prezzo d'acquisto (parità con il totale calcolato dal backend).</summary>
    public decimal Totale => Quantita * PrezzoAcquisto;
}
