using System;
using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica principale: un cliente (tabella <c>clienti</c>). Le colonne SQLite
/// sono snake_case e vengono mappate qui in PascalCase tramite alias espliciti
/// nelle query del repository. I flag INTEGER 0/1 diventano bool, le FK
/// opzionali sono <see cref="long"/>? (NULL → null). Porta la logica del backend
/// Rust (routes/clienti.rs): default tipoSoggetto=PRIVATO, gemello fornitore,
/// insight commerciali (fatturato anno, ultimo acquisto, insoluti).
/// </summary>
public sealed class Cliente
{
    public long Id { get; set; }

    // ── Identità ─────────────────────────────────────────────────────────────
    public string RagioneSociale { get; set; } = "";
    public string Email { get; set; } = "";
    public string Telefono { get; set; } = "";
    public string Cellulare { get; set; } = "";

    // ── Sede legale ──────────────────────────────────────────────────────────
    public string Via { get; set; } = "";
    public string Cap { get; set; } = "";
    public string Citta { get; set; } = "";
    public string Provincia { get; set; } = "";
    /// <summary>Default 'Italia' in DB.</summary>
    public string Stato { get; set; } = "Italia";

    // ── Dati fiscali ─────────────────────────────────────────────────────────
    public string CodiceFiscale { get; set; } = "";
    public string PIva { get; set; } = "";
    public string Sdi { get; set; } = "";
    public string Pec { get; set; } = "";

    /// <summary>PRIVATO | PA | PROFESSIONISTA. Default 'PRIVATO'.</summary>
    public string TipoSoggetto { get; set; } = "PRIVATO";
    /// <summary>Codice Identificativo Gara (solo PA).</summary>
    public string Cig { get; set; } = "";
    /// <summary>Codice Unico Progetto (solo PA).</summary>
    public string Cup { get; set; } = "";

    // ── Preferenze commerciali (FK opzionali) ────────────────────────────────
    public long? TipoPagamentoId { get; set; }
    public long? ListinoId { get; set; }
    public long? AliquotaIvaId { get; set; }

    // ── Gemello fornitore ────────────────────────────────────────────────────
    /// <summary>Se true esiste un'anagrafica fornitore gemella sincronizzata.</summary>
    public bool AncheFornitore { get; set; }
    /// <summary>Id del fornitore collegato (gestito dal repository).</summary>
    public long? FornitoreCollegatoId { get; set; }
    /// <summary>Estero: INTEGER 0/1 → bool.</summary>
    public bool Estero { get; set; }

    // ── Insight commerciali (derivati, non scritti dal DB) ───────────────────

    /// <summary>Data dell'ultima fattura (ISO yyyy-MM-dd) o null se mai fatturato.</summary>
    public string? UltimoAcquisto { get; set; }
    /// <summary>Fatturato lordo dell'anno in corso (somma righe IVA inclusa).</summary>
    public decimal FatturatoAnno { get; set; }
    /// <summary>Numero di fatture scadute non pagate.</summary>
    public int FattureInsolute { get; set; }

    // ── Indirizzi aggiuntivi (destinazioni di consegna) ──────────────────────
    /// <summary>Destinazioni salvate, caricate nel dettaglio (GetById).</summary>
    public List<ClienteIndirizzo> Indirizzi { get; set; } = new();

    // ── Derivati per la UI ───────────────────────────────────────────────────

    /// <summary>Indirizzo compatto su una riga (parità con indirizzo() dell'Angular).</summary>
    public string IndirizzoCompatto =>
        string.Join(", ", new[] { Via, Cap, Citta, Provincia, Stato }
            .Where(s => !string.IsNullOrWhiteSpace(s)));

    /// <summary>
    /// Giorni dall'ultimo acquisto, o null se mai fatturato. Replica
    /// giorniDormienza() dell'Angular.
    /// </summary>
    public int? GiorniDormienza
    {
        get
        {
            if (string.IsNullOrWhiteSpace(UltimoAcquisto)) return null;
            if (!DateTime.TryParse(UltimoAcquisto, out var d)) return null;
            return (int)Math.Floor((DateTime.Now - d).TotalDays);
        }
    }

    /// <summary>Dormiente: mai fatturato o &gt; 90 giorni (parità col filtro Angular).</summary>
    public bool IsDormiente
    {
        get { var g = GiorniDormienza; return g is null || g > 90; }
    }

    public bool HasInsoluti => FattureInsolute > 0;
}
