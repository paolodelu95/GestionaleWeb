namespace Ordeva.Desktop.Models;

/// <summary>
/// Riga della tabella ponte fattura↔DDT (tabella <c>fatture_ddt</c>): collega una
/// fattura ai DDT che fattura (fatturazione differita). Chiave primaria composta
/// (fattura_id, ddt_id); nessun id autoincrementale. Parità con save_ddt_links()/
/// get_ddt_ids() in routes/fatture.rs.
/// </summary>
public sealed class FatturaDdt
{
    /// <summary>Id della fattura. Parte della PK. FK con ON DELETE CASCADE. NOT NULL.</summary>
    public long FatturaId { get; set; }

    /// <summary>Id del DDT collegato. Parte della PK. FK su ddt(id). NOT NULL.</summary>
    public long DdtId { get; set; }
}
