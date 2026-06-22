using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Documento preventivo (tabella <c>preventivi</c>) con le sue righe. Le colonne
/// SQLite sono snake_case: il repository usa alias espliciti verso queste
/// proprietà PascalCase. Il flag INTEGER 0/1 <c>stampa_immagini</c> diventa bool.
/// I totali (imponibile/iva/totale) sono derivati dalle righe — la stessa logica
/// del backend Rust (routes/preventivi.rs:to_dto), portata in C#.
/// </summary>
public sealed class Preventivo
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";

    /// <summary>Data emissione in formato ISO "yyyy-MM-dd" (come salvata dal backend).</summary>
    public string DataEmissione { get; set; } = "";

    public long? ClienteId { get; set; }

    /// <summary>Ragione sociale del cliente, risolta via JOIN (non è una colonna di preventivi).</summary>
    public string? ClienteNome { get; set; }

    /// <summary>Giorni di validità dell'offerta (default backend = 30).</summary>
    public int Validita { get; set; } = 30;

    /// <summary>Stato: INVIATO | ACCETTATO | RIFIUTATO | CONFERMATO.</summary>
    public string Stato { get; set; } = "INVIATO";

    public string Note { get; set; } = "";

    /// <summary>Se mostrare le immagini prodotto nella stampa PDF (default true).</summary>
    public bool StampaImmagini { get; set; } = true;

    /// <summary>Righe del documento, caricate da GetById.</summary>
    public List<PreventivoRiga> Righe { get; set; } = new();

    // ── Totali derivati dalle righe ──────────────────────────────────────────
    // Portano la logica di to_dto() del backend:
    //   imponibile = Σ quantita·prezzo·(1 - sconto/100)
    //   totale     = Σ quantita·prezzo·(1 - sconto/100)·(1 + iva/100)
    // Per la lista i totali arrivano già calcolati dal repository (vedi
    // TotaleListato/ImponibileListato); per il dettaglio si usano le righe.

    /// <summary>Imponibile calcolato dalle righe caricate (le note non contano).</summary>
    public decimal Imponibile => Righe.Sum(r => r.Imponibile);

    /// <summary>Totale ivato calcolato dalle righe caricate (le note non contano).</summary>
    public decimal Totale => Righe.Sum(r => r.Totale);

    /// <summary>IVA totale = totale - imponibile.</summary>
    public decimal IvaTotale => Totale - Imponibile;

    // Valori precalcolati dal repository per la lista (evita di caricare le righe
    // di ogni documento solo per mostrare l'importo). Restano null nel dettaglio.

    /// <summary>Imponibile calcolato in SQL per la vista lista (NULL nel dettaglio).</summary>
    public decimal? ImponibileListato { get; set; }

    /// <summary>Totale calcolato in SQL per la vista lista (NULL nel dettaglio).</summary>
    public decimal? TotaleListato { get; set; }

    /// <summary>Totale da mostrare in lista: usa il precalcolato se presente, altrimenti le righe.</summary>
    public decimal TotaleVisualizzato => TotaleListato ?? Totale;

    /// <summary>Anno dell'emissione (per i filtri). 0 se la data non è valorizzata.</summary>
    public int Anno =>
        DataEmissione.Length >= 4 && int.TryParse(DataEmissione[..4], out var y) ? y : 0;

    /// <summary>Mese dell'emissione 1..12 (per i filtri). 0 se la data non è valida.</summary>
    public int Mese =>
        DataEmissione.Length >= 7 && int.TryParse(DataEmissione.Substring(5, 2), out var m) ? m : 0;
}
