namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica di servizio: un "tipo di pagamento" (es. Bonifico 30gg FM, Contanti
/// immediato). Definisce su quale conto incassare/pagare e come calcolare la
/// scadenza dei documenti collegati. Tabella SQLite: tipi_pagamento.
/// </summary>
public sealed class TipoPagamento
{
    /// <summary>Chiave primaria (id). Null finché non è stato inserito.</summary>
    public int? Id { get; set; }

    /// <summary>Nome visualizzato (es. "Bonifico 30gg").</summary>
    public string Nome { get; set; } = string.Empty;

    /// <summary>Conto su cui transita il movimento: "BANCA" oppure "CASSA".</summary>
    public string Conto { get; set; } = "BANCA";

    /// <summary>Giorni di dilazione della scadenza. 0 = a vista fattura.</summary>
    public int GiorniScadenza { get; set; }

    /// <summary>Se true la scadenza viene spostata a fine mese.</summary>
    public bool FineMese { get; set; }

    /// <summary>Se true il pagamento è registrato all'emissione (giorni = 0).</summary>
    public bool Immediato { get; set; }

    /// <summary>Se false il tipo non compare nelle scelte dei nuovi documenti.</summary>
    public bool Attivo { get; set; } = true;

    /// <summary>
    /// Etichetta sintetica della scadenza, come nella UI web (scadenzaLabel):
    /// "Immediato" / "Vista fattura" / "30gg FM".
    /// </summary>
    public string ScadenzaLabel =>
        Immediato ? "Immediato"
        : GiorniScadenza == 0 ? "Vista fattura"
        : $"{GiorniScadenza}gg{(FineMese ? " FM" : string.Empty)}";
}
