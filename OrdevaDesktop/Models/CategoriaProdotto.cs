namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica di servizio: una categoria merceologica dei prodotti.
/// Tabella reale: categorie_prodotto (id, nome UNIQUE, aliquota_iva_id -> aliquote_iva.id).
/// </summary>
public sealed class CategoriaProdotto
{
    /// <summary>Chiave primaria (NULL su una categoria non ancora salvata).</summary>
    public long? Id { get; set; }

    /// <summary>Nome univoco della categoria (NOT NULL UNIQUE). Es. "Materiali", "Servizi".</summary>
    public string Nome { get; set; } = string.Empty;

    /// <summary>
    /// IVA predefinita applicata ai nuovi prodotti della categoria.
    /// NULL = nessuna (il prodotto userà la propria IVA).
    /// </summary>
    public long? AliquotaIvaId { get; set; }

    /// <summary>
    /// Etichetta dell'aliquota collegata, valorizzata via JOIN in lettura
    /// (es. "22% — IVA ordinaria"). Non è una colonna del DB.
    /// </summary>
    public string? AliquotaIvaLabel { get; set; }
}
