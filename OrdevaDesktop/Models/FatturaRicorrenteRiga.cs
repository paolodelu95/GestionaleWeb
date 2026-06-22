using System.Text.Json.Serialization;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Riga di una fattura ricorrente. NON è una tabella: le righe sono serializzate
/// come array JSON nella colonna <c>fatture_ricorrenti.righe</c> (campo TEXT).
/// I nomi JSON sono camelCase per restare byte-compatibili con quanto scritto dal
/// backend Rust/Node (prodottoId, unitaMisura…), così un DB condiviso resta leggibile
/// da entrambe le app. I valori numerici sono <see cref="decimal"/> per i totali.
/// </summary>
public sealed class FatturaRicorrenteRiga
{
    /// <summary>Prodotto collegato (opzionale). NULL/0 = riga libera.</summary>
    [JsonPropertyName("prodottoId")]
    public long? ProdottoId { get; set; }

    [JsonPropertyName("descrizione")]
    public string Descrizione { get; set; } = "";

    [JsonPropertyName("quantita")]
    public decimal Quantita { get; set; } = 1m;

    [JsonPropertyName("unitaMisura")]
    public string UnitaMisura { get; set; } = "";

    [JsonPropertyName("prezzo")]
    public decimal Prezzo { get; set; }

    /// <summary>Sconto percentuale 0..100.</summary>
    [JsonPropertyName("sconto")]
    public decimal Sconto { get; set; }

    [JsonPropertyName("iva")]
    public decimal Iva { get; set; } = 22m;

    // ── Derivati per la UI (non serializzati) ────────────────────────────────

    /// <summary>Imponibile riga = quantità × prezzo × (1 - sconto/100). Parità con imponibile() del dialog Angular.</summary>
    [JsonIgnore]
    public decimal Imponibile => Quantita * Prezzo * (1m - Sconto / 100m);

    /// <summary>IVA della riga = imponibile × iva/100.</summary>
    [JsonIgnore]
    public decimal IvaImporto => Imponibile * Iva / 100m;

    /// <summary>Totale ivato della riga = imponibile × (1 + iva/100).</summary>
    [JsonIgnore]
    public decimal Totale => Imponibile * (1m + Iva / 100m);
}
