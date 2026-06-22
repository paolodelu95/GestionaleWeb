using System.Collections.Generic;
using System.Linq;

namespace Ordeva.Desktop.Models;

/// <summary>
/// Documento fiscale fattura (tabella <c>fatture</c>) con le sue righe e i campi
/// fiscali (ritenuta d'acconto, cassa previdenziale, bollo, stato SDI). Le colonne
/// SQLite sono snake_case: il repository usa alias espliciti verso queste
/// proprietà PascalCase. I flag INTEGER 0/1 (ritenuta_su_cassa, bollo) diventano
/// bool, i REAL diventano decimal.
///
/// I totali fiscali (imponibile, cassa, IVA, ritenuta, bollo, netto a pagare) sono
/// derivati dalle righe e dai parametri fiscali con la STESSA formula del backend
/// Rust (utils fiscale.rs: calcola_totali_fiscali), portata qui in C#.
/// </summary>
public sealed class Fattura
{
    public long Id { get; set; }
    public string Numero { get; set; } = "";

    /// <summary>Data emissione in formato ISO "yyyy-MM-dd" (come salvata dal backend).</summary>
    public string DataEmissione { get; set; } = "";

    public long? ClienteId { get; set; }

    /// <summary>Ragione sociale del cliente, risolta via JOIN (non è una colonna di fatture).</summary>
    public string? ClienteNome { get; set; }

    /// <summary>Primo DDT collegato (colonna ddt_id). I link completi sono in fatture_ddt.</summary>
    public long? DdtId { get; set; }

    public string Note { get; set; } = "";

    /// <summary>Stato: EMESSA | PAGATA | ANNULLATA (default backend = EMESSA).</summary>
    public string Stato { get; set; } = "EMESSA";

    public long? TipoPagamentoId { get; set; }

    // ── Campi fiscali (ritenuta d'acconto) ───────────────────────────────────
    public decimal RitenutaAliquota { get; set; }
    public string RitenutaCausale { get; set; } = "";
    public string RitenutaTipo { get; set; } = "";

    /// <summary>Se la ritenuta è calcolata anche sulla cassa previdenziale.</summary>
    public bool RitenutaSuCassa { get; set; }

    // ── Campi fiscali (cassa previdenziale) ──────────────────────────────────
    public string CassaTipo { get; set; } = "";
    public decimal CassaAliquota { get; set; }

    /// <summary>Aliquota IVA applicata alla cassa previdenziale.</summary>
    public decimal CassaIva { get; set; }

    /// <summary>Se applicare il bollo (2,00 € forfettari, come nel backend).</summary>
    public bool Bollo { get; set; }

    // ── Stato SDI (fattura elettronica) ──────────────────────────────────────
    public string StatoSdi { get; set; } = "";
    public string DataInvioSdi { get; set; } = "";
    public string IdTrasmissioneSdi { get; set; } = "";

    public string Cig { get; set; } = "";
    public string Cup { get; set; } = "";

    /// <summary>Righe del documento, caricate da GetById.</summary>
    public List<FatturaRiga> Righe { get; set; } = new();

    // ── Totali fiscali (porting di calcola_totali_fiscali) ───────────────────
    // Per il dettaglio si usano le righe caricate; per la lista i valori arrivano
    // già aggregati dal repository (ImponibileListato/TotaleListato/NettoListato).

    private static decimal Round2(decimal n) => System.Math.Round(n, 2, System.MidpointRounding.AwayFromZero);

    /// <summary>Imponibile = Σ q·p·(1 - sconto/100) sulle righe non-NOTA.</summary>
    public decimal Imponibile => Round2(Righe.Sum(r => r.Imponibile));

    /// <summary>Cassa previdenziale = imponibile × cassaAliquota/100 (0 se aliquota nulla).</summary>
    public decimal CassaImporto =>
        CassaAliquota != 0m ? Round2(Imponibile * CassaAliquota / 100m) : 0m;

    /// <summary>IVA sulla cassa = cassa × cassaIva/100 (0 se cassa nulla).</summary>
    public decimal IvaCassa =>
        CassaImporto != 0m ? Round2(CassaImporto * CassaIva / 100m) : 0m;

    /// <summary>IVA totale = IVA delle righe + IVA sulla cassa.</summary>
    public decimal Iva => Round2(Righe.Sum(r => r.IvaImporto) + IvaCassa);

    /// <summary>Importo ritenuta = (imponibile [+ cassa se ritenutaSuCassa]) × aliquota/100.</summary>
    public decimal RitenutaImporto
    {
        get
        {
            if (RitenutaAliquota == 0m) return 0m;
            var basis = Imponibile + (RitenutaSuCassa ? CassaImporto : 0m);
            return Round2(basis * RitenutaAliquota / 100m);
        }
    }

    /// <summary>Bollo: 2,00 € forfettari se attivo (come nel backend).</summary>
    public decimal BolloImporto => Bollo ? 2m : 0m;

    /// <summary>Totale documento = imponibile + cassa + IVA + bollo.</summary>
    public decimal Totale => Round2(Imponibile + CassaImporto + Iva + BolloImporto);

    /// <summary>Netto a pagare = totale - ritenuta.</summary>
    public decimal NettoAPagare => Round2(Totale - RitenutaImporto);

    // ── Valori precalcolati dal repository per la lista (evita N+1) ──────────
    public decimal? ImponibileListato { get; set; }
    public decimal? TotaleListato { get; set; }
    public decimal? NettoListato { get; set; }

    /// <summary>Totale da mostrare in lista: usa il precalcolato se presente.</summary>
    public decimal TotaleVisualizzato => TotaleListato ?? Totale;

    /// <summary>Netto a pagare da mostrare in lista: usa il precalcolato se presente.</summary>
    public decimal NettoVisualizzato => NettoListato ?? NettoAPagare;

    /// <summary>Anno dell'emissione (per i filtri). 0 se la data non è valorizzata.</summary>
    public int Anno =>
        DataEmissione.Length >= 4 && int.TryParse(DataEmissione[..4], out var y) ? y : 0;

    /// <summary>Mese dell'emissione 1..12 (per i filtri). 0 se la data non è valida.</summary>
    public int Mese =>
        DataEmissione.Length >= 7 && int.TryParse(DataEmissione.Substring(5, 2), out var m) ? m : 0;
}
