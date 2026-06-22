namespace Ordeva.Desktop.Models;

/// <summary>
/// Deposito di magazzino (tabella <c>magazzini</c>). È l'entità "padre" della
/// gestione magazzino: ogni giacenza e ogni movimento appartiene a un deposito.
/// I bool <see cref="Predefinito"/>/<see cref="Attivo"/> sono INTEGER 0/1 sul DB.
/// </summary>
public sealed class Magazzino
{
    public long Id { get; set; }
    public string Codice { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public string Indirizzo { get; set; } = string.Empty;
    public bool Predefinito { get; set; }
    public bool Attivo { get; set; } = true;

    /// <summary>Etichetta mostrata in griglia: nome + eventuale codice.</summary>
    public string NomeLabel =>
        string.IsNullOrWhiteSpace(Codice) ? Nome : $"{Nome} ({Codice})";

    /// <summary>Etichetta dello stato per la griglia (Attivo / Disattivato).</summary>
    public string StatoLabel => Attivo ? "Attivo" : "Disattivato";

    /// <summary>Etichetta del flag predefinito per la griglia ("Sì" / vuoto):
    /// un <c>bool</c> nudo verrebbe reso come "True"/"False".</summary>
    public string PredefinitoLabel => Predefinito ? "Sì" : string.Empty;

    public override string ToString() => NomeLabel;
}
