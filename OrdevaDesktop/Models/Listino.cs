using System.Collections.Generic;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica listino prezzi (tabella <c>listini</c>). Un listino raggruppa
/// override di prezzo/sconto per prodotto (<see cref="ListinoPrezzo"/>) organizzati
/// in sezioni (<see cref="ListinoSezione"/>). Colonne SQLite snake_case → alias
/// PascalCase nel repository; <c>attivo</c>/<c>stampa_due_colonne</c>/<c>griglia</c>
/// sono INTEGER 0/1 → bool; <c>sconto_default</c> REAL → decimal; i campi *_json
/// (colonne_extra, colonne_standard, colonne_config) sono TEXT JSON tenuti grezzi
/// (la grafica avanzata sarà cablata dall'integrazione).
/// </summary>
public sealed class Listino
{
    public long Id { get; set; }
    public string Nome { get; set; } = "";
    public string Descrizione { get; set; } = "";

    /// <summary>Sconto applicato di default alle righe senza sconto/prezzo proprio (%).</summary>
    public decimal ScontoDefault { get; set; }
    public bool Attivo { get; set; } = true;

    /// <summary>Data creazione (TEXT ISO da datetime('now')).</summary>
    public string CreatedAt { get; set; } = "";

    // ── configurazione grafica (TEXT JSON grezzo, additivo) ───────────────────
    public string ColonneExtra { get; set; } = "[]";
    public string ColonneStandard { get; set; } = "[]";
    public string ColonneConfig { get; set; } = "[]";
    public bool StampaDueColonne { get; set; }
    public bool Griglia { get; set; }
    public string Tema { get; set; } = "";

    /// <summary>Numero di prodotti nel listino (COUNT, popolato dalla lista).</summary>
    public int PrezziCount { get; set; }

    // ── figli, caricati nel dettaglio (niente N+1) ────────────────────────────
    /// <summary>Righe prezzo del listino, ordinate per <c>ordine</c> poi nome prodotto.</summary>
    public List<ListinoPrezzo> Prezzi { get; set; } = new();
    /// <summary>Sezioni (divisori) del listino, ordinate per <c>ordine</c>.</summary>
    public List<ListinoSezione> Sezioni { get; set; } = new();

    // ── derivati UI (non mappati dal DB) ──────────────────────────────────────
    /// <summary>Etichetta stato per la colonna/chip.</summary>
    public string StatoLabel => Attivo ? "Attivo" : "Disattivo";
}
