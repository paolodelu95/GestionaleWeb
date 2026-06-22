namespace Ordeva.Desktop.Models;

/// <summary>
/// Aliquota IVA — anagrafica di servizio. Corrisponde alla tabella SQLite
/// <c>aliquote_iva</c>. Le colonne snake_case del DB sono mappate qui in
/// PascalCase tramite alias espliciti nelle query del repository.
/// </summary>
public sealed class AliquotaIva
{
    /// <summary>Chiave primaria (id INTEGER PRIMARY KEY AUTOINCREMENT).</summary>
    public long Id { get; set; }

    /// <summary>Nome descrittivo (es. "Ordinaria", "Agevolata"). NOT NULL.</summary>
    public string Nome { get; set; } = string.Empty;

    /// <summary>Valore percentuale dell'aliquota (REAL -&gt; decimal). NOT NULL.</summary>
    public decimal Valore { get; set; }

    /// <summary>Codice fiscale/contabile opzionale.</summary>
    public string Codice { get; set; } = string.Empty;

    /// <summary>Categoria fiscale (Imponibile, Split payment, N1, N2.1, …).</summary>
    public string Categoria { get; set; } = string.Empty;

    /// <summary>Descrizione estesa.</summary>
    public string Descrizione { get; set; } = string.Empty;

    /// <summary>Natura IVA per esenzioni/esclusioni (NULLABLE nel DB).</summary>
    public string? Natura { get; set; }

    /// <summary>Note libere.</summary>
    public string Note { get; set; } = string.Empty;

    /// <summary>Aliquota predefinita (INTEGER 0/1 -&gt; bool).</summary>
    public bool Predefinito { get; set; }

    /// <summary>Aliquota attiva/utilizzabile (INTEGER 0/1 -&gt; bool).</summary>
    public bool Attiva { get; set; } = true;
}
