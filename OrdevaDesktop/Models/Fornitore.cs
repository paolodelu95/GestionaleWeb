namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica principale di un fornitore. Tabella reale: <c>fornitori</c>.
/// Mappa 1:1 le colonne (snake_case → PascalCase). I flag <c>estero</c> e
/// <c>anche_cliente</c> sono INTEGER 0/1 nel DB e bool qui.
/// <para>
/// Un fornitore può essere "anche cliente" (doppio ruolo anagrafica): in tal caso
/// la repository tiene in sync un record gemello nella tabella <c>clienti</c>,
/// memorizzando l'id del gemello in <see cref="ClienteCollegatoId"/>.
/// </para>
/// </summary>
public sealed class Fornitore
{
    /// <summary>Chiave primaria (NULL su un fornitore non ancora salvato).</summary>
    public long? Id { get; set; }

    /// <summary>Ragione sociale (NOT NULL, obbligatoria — trim non vuoto).</summary>
    public string RagioneSociale { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public string Cellulare { get; set; } = string.Empty;

    public string Via { get; set; } = string.Empty;
    public string Cap { get; set; } = string.Empty;
    public string Citta { get; set; } = string.Empty;
    public string Provincia { get; set; } = string.Empty;

    /// <summary>Stato/Paese; default "Italia".</summary>
    public string Stato { get; set; } = "Italia";

    /// <summary>Partita IVA (normalizzata: no spazi, uppercase, senza prefisso "IT").</summary>
    public string PIva { get; set; } = string.Empty;

    /// <summary>Codice destinatario SDI per la fatturazione elettronica.</summary>
    public string Sdi { get; set; } = string.Empty;

    /// <summary>Indirizzo PEC.</summary>
    public string Pec { get; set; } = string.Empty;

    /// <summary>Fornitore estero (cambia la logica IVA/SDI). INTEGER 0/1 nel DB.</summary>
    public bool Estero { get; set; }

    /// <summary>Doppio ruolo: questo fornitore è anche un cliente. INTEGER 0/1.</summary>
    public bool AncheCliente { get; set; }

    /// <summary>Id del record gemello nella tabella clienti (NULL se non collegato).</summary>
    public long? ClienteCollegatoId { get; set; }

    /// <summary>
    /// Città + provincia formattate per la colonna "Città" della griglia
    /// (es. "Milano (MI)"). Non è una colonna del DB.
    /// </summary>
    public string CittaLabel =>
        string.IsNullOrWhiteSpace(Provincia)
            ? (string.IsNullOrWhiteSpace(Citta) ? "—" : Citta)
            : $"{(string.IsNullOrWhiteSpace(Citta) ? "—" : Citta)} ({Provincia})";
}
