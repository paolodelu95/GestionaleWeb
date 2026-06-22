using System.Collections.Generic;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Mapping persistente tra un'entità locale e la sua controparte remota su
/// e-commerce (tabella <c>ecommerce_mapping</c>). Evita la duplicazione durante
/// push/pull: per ogni config c'è al più un mapping per (tipo, remote_id).
/// </summary>
public sealed class EcommerceMapping
{
    public long Id { get; set; }

    /// <summary>FK verso ecommerce_config (ON DELETE CASCADE).</summary>
    public long ConfigId { get; set; }

    /// <summary>PRODOTTO, CLIENTE o ORDINE (CHECK in DB).</summary>
    public string Tipo { get; set; } = EcommerceMappingTipo.Prodotto;

    /// <summary>Id dell'oggetto sul sistema remoto (TEXT: può non essere numerico).</summary>
    public string RemoteId { get; set; } = "";

    /// <summary>Id locale nel gestionale (prodotto/cliente/ordine).</summary>
    public long LocalId { get; set; }

    public string? LastSync { get; set; }
}

/// <summary>Valori ammessi per la colonna tipo (CHECK del DB).</summary>
public static class EcommerceMappingTipo
{
    public const string Prodotto = "PRODOTTO";
    public const string Cliente = "CLIENTE";
    public const string Ordine = "ORDINE";

    public static readonly IReadOnlyList<string> Tutti = new[] { Prodotto, Cliente, Ordine };
}
