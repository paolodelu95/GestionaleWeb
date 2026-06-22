using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Documento di trasporto (tabella <c>ddt</c>) con le sue righe e i dati di
/// trasporto. Può essere verso CLIENTE oppure FORNITORE (reso). Le colonne
/// SQLite sono snake_case: il repository usa alias espliciti verso queste
/// proprietà PascalCase. I prezzi REAL diventano decimal.
/// I totali (imponibile/iva/totale) sono derivati dalle righe con la stessa
/// logica del backend Rust (routes/ddt.rs:to_dto), portata in C#.
/// </summary>
public sealed class Ddt
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";

    /// <summary>Data emissione in formato ISO "yyyy-MM-dd" (come salvata dal backend).</summary>
    public string DataEmissione { get; set; } = "";

    /// <summary>Tipo controparte: CLIENTE (default) oppure FORNITORE (reso).</summary>
    public string Tipo { get; set; } = "CLIENTE";

    public long? ClienteId { get; set; }

    /// <summary>Ragione sociale del cliente, risolta via JOIN (non è colonna di ddt).</summary>
    public string? ClienteNome { get; set; }

    public long? FornitoreId { get; set; }

    /// <summary>Ragione sociale del fornitore, risolta via JOIN (non è colonna di ddt).</summary>
    public string? FornitoreNome { get; set; }

    /// <summary>Stato: EMESSO (default) | ANNULLATO.</summary>
    public string Stato { get; set; } = "EMESSO";

    public string Note { get; set; } = "";

    // ── Dati di trasporto ────────────────────────────────────────────────────

    /// <summary>Causale del trasporto (colonna <c>causale</c>).</summary>
    public string CausaleTrasporto { get; set; } = "";

    public string DataOraInizioTrasporto { get; set; } = "";
    public string AspettoBeni { get; set; } = "";

    /// <summary>Porto (default "Franco").</summary>
    public string Porto { get; set; } = "Franco";

    public decimal NumeroColli { get; set; }
    public decimal PesoLordo { get; set; }

    /// <summary>Incaricato del trasporto (default "Mittente").</summary>
    public string IncaricatoTrasporto { get; set; } = "Mittente";

    public string Vettore { get; set; } = "";
    public string DestinazioneDiversa { get; set; } = "";
    public string NoteTrasporto { get; set; } = "";
    public long? DestinazioneId { get; set; }

    // ── Collegamento fattura (risolto via JOIN nella lista) ───────────────────

    public long? FatturaId { get; set; }
    public string? FatturaNumero { get; set; }

    /// <summary>Righe del documento, caricate da GetById.</summary>
    public List<DdtRiga> Righe { get; set; } = new();

    // ── Derivati ──────────────────────────────────────────────────────────────

    /// <summary>True se è un reso verso fornitore (non convertibile in fattura).</summary>
    public bool IsFornitore => string.Equals(Tipo, "FORNITORE", System.StringComparison.OrdinalIgnoreCase);

    /// <summary>Nome controparte: fornitore se reso, altrimenti cliente.</summary>
    public string ControparteNome =>
        IsFornitore ? (FornitoreNome ?? "") : (ClienteNome ?? "");

    /// <summary>True se il documento può ancora essere fatturato.</summary>
    public bool DaFatturare => FatturaId == null && Stato != "ANNULLATO" && !IsFornitore;

    // Totali derivati dalle righe (portano to_dto del backend):
    //   imponibile = Σ quantita·prezzo·(1 - sconto/100)
    //   totale     = Σ quantita·prezzo·(1 - sconto/100)·(1 + iva/100)
    // Per la lista arrivano già calcolati in SQL (ImponibileListato/TotaleListato),
    // così non si caricano le righe di ogni documento solo per l'importo.

    /// <summary>Imponibile calcolato dalle righe caricate.</summary>
    public decimal Imponibile => Righe.Sum(r => r.Imponibile);

    /// <summary>Totale ivato calcolato dalle righe caricate.</summary>
    public decimal Totale => Righe.Sum(r => r.Totale);

    /// <summary>IVA totale = totale - imponibile.</summary>
    public decimal IvaTotale => Totale - Imponibile;

    /// <summary>Imponibile calcolato in SQL per la vista lista (NULL nel dettaglio).</summary>
    public decimal? ImponibileListato { get; set; }

    /// <summary>Totale calcolato in SQL per la vista lista (NULL nel dettaglio).</summary>
    public decimal? TotaleListato { get; set; }

    /// <summary>Totale da mostrare in lista: usa il precalcolato, altrimenti le righe.</summary>
    public decimal TotaleVisualizzato => TotaleListato ?? Totale;

    /// <summary>Anno dell'emissione (per i filtri). 0 se la data non è valorizzata.</summary>
    public int Anno =>
        DataEmissione.Length >= 4 && int.TryParse(DataEmissione[..4], out var y) ? y : 0;

    /// <summary>Mese dell'emissione 1..12 (per i filtri). 0 se la data non è valida.</summary>
    public int Mese =>
        DataEmissione.Length >= 7 && int.TryParse(DataEmissione.Substring(5, 2), out var m) ? m : 0;
}
