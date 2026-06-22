namespace Ordeva.Desktop.Models;

/// <summary>
/// Attività collegata a un'opportunità (tabella <c>crm_attivita</c>). <c>tipo</c> è
/// vincolato dal CHECK a CHIAMATA/EMAIL/RIUNIONE/TASK/NOTA. <c>completata</c> è
/// INTEGER 0/1 → bool. Le date sono TEXT ISO (possono essere NULL → null).
/// </summary>
public sealed class CrmAttivita
{
    public long Id { get; set; }
    public long? OpportunitaId { get; set; }
    public string Tipo { get; set; } = "TASK";
    public string Titolo { get; set; } = "";
    public string Descrizione { get; set; } = "";
    public string? DataPianificata { get; set; }
    public string? DataCompletamento { get; set; }
    public bool Completata { get; set; }
    public string CreatedAt { get; set; } = "";
}
