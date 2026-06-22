using System;
using System.Globalization;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Voce del registro attività (tabella <c>audit_log</c>). Sola lettura: il backend
/// la scrive, qui la mostriamo soltanto. Le colonne SQLite sono snake_case e le
/// query del repository usano alias verso queste proprietà PascalCase.
/// <para>
/// Parità con routes/audit.rs: <c>entity_type</c>/<c>action</c> sono TEXT NOT NULL
/// ma il map_row del backend li tratta come opzionali, quindi qui restano stringhe
/// (mai null). <c>payload</c> è TEXT JSON ('' di default); <c>created_at</c> è TEXT
/// ISO (datetime('now'), formato "yyyy-MM-dd HH:mm:ss").
/// </para>
/// </summary>
public sealed class Audit
{
    public long Id { get; set; }

    /// <summary>Tipo entità tracciata (es. "fattura", "cliente", "prodotto").</summary>
    public string EntityType { get; set; } = "";

    /// <summary>Id della riga entità a cui si riferisce la modifica.</summary>
    public long EntityId { get; set; }

    /// <summary>Azione registrata (CREATE / UPDATE / DELETE).</summary>
    public string Action { get; set; } = "";

    /// <summary>Payload JSON grezzo (può essere vuoto). Riassunto da <see cref="PayloadRiassunto"/>.</summary>
    public string Payload { get; set; } = "";

    /// <summary>Data/ora ISO della registrazione (TEXT, UTC come da datetime('now')).</summary>
    public string CreatedAt { get; set; } = "";

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>
    /// Data/ora locale formattata "gg/mm/aa hh:mm" (parità con formatDate() del
    /// componente Angular: il TEXT è UTC, lo convertiamo al fuso locale).
    /// </summary>
    public string QuandoLocale
    {
        get
        {
            if (string.IsNullOrWhiteSpace(CreatedAt)) return "";
            var s = CreatedAt.Replace(' ', 'T');
            if (DateTime.TryParse(s, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var utc))
                return utc.ToLocalTime().ToString("dd/MM/yy HH:mm", CultureInfo.CurrentCulture);
            return CreatedAt;
        }
    }

    /// <summary>Etichetta "#&lt;id&gt;" dell'entità, per la colonna ID (parità con #{{ e.entityId }}).</summary>
    public string EntityIdLabel => $"#{EntityId}";

    /// <summary>
    /// Riepilogo leggibile del payload (parità con summarizePayload()):
    /// estrae numero/stato e le differenze before→after; in mancanza mostra il JSON grezzo.
    /// </summary>
    public string PayloadRiassunto => AuditPayloadFormatter.Summarize(Payload);
}
