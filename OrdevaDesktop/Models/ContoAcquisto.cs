namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica di servizio: un "conto di acquisto", ossia la categoria contabile
/// su cui imputare un documento di acquisto (es. "Merci c/acquisti",
/// "Servizi", "Materiale di consumo"). I documenti di acquisto vi si collegano
/// tramite la colonna acquisti.conto_acquisto_id.
/// Tabella SQLite: conti_acquisto.
/// </summary>
public sealed class ContoAcquisto
{
    /// <summary>Chiave primaria (id). Null finché non è stato inserito.</summary>
    public int? Id { get; set; }

    /// <summary>Nome visualizzato del conto (es. "Merci c/acquisti"). Obbligatorio.</summary>
    public string Nome { get; set; } = string.Empty;

    /// <summary>
    /// Tag libero che indica per quale tipologia di acquisto questo conto è il
    /// predefinito (campo predefinito_per, opzionale, stringa vuota se assente).
    /// </summary>
    public string PredefinitoPer { get; set; } = string.Empty;

    /// <summary>Se false il conto non compare nelle scelte dei nuovi documenti.</summary>
    public bool Attivo { get; set; } = true;
}
