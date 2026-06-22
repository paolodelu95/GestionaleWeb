namespace Ordeva.Desktop.Models;

/// <summary>
/// Voce dello storico solleciti di pagamento (tabella <c>solleciti</c>). È un
/// registro di sola lettura: ogni riga è un sollecito già inviato dal backend
/// (routes/email.rs lo INSERisce dopo l'invio SMTP; non esiste create/update/delete
/// utente). <see cref="DocumentoTipo"/> vale "FATTURA" o "ACQUISTO" (il backend lo
/// salva sempre in maiuscolo), <see cref="DocumentoId"/> punta a fatture/acquisti.
///
/// I campi DocumentoNumero/Controparte non sono colonne della tabella: vengono
/// risolti via JOIN nel repository per mostrare a colpo d'occhio a quale documento
/// si riferisce il sollecito (niente N+1).
/// </summary>
public sealed class Sollecito
{
    public long Id { get; set; }

    /// <summary>"FATTURA" o "ACQUISTO" (sempre maiuscolo, come lo salva il backend).</summary>
    public string DocumentoTipo { get; set; } = "";

    /// <summary>Id del documento sollecitato (fattura o acquisto).</summary>
    public long DocumentoId { get; set; }

    /// <summary>Email a cui è stato inviato il sollecito.</summary>
    public string EmailDestinatario { get; set; } = "";

    /// <summary>Data invio in formato TEXT ISO (yyyy-MM-dd).</summary>
    public string DataInvio { get; set; } = "";

    /// <summary>Esito invio: "INVIATO" di default; altri valori per errori.</summary>
    public string Esito { get; set; } = "INVIATO";

    // ── Derivati da JOIN (non mappati sulla tabella solleciti) ──────────────────

    /// <summary>Numero del documento sollecitato (da fatture/acquisti). null se eliminato.</summary>
    public string? DocumentoNumero { get; set; }

    /// <summary>Ragione sociale del cliente (FATTURA) o fornitore (ACQUISTO). null se non risolto.</summary>
    public string? Controparte { get; set; }

    // ── Etichette per la UI ─────────────────────────────────────────────────────

    /// <summary>Tipo documento leggibile: "Fattura"/"Acquisto".</summary>
    public string DocumentoTipoLabel => DocumentoTipo switch
    {
        "FATTURA" => "Fattura",
        "ACQUISTO" => "Acquisto",
        _ => DocumentoTipo,
    };

    /// <summary>Riferimento compatto al documento: "Fattura n. 123" o "Fattura #45" se manca il numero.</summary>
    public string DocumentoRiferimento =>
        string.IsNullOrEmpty(DocumentoNumero)
            ? $"{DocumentoTipoLabel} #{DocumentoId}"
            : $"{DocumentoTipoLabel} n. {DocumentoNumero}";
}
