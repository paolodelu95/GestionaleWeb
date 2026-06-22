using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Documento ordine (tabella <c>ordini</c>), cliente o fornitore, con le righe e i
/// totali calcolati. Le colonne SQLite sono snake_case: le query del repository
/// usano alias espliciti verso queste proprietà PascalCase. <c>cliente_id</c>,
/// <c>fornitore_id</c>, <c>acquisto_id</c> NULL → null.
/// Porta la logica del backend Rust (routes/ordini.rs).
/// </summary>
public sealed class Ordine
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";
    /// <summary>Data ordine in formato ISO "yyyy-MM-dd" (TEXT in DB).</summary>
    public string DataOrdine { get; set; } = "";

    public long? ClienteId { get; set; }
    /// <summary>Ragione sociale del cliente, risolta in join.</summary>
    public string? ClienteNome { get; set; }
    public long? FornitoreId { get; set; }
    /// <summary>Ragione sociale del fornitore, risolta in join.</summary>
    public string? FornitoreNome { get; set; }

    public long? AcquistoId { get; set; }
    /// <summary>Numero dell'acquisto collegato, risolto in join.</summary>
    public string? AcquistoNumero { get; set; }

    /// <summary>"CLIENTE" (default) oppure "FORNITORE".</summary>
    public string Tipo { get; set; } = "CLIENTE";
    /// <summary>"APERTO" (default), "CONFERMATO", "IN_LAVORAZIONE", "EVASO", "ANNULLATO".</summary>
    public string Stato { get; set; } = "APERTO";
    public string Note { get; set; } = "";

    /// <summary>Righe del documento, caricate nel dettaglio (GetById).</summary>
    public List<OrdineRiga> Righe { get; set; } = new();

    // ── Totali ───────────────────────────────────────────────────────────────
    // Nelle liste arrivano già calcolati dal DB (SUM su ordini_righe), come il
    // backend; nel dettaglio si possono ricalcolare dalle righe in memoria.

    /// <summary>Imponibile (sconto applicato, IVA esclusa).</summary>
    public decimal Imponibile { get; set; }
    /// <summary>Totale documento IVA inclusa.</summary>
    public decimal Totale { get; set; }

    /// <summary>Controparte mostrata in lista: cliente per gli ordini cliente, fornitore altrimenti.</summary>
    public string Controparte => ClienteNome ?? FornitoreNome ?? "—";

    /// <summary>Ricalcola Imponibile/Totale dalle righe in memoria (parità con to_dto del backend).</summary>
    public void RicalcolaTotali()
    {
        Imponibile = Righe.Sum(r => r.Imponibile);
        Totale = Righe.Sum(r => r.Totale);
    }
}
