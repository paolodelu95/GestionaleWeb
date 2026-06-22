namespace Ordeva.Desktop.Models;

/// <summary>
/// Attività / cosa da fare (tabella <c>todo</c>). Porta i campi del backend Rust
/// (routes/agenda.rs, sezione Todo). Le colonne SQLite sono snake_case: il
/// repository usa alias verso queste proprietà PascalCase. Date TEXT ISO restano
/// stringhe; non ci sono importi né flag INTEGER su questa tabella.
///
/// La tabella ha colonne <c>user_id</c> e <c>created_at</c> in DB ma niente tabelle
/// figlie: una todo è un'entità piatta.
/// </summary>
public sealed class Todo
{
    public long Id { get; set; }

    public string Titolo { get; set; } = "";
    public string Descrizione { get; set; } = "";

    /// <summary>Scadenza TEXT ISO ("yyyy-MM-ddTHH:mm[:ss]"); NULL → null (nessuna scadenza).</summary>
    public string? Scadenza { get; set; }

    /// <summary>Priorità: BASSA | MEDIA | ALTA (default MEDIA, vincolo CHECK in DB).</summary>
    public string Priorita { get; set; } = "MEDIA";

    /// <summary>Stato: DA_FARE | IN_CORSO | FATTA (default DA_FARE, vincolo CHECK in DB).</summary>
    public string Stato { get; set; } = "DA_FARE";

    public string Categoria { get; set; } = "";

    /// <summary>Istante di completamento ISO con ms; valorizzato/azzerato dal repository sul cambio stato.</summary>
    public string? CompletataAt { get; set; }

    public long? UserId { get; set; }

    public string? CreatedAt { get; set; }

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>True quando la todo è completata: usato per checkbox/stile barrato.</summary>
    public bool IsFatta => Stato == "FATTA";

    /// <summary>Etichetta leggibile dello stato per la colonna/badge.</summary>
    public string StatoLabel => Stato switch
    {
        "DA_FARE" => "Da fare",
        "IN_CORSO" => "In corso",
        "FATTA" => "Completata",
        _ => Stato,
    };

    /// <summary>Etichetta leggibile della priorità.</summary>
    public string PrioritaLabel => Priorita switch
    {
        "BASSA" => "Bassa",
        "MEDIA" => "Media",
        "ALTA" => "Alta",
        _ => Priorita,
    };
}
