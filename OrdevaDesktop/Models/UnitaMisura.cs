namespace Ordeva.Desktop.Models;

/// <summary>
/// Unità di misura (anagrafica di servizio). Tabella SQLite: unita_misura.
/// Colonne reali: id INTEGER PK, nome TEXT NOT NULL, simbolo TEXT DEFAULT ''.
/// </summary>
public sealed class UnitaMisura
{
    /// <summary>Chiave primaria. Null per i record non ancora salvati.</summary>
    public long? Id { get; set; }

    /// <summary>Nome esteso (es. "Pezzi", "Chilogrammi"). Obbligatorio.</summary>
    public string Nome { get; set; } = string.Empty;

    /// <summary>Simbolo breve (es. "pz", "kg"). Se vuoto ricade sul nome.</summary>
    public string Simbolo { get; set; } = string.Empty;
}
