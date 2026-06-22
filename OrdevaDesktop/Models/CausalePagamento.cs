namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica di servizio: una "causale di pagamento" usata in prima nota /
/// scadenzario (es. "Affitto negozio", "Stipendi", "Bolletta Luce").
/// Tabella SQLite: causali_pagamento. Tabella semplice, senza figlie.
/// </summary>
public sealed class CausalePagamento
{
    /// <summary>Chiave primaria (id). Null finché non è stata inserita.</summary>
    public int? Id { get; set; }

    /// <summary>Nome della causale (UNIQUE nel DB). Es. "Affitto negozio".</summary>
    public string Nome { get; set; } = string.Empty;

    /// <summary>Ordine di visualizzazione (default 0). Gestito dal repository.</summary>
    public int Ordine { get; set; }

    /// <summary>
    /// Se false la causale è disattivata. Parità col backend Rust (causali.rs):
    /// attivo è true per NULL e per qualsiasi valore non-zero, false solo per 0.
    /// </summary>
    public bool Attivo { get; set; } = true;
}
