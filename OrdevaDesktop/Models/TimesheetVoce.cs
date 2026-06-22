namespace Ordeva.Desktop.Models;

/// <summary>
/// Voce di timesheet di un progetto (tabella <c>timesheet_voci</c>). Le colonne
/// SQLite sono snake_case: il repository usa alias espliciti verso queste
/// proprietà PascalCase. Le ore REAL diventano <see cref="decimal"/>, il flag
/// INTEGER 0/1 <c>fatturata</c> diventa bool, le date TEXT ISO restano string.
/// Cancellata in CASCADE con il progetto.
/// </summary>
public sealed class TimesheetVoce
{
    public long Id { get; set; }

    /// <summary>Progetto di appartenenza (ON DELETE CASCADE).</summary>
    public long ProgettoId { get; set; }

    /// <summary>Nome del progetto risolto via JOIN (non mappato su una colonna di timesheet_voci).</summary>
    public string ProgettoNome { get; set; } = "";

    public string Data { get; set; } = "";

    /// <summary>Ore lavorate. Il DB impone CHECK(ore &gt; 0).</summary>
    public decimal Ore { get; set; }

    public string Descrizione { get; set; } = "";
    public string Utente { get; set; } = "";

    /// <summary>True se la voce è già confluita in una fattura (fatturata=1).</summary>
    public bool Fatturata { get; set; }

    /// <summary>Fattura collegata se la voce è stata fatturata (ON DELETE SET NULL).</summary>
    public long? FatturaId { get; set; }

    public string CreatedAt { get; set; } = "";
}
