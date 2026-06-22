using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Fattura d'acquisto (ciclo passivo, tabella <c>acquisti</c>) con le sue righe.
/// Le colonne SQLite sono snake_case: il repository usa alias espliciti verso
/// queste proprietà PascalCase. I REAL diventano decimal.
///
/// I totali (imponibile, IVA, totale) sono derivati dalle righe con la STESSA
/// formula del backend Rust (routes/acquisti.rs, to_dto):
///   imponibile = Σ q·p·(1 - sconto/100)
///   totale     = Σ q·p·(1 - sconto/100)·(1 + iva/100)
/// In acquisti NON ci sono ritenuta/cassa/bollo: solo imponibile + IVA.
/// </summary>
public sealed class Acquisto
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";

    /// <summary>Data emissione in formato ISO "yyyy-MM-dd" (come salvata dal backend).</summary>
    public string DataEmissione { get; set; } = "";

    public long? FornitoreId { get; set; }

    /// <summary>Ragione sociale del fornitore, risolta via JOIN (non è colonna di acquisti).</summary>
    public string? FornitoreNome { get; set; }

    public long? TipoPagamentoId { get; set; }

    /// <summary>Nome del tipo pagamento, risolto via JOIN (non è colonna di acquisti).</summary>
    public string? TipoPagamentoNome { get; set; }

    public string Note { get; set; } = "";

    /// <summary>Stato: RICEVUTA | PAGATA | ANNULLATA (default backend = RICEVUTA).</summary>
    public string Stato { get; set; } = "RICEVUTA";

    /// <summary>Conto d'acquisto contabile (colonna conto_acquisto_id). NULL ammesso.</summary>
    public long? ContoAcquistoId { get; set; }

    /// <summary>Righe del documento, caricate da GetById.</summary>
    public List<AcquistoRiga> Righe { get; set; } = new();

    // ── Totali derivati dalle righe (porting di to_dto) ──────────────────────
    // Per il dettaglio si usano le righe caricate; per la lista i valori arrivano
    // già aggregati dal repository (ImponibileListato/TotaleListato).

    private static decimal Round2(decimal n) => System.Math.Round(n, 2, System.MidpointRounding.AwayFromZero);

    /// <summary>Imponibile = Σ q·p·(1 - sconto/100) sulle righe non-NOTA.</summary>
    public decimal Imponibile => Round2(Righe.Sum(r => r.Imponibile));

    /// <summary>IVA totale = Σ IVA delle righe (note escluse).</summary>
    public decimal Iva => Round2(Righe.Sum(r => r.IvaImporto));

    /// <summary>Totale documento = imponibile + IVA.</summary>
    public decimal Totale => Round2(Imponibile + Iva);

    // ── Valori precalcolati dal repository per la lista (evita N+1) ──────────
    public decimal? ImponibileListato { get; set; }
    public decimal? TotaleListato { get; set; }

    /// <summary>Imponibile da mostrare in lista: usa il precalcolato se presente.</summary>
    public decimal ImponibileVisualizzato => ImponibileListato ?? Imponibile;

    /// <summary>Totale da mostrare in lista: usa il precalcolato se presente.</summary>
    public decimal TotaleVisualizzato => TotaleListato ?? Totale;

    /// <summary>Anno dell'emissione (per i filtri). 0 se la data non è valorizzata.</summary>
    public int Anno =>
        DataEmissione.Length >= 4 && int.TryParse(DataEmissione[..4], out var y) ? y : 0;

    /// <summary>Mese dell'emissione 1..12 (per i filtri). 0 se la data non è valida.</summary>
    public int Mese =>
        DataEmissione.Length >= 7 && int.TryParse(DataEmissione.Substring(5, 2), out var m) ? m : 0;
}
