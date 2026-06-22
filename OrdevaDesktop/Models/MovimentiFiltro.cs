namespace Ordeva.Desktop.Models;

/// <summary>
/// Criteri di filtro per lo storico movimenti (parità con i query-param del backend
/// /api/movimenti-magazzino). Tutti opzionali: null/vuoto = nessun vincolo.
/// </summary>
public sealed class MovimentiFiltro
{
    public long? ProdottoId { get; set; }
    public long? ClienteId { get; set; }

    /// <summary>CARICO | SCARICO | TRASFERIMENTO (vuoto = tutti).</summary>
    public string? Tipo { get; set; }

    /// <summary>Codice causale (DDT, FATTURA, RETTIFICA, …).</summary>
    public string? Causale { get; set; }

    public int? Anno { get; set; }
    public int? Mese { get; set; }

    /// <summary>Data minima inclusa (yyyy-MM-dd).</summary>
    public string? DataFrom { get; set; }

    /// <summary>Data massima inclusa (yyyy-MM-dd).</summary>
    public string? DataTo { get; set; }
}
