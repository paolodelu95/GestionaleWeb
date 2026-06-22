namespace Ordeva.Desktop.Models;

/// <summary>
/// Appuntamento dell'agenda (tabella <c>appuntamenti</c>). Le colonne SQLite
/// sono snake_case: le query del repository usano alias espliciti verso queste
/// proprietà PascalCase. I flag INTEGER 0/1 (<c>tutto_giorno</c>,
/// <c>condiviso</c>) diventano bool; le date TEXT ISO restano string;
/// <c>promemoria_min</c> è NULL-abile → <see cref="int"/>?.
///
/// Porta i campi del DTO del backend Rust (routes/agenda.rs, app_dto): include
/// i nomi di cliente/fornitore risolti via JOIN (sola lettura, non mappati in
/// scrittura).
/// </summary>
public sealed class Appuntamento
{
    public long Id { get; set; }
    public string Titolo { get; set; } = "";
    public string Descrizione { get; set; } = "";

    /// <summary>Inizio ISO "YYYY-MM-DDTHH:MM:SS" (o solo data se tutto_giorno).</summary>
    public string Inizio { get; set; } = "";
    /// <summary>Fine ISO. NULL in DB → null (non stringa vuota).</summary>
    public string? Fine { get; set; }

    public bool TuttoGiorno { get; set; }
    public string Luogo { get; set; } = "";

    public long? ClienteId { get; set; }
    public long? FornitoreId { get; set; }

    /// <summary>Colore esadecimale dell'evento (default #3b82f6 lato DB).</summary>
    public string Colore { get; set; } = "#3b82f6";
    /// <summary>Minuti di anticipo del promemoria; NULL = nessun promemoria.</summary>
    public int? Promemoria { get; set; }

    /// <summary>Stato: PIANIFICATO / COMPLETATO / ANNULLATO (CHECK in DB).</summary>
    public string Stato { get; set; } = "PIANIFICATO";

    public long? UserId { get; set; }
    public bool Condiviso { get; set; }
    public string? CreatedAt { get; set; }

    // ── Risolti via JOIN (sola lettura, non scritti) ─────────────────────────

    /// <summary>Ragione sociale del cliente collegato (LEFT JOIN clienti).</summary>
    public string ClienteNome { get; set; } = "";
    /// <summary>Ragione sociale del fornitore collegato (LEFT JOIN fornitori).</summary>
    public string FornitoreNome { get; set; } = "";

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>
    /// Controparte mostrata in lista: nome cliente se presente, altrimenti
    /// fornitore, altrimenti "—" (parità con il template Angular
    /// <c>a.clienteNome || a.fornitoreNome || '—'</c>).
    /// </summary>
    public string Controparte
    {
        get
        {
            if (ClienteNome.Length > 0) return ClienteNome;
            if (FornitoreNome.Length > 0) return FornitoreNome;
            return "—";
        }
    }
}
