namespace Ordeva.Desktop.Models;

/// <summary>
/// Riferimento di una fattura ad altri documenti (tabella <c>fatture_riferimenti</c>):
/// ordini di acquisto, contratti, CIG/CUP/commessa per la fatturazione PA/B2B.
/// Una fattura può averne più d'uno; <see cref="Ordine"/> ne fissa la sequenza.
/// Parità con save_riferimenti()/get_riferimenti() in routes/fatture.rs.
/// </summary>
public sealed class FatturaRiferimento
{
    /// <summary>Chiave primaria (id). 0 finché non inserito.</summary>
    public long Id { get; set; }

    /// <summary>Id della fattura proprietaria. FK con ON DELETE CASCADE. NOT NULL.</summary>
    public long FatturaId { get; set; }

    /// <summary>Tipo di riferimento (es. "ORDINE_ACQUISTO", "CONTRATTO", "DDT"). NOT NULL.</summary>
    public string Tipo { get; set; } = "";

    /// <summary>Numero del documento riferito (default "").</summary>
    public string Numero { get; set; } = "";

    /// <summary>Data del documento riferito, TEXT ISO (default "").</summary>
    public string Data { get; set; } = "";

    /// <summary>Codice CIG (gare/appalti PA) (default "").</summary>
    public string Cig { get; set; } = "";

    /// <summary>Codice CUP (progetti PA) (default "").</summary>
    public string Cup { get; set; } = "";

    /// <summary>Commessa/convenzione di riferimento (default "").</summary>
    public string Commessa { get; set; } = "";

    /// <summary>Ordine di visualizzazione all'interno della fattura (default 0).</summary>
    public int Ordine { get; set; }
}
