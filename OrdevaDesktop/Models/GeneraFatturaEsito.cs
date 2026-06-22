namespace Ordeva.Desktop.Models;

/// <summary>
/// Esito della generazione di una fattura da timesheet (porta il payload di
/// risposta di genera_fattura() in routes/timesheet.rs).
/// </summary>
public sealed class GeneraFatturaEsito
{
    public long FatturaId { get; set; }
    public string Numero { get; set; } = "";

    /// <summary>Numero di voci timesheet marcate come fatturate.</summary>
    public int Voci { get; set; }

    public decimal OreTotali { get; set; }

    /// <summary>Importo imponibile (ore × tariffa, arrotondato a 2 decimali, IVA esclusa).</summary>
    public decimal Importo { get; set; }
}
