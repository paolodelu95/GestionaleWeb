namespace Ordeva.Desktop.Models;

/// <summary>
/// Stage della pipeline CRM (tabella <c>crm_stage</c>). I flag <c>vinto</c>/<c>perso</c>
/// sono INTEGER 0/1 in DB e diventano bool. Il colore è una stringa esadecimale
/// (default #6366f1, applicato dal backend quando vuoto).
/// </summary>
public sealed class CrmStage
{
    public long Id { get; set; }
    public string Nome { get; set; } = "";
    public long Ordine { get; set; }
    public string Colore { get; set; } = "#6366f1";
    public bool Vinto { get; set; }
    public bool Perso { get; set; }
}
