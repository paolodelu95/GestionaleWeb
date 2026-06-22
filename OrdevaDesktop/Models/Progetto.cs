using System.Collections.Generic;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Progetto/commessa (tabella <c>progetti</c>). Le colonne SQLite sono
/// snake_case: le query del repository usano alias espliciti verso queste
/// proprietà PascalCase. Importi REAL (budget, tariffa_oraria) diventano
/// <see cref="decimal"/>; le date TEXT ISO restano string. Lo <c>stato</c> è
/// vincolato dal CHECK a APERTO/IN_CORSO/SOSPESO/CHIUSO.
/// Porta la logica di routes/timesheet.rs (list_progetti).
/// </summary>
public sealed class Progetto
{
    public long Id { get; set; }
    public string Nome { get; set; } = "";
    public string Descrizione { get; set; } = "";

    /// <summary>Cliente collegato (ON DELETE SET NULL). NULL = nessun cliente.</summary>
    public long? ClienteId { get; set; }

    /// <summary>Ragione sociale del cliente risolta via JOIN (non mappata su una colonna di progetti).</summary>
    public string ClienteNome { get; set; } = "";

    /// <summary>APERTO | IN_CORSO | SOSPESO | CHIUSO. Vincolato dal CHECK del DB.</summary>
    public string Stato { get; set; } = "APERTO";

    public string DataInizio { get; set; } = "";
    public string DataFine { get; set; } = "";

    public decimal Budget { get; set; }
    public decimal TariffaOraria { get; set; }
    public string Note { get; set; } = "";
    public string CreatedAt { get; set; } = "";

    // ── Aggregati calcolati via JOIN/subquery (non mappati su colonne di progetti) ──

    /// <summary>Somma di tutte le ore registrate sul progetto.</summary>
    public decimal OreTotali { get; set; }

    /// <summary>Somma delle ore già fatturate (timesheet_voci.fatturata=1).</summary>
    public decimal OreFatturate { get; set; }

    /// <summary>Voci timesheet del progetto, caricate solo nel dettaglio.</summary>
    public List<TimesheetVoce> Voci { get; set; } = new();

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>Ore ancora da fatturare (mai negative). Parità con (oreTotali - oreFatturate).</summary>
    public decimal OreDaFatturare => OreTotali - OreFatturate > 0m ? OreTotali - OreFatturate : 0m;

    /// <summary>
    /// True se è possibile generare una fattura: ci sono ore da fatturare, un
    /// cliente collegato e una tariffa oraria positiva. Parità con i controlli
    /// di genera_fattura() nel backend Rust.
    /// </summary>
    public bool PuoFatturare => OreDaFatturare > 0m && ClienteId.HasValue && TariffaOraria > 0m;
}
