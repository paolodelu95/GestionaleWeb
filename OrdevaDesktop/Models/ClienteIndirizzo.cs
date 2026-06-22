using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Indirizzo aggiuntivo (destinazione di consegna) di un cliente. Tabella
/// SQLite <c>clienti_indirizzi</c>, in relazione 1:N con <see cref="Cliente"/>
/// e cancellata in CASCADE. I default DB sono nome='Sede', stato='Italia'.
/// </summary>
public sealed class ClienteIndirizzo
{
    public long Id { get; set; }
    public long ClienteId { get; set; }

    /// <summary>Etichetta (es. "Magazzino", "Sede operativa"). Default 'Sede'.</summary>
    public string Nome { get; set; } = "Sede";
    public string Via { get; set; } = "";
    public string Cap { get; set; } = "";
    public string Citta { get; set; } = "";
    public string Provincia { get; set; } = "";
    public string Stato { get; set; } = "Italia";

    /// <summary>Indirizzo compatto su una riga per la UI.</summary>
    public string IndirizzoCompatto =>
        string.Join(", ", new[] { Via, Cap, Citta, Provincia }
            .Where(s => !string.IsNullOrWhiteSpace(s)));
}
