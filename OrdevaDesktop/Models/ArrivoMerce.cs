using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Documento di arrivo/ricezione merce (tabella <c>arrivi_merce</c>) con le righe
/// e il totale calcolato. Le colonne SQLite sono snake_case: le query del
/// repository usano alias espliciti verso queste proprietà PascalCase.
/// Porta la logica del backend Rust (routes/arrivi_merce.rs).
///
/// Lo stato determina la movimentazione di magazzino: in stato "RICEVUTO" le
/// righe caricano le scorte; "ATTESA"/"ANNULLATO" non movimentano.
/// </summary>
public sealed class ArrivoMerce
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";
    /// <summary>Data dell'arrivo in formato ISO "yyyy-MM-dd" (TEXT in DB).</summary>
    public string Data { get; set; } = "";

    /// <summary>Fornitore collegato (FK fornitori). NULL/0 = nessun fornitore.</summary>
    public long? FornitoreId { get; set; }
    /// <summary>Ragione sociale fornitore, risolta in join (non mappata dalla tabella).</summary>
    public string? FornitoreNome { get; set; }

    /// <summary>Fattura di acquisto da cui è stato importato (FK acquisti). NULL/0 = nessuna.</summary>
    public long? AcquistoId { get; set; }

    /// <summary>Numero del documento del fornitore (es. "FT 2025/123").</summary>
    public string NumeroDocumentoFornitore { get; set; } = "";
    public string Note { get; set; } = "";

    /// <summary>"RICEVUTO" (default, carica le scorte), "ATTESA" o "ANNULLATO".</summary>
    public string Stato { get; set; } = "RICEVUTO";

    /// <summary>Deposito di destinazione di testata (override del predefinito).</summary>
    public long? MagazzinoId { get; set; }

    /// <summary>Righe del documento, caricate nel dettaglio (GetById).</summary>
    public List<ArrivoMerceRiga> Righe { get; set; } = new();

    /// <summary>
    /// Valore totale dell'arrivo (SUM quantita × prezzo_acquisto). In lista arriva
    /// già calcolato dal DB, come il backend (to_dto).
    /// </summary>
    public decimal Totale { get; set; }

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>Controparte mostrata in lista: nome fornitore o trattino.</summary>
    public string FornitoreVisualizzato =>
        string.IsNullOrWhiteSpace(FornitoreNome) ? "—" : FornitoreNome!;

    /// <summary>Etichetta leggibile dello stato per la lista.</summary>
    public string StatoLabel => Stato switch
    {
        "RICEVUTO" => "Ricevuto",
        "ANNULLATO" => "Annullato",
        _ => "In attesa",
    };

    /// <summary>Ricalcola il totale dalle righe in memoria.</summary>
    public void RicalcolaTotali() => Totale = Righe.Sum(r => r.Totale);
}
