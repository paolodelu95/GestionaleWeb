namespace Ordeva.Desktop.Models;

/// <summary>
/// Una registrazione di prima nota: un movimento di cassa o banca, in entrata o
/// uscita, con una causale e un importo. Tabella SQLite: prima_nota.
/// Le righe possono opzionalmente riferirsi a un documento d'origine
/// (riferimento_tipo / riferimento_id), p.es. una fattura incassata.
/// </summary>
public sealed class PrimaNota
{
    /// <summary>Chiave primaria (id). Null finché non è stata inserita.</summary>
    public int? Id { get; set; }

    /// <summary>Data del movimento, in formato ISO "yyyy-MM-dd". Obbligatoria.</summary>
    public string Data { get; set; } = string.Empty;

    /// <summary>Tipo del movimento: "ENTRATA" oppure "USCITA". Obbligatorio.</summary>
    public string Tipo { get; set; } = "ENTRATA";

    /// <summary>Causale descrittiva (es. "Incasso fattura"). Obbligatoria.</summary>
    public string Causale { get; set; } = string.Empty;

    /// <summary>Importo del movimento, sempre positivo (CHECK importo &gt; 0).</summary>
    public decimal Importo { get; set; }

    /// <summary>Conto su cui transita il movimento: "CASSA" oppure "BANCA".</summary>
    public string Conto { get; set; } = "CASSA";

    /// <summary>Tipo del documento di riferimento (es. "fattura"), opzionale.</summary>
    public string RiferimentoTipo { get; set; } = string.Empty;

    /// <summary>Id del documento di riferimento, opzionale.</summary>
    public int? RiferimentoId { get; set; }

    /// <summary>Annotazioni libere, opzionali.</summary>
    public string Note { get; set; } = string.Empty;

    /// <summary>Timestamp di creazione (ISO), valorizzato dal DB.</summary>
    public string? CreatedAt { get; set; }

    /// <summary>Etichetta leggibile del tipo per la griglia ("Entrata"/"Uscita").</summary>
    public string TipoLabel => Tipo == "USCITA" ? "Uscita" : "Entrata";

    /// <summary>True se il movimento è un'entrata (per evidenziazione UI).</summary>
    public bool IsEntrata => Tipo == "ENTRATA";

    /// <summary>
    /// Importo con segno per il riepilogo: positivo per le entrate, negativo
    /// per le uscite. Comodo per ordinamenti/colore in UI.
    /// </summary>
    public decimal ImportoConSegno => IsEntrata ? Importo : -Importo;
}
