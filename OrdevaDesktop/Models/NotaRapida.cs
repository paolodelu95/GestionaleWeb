namespace Ordeva.Desktop.Models;

/// <summary>
/// Nota rapida riutilizzabile (tabella <c>note_rapide</c>). Le note rapide
/// appaiono nel menu "Aggiungi nota" di tutti i documenti (DDT, fatture,
/// preventivi, ecc.) per velocizzare la compilazione.
///
/// Porta i campi del backend Rust (routes/note_rapide.rs): è un'entità piatta
/// — niente tabelle figlie, niente importi, niente flag INTEGER. Lo schema
/// SQLite è snake_case; il repository usa alias verso queste proprietà
/// PascalCase.
/// </summary>
public sealed class NotaRapida
{
    public long Id { get; set; }

    /// <summary>Testo della nota (colonna <c>testo</c>, NOT NULL). Obbligatorio.</summary>
    public string Testo { get; set; } = "";

    /// <summary>Ordinamento manuale (colonna <c>ordine</c>, default 0).</summary>
    public long Ordine { get; set; }
}
