using System;
using System.Collections.Generic;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Template di fattura ricorrente / pianificata (tabella <c>fatture_ricorrenti</c>).
/// Le colonne SQLite sono snake_case: il repository usa alias espliciti verso queste
/// proprietà PascalCase. Il flag INTEGER 0/1 <c>attiva</c> diventa bool; le date
/// TEXT ISO (<c>prossima_emissione</c>, <c>created_at</c>) restano string; le righe,
/// memorizzate come array JSON nella colonna <c>righe</c>, sono deserializzate dal
/// repository nella lista <see cref="Righe"/> (parità con to_dto del backend Rust).
/// </summary>
public sealed class FatturaRicorrente
{
    public long Id { get; set; }

    /// <summary>Cliente destinatario. NOT NULL in DB ma lo teniamo nullable per i nuovi record.</summary>
    public long? ClienteId { get; set; }

    /// <summary>Ragione sociale del cliente, risolta via JOIN (non mappata su una colonna della tabella).</summary>
    public string ClienteNome { get; set; } = "";

    public string Descrizione { get; set; } = "";

    /// <summary>MENSILE | BIMESTRALE | TRIMESTRALE | SEMESTRALE | ANNUALE (vincolo CHECK in DB).</summary>
    public string Frequenza { get; set; } = "MENSILE";

    /// <summary>Giorno del mese di emissione, 1..28 (default 1).</summary>
    public int GiornoEmissione { get; set; } = 1;

    /// <summary>Prima/prossima data di emissione (TEXT ISO yyyy-MM-dd).</summary>
    public string ProssimaEmissione { get; set; } = "";

    /// <summary>Se attiva, lo scheduler genera la fattura automaticamente.</summary>
    public bool Attiva { get; set; } = true;

    /// <summary>Tipo di pagamento opzionale applicato alla fattura emessa.</summary>
    public long? TipoPagamentoId { get; set; }

    public string Note { get; set; } = "";

    /// <summary>Data di creazione (TEXT ISO), valorizzata dal DB.</summary>
    public string? CreatedAt { get; set; }

    /// <summary>
    /// Righe del template, deserializzate dalla colonna JSON <c>righe</c> dal
    /// repository (mai mappate direttamente da Dapper).
    /// </summary>
    public List<FatturaRicorrenteRiga> Righe { get; set; } = new();

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>Etichetta leggibile della frequenza (parità con frequenzaLabel() del componente Angular).</summary>
    public string FrequenzaLabel => Frequenza switch
    {
        "MENSILE" => "Mensile",
        "BIMESTRALE" => "Bimestrale",
        "TRIMESTRALE" => "Trimestrale",
        "SEMESTRALE" => "Semestrale",
        "ANNUALE" => "Annuale",
        _ => Frequenza,
    };

    /// <summary>
    /// True se la prossima emissione è già passata rispetto a oggi (parità con
    /// isScaduta(): confronto lessicografico su date ISO yyyy-MM-dd). Usa la data
    /// UTC come l'originale Angular (today = new Date().toISOString().substring(0,10)),
    /// così il confronto coincide bit-per-bit anche a cavallo della mezzanotte.
    /// </summary>
    public bool IsScaduta =>
        !string.IsNullOrEmpty(ProssimaEmissione)
        && string.CompareOrdinal(ProssimaEmissione, DateTime.UtcNow.ToString("yyyy-MM-dd")) < 0;

    /// <summary>Imponibile complessivo del template (somma delle righe).</summary>
    public decimal Imponibile
    {
        get
        {
            var s = 0m;
            foreach (var r in Righe) s += r.Imponibile;
            return s;
        }
    }

    /// <summary>Totale ivato complessivo del template (somma delle righe).</summary>
    public decimal Totale
    {
        get
        {
            var s = 0m;
            foreach (var r in Righe) s += r.Totale;
            return s;
        }
    }
}
