using System.Collections.Generic;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Anagrafica prodotto (tabella <c>prodotti</c>). Le colonne SQLite sono
/// snake_case: le query del repository usano alias espliciti verso queste
/// proprietà PascalCase. I prezzi REAL diventano <see cref="decimal"/>, i flag
/// INTEGER 0/1 diventano bool.
/// </summary>
public sealed class Prodotto
{
    public long Id { get; set; }
    public string Nome { get; set; } = "";
    public string Categoria { get; set; } = "";
    public string Descrizione { get; set; } = "";

    public decimal Prezzo { get; set; }
    /// <summary>Prezzo di acquisto. NULL in DB → null (non è 0).</summary>
    public decimal? PrezzoAcquisto { get; set; }

    /// <summary>Quantità: in DB è INTEGER sul prodotto ma REAL sulle varianti; usiamo decimal per le frazioni.</summary>
    public decimal Quantita { get; set; }
    public decimal SogliaMinima { get; set; }

    public string UnitaMisura { get; set; } = "pz";
    public string Codice { get; set; } = "";
    public string CodiceFornitore { get; set; } = "";
    public decimal Iva { get; set; } = 22m;
    public string Barcode { get; set; } = "";

    public bool HaVarianti { get; set; }
    public long? FornitoreIdPreferito { get; set; }
    public decimal RiordinoQuantita { get; set; }

    public decimal? Peso { get; set; }
    public string Dimensioni { get; set; } = "";

    /// <summary>Varianti taglia/colore, caricate solo se <see cref="HaVarianti"/>.</summary>
    public List<ProdottoVariante> Varianti { get; set; } = new();
    /// <summary>Fornitori associati con codice/prezzo, caricati nel dettaglio.</summary>
    public List<ProdottoFornitore> Fornitori { get; set; } = new();

    // ── Derivati per la UI (non mappati dal DB) ──────────────────────────────

    /// <summary>
    /// Margine percentuale = (prezzo - acquisto) / prezzo * 100, arrotondato a 1
    /// decimale. null se manca prezzo o prezzo d'acquisto (parità con marginePerc()).
    /// </summary>
    public decimal? MarginePerc
    {
        get
        {
            var v = Prezzo;
            var a = PrezzoAcquisto ?? 0m;
            if (v == 0m || a == 0m) return null;
            return decimal.Round((v - a) / v * 100m, 1);
        }
    }

    /// <summary>
    /// Sotto soglia SOLO se è configurata una soglia (&gt; 0) e la quantità è
    /// inferiore. Senza soglia niente avviso, nemmeno a 0 (parità con isSottoSoglia()).
    /// </summary>
    public bool IsSottoSoglia => SogliaMinima > 0m && Quantita < SogliaMinima;

    /// <summary>Etichetta compatta delle varianti per il tooltip/colonna (taglia/colore: qta).</summary>
    public string RiepilogoVarianti
    {
        get
        {
            if (!HaVarianti || Varianti.Count == 0) return "";
            var parti = new List<string>(Varianti.Count);
            foreach (var v in Varianti)
            {
                var et = v.Taglia.Length > 0 && v.Colore.Length > 0
                    ? $"{v.Taglia}/{v.Colore}"
                    : (v.Taglia.Length > 0 ? v.Taglia : (v.Colore.Length > 0 ? v.Colore : $"#{v.Id}"));
                parti.Add($"{et}: {v.Quantita}");
            }
            return string.Join("  •  ", parti);
        }
    }
}
