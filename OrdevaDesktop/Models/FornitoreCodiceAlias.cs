namespace Ordeva.Desktop.Models;

/// <summary>
/// Alias di codice articolo per fornitore (tabella <c>fornitore_codice_alias</c>):
/// mappa il codice con cui un fornitore identifica un prodotto sul prodotto interno.
/// Usato in import fatture passive / SDI per riconoscere automaticamente l'articolo
/// (routes/prodotti.rs, sdi_passive.rs). Vincolo UNIQUE (fornitore_id, codice_norm).
///
/// <see cref="Codice"/> è il codice così come arriva dal fornitore; <see cref="CodiceNorm"/>
/// è la sua forma normalizzata (trim + lowercase) usata per il lookup.
/// </summary>
public sealed class FornitoreCodiceAlias
{
    /// <summary>Chiave primaria (id). 0 finché non inserito.</summary>
    public long Id { get; set; }

    /// <summary>Id del fornitore. FK con ON DELETE CASCADE. Parte del vincolo UNIQUE. NOT NULL.</summary>
    public long FornitoreId { get; set; }

    /// <summary>Id del prodotto interno a cui l'alias punta. FK con ON DELETE CASCADE. NOT NULL.</summary>
    public long ProdottoId { get; set; }

    /// <summary>Codice articolo originale del fornitore. NOT NULL.</summary>
    public string Codice { get; set; } = "";

    /// <summary>Codice normalizzato (trim + lowercase) per il lookup. Parte del vincolo UNIQUE. NOT NULL.</summary>
    public string CodiceNorm { get; set; } = "";

    /// <summary>Data/ora di creazione, TEXT ISO (default datetime('now')). null se non valorizzata.</summary>
    public string? CreatedAt { get; set; }

    // ── Derivato da JOIN (non mappato sulla tabella) ────────────────────────────

    /// <summary>Ragione sociale del fornitore, risolta via JOIN per la UI. null se non risolta.</summary>
    public string? FornitoreNome { get; set; }
}
