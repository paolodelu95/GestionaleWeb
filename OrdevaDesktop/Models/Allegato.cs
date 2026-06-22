namespace Ordeva.Desktop.Models;

/// <summary>
/// Allegato a un documento (tabella <c>allegati</c>). Il file fisico vive sul
/// disco in uploads/&lt;tenant&gt; col nome univoco salvato in <see cref="Percorso"/>;
/// qui si tiene solo il record. <see cref="DocumentoTipo"/>/<see cref="DocumentoId"/>
/// agganciano l'allegato a fatture/ddt/acquisti/ecc. (parità con routes/allegati.rs).
/// </summary>
public sealed class Allegato
{
    /// <summary>Chiave primaria (id). 0 finché non inserito.</summary>
    public long Id { get; set; }

    /// <summary>Tipo del documento a cui è agganciato (es. "fattura", "ddt"). NOT NULL.</summary>
    public string DocumentoTipo { get; set; } = "";

    /// <summary>Id del documento a cui è agganciato. NOT NULL.</summary>
    public long DocumentoId { get; set; }

    /// <summary>Nome originale del file caricato (mostrato all'utente). NOT NULL.</summary>
    public string NomeFile { get; set; } = "";

    /// <summary>Nome univoco con cui il file è salvato su disco (in uploads/). NOT NULL.</summary>
    public string Percorso { get; set; } = "";

    /// <summary>Dimensione del file in byte (default 0).</summary>
    public long Dimensione { get; set; }

    /// <summary>MIME type del file (default ""). Es. "application/pdf".</summary>
    public string MimeType { get; set; } = "";

    /// <summary>Data/ora di creazione in TEXT ISO (default datetime('now')). null se non valorizzata.</summary>
    public string? CreatedAt { get; set; }
}
