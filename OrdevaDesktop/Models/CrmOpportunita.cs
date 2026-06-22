using System.Collections.Generic;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Opportunità della pipeline CRM (tabella <c>crm_opportunita</c>). <c>valore</c> è
/// REAL → decimal; <c>cliente_id</c>/<c>stage_id</c> sono nullable (ON DELETE SET NULL).
/// <see cref="ClienteNome"/>, <see cref="StageNome"/>, <see cref="StageColore"/> arrivano
/// dalle LEFT JOIN su clienti/crm_stage (non sono colonne della tabella).
/// </summary>
public sealed class CrmOpportunita
{
    public long Id { get; set; }
    public string Titolo { get; set; } = "";

    public long? ClienteId { get; set; }
    /// <summary>Ragione sociale del cliente (LEFT JOIN clienti). Vuota se nessun cliente.</summary>
    public string ClienteNome { get; set; } = "";

    public string Contatto { get; set; } = "";
    public string Email { get; set; } = "";
    public string Telefono { get; set; } = "";

    public long? StageId { get; set; }
    /// <summary>Nome dello stage (LEFT JOIN crm_stage). Vuoto se nessuno stage.</summary>
    public string StageNome { get; set; } = "";
    /// <summary>Colore dello stage (LEFT JOIN crm_stage), default #6366f1 quando vuoto.</summary>
    public string StageColore { get; set; } = "#6366f1";

    public decimal Valore { get; set; }
    public long Probabilita { get; set; } = 50;
    public string DataPrevista { get; set; } = "";
    public string Assegnatario { get; set; } = "";
    public string Note { get; set; } = "";
    public long Ordine { get; set; }

    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";

    /// <summary>Attività collegate, caricate nel dettaglio (CASCADE sulla delete).</summary>
    public List<CrmAttivita> Attivita { get; set; } = new();
}
