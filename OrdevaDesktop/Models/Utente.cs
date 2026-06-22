namespace Ordeva.Desktop.Models;

/// <summary>
/// Utente dell'applicazione (tabella <c>utenti</c>): gestione multi-utente.
/// Le colonne SQLite sono snake_case; il repository usa alias verso queste
/// proprietà PascalCase. <c>attivo</c> è INTEGER 0/1 → <see cref="bool"/>.
///
/// Nota sicurezza: <c>password_hash</c> NON è mappato qui. L'hash resta nel DB
/// e non transita mai per la UI; la password in chiaro viaggia solo dal form al
/// repository (proprietà <see cref="NuovaPassword"/>, non mappata) che la cifra.
/// </summary>
public sealed class Utente
{
    public long Id { get; set; }
    public string Username { get; set; } = "";
    public string Nome { get; set; } = "";
    public string Email { get; set; } = "";

    /// <summary>Ruolo: SUPERADMIN / ADMIN / OPERATORE (default OPERATORE come da schema).</summary>
    public string Ruolo { get; set; } = "OPERATORE";

    public bool Attivo { get; set; } = true;

    // ── Non mappati dal DB ────────────────────────────────────────────────────

    /// <summary>
    /// Password in chiaro impostata dal form. Stringa vuota = "non cambiare"
    /// (in update) oppure "obbligatoria" (in create). Mai persistita: il
    /// repository la trasforma in hash e la scarta.
    /// </summary>
    public string NuovaPassword { get; set; } = "";

    /// <summary>Etichetta leggibile del ruolo per la UI.</summary>
    public string RuoloLabel => Ruolo switch
    {
        "SUPERADMIN" => "Superadmin",
        "ADMIN" => "Admin",
        "OPERATORE" => "Operatore",
        _ => Ruolo,
    };
}
