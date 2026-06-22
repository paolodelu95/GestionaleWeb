using System.Collections.Generic;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Configurazione di un collegamento e-commerce (tabella <c>ecommerce_config</c>).
/// Un provider WooCommerce/Shopify con base URL e credenziali API.
/// Porta routes/ecommerce.rs: i flag INTEGER 0/1 → bool; le credenziali sono
/// mascherate (vedi <see cref="EcommerceRepository"/>) quando arrivano al VM.
/// </summary>
public sealed class EcommerceConfig
{
    public long Id { get; set; }

    /// <summary>WOOCOMMERCE oppure SHOPIFY (CHECK in DB).</summary>
    public string Provider { get; set; } = EcommerceProvider.WooCommerce;

    public string Nome { get; set; } = "";

    /// <summary>URL base del sito (colonna base_url).</summary>
    public string BaseUrl { get; set; } = "";

    /// <summary>
    /// Chiave API. In lettura il repository la maschera come "***" se presente
    /// (parità con list() del backend): non esponiamo mai il segreto reale.
    /// </summary>
    public string ApiKey { get; set; } = "";

    /// <summary>Segreto API. Mascherato come "***" in lettura se presente.</summary>
    public string ApiSecret { get; set; } = "";

    public bool Attivo { get; set; } = true;

    /// <summary>Ultima sincronizzazione (TEXT ISO), null se mai eseguita.</summary>
    public string? LastSync { get; set; }

    public string? CreatedAt { get; set; }

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>true se sono configurate delle credenziali (mascherate o reali).</summary>
    public bool HaCredenziali => !string.IsNullOrEmpty(ApiSecret);

    /// <summary>Etichetta leggibile del provider per la colonna/badge.</summary>
    public string ProviderLabel => Provider == EcommerceProvider.Shopify ? "Shopify" : "WooCommerce";
}

/// <summary>Valori ammessi per la colonna provider (CHECK del DB).</summary>
public static class EcommerceProvider
{
    public const string WooCommerce = "WOOCOMMERCE";
    public const string Shopify = "SHOPIFY";

    public static readonly IReadOnlyList<string> Tutti = new[] { WooCommerce, Shopify };
}
